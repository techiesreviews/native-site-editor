// PROTOTYPE (wayfinder ticket 14, components-and-builder). Throwaway; not kept for the real build.
//
// Runs inside the preview frame, next to native-preview-runtime.js, and only
// when the editor was opened with ?proto=template (src/prototype/cb14.ts adds
// the <script> to the frame's document). It answers `cb14` host messages:
//   state    Edit component mode on or off, the variant, the instance edited
//            (A: a page node, then drilled template paths; B/C: a stage
//            outside #page holding one fresh instance), placeholders or the
//            page's content, the stage width and theme
//   dump     the edited template as rendered: every element of the focus
//            instance's shadow root with its template path, box and slot facts
//   select   selects the element at a template path (a click the runtime handles)
//   reveal   scrolls an element at a template path into view
// and tells the editor of hovered template parts, scrolls and re-renders.
//
// Placeholders in A: the instance's slots are renamed in the frame only
// (name="cb14-off-title"), so nothing the page wrote is assigned and the
// template's fallbacks show; the runtime puts the names back on its next
// render and this script renames them again. The source is never touched.
(function () {
  var state = { on: false };
  var styleEl = null;
  var stage = null;
  var lastHover = "";
  var observed = null;
  var observer = null;
  var pending = 0;
  var lastDump = "";

  function post(msg) { msg.source = "cb14-proto"; parent.postMessage(msg, "*"); }
  function pageEl() { return document.getElementById("page"); }
  function skip(el) { return el.localName === "style" && (el.hasAttribute("data-native-css") || el.hasAttribute("data-native-component-css")); }
  function kids(el) { return Array.prototype.filter.call(el.children, function (c) { return !skip(c); }); }
  function walk(root, path) {
    var el = root;
    for (var i = 0; el && i < path.length; i++) el = kids(el)[path[i]] || null;
    return el && el !== root ? el : null;
  }
  function pathIn(root, el) {
    var out = [];
    for (var at = el; at && at !== root; at = at.parentNode) {
      if (!(at instanceof Element)) return null;
      out.unshift(kids(at.parentNode).indexOf(at));
    }
    return at === root ? out : null;
  }
  function box(el) {
    var r = el.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  }
  function union(list) {
    var out = null;
    list.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (!out) out = [r.left, r.top, r.right, r.bottom];
      else out = [Math.min(out[0], r.left), Math.min(out[1], r.top), Math.max(out[2], r.right), Math.max(out[3], r.bottom)];
    });
    return out ? [Math.round(out[0]), Math.round(out[1]), Math.round(out[2] - out[0]), Math.round(out[3] - out[1])] : null;
  }
  function layoutRow(el) {
    if (!el || !(el instanceof Element)) return false;
    var cs = getComputedStyle(el);
    if (cs.display === "contents") return layoutRow(el.parentElement || (el.parentNode && el.parentNode.host));
    if (cs.display.indexOf("grid") >= 0) return cs.gridTemplateColumns.split(" ").filter(Boolean).length > 1;
    if (cs.display.indexOf("flex") >= 0) return cs.flexDirection.indexOf("row") === 0;
    return false;
  }
  function text(el) {
    var t = (el.textContent || "").replace(/\s+/g, " ").trim();
    return t.slice(0, 60);
  }
  function isInstance(el) { return el.localName.indexOf("-") > 0 && !!el.shadowRoot; }
  // The first heading an element shows (an instance's from its page content, else its template), as Structure names it.
  function heading(el) {
    var h = el.matches("h1,h2,h3,h4,h5,h6") ? el : el.querySelector("h1,h2,h3,h4,h5,h6");
    if (!h && el.shadowRoot) h = el.shadowRoot.querySelector("h1,h2,h3,h4,h5,h6");
    return h ? (h.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) : "";
  }

  // ---- The stage (B, C): one fresh instance outside #page, which the runtime never reconciles. ----
  function ensureStage() {
    if (!stage) {
      stage = document.createElement("div");
      stage.id = "cb14-stage";
      var inner = document.createElement("div");
      inner.id = "cb14-stage-inner";
      stage.appendChild(inner);
      document.body.appendChild(stage);
    }
    return stage.firstChild;
  }
  function stageInstance() {
    var inner = ensureStage();
    var tag = state.drill && state.drill.length ? state.drill[state.drill.length - 1].tag : state.top.tag;
    var el = inner.firstElementChild;
    if (!el || el.localName !== tag) {
      inner.textContent = "";
      el = document.createElement(tag);
      el.setAttribute("data-cb14-stage", "");
      inner.appendChild(el);
      el.__cb14Content = null;
    }
    var content = state.content || "";
    if (el.__cb14Content !== content) {
      el.__cb14Content = content;
      el.innerHTML = content;
      // The page's own content is shown, not edited here: clicks reach the template part around it.
      Array.prototype.forEach.call(el.children, function (child) { child.style.pointerEvents = "none"; });
    }
    return el;
  }

  // ---- The instance being edited and the chain above it. ----
  function chain() {
    if (!state.on || !state.top) return null;
    if (state.variant !== "A") { var only = stageInstance(); return only.shadowRoot ? [only] : null; }
    var host = state.top.node ? walk(pageEl(), state.top.node) : null;
    if (!host || host.localName !== state.top.tag || !host.shadowRoot) return null;
    var out = [host];
    var drill = state.drill || [];
    for (var d = 0; d < drill.length; d++) {
      var step = drill[d];
      var parentEl = out[out.length - 1];
      var el = walk(parentEl.shadowRoot, step.path);
      var shown = el && el.localName === step.tag && el.getBoundingClientRect().height > 0;
      if (!shown && el) {
        // The page's content is shown: the slot around the fallback holds the page's instances instead.
        var at = el.parentElement;
        while (at && at.localName !== "slot") at = at.parentElement;
        var alt = at && at.assignedElements().filter(function (a) { return a.localName === step.tag; })[0];
        if (alt && alt.shadowRoot) el = alt;
      }
      if (!el || el.localName !== step.tag || !el.shadowRoot) break;
      out.push(el);
    }
    return out.length === 1 + (state.drill || []).length ? out : null;
  }

  // ---- Placeholders: rename slots so the template's fallbacks show (A). ----
  function renameSlots(host, off) {
    if (!host || !host.shadowRoot) return;
    host.shadowRoot.querySelectorAll("slot").forEach(function (slot) {
      var renamed = slot.hasAttribute("data-cb14-orig");
      if (off && !renamed) {
        slot.setAttribute("data-cb14-orig", slot.getAttribute("name") || "");
        slot.setAttribute("name", "cb14-off-" + (slot.getAttribute("name") || "default"));
      } else if (!off && renamed) {
        var name = slot.getAttribute("data-cb14-orig");
        slot.removeAttribute("data-cb14-orig");
        if (name) slot.setAttribute("name", name); else slot.removeAttribute("name");
      }
    });
    if (off) host.shadowRoot.querySelectorAll("[data-native-empty]").forEach(function (el) { el.removeAttribute("data-native-empty"); });
  }
  function itemsLike(slot) {
    var name = slot.getAttribute("data-cb14-orig");
    if (name === null) name = slot.getAttribute("name") || "";
    return !name || /items?|cards?|list/.test(name) || Array.prototype.some.call(slot.children, function (c) { return c.localName.indexOf("-") > 0; });
  }
  var DROP = "display:block;min-height:120px;border:2px dashed rgba(124,58,237,.55);border-radius:12px;background:rgba(124,58,237,.06)";
  function decorate() {
    var hosts = chain();
    // Every renamed slot outside the chain (an instance left, mode off) gets its name back.
    var keep = new Set(hosts || []);
    (renamedHosts || []).forEach(function (h) { if (!keep.has(h) || state.show !== "fallbacks" || state.variant !== "A") renameSlots(h, false); });
    renamedHosts = [];
    if (!hosts) { observe(null); return null; }
    if (state.variant === "A" && state.show === "fallbacks") hosts.forEach(function (h) { renameSlots(h, true); renamedHosts.push(h); });
    // A: what the page put in the instance shows, but clicks reach the template part around it.
    if (state.variant === "A") hosts.forEach(function (h) { Array.prototype.forEach.call(h.children, function (c) { if (c.style.pointerEvents !== "none") c.style.pointerEvents = "none"; inert.add(c); }); });
    var focus = hosts[hosts.length - 1];
    focus.shadowRoot.querySelectorAll("slot").forEach(function (slot) {
      var empty = !slot.children.length && (!slot.assignedNodes().length || slot.hasAttribute("data-cb14-orig")) && itemsLike(slot);
      var marked = slot.getAttribute("data-cb14-drop") === "1";
      if (empty && !marked) { slot.setAttribute("data-cb14-drop", "1"); slot.setAttribute("style", DROP); }
      if (!empty && marked) { slot.removeAttribute("data-cb14-drop"); slot.removeAttribute("style"); }
      if (empty && slot.getAttribute("style") !== DROP) slot.setAttribute("style", DROP);
    });
    observe(focus);
    return hosts;
  }
  var renamedHosts = [];
  var inert = new Set();
  function releaseInert() { inert.forEach(function (c) { c.style.pointerEvents = ""; if (!c.getAttribute("style")) c.removeAttribute("style"); }); inert.clear(); }

  function observe(focus) {
    if (observed === focus) return;
    if (observer) observer.disconnect();
    observed = focus;
    if (!focus) return;
    observer = new MutationObserver(schedule);
    observer.observe(focus.shadowRoot, { childList: true, subtree: true, attributes: true, characterData: true });
    var hosts = chain() || [];
    hosts.forEach(function (h) { if (h !== focus && h.shadowRoot) observer.observe(h.shadowRoot, { childList: true, subtree: true, attributes: true }); });
    observer.observe(pageEl(), { childList: true, subtree: true, attributes: true, characterData: true });
  }
  function schedule() {
    if (pending) return;
    pending = requestAnimationFrame(function () { pending = 0; push(false); });
  }

  // ---- Measurements. ----
  function dump() {
    var hosts = decorate();
    if (!hosts) return { ok: false, vw: innerWidth, vh: innerHeight };
    var focus = hosts[hosts.length - 1];
    var root = focus.shadowRoot;
    var nodes = [];
    function visit(parentEl, prefix, insideSlot) {
      kids(parentEl).forEach(function (el, i) {
        var p = prefix.concat(i);
        var cs = getComputedStyle(el);
        var node = { p: p, t: el.localName, c: el.getAttribute("class") || "", r: box(el), row: layoutRow(el), txt: text(el), hd: heading(el), inst: isInstance(el), hid: cs.display === "none", inSlot: insideSlot };
        if (el.localName === "slot") {
          var orig = el.getAttribute("data-cb14-orig");
          var name = orig !== null ? orig : (el.getAttribute("name") || "");
          var assigned = orig !== null ? [] : el.assignedElements();
          node.slot = { name: name, assigned: assigned.length, fb: el.children.length, drop: el.getAttribute("data-cb14-drop") === "1", showsPage: assigned.length > 0 };
          node.hid = cs.display === "none" || el.hasAttribute("data-native-empty");
          node.r = el.getAttribute("data-cb14-drop") === "1" ? box(el) : union(assigned.length ? assigned : kids(el)) || [0, 0, 0, 0];
          node.row = layoutRow(el.parentElement || focus);
          if (assigned.length) node.pageItems = assigned.map(function (a) { return { t: a.localName, r: box(a), txt: text(a), hd: heading(a), n: a.children.length }; });
        }
        nodes.push(node);
        if (el.localName === "slot" || !isInstance(el)) visit(el, p, insideSlot || el.localName === "slot");
      });
    }
    visit(root, [], false);
    return {
      ok: true,
      tag: focus.localName,
      host: box(focus),
      hd: heading(focus),
      chain: hosts.map(function (h) { return { tag: h.localName, r: box(h) }; }),
      nodes: nodes,
      vw: innerWidth,
      vh: innerHeight,
      sy: scrollY
    };
  }
  function push(force) {
    var d = dump();
    var key = JSON.stringify(d);
    if (!force && key === lastDump) return;
    lastDump = key;
    post({ type: "dump", dump: d });
  }

  // ---- Frame CSS. ----
  function css() {
    var dark = !!state.dark;
    var w = state.width ? state.width + "px" : "100%";
    return [
      "#cb14-stage { display: none; }",
      "html.cb14-iso #root { display: none !important; }",
      "html.cb14-iso, html.cb14-iso body { background: " + (dark ? "#1b1c21" : "#ebebee") + " !important; }",
      "html.cb14-iso #cb14-stage { display: block; box-sizing: border-box; min-height: 100vh; padding: 64px 28px 160px;",
      "  background-image: radial-gradient(" + (dark ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.08)") + " 1px, transparent 1.2px); background-size: 16px 16px; }",
      "html.cb14-iso #cb14-stage-inner { box-sizing: border-box; width: " + w + "; max-width: 100%; margin: 0 auto; padding: 28px; border-radius: 14px;",
      "  background: var(--page, #fff); color: var(--ink, inherit); box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 12px 32px rgba(0,0,0," + (dark ? ".45" : ".10") + "); transition: width 160ms ease-out; }",
      "@media (prefers-reduced-motion: reduce) { html.cb14-iso #cb14-stage-inner { transition: none; } }"
    ].join("\n");
  }
  function applyCss() {
    if (!styleEl) { styleEl = document.createElement("style"); styleEl.id = "cb14-proto-style"; document.head.appendChild(styleEl); }
    var text = css();
    if (styleEl.textContent !== text) styleEl.textContent = text;
    var iso = state.on && state.variant !== "A";
    document.documentElement.classList.toggle("cb14-iso", !!iso);
    document.documentElement.classList.toggle("cb14-on", !!state.on);
  }

  // ---- Hover over the template's parts: the part under the pointer and the slot around it. ----
  // The slot is found by its box (what it shows: the page's content or its fallback), since the
  // page's own content in A takes no pointer events.
  function slotAt(focus, x, y) {
    var hit = null, best = Infinity;
    focus.shadowRoot.querySelectorAll("slot").forEach(function (s) {
      var r;
      if (s.getAttribute("data-cb14-drop") === "1") { var b = s.getBoundingClientRect(); r = [b.left, b.top, b.width, b.height]; }
      else { var a = s.hasAttribute("data-cb14-orig") ? [] : s.assignedElements(); r = union(a.length ? a : kids(s)); }
      if (!r || !(r[2] || r[3])) return;
      if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3] && r[2] * r[3] < best) { best = r[2] * r[3]; hit = pathIn(focus.shadowRoot, s); }
    });
    return hit;
  }
  function reportHover(p, slot) {
    var key = JSON.stringify([p, slot]);
    if (key === lastHover) return;
    lastHover = key;
    post({ type: "hover", p: p, slot: slot });
  }
  document.addEventListener("mousemove", function (e) {
    if (!state.on) return;
    var hosts = chain();
    var focus = hosts && hosts[hosts.length - 1];
    var hit = null, slot = null;
    if (focus) {
      var path = e.composedPath();
      for (var i = 0; i < path.length; i++) {
        var n = path[i];
        if (n instanceof Element && n.getRootNode() === focus.shadowRoot && n.localName !== "slot") { hit = pathIn(focus.shadowRoot, n); break; }
      }
      slot = slotAt(focus, e.clientX, e.clientY);
    }
    reportHover(hit, slot);
  }, true);
  document.documentElement.addEventListener("mouseleave", function () { if (state.on) reportHover(null, null); });
  // Outside Edit component mode: a click on a fixed part of an instance's template (not a slot's
  // fallback, not an element holding slots). The runtime selects the instance and offers no editing;
  // the editor shows "○ fixed in <tag>" in the name label, with a way into Edit component.
  window.addEventListener("click", function (e) {
    if (state.on) return;
    var path = e.composedPath();
    var el = null;
    for (var i = 0; i < path.length; i++) { if (path[i] instanceof Element && path[i].localName !== "slot") { el = path[i]; break; } }
    var root = el && el.getRootNode();
    if (!(root instanceof ShadowRoot)) { post({ type: "fixed", tag: null }); return; }
    var host = root.host;
    var inFallback = false;
    for (var at = el.parentElement; at; at = at.parentElement) if (at.localName === "slot") inFallback = true;
    var holdsSlots = !!el.querySelector("slot");
    var page = pageEl();
    if (inFallback || holdsSlots || el.parentNode === root || !page || host.getRootNode() !== document || !page.contains(host)) { post({ type: "fixed", tag: null }); return; }
    post({ type: "fixed", tag: host.localName, p: pathIn(root, el), host: pathIn(page, host), t: el.localName });
  }, true);
  // A click on the template's root element (or the instance's own box) selects the root in the
  // template; the runtime alone would select the instance on the page and the template would close.
  window.addEventListener("click", function (e) {
    if (!state.on || e.cb14) return;
    var hosts = chain();
    var focus = hosts && hosts[hosts.length - 1];
    if (!focus) return;
    var path = e.composedPath();
    var first = null;
    for (var i = 0; i < path.length; i++) { if (path[i] instanceof Element && path[i].localName !== "slot") { first = path[i]; break; } }
    if (!first) return;
    if (first === focus || first.parentNode === focus.shadowRoot) {
      e.preventDefault();
      e.stopImmediatePropagation();
      post({ type: "root", p: first === focus ? [0] : pathIn(focus.shadowRoot, first) });
    }
  }, true);
  // A template block pressed and moved 7 px drags itself (ticket 12): the editor owns the drag,
  // this relays the pointer. Text being typed in keeps press-and-drag for selecting text.
  var press = null;
  document.addEventListener("pointerdown", function (e) {
    press = null;
    if (!state.on || e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    var hosts = chain();
    var focus = hosts && hosts[hosts.length - 1];
    if (!focus) return;
    var path = e.composedPath();
    var el = null;
    for (var i = 0; i < path.length; i++) { var n = path[i]; if (n instanceof Element && n.getRootNode() === focus.shadowRoot && n.localName !== "slot") { el = n; break; } }
    // Text being typed in (focused) keeps press-and-drag for selecting its text.
    if (!el || (el.isContentEditable && focus.shadowRoot.activeElement === el) || el.parentNode === focus.shadowRoot) return;
    press = { x: e.clientX, y: e.clientY, p: pathIn(focus.shadowRoot, el), t: el.localName, id: e.pointerId, el: el, started: false };
  }, true);
  document.addEventListener("pointermove", function (e) {
    if (!press) return;
    if (!press.started) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 7) return;
      press.started = true;
      try { press.el.setPointerCapture(press.id); } catch (err) { /* not capturable */ }
      var sel = getSelection();
      if (sel) sel.removeAllRanges();
      post({ type: "press", phase: "start", x: e.clientX, y: e.clientY, p: press.p, t: press.t });
    } else post({ type: "press", phase: "move", x: e.clientX, y: e.clientY });
    e.preventDefault();
  }, true);
  function release(e, phase) {
    if (!press) return;
    var was = press;
    press = null;
    if (!was.started) return;
    e.preventDefault();
    var sel = getSelection();
    if (sel) sel.removeAllRanges();
    post({ type: "press", phase: phase, x: e.clientX, y: e.clientY });
  }
  document.addEventListener("pointerup", function (e) { release(e, "end"); }, true);
  document.addEventListener("pointercancel", function (e) { release(e, "cancel"); }, true);
  document.addEventListener("keydown", function (e) {
    if (!state.on || e.key !== "Escape") return;
    var active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) active = active.shadowRoot.activeElement;
    if (active && active.isContentEditable) return;
    post({ type: "key", key: "Escape" });
  }, true);
  addEventListener("scroll", function () { if (state.on) schedule(); }, true);
  addEventListener("resize", function () { if (state.on) schedule(); });
  setInterval(function () { if (state.on) push(false); }, 400);

  function focusEl(path) {
    var hosts = chain();
    var focus = hosts && hosts[hosts.length - 1];
    return focus && path ? walk(focus.shadowRoot, path) : focus;
  }

  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var msg = e.data || {};
    if (msg.source !== "astro-native-preview-host" || msg.type !== "cb14") return;
    if (msg.op === "state") {
      state = msg.state || { on: false };
      applyCss();
      if (!state.on) { renamedHosts.forEach(function (h) { renameSlots(h, false); }); renamedHosts = []; releaseInert(); observe(null); }
      push(true);
      return;
    }
    if (msg.op === "dump") { var d = dump(); lastDump = JSON.stringify(d); post({ type: "dump", id: msg.id, dump: d }); return; }
    if (msg.op === "select") {
      var el = focusEl(msg.p);
      if (el && el.localName === "slot") el = el.firstElementChild || el.parentElement;
      var hosts = chain();
      var focus = hosts && hosts[hosts.length - 1];
      // The template's own root element stands for the instance in the runtime's clicks: the editor selects it by path.
      if (el && focus && el.parentNode === focus.shadowRoot) { post({ type: "root", id: msg.id, p: pathIn(focus.shadowRoot, el) }); return; }
      if (el) { var ev = new MouseEvent("click", { bubbles: true, composed: true, cancelable: true }); ev.cb14 = true; el.dispatchEvent(ev); }
      post({ type: "selected", id: msg.id, ok: !!el });
      return;
    }
    if (msg.op === "reveal") {
      var target = focusEl(msg.p);
      if (target && target.localName === "slot") target = target.firstElementChild || target.parentElement;
      if (target) target.scrollIntoView({ block: target.getBoundingClientRect().height > innerHeight * 0.8 ? "start" : msg.block || "nearest", behavior: "instant" });
      if (!target && msg.top) scrollTo(0, 0);
      return;
    }
  });
})();
