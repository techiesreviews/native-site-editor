(function () {
  var state = null;
  var defined = {};
  var shadowRoots = new Set();
  var scrollRoots = new WeakSet();
  var instances = new Set();
  var pageEl = null;
  var hovered = null;
  var hoverPointer = null;
  var selected = null;
  var hoverBox = null;
  var selectBox = null;
  var boxColor = "#2f6d3a";
  var renderDepth = 0;
  var MAX_DEPTH = 40;
  var hadError = false;
  // The selected text element being typed into, and its text and markup as
  // of the last commit.
  var editing = null;
  var editingText = "";
  var editingHtml = "";
  // The file that owned the element when typing began.
  var editingOwner = null;
  // Shared stylesheets as constructed sheets: one CSSStyleSheet per sheet
  // the page links (and each file those import) for the whole document, adopted by the document and by every
  // component shadow root, so a token declared once at document level is
  // inherited everywhere and no shadow root carries its own copy. Component
  // CSS is one sheet per tag, adopted after the shared ones by that tag's
  // shadow roots only. Adopted sheets sit after a root's own <style>
  // elements in the cascade and keep their array order, so the shared →
  // component order the editor's rule ranking assumes still holds.
  var sharedSheets = [];
  var componentSheets = {};
  // Optional template parts (see applyEmptyRules) stay out of layout. Text
  // being edited (see startEditing) shows the selection box, not the
  // browser's focus ring.
  var runtimeSheet = new CSSStyleSheet();
  // A <main> with nothing in it yet keeps some height, so the editor's
  // "Start with a section" (src/page-builder/canvas-overlays.ts) has room
  // over it; preview only, like the selection boxes.
  runtimeSheet.replaceSync("[data-native-empty]{display:none !important}[contenteditable]:focus{outline:none !important}#page main:not(:has(*)){min-height:min(480px,72vh)}");
  // Subtle scrollbars for the frame's own viewport, only while the site
  // declares no scrollbar styling of its own (see siteStylesScrollbars). The
  // sheet is adopted first by the document alone, so its layer comes before
  // every site layer and any site rule wins over it. The colour inherits, so
  // every element below the root is put back to `auto`: a site's
  // ::-webkit-scrollbar rules apply only where scrollbar-color is `auto`.
  var viewportScrollbarSheet = new CSSStyleSheet();
  viewportScrollbarSheet.replaceSync("@layer native-preview-viewport{" +
    ":where(html){scrollbar-width:thin;scrollbar-color:rgba(127,127,127,.4) transparent}:where(html) :where(*){scrollbar-color:auto}" +
    ":where(html)::-webkit-scrollbar{width:6px;height:6px}:where(html)::-webkit-scrollbar-track{background:transparent}" +
    ":where(html)::-webkit-scrollbar-thumb{border-radius:999px;background:rgba(127,127,127,.4)}:where(html)::-webkit-scrollbar-thumb:hover{background:rgba(127,127,127,.65)}" +
    "@media(forced-colors:active){:where(html){scrollbar-color:auto}}}");
  var viewportScrollbars = false;
  // Each constructed sheet's source: `{ path, wrappers, importer, kind }`. A
  // shared sheet expanded from an `@import` carries the imported file's path,
  // the chain of import wrappers (outermost first; each may have `layer`,
  // `supports` and `media`) and the importing file (see shared/css-imports.ts).
  var sheetInfo = new WeakMap();

  function emit(type, extra) {
    var base = { source: "astro-native-preview", type: type };
    if (state) base.context = state.context;
    parent.postMessage(Object.assign(base, extra || {}), "*");
  }

  function reportError(message) {
    hadError = true;
    emit("error", { message: String(message) });
  }

  function sanitize(fragment) {
    fragment.querySelectorAll("script").forEach(function (el) { el.remove(); });
    fragment.querySelectorAll("meta[http-equiv]").forEach(function (el) {
      if ((el.getAttribute("http-equiv") || "").toLowerCase() === "refresh") el.remove();
    });
    fragment.querySelectorAll("*").forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        var name = attr.name.toLowerCase();
        var value = (attr.value || "").replace(/\s+/g, "").toLowerCase();
        if (name.indexOf("on") === 0) { el.removeAttribute(attr.name); return; }
        if ((name === "href" || name === "src" || name === "xlink:href" || name === "action" || name === "formaction") && value.indexOf("javascript:") === 0) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return fragment;
  }

  // Repository images (a root path such as "/images/x.svg", or one relative
  // to the page's URL, as on the live site) shown from the data URLs the
  // host read for them. The host sends each asset once (`assetChanges`, with
  // a render or on its own as images arrive after the page is drawn); they
  // are kept here across renders.
  var SITE = "https://site.invalid";
  var assetUrls = Object.create(null);
  function applyAssetChanges(changes) {
    if (!changes || typeof changes !== "object") return false;
    var changed = false;
    var set = changes.set && typeof changes.set === "object" ? changes.set : {};
    Object.keys(set).forEach(function (key) {
      if (typeof set[key] === "string" && /^data:/i.test(set[key])) { assetUrls[key] = set[key]; changed = true; }
    });
    (Array.isArray(changes.drop) ? changes.drop : []).forEach(function (key) {
      if (typeof key === "string" && key in assetUrls) { delete assetUrls[key]; changed = true; }
    });
    return changed;
  }
  function assetFor(src) {
    if (typeof src !== "string") return null;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src.trim())) return null;
    var key;
    try {
      var url = new URL(src.trim(), SITE + ((state && state.base) || "/"));
      if (url.origin !== SITE) return null;
      key = decodeURI(url.pathname).replace(/^\//, "");
    } catch (e) {
      return null;
    }
    return key in assetUrls ? assetUrls[key] : null;
  }
  function resolveAssets(fragment) {
    fragment.querySelectorAll("img[src]").forEach(function (el) {
      var url = assetFor(el.getAttribute("src"));
      if (url) el.setAttribute("src", url);
    });
  }
  // Assets that arrived after the page was drawn: images still showing their
  // repository path take theirs in place, and the stylesheets (their url()s
  // filled in by the host) are applied again. The page is not drawn again,
  // so nothing the host was told about it (its structure) goes stale.
  function showArrivedAssets(msg) {
    if (!applyAssetChanges(msg.assetChanges) || !state) return;
    if (Array.isArray(msg.styles)) state.styles = msg.styles;
    if (msg.componentStyles && typeof msg.componentStyles === "object") state.componentStyles = msg.componentStyles;
    syncStyles();
    var roots = [pageEl].concat(Array.from(shadowRoots));
    roots.forEach(function (root) {
      if (!root) return;
      root.querySelectorAll("img[src]").forEach(function (el) {
        var url = assetFor(el.getAttribute("src"));
        if (url) el.setAttribute("src", url);
      });
    });
  }

  function makeTemplate(html) {
    var t = document.createElement("template");
    t.innerHTML = html || "";
    sanitize(t.content);
    return t;
  }

  // The markup each rendered element was made from, so a later render can
  // tell an element that only moved (a section moved, inserted around,
  // duplicated or removed) from one that changed. It is the source's markup,
  // taken before images are swapped for their data URLs: an image arriving
  // later (showArrivedAssets) changes no element's identity.
  var markupOf = new WeakMap();

  /** A fresh copy of `html` to render, each element remembering its markup. */
  function freshContent(html) {
    var content = makeTemplate(html).content.cloneNode(true);
    content.querySelectorAll("*").forEach(function (el) { markupOf.set(el, el.outerHTML); });
    resolveAssets(content);
    return content;
  }

  function nodeKey(n) { return n.nodeType === 1 ? n.getAttribute("data-key") : null; }

  /** What pairs a new node with a rendered one: its `data-key`, else an element's markup. */
  function identity(n) {
    var key = nodeKey(n);
    if (key) return "key:" + key;
    var markup = n.nodeType === 1 && markupOf.get(n);
    return markup ? "markup:" + markup : null;
  }

  function sameKind(a, b) {
    if (!a || !b || a.nodeType !== b.nodeType) return false;
    if (a.nodeType === 3) return true;
    return a.nodeType === 1 && a.tagName === b.tagName;
  }

  function reconcileChildren(target, fragment) {
    var desired = Array.prototype.slice.call(fragment.childNodes);
    // A new node pairs with a rendered node of the same key, else with one
    // made from the same markup, in order, so a moved element keeps its node
    // (its selection, images and component) and two identical ones stay two.
    // A keyed node with no partner is new; any other takes the node at its
    // position unless a later node claimed that one.
    var byIdentity = new Map();
    Array.prototype.slice.call(target.childNodes).forEach(function (n) {
      var id = identity(n);
      if (!id) return;
      if (!byIdentity.has(id)) byIdentity.set(id, []);
      byIdentity.get(id).push(n);
    });
    var claimed = new Set();
    var partners = desired.map(function (next) {
      var found = byIdentity.get(identity(next));
      var partner = found && found.shift();
      if (partner) claimed.add(partner);
      return partner || null;
    });
    desired.forEach(function (next, index) {
      var currentAtIndex = target.childNodes[index] || null;
      var existing = partners[index] ||
        (nodeKey(next) || claimed.has(currentAtIndex) ? null : currentAtIndex);
      if (!sameKind(existing, next)) {
        target.insertBefore(next, currentAtIndex);
        if (currentAtIndex && !claimed.has(currentAtIndex) && !nodeKey(currentAtIndex)) currentAtIndex.remove();
        return;
      }
      if (next.nodeType === 1) markupOf.set(existing, markupOf.get(next));
      reconcileNode(existing, next);
      if (target.childNodes[index] !== existing) target.insertBefore(existing, target.childNodes[index] || null);
    });
    while (target.childNodes.length > desired.length) target.lastChild.remove();
  }

  function reconcileNode(existing, desired) {
    if (existing.nodeType === 3) {
      if (existing.textContent !== desired.textContent) existing.textContent = desired.textContent;
      return;
    }
    syncAttrs(existing, desired);
    if (existing.tagName === "SCRIPT") return;
    // Typing not yet sent to the editor is not overwritten by a render.
    if (existing === editing && existing.textContent !== editingText) return;
    reconcileChildren(existing, desired);
  }

  function syncAttrs(existing, desired) {
    Array.prototype.slice.call(existing.attributes).forEach(function (a) {
      if (a.name === "contenteditable" && existing === editing) return;
      if (!desired.hasAttribute(a.name)) existing.removeAttribute(a.name);
    });
    Array.prototype.slice.call(desired.attributes).forEach(function (a) {
      if (existing.getAttribute(a.name) !== a.value) existing.setAttribute(a.name, a.value);
    });
  }

  function hydrateShadow(host, html) {
    if (renderDepth >= MAX_DEPTH) {
      reportError("Recursive component templates detected (over " + MAX_DEPTH + " levels); rendering stopped.");
      return;
    }
    renderDepth++;
    try {
      var root = host.shadowRoot || host.attachShadow({ mode: "open" });
      shadowRoots.add(root);
      if (!scrollRoots.has(root)) {
        scrollRoots.add(root);
        root.addEventListener("scroll", refreshScroll, true);
      }
      reconcileChildren(root, freshContent(html));
      markCurrentPage(root);
      syncRootStyles(root);
      watchSlots(root);
      applyEmptyRules(root);
    } finally {
      renderDepth--;
    }
  }

  // Links in a component's shadow root that point at the page on show get
  // aria-current="page", as the site's loader marks them on the live site
  // (a header's nav link to this page). Shown only: the source is not
  // changed, and a render starts from the template again (see syncAttrs).
  function samePage(path) { return path.replace(/\/index\.html$/, "/"); }
  function markCurrentPage(root) {
    if (!state) return;
    var here = samePage(state.route);
    root.querySelectorAll("a[href]").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (href.indexOf("#") >= 0 || link.hasAttribute("aria-current")) return;
      try {
        var url = new URL(href, SITE + (state.base || "/"));
        if (url.origin === SITE && samePage(decodeURI(url.pathname)) === here) link.setAttribute("aria-current", "page");
      } catch (e) {
        // Not a URL: not this page.
      }
    });
  }

  function defineTag(tag) {
    if (defined[tag]) return;
    defined[tag] = true;
    try {
      customElements.define(tag, class extends HTMLElement {
        connectedCallback() {
          instances.add(this);
          this.render();
          requestComponentStyles();
        }
        disconnectedCallback() {
          instances.delete(this);
          if (this.shadowRoot) shadowRoots.delete(this.shadowRoot);
        }
        render() {
          if (!state) return;
          if (state.components[tag] === undefined) {
            // No longer a component (its template deleted or moved away): an
            // element can keep neither its definition nor its shadow root, so
            // the root shows the element's own content instead.
            var root = this.shadowRoot;
            if (root && !(root.childNodes.length === 1 && root.firstChild.localName === "slot" && !root.firstChild.name)) {
              root.replaceChildren(document.createElement("slot"));
              root.adoptedStyleSheets = [];
            }
            return;
          }
          hydrateShadow(this, state.components[tag]);
        }
      });
    } catch (e) {
      reportError("Component <" + tag + "> could not be defined: " + (e && e.message ? e.message : e));
    }
  }

  function renderInstances() {
    Array.from(instances).forEach(function (el) {
      if (el.isConnected && typeof el.render === "function") el.render();
      else if (!el.isConnected) instances.delete(el);
    });
  }

  function renderPage() {
    if (!state || !pageEl) return;
    var html = state.pages[state.route];
    if (html === undefined) {
      var keys = Object.keys(state.pages);
      html = keys.length ? state.pages[keys[0]] : "";
    }
    reconcileChildren(pageEl, freshContent(html));
    renderInstances();
    updateBoxes();
    scheduleInsertPoints();
  }

  function stylesList() {
    return state && Array.isArray(state.styles) ? state.styles : [];
  }

  function componentStyleFor(tag) {
    return state && state.componentStyles && state.componentStyles[tag] || null;
  }

  // Fills a constructed sheet from `item` ({ path, source }, plus `wrappers`,
  // `importer` and `kind` for an expanded import), replacing its rules only
  // when the source changed.
  function fillSheet(entry, item) {
    entry.path = String(item.path || "");
    sheetInfo.set(entry.sheet, {
      path: entry.path,
      wrappers: Array.isArray(item.wrappers) ? item.wrappers : [],
      importer: String(item.importer || ""),
      kind: String(item.kind || "sheet")
    });
    var source = String(item.source || "");
    if (entry.source === source) return;
    entry.source = source;
    try {
      entry.sheet.replaceSync(withoutImports(source));
    } catch (e) {
      reportError("Stylesheet " + entry.path + " could not be applied: " + (e && e.message ? e.message : e));
    }
  }

  // A constructed sheet cannot hold @import (the browser drops each with a
  // console warning), and the host already expanded them into sheets of
  // their own: the leading @import statements are taken out first. They
  // may only come before every rule but @charset and @layer statements, so
  // the scan stops at the first other rule; comments and strings are skipped.
  function withoutImports(css) {
    var out = "", pos = 0, cut = false;
    while (pos < css.length) {
      var rest = css.slice(pos);
      var space = /^(?:\s+|\/\*[\s\S]*?(?:\*\/|$))/.exec(rest);
      if (space) { out += space[0]; pos += space[0].length; continue; }
      var at = /^@(import|charset|layer)\b/i.exec(rest);
      if (!at) break;
      var end = statementEnd(css, pos);
      if (end < 0) break;
      if (at[1].toLowerCase() === "import") cut = true;
      else out += css.slice(pos, end + 1);
      pos = end + 1;
    }
    return cut ? out + css.slice(pos) : css;
  }
  // The index of the `;` ending the statement at `pos`, outside strings and
  // parentheses; -1 when a block starts first (an @layer block).
  function statementEnd(css, pos) {
    var depth = 0, quote = "";
    for (var i = pos; i < css.length; i++) {
      var c = css[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = "";
      } else if (c === "\"" || c === "'") quote = c;
      else if (c === "(") depth++;
      else if (c === ")" && depth) depth--;
      else if (depth === 0 && c === ";") return i;
      else if (depth === 0 && c === "{") return -1;
    }
    return -1;
  }

  function syncSharedSheets() {
    var styles = stylesList();
    styles.forEach(function (item, index) {
      if (!sharedSheets[index]) sharedSheets[index] = { path: "", source: null, sheet: new CSSStyleSheet() };
      fillSheet(sharedSheets[index], item);
    });
    sharedSheets.length = styles.length;
  }

  function componentSheetFor(tag) {
    var item = componentStyleFor(tag);
    if (!item) {
      delete componentSheets[tag];
      return null;
    }
    if (!componentSheets[tag]) componentSheets[tag] = { path: "", source: null, sheet: new CSSStyleSheet() };
    fillSheet(componentSheets[tag], item);
    return componentSheets[tag].sheet;
  }

  // Whether any of the site's styling mentions scrollbars: its shared and
  // component stylesheets, component templates, and the rendered page's
  // <style> elements and style attributes. A plain text test, so a class
  // name or comment also counts; the viewport then keeps the browser's own.
  function siteStylesScrollbars() {
    var mentions = function (text) { return /scrollbar/i.test(String(text || "")); };
    var componentStyles = state.componentStyles || {};
    return state.styles.some(function (item) { return item && mentions(item.source); }) ||
      Object.keys(componentStyles).some(function (tag) { return componentStyles[tag] && mentions(componentStyles[tag].source); }) ||
      Object.keys(state.components).some(function (tag) { return mentions(state.components[tag]); }) ||
      Array.prototype.some.call(pageEl ? pageEl.querySelectorAll("style,[style]") : [], function (el) {
        return mentions(el.localName === "style" ? el.textContent : el.getAttribute("style"));
      });
  }

  // The sheets a root adopts: the viewport's scrollbars (document only),
  // every shared sheet, then (for a component's shadow root) that
  // component's own sheet, then the runtime's own rules.
  function sheetsFor(root) {
    var out = sharedSheets.map(function (entry) { return entry.sheet; });
    if (root === document && viewportScrollbars) out.unshift(viewportScrollbarSheet);
    if (root !== document && root.host) {
      var scoped = componentSheetFor(root.host.localName);
      if (scoped) out.push(scoped);
    }
    out.push(runtimeSheet);
    return out;
  }

  function syncRootStyles(root) {
    if (!state) return;
    var wanted = sheetsFor(root);
    var current = root.adoptedStyleSheets || [];
    var same = current.length === wanted.length;
    for (var i = 0; same && i < wanted.length; i++) same = current[i] === wanted[i];
    if (!same) root.adoptedStyleSheets = wanted;
  }

  function syncStyles() {
    syncSharedSheets();
    syncRootStyles(document);
    shadowRoots.forEach(syncRootStyles);
  }

  function apply(payload) {
    // A render replaces the page under a drag: the drag is over, nothing moved.
    if (sectionDrag) {
      endSectionDrag();
      emit("section-drag", { phase: "cancel" });
    }
    hadError = false;
    renderDepth = 0;
    var previous = selected && selected.isConnected ? { path: ownerPath(selected), node: elementIndexPath(selected) } : null;
    applyAssetChanges(payload.assetChanges);
    state = {
      pages: payload.pages || {},
      pagePaths: payload.pagePaths || {},
      components: payload.components || {},
      componentPaths: payload.componentPaths || {},
      editableTemplatePath: typeof payload.editableTemplatePath === "string" && Object.values(payload.componentPaths || {}).indexOf(payload.editableTemplatePath) !== -1 ? payload.editableTemplatePath : undefined,
      styles: Array.isArray(payload.styles) ? payload.styles : [],
      styleErrors: Array.isArray(payload.styleErrors) ? payload.styleErrors : [],
      componentStyles: payload.componentStyles || {},
      route: payload.route || "/",
      base: typeof payload.base === "string" ? payload.base : "/",
      sectionTags: Array.isArray(payload.sectionTags) ? payload.sectionTags : [],
      context: String(payload.context || ""),
    };
    Object.keys(state.components).forEach(defineTag);
    // Typing not yet sent survives this render (see reconcileNode).
    var typing = !!editing && editing.textContent !== editingText;
    syncStyles();
    state.styleErrors.forEach(reportError);
    renderPage();
    viewportScrollbars = !siteStylesScrollbars();
    syncRootStyles(document);
    reportDefaultStyles();
    if (!hadError) emit("clear-error");
    var hadSelection = !!selected;
    // An edit may replace the selected element (a renamed heading, an undo):
    // the same position is selected again, unless the host asks for another.
    if (selected && !selected.isConnected) selected = (previous && previous.node && resolveNodePath(previous)) || null;
    // A replaced element (a renamed heading, an undo) stays typeable.
    var wasEditing = !!editing;
    if (editing && !editing.isConnected) editing = null;
    if (typeof payload.hash === "string" && payload.hash) scrollTarget = { id: payload.hash, until: Date.now() + 1500 };
    scrollToTarget();
    if (payload.selectNode) {
      var requested = resolveNodePath(payload.selectNode);
      if (requested) {
        selected = requested;
        if (requested.scrollIntoView) requested.scrollIntoView({ block: payload.selectNode.reveal === "center" ? revealBlock(requested) : "nearest" });
      }
    }
    if (wasEditing && !editing && selected) startEditing(selected);
    else if (editing && editing !== selected) stopEditing(false);
    else if (editing && !typing) { editingText = editing.textContent; editingHtml = editing.innerHTML; }
    lastInsertPoints = "";
    lastStructure = "";
    lastHover = null;
    updateBoxes();
    reportHover();
    if (selected) emitSelection(selected, "refresh");
    else if (hadSelection) emit("select", { path: "", tag: "", text: "", reason: "refresh", selectors: [] });
    // Text the host just formatted stays selected, so the next format applies to it too.
    if (selected && payload.selectText && typeof payload.selectText.start === "number") setTextSelection(selected, payload.selectText.start, payload.selectText.end);
    reportTextSelection(true);
    reportStructure();
    requestAnimationFrame(requestComponentStyles);
  }

  // A followed link's fragment (`/about/#contact`): the element with that id
  // is scrolled to the top once the page shows, and again while the layout
  // settles (component styles arrive in later renders), until the user
  // scrolls, clicks or types, or a moment has passed.
  var scrollTarget = null;
  function fragmentTarget(id) {
    var found = pageEl && pageEl.querySelector("[id=\"" + CSS.escape(id) + "\"]");
    if (found) return found;
    var roots = Array.from(shadowRoots);
    for (var i = 0; i < roots.length; i++) {
      var inner = roots[i].host.isConnected && roots[i].getElementById(id);
      if (inner) return inner;
    }
    return null;
  }
  function scrollToTarget() {
    if (!scrollTarget) return;
    if (Date.now() > scrollTarget.until) { scrollTarget = null; return; }
    var el = fragmentTarget(scrollTarget.id);
    if (el) el.scrollIntoView({ block: "start" });
  }
  ["wheel", "keydown", "mousedown", "touchstart"].forEach(function (type) {
    window.addEventListener(type, function () { scrollTarget = null; }, true);
  });

  function requestComponentStyles() {
    if (!state) return;
    var needed = [];
    Object.keys(state.components || {}).forEach(function (tag) {
      if (state.componentStyles && state.componentStyles[tag]) return;
      var found = Array.from(instances).some(function (el) { return el.localName === tag && el.isConnected; });
      if (found) needed.push(tag);
    });
    if (needed.length) emit("component-styles", { tags: needed });
  }

  function ensureBoxes() {
    if (hoverBox) return;
    function make(name) {
      var el = document.createElement("div");
      el.setAttribute("data-native-selection-box", name);
      el.style.position = "absolute";
      el.style.display = "none";
      el.style.pointerEvents = "none";
      el.style.zIndex = "2147483647";
      el.style.boxSizing = "border-box";
      document.documentElement.appendChild(el);
      return el;
    }
    hoverBox = make("hover");
    selectBox = make("selected");
    paintBoxes();
  }

  // The editor sends its focus color; boxes are drawn in it.
  function paintBoxes() {
    if (!hoverBox) return;
    selectBox.style.border = "2px solid " + boxColor;
    selectBox.style.background = "color-mix(in srgb, " + boxColor + " 10%, transparent)";
    hoverBox.style.border = "1px solid " + boxColor;
    hoverBox.style.background = "color-mix(in srgb, " + boxColor + " 4%, transparent)";
  }

  function drawBox(box, target) {
    if (!box) return;
    if (!target || !target.isConnected) {
      box.style.display = "none";
      return;
    }
    var rect = target.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      box.style.display = "none";
      return;
    }
    box.style.display = "block";
    box.style.left = rect.left + window.scrollX + "px";
    box.style.top = rect.top + window.scrollY + "px";
    box.style.width = rect.width + "px";
    box.style.height = rect.height + "px";
  }

  function updateBoxes(skipSlotGhosts) {
    ensureBoxes();
    drawBox(hoverBox, hovered);
    drawBox(selectBox, selected);
    canvasPaint();
    drawComponentBoxes();
    scheduleRect();
    schedulePins();
    scheduleItemGrids();
    if (!skipSlotGhosts) scheduleSlotGhosts();
  }

  // ---- Components (docs/page-builder/components.md) ----
  // Instances wear the editor's component accent: the hover and selection
  // boxes on an instance are drawn in it; an element inside an instance
  // (what the page slots in, or the template's own) shows that instance's
  // outline dashed around it; and while a component's template is open in
  // the editor (`component-focus`), every instance of it on the page shows
  // that dashed outline, since an edit there changes them all.
  var componentColor = "#8b3fd9";
  var contextBox = null;
  var focusTag = "";
  var focusBoxes = [];
  function isInstance(el) {
    return !!(el && state && el.localName && Object.prototype.hasOwnProperty.call(state.components, el.localName) && instances.has(el));
  }
  // The nearest instance `el` sits in: its light-DOM parent chain, then the host of its shadow root.
  function enclosingInstance(el) {
    for (var n = el && parentOrHost(el); n; n = parentOrHost(n)) if (isInstance(n)) return n;
    return null;
  }
  // The instance of `tag` the selection is, or sits in, so a template's
  // element is found in the instance the user was working on.
  function selectedInstanceOf(tag) {
    for (var n = selected && selected.isConnected ? selected : null; n; n = parentOrHost(n)) {
      if (n.localName === tag && n.shadowRoot && instances.has(n)) return n;
    }
    return null;
  }
  function componentBox(dashed) {
    var el = document.createElement("div");
    el.setAttribute("data-native-selection-box", dashed ? "instance" : "component");
    el.style.position = "absolute";
    el.style.display = "none";
    el.style.pointerEvents = "none";
    el.style.zIndex = "2147483646";
    el.style.boxSizing = "border-box";
    el.style.borderRadius = "2px";
    document.documentElement.appendChild(el);
    return el;
  }
  function tint(box, on, width, alpha) {
    var color = on ? componentColor : boxColor;
    var key = color + width + alpha;
    if (box.__tint === key) return;
    box.__tint = key;
    box.style.border = width + "px solid " + color;
    box.style.background = "color-mix(in srgb, " + color + " " + alpha + "%, transparent)";
  }
  function outline(box) {
    box.style.border = "1px dashed " + componentColor;
    box.style.background = "transparent";
  }
  function drawComponentBoxes() {
    if (!selectBox) return;
    tint(selectBox, isInstance(selected), 2, 10);
    tint(hoverBox, isInstance(hovered), 1, 4);
    if (!contextBox) contextBox = componentBox(true);
    outline(contextBox);
    var around = selected && selected.isConnected ? enclosingInstance(selected) : null;
    drawBox(contextBox, around);
    var shown = [];
    if (focusTag && pageEl) {
      Array.from(instances).forEach(function (el) {
        if (el.localName === focusTag && el.isConnected && el !== around && el !== selected) shown.push(el);
      });
    }
    while (focusBoxes.length < shown.length) focusBoxes.push(componentBox(true));
    focusBoxes.forEach(function (box, index) {
      outline(box);
      drawBox(box, shown[index] || null);
    });
  }

  // Places a section can be inserted: every gap between the children of a
  // page element (or the page root) that holds a <section> or a section
  // component, plus before the first and after the last child. Reported in
  // frame-viewport coordinates with the page element's index path, so the
  // editor can draw plus buttons over the frame and find the source position.
  function sectionLike(el) {
    return el.localName === "section" || (state && state.sectionTags.indexOf(el.localName) >= 0);
  }

  function itemLabel(el) {
    var heading = el.matches("h1,h2,h3,h4,h5,h6") ? el : el.querySelector("h1,h2,h3,h4,h5,h6");
    if (!heading && el.shadowRoot) heading = el.shadowRoot.querySelector("h1,h2,h3,h4,h5,h6");
    var text = ((heading || el).textContent || "").replace(/\s+/g, " ").trim();
    return (text || "<" + el.localName + ">").slice(0, 60);
  }

  function dropKids(el) {
    return Array.prototype.filter.call(el.children, function (child) { return !injectedStyle(child); });
  }
  function dropRect(el) {
    var r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  function dropHit(r, x, y) {
    return r && r.width > 0 && r.height > 0 && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;
  }
  function dropLayout(el) {
    var cs = getComputedStyle(el);
    // Computed tracks are resolved lengths; line names do not count as tracks.
    var tracks = cs.gridTemplateColumns.replace(/\[[^\]]*\]/g, "").trim();
    return { display: cs.display, cols: tracks && tracks !== "none" ? tracks.split(/\s+/).length : 0,
      dir: cs.flexDirection, wrap: cs.flexWrap };
  }
  function dropUnion(els) {
    var out = null;
    els.forEach(function (el) {
      var r;
      if (el.nodeType === 3) {
        var range = document.createRange();
        range.selectNodeContents(el);
        r = range.getBoundingClientRect();
      } else if (el.nodeType === 1) r = dropRect(el);
      if (!r || !r.width || !r.height) return;
      if (!out) out = { left: r.left, top: r.top, width: r.width, height: r.height };
      else {
        var right = Math.max(out.left + out.width, r.left + r.width);
        var bottom = Math.max(out.top + out.height, r.top + r.height);
        out.left = Math.min(out.left, r.left); out.top = Math.min(out.top, r.top);
        out.width = right - out.left; out.height = bottom - out.top;
      }
    });
    return out;
  }
  function dropSealed(el) {
    return el.localName.indexOf("-") >= 0 || ["template", "noscript", "xmp", "noembed", "noframes", "svg", "math"].indexOf(el.localName) >= 0;
  }
  function dropSlots(el) {
    return Array.prototype.map.call(el.shadowRoot.querySelectorAll("slot"), function (slot) {
      var name = slot.getAttribute("name") || "";
      var assigned = slot.assignedElements().filter(function (child) { return child.parentElement === el && !injectedStyle(child); });
      // An items slot: the unnamed one, or one whose fallback is a card component.
      var items = !name || Array.prototype.some.call(slot.children, function (child) { return child.localName.indexOf("card-") === 0; });
      var parentEl = slot.parentElement || el;
      var hidden = getComputedStyle(slot).display === "none" || parentEl.closest("[data-native-empty]");
      var own = dropUnion(assigned.length ? assigned : Array.prototype.slice.call(slot.childNodes));
      // An items slot covers its parent's box (an empty one still has an area); a parent without a box falls back to its items.
      var area = items ? dropRect(parentEl) : null;
      return { slot: slot, name: name, assigned: assigned, items: items, parent: parentEl,
        rect: hidden ? null : area && area.width && area.height ? area : own };
    });
  }
  function dropContainers(x, y, moving, bands) {
    if (!pageEl || !state) return [];
    var moved = Array.isArray(moving) ? walkNodePath(pageEl, moving) : null;
    function entry(el, kind, children, box, layoutEl, nodes, slot) {
      var all = dropKids(el);
      var out = { path: elementIndexPath(el), kind: kind, tag: el.localName, cls: el.getAttribute("class") || "",
        rect: box, count: all.length, children: children.map(function (child) {
          return { index: all.indexOf(child), rect: dropRect(child), tag: child.localName, cls: child.getAttribute("class") || "" };
        }),
        layout: dropLayout(layoutEl), empty: !children.length && !nodes.some(function (n) { return n.nodeType === 3 && n.textContent.trim(); }) };
      if (slot !== undefined) out.slot = slot;
      return out;
    }
    // Section probes need every page band even over the header or footer.
    // Keep the moved band too: insertion indices still refer to the source.
    if (bands === true) {
      var main = pageEl.querySelector("main");
      return main ? [entry(main, "main", dropKids(main), dropRect(main), main, Array.prototype.slice.call(main.childNodes))] : [];
    }
    // Only zero-size wrappers need a search below their own box.
    function under(el) {
      if (getComputedStyle(el).display === "none") return false;
      var r = dropRect(el);
      if (dropHit(r, x, y)) return true;
      if (r.width || r.height || el === moved) return false;
      if (dropSealed(el)) return !!el.shadowRoot && dropSlots(el).some(function (slot) { return dropHit(slot.rect, x, y); });
      return dropKids(el).some(under);
    }
    function walk(el, depth) {
      if (el === moved || depth > 100) return [];
      var chain = [];
      if (dropSealed(el)) {
        if (!el.shadowRoot) return chain;
        // Named text slots win over an items parent's larger area.
        var slots = dropSlots(el);
        var hit = slots.find(function (s) { return !s.items && dropHit(s.rect, x, y); }) ||
          slots.find(function (s) { return s.items && dropHit(s.rect, x, y); });
        if (!hit) return chain;
        chain.push(entry(el, hit.items ? "items" : "slot", hit.assigned, hit.rect, hit.parent,
          Array.prototype.slice.call(hit.slot.assignedNodes()), hit.name));
        if (!hit.items) return chain;
        var child = hit.assigned.find(under);
        return child ? walk(child, depth + 1).concat(chain) : chain;
      }
      var children = dropKids(el);
      if (el !== pageEl && ["main", "section", "div"].indexOf(el.localName) >= 0) {
        chain.push(entry(el, el.localName, children, dropRect(el), el, Array.prototype.slice.call(el.childNodes)));
      }
      var child = children.find(under);
      return child ? walk(child, depth + 1).concat(chain) : chain;
    }
    return walk(pageEl, 0);
  }

  function insertPoints() {
    var out = [];
    if (!pageEl || !state) return out;
    [pageEl].concat(Array.prototype.slice.call(pageEl.querySelectorAll("*"))).forEach(function (container) {
      var children = Array.prototype.slice.call(container.children);
      if (!children.some(sectionLike)) return;
      var parentPath = container === pageEl ? [] : elementIndexPath(container);
      if (!parentPath) return;
      var box = container.getBoundingClientRect();
      var rects = children.map(function (child) { return child.getBoundingClientRect(); });
      for (var i = 0; i <= children.length; i++) {
        var prev = rects[i - 1];
        var next = rects[i];
        // Centred over the neighbouring items, not the whole container.
        var left = Math.min(prev ? prev.left : Infinity, next ? next.left : Infinity);
        var right = Math.max(prev ? prev.right : -Infinity, next ? next.right : -Infinity);
        if (!(right > left)) { left = box.left; right = box.right; }
        out.push({
          parent: parentPath,
          index: i,
          top: prev && next ? (prev.bottom + next.top) / 2 : next ? next.top : prev.bottom,
          left: left,
          width: right - left,
          before: next ? itemLabel(children[i]) : "",
          tag: container === pageEl ? "" : container.localName
        });
      }
    });
    var main = sectionlessMain();
    var mainPath = main && elementIndexPath(main);
    if (mainPath) {
      var box = main.getBoundingClientRect();
      var last = main.lastElementChild;
      var rect = last && last.getBoundingClientRect();
      var wide = rect && rect.right > rect.left;
      out.push({
        parent: mainPath,
        index: main.children.length,
        // Just below the last child, not over it: the plus shows while the
        // pointer is anywhere in <main>, and must not cover what it clicks.
        top: rect ? rect.bottom + 13 : box.top,
        left: wide ? rect.left : box.left,
        width: wide ? rect.width : box.width,
        before: "",
        tag: "main",
        // Nothing in it at all: the editor shows its empty state over it.
        empty: main.children.length === 0 && !main.textContent.trim(),
        height: box.height
      });
    }
    return out;
  }

  // A page whose <main> holds no section yet (a heading-only page, a site
  // without sections) gets one place at the end of <main>, after its last
  // child, so sections can be added to it at all.
  function sectionlessMain() {
    var main = pageEl && pageEl.querySelector("main");
    return main && !Array.prototype.some.call(main.children, sectionLike) ? main : null;
  }

  // The item under the pointer among the children of a section-holding
  // element (sections themselves, from inside their shadow trees too), so the
  // editor shows only the plus buttons just above and below it. Anywhere in
  // a <main> without sections counts as its last item, so its one place (at
  // the end) shows.
  function hoveredItem() {
    if (!pageEl) return null;
    var main = sectionlessMain();
    var current = hovered;
    while (current && current !== pageEl) {
      if (current === main) {
        var mainPath = elementIndexPath(main);
        return mainPath ? { parent: mainPath, index: Math.max(main.children.length - 1, 0) } : null;
      }
      var parentNode = current.parentElement;
      if (!parentNode) {
        var root = current.getRootNode && current.getRootNode();
        current = root instanceof ShadowRoot ? root.host : null;
        continue;
      }
      if ((parentNode === pageEl || pageEl.contains(parentNode)) && Array.prototype.some.call(parentNode.children, sectionLike)) {
        var parentPath = parentNode === pageEl ? [] : elementIndexPath(parentNode);
        if (!parentPath) return null;
        return { parent: parentPath, index: Array.prototype.indexOf.call(parentNode.children, current) };
      }
      current = parentNode;
    }
    return null;
  }
  var lastHover = null;
  function reportHover() {
    var item = hoveredItem();
    var key = JSON.stringify(item);
    if (key === lastHover) return;
    lastHover = key;
    emit("section-hover", { item: item });
  }

  var insertFrame = 0;
  var lastInsertPoints = "";
  function scheduleInsertPoints() {
    if (insertFrame) return;
    insertFrame = requestAnimationFrame(function () {
      insertFrame = 0;
      var points = insertPoints();
      var key = JSON.stringify(points);
      if (key === lastInsertPoints) return;
      lastInsertPoints = key;
      emit("insert-points", { path: String(state && state.pagePaths[state.route] || ""), points: points });
    });
  }

  // ---- Repeated items (page builder: cards, docs/page-builder/cards.md) ----
  // A grid or list on the page: an element of the page (not the page root,
  // <main> or <body>) whose element children include at least two of one
  // kind: the same custom element, or the same tag and classes for an
  // article, li, div, figure, a, blockquote or dd. Sections are never items.
  // The same rule as src/page-builder/card-grid.ts. For the item under the
  // pointer and the one around the selection (through shadow roots to the
  // page's own item), the editor gets the grid (`item-grids`): the
  // container's index path, the item's index, its place and the count,
  // whether the items run in a row, and the frame-viewport box where one
  // more item would go, after the last one (beside it when there is room in
  // its row, else at the start of the next row, or below it in a column).
  var ITEM_TAGS = ["article", "li", "div", "figure", "a", "blockquote", "dd"];
  var NOT_GRIDS = ["html", "head", "body", "main"];
  function itemKindOf(el) {
    var tag = el.localName;
    if (sectionLike(el)) return null;
    if (tag.indexOf("-") > 0) return tag;
    if (ITEM_TAGS.indexOf(tag) < 0) return null;
    var classes = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).sort();
    return classes.length ? tag + "." + classes.join(".") : tag;
  }
  function repeatedItems(container) {
    if (!container || container === pageEl || NOT_GRIDS.indexOf(container.localName) >= 0) return null;
    var groups = {};
    var order = [];
    Array.prototype.forEach.call(container.children, function (child) {
      var kind = injectedStyle(child) ? null : itemKindOf(child);
      if (!kind) return;
      if (!groups[kind]) { groups[kind] = []; order.push(kind); }
      groups[kind].push(child);
    });
    var best = null;
    order.forEach(function (kind) {
      if (groups[kind].length >= 2 && (!best || groups[kind].length > best.length)) best = groups[kind];
    });
    return best;
  }
  function gridItemOf(el) {
    var current = el;
    // An item itself first (a card holding a grid of its own is still its grid's card); then
    // the grid itself (the gap between its items), which counts as its last item.
    var mine = el && el.parentElement && el.parentElement !== pageEl && pageEl && pageEl.contains(el.parentElement) ? repeatedItems(el.parentElement) : null;
    if (mine && mine.indexOf(el) >= 0) return { container: el.parentElement, item: el, items: mine };
    var own = el && el !== pageEl && pageEl && pageEl.contains(el) ? repeatedItems(el) : null;
    if (own) return { container: el, item: own[own.length - 1], items: own };
    while (pageEl && current && current !== pageEl) {
      var parentEl = current.parentElement;
      if (!parentEl) {
        var root = current.getRootNode && current.getRootNode();
        current = root instanceof ShadowRoot ? root.host : null;
        continue;
      }
      if (parentEl !== pageEl && pageEl.contains(parentEl)) {
        var items = repeatedItems(parentEl);
        if (items && items.indexOf(current) >= 0) return { container: parentEl, item: current, items: items };
      }
      current = parentEl;
    }
    return null;
  }
  function gridReport(found) {
    if (!found || !state) return null;
    var parentPath = elementIndexPath(found.container);
    var itemPath = elementIndexPath(found.item);
    if (!parentPath || !itemPath) return null;
    var rects = found.items.map(function (item) { return item.getBoundingClientRect(); });
    var last = rects[rects.length - 1];
    var box = found.container.getBoundingClientRect();
    var row = false;
    var gap = 0;
    var rowGap = -1;
    for (var i = 1; i < rects.length; i++) {
      if (Math.abs(rects[i].top - rects[i - 1].top) < 2 && rects[i].left > rects[i - 1].left) {
        row = true;
        gap = Math.max(0, rects[i].left - rects[i - 1].right);
      } else if (rowGap < 0 && rects[i].top > rects[i - 1].top) {
        rowGap = Math.max(0, rects[i].top - rects[i - 1].bottom);
      }
    }
    var ghost;
    var beside = row && last.right + gap + last.width <= box.right + 1;
    if (beside) {
      ghost = { left: last.right + gap, top: last.top, width: last.width, height: last.height };
    } else if (row) {
      ghost = { left: rects[0].left, top: last.bottom + (rowGap < 0 ? gap : rowGap), width: last.width, height: last.height };
    } else {
      ghost = { left: last.left, top: last.bottom + Math.max(rowGap, 8), width: last.width, height: Math.min(last.height, 120) };
    }
    var round = function (n) { return Math.round(n); };
    // Below the grid the ghost stops where the page's next content starts,
    // so it never covers it (the page itself never moves): it fills the room
    // there is, or, with less than a button's height, is a strip of that
    // height ending at the next content, over the bottom of the last row.
    // From the last item: the grid's own trailing children (a "View all"
    // link) count before what follows the grid.
    var next = beside ? null : nextContentTop(found.items[found.items.length - 1], last.bottom, ghost.left, ghost.left + ghost.width);
    if (next !== null && ghost.top + ghost.height > next) {
      // In whole pixels, ending at or above the next content; a box only
      // when taller than the strip, so a 32px ghost below is always a strip.
      var nextTop = Math.floor(next);
      var top = Math.round(ghost.top);
      ghost = nextTop - top > GHOST_STRIP
        ? { left: ghost.left, top: top, width: ghost.width, height: nextTop - top }
        : { left: ghost.left, top: nextTop - GHOST_STRIP, width: ghost.width, height: GHOST_STRIP };
    }
    return {
      path: String(state.pagePaths[state.route] || ""),
      parent: parentPath,
      index: itemPath[itemPath.length - 1],
      position: found.items.indexOf(found.item),
      count: found.items.length,
      row: row,
      beside: beside,
      ghost: { top: round(ghost.top), left: round(ghost.left), width: round(ghost.width), height: round(ghost.height) }
    };
  }
  // Where the page's next content below a grid starts: the highest top,
  // at or below `minTop`, of the rendered elements after `el` that share
  // some of the ghost's columns (`left`..`right`). It looks at `el`'s later
  // siblings, then its ancestors' later siblings; for a slotted element both
  // its own later siblings (in the same or other slots) and those after its
  // slot in the component's template, then after its host. A `display: contents` element counts by its children; fixed and
  // sticky elements, which float over the page, do not count. Frame-viewport
  // pixels; null when nothing follows.
  function nextContentTop(el, minTop, left, right) {
    var best = null;
    function consider(node, depth) {
      if (injectedStyle(node) || depth > 6) return;
      var style = getComputedStyle(node);
      if (style.display === "contents") {
        for (var child = node.firstElementChild; child; child = child.nextElementSibling) consider(child, depth + 1);
        return;
      }
      if (style.display === "none" || style.position === "fixed" || style.position === "sticky") return;
      var rect = node.getBoundingClientRect();
      if (rect.height <= 0 || rect.top < minTop - 1 || rect.right <= left || rect.left >= right) return;
      if (best === null || rect.top < best) best = rect.top;
    }
    var current = el;
    while (current && current !== pageEl) {
      for (var own = current.nextElementSibling; own; own = own.nextElementSibling) consider(own, 0);
      var from = current.assignedSlot || current;
      if (from !== current) for (var sib = from.nextElementSibling; sib; sib = sib.nextElementSibling) consider(sib, 0);
      var parentEl = from.parentElement;
      if (!parentEl) {
        var root = from.getRootNode && from.getRootNode();
        parentEl = root instanceof ShadowRoot ? root.host : null;
      }
      current = parentEl;
    }
    return best;
  }
  var GHOST_STRIP = 32;
  var trackedGrid = null;
  var recentGrid = null;
  var gridFrame = 0;
  var lastGrids = "";
  function scheduleItemGrids() {
    if (gridFrame || !state) return;
    gridFrame = requestAnimationFrame(function () {
      gridFrame = 0;
      var underPointer = hovered && hovered.isConnected ? gridItemOf(hovered) : null;
      if (underPointer) recentGrid = underPointer;
      if (trackedGrid && (!trackedGrid.container.isConnected || !pageEl.contains(trackedGrid.container))) trackedGrid = null;
      var report = {
        hover: gridReport(trackedGrid || underPointer),
        selected: gridReport(selected && selected.isConnected ? gridItemOf(selected) : null)
      };
      // A new render has a new context: its report goes out even when it is the same.
      var key = String(state && state.context) + JSON.stringify(report);
      if (key === lastGrids) return;
      lastGrids = key;
      emit("item-grids", report);
    });
  }
  document.addEventListener("pointerdown", function () {
    if (!trackedGrid) return;
    trackedGrid = null;
    scheduleItemGrids();
  }, true);
  // ---- End of repeated items ----

  // The page's own elements as a tree of index paths, for the editor's page
  // structure sidebar: the light DOM under the page root, not the inside of
  // component shadow roots (those belong to the template, not the page).
  // Each item carries its tag, a snippet of its own text, and the text of
  // the first heading within it (into a component's shadow root too).
  function structureItems(container, depth) {
    var out = [];
    if (depth > 12) return out;
    var children = Array.prototype.slice.call(container.children);
    for (var i = 0; i < children.length && out.length < 500; i++) {
      var child = children[i];
      if (injectedStyle(child)) continue;
      var path = elementIndexPath(child);
      if (!path) continue;
      var heading = ownHeading(child);
      out.push({
        tag: child.localName,
        node: path,
        text: textWithBreaks(child).replace(/\s+/g, " ").trim().slice(0, 80),
        heading: heading ? slotAwareText(heading).replace(/\s+/g, " ").trim().slice(0, 80) : "",
        slot: child.getAttribute("slot") || "",
        children: textRun(child) ? [] : structureItems(child, depth + 1)
      });
    }
    return out;
  }
  // A line of text with inline formatting in it (a paragraph with a bold
  // word or a link): one row, summarised by all its text, with no rows for
  // the formatting inside. A text element holding only formatting counts,
  // and so does any element with text of its own beside it; a block of two
  // button links does not.
  var TEXT_RUN = /^(h[1-6]|p|li|button|blockquote|figcaption|dt|dd|summary|legend|caption|label|td|th|a|strong|em|b|i|small|cite|q|mark|code)$/;
  function textRun(el) {
    if (!el.children.length) return false;
    var all = el.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      if (!INLINE_TAGS.test(all[i].localName) || all[i].hasAttribute("slot")) return false;
    }
    if (TEXT_RUN.test(el.localName)) return true;
    return Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType === 3 && Boolean(n.textContent.trim()); });
  }
  // The heading that names a container: the first one inside it that no
  // nested section, article or other landmark claims first (so <main> is not
  // named by its first section's heading). For a component instance, the
  // first heading at the top of its template. A section component instance
  // (<section-hero>) is a section too, so the heading it holds names it and
  // not the <main> around it.
  var SECTIONING = "section,article,main,header,footer,nav,aside";
  function sectioningAncestor(n) {
    for (var p = n.parentElement; p; p = p.parentElement) if (p.matches(SECTIONING) || sectionLike(p)) return p;
    return null;
  }
  function ownHeading(el) {
    if (el.matches("h1,h2,h3,h4,h5,h6")) return null;
    var list = el.querySelectorAll("h1,h2,h3,h4,h5,h6");
    for (var i = 0; i < list.length; i++) {
      var owner = sectioningAncestor(list[i]);
      if (owner === el || !el.contains(owner)) return list[i];
    }
    if (!el.shadowRoot) return null;
    var inner = el.shadowRoot.querySelectorAll("h1,h2,h3,h4,h5,h6");
    for (var j = 0; j < inner.length; j++) {
      var root = inner[j].closest(SECTIONING);
      if (!root || root.parentNode === el.shadowRoot) return inner[j];
    }
    return null;
  }
  // Text as shown: a slot reads as what the page assigned it, else its fallback.
  function slotAwareText(n) {
    if (n.nodeType === 3) return n.nodeValue || "";
    if (n instanceof HTMLSlotElement) {
      var assigned = n.assignedNodes({ flatten: true });
      if (assigned.length) return assigned.map(slotAwareText).join("");
    }
    var out = "";
    for (var c = n.firstChild; c; c = c.nextSibling) out += slotAwareText(c);
    return out;
  }
  var lastStructure = "";
  function reportStructure() {
    if (!pageEl || !state) return;
    var items = structureItems(pageEl, 0);
    var path = String(state.pagePaths[state.route] || "");
    var key = path + "\n" + JSON.stringify(items);
    if (key === lastStructure) return;
    lastStructure = key;
    emit("structure", { path: path, items: items });
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
  }

  // How far down the page's own sticky or fixed top bar (a site header)
  // covers the viewport, so the editor's edit bar can stand clear of it.
  // Only what touches the top edge counts: a few points just under it are
  // probed (through component shadow roots) and their ancestors climbed to
  // the first sticky/fixed one, which counts only when shaped like a header. The selected element's own bar, or one
  // inside it, is not an obstacle. 0 when nothing covers the top.
  function topInset(el) {
    var width = document.documentElement.clientWidth;
    var height = window.innerHeight;
    var inset = 0;
    [0.1, 0.5, 0.9].forEach(function (fraction) {
      var x = width * fraction;
      var hit = document.elementFromPoint(x, 1);
      while (hit && hit.shadowRoot) {
        var inner = hit.shadowRoot.elementFromPoint(x, 1);
        if (!inner || inner === hit) break;
        hit = inner;
      }
      for (var at = hit; at && at !== document.body && at !== document.documentElement; at = at.parentElement || (at.parentNode && at.parentNode.host)) {
        var position = getComputedStyle(at).position;
        if (position !== "sticky" && position !== "fixed") continue;
        var box = at.getBoundingClientRect();
        // Only a header-like bar counts: at least half the width and at most
        // 40% of the height. A full-height sidebar or a full-screen layer
        // touching the top is not a header and would push the bar down.
        var headerLike = box.width >= width * 0.5 && box.height <= height * 0.4;
        if (headerLike && box.top <= 1 && at !== el && !composedContains(at, el) && !composedContains(el, at)) inset = Math.max(inset, box.bottom);
        break;
      }
    });
    return Math.max(0, Math.min(height, inset));
  }
  function composedContains(outer, inner) {
    for (var at = inner; at; at = at.parentElement || (at.parentNode && at.parentNode.host)) if (at === outer) return true;
    return false;
  }
  // The selected element's rectangle, with the top inset the bar keeps clear of.
  function selectionRectOf(el) {
    var rect = rectOf(el);
    rect.inset = topInset(el);
    return rect;
  }

  // The selected element's frame-viewport rectangle, sent when it may have
  // moved (scroll, resize, render) and only when it actually changed.
  var rectFrame = 0;
  var lastRect = "";
  function scheduleRect() {
    if (rectFrame) return;
    rectFrame = requestAnimationFrame(function () {
      rectFrame = 0;
      if (!selected || !selected.isConnected) { lastRect = ""; return; }
      var rect = selectionRectOf(selected);
      var key = JSON.stringify(rect);
      if (key === lastRect) return;
      lastRect = key;
      emit("selection-rect", { rect: rect });
    });
  }

  // A CSS selector that matches `el` alone among the elements of its root
  // (the page, or the component instance's shadow root): its id when that is
  // unique, else tag names with :nth-of-type from it upwards until one is.
  function uniqueSelector(el) {
    var root = el.getRootNode();
    var scope = root instanceof ShadowRoot ? root : pageEl;
    function unique(selector) {
      try { return scope.querySelectorAll(selector).length === 1; } catch (_) { return false; }
    }
    var parts = [];
    for (var current = el; current instanceof Element && current !== pageEl; current = current.parentElement) {
      if (current.id && unique("#" + CSS.escape(current.id))) {
        parts.unshift("#" + CSS.escape(current.id));
        break;
      }
      var part = current.localName;
      var siblings = current.parentNode ? current.parentNode.children : [];
      var same = 0, index = 0;
      for (var i = 0; i < siblings.length; i++) {
        if (siblings[i].localName !== current.localName) continue;
        same++;
        if (siblings[i] === current) index = same;
      }
      if (same > 1) part += ":nth-of-type(" + index + ")";
      parts.unshift(part);
      if (unique(parts.join(" > "))) break;
    }
    return parts.join(" > ");
  }

  // Where an element sits for an agent: its selector, and for one inside a
  // component's template the instance it renders in.
  function elementLocator(el) {
    var out = { selector: uniqueSelector(el) };
    var root = el.getRootNode();
    if (root instanceof ShadowRoot && root.host) {
      out.host = { tag: root.host.localName, selector: uniqueSelector(root.host) };
      // Where the instance itself is written, so the editor can select it.
      var hostNode = elementIndexPath(root.host);
      if (hostNode) {
        out.host.path = ownerPath(root.host);
        out.host.node = hostNode;
      }
    }
    return out;
  }

  // Pins: the editor's markers on the elements of requests to agents
  // (src/components/agent-pins.ts). Each is found by its element-child path
  // in its file, else by its selector, in the instance `host` names for a
  // component's template; the editor draws them over the frame from the
  // frame-viewport rectangles sent here (null: not on the page shown).
  var pins = [];
  var pinFrame = 0;
  var lastPins = "";
  function walkNodePath(root, node) {
    var el = root;
    for (var i = 0; i < node.length; i++) {
      var wanted = node[i];
      var child = el.firstElementChild;
      var seen = 0;
      while (child && (injectedStyle(child) || seen++ < wanted)) child = child.nextElementSibling;
      if (!child) return null;
      el = child;
    }
    return el instanceof Element && el !== root ? el : null;
  }
  function locatePin(pin) {
    if (!state || !pageEl || pin.route !== state.route) return null;
    var root = null;
    if (pin.host && pin.host.tag) {
      var host = null;
      eachRendered(pageEl, function (el) {
        if (!host && el.localName === pin.host.tag && el.shadowRoot && safeMatches(el, pin.host.selector)) host = el;
      });
      root = host && host.shadowRoot;
    } else if (state.pagePaths[state.route] === pin.path) root = pageEl;
    if (!root) return null;
    var el = Array.isArray(pin.node) ? walkNodePath(root, pin.node) : null;
    if (el && pin.tag && el.localName !== pin.tag) el = null;
    if (!el && pin.selector) {
      try { el = root.querySelector(pin.selector); } catch (_) { el = null; }
    }
    return el;
  }
  function schedulePins() {
    if (pinFrame || !pins.length && !lastPins) return;
    pinFrame = requestAnimationFrame(function () {
      pinFrame = 0;
      var rects = pins.map(function (pin) {
        var el = locatePin(pin);
        var rect = el && el.isConnected ? rectOf(el) : null;
        return { id: pin.id, rect: rect && (rect.width || rect.height) ? rect : null };
      });
      var key = JSON.stringify(rects);
      if (key === lastPins) return;
      lastPins = key;
      emit("pin-rects", { rects: rects });
    });
  }

  // The element at `node` (element-child indexes) under the page root or under the shadow root of the component
  // whose template is `path`, preferring the currently selected instance.
  // A just-added element is centred; one taller than the view shows from its top
  // (the page's scroll-padding keeps it clear of a sticky header).
  function revealBlock(el) {
    var box = el.getBoundingClientRect && el.getBoundingClientRect();
    return box && box.height > window.innerHeight * 0.8 ? "start" : "center";
  }

  function resolveNodePath(request) {
    if (!state || !request || !Array.isArray(request.node)) return null;
    var path = String(request.path || "");
    var root = null;

    if (state.pagePaths[state.route] === path) root = pageEl;
    else {
      var tag = Object.keys(state.componentPaths || {}).find(function (t) { return state.componentPaths[t] === path; });
      if (!tag) return null;
      var current = selected && selected.getRootNode && selected.getRootNode();
      if (current instanceof ShadowRoot && current.host && current.host.localName === tag) root = current;
      else {
        var host = selectedInstanceOf(tag) || Array.from(instances).find(function (el) { return el.localName === tag && el.isConnected && el.shadowRoot; });
        root = host ? host.shadowRoot : null;
      }
    }
    if (!root) return null;
    var el = root;
    for (var i = 0; i < request.node.length; i++) {
      var wanted = request.node[i];
      var child = el.firstElementChild;
      var seen = 0;
      while (child && (injectedStyle(child) || seen++ < wanted)) child = child.nextElementSibling;
      if (!child) return null;
      el = child;
    }
    return el instanceof Element && el !== root ? el : null;
  }

  function deepestElement(e, forHover) {
    var path = typeof e.composedPath === "function" ? e.composedPath() : [];
    return deepestElementFromPath(path, e.target, forHover);
  }

  function templateLocked(el) {
    if (!state) return false;
    var root = el.getRootNode && el.getRootNode();
    return root instanceof ShadowRoot && ownerPath(el) !== state.editableTemplatePath;
  }

  function deepestElementFromPath(path, target, forHover) {
    var from = 0;
    // Text is never an event's target: a press on text lands on the element
    // that shows it, which for text a slot shows is the slot. Text the page
    // assigned to the slot belongs to the element it sits in on the page (a
    // <card-note> holding plain text), not to the template around the slot;
    // a slot's own fallback text belongs to the slot's parent in the template.
    if (path[0] instanceof HTMLSlotElement) {
      var slot = path[0];
      var holder = slot.assignedNodes().length
        ? slot.getRootNode().host
        : slot.parentNode instanceof Element ? slot.parentNode : null;
      var at = holder ? path.indexOf(holder) : -1;
      if (at > 0) from = at;
    }
    for (var i = from; i < path.length; i++) {
      var n = path[i];
      // A slot is how a template shows text, not an element of its own: its parent is the target.
      if (n instanceof HTMLSlotElement) continue;
      // Hovering on a page, a component's template is not the page's to pick
      // apart: its own elements (wrappers, fallbacks) point at the instance,
      // as a click on them selects it. Only the template open for editing
      // shows its elements.
      if (forHover && n instanceof Element && templateLocked(n)) continue;
      // A section component's root <section> is the instance on the page: the
      // page stays open, and Remove takes the instance out of this page alone.
      if (n instanceof Element && n.parentNode instanceof ShadowRoot && sectionLike(n.parentNode.host) && n.parentNode.host.localName !== "section") return n.parentNode.host;
      if (n instanceof Element && n !== document.documentElement && n !== document.body && !n.hasAttribute("data-native-selection-box")) return n;
    }
    return target instanceof Element ? target : null;
  }

  // Scrolling changes the element under an unmoved pointer. Reuse the same
  // slot and component-root mapping as mouse movement.
  function refreshPointerHover() {
    if (!hoverPointer || sectionDrag || editing) return;
    var target = document.elementFromPoint(hoverPointer.x, hoverPointer.y);
    var inner;
    while (target && target.shadowRoot && typeof target.shadowRoot.elementFromPoint === "function" &&
           (inner = target.shadowRoot.elementFromPoint(hoverPointer.x, hoverPointer.y)) && inner !== target) target = inner;
    var path = [];
    for (var node = target; node; node = node.assignedSlot || node.parentNode || (node instanceof ShadowRoot ? node.host : null)) path.push(node);
    hovered = deepestElementFromPath(path, target, true);
    reportHover();
  }

  function ownerPath(el) {
    if (!state || !el) return "";
    var root = el.getRootNode && el.getRootNode();
    if (root instanceof ShadowRoot) {
      var tag = root.host && root.host.localName;
      return String(state.componentPaths && state.componentPaths[tag] || "");
    }
    return String(state.pagePaths && state.pagePaths[state.route] || "");
  }

  function applicableSheet(sheet, root) {
    try {
      var owner = sheet.ownerNode;
      if (!(owner instanceof HTMLStyleElement)) return false;
      if (root === document) return owner.getRootNode && owner.getRootNode() === document;
      return owner.getRootNode && owner.getRootNode() === root;
    } catch (_) {
      return false;
    }
  }

  // The stylesheets that apply within `root`, in cascade order: its own
  // <style> elements, then the sheets it adopted.
  function sheetsIn(root) {
    var out = [];
    var own = root && root.styleSheets ? root.styleSheets : document.styleSheets;
    for (var s = 0; s < own.length; s++) if (applicableSheet(own[s], root)) out.push(own[s]);
    var adopted = (root && root.adoptedStyleSheets) || [];
    for (var a = 0; a < adopted.length; a++) out.push(adopted[a]);
    return out;
  }

  // The source path a sheet came from: a constructed shared or component
  // sheet, or a <style> element the runtime tagged.
  function sheetPath(sheet) {
    if (!sheet) return "";
    if (sheetInfo.has(sheet)) return sheetInfo.get(sheet).path;
    var owner = sheet.ownerNode;
    return owner && owner.getAttribute ? owner.getAttribute("data-native-css-path") || "" : "";
  }

  // The cascade behind an element, read from the CSSOM for the editor's
  // Source editor rule chips, which resolve it (shared/cascade.ts). For every style rule
  // that matches: its file and rule index there (to map it back to source),
  // its tree context, the layers around it, the conditions it sits behind,
  // its order of appearance and its declarations; per tree, the layer order
  // the browser resolved; and, with `probe`, the element's computed value of
  // every declared property and what each declaration computes to on it.
  //
  // Contexts: 0 is the element's own tree (the document, or the shadow root
  // it sits in), with its `style` attribute; then, for a slotted element, the
  // shadow tree of each slot in its slot chain (`::slotted()` rules); last,
  // for a host, its own shadow root (`:host` rules). Lower is outer.
  //
  // Conditions: `@media` and `@supports` are evaluated; `@starting-style`
  // never applies to the element at rest; `@scope` is evaluated from its
  // root and limit (proximity is not); `@container` cannot be evaluated from
  // the CSSOM, so its rules count as possibly applying and the computed
  // check settles them. Rules that match only in a user-action state
  // (`:hover`, `:focus` …) are collected as state rules, whether or not the
  // state holds right now.
  var USER_ACTION = /:(?:hover|active|focus-visible|focus-within|focus)(?![\w-])/g;
  var MAX_RULES = 300;
  var MAX_DECLARATIONS = 200;
  var MAX_PROBES = 400;
  var anonymousLayers = new WeakMap();
  var anonymousCount = 0;

  function isRule(rule, name) {
    return typeof window[name] !== "undefined" && rule instanceof window[name];
  }

  function safeMatches(el, selector) {
    try { return el.matches(selector); } catch (_) { return false; }
  }

  function splitSelectorList(selector) {
    var out = [], start = 0, depth = 0, quote = "";
    for (var i = 0; i <= selector.length; i++) {
      var char = selector[i] || ",";
      if (quote) {
        if (char === quote && selector[i - 1] !== "\\") quote = "";
      } else if (char === "'" || char === "\"") quote = char;
      else if (char === "(" || char === "[") depth++;
      else if ((char === ")" || char === "]") && depth) depth--;
      else if (char === "," && depth === 0) {
        var part = selector.slice(start, i).trim();
        if (part) out.push(part);
        start = i + 1;
      }
    }
    return out;
  }

  // Index of the ")" closing the "(" at `open`.
  function closingParen(text, open) {
    var depth = 0;
    for (var i = open; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) return i;
    }
    return -1;
  }

  // The file a tree's own <style> elements belong to.
  function rootPath(root) {
    if (!state) return "";
    if (root instanceof ShadowRoot) return String(state.componentPaths && state.componentPaths[root.host.localName] || "");
    return String(state.pagePaths && state.pagePaths[state.route] || "");
  }

  function parentOrHost(n) {
    if (n.parentElement) return n.parentElement;
    var root = n.getRootNode && n.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }

  // `<prefix>::slotted(<argument>)`: the slot matches the prefix, the element the argument.
  function slottedMatch(el, slot, part) {
    var at = part.indexOf("::slotted(");
    if (at < 0) return false;
    var close = closingParen(part, at + 9);
    if (close < 0 || part.slice(close + 1).trim()) return false;
    var prefix = part.slice(0, at);
    if (!prefix || /[\s>+~]$/.test(prefix)) prefix += "*";
    return safeMatches(slot, prefix) && safeMatches(el, part.slice(at + 10, close));
  }

  // `:host`, `:host(<selector>)` or `:host-context(<selector>)` on its own:
  // the host is featureless, so nothing may follow.
  function hostMatch(el, part) {
    var head = /^:host(-context)?/.exec(part);
    if (!head) return false;
    var rest = part.slice(head[0].length), argument = null;
    if (rest[0] === "(") {
      var close = closingParen(rest, 0);
      if (close < 0) return false;
      argument = rest.slice(1, close);
      rest = rest.slice(close + 1);
    }
    if (rest.trim()) return false;
    if (!head[1]) return argument === null || safeMatches(el, argument);
    if (argument === null) return false;
    for (var n = el; n; n = parentOrHost(n)) if (safeMatches(n, argument)) return true;
    return false;
  }

  // An `@scope (start) to (end)` applies below the nearest element matching
  // `start` (the element included) down to, not including, one matching
  // `end`. Without a start, the scope is the owning <style>'s parent.
  function scopeActive(el, scope) {
    if (!scope.start) return !scope.parent || scope.parent.contains(el);
    var root = el;
    while (root && !safeMatches(root, scope.start)) root = root.parentElement;
    if (!root) return false;
    if (!scope.end) return true;
    for (var n = el; n && n !== root; n = n.parentElement) if (safeMatches(n, scope.end)) return false;
    return true;
  }

  // A selector inside `@scope`: `:scope` and `&` are the scoping root, and a
  // selector with neither is relative to it.
  function scopedSelector(part, scope) {
    var root = scope.start ? ":is(" + scope.start + ")" : "*";
    return /:scope(?![\w-])|&/.test(part) ? part.replace(/:scope(?![\w-])|&/g, root) : root + " " + part;
  }

  // Longhands a shorthand sets, as the CSSOM expands it.
  var longhandCache = {};
  function longhandsOf(name) {
    if (!Object.prototype.hasOwnProperty.call(longhandCache, name)) {
      var style = document.createElement("div").style;
      try { style.setProperty(name, "inherit"); } catch (_) {}
      longhandCache[name] = Array.prototype.slice.call(style);
    }
    return longhandCache[name];
  }

  // A declaration block's longhands, custom properties included. A shorthand
  // written with var() leaves its longhands without a value of their own:
  // they carry the shorthand and its value instead.
  function readDeclarations(style) {
    var out = [], shorthands = null;
    for (var i = 0; i < style.length && out.length < MAX_DECLARATIONS; i++) {
      var property = style[i];
      var item = {
        property: property,
        value: style.getPropertyValue(property),
        important: style.getPropertyPriority(property) === "important"
      };
      if (!item.value && property.indexOf("--") !== 0) {
        if (!shorthands) {
          shorthands = {};
          (style.cssText.match(/(?:^|;)\s*[a-z][\w-]*(?=\s*:)/gi) || []).forEach(function (found) {
            var name = found.replace(/^;?\s*/, "").toLowerCase();
            longhandsOf(name).forEach(function (longhand) {
              if (longhand !== name && !shorthands[longhand]) shorthands[longhand] = name;
            });
          });
        }
        var shorthand = shorthands[property];
        if (shorthand) {
          item.shorthand = shorthand;
          item.value = style.getPropertyValue(shorthand);
          item.important = style.getPropertyPriority(shorthand) === "important";
        }
      }
      out.push(item);
    }
    return out;
  }

  function collectRules(root, context, kind, el, slot, into) {
    var fallback = rootPath(root);
    var counts = {};
    var layers = into.layers[context] = [];
    var registered = {};
    function register(path) {
      for (var i = 1; i <= path.length; i++) {
        var key = path.slice(0, i).join("\n");
        if (registered[key]) continue;
        registered[key] = true;
        layers.push(path.slice(0, i));
      }
    }
    function child(ctx, changes) {
      return Object.assign({}, ctx, changes);
    }
    function test(part, ctx) {
      if (kind === "slotted") return slottedMatch(el, slot, part);
      if (kind === "host") return hostMatch(el, part);
      if (ctx.scope) return safeMatches(el, scopedSelector(part, ctx.scope));
      return safeMatches(el, part);
    }
    // The rule's matching parts: `selector` as written (for display and the
    // source lookup) and `match` resolved (for specificity). Parts that match
    // at rest win over ones that match only in a user-action state.
    function matchRule(parts, resolved, ctx) {
      var normal = null, stateful = null, states = [], current = false;
      resolved.forEach(function (part, n) {
        var match = ctx.scope ? part.replace(/&/g, ":is(" + (ctx.scope.start || ":scope") + ")") : part;
        var found = part.match(USER_ACTION);
        if (!found) {
          if (!test(part, ctx)) return;
          if (!normal) normal = { selector: parts[n], match: [] };
          normal.match.push(match);
          return;
        }
        var now = test(part, ctx);
        if (!now && !test(part.replace(USER_ACTION, ":is(*)"), ctx)) return;
        if (!stateful) stateful = { selector: parts[n], match: [] };
        stateful.match.push(match);
        current = current || now;
        found.forEach(function (name) { if (states.indexOf(name) < 0) states.push(name); });
      });
      if (normal) return normal;
      if (!stateful) return null;
      stateful.state = states;
      stateful.current = current;
      return stateful;
    }
    function entryFor(found, ctx, declarations) {
      var entry = {
        path: ctx.path,
        selector: found.selector,
        match: found.match,
        kind: kind,
        context: context,
        layer: ctx.layer,
        layerName: ctx.names.join("."),
        conditions: ctx.conditions,
        order: into.order++,
        declarations: declarations
      };
      if (found.ruleIndex !== undefined) entry.ruleIndex = found.ruleIndex;
      if (ctx.importer) entry.importer = ctx.importer;
      if (ctx.possible) entry.possible = true;
      if (found.state) {
        entry.state = found.state;
        entry.current = found.current;
      }
      return entry;
    }
    function walk(list, ctx) {
      for (var i = 0; i < list.length; i++) {
        var rule = list[i];
        if (isRule(rule, "CSSStyleRule")) {
          var index = counts[ctx.path] || 0;
          counts[ctx.path] = index + 1;
          var parts = splitSelectorList(rule.selectorText);
          // A nested rule's `&` is its parent's selector list, as `:is()`.
          var resolved = parts.map(function (part) { return ctx.parent ? part.replace(/&/g, ":is(" + ctx.parent + ")") : part; });
          var found = ctx.active ? matchRule(parts, resolved, ctx) : null;
          if (found) {
            found.ruleIndex = index;
            into.rules.push(entryFor(found, ctx, readDeclarations(rule.style)));
          } else into.order++;
          if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules, child(ctx, { parent: resolved.join(", "), found: found }));
        } else if (isRule(rule, "CSSNestedDeclarations")) {
          // Declarations after a nested rule: the parent's, later in order.
          if (ctx.found && ctx.active) into.rules.push(entryFor(ctx.found, ctx, readDeclarations(rule.style)));
        } else if (isRule(rule, "CSSLayerBlockRule")) {
          var layer = ctx.layer.concat(rule.name ? rule.name.split(".") : ["#anonymous-" + anonymousId(rule)]);
          if (ctx.registers) register(layer);
          walk(rule.cssRules, child(ctx, { layer: layer, names: ctx.names.concat(rule.name || "anonymous") }));
        } else if (isRule(rule, "CSSLayerStatementRule")) {
          if (ctx.registers) Array.prototype.forEach.call(rule.nameList, function (name) { register(ctx.layer.concat(name.split("."))); });
        } else if (isRule(rule, "CSSMediaRule") || isRule(rule, "CSSSupportsRule")) {
          var media = isRule(rule, "CSSMediaRule");
          var text = rule.conditionText || "";
          var on = true;
          try { on = !text || (media ? matchMedia(text).matches : CSS.supports(text)); } catch (_) {}
          walk(rule.cssRules, child(ctx, {
            active: ctx.active && on,
            registers: ctx.registers && on,
            conditions: ctx.conditions.concat((media ? "@media " : "@supports ") + text)
          }));
        } else if (isRule(rule, "CSSContainerRule")) {
          walk(rule.cssRules, child(ctx, { possible: true, conditions: ctx.conditions.concat("@container " + (rule.conditionText || "")) }));
        } else if (isRule(rule, "CSSScopeRule")) {
          var scope = { start: rule.start || "", end: rule.end || "", parent: ctx.owner && ctx.owner.parentElement };
          walk(rule.cssRules, child(ctx, {
            scope: scope,
            parent: null,
            active: ctx.active && kind === "rule" && scopeActive(el, scope),
            conditions: ctx.conditions.concat("@scope" + (scope.start ? " (" + scope.start + ")" : "") + (scope.end ? " to (" + scope.end + ")" : ""))
          }));
        } else if (isRule(rule, "CSSStartingStyleRule")) {
          walk(rule.cssRules, child(ctx, { active: false }));
        }
      }
    }
    sheetsIn(root).forEach(function (sheet) {
      if (sheet === runtimeSheet || sheet === viewportScrollbarSheet) return;
      var info = sheetInfo.get(sheet);
      var path = info ? info.path : sheetPath(sheet) || fallback;
      // Rules count per source file. A constructed sheet holds one whole file
      // (an imported file may be expanded more than once), so its count
      // starts over; a page's <style> elements share the page's count.
      if (info) counts[path] = 0;
      var rules;
      try { rules = sheet.cssRules; } catch (_) { return; }
      walk(rules, {
        path: path, importer: info && info.importer || "", owner: sheet.ownerNode || null,
        active: true, registers: true, possible: false,
        layer: [], names: [], conditions: [], parent: null, found: null, scope: null
      });
    });
  }

  function anonymousId(rule) {
    if (!anonymousLayers.has(rule)) anonymousLayers.set(rule, ++anonymousCount);
    return anonymousLayers.get(rule);
  }

  // The element's computed value of every declared property, and on each
  // declaration what it computes to on the element: the declaration is set
  // as `!important` in the element's style attribute (which beats every
  // author rule), read back, and the attribute restored. Transitions are off
  // while probing, and the element settles on its own values before the
  // attribute comes back, so no probe value ever animates. (A transition-*
  // declaration's own probe is the exception: it wins over the switch.)
  function probeDeclarations(el, rules) {
    var style = getComputedStyle(el);
    var computed = {};
    var before = el.getAttribute("style");
    var still = (before ? before + ";" : "") + "transition:none !important;";
    var cache = {}, count = 0;
    // The element's values, with a transition under way (a hover fading in)
    // already at its end; the transition properties themselves before that.
    var read = function (transitions) {
      rules.forEach(function (rule) {
        rule.declarations.forEach(function (item) {
          if ((item.property.indexOf("transition") === 0) !== transitions) return;
          if (!Object.prototype.hasOwnProperty.call(computed, item.property)) computed[item.property] = style.getPropertyValue(item.property);
        });
      });
    };
    read(true);
    try {
      el.setAttribute("style", still);
      read(false);
      rules.forEach(function (rule) {
        rule.declarations.forEach(function (item) {
          if (!item.value) return;
          var name = item.shorthand || item.property;
          var key = name + "\n" + item.value + "\n" + item.property;
          if (!Object.prototype.hasOwnProperty.call(cache, key)) {
            if (count++ >= MAX_PROBES) return;
            el.setAttribute("style", still + name + ":" + item.value + " !important");
            cache[key] = style.getPropertyValue(item.property);
          }
          item.computed = cache[key];
        });
      });
      el.setAttribute("style", still);
      style.getPropertyValue("color");
    } finally {
      if (before === null) el.removeAttribute("style");
      else el.setAttribute("style", before);
    }
    return computed;
  }

  function matchingRules(el, probe) {
    var into = { rules: [], layers: {}, order: 0 };
    var root = el.getRootNode && el.getRootNode();
    collectRules(root instanceof ShadowRoot ? root : document, 0, "rule", el, null, into);
    if (el.getAttribute("style")) {
      into.rules.push({
        path: ownerPath(el), selector: "style", match: [], kind: "inline", context: 0, layer: [], layerName: "",
        conditions: [], order: into.order++, declarations: readDeclarations(el.style)
      });
    }
    var context = 1;
    for (var slot = el.assignedSlot; slot && context < 20; slot = slot.assignedSlot) {
      var slotRoot = slot.getRootNode();
      if (slotRoot instanceof ShadowRoot) collectRules(slotRoot, context++, "slotted", el, slot, into);
    }
    if (el.shadowRoot) collectRules(el.shadowRoot, context, "host", el, null, into);
    var out = { rules: into.rules.slice(0, MAX_RULES), layers: into.layers };
    if (probe) out.computed = probeDeclarations(el, out.rules);
    return out;
  }

  // The rules for the page's <body>, for the stylesheet the editor opens
  // beside a page when nothing is selected; sent when they change.
  var lastDefaultStyles = "";
  function reportDefaultStyles() {
    if (!state || !document.body) return;
    var cascade = matchingRules(document.body, false);
    var payload = { selectors: cascade.rules, cascade: { layers: cascade.layers } };
    var key = state.context + "\n" + JSON.stringify(payload);
    if (key === lastDefaultStyles) return;
    lastDefaultStyles = key;
    emit("default-styles", payload);
  }

  function emitSelection(el, reason) {
    var path = ownerPath(el);
    if (!path) return;
    var link = nearestLinkHref(el);
    var cascade = matchingRules(el, true);
    var payload = {
      path: path,
      tag: el.localName,
      text: (el.textContent || "").trim().slice(0, 1000),
      reason: reason || "click",
      selectors: cascade.rules,
      cascade: { layers: cascade.layers, computed: cascade.computed }
    };
    var node = elementIndexPath(el);
    if (node) payload.node = node;
    if (link !== undefined) payload.link = link;
    var locator = elementLocator(el);
    payload.selector = locator.selector;
    if (locator.host) payload.host = locator.host;
    var hostChain = [], owner = el;
    while (owner && owner.getRootNode && owner.getRootNode() instanceof ShadowRoot && hostChain.length < 16) {
      owner = owner.getRootNode().host;
      var hostNode = elementIndexPath(owner), hostPath = ownerPath(owner);
      if (!hostNode || !hostPath) break;
      hostChain.push({ tag: owner.localName, selector: elementLocator(owner).selector, path: hostPath, node: hostNode, rect: rectOf(owner) });
    }
    if (hostChain.length) payload.hostChain = hostChain;
    payload.rect = selectionRectOf(el);
    // Inside a component's template (or a template inside that): the page
    // element it renders in, which the Add panel inserts after.
    var outer = el;
    while (outer && outer.getRootNode && outer.getRootNode() instanceof ShadowRoot) outer = outer.getRootNode().host;
    if (outer && outer !== el && pageEl && pageEl.contains(outer)) {
      var pageNode = elementIndexPath(outer);
      if (pageNode) payload.pageNode = pageNode;
    }
    payload.crumbs = canvasCrumbs(el);
    lastRect = JSON.stringify(payload.rect);
    emit("select", payload);
    lastSlotGhosts = "";
    scheduleSlotGhosts();
  }

  // Styles the runtime itself once injected as elements; shared and component
  // CSS are adopted sheets now, so the source and the DOM have the same
  // element children. Kept so an older frame's markup still maps.
  function injectedStyle(n) {
    return n.localName === "style" && (n.hasAttribute("data-native-css") || n.hasAttribute("data-native-component-css"));
  }

  // In a section component, empty slots hide with their fallbacks when the
  // page fills the instance.
  // A bare instance shows fallbacks. Wrappers with no slot output or own
  // text hide too, without changing source paths.
  // Content the page gave the slot; its fallback does not count (flattened
  // alone, a slot with nothing assigned reports its fallback nodes).
  function slotAssigned(slot) {
    if (!slot.assignedNodes().length) return false;
    return slot.assignedNodes({ flatten: true }).some(function (n) {
      return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim());
    });
  }
  // Only page-authored instances can be filled. Nested template instances
  // have no unambiguous page-source node and deliberately produce no target.
  var lastSlotGhosts = "";
  var slotGhostHost = null;
  var slotGhostMutation = new MutationObserver(function () { scheduleSlotGhosts(); });
  var slotGhostResize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(function () { scheduleSlotGhosts(); }) : null;
  function slotGhostVisible(el) {
    for (var current = el; current instanceof Element; current = current.parentElement ||
        (current.getRootNode() instanceof ShadowRoot ? current.getRootNode().host : null)) {
      var computed = getComputedStyle(current);
      if (computed.display === "none" || computed.visibility === "hidden" || computed.visibility === "collapse" || Number(computed.opacity) === 0) return false;
    }
    return true;
  }
  var slotGhostFrame = 0;
  function scheduleSlotGhosts() {
    if (slotGhostFrame || !state || !pageEl) return;
    slotGhostFrame = requestAnimationFrame(function () {
      slotGhostFrame = 0;
      reportSlotGhosts();
    });
  }
  function reportSlotGhosts() {
    var report = null;
    var host = state && pageEl && selected;
    while (host instanceof Element && !(host.shadowRoot && state && state.components[host.localName])) {
      host = host.parentElement || (host.getRootNode() instanceof ShadowRoot ? host.getRootNode().host : null);
    }
    if (host !== slotGhostHost) {
      slotGhostMutation.disconnect();
      if (host instanceof Element && host.isConnected && host.shadowRoot) {
        slotGhostMutation.observe(host.shadowRoot, { childList: true, subtree: true, attributes: true });
      }
      if (slotGhostResize) {
        slotGhostResize.disconnect();
        if (host instanceof Element && host.isConnected) slotGhostResize.observe(host);
      }
      slotGhostHost = host;
    }
    if (host instanceof Element && host.isConnected && pageEl.contains(host) && ownerPath(host) === state.pagePaths[state.route]) {
      var hostNode = elementIndexPath(host);
      var hostRect = rectOf(host);
      if (hostNode && hostNode.length <= 64 && hostRect.width > 0 && hostRect.height > 0 &&
          hostRect.bottom > 0 && hostRect.right > 0 && hostRect.top < innerHeight && hostRect.left < innerWidth &&
          slotGhostVisible(host)) {
        var slots = Array.from(host.shadowRoot.querySelectorAll("slot"));
        if (slots.length <= 100) {
          var occurrences = Object.create(null);
          var assigned = Object.create(null);
          slots.forEach(function (slot) { if (slotAssigned(slot)) assigned[slot.name] = true; });
          var entries = slots.map(function (slot) {
            var name = slot.name;
            var occurrence = occurrences[name] || 0;
            occurrences[name] = occurrence + 1;
            var rect = rectOf(slot);
            var hidden = !slotGhostVisible(slot) || slotConditionUnmet(slot);
            var entry = { name: name, occurrence: occurrence, slotNode: elementIndexPath(slot), assigned: !!assigned[name], hidden: hidden };
            if (!hidden && rect.width > 0 && rect.height > 0) entry.rect = rect;
            return entry;
          });
          if (entries.every(function (entry) { return entry.name.length <= 256 && entry.slotNode && entry.slotNode.length <= 64; })) {
            report = { context: state.context, pagePath: state.pagePaths[state.route], tag: host.localName,
              templatePath: state.componentPaths[host.localName], hostNode: hostNode, hostRect: hostRect, entries: entries };
          }
        }
      }
    }
    var key = String(state && state.context) + JSON.stringify(report);
    if (key !== lastSlotGhosts) { lastSlotGhosts = key; emit("slot-ghosts", { report: report }); }
  }

  function slotHasContent(slot) {
    if (slotAssigned(slot)) return true;
    if (slotConditionUnmet(slot)) return false;
    return Array.prototype.some.call(slot.childNodes, function (n) {
      return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim());
    });
  }
  function slotConditionUnmet(slot) {
    var root = slot.getRootNode();
    if (!(root instanceof ShadowRoot) || !sectionLike(root.host) || !fillsAnySlot(root.host)) return false;
    return (slot.getAttribute("name") || "").split(/\s+/).some(function (name) {
      var named = Array.prototype.find.call(root.querySelectorAll("slot"), function (s) { return (s.getAttribute("name") || "") === name; });
      return !named || !slotAssigned(named);
    });
  }
  function fillsAnySlot(host) {
    return Array.prototype.some.call(host.childNodes, function (n) {
      return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim());
    });
  }
  // An element's text outside its slots (a slot's fallback is the slot's).
  function ownText(el) {
    return Array.prototype.some.call(el.childNodes, function (n) {
      if (n.nodeType === 3) return Boolean(n.textContent.trim());
      return n.nodeType === 1 && n.localName !== "slot" && ownText(n);
    });
  }
  function applyEmptyRules(root) {
    root.querySelectorAll("*").forEach(function (el) {
      if (el.localName === "style") return;
      if (el.localName === "slot") {
        if (slotConditionUnmet(el)) el.setAttribute("data-native-empty", "");
        else el.removeAttribute("data-native-empty");
        return;
      }
      var slots = el.querySelectorAll("slot");
      var empty = slots.length > 0 && !Array.prototype.some.call(slots, slotHasContent) && !ownText(el);
      if (empty) el.setAttribute("data-native-empty", "");
      else el.removeAttribute("data-native-empty");
    });
  }
  function watchSlots(root) {
    if (root.__nativeSlotWatch) return;
    root.__nativeSlotWatch = true;
    root.addEventListener("slotchange", function () {
      applyEmptyRules(root);
      updateBoxes();
      scheduleInsertPoints();
    });
  }

  // Element-child indexes from the page or component root down to `el`, so
  // the editor can find the element's start tag in the source.
  function elementIndexPath(el) {
    var out = [];
    var current = el;
    while (current) {
      var parentNode = current.parentNode;
      if (!parentNode) return null;
      var index = 0;
      for (var sibling = current.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        if (!injectedStyle(sibling)) index++;
      }
      out.unshift(index);
      if (parentNode === pageEl || parentNode instanceof ShadowRoot) return out;
      current = parentNode instanceof Element ? parentNode : null;
    }
    return null;
  }

  // Media: desktop files stay in the editor; the site's own markup gains no runtime.
  document.addEventListener("dragover", function (event) {
    if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes("Files")) return;
    var image = event.composedPath().find(function (node) { return node instanceof Element && node.localName === "img"; });
    if (image && ownerPath(image)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }
  });
  document.addEventListener("drop", function (event) {
    if (!event.dataTransfer || !event.dataTransfer.files.length) return;
    var image = event.composedPath().find(function (node) { return node instanceof Element && node.localName === "img"; });
    if (!image || !ownerPath(image)) return;
    event.preventDefault(); event.stopPropagation();
    emit("image-drop", { path: ownerPath(image), node: elementIndexPath(image), width: image.getBoundingClientRect().width, files: Array.from(event.dataTransfer.files) });
  });

  // Walks up through shadow hosts too, so a selection inside a component that
  // sits inside a page link still offers "Follow link".
  function nearestLinkHref(el) {
    var current = el;
    while (current && current instanceof Element) {
      if (current instanceof HTMLAnchorElement && current.hasAttribute("href")) return current.getAttribute("href") || "";
      if (current.parentElement) current = current.parentElement;
      else {
        var root = current.getRootNode && current.getRootNode();
        current = root instanceof ShadowRoot ? root.host : null;
      }
    }
    return undefined;
  }

  function nearestLinkFromPath(path, target) {
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (n instanceof HTMLAnchorElement && n.hasAttribute("href")) return n;
    }
    if (target && target.closest) return target.closest("a[href]");
    return null;
  }

  // A text selection inside the selected element, as offsets into that
  // element's text content, so the host can wrap or unwrap that range; with
  // `caret`, a collapsed one (the caret) counts too.
  function selectionRangeIn(el, caret) {
    var sel = null;
    var root = el.getRootNode && el.getRootNode();
    if (root instanceof ShadowRoot && typeof root.getSelection === "function") sel = root.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) {
      var doc = document.getSelection();
      if (doc && doc.rangeCount && (!doc.isCollapsed || !sel || !sel.rangeCount)) sel = doc;
    }
    if (!sel || !sel.rangeCount || (sel.isCollapsed && !caret)) return null;
    var range = sel.getRangeAt(0);
    return el.contains(range.commonAncestorContainer) ? range : null;
  }
  function textOffset(el, container, offset) {
    var pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(container, offset);
    return pre.cloneContents().textContent.length;
  }
  function wrappersAround(el, node) {
    var out = [];
    var current = node.nodeType === 1 ? node : node.parentElement;
    while (current && current !== el) { out.push(current.localName); current = current.parentElement; }
    return out;
  }
  var textFrame = 0;
  var lastText = "";
  function reportTextSelection(force) {
    if (force) lastText = "";
    if (textFrame) return;
    textFrame = requestAnimationFrame(flushTextSelection);
  }
  function flushTextSelection() {
    cancelAnimationFrame(textFrame);
    textFrame = 0;
    var payload = null;
    if (selected && selected.isConnected) {
      var range = selectionRangeIn(selected, true);
      if (range) {
        var start = textOffset(selected, range.startContainer, range.startOffset);
        var end = textOffset(selected, range.endContainer, range.endOffset);
        var wrappers = wrappersAround(selected, range.commonAncestorContainer);
        if (end > start) payload = { start: start, end: end, text: range.cloneContents().textContent, wrappers: wrappers };
        // The caret inside a link: the host offers that link's address and Remove link.
        else if (wrappers.indexOf("a") >= 0) payload = { start: start, end: start, text: "", wrappers: wrappers, caret: true };
      }
    }
    var key = JSON.stringify(payload);
    if (key === lastText) return;
    lastText = key;
    emit("text-selection", { selection: payload });
  }
  function setTextSelection(el, start, end) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var seen = 0, from = null, to = null, node, last = null;
    while ((node = walker.nextNode())) {
      var length = node.textContent.length;
      last = { node: node, offset: length };
      // A start on a boundary belongs to the node that follows, so a range
      // around a just-wrapped word sits inside its new wrapper.
      if (from === null && start < seen + length) from = { node: node, offset: start - seen };
      if (end <= seen + length) { to = { node: node, offset: end - seen }; break; }
      seen += length;
    }
    if (from === null && last && start === seen) from = last;
    if (from === null || to === null) return;
    var sel = document.getSelection();
    if (!sel) return;
    var range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  document.addEventListener("selectionchange", function () { reportTextSelection(false); });

  // ---- Editor shortcuts (command palette slice, docs/page-builder/palette.md) ----
  // Keys pressed here never reach the editor's document, so the ones it
  // answers go to it as `shortcut` messages: ⌘K / Ctrl+K (the command
  // palette, unless text is selected while typing, which ⌘K links), ⌘P / Ctrl+P
  // (go to a page or file), and, when not typing, ? (keyboard shortcuts),
  // ⌘Z / ⇧⌘Z / Ctrl+Y (undo, redo), and for a selected section ⌘D
  // (duplicate), Delete or Backspace (remove); Shift+Enter selects the parent.
  function typingHere(event) {
    var active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) active = active.shadowRoot.activeElement;
    // A committed element can remain connected after blur; only its live caret is typing.
    if (editing && editing.isConnected && (active === editing || editing.contains(active))) return true;
    var target = event && typeof event.composedPath === "function" ? event.composedPath()[0] : event && event.target;
    if (target instanceof Element && (target.isContentEditable || /^(input|textarea|select)$/.test(target.localName))) return true;
    return !!(active && (active.isContentEditable || /^(input|textarea|select)$/.test(active.localName)));
  }
  function textSelectedForLink() {
    var sel = document.getSelection();
    return !!(editing && sel && !sel.isCollapsed && editing.contains(sel.anchorNode));
  }
  document.addEventListener("keydown", function (e) {
    if (e.isComposing) return;
    var mod = e.ctrlKey || e.metaKey;
    var key = (e.key || "").toLowerCase();
    var plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    var section = selected && selected.isConnected && sectionLike(selected);
    var name = null;
    if (mod && !e.altKey && !e.shiftKey && key === "k" && !textSelectedForLink()) name = "palette";
    else if (mod && !e.altKey && !e.shiftKey && key === "p") name = "go";
    else if (typingHere(e)) return;
    else if (e.key === "?" && !mod && !e.altKey) name = "shortcuts";
    else if (mod && !e.altKey && key === "z") name = e.shiftKey ? "redo" : "undo";
    else if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && key === "y") name = "redo";
    else if (mod && !e.altKey && !e.shiftKey && key === "d" && section) name = "duplicate";
    else if (plain && (e.key === "Delete" || e.key === "Backspace") && section) name = "remove";
    else if (e.shiftKey && !mod && !e.altKey && e.key === "Enter" && selected) name = "parent";
    if (!name) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    emit("shortcut", { name: name });
  }, true);
  // ---- End of editor shortcuts ----

  document.addEventListener("keydown", function (e) {
    // Alt+Up/Down asks the editor to move the selected source element. Its
    // guarded native planner decides whether that element can move.
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      // Text carets, including nested shadow form fields, retain native keys.
      if (!selected || !selected.isConnected || typingHere(e)) return;
      e.preventDefault();
      emit("move", { direction: e.key === "ArrowUp" ? "up" : "down" });
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    var key = e.key.toLowerCase();
    if (key !== "b" && key !== "i" && key !== "k") return;
    e.preventDefault();
    commitEditing();
    // The host formats the selection it knows, so it hears of it first.
    flushTextSelection();
    emit("format", { format: key === "b" ? "strong" : key === "i" ? "em" : "link" });
  });

  // Typing into the selected text element: a text element whose content is
  // only text and inline formatting becomes editable on the pointer press
  // that selects it, so the caret lands where it was clicked. The editor gets
  // the element's text before and after on Enter, on blur and before a format
  // shortcut, and writes the difference into the source.
  var TEXT_TAGS = /^(h[1-6]|p|span|a|li|button|blockquote|figcaption|small|label|td|th|dt|dd|div|summary|legend|caption|strong|em|b|i|cite|q|mark|code)$/;
  var INLINE_TAGS = /^(a|strong|em|b|i|u|s|span|small|code|mark|sub|sup|br|wbr|abbr|time|cite|q|kbd|slot)$/;
  function editableText(el) {
    if (!el || !state) return false;
    else if (ownerPath(el) !== state.pagePaths[state.route] && ownerPath(el) !== state.editableTemplatePath) return false;
    if (!(TEXT_TAGS.test(el.localName) || textHost(el)) || !(el.textContent || "").trim()) return false;
    var all = el.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      if (!INLINE_TAGS.test(all[i].localName)) return false;
      // A slot showing the page's own text: that text is the thing to edit, not the template's fallback.
      if (all[i] instanceof HTMLSlotElement && all[i].assignedNodes().length) return false;
    }
    return true;
  }
  // A component instance that holds only text (and inline formatting) for
  // its default slot, such as <card-note>Cafe · 2025</card-note>: that text
  // is the page's, typed into in place through the slot.
  function textHost(el) {
    if (el.localName.indexOf("-") < 0 || !el.shadowRoot || sectionLike(el)) return false;
    return Array.prototype.every.call(el.children, function (child) {
      return INLINE_TAGS.test(child.localName) && !child.hasAttribute("slot");
    });
  }
  function startEditing(el) {
    if (!editableText(el)) { stopEditing(false); return; }
    if (editing === el) return;
    stopEditing(true);
    if (!editableText(el)) return;
    editing = el;
    editingOwner = { path: ownerPath(el) };
    editingText = el.textContent;
    editingHtml = el.innerHTML;
    el.setAttribute("contenteditable", "plaintext-only");
    if (el.contentEditable !== "plaintext-only") el.setAttribute("contenteditable", "true");
    el.setAttribute("spellcheck", "false");
    el.addEventListener("blur", commitEditing);
    el.addEventListener("keydown", onEditingKey);
  }
  function stopEditing(commit) {
    if (!editing) return;
    var el = editing;
    if (commit) commitEditing();
    el.removeEventListener("blur", commitEditing);
    el.removeEventListener("keydown", onEditingKey);
    el.removeAttribute("contenteditable");
    el.removeAttribute("spellcheck");
    editing = null;
  }
  function commitEditing() {
    if (!editing || !editing.isConnected) return;
    var after = editing.textContent;
    if (after === editingText) return;
    var before = editingText;
    editingText = after;
    editingHtml = editing.innerHTML;
    var path = ownerPath(editing);
    if (!editingOwner || editingOwner.path !== path) return;
    var edit = { path: path, node: elementIndexPath(editing), before: before, after: after };
    emit("text-edit", edit);
  }
  function onEditingKey(e) {
    if (e.key === "Enter") {
      // One line of text: Enter finishes, as it does in a form field.
      e.preventDefault();
      commitEditing();
      editing.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      editing.innerHTML = editingHtml;
      editing.blur();
    }
  }
  document.addEventListener("mousedown", function (e) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
    var target = deepestElement(e);
    if (editing && editing.contains(target)) return;
    if (target && editableText(target)) startEditing(target);
    else stopEditing(true);
  }, true);

  function clearSelectionState() {
    stopEditing(true);
    hovered = null;
    selected = null;
    updateBoxes();
    drawBox(hoverBox, null);
    drawBox(selectBox, null);
  }

  document.addEventListener("click", function (e) {
    var path = typeof e.composedPath === "function" ? e.composedPath() : [];
    var link = nearestLinkFromPath(path, e.target);
    if (link && (e.ctrlKey || e.metaKey)) {
      // A link within the site (a root or relative one, not an external
      // address or an anchor on this page): the host shows its page.
      var href = (link.getAttribute("href") || "").trim();
      if (href && href.charAt(0) !== "#" && !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        emit("route", { href: href });
        return;
      }
    }
    var target = deepestElement(e);
    // Clicks while typing move the caret; the text element stays selected.
    if (editing && editing.contains(target)) {
      e.preventDefault();
      e.stopPropagation();
      if (selected !== editing) { selected = editing; updateBoxes(); emitSelection(editing, "click"); }
      return;
    }
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      selected = target;
      updateBoxes();
      emitSelection(target, "click");
    }
  });
  document.addEventListener("mousemove", function (e) {
    if (sectionDrag) return;
    hoverPointer = { x: e.clientX, y: e.clientY };
    hovered = deepestElement(e, true);
    updateBoxes(true);
    reportHover();
  });
  document.documentElement.addEventListener("mouseleave", function () {
    hoverPointer = null;
    hovered = null;
    updateBoxes();
    reportHover();
  });
  // Drag to reorder in the canvas, driven by the editor from the edit bar's
  // grip: the editor owns the pointer (captured on the grip, so nothing in
  // this page is ever pressed or text-selected) and sends `drag-start`,
  // `drag-move`, `drag-end` and `drag-cancel` with the pointer's position in
  // this frame's viewport. The runtime owns the geometry: it tells the gap
  // under the pointer from the siblings' midpoints, scrolls near the top and
  // bottom edges of the frame, and reports only the chosen gap through
  // `section-drag` messages (start, target, end, cancel); the editor draws
  // the targets over the frame and writes the move.
  var sectionDrag = null;
  var SCROLL_STEP = 14;

  function dragGap(drag) {
    var children = Array.prototype.slice.call(drag.container.children);
    for (var i = 0; i < children.length; i++) {
      var rect = children[i].getBoundingClientRect();
      if (drag.clientY < rect.top + rect.height / 2) return i;
    }
    return children.length;
  }

  function setDragTarget() {
    var drag = sectionDrag;
    if (!drag) return;
    var index = dragGap(drag);
    if (index === drag.target) return;
    drag.target = index;
    emit("section-drag", { phase: "target", parent: drag.parent, index: index });
  }

  // Near the top or bottom edge the frame scrolls on its own, faster the
  // nearer the edge, at most SCROLL_STEP per animation frame (also when the
  // pointer is outside the frame).
  function autoScrollDrag() {
    var drag = sectionDrag;
    if (!drag) return;
    var height = window.innerHeight;
    var band = Math.min(72, height / 4);
    var speed = 0;
    if (drag.clientY < band) speed = -Math.min(SCROLL_STEP, Math.ceil(SCROLL_STEP * (band - drag.clientY) / band));
    else if (drag.clientY > height - band) speed = Math.min(SCROLL_STEP, Math.ceil(SCROLL_STEP * (drag.clientY - (height - band)) / band));
    if (speed) {
      var before = window.scrollY;
      window.scrollBy(0, speed);
      if (window.scrollY !== before) setDragTarget();
    }
    drag.frame = requestAnimationFrame(autoScrollDrag);
  }

  function endSectionDrag() {
    var drag = sectionDrag;
    sectionDrag = null;
    if (!drag) return;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    drag.el.style.opacity = drag.opacity;
    document.documentElement.style.userSelect = drag.userSelect;
  }

  // The selected section starts a drag at the pointer's position; anything
  // else (no selection, not a section, text being typed) cancels at once.
  function startSectionDrag(y) {
    endSectionDrag();
    var container = selected && selected.isConnected && sectionLike(selected) && !editing ? selected.parentElement : null;
    var parentPath = container && pageEl && (container === pageEl || pageEl.contains(container))
      ? (container === pageEl ? [] : elementIndexPath(container))
      : null;
    if (!parentPath) {
      emit("section-drag", { phase: "cancel" });
      return;
    }
    var selection = document.getSelection();
    if (selection) selection.removeAllRanges();
    sectionDrag = {
      el: selected, container: container, parent: parentPath, clientY: y, target: null,
      opacity: selected.style.opacity, userSelect: document.documentElement.style.userSelect, frame: 0
    };
    selected.style.opacity = "0.55";
    document.documentElement.style.userSelect = "none";
    hoverPointer = null;
    hovered = null;
    updateBoxes();
    reportHover();
    emit("section-drag", { phase: "start", parent: parentPath, index: Array.prototype.indexOf.call(container.children, selected) });
    setDragTarget();
    sectionDrag.frame = requestAnimationFrame(autoScrollDrag);
  }

  function dragMessage(msg) {
    var y = Number(msg.y);
    if (msg.type === "drag-start") {
      if (isFinite(y)) startSectionDrag(y);
      else emit("section-drag", { phase: "cancel" });
      return;
    }
    var drag = sectionDrag;
    if (msg.type === "drag-move") {
      if (!drag || !isFinite(y)) return;
      drag.clientY = y;
      setDragTarget();
      return;
    }
    // A release, or a cancel: the drag is over either way. A release with
    // no drag left (a render ended it) or no gap chosen is a cancel.
    if (drag && msg.type === "drag-end" && isFinite(y)) {
      drag.clientY = y;
      setDragTarget();
    }
    endSectionDrag();
    if (drag && msg.type === "drag-end" && drag.target !== null) emit("section-drag", { phase: "end", parent: drag.parent, index: drag.target });
    else emit("section-drag", { phase: "cancel" });
  }

  // ---- Inspection for agents (inspect_preview): elements as rendered ----
  // An element's box, the computed values that decide how it looks, the
  // rules that match it (by file) and its text's measured contrast against
  // what is painted behind it.
  var INSPECT_PROPERTIES = [
    "display", "position", "box-sizing", "width", "height", "max-width", "margin", "padding", "border", "border-radius",
    "color", "background-color", "background-image", "opacity", "visibility", "overflow", "z-index",
    "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "text-transform",
    "text-decoration-line", "gap", "flex-direction", "justify-content", "align-items", "grid-template-columns",
    "align-content", "align-self", "flex-grow", "flex-shrink", "flex-basis", "order", "grid-template-rows", "grid-auto-flow", "grid-auto-rows", "grid-auto-columns", "row-gap", "column-gap", "min-height", "max-height", "aspect-ratio", "box-sizing", "font-style", "text-transform", "white-space", "text-overflow", "word-spacing", "text-decoration-line", "background-position", "background-size", "background-repeat", "background-attachment", "object-fit", "object-position", "position", "top", "right", "bottom", "left", "z-index", "overflow", "overflow-x", "overflow-y", "visibility", "float", "clear"
  ];
  var INSPECT_MAX_ELEMENTS = 20;
  var INSPECT_MAX_RULES = 12;
  var colorProbe = null;
  // Any CSS color as sRGB 0–255 and alpha 0–1, drawn on a canvas, so oklch(),
  // color-mix() and named colors read alike.
  function rgba(color) {
    if (!colorProbe) {
      var canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      colorProbe = canvas.getContext("2d", { willReadFrequently: true });
    }
    colorProbe.clearRect(0, 0, 1, 1);
    colorProbe.fillStyle = "rgba(0, 0, 0, 0)";
    colorProbe.fillStyle = color;
    colorProbe.fillRect(0, 0, 1, 1);
    var d = colorProbe.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  }
  function over(top, below) {
    var a = top[3];
    return [0, 1, 2].map(function (i) { return Math.round(top[i] * a + below[i] * (1 - a)); });
  }
  function hex(c) {
    return "#" + [c[0], c[1], c[2]].map(function (v) { return (v | 0).toString(16).padStart(2, "0"); }).join("");
  }
  function luminance(c) {
    var lin = c.slice(0, 3).map(function (v) {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }
  // The element that paints behind this one: its slot, parent or shadow host.
  function visualParent(el) {
    if (el.assignedSlot) return el.assignedSlot;
    if (el.parentElement) return el.parentElement;
    var root = el.getRootNode && el.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }
  // The solid color behind the element's text: every background color up to
  // the first opaque one, over the frame's white canvas. A background image
  // on the way makes the measurement approximate.
  function backdrop(el) {
    var layers = [], image = false;
    for (var at = el; at; at = visualParent(at)) {
      var style = getComputedStyle(at);
      if (style.backgroundImage && style.backgroundImage !== "none") image = true;
      var color = rgba(style.backgroundColor);
      if (color[3] > 0) layers.push(color);
      if (color[3] >= 1) break;
    }
    var out = [255, 255, 255];
    for (var i = layers.length - 1; i >= 0; i--) out = over(layers[i], out);
    return { color: out, image: image };
  }
  function contrastOf(el, style) {
    var behind = backdrop(el);
    var fg = rgba(style.color);
    var text = over(fg, behind.color);
    var a = luminance(text), b = luminance(behind.color);
    var ratio = Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
    var size = parseFloat(style.fontSize) || 16;
    var large = size >= 24 || (size >= 18.66 && (parseInt(style.fontWeight, 10) || 400) >= 700);
    var out = {
      ratio: ratio, text: hex(text), background: hex(behind.color), largeText: large,
      AA: ratio >= (large ? 3 : 4.5), AAA: ratio >= (large ? 4.5 : 7)
    };
    if (behind.image) out.note = "A background image is behind the text; measured against the background color only.";
    return out;
  }
  function round(n) { return Math.round(n * 10) / 10; }
  function inspectElement(el) {
    var style = getComputedStyle(el);
    var styles = {};
    INSPECT_PROPERTIES.forEach(function (name) {
      var value = style.getPropertyValue(name);
      if (value) styles[name] = value;
    });
    var r = el.getBoundingClientRect();
    var out = {
      file: ownerPath(el),
      tag: el.localName,
      box: { x: round(r.left + window.scrollX), y: round(r.top + window.scrollY), width: round(r.width), height: round(r.height) },
      visible: r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0,
      styles: styles
    };
    var node = elementIndexPath(el);
    if (node) out.element = node.join(".");
    var root = el.getRootNode && el.getRootNode();
    if (root instanceof ShadowRoot && root.host) out.component = root.host.localName;
    var text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (text) {
      out.text = text.slice(0, 160);
      out.contrast = contrastOf(el, style);
    }
    out.rules = matchingRules(el, false).rules.slice(-INSPECT_MAX_RULES).map(function (rule) {
      var seen = {}, parts = [];
      rule.declarations.forEach(function (item) {
        var name = item.shorthand || item.property;
        if (seen[name]) return;
        seen[name] = true;
        parts.push(name + ": " + item.value + (item.important ? " !important" : ""));
      });
      var entry = { file: rule.path || null, selector: rule.selector, declarations: parts.join("; ").slice(0, 400) };
      if (rule.layerName) entry.layer = rule.layerName;
      if (rule.conditions && rule.conditions.length) entry.conditions = rule.conditions.join(" ");
      return entry;
    });
    return out;
  }
  // Every element of the page in document order, into component shadow trees.
  function eachRendered(root, visit) {
    for (var el = root.firstElementChild; el; el = el.nextElementSibling) {
      if (injectedStyle(el)) continue;
      visit(el);
      if (el.shadowRoot && instances.has(el)) eachRendered(el.shadowRoot, visit);
      eachRendered(el, visit);
    }
  }
  function inspect(request) {
    if (!state || !pageEl) return { error: "The preview has not rendered yet." };
    var targets = [];
    if (Array.isArray(request.node)) {
      var el = resolveNodePath({ path: request.path, node: request.node });
      if (!el) return { error: "No element " + request.node.join(".") + " on the page shown. get_page lists them." };
      targets = [el];
    } else if (request.selector) {
      try {
        pageEl.matches(request.selector);
      } catch (e) {
        return { error: "Not a CSS selector: " + request.selector };
      }
      eachRendered(pageEl, function (el) { if (el.matches(request.selector)) targets.push(el); });
      if (!targets.length) return { error: "Nothing on the page shown matches " + request.selector + "." };
    } else {
      if (!selected || !selected.isConnected) return { error: "Nothing is selected in the preview. Give a selector or an element." };
      targets = [selected];
    }
    var limit = Math.min(Math.max(1, Number(request.limit) || 5), INSPECT_MAX_ELEMENTS);
    return {
      route: state.route,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      matched: targets.length,
      elements: targets.slice(0, limit).map(inspectElement)
    };
  }
  // Measured once web fonts have loaded and layout has settled.
  function inspectWhenSettled(msg) {
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    var timeout = new Promise(function (resolve) { setTimeout(resolve, 1500); });
    Promise.race([fonts, timeout]).then(function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var report;
          try {
            report = inspect(msg.request || {});
          } catch (e) {
            report = { error: "The preview could not be inspected: " + (e && e.message || e) };
          }
          emit("inspect-result", { id: msg.id, report: report });
        });
      });
    });
  }

  // ---- Canvas (page builder, canvas slice; docs/page-builder/canvas.md) ----
  // Design-tool feedback drawn over the page, never part of it: a label on
  // the hovered element (`section.hero`, a component's tag), a soft dashed
  // box for what the editor points at (a line hovered in the code pane, a
  // crumb hovered in the breadcrumb), Webflow-style margin and padding
  // shading when the editor turns it on, and the selection's ancestors for
  // the breadcrumb. Esc and Ctrl/⌘+↑ select the parent.
  var canvasHint = null;
  var canvasSpacing = false;
  var canvasCrumbEls = [];
  var canvasLabel = null;
  var canvasHintBox = null;
  var canvasSpacingBoxes = null;
  // Where the editor's edit bar stands over the frame, for labels to keep clear of.
  var canvasAvoid = null;
  function canvasOverlay(name) {
    var el = document.createElement("div");
    el.setAttribute("data-native-selection-box", name);
    el.style.cssText = "position:absolute;display:none;pointer-events:none;z-index:2147483646;box-sizing:border-box;";
    document.documentElement.appendChild(el);
    return el;
  }
  function canvasEnsure() {
    if (canvasLabel) return;
    canvasHintBox = canvasOverlay("hint");
    canvasLabel = canvasOverlay("label");
    canvasLabel.style.cssText += "z-index:2147483647;padding:0 5px;border-radius:3px;white-space:nowrap;" +
      "font:600 11px/16px system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:0;max-width:60vw;overflow:hidden;text-overflow:ellipsis;";
    canvasSpacingBoxes = ["margin", "margin", "margin", "margin", "padding", "padding", "padding", "padding"].map(function (kind) {
      var el = canvasOverlay("spacing");
      el.setAttribute("data-native-spacing", kind);
      el.style.cssText += "align-items:center;justify-content:center;overflow:hidden;" +
        "font:600 11px/1 system-ui,-apple-system,'Segoe UI',sans-serif;" +
        (kind === "margin" ? "background:rgba(246,170,92,.42);color:#6b3d08;" : "background:rgba(132,196,104,.42);color:#24501a;");
      return el;
    });
  }
  // A component instance on the page (its tag is one of the site's components).
  function canvasIsComponent(el) {
    return !!(el && state && Object.prototype.hasOwnProperty.call(state.components || {}, el.localName) && el.shadowRoot);
  }
  // Components and what their templates render wear the editor's component
  // accent: changing them changes every instance. The page's own elements,
  // slotted ones included, wear the selection colour.
  function canvasColor(el) {
    var root = el.getRootNode && el.getRootNode();
    return el !== pageEl && (canvasIsComponent(el) || root instanceof ShadowRoot) ? componentColor : boxColor;
  }
  function canvasInk(color) {
    return luminance(rgba(color)) > 0.3 ? "#16161d" : "#ffffff";
  }
  function canvasLabelText(el) {
    if (el === pageEl) return "body";
    if (canvasIsComponent(el)) return el.localName;
    var first = (el.getAttribute("class") || "").trim().split(/\s+/)[0];
    if (first) return el.localName + "." + first;
    var id = (el.getAttribute("id") || "").trim();
    return id ? el.localName + "#" + id : el.localName;
  }
  function canvasSectionRoot(n) {
    var root = n.parentNode;
    return root instanceof ShadowRoot && root.host && sectionLike(root.host) && root.host.localName !== "section";
  }
  function canvasUp(n) {
    if (n.parentElement) return n.parentElement;
    var root = n.getRootNode && n.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }
  // The element a click would select around `el`: past slots and a section
  // component's root (the instance stands for it), up to the page root.
  function canvasParent(el) {
    var next = canvasUp(el);
    while (next && (next instanceof HTMLSlotElement || canvasSectionRoot(next))) next = canvasUp(next);
    if (!next || next === pageEl) return null;
    // Inside the page, through the shadow roots of components within components.
    for (var at = next; at; at = canvasUp(at)) if (at === pageEl) return next;
    return null;
  }
  function canvasCrumbs(el) {
    var list = [];
    for (var at = el; at && list.length < 64; at = canvasParent(at)) list.unshift(at);
    canvasCrumbEls = list;
    return list.map(function (item) {
      var root = item.getRootNode && item.getRootNode();
      return {
        label: canvasLabelText(item),
        kind: canvasIsComponent(item) ? "component" : root instanceof ShadowRoot ? "template" : "element"
      };
    });
  }
  function canvasDrawLabel(el) {
    var rect = el && el.isConnected && el.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) { canvasLabel.style.display = "none"; return; }
    var color = canvasColor(el);
    canvasLabel.textContent = canvasLabelText(el);
    canvasLabel.style.background = color;
    canvasLabel.style.color = canvasInk(color);
    canvasLabel.style.display = "block";
    // At the element's left edge, kept inside the frame's width.
    var width = canvasLabel.offsetWidth;
    var left = Math.max(0, Math.min(rect.left, document.documentElement.clientWidth - width));
    // Above the element's top-left corner, else just inside it, else below
    // it: the first place clear of the edit bar.
    var places = [rect.top + 1, rect.bottom + 1];
    if (rect.top >= 18) places.unshift(rect.top - 17);
    var top = places.find(function (y) { return !canvasCovered(left, y, width, 16); });
    if (top === undefined) top = places[0];
    canvasLabel.style.left = left + window.scrollX + "px";
    canvasLabel.style.top = top + window.scrollY + "px";
  }
  // Whether a box (frame-viewport coordinates) falls under the edit bar.
  function canvasCovered(left, top, width, height) {
    var bar = canvasAvoid;
    return !!bar && left < bar.right && left + width > bar.left && top < bar.bottom && top + height > bar.top;
  }
  function canvasPlace(box, left, top, width, height, value) {
    if (!(width > 0.5 && height > 0.5)) { box.style.display = "none"; return; }
    box.style.display = "flex";
    box.style.left = left + "px";
    box.style.top = top + "px";
    box.style.width = width + "px";
    box.style.height = height + "px";
    box.textContent = Math.min(width, height) >= 14 && value >= 1 ? String(Math.round(value)) : "";
  }
  function canvasDrawSpacing(el) {
    var rect = el && el.isConnected && el.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) {
      canvasSpacingBoxes.forEach(function (box) { box.style.display = "none"; });
      return;
    }
    var s = getComputedStyle(el);
    var px = function (name) { return Math.max(0, parseFloat(s.getPropertyValue(name)) || 0); };
    var m = { t: px("margin-top"), r: px("margin-right"), b: px("margin-bottom"), l: px("margin-left") };
    var p = { t: px("padding-top"), r: px("padding-right"), b: px("padding-bottom"), l: px("padding-left") };
    var bd = { t: px("border-top-width"), r: px("border-right-width"), b: px("border-bottom-width"), l: px("border-left-width") };
    var x = rect.left + window.scrollX, y = rect.top + window.scrollY, w = rect.width, h = rect.height;
    var box = canvasSpacingBoxes;
    canvasPlace(box[0], x - m.l, y - m.t, w + m.l + m.r, m.t, m.t);
    canvasPlace(box[1], x + w, y, m.r, h, m.r);
    canvasPlace(box[2], x - m.l, y + h, w + m.l + m.r, m.b, m.b);
    canvasPlace(box[3], x - m.l, y, m.l, h, m.l);
    var ix = x + bd.l, iy = y + bd.t, iw = w - bd.l - bd.r, ih = h - bd.t - bd.b;
    canvasPlace(box[4], ix, iy, iw, p.t, p.t);
    canvasPlace(box[5], ix + iw - p.r, iy + p.t, p.r, ih - p.t - p.b, p.r);
    canvasPlace(box[6], ix, iy + ih - p.b, iw, p.b, p.b);
    canvasPlace(box[7], ix, iy + p.t, p.l, ih - p.t - p.b, p.l);
  }
  // Bar movement changes only which label position is clear of the bar.
  function canvasPaintLabel() {
    canvasEnsure();
    if (canvasHint && !canvasHint.isConnected) canvasHint = null;
    var hint = canvasHint && canvasHint !== selected ? canvasHint : null;
    canvasDrawLabel(hint || (hovered && hovered !== selected && !sectionDrag ? hovered : null));
    return hint;
  }
  // Called from updateBoxes, after the hover and selection boxes.
  function canvasPaint() {
    var hint = canvasPaintLabel();
    if (hoverBox && hovered) {
      var hoverColor = canvasColor(hovered);
      hoverBox.style.borderColor = hoverColor;
      hoverBox.style.background = "color-mix(in srgb, " + hoverColor + " 4%, transparent)";
    }
    drawBox(canvasHintBox, hint);
    if (hint) {
      var hintColor = canvasColor(hint);
      canvasHintBox.style.border = "1px dashed " + hintColor;
      canvasHintBox.style.background = "color-mix(in srgb, " + hintColor + " 8%, transparent)";
    }
    canvasDrawSpacing(canvasSpacing && !sectionDrag ? (hint || hovered || selected) : null);
  }
  function canvasSelect(el, reason) {
    if (editing && editing !== el) stopEditing(true);
    selected = el;
    updateBoxes();
    emitSelection(el, reason);
  }
  // The parent of the selection, or no selection (the page's <body>) above the top.
  function canvasSelectParent() {
    var parentEl = canvasParent(selected);
    if (parentEl) { canvasSelect(parentEl, "click"); return; }
    stopEditing(true);
    selected = null;
    updateBoxes();
    emit("canvas-clear");
  }
  document.addEventListener("keydown", function (e) {
    var up = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === "ArrowUp";
    var esc = e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey;
    if ((!up && !esc) || !selected || !selected.isConnected || sectionDrag) return;
    // A form field on the page (in a component too) keeps its own keys.
    var target = typeof e.composedPath === "function" ? e.composedPath()[0] : e.target;
    if (target instanceof Element && /^(input|textarea|select)$/.test(target.localName)) return;
    // Escape first drops what was typed (onEditingKey); the next one climbs.
    if (esc && editing && editing.innerHTML !== editingHtml) return;
    e.preventDefault();
    e.stopPropagation();
    canvasSelectParent();
  }, true);
  // Text with each <br> read as a space, as a structure row shows it.
  function textWithBreaks(el) {
    var out = "";
    el.childNodes.forEach(function (c) { out += c.nodeType === 3 ? c.data : c.localName === "br" ? " " : c.nodeType === 1 ? textWithBreaks(c) : ""; });
    return out;
  }
  // patch-text: a structure field's text set in place, ahead of its render;
  // "\n" becomes <br>, never markup. Only an element of text and <br>s takes it.
  var livePatch = null;
  function patchText(request, text) {
    var el = typeof text === "string" && text.length <= 1e5 ? resolveNodePath(request) : null;
    var kids = el ? Array.from(el.childNodes) : [];
    if (!el || el === editing || kids.some(function (c) { return c.nodeType !== 3 && c.localName !== "br"; })) return false;
    if (kids.map(function (c) { return c.nodeType === 3 ? c.data : "\n"; }).join("") !== text) {
      el.replaceChildren.apply(el, text.split("\n").flatMap(function (line, i) {
        return (i ? [document.createElement("br")] : []).concat(line ? [document.createTextNode(line)] : []);
      }));
    }
    if (selected && (selected === el || el.contains(selected) || selected.contains(el))) updateBoxes();
    return true;
  }
  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var msg = e.data || {};
    if (msg.source !== "astro-native-preview-host") return;
    if (msg.type === "theme") {
      if (typeof msg.component === "string" && msg.component) componentColor = msg.component;
      updateBoxes();
      return;
    }
    if (msg.type === "canvas-avoid") {
      var bar = msg.rect;
      canvasAvoid = bar && ["top", "left", "bottom", "right"].every(function (key) { return typeof bar[key] === "number" && isFinite(bar[key]); }) ? bar : null;
      canvasPaintLabel();
      return;
    }
    if (msg.type === "canvas-spacing") {
      canvasSpacing = !!msg.on;
      updateBoxes();
      return;
    }
    // A crumb of the breadcrumb, by its place in the last path sent; -1 is the page itself.
    if (msg.type === "canvas-crumb") {
      var index = Number(msg.index);
      var crumb = index === -1 ? pageEl : canvasCrumbEls[index];
      if (msg.action === "hover") {
        canvasHint = crumb && crumb.isConnected ? crumb : null;
        updateBoxes();
      } else if (msg.action === "select" && crumb && crumb.isConnected) {
        canvasHint = null;
        if (crumb === pageEl) { stopEditing(true); selected = null; updateBoxes(); emit("canvas-clear"); }
        else if (crumb !== selected) canvasSelect(crumb, "click");
      }
      return;
    }
    // The element a line of the code pane belongs to, pointed at (or nothing).
    if (msg.type === "canvas-hint") {
      canvasHint = msg.request ? resolveNodePath(msg.request) : null;
      updateBoxes();
      return;
    }
    // The cursor moved in the code pane: its element is selected without
    // moving the cursor (a refresh), and scrolled to when out of sight.
    if (msg.type === "canvas-code-select") {
      var wanted = resolveNodePath(msg.request);
      if (!wanted) return;
      // Already selected: nothing to report, but it is still brought into sight.
      if (wanted !== selected) canvasSelect(wanted, "refresh");
      var rect = wanted.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        wanted.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
      }
    }
  });
  // ---- End of canvas ----

  function refreshScroll(event) {
    var root = event.target && event.target.getRootNode ? event.target.getRootNode() : null;
    if (event.currentTarget instanceof ShadowRoot) {
      // Slotted light-DOM scrolls belong to the window listener. Detached
      // instances retain their listener until collected, but do no work.
      if (root !== event.currentTarget || !event.currentTarget.host.isConnected) return;
    } else if (root instanceof ShadowRoot) return;
    refreshPointerHover(); updateBoxes(); scheduleInsertPoints(); scheduleItemGrids();
  }
  window.addEventListener("scroll", refreshScroll, true);
  var gridResizeSelectionPending = false;
  window.addEventListener("resize", function () {
    updateBoxes(); scheduleInsertPoints(); scheduleItemGrids();
    // Refresh matching rules and computed values when a selected grid changes width.
    // Coalesce resize events and read the current selection at the refresh.
    if (gridResizeSelectionPending) return;
    gridResizeSelectionPending = true;
    requestAnimationFrame(function () {
      gridResizeSelectionPending = false;
      if (!selected || !selected.isConnected) return;
      var display = getComputedStyle(selected).display;
      if (display === "grid" || display === "inline-grid") emitSelection(selected, "refresh");
    });
  });
  document.addEventListener("submit", function (e) { e.preventDefault(); });
  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var msg = e.data || {};
    if (msg.source !== "astro-native-preview-host") return;
    if (msg.type === "drop-probe") {
      if (typeof msg.x !== "number" || typeof msg.y !== "number" || !isFinite(msg.x) || !isFinite(msg.y)) return;
      emit("drop-containers", { id: msg.id, path: String(state && state.pagePaths[state.route] || ""),
        x: msg.x, y: msg.y, containers: dropContainers(msg.x, msg.y, msg.moving, msg.bands) });
      return;
    }
    if (msg.type === "drag-start" || msg.type === "drag-move" || msg.type === "drag-end" || msg.type === "drag-cancel") {
      dragMessage(msg);
      return;
    }
    // Keep the popup's grid geometry live while the pointer is in host controls.
    if (msg.type === "item-grid-track") {
      trackedGrid = null;
      var candidate = recentGrid && gridReport(recentGrid);
      if (msg.grid && candidate && msg.grid.path === candidate.path &&
          JSON.stringify(msg.grid.parent) === JSON.stringify(candidate.parent)) trackedGrid = recentGrid;
      if (!trackedGrid && msg.grid && selected) {
        var selectedGrid = gridItemOf(selected);
        var selectedReport = gridReport(selectedGrid);
        if (selectedReport && msg.grid.path === selectedReport.path &&
            JSON.stringify(msg.grid.parent) === JSON.stringify(selectedReport.parent)) trackedGrid = selectedGrid;
      }
      scheduleItemGrids();
      return;
    }
    // The Add panel's drag scrolls the page near the frame's edges
    // (src/page-builder/insert-drag.ts), and a section just added is
    // brought into view (src/page-builder/page-builder.ts).
    if (msg.type === "scroll-by") {
      var dy = Number(msg.dy);
      var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (isFinite(dy)) window.scrollBy({ top: dy, behavior: msg.smooth && !calm ? "smooth" : "auto" });
      return;
    }
    if (msg.type === "theme") {
      if (typeof msg.focus === "string" && msg.focus) boxColor = msg.focus;
      if (typeof msg.component === "string" && msg.component) componentColor = msg.component;
      paintBoxes();
      if (selectBox) { selectBox.__tint = hoverBox.__tint = ""; }
      updateBoxes();
      return;
    }
    if (msg.type === "component-focus") {
      focusTag = typeof msg.tag === "string" ? msg.tag : "";
      updateBoxes();
      return;
    }
    if (msg.type === "clear-selection") {
      clearSelectionState();
      return;
    }
    // The editor's page structure asks for an element by index path: it is
    // selected like a click and brought to the middle of the frame.
    if (msg.type === "select-node") {
      var wanted = resolveNodePath(msg.request);
      if (!wanted) return;
      if (editing && editing !== wanted) stopEditing(true);
      selected = wanted;
      updateBoxes();
      var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (wanted.scrollIntoView) wanted.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      emitSelection(wanted, "click");
      return;
    }
    if (msg.type === "inspect") {
      inspectWhenSettled(msg);
      return;
    }
    // Kept (drawn again after renders) until the host ends or drops it.
    if (msg.type === "patch-text") {
      var ok = !msg.drop && patchText(msg.request, msg.text);
      livePatch = ok && !msg.end ? { request: msg.request, text: msg.text } : null;
      if (!msg.drop) emit("patched", { id: msg.id, ok: ok });
      return;
    }
    if (msg.type === "pins") {
      pins = Array.isArray(msg.pins) ? msg.pins.slice(0, 200) : [];
      lastPins = "";
      schedulePins();
      return;
    }
    // A pin's element scrolled out of view, brought to the middle of the frame.
    if (msg.type === "show-pin") {
      var shownPin = pins.find(function (pin) { return pin && pin.id === msg.id; });
      var target = shownPin && locatePin(shownPin);
      var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (target && target.scrollIntoView) target.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
      return;
    }
    if (msg.type === "assets") {
      showArrivedAssets(msg);
      return;
    }
    if (msg.type !== "update") return;
    apply(msg.payload || {});
    if (livePatch) patchText(livePatch.request, livePatch.text);
    requestAnimationFrame(function () { emit("ack", { id: msg.id }); });
  });
  pageEl = document.getElementById("page");
  new MutationObserver(function () { scheduleSlotGhosts(); }).observe(pageEl, { childList: true, subtree: true, attributes: true });
  // Layout can shift without a render (fonts, component CSS arriving).
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(function () { scheduleInsertPoints(); scrollToTarget(); schedulePins(); scheduleItemGrids(); scheduleSlotGhosts(); }).observe(pageEl);
  // Which load of the host's frame this document is, so a late `ready` from
  // the document it replaced is not taken for this one's.
  var frameLoad = document.querySelector('meta[name="ase-frame-load"]');
  parent.postMessage({ source: "astro-native-preview", type: "ready", load: frameLoad ? frameLoad.getAttribute("content") : undefined }, "*");
})();
