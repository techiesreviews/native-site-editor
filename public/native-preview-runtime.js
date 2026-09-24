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

  function makeTemplate(html) {
    var t = document.createElement("template");
    t.innerHTML = html || "";
    sanitize(t.content);
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
      var componentStyle = componentStyleFor(host.localName);
      stylesList().slice().reverse().forEach(function (item, index) {
        var style = document.createElement("style");
        style.setAttribute("data-native-css", "");
        style.setAttribute("data-native-css-path", String(item.path || ""));
        style.setAttribute("data-key", "native-css-" + (stylesList().length - index - 1));
        style.textContent = String(item.source || "");
        t.content.insertBefore(style, t.content.firstChild);
      });
      // Component CSS follows the shared stylesheets so it wins the cascade at
      // equal specificity; the editor's rule ranking assumes the same order.
      if (componentStyle) {
        var scoped = document.createElement("style");
        scoped.setAttribute("data-native-component-css", "");
        scoped.setAttribute("data-native-css-path", String(componentStyle.path || ""));
        scoped.setAttribute("data-key", "native-component-css");
        scoped.textContent = String(componentStyle.source || "");
        t.content.insertBefore(scoped, t.content.childNodes[stylesList().length] || null);
      }
      reconcileChildren(root, t.content.cloneNode(true));
      syncRootStyles(root);
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

  function syncRootStyles(root) {
    if (!state) return;
    var styles = stylesList();
    var parentNode = root === document ? document.head : root;
    var existing = Array.prototype.slice.call(parentNode.querySelectorAll("style[data-native-css]"));
    styles.forEach(function (item, index) {
      var style = existing[index];
      if (!style) {
        style = document.createElement("style");
        style.setAttribute("data-native-css", "");
        if (root !== document) style.setAttribute("data-key", "native-css-" + index);
        parentNode.appendChild(style);
      }
      style.setAttribute("data-native-css-path", String(item.path || ""));
      style.textContent = String(item.source || "");
    });
    existing.slice(styles.length).forEach(function (style) { style.remove(); });
    if (root !== document) syncComponentStyle(root);
  }

  function syncComponentStyle(root) {
    var host = root.host;
    var item = host && componentStyleFor(host.localName);
    var existing = root.querySelector("style[data-native-component-css]");
    if (!item) {
      if (existing) existing.remove();
      return;
    }
    if (!existing) {
      existing = document.createElement("style");
      existing.setAttribute("data-native-component-css", "");
      existing.setAttribute("data-key", "native-component-css");
      var afterShared = root.querySelectorAll("style[data-native-css]");
      root.insertBefore(existing, afterShared.length ? afterShared[afterShared.length - 1].nextSibling : root.firstChild);
    }
    existing.setAttribute("data-native-css-path", String(item.path || ""));
    if (existing.textContent !== String(item.source || "")) existing.textContent = String(item.source || "");
  }

  function syncStyles() {
    syncRootStyles(document);
    shadowRoots.forEach(syncRootStyles);
  }

  function apply(payload) {
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
    lastHover = null;
    updateBoxes();
    reportHover();
    if (selected) emitSelection(selected, "refresh");
    else if (hadSelection) emit("select", { path: "", tag: "", text: "", reason: "refresh", selectors: [] });
    // Text the host just formatted stays selected, so the next format applies to it too.
    if (selected && payload.selectText && typeof payload.selectText.start === "number") setTextSelection(selected, payload.selectText.start, payload.selectText.end);
    reportTextSelection(true);
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

  // The element at `node` (element-child indexes, injected styles not
  // counted) under the page root or under the shadow root of the component
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
    var sheets = root && root.styleSheets ? root.styleSheets : document.styleSheets;
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
          var owner = rule.parentStyleSheet && rule.parentStyleSheet.ownerNode;
          var path = owner && owner.getAttribute ? owner.getAttribute("data-native-css-path") || "" : "";
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
      var sheet = sheets[s];
      if (!applicableSheet(sheet, root)) continue;
      try { walk(sheet.cssRules, true); } catch (_) {}
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

  function injectedStyle(n) {
    return n.localName === "style" && (n.hasAttribute("data-native-css") || n.hasAttribute("data-native-component-css"));
  }

  // Element-child indexes from the page or component root down to `el`, not
  // counting the stylesheets the runtime injects, so the editor can find the
  // element's start tag in the source.
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
  // element's text content, so the host can wrap or unwrap that range.
  function selectionRangeIn(el) {
    var sel = null;
    var root = el.getRootNode && el.getRootNode();
    if (root instanceof ShadowRoot && typeof root.getSelection === "function") sel = root.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) sel = document.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
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
      var range = selectionRangeIn(selected);
      if (range) {
        var start = textOffset(selected, range.startContainer, range.startOffset);
        var end = textOffset(selected, range.endContainer, range.endOffset);
        if (end > start) payload = { start: start, end: end, text: range.cloneContents().textContent, wrappers: wrappersAround(selected, range.commonAncestorContainer) };
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
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    var key = e.key.toLowerCase();
    if (key !== "b" && key !== "i") return;
    e.preventDefault();
    commitEditing();
    // The host formats the selection it knows, so it hears of it first.
    flushTextSelection();
    emit("format", { format: key === "b" ? "strong" : "em" });
  });

  // Typing into the selected text element: a text element whose content is
  // only text and inline formatting becomes editable on the pointer press
  // that selects it, so the caret lands where it was clicked. The editor gets
  // the element's text before and after on Enter, on blur and before a format
  // shortcut, and writes the difference into the source.
  var TEXT_TAGS = /^(h[1-6]|p|span|a|li|button|blockquote|figcaption|small|label|td|th|dt|dd|div|summary|legend|caption|strong|em|b|i|cite|q|mark|code)$/;
  var INLINE_TAGS = /^(a|strong|em|b|i|u|s|span|small|code|mark|sub|sup|br|wbr|abbr|time|cite|q|kbd)$/;
  function editableText(el) {
    if (!el || !TEXT_TAGS.test(el.localName) || !(el.textContent || "").trim()) return false;
    var all = el.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) if (!INLINE_TAGS.test(all[i].localName)) return false;
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
    hovered = deepestElement(e);
    updateBoxes();
    reportHover();
  });
  document.documentElement.addEventListener("mouseleave", function () {
    hovered = null;
    updateBoxes();
    reportHover();
  });
  window.addEventListener("scroll", function () { updateBoxes(); scheduleInsertPoints(); }, true);
  window.addEventListener("resize", function () { updateBoxes(); scheduleInsertPoints(); });
  document.addEventListener("submit", function (e) { e.preventDefault(); });
  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var msg = e.data || {};
    if (msg.source !== "astro-native-preview-host") return;
    if (msg.type === "clear-selection") {
      clearSelectionState();
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
