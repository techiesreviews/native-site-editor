(function () {
  var state = null;
  var defined = {};
  var shadowRoots = new Set();
  var instances = new Set();
  var pageEl = null;
  var hovered = null;
  var selected = null;
  var hoverBox = null;
  var selectBox = null;
  var renderDepth = 0;
  var MAX_DEPTH = 40;
  var hadError = false;
  // The selected text element being typed into, and its text and markup as
  // of the last commit.
  var editing = null;
  var editingText = "";
  var editingHtml = "";
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
  // Optional template parts (see applyEmptyRules) stay out of layout.
  var runtimeSheet = new CSSStyleSheet();
  runtimeSheet.replaceSync("[data-native-empty]{display:none !important}");
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
  // host read for them.
  var SITE = "https://site.invalid";
  function assetFor(src) {
    if (!state || !state.assets || typeof src !== "string") return null;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src.trim())) return null;
    var key;
    try {
      var url = new URL(src.trim(), SITE + (state.base || "/"));
      if (url.origin !== SITE) return null;
      key = decodeURI(url.pathname).replace(/^\//, "");
    } catch (e) {
      return null;
    }
    return Object.prototype.hasOwnProperty.call(state.assets, key) ? state.assets[key] : null;
  }
  function resolveAssets(fragment) {
    fragment.querySelectorAll("img[src]").forEach(function (el) {
      var url = assetFor(el.getAttribute("src"));
      if (url) el.setAttribute("src", url);
    });
  }

  function makeTemplate(html) {
    var t = document.createElement("template");
    t.innerHTML = html || "";
    sanitize(t.content);
    resolveAssets(t.content);
    return t;
  }

  // The markup each rendered element was made from, so a later render can
  // tell an element that only moved (a section moved, inserted around,
  // duplicated or removed) from one that changed.
  var markupOf = new WeakMap();

  /** A fresh copy of `html` to render, each element remembering its markup. */
  function freshContent(html) {
    var content = makeTemplate(html).content.cloneNode(true);
    content.querySelectorAll("*").forEach(function (el) { markupOf.set(el, el.outerHTML); });
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

  // The sheets a root adopts: every shared sheet, then (for a component's
  // shadow root) that component's own sheet.
  function sheetsFor(root) {
    var out = sharedSheets.map(function (entry) { return entry.sheet; });
    if (root !== document && root.host) {
      var scoped = componentSheetFor(root.host.localName);
      if (scoped) out.push(scoped);
      out.push(runtimeSheet);
    }
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
    state = {
      pages: payload.pages || {},
      pagePaths: payload.pagePaths || {},
      components: payload.components || {},
      componentPaths: payload.componentPaths || {},
      styles: Array.isArray(payload.styles) ? payload.styles : [],
      styleErrors: Array.isArray(payload.styleErrors) ? payload.styleErrors : [],
      componentStyles: payload.componentStyles || {},
      assets: payload.assets || {},
      route: payload.route || "/",
      base: typeof payload.base === "string" ? payload.base : "/",
      sectionTags: Array.isArray(payload.sectionTags) ? payload.sectionTags : [],
      context: String(payload.context || "")
    };
    Object.keys(state.components).forEach(defineTag);
    // Typing not yet sent survives this render (see reconcileNode).
    var typing = !!editing && editing.textContent !== editingText;
    syncStyles();
    state.styleErrors.forEach(reportError);
    renderPage();
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
        if (requested.scrollIntoView) requested.scrollIntoView({ block: "nearest" });
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
      el.style.border = name === "selected" ? "2px solid #2f6d3a" : "1px solid #2f6d3a";
      el.style.background = name === "selected" ? "rgba(47, 109, 58, 0.10)" : "rgba(47, 109, 58, 0.04)";
      document.documentElement.appendChild(el);
      return el;
    }
    hoverBox = make("hover");
    selectBox = make("selected");
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

  function updateBoxes() {
    ensureBoxes();
    drawBox(hoverBox, hovered);
    drawBox(selectBox, selected);
    scheduleRect();
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
          before: next ? itemLabel(children[i]) : ""
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
        before: ""
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
        text: (child.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
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

  // The selected element's frame-viewport rectangle, sent when it may have
  // moved (scroll, resize, render) and only when it actually changed.
  var rectFrame = 0;
  var lastRect = "";
  function scheduleRect() {
    if (rectFrame) return;
    rectFrame = requestAnimationFrame(function () {
      rectFrame = 0;
      if (!selected || !selected.isConnected) { lastRect = ""; return; }
      var rect = rectOf(selected);
      var key = JSON.stringify(rect);
      if (key === lastRect) return;
      lastRect = key;
      emit("selection-rect", { rect: rect });
    });
  }

  // The element at `node` (element-child indexes) under the page root or under the shadow root of the component
  // whose template is `path`, preferring the currently selected instance.
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
        var host = Array.from(instances).find(function (el) { return el.localName === tag && el.isConnected && el.shadowRoot; });
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

  function deepestElement(e) {
    var path = typeof e.composedPath === "function" ? e.composedPath() : [];
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
      // A section component's root <section> is the instance on the page: the
      // page stays open, and Remove takes the instance out of this page alone.
      if (n instanceof Element && n.parentNode instanceof ShadowRoot && sectionLike(n.parentNode.host) && n.parentNode.host.localName !== "section") return n.parentNode.host;
      if (n instanceof Element && n !== document.documentElement && n !== document.body && !n.hasAttribute("data-native-selection-box")) return n;
    }
    return e.target instanceof Element ? e.target : null;
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
  // style panel, which resolves it (shared/cascade.ts). For every style rule
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
      if (sheet === runtimeSheet) return;
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
    payload.rect = rectOf(el);
    lastRect = JSON.stringify(payload.rect);
    emit("select", payload);
  }

  // Styles the runtime itself once injected as elements; shared and component
  // CSS are adopted sheets now, so the source and the DOM have the same
  // element children. Kept so an older frame's markup still maps.
  function injectedStyle(n) {
    return n.localName === "style" && (n.hasAttribute("data-native-css") || n.hasAttribute("data-native-component-css"));
  }

  // Conditional parts of a template (the site's own loader,
  // `components/components.js`, applies the same rules on the live site). A
  // slot has content when the page
  // assigned it something real (an element or non-blank text) or, for the
  // automatic rule, when the template gave it a fallback. An element is
  // hidden when its `data-if="name other"` slots are not all assigned, or
  // automatically when it holds slots, none of them has content, and it has
  // no text of its own: a second button whose slot the page left empty, and
  // the wrapper around two such buttons, simply do not show.
  // Content the page gave the slot; its fallback does not count (flattened
  // alone, a slot with nothing assigned reports its fallback nodes).
  function slotAssigned(slot) {
    if (!slot.assignedNodes().length) return false;
    return slot.assignedNodes({ flatten: true }).some(function (n) {
      return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim());
    });
  }
  function slotHasContent(slot) {
    if (slotAssigned(slot)) return true;
    if (slotConditionUnmet(slot)) return false;
    return Array.prototype.some.call(slot.childNodes, function (n) {
      return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim());
    });
  }
  // `data-if` on a slot: an optional slot, shown (fallback and all) only when
  // the page fills the named slots; a bare `data-if` names the slot itself.
  // Every slot of a section component is optional without it, since each new
  // instance gets its own copy of every fallback, unless the instance fills
  // nothing at all (a bare tag, or the component shown by itself).
  function slotConditionUnmet(slot) {
    var condition = slot.getAttribute("data-if");
    var root = slot.getRootNode();
    if (condition === null) {
      if (!(root instanceof ShadowRoot) || !sectionLike(root.host) || !fillsAnySlot(root.host)) return false;
      condition = "";
    }
    return (condition.trim() || slot.getAttribute("name") || "").split(/\s+/).some(function (name) {
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
    var slotsByName = {};
    root.querySelectorAll("slot").forEach(function (slot) { slotsByName[slot.getAttribute("name") || ""] = slot; });
    root.querySelectorAll("*").forEach(function (el) {
      if (el.localName === "style") return;
      if (el.localName === "slot") {
        if (slotConditionUnmet(el)) el.setAttribute("data-native-empty", "");
        else el.removeAttribute("data-native-empty");
        return;
      }
      var empty = false;
      var condition = el.getAttribute("data-if");
      if (condition !== null) {
        empty = condition.trim().split(/\s+/).some(function (name) {
          var slot = slotsByName[name];
          return !slot || !slotAssigned(slot);
        });
      } else {
        var slots = el.querySelectorAll("slot");
        empty = slots.length > 0 && !Array.prototype.some.call(slots, slotHasContent) && !ownText(el);
      }
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
  document.addEventListener("keydown", function (e) {
    // Alt+Up/Down moves the selected section; the editor does the move. Other
    // elements, and typing in a text element, keep the browser's own behaviour.
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      var active = document.activeElement;
      if (!selected || !selected.isConnected || !sectionLike(selected) || editing || (active && active.isContentEditable)) return;
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
    if (!el || !(TEXT_TAGS.test(el.localName) || textHost(el)) || !(el.textContent || "").trim()) return false;
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
    if (editing === el) return;
    stopEditing(true);
    if (!editableText(el)) return;
    editing = el;
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
    emit("text-edit", { path: ownerPath(editing), node: elementIndexPath(editing), before: before, after: after });
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
    hovered = deepestElement(e);
    updateBoxes();
    reportHover();
  });
  document.documentElement.addEventListener("mouseleave", function () {
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
    "text-decoration-line", "gap", "flex-direction", "justify-content", "align-items", "grid-template-columns"
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

  window.addEventListener("scroll", function () { updateBoxes(); scheduleInsertPoints(); }, true);
  window.addEventListener("resize", function () { updateBoxes(); scheduleInsertPoints(); });
  document.addEventListener("submit", function (e) { e.preventDefault(); });
  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var msg = e.data || {};
    if (msg.source !== "astro-native-preview-host") return;
    if (msg.type === "drag-start" || msg.type === "drag-move" || msg.type === "drag-end" || msg.type === "drag-cancel") {
      dragMessage(msg);
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
    if (msg.type !== "update") return;
    apply(msg.payload || {});
    requestAnimationFrame(function () { emit("ack", { id: msg.id }); });
  });
  pageEl = document.getElementById("page");
  // Layout can shift without a render (fonts, component CSS arriving).
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(function () { scheduleInsertPoints(); scrollToTarget(); }).observe(pageEl);
  parent.postMessage({ source: "astro-native-preview", type: "ready" }, "*");
})();
