// PROTOTYPE (wayfinder ticket 12, components-and-builder). Throwaway; not kept for the real build.
//
// Runs inside the preview frame, next to native-preview-runtime.js, and only
// when the editor was opened with ?proto=blocks (src/prototype/cb12.ts adds
// the <script> to the frame's document). It answers `cb12` host messages:
//   dump         every page element with its node path, box and layout, and
//                each instance's slots (assigned items, boxes, items or not)
//   css          one extra stylesheet (empty drop areas, .btn, drag states)
//   placeholder  a gap that opens at a place (variant B), or none
//   mark         the element being moved fades or hides
//   keys         which keys go to the editor instead of the page
// The editor owns the pointer and all decisions; this only measures.
(function () {
  var styleEl = null;
  var keyMode = "alt";
  var placeholder = null;

  function page() { return document.getElementById("page"); }
  function skip(el) {
    return (el.localName === "style" && (el.hasAttribute("data-native-css") || el.hasAttribute("data-native-component-css")))
      || el.hasAttribute("data-cb12-ph") || el.hasAttribute("data-native-selection-box");
  }
  function kids(el) { return Array.prototype.filter.call(el.children, function (c) { return !skip(c); }); }
  function box(el) {
    var r = el.getBoundingClientRect();
    return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10];
  }
  function union(list) {
    var out = null;
    list.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (!out) out = [r.left, r.top, r.right, r.bottom];
      else out = [Math.min(out[0], r.left), Math.min(out[1], r.top), Math.max(out[2], r.right), Math.max(out[3], r.bottom)];
    });
    return out ? [out[0], out[1], out[2] - out[0], out[3] - out[1]] : null;
  }
  // Items run in a row when two in a row share a top and the second is to the right.
  function rowOf(list) {
    var rects = list.map(function (el) { return el.getBoundingClientRect(); }).filter(function (r) { return r.width || r.height; });
    for (var i = 1; i < rects.length; i++) {
      if (Math.abs(rects[i].top - rects[i - 1].top) < 2 && rects[i].left > rects[i - 1].left + 1) return true;
    }
    return false;
  }
  // A container with fewer than two items: its own layout says.
  function layoutRow(el) {
    var cs = getComputedStyle(el);
    if (cs.display.indexOf("grid") >= 0) return cs.gridTemplateColumns.split(" ").filter(Boolean).length > 1;
    if (cs.display.indexOf("flex") >= 0) return cs.flexDirection.indexOf("row") === 0;
    return false;
  }
  function text(el) {
    var h = el.matches("h1,h2,h3,h4,h5,h6") ? el : el.querySelector("h1,h2,h3,h4,h5,h6");
    var t = ((h || el).textContent || "").replace(/\s+/g, " ").trim();
    return t.slice(0, 48);
  }
  function kindKey(el) { return el.localName + "." + (el.getAttribute("class") || "").trim().split(/\s+/).sort().join("."); }

  function slotsOf(host) {
    var root = host.shadowRoot;
    if (!root) return [];
    var children = kids(host);
    return Array.prototype.map.call(root.querySelectorAll("slot"), function (slot) {
      var assigned = slot.assignedElements().filter(function (el) { return !el.hasAttribute("data-cb12-ph"); });
      var counts = {};
      var most = 0;
      assigned.forEach(function (el) { var k = kindKey(el); counts[k] = (counts[k] || 0) + 1; most = Math.max(most, counts[k]); });
      var fallbackCard = Array.prototype.some.call(slot.children, function (el) { return el.localName.indexOf("-") > 0; });
      var parentEl = slot.parentElement || host;
      var shown = getComputedStyle(slot).display !== "none" && !(parentEl.closest && parentEl.closest("[data-native-empty]"));
      return {
        name: slot.getAttribute("name") || "",
        a: assigned.map(function (el) { return children.indexOf(el); }).filter(function (i) { return i >= 0; }),
        r: union(assigned) || (slot.childElementCount ? union(Array.prototype.slice.call(slot.children)) : null),
        pr: box(parentEl),
        row: assigned.length > 1 ? rowOf(assigned) : layoutRow(parentEl),
        items: !slot.getAttribute("name") || most >= 2 || fallbackCard,
        shown: shown
      };
    });
  }

  function walk(el, path, out) {
    kids(el).forEach(function (c, i) {
      var p = path.concat(i);
      var cs = getComputedStyle(c);
      var list = kids(c);
      var node = {
        p: p, t: c.localName, c: c.getAttribute("class") || "", s: c.getAttribute("slot"), r: box(c), d: cs.display,
        row: list.length > 1 ? rowOf(list) : layoutRow(c), txt: text(c), n: list.length,
        hid: c.hasAttribute("data-cb12-hidden")
      };
      if (c.localName.indexOf("-") > 0) node.slots = slotsOf(c);
      out.push(node);
      walk(c, p, out);
    });
  }

  function nodesNow() {
    var root = page();
    var nodes = [];
    if (root) walk(root, [], nodes);
    return nodes;
  }
  // With a gap open (variant B), the page is measured twice in one task:
  // as shown (`live`, for drawing) and without the gap (`nodes`, for picking
  // targets, so the gap never moves what the pointer is over).
  function dump() {
    if (placeholder && placeholder.isConnected) {
      var live = nodesNow();
      var ph = box(placeholder);
      placeholder.style.display = "none";
      var bare = nodesNow();
      placeholder.style.display = "";
      return { nodes: bare, live: live, ph: ph, vw: innerWidth, vh: innerHeight, sy: scrollY };
    }
    return { nodes: nodesNow(), ph: null, vw: innerWidth, vh: innerHeight, sy: scrollY };
  }

  function at(path) {
    var el = page();
    for (var i = 0; el && i < path.length; i++) el = kids(el)[path[i]];
    return el || null;
  }

  function setPlaceholder(msg) {
    if (placeholder) placeholder.remove();
    placeholder = null;
    if (!msg.parent) return;
    var parentEl = at(msg.parent);
    if (!parentEl) return;
    var ph = document.createElement("div");
    ph.setAttribute("data-cb12-ph", "");
    ph.className = "cb12-ph" + (msg.row ? " cb12-ph--row" : "") + (msg.refused ? " cb12-ph--refused" : "");
    if (msg.slot) ph.setAttribute("slot", msg.slot);
    if (msg.w) ph.style.width = msg.w + "px";
    if (msg.h) ph.style.minHeight = msg.h + "px";
    var ghost = document.createElement("div");
    ghost.className = "cb12-ph__ghost";
    // Static, sanitised by the editor: the block's own markup, shown faded.
    ghost.innerHTML = String(msg.html || "");
    ghost.querySelectorAll("script").forEach(function (s) { s.remove(); });
    ph.appendChild(ghost);
    if (msg.label) {
      var tag = document.createElement("span");
      tag.className = "cb12-ph__label";
      tag.textContent = msg.label;
      ph.appendChild(tag);
    }
    var ref = kids(parentEl)[msg.index] || null;
    parentEl.insertBefore(ph, ref);
    placeholder = ph;
    if (msg.reveal) ph.scrollIntoView({ block: "nearest" });
  }

  function mark(msg) {
    document.querySelectorAll("[data-cb12-moving],[data-cb12-hidden]").forEach(function (el) {
      el.removeAttribute("data-cb12-moving");
      el.removeAttribute("data-cb12-hidden");
    });
    if (!msg.node) return;
    var el = at(msg.node);
    if (el) el.setAttribute(msg.mode === "hide" ? "data-cb12-hidden" : "data-cb12-moving", "");
  }

  function reply(id, extra) {
    var out = { source: "cb12-proto", id: id };
    for (var k in extra) out[k] = extra[k];
    parent.postMessage(out, "*");
  }

  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var msg = e.data || {};
    if (msg.source !== "astro-native-preview-host" || msg.type !== "cb12") return;
    if (msg.op === "css") {
      if (!styleEl) { styleEl = document.createElement("style"); styleEl.id = "cb12-proto-style"; document.head.appendChild(styleEl); }
      if (styleEl.textContent !== msg.css) styleEl.textContent = msg.css;
      document.documentElement.setAttribute("data-cb12", msg.state || "");
    } else if (msg.op === "placeholder") setPlaceholder(msg);
    else if (msg.op === "mark") mark(msg);
    else if (msg.op === "keys") keyMode = msg.mode || "alt";
    else if (msg.op === "scroll") window.scrollBy(0, Number(msg.dy) || 0);
    else if (msg.op === "reveal") { var el = at(msg.node || []); if (el) el.scrollIntoView({ block: "center" }); }
    if (msg.id !== undefined) requestAnimationFrame(function () { reply(msg.id, { dump: dump() }); });
  });

  // Alt+arrows (and, in variant B's insert mode, every arrow, Enter and
  // Escape) go to the editor; they come first, before the runtime's keys.
  function typing(e) {
    var t = typeof e.composedPath === "function" ? e.composedPath()[0] : e.target;
    // Text being edited in place still hands Alt+arrows to the block (a prototype choice).
    return t instanceof Element && /^(input|textarea|select)$/.test(t.localName);
  }
  window.addEventListener("keydown", function (e) {
    var arrow = /^Arrow(Up|Down|Left|Right)$/.test(e.key);
    var take = keyMode === "all" ? (arrow || e.key === "Enter" || e.key === "Escape") : (arrow && e.altKey && !e.ctrlKey && !e.metaKey && !typing(e));
    if (!take) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    parent.postMessage({ source: "cb12-proto", type: "key", key: e.key, alt: e.altKey, shift: e.shiftKey }, "*");
  }, true);
})();
