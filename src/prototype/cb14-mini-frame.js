// PROTOTYPE (wayfinder ticket 14, components-and-builder). Throwaway; not kept for the real build.
//
// A small read-only page renderer for the prototype's live views of other
// pages (B's "Used on" thumbnails, C's page pane). It runs in its own
// sandboxed frame (src/prototype/cb14-mini.ts loads it) and draws a page from the
// editor's current sources, sent as messages: the page's body, the site's
// shared CSS, and every component's template and CSS, defined here roughly as
// the site's components.js does (shadow root, ::slotted twins, empty parts
// hidden). Every message re-renders the components, so an edit of a template
// shows at once. It outlines the instances of the component being edited,
// marks the counterpart of the selected template part in each, and reports
// clicks on an instance's parts as template paths.
(function () {
  var defs = {};
  var defined = {};
  var sheet = document.createElement("style");
  var marks = document.createElement("div");
  var focusTag = "";
  var highlight = null;
  var lastBody = null;
  var scrolled = "";
  var interactive = false;
  document.head.appendChild(sheet);

  function post(msg) { msg.source = "cb14-mini"; parent.postMessage(msg, "*"); }
  // `h3` also reads `::slotted(h3)`; selectors ::slotted() cannot take are left alone.
  function twins(css) {
    return String(css || "").replace(/(^|[{}])(\s*)([^{}@]+?)(\s*)\{/g, function (all, lead, space, list, tail) {
      if (/^\s*(from|to|\d)/.test(list) || /:host|::|&|:has\(|;|:\s/.test(list)) return all;
      var parts = list.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      var extra = parts.map(function (part) {
        var m = /^(.*?)([^\s>+~]+)$/.exec(part);
        return m ? m[1] + "::slotted(" + m[2] + ")" : null;
      }).filter(Boolean);
      return lead + space + parts.concat(extra).join(", ") + tail + "{";
    });
  }
  function isContent(n) { return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim() !== ""); }
  function hideEmpty(root) {
    var host = root.host;
    var section = /^\s*<section[\s>]/i.test(defs[host.localName].html.replace(/<!--[\s\S]*?-->/g, "")) || host.localName.indexOf("section-") === 0;
    var filled = function (slot) { return slot.assignedNodes().length > 0 && slot.assignedNodes({ flatten: true }).some(isContent); };
    var unmet = function (slot) { return section && Array.prototype.some.call(host.childNodes, isContent) && !filled(slot); };
    var shows = function (slot) { return filled(slot) || (!unmet(slot) && Array.prototype.some.call(slot.childNodes, isContent)); };
    var ownText = function (el) { return Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType === 3 ? n.textContent.trim() !== "" : n.nodeType === 1 && n.localName !== "slot" && ownText(n); }); };
    root.querySelectorAll("*").forEach(function (el) {
      if (el.localName === "style") return;
      var empty;
      if (el.localName === "slot") empty = unmet(el);
      else { var inner = el.querySelectorAll("slot"); empty = inner.length > 0 && !Array.prototype.some.call(inner, shows) && !ownText(el); }
      el.toggleAttribute("data-empty", empty);
    });
  }
  function render(host) {
    var d = defs[host.localName];
    if (!d) return;
    var root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = "<style>" + sheet.textContent + "\n" + twins(d.css) + "\n:host{display:block}[data-empty]{display:none!important}</style>" + d.html;
    if (!root.__cb14) { root.__cb14 = true; root.addEventListener("slotchange", function () { hideEmpty(root); }); }
    hideEmpty(root);
  }
  function define(tag) {
    if (defined[tag]) return;
    defined[tag] = true;
    customElements.define(tag, class extends HTMLElement { connectedCallback() { render(this); } });
  }
  function each(root, visit) {
    root.querySelectorAll("*").forEach(function (el) {
      visit(el);
      if (el.shadowRoot) each(el.shadowRoot, visit);
    });
  }
  function hosts() {
    var out = [];
    each(document, function (el) { if (el.localName === focusTag && el.shadowRoot) out.push(el); });
    return out;
  }
  function walk(root, path) {
    var el = root;
    for (var i = 0; el && i < path.length; i++) el = Array.prototype.filter.call(el.children, function (c) { return c.localName !== "style"; })[path[i]] || null;
    return el && el !== root ? el : null;
  }
  function pathIn(root, el) {
    var out = [];
    for (var at = el; at && at !== root; at = at.parentNode) {
      if (!(at instanceof Element)) return null;
      out.unshift(Array.prototype.filter.call(at.parentNode.children, function (c) { return c.localName !== "style"; }).indexOf(at));
    }
    return at === root ? out : null;
  }
  function boxes() {
    marks.textContent = "";
    hosts().forEach(function (host) {
      add(host, "cb14m-instance");
      if (!highlight) return;
      var part = walk(host.shadowRoot, highlight);
      // A part in a slot the page fills: what the page put there is its counterpart.
      var slot = part;
      while (slot && slot.localName !== "slot") slot = slot.parentElement;
      var shown = slot ? slot.assignedElements() : [];
      if (shown.length) shown.forEach(function (el) { add(el, "cb14m-part"); });
      else if (part && part.localName === "slot") Array.prototype.forEach.call(part.children, function (el) { add(el, "cb14m-part"); });
      else if (part) add(part, "cb14m-part");
    });
  }
  function add(el, cls) {
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    var box = document.createElement("div");
    box.className = cls;
    box.style.cssText = "left:" + (r.left + scrollX) + "px;top:" + (r.top + scrollY) + "px;width:" + r.width + "px;height:" + r.height + "px";
    marks.appendChild(box);
  }
  var MARK_CSS = "#cb14m-marks{position:absolute;left:0;top:0;pointer-events:none;z-index:2147483647}" +
    ".cb14m-instance,.cb14m-part{position:absolute;box-sizing:border-box;border-radius:6px}" +
    ".cb14m-instance{outline:3px solid rgba(124,58,237,.75);outline-offset:3px}" +
    ".cb14m-part{background:rgba(124,58,237,.16);outline:2px solid #7c3aed;outline-offset:1px}" +
    "html{scrollbar-width:none}";

  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var msg = e.data || {};
    if (msg.source !== "cb14-mini-host") return;
    if (msg.type === "render") {
      interactive = !!msg.interactive;
      focusTag = msg.focus || "";
      defs = msg.components || {};
      var css = String(msg.css || "") + "\n" + MARK_CSS;
      if (sheet.textContent !== css) sheet.textContent = css;
      Object.keys(defs).forEach(define);
      if (lastBody !== msg.body) {
        lastBody = msg.body;
        document.body.innerHTML = msg.body;
        marks.id = "cb14m-marks";
        document.body.appendChild(marks);
      } else {
        each(document, function (el) { if (el.shadowRoot && defs[el.localName] && el.getRootNode() === document) render(el); });
      }
      requestAnimationFrame(function () {
        var first = hosts().filter(function (h) { var r = h.getBoundingClientRect(); return r.width > 0 && r.height > 0; })[0];
        if (first && scrolled !== focusTag + msg.body.length) {
          scrolled = focusTag + msg.body.length;
          var r = first.getBoundingClientRect();
          scrollTo(0, Math.max(0, r.top + scrollY - (msg.offset || 40)));
        }
        boxes();
      });
      return;
    }
    if (msg.type === "highlight") { highlight = msg.path || null; boxes(); return; }
  });
  addEventListener("scroll", function () { boxes(); });
  addEventListener("resize", function () { boxes(); });
  document.addEventListener("click", function (e) {
    e.preventDefault();
    if (!interactive) { post({ type: "open" }); return; }
    var path = e.composedPath();
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (!(n instanceof Element)) continue;
      var root = n.getRootNode();
      // Page content in a slot: its slot, in the template.
      if (n.assignedSlot && n.assignedSlot.getRootNode().host && n.assignedSlot.getRootNode().host.localName === focusTag) {
        var slotRoot = n.assignedSlot.getRootNode();
        post({ type: "pick", path: pathIn(slotRoot, n.assignedSlot), page: true });
        return;
      }
      if (root instanceof ShadowRoot && root.host.localName === focusTag) {
        post({ type: "pick", path: pathIn(root, n) });
        return;
      }
    }
    post({ type: "pick", path: null });
  }, true);
  post({ type: "ready" });
})();
