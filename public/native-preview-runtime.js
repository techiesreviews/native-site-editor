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
  // Shared stylesheets as constructed sheets: one CSSStyleSheet per manifest
  // entry for the whole document, adopted by the document and by every
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
  var sheetPaths = new WeakMap();

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

  // Repository image paths (as written in `src`, or with a leading "/" or
  // "./") shown from the data URLs the host read for them.
  function assetFor(src) {
    if (!state || !state.assets || typeof src !== "string") return null;
    var key = src.replace(/^\.?\//, "").split(/[?#]/)[0];
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

  function nodeKey(n) { return n.nodeType === 1 ? n.getAttribute("data-key") : null; }

  function sameKind(a, b) {
    if (!a || !b || a.nodeType !== b.nodeType) return false;
    if (a.nodeType === 3) return true;
    return a.nodeType === 1 && a.tagName === b.tagName;
  }

  function reconcileChildren(target, fragment) {
    var desired = Array.prototype.slice.call(fragment.childNodes);
    // Existing nodes per key, in order: a key that appears twice in the
    // source (a duplicated element) pairs with its own existing node instead
    // of folding both into one.
    var keyed = new Map();
    var keyedNodes = new Set();
    Array.prototype.slice.call(target.childNodes).forEach(function (n) {
      var k = nodeKey(n);
      if (!k) return;
      if (!keyed.has(k)) keyed.set(k, []);
      keyed.get(k).push(n);
      keyedNodes.add(n);
    });
    desired.forEach(function (next, index) {
      var key = nodeKey(next);
      var currentAtIndex = target.childNodes[index] || null;
      var existing = key ? (keyed.get(key) || [])[0] || null : currentAtIndex;
      if (!sameKind(existing, next)) {
        target.insertBefore(next, currentAtIndex);
        if (currentAtIndex && !keyedNodes.has(currentAtIndex)) currentAtIndex.remove();
        return;
      }
      if (key) keyed.get(key).shift();
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
      var t = makeTemplate(html);
      reconcileChildren(root, t.content.cloneNode(true));
      syncRootStyles(root);
      watchSlots(root);
      applyEmptyRules(root);
    } finally {
      renderDepth--;
    }
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
          if (!state || state.components[tag] === undefined) return;
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
    var t = makeTemplate(html);
    reconcileChildren(pageEl, t.content.cloneNode(true));
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

  // Fills a constructed sheet from `item` ({ path, source }), replacing its
  // rules only when the source changed.
  function fillSheet(entry, item) {
    entry.path = String(item.path || "");
    sheetPaths.set(entry.sheet, entry.path);
    var source = String(item.source || "");
    if (entry.source === source) return;
    entry.source = source;
    try {
      entry.sheet.replaceSync(source);
    } catch (e) {
      reportError("Stylesheet " + entry.path + " could not be applied: " + (e && e.message ? e.message : e));
    }
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
      componentStyles: payload.componentStyles || {},
      assets: payload.assets || {},
      route: payload.route || "/",
      sectionTags: Array.isArray(payload.sectionTags) ? payload.sectionTags : [],
      context: String(payload.context || "")
    };
    Object.keys(state.components).forEach(defineTag);
    // Typing not yet sent survives this render (see reconcileNode).
    var typing = !!editing && editing.textContent !== editingText;
    syncStyles();
    renderPage();
    if (!hadError) emit("clear-error");
    var hadSelection = !!selected;
    // An edit may replace the selected element (a renamed heading, an undo):
    // the same position is selected again, unless the host asks for another.
    if (selected && !selected.isConnected) selected = (previous && previous.node && resolveNodePath(previous)) || null;
    // A replaced element (a renamed heading, an undo) stays typeable.
    var wasEditing = !!editing;
    if (editing && !editing.isConnected) editing = null;
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
    return out;
  }

  // The item under the pointer among the children of a section-holding
  // element (sections themselves, from inside their shadow trees too), so the
  // editor shows only the plus buttons just above and below it.
  function hoveredItem() {
    if (!pageEl) return null;
    var current = hovered;
    while (current && current !== pageEl) {
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
        children: structureItems(child, depth + 1)
      });
    }
    return out;
  }
  // The heading that names a container: the first one inside it that no
  // nested section, article or other landmark claims first (so <main> is not
  // named by its first section's heading). For a component instance, the
  // first heading at the top of its template.
  var SECTIONING = "section,article,main,header,footer,nav,aside";
  function ownHeading(el) {
    if (el.matches("h1,h2,h3,h4,h5,h6")) return null;
    var list = el.querySelectorAll("h1,h2,h3,h4,h5,h6");
    for (var i = 0; i < list.length; i++) {
      var owner = list[i].closest(SECTIONING);
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
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      // A slot is how a template shows text, not an element of its own: its parent is the target.
      if (n instanceof HTMLSlotElement) continue;
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
    if (sheetPaths.has(sheet)) return sheetPaths.get(sheet);
    var owner = sheet.ownerNode;
    return owner && owner.getAttribute ? owner.getAttribute("data-native-css-path") || "" : "";
  }

  function conditionApplies(rule) {
    if (typeof CSSMediaRule !== "undefined" && rule instanceof CSSMediaRule)
      return !rule.conditionText || matchMedia(rule.conditionText).matches;
    if (typeof CSSSupportsRule !== "undefined" && rule instanceof CSSSupportsRule)
      return !rule.conditionText || (CSS.supports && CSS.supports(rule.conditionText));
    return true;
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

  function matchingRules(el) {
    var root = el.getRootNode && el.getRootNode();
    var sheets = sheetsIn(root instanceof ShadowRoot ? root : document);
    var out = [], ruleIndexes = {};
    function nextRuleIndex(path) {
      path = path || ownerPath(el);
      var value = ruleIndexes[path] || 0;
      ruleIndexes[path] = value + 1;
      return value;
    }
    function walk(rules, active) {
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (typeof CSSStyleRule !== "undefined" && rule instanceof CSSStyleRule) {
          var path = sheetPath(rule.parentStyleSheet);
          var currentIndex = nextRuleIndex(path);
          if (!active) continue;
          splitSelectorList(rule.selectorText).forEach(function (selector) {
            try {
              if (el.matches(selector)) {
              out.push({ path: path || ownerPath(el), selector: selector, ruleIndex: currentIndex });
            }
            } catch (_) {}
          });
        } else if (rule.cssRules) {
          walk(rule.cssRules, active && conditionApplies(rule));
        }
      }
    }
    for (var s = 0; s < sheets.length; s++) {
      try { walk(sheets[s].cssRules, true); } catch (_) {}
    }
    return out;
  }

  function emitSelection(el, reason) {
    var path = ownerPath(el);
    if (!path) return;
    var link = nearestLinkHref(el);
    var payload = {
      path: path,
      tag: el.localName,
      text: (el.textContent || "").trim().slice(0, 1000),
      reason: reason || "click",
      selectors: matchingRules(el)
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

  // Conditional parts of a template (shared/native-conditionals.ts has the
  // exporter's copy of these rules). A slot has content when the page
  // assigned it something real (an element or non-blank text) or, for the
  // automatic rule, when the template gave it a fallback. An element is
  // hidden when its `data-if="name other"` slots are not all assigned, or
  // automatically when it holds slots, none of them has content, and it has
  // no text of its own: a second button whose slot the page left empty, and
  // the wrapper around two such buttons, simply do not show.
  function slotAssigned(slot) {
    return slot.assignedNodes({ flatten: true }).some(function (n) {
      return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim());
    });
  }
  function slotHasContent(slot) {
    if (slotAssigned(slot)) return true;
    return Array.prototype.some.call(slot.childNodes, function (n) {
      return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim());
    });
  }
  function applyEmptyRules(root) {
    var slotsByName = {};
    root.querySelectorAll("slot").forEach(function (slot) { slotsByName[slot.getAttribute("name") || ""] = slot; });
    root.querySelectorAll("*").forEach(function (el) {
      if (el.localName === "style" || el.localName === "slot") return;
      var empty = false;
      var condition = el.getAttribute("data-if");
      if (condition !== null) {
        empty = condition.trim().split(/\s+/).some(function (name) {
          var slot = slotsByName[name];
          return !slot || !slotAssigned(slot);
        });
      } else {
        var slots = el.querySelectorAll("slot");
        empty = slots.length > 0 && !Array.prototype.some.call(slots, slotHasContent) && !el.textContent.trim();
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
    if (!el || !TEXT_TAGS.test(el.localName) || !(el.textContent || "").trim()) return false;
    var all = el.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      if (!INLINE_TAGS.test(all[i].localName)) return false;
      // A slot showing the page's own text: that text is the thing to edit, not the template's fallback.
      if (all[i] instanceof HTMLSlotElement && all[i].assignedNodes().length) return false;
    }
    return true;
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
      var href = link.getAttribute("href");
      if (href && href.charAt(0) === "#") {
        e.preventDefault();
        e.stopPropagation();
        emit("route", { route: href.slice(1) || "/" });
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
    if (msg.type !== "update") return;
    apply(msg.payload || {});
    requestAnimationFrame(function () { emit("ack", { id: msg.id }); });
  });
  pageEl = document.getElementById("page");
  // Layout can shift without a render (fonts, component CSS arriving).
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(scheduleInsertPoints).observe(pageEl);
  parent.postMessage({ source: "astro-native-preview", type: "ready" }, "*");
})();
