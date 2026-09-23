import { node } from "../ui/dom";
import {
  nativeDefaultRoute,
  type NativeManifest,
} from "../native-manifest";
import "./native-preview.css";

// Browser-native preview: a persistent sandboxed iframe that renders plain
// `src/pages/*.html` routes and `src/components/*.html` custom elements from
// in-memory source, patched over `postMessage` and never reloaded per edit.
//
// This is a small, self-contained alternative to the Astro preview panel. It
// deliberately supports NO arbitrary page JavaScript: `<script>`, `on*`
// handlers, and `javascript:` URLs are stripped before render. It has no source
// position mapping, so it exposes no visual click-to-source editing — edits flow
// only from the code editor into the preview.
//
// The runtime below is inlined as the frame's `srcdoc` and set exactly once. It
// avoids template literals and `${...}` so it can live inside this module's own
// template string without escaping hazards.
const RUNTIME = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Native preview</title></head>
<body>
<div id="root" data-key="root"><div id="page" data-key="page"></div></div>
<script>
(function(){
  var state = null;
  var defined = {};
  var shadowRoots = new Set();
  var instances = new Set();
  var pageEl = null;
  var renderDepth = 0;
  var MAX_DEPTH = 40;
  var hadError = false;

  function reportError(message){
    hadError = true;
    parent.postMessage({ source: "astro-native-preview", type: "error", message: String(message) }, "*");
  }

  function sanitize(fragment){
    fragment.querySelectorAll("script").forEach(function(el){ el.remove(); });
    fragment.querySelectorAll("meta[http-equiv]").forEach(function(el){
      if((el.getAttribute("http-equiv")||"").toLowerCase()==="refresh") el.remove();
    });
    fragment.querySelectorAll("*").forEach(function(el){
      Array.prototype.slice.call(el.attributes).forEach(function(attr){
        var name = attr.name.toLowerCase();
        var value = (attr.value||"").replace(/\\s+/g,"").toLowerCase();
        if(name.indexOf("on")===0){ el.removeAttribute(attr.name); return; }
        if((name==="href"||name==="src"||name==="xlink:href"||name==="action"||name==="formaction") && value.indexOf("javascript:")===0){
          el.removeAttribute(attr.name);
        }
      });
    });
    return fragment;
  }
  function makeTemplate(html){
    var t = document.createElement("template");
    t.innerHTML = html || "";
    sanitize(t.content);
    return t;
  }
  function nodeKey(n){ return n.nodeType===1 ? n.getAttribute("data-key") : null; }
  function sameKind(a,b){
    if(!a||!b||a.nodeType!==b.nodeType) return false;
    if(a.nodeType===3) return true;
    return a.nodeType===1 && a.tagName===b.tagName;
  }
  function reconcileChildren(target, fragment){
    var desired = Array.prototype.slice.call(fragment.childNodes);
    var keyed = new Map();
    Array.prototype.slice.call(target.childNodes).forEach(function(n){ var k=nodeKey(n); if(k) keyed.set(k,n); });
    desired.forEach(function(next, index){
      var key = nodeKey(next);
      var currentAtIndex = target.childNodes[index] || null;
      var existing = key ? keyed.get(key) : currentAtIndex;
      if(!sameKind(existing, next)){
        target.insertBefore(next, currentAtIndex);
        if(currentAtIndex && !keyed.has(nodeKey(currentAtIndex))) currentAtIndex.remove();
        return;
      }
      reconcileNode(existing, next);
      if(target.childNodes[index]!==existing) target.insertBefore(existing, target.childNodes[index]||null);
    });
    while(target.childNodes.length > desired.length) target.lastChild.remove();
  }
  function reconcileNode(existing, desired){
    if(existing.nodeType===3){ if(existing.textContent!==desired.textContent) existing.textContent=desired.textContent; return; }
    syncAttrs(existing, desired);
    if(existing.tagName==="SCRIPT") return;
    reconcileChildren(existing, desired);
  }
  function syncAttrs(existing, desired){
    Array.prototype.slice.call(existing.attributes).forEach(function(a){ if(!desired.hasAttribute(a.name)) existing.removeAttribute(a.name); });
    Array.prototype.slice.call(desired.attributes).forEach(function(a){ if(existing.getAttribute(a.name)!==a.value) existing.setAttribute(a.name,a.value); });
  }
  function hydrateShadow(host, html){
    // Cyclic or self-referential templates would recurse without bound through
    // connectedCallback; cap the depth and surface it as a visible error.
    if(renderDepth >= MAX_DEPTH){
      reportError("Recursive component templates detected (over " + MAX_DEPTH + " levels); rendering stopped.");
      return;
    }
    renderDepth++;
    try{
      var root = host.shadowRoot || host.attachShadow({mode:"open"});
      shadowRoots.add(root);
      var t = makeTemplate(html);
      var style = t.content.querySelector("style[data-native-css]");
      if(!style){
        style = document.createElement("style");
        style.setAttribute("data-native-css","");
        style.setAttribute("data-key","native-css");
        t.content.insertBefore(style, t.content.firstChild);
      }
      style.textContent = state ? state.css : "";
      reconcileChildren(root, t.content.cloneNode(true));
    } finally {
      renderDepth--;
    }
  }
  function defineTag(tag){
    if(defined[tag]) return;
    defined[tag] = true;
    try{
      customElements.define(tag, class extends HTMLElement{
        connectedCallback(){ instances.add(this); this.render(); }
        disconnectedCallback(){
          instances.delete(this);
          if(this.shadowRoot) shadowRoots.delete(this.shadowRoot);
        }
        render(){ if(!state || state.components[tag]===undefined) return; hydrateShadow(this, state.components[tag]); }
      });
    }catch(e){
      // A name the browser rejects (reserved/duplicate) must not blank silently.
      reportError("Component <" + tag + "> could not be defined: " + (e && e.message ? e.message : e));
    }
  }
  // Re-render every currently-connected instance, including those nested inside
  // other components' shadow roots, so a shared template edit reaches them all.
  function renderInstances(){
    // A Set is not array-like, so slice.call would yield an empty array and skip
    // every instance. Array.from copies the live Set safely before iterating.
    Array.from(instances).forEach(function(el){
      if(el.isConnected && typeof el.render === "function") el.render();
      else if(!el.isConnected) instances.delete(el);
    });
  }
  function renderPage(){
    if(!state || !pageEl) return;
    var html = state.pages[state.route];
    if(html===undefined){ var keys=Object.keys(state.pages); html = keys.length?state.pages[keys[0]]:""; }
    var t = makeTemplate(html);
    reconcileChildren(pageEl, t.content.cloneNode(true));
    renderInstances();
  }
  function syncStyles(){
    if(!state) return;
    var s = document.getElementById("native-doc-css");
    if(!s){ s=document.createElement("style"); s.id="native-doc-css"; document.head.appendChild(s); }
    s.textContent = state.css;
    shadowRoots.forEach(function(root){
      root.querySelectorAll("style[data-native-css]").forEach(function(st){ st.textContent = state.css; });
    });
  }
  function apply(payload){
    hadError = false;
    renderDepth = 0;
    state = { pages: payload.pages||{}, components: payload.components||{}, css: payload.css||"", route: payload.route||"/" };
    Object.keys(state.components).forEach(defineTag);
    syncStyles();
    renderPage();
    if(!hadError) parent.postMessage({ source: "astro-native-preview", type: "clear-error" }, "*");
  }
  document.addEventListener("click", function(e){
    var path = typeof e.composedPath==="function" ? e.composedPath() : [];
    var link = null;
    for(var i=0;i<path.length;i++){ var n=path[i]; if(n instanceof HTMLAnchorElement && n.hasAttribute("href")){ link=n; break; } }
    if(!link && e.target && e.target.closest) link = e.target.closest("a[href]");
    if(!link) return;
    var href = link.getAttribute("href");
    e.preventDefault();
    if(href && href.charAt(0)==="#"){
      parent.postMessage({ source:"astro-native-preview", type:"route", route: href.slice(1) || "/" }, "*");
    }
  });
  document.addEventListener("submit", function(e){ e.preventDefault(); });
  window.addEventListener("message", function(e){
    if(e.source!==parent) return;
    var msg = e.data || {};
    if(msg.source!=="astro-native-preview-host" || msg.type!=="update") return;
    apply(msg.payload);
    requestAnimationFrame(function(){ parent.postMessage({ source:"astro-native-preview", type:"ack", id: msg.id }, "*"); });
  });
  pageEl = document.getElementById("page");
  parent.postMessage({ source:"astro-native-preview", type:"ready" }, "*");
})();
<\/script>
</body>
</html>`;

interface UpdateInput {
  sources?: Record<string, string>;
  route?: string;
}

function composePayload(
  manifest: NativeManifest,
  sources: Record<string, string>,
  route: string,
) {
  const pages: Record<string, string> = {};
  for (const [routePath, filePath] of Object.entries(manifest.routes))
    pages[routePath] = sources[filePath] ?? "";
  const components: Record<string, string> = {};
  for (const [tag, filePath] of Object.entries(manifest.components))
    components[tag] = sources[filePath] ?? "";
  const css = manifest.styles.map((path) => sources[path] ?? "").join("\n");
  return { pages, components, css, route };
}

export function createNativePreview(host: HTMLElement) {
  const pane = node("section", "preview-pane native-preview-pane");
  pane.setAttribute("aria-label", "Native site preview");
  const frameHost = node("div", "preview-frame-host");
  const frame = document.createElement("iframe");
  frame.className = "preview-frame native-preview-frame";
  frame.title = "Native site preview";
  frame.referrerPolicy = "no-referrer";
  // Scripts run so the runtime can render, but never same-origin: the frame
  // cannot reach the editor's origin, cookies, or storage.
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("srcdoc", RUNTIME);
  frameHost.append(frame);
  const errorBox = node("div", "native-preview-error");
  errorBox.setAttribute("role", "alert");
  errorBox.hidden = true;
  pane.append(errorBox, frameHost);

  let manifest: NativeManifest | undefined;
  let sources: Record<string, string> = {};
  let route = "/";
  let ready = false;
  let mounted = false;
  let rafHandle = 0;
  let messageId = 0;
  // A load/manifest failure (frame hidden) outranks a transient runtime error
  // (banner only), so runtime "clear-error" must not wipe a hard load error.
  let loadError = false;

  function showBanner(message: string | undefined, hideFrame: boolean) {
    if (message) {
      errorBox.textContent = message;
      errorBox.hidden = false;
      frameHost.hidden = hideFrame;
    } else {
      errorBox.hidden = true;
      frameHost.hidden = false;
    }
  }

  function post() {
    rafHandle = 0;
    if (!manifest || !ready || !mounted) return;
    const payload = composePayload(manifest, sources, route);
    frame.contentWindow?.postMessage(
      { source: "astro-native-preview-host", type: "update", id: ++messageId, payload },
      "*",
    );
  }
  function schedule() {
    if (rafHandle || !manifest) return;
    rafHandle = requestAnimationFrame(post);
  }

  function onMessage(event: MessageEvent) {
    if (event.source !== frame.contentWindow) return;
    const data = event.data as { source?: string; type?: string; route?: string } | undefined;
    if (data?.source !== "astro-native-preview") return;
    if (data.type === "ready") {
      ready = true;
      schedule();
      return;
    }
    // Runtime-reported render failures (bad define, recursive templates) surface
    // as a banner but keep the frame visible, unless a hard load error is shown.
    if (data.type === "error" && typeof (data as { message?: string }).message === "string") {
      if (!loadError) showBanner((data as { message: string }).message, false);
      return;
    }
    if (data.type === "clear-error") {
      if (!loadError) showBanner(undefined, false);
      return;
    }
    // A link click inside the preview (including inside shadow roots) navigates
    // the preview only, keeping the current source edits untouched.
    if (data.type === "route" && typeof data.route === "string" && manifest) {
      const next = data.route.endsWith("/") ? data.route : `${data.route}/`;
      const candidate = Object.hasOwn(manifest.routes, data.route)
        ? data.route
        : Object.hasOwn(manifest.routes, next)
          ? next
          : undefined;
      if (candidate && candidate !== route) {
        route = candidate;
        schedule();
      }
    }
  }
  window.addEventListener("message", onMessage);

  return {
    /** Show the pane and adopt a manifest. Idempotent for the same manifest. */
    activate(next: NativeManifest) {
      manifest = next;
      route = Object.hasOwn(next.routes, route) ? route : nativeDefaultRoute(next);
      if (!mounted) {
        mounted = true;
        host.classList.add("has-preview");
        host.prepend(pane);
      }
      schedule();
    },
    update(input: UpdateInput) {
      if (input.sources) sources = input.sources;
      if (input.route && manifest && Object.hasOwn(manifest.routes, input.route)) route = input.route;
      schedule();
    },
    setError(message: string | undefined) {
      loadError = Boolean(message);
      showBanner(message, true);
    },
    deactivate() {
      if (!mounted) return;
      mounted = false;
      manifest = undefined;
      loadError = false;
      pane.remove();
      host.classList.remove("has-preview");
      showBanner(undefined, false);
    },
    isActive() {
      return mounted;
    },
    destroy() {
      window.removeEventListener("message", onMessage);
      if (rafHandle) cancelAnimationFrame(rafHandle);
      pane.remove();
      host.classList.remove("has-preview");
    },
  };
}

export type NativePreview = ReturnType<typeof createNativePreview>;
