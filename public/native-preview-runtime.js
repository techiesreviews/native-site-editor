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
    var keyed = new Map();
    Array.prototype.slice.call(target.childNodes).forEach(function (n) {
      var k = nodeKey(n);
      if (k) keyed.set(k, n);
    });
    desired.forEach(function (next, index) {
      var key = nodeKey(next);
      var currentAtIndex = target.childNodes[index] || null;
      var existing = key ? keyed.get(key) : currentAtIndex;
      if (!sameKind(existing, next)) {
        target.insertBefore(next, currentAtIndex);
        if (currentAtIndex && !keyed.has(nodeKey(currentAtIndex))) currentAtIndex.remove();
        return;
      }
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
    reconcileChildren(existing, desired);
  }

  function syncAttrs(existing, desired) {
    Array.prototype.slice.call(existing.attributes).forEach(function (a) {
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
    state = {
      pages: payload.pages || {},
      pagePaths: payload.pagePaths || {},
      components: payload.components || {},
      componentPaths: payload.componentPaths || {},
      styles: Array.isArray(payload.styles) ? payload.styles : [],
      componentStyles: payload.componentStyles || {},
      route: payload.route || "/",
      context: String(payload.context || "")
    };
    Object.keys(state.components).forEach(defineTag);
    syncStyles();
    renderPage();
    if (!hadError) emit("clear-error");
    if (selected && !selected.isConnected) selected = null;
    updateBoxes();
    if (selected) emitSelection(selected, "refresh");
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
    if (link !== undefined) payload.link = link;
    emit("select", payload);
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

  function clearSelectionState() {
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
  });
  document.addEventListener("mouseleave", function () {
    hovered = null;
    updateBoxes();
  });
  window.addEventListener("scroll", updateBoxes, true);
  window.addEventListener("resize", updateBoxes);
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
  parent.postMessage({ source: "astro-native-preview", type: "ready" }, "*");
})();
