// Astro Site Editor preview annotations (throwaway proof for ticket 06).
// Adds data-ase="<file>:<start>:<end>" to HTML elements whose entire content is
// one literal text node, so the editor can map a clicked element back to the
// exact source bytes, and data-ase-href for a literal href attribute so links
// can be retargeted. Elements with expressions or nested markup get a
// data-ase-reason instead. Only used by the preview build; the live build and
// the project's own `astro build` never see this file.
import { parse } from "@astrojs/compiler-rs";
import { join, relative } from "node:path";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readTextAttributes } from "./text-attributes.mjs";
import { textSizeOptions } from "./text-options.mjs";

export const overlay = String.raw`
if (window.parent !== window) {
  const style = document.createElement("style");
  style.textContent = "[data-ase]{cursor:text;outline-offset:2px}[data-ase]:hover{outline:2px dashed var(--ase-editor-focus, Highlight)}[data-ase][contenteditable]{outline:2px solid var(--ase-editor-focus, Highlight);cursor:text}[data-ase][contenteditable]:focus{outline-color:var(--ase-editor-focus, Highlight)}[data-ase-readonly] [data-ase]{cursor:default}[data-ase-readonly] [data-ase]:hover{outline:none}";
  document.head.append(style);
  const pageRevision = new URL(location.href).searchParams.get("astro-editor-rev");
  const post = (message) => window.parent.postMessage({ source: "astro-site-editor", path: location.pathname, revision: pageRevision, ...message }, "*");
  // A "before" frame in the editor's comparison view shows the build untouched.
  let readOnly = false;
  let structuralCommitId = "";
  // Offsets are counted in source characters: text that needs escaping in an
  // Astro template is stored escaped, while the page shows the plain text.
  const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
  const unescape = (text) => text.replace(/&#123;/g, "{").replace(/&#125;/g, "}").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  function headingMarkup(element) {
    let value = "";
    const visit = (node) => {
      if (node.nodeType === Node.TEXT_NODE) { value += escape(node.textContent); return true; }
      if (node.nodeType !== Node.ELEMENT_NODE || !/^(STRONG|EM)$/.test(node.tagName) || node.attributes.length) return false;
      const tag = node.tagName.toLowerCase();
      value += "<" + tag + ">";
      for (const child of node.childNodes) if (!visit(child)) return false;
      value += "</" + tag + ">";
      return true;
    };
    for (const child of element.childNodes) if (!visit(child)) return null;
    const leading = decodeURIComponent(element.getAttribute("data-ase-heading-leading") ?? "");
    const trailing = decodeURIComponent(element.getAttribute("data-ase-heading-trailing") ?? "");
    return leading + value + trailing;
  }
  function replaceHeadingMarkup(element, markup) {
    const leading = decodeURIComponent(element.getAttribute("data-ase-heading-leading") ?? "");
    const trailing = decodeURIComponent(element.getAttribute("data-ase-heading-trailing") ?? "");
    if (!markup.startsWith(leading) || !markup.endsWith(trailing)) return false;
    markup = markup.slice(leading.length, markup.length - trailing.length || undefined);
    const fragment = document.createDocumentFragment();
    const stack = [fragment];
    let at = 0;
    const token = /<\/?(?:strong|em)>/gi;
    for (let match; (match = token.exec(markup));) {
      const before = markup.slice(at, match.index);
      if (before.includes("<") || before.includes(">")) return false;
      stack.at(-1).append(document.createTextNode(unescape(before)));
      const closing = match[0][1] === "/";
      const tag = match[0].replace(/[<\/ >]/g, "").toLowerCase();
      if (closing) {
        if (stack.length === 1 || stack.at(-1).nodeName.toLowerCase() !== tag) return false;
        stack.pop();
      } else {
        const child = document.createElement(tag);
        stack.at(-1).append(child);
        stack.push(child);
      }
      at = token.lastIndex;
    }
    const after = markup.slice(at);
    if (stack.length !== 1 || after.includes("<") || after.includes(">")) return false;
    stack[0].append(document.createTextNode(unescape(after)));
    element.replaceChildren(fragment);
    return true;
  }
  const parseLoc = (loc) => { const m = /^(.*):(\d+):(\d+)$/.exec(loc); return m && { file: m[1], start: Number(m[2]), end: Number(m[3]) }; };
  // Replaces the source range held in attr (data-ase for text, data-ase-href
  // for a link) of one element and shifts every later range in that file.
  const locAttrs = ["data-ase", "data-ase-href", "data-ase-heading-open", "data-ase-heading-close", "data-ase-heading-style", "data-ase-heading-style-value", "data-ase-heading-style-insert", "data-ase-button-style-class", "data-ase-button-style-value", "data-ase-button-slot-parent"];
  function shiftSourceRanges(file, start, end, text) {
    const delta = text.length - (end - start);
    if (!delta) {
      for (const element of document.querySelectorAll("[data-ase-structural-fresh]"))
        element.removeAttribute("data-ase-structural-fresh");
      return;
    }
    for (const name of locAttrs) for (const element of document.querySelectorAll("[" + name + "]")) {
      if (element.hasAttribute("data-ase-structural-fresh") && name !== "data-ase-button-slot-parent") continue;
      const at = parseLoc(element.getAttribute(name));
      if (at?.file === file && at.start >= end)
        element.setAttribute(name, file + ":" + (at.start + delta) + ":" + (at.end + delta));
      else if (name === "data-ase-button-slot-parent" && at?.file === file && at.start < start && at.end >= end)
        element.setAttribute(name, file + ":" + at.start + ":" + (at.end + delta));
    }
    for (const element of document.querySelectorAll("[data-ase-structural-fresh]"))
      element.removeAttribute("data-ase-structural-fresh");
  }
  let lastStructuralShift = null;
  function updateHeadingStyleMapping(element, file, start, end, text) {
    const wasInsert = element.hasAttribute("data-ase-heading-style-insert");
    const ownsSpace = wasInsert || element.hasAttribute("data-ase-heading-style-owned-space");
    shiftSourceRanges(file, start, end, text);
    if (text) {
      const match = /(?:^|\s)style\s*=\s*(["'])/i.exec(text);
      if (match) {
        const relativeStyle = match.index;
        const attributeStart = start + relativeStyle + (!ownsSpace && /\s/.test(text[relativeStyle]) ? 1 : 0);
        const quote = match.index + match[0].lastIndexOf(match[1]);
        const closeQuote = text.indexOf(match[1], quote + 1);
        if (quote >= 0 && closeQuote >= 0) {
          element.removeAttribute("data-ase-heading-style-insert");
          element.toggleAttribute("data-ase-heading-style-owned-space", ownsSpace);
          element.setAttribute("data-ase-heading-style", file + ":" + attributeStart + ":" + (start + closeQuote + 1));
          element.setAttribute("data-ase-heading-style-value", file + ":" + (start + quote + 1) + ":" + (start + closeQuote));
          return;
        }
      }
    }
    element.removeAttribute("data-ase-heading-style");
    element.removeAttribute("data-ase-heading-style-value");
    element.removeAttribute("data-ase-heading-style-owned-space");
    const insert = text.endsWith(">") ? start + text.length - 1 : start;
    element.setAttribute("data-ase-heading-style-insert", file + ":" + insert + ":" + insert);
  }
  function applyChange(element, text, attr = "data-ase") {
    const at = parseLoc(element.getAttribute(attr));
    const delta = text.length - (at.end - at.start);
    for (const name of locAttrs) {
      for (const other of document.querySelectorAll("[" + name + "]")) {
        if (other === element && name === attr) continue;
        const o = parseLoc(other.getAttribute(name));
        if (o.file === at.file && o.start >= at.end)
          other.setAttribute(name, o.file + ":" + (o.start + delta) + ":" + (o.end + delta));
      }
    }
    element.setAttribute(attr, at.file + ":" + at.start + ":" + (at.start + text.length));
    return at;
  }
  function applyPatch(element, text, attr) {
    const activeEdit = editing?.element === element && attr !== "href";
    if (activeEdit) saveSelection();
    if (attr === "href") {
      element.setAttribute("href", text);
      applyChange(element, text, "data-ase-href");
    } else {
      if (element.hasAttribute("data-ase-heading-open")) {
        if (!replaceHeadingMarkup(element, text)) return;
      } else element.textContent = unescape(text);
      applyChange(element, text);
    }
    if (activeEdit) {
      editing.original = text;
      editing.previous = text;
      element.setAttribute("contenteditable", "true");
      element.focus();
      restoreSelection(element);
      formatState();
    }
  }
  function linkOf(element) {
    const loc = element.getAttribute("data-ase-href");
    return loc ? { loc, value: element.getAttribute("href") ?? "" } : undefined;
  }
  function linkInventory() {
    return [...document.querySelectorAll("[data-ase][data-ase-href]")].map((element) => ({
      loc: element.getAttribute("data-ase-href"), value: element.getAttribute("href") ?? "",
      body: element.getAttribute("data-ase"), text: element.hasAttribute("data-ase-heading-open") ? headingMarkup(element) : escape(element.textContent),
    }));
  }
  const readTextAttributes = ${readTextAttributes.toString()};
  function simpleClassSelectorList(selectorText) {
    const selectors = String(selectorText ?? "").split(",")
      .map(part => part.trim().replace(/\[data-astro-cid-[^\]]*\]/g, ""));
    return selectors.length && selectors.every(selector => /^\.[a-zA-Z_][\w-]*$/.test(selector)) ? selectors : null;
  }
  function authoredFontSize(element) {
    if (element.style.fontSize) return element.style.fontSize;
    let value = "";
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (!simpleClassSelectorList(rule.selectorText)) continue;
          if (element.matches(rule.selectorText) && rule.style.fontSize) value = rule.style.fontSize;
        }
      } catch {}
    }
    return value;
  }
  function selectorExists(element, baseClass, className = "", variants = []) {
    const probe = element.cloneNode(false);
    for (const value of variants) if (value) probe.classList.remove(value);
    if (className) probe.classList.add(className);
    const splitSelectors = (text) => String(text ?? "").split(",").map(part => part.trim().replace(/\[data-astro-cid-[^\]]*\]/g, "")).filter(Boolean);
    const expandSelectors = (parents, selectorText) => {
      const parts = splitSelectors(selectorText);
      if (!parents.length) return parts;
      return parts.flatMap(part => part.includes("&")
        ? parents.map(parent => part.replaceAll("&", parent))
        : part.startsWith(":")
          ? parents.map(parent => parent + part)
          : [part]);
    };
    const mentionsBase = (text) => text.includes("." + baseClass);
    const matches = (text) => {
      if (!mentionsBase(text)) return false;
      if (className && !text.includes("." + className)) return false;
      try { return probe.matches(text); } catch { return false; }
    };
    const visit = (rules, parents = []) => {
      for (const rule of rules) {
        const selectors = expandSelectors(parents, rule.selectorText);
        if (selectors.some(matches)) return true;
        if (rule.cssRules && rule.cssRules.length && visit(rule.cssRules, selectors.length ? selectors : parents)) return true;
      }
      return false;
    };
    for (const sheet of document.styleSheets) {
      try {
        if (visit(sheet.cssRules)) return true;
      } catch {}
    }
    return false;
  }
  function buttonStyleOf(element) {
    const classAttr = element.getAttribute("data-ase-button-style-class");
    const classValue = element.getAttribute("data-ase-button-style-value");
    const baseClass = element.getAttribute("data-ase-button-style-base");
    const allVariants = ["primary", "secondary", "outline", "link"]
      .map(value => element.getAttribute("data-ase-button-style-" + value) ?? "")
      .filter(Boolean);
    if (!classAttr || !classValue || !baseClass || !element.classList.contains(baseClass) ||
        !selectorExists(element, baseClass, "", allVariants)) return undefined;
    if ([...document.querySelectorAll("[data-ase-button-style-value]")].filter(candidate =>
        candidate.getAttribute("data-ase-button-style-value") === classValue).length !== 1) return undefined;
    const present = allVariants.filter(className => element.classList.contains(className));
    if (present.length > 1 || present.some(className => !selectorExists(element, baseClass, className, allVariants))) return undefined;
    const variants = {};
    for (const value of ["primary", "secondary", "outline", "link"]) {
      const className = element.getAttribute("data-ase-button-style-" + value) ?? "";
      if (value !== "primary" && (!className || !selectorExists(element, baseClass, className, allVariants))) continue;
      variants[value] = className;
    }
    if (!Object.hasOwn(variants, "primary")) return undefined;
    const active = Object.entries(variants).filter(([, className]) => className && element.classList.contains(className)).map(([value]) => value);
    const value = active.length ? active[0] : "primary";
    if (active.length > 1 || !Object.hasOwn(variants, value)) return undefined;
    return { value, baseClass, variants, classAttr, classValue };
  }
  function buttonSlotOf(element) {
    const parent = element.getAttribute("data-ase-button-slot-parent");
    const parentTag = element.getAttribute("data-ase-button-slot-parent-tag");
    const parentClass = element.getAttribute("data-ase-button-slot-parent-class");
    const baseClass = element.getAttribute("data-ase-button-slot-base");
    const allowed = (element.getAttribute("data-ase-button-slot-allowed") ?? "").split(",").filter(Boolean);
    if (!parent || !parentTag || !parentClass || !baseClass || !allowed.includes("button")) return undefined;
    return { parent, parentTag, parentClass, baseClass, allowed };
  }
  function sendTextSize() {
    if (selectedElement?.isConnected) post({ type: "text-size-state", loc: selectedElement.getAttribute("data-ase"), css: authoredFontSize(selectedElement) });
  }
  function headingOf(element) {
    const open = element.getAttribute("data-ase-heading-open");
    const close = element.getAttribute("data-ase-heading-close");
    const editable = element.getAttribute("data-ase-heading-size-editable") === "true";
    const fontSize = authoredFontSize(element);
    const options = ${JSON.stringify(textSizeOptions)};
    const keys = options.map((option) => option.value);
    const available = keys.filter((key) => getComputedStyle(element).getPropertyValue("--text-" + key).trim());
    const sizes = Object.fromEntries(options.map((option) => [option.css, option.value]));
    const size = !fontSize ? "default" : sizes[fontSize] ?? "custom";
    return open && close ? {
      open, close, level: element.tagName.toLowerCase(),
      size: { value: size, editable, available, style: element.getAttribute("data-ase-heading-style"),
        styleValue: element.getAttribute("data-ase-heading-style-value"), insert: element.getAttribute("data-ase-heading-style-insert") },
      buttonStyle: buttonStyleOf(element),
      buttonSlot: buttonSlotOf(element),
    } : undefined;
  }
  function headingInventory() {
    return [...document.querySelectorAll("[data-ase][data-ase-heading-open][data-ase-heading-close]")].map((element) => ({
      body: element.getAttribute("data-ase"),
      open: element.getAttribute("data-ase-heading-open"),
      close: element.getAttribute("data-ase-heading-close"),
      level: element.tagName.toLowerCase(),
      text: headingMarkup(element),
    }));
  }
  function setStructuralMappings(element, path, item) {
    element.setAttribute("data-ase", path + ":" + item.bodyStart + ":" + item.bodyEnd);
    element.setAttribute("data-ase-heading-open", path + ":" + item.openStart + ":" + item.openEnd);
    element.setAttribute("data-ase-heading-close", path + ":" + item.closeStart + ":" + item.closeEnd);
    element.setAttribute("data-ase-heading-leading", "");
    element.setAttribute("data-ase-heading-trailing", "");
    element.setAttribute("data-ase-heading-size-editable", "true");
    element.setAttribute("data-ase-heading-style-insert", path + ":" + (item.openEnd + item.attrs.length) + ":" + (item.openEnd + item.attrs.length));
    if (item.href) element.setAttribute("data-ase-href", path + ":" + item.href.start + ":" + item.href.end);
    else element.removeAttribute("data-ase-href");
  }
  function attrsFromSource(text) {
    const attrs = [];
    let index = 0;
    while (index < text.length) {
      while (/\s/.test(text[index] ?? "")) index++;
      if (index >= text.length) break;
      const name = /^[A-Za-z_:][\w:.-]*/.exec(text.slice(index))?.[0];
      if (!name || /^on/i.test(name) || name === "set:html" || name === "slot" || name === "id") return null;
      if (!["class", "href", "type", "title", "aria-label"].includes(name)) return null;
      index += name.length;
      while (/\s/.test(text[index] ?? "")) index++;
      if (text[index] !== "=") { attrs.push([name, ""]); continue; }
      index++;
      while (/\s/.test(text[index] ?? "")) index++;
      const quote = text[index++];
      if (quote !== "\"" && quote !== "'") return null;
      const start = index;
      while (index < text.length && text[index] !== quote) index++;
      if (text[index] !== quote) return null;
      const value = text.slice(start, index++);
      if (/&#|&[a-z][a-z0-9]+;/i.test(value)) return null;
      attrs.push([name, value]);
    }
    return attrs;
  }
  function createStructuralElement(path, item) {
    const element = document.createElement(item.tag);
    const attrs = attrsFromSource(item.attrs);
    if (!attrs) return null;
    for (const [name, value] of attrs) element.setAttribute(name, value);
    element.textContent = unescape(item.text);
    setStructuralMappings(element, path, item);
    element.setAttribute("data-ase-structural-fresh", "");
    return element;
  }
  function currentStructuralElements(path) {
    return [...document.querySelectorAll("[data-ase][data-ase-heading-open][data-ase-heading-close]")]
      .filter((element) => parseLoc(element.getAttribute("data-ase"))?.file === path);
  }
  function structuralLocMatches(element, item, path) {
    const loc = parseLoc(element.getAttribute("data-ase"));
    const open = parseLoc(element.getAttribute("data-ase-heading-open"));
    const close = parseLoc(element.getAttribute("data-ase-heading-close"));
    return loc?.file === path && open?.file === path && close?.file === path &&
      loc.start === item.bodyStart && loc.end === item.bodyEnd &&
      open.start === item.openStart && open.end === item.openEnd &&
      close.start === item.closeStart && close.end === item.closeEnd;
  }
  function uniqueStructural(elements, item, path) {
    const matches = elements.filter((element) => structuralLocMatches(element, item, path));
    return matches.length === 1 ? matches[0] : null;
  }
  function sameStructuralElement(element, item) {
    const attrs = attrsFromSource(item.attrs);
    if (!attrs) return false;
    const allowed = new Set(["data-ase", "data-ase-href", "data-ase-heading-open", "data-ase-heading-close",
      "data-ase-heading-leading", "data-ase-heading-trailing", "data-ase-heading-size-editable",
      "data-ase-heading-style", "data-ase-heading-style-value", "data-ase-heading-style-insert",
      "data-ase-heading-style-owned-space", "data-ase-button-slot-parent", "data-ase-button-slot-parent-tag",
      "data-ase-button-slot-parent-class", "data-ase-button-slot-allowed", "data-ase-button-slot-base",
      "data-ase-structural-fresh", "contenteditable"]);
    const expected = new Set(attrs.map(([name]) => name));
    for (const attr of element.attributes) {
      if (allowed.has(attr.name) || attr.name.startsWith("data-ase-button-style-") || /^data-astro-cid-/i.test(attr.name)) continue;
      if (!expected.has(attr.name)) return false;
    }
    return element.tagName.toLowerCase() === item.tag &&
      (element.hasAttribute("data-ase-heading-open") ? headingMarkup(element) : escape(element.textContent)) === item.text &&
      attrs.every(([name, value]) => (element.getAttribute(name) ?? "") === value) &&
      (!item.href || (element.getAttribute("href") ?? "") === item.href.value);
  }
  function scopedAttrs(elements) {
    const attrs = elements.map((element) => [...element.attributes]
      .filter((attr) => /^data-astro-cid-/i.test(attr.name))
      .map((attr) => [attr.name, attr.value])
      .sort((a, b) => a[0].localeCompare(b[0])));
    if (!attrs.length) return [];
    const first = JSON.stringify(attrs[0]);
    return attrs.every((entry) => JSON.stringify(entry) === first) ? attrs[0] : null;
  }
  function structuralFragment(transaction, clone = false) {
    const fragment = document.createDocumentFragment();
    let cursor = transaction.afterSpan.start;
    for (const item of transaction.afterRun) {
      fragment.append(document.createTextNode(transaction.source.slice(cursor, item.start)));
      const element = createStructuralElement(transaction.path, item);
      if (!element) return null;
      fragment.append(clone ? element.cloneNode(true) : element);
      cursor = item.end;
    }
    fragment.append(document.createTextNode(transaction.source.slice(cursor, transaction.afterSpan.end)));
    return fragment;
  }
  function applyStructuralPreview(transaction) {
    if (!transaction || typeof transaction.path !== "string" ||
        !Array.isArray(transaction.beforeRun) || !Array.isArray(transaction.afterRun)) return false;
    const current = currentStructuralElements(transaction.path);
    const oldRun = transaction.beforeRun.map((item) => uniqueStructural(current, item, transaction.path));
    if (oldRun.some((element) => !element)) return false;
    const anchors = [transaction.oldBeforeAnchor, transaction.oldAfterAnchor]
      .filter(Boolean)
      .map((item) => uniqueStructural(current, item, transaction.path))
      .filter(Boolean);
    const parent = oldRun[0]?.parentElement ?? anchors[0]?.parentElement;
    if (!parent || oldRun.some((element) => element.parentElement !== parent) ||
        anchors.some((element) => element.parentElement !== parent)) return false;
    const siblings = [...parent.childNodes];
    const indexes = oldRun.map((element) => siblings.indexOf(element));
    if (indexes.some((index) => index < 0) || indexes.some((index, offset) => offset && index <= indexes[offset - 1])) return false;
    const runNodes = new Set(oldRun);
    if (oldRun.length) {
      for (let index = indexes[0]; index <= indexes.at(-1); index++) {
        const child = siblings[index];
        if (runNodes.has(child)) continue;
        if (child.nodeType !== Node.TEXT_NODE || !/^\s*$/.test(child.textContent ?? "")) return false;
      }
    }
    for (let index = 0; index < oldRun.length; index++) if (!sameStructuralElement(oldRun[index], transaction.beforeRun[index])) return false;
    const replacements = transaction.afterRun.map((item) => createStructuralElement(transaction.path, item));
    if (replacements.some((element) => !element)) return false;
    lastStructuralShift = null;
    const scope = scopedAttrs([...new Set([...anchors, ...oldRun])]);
    if (!scope) return false;
    const slotAttrs = [...(oldRun[0] ?? anchors[0])?.attributes ?? []]
      .filter(attr => attr.name.startsWith("data-ase-button-slot-"))
      .map(attr => [attr.name, attr.value]);
    const styleTemplate = [...new Set([...anchors, ...oldRun])].find(element => element?.hasAttribute("data-ase-button-style-base"));
    const styleAttrs = styleTemplate ? [...styleTemplate.attributes]
      .filter(attr => attr.name.startsWith("data-ase-button-style-") && attr.name !== "data-ase-button-style-class" && attr.name !== "data-ase-button-style-value")
      .map(attr => [attr.name, attr.value]) : [];
    const applyPreparedButtonAttrs = (element, item) => {
      if (!element.matches("a, button")) return;
      for (const [name, value] of slotAttrs) element.setAttribute(name, value);
      const attrs = readTextAttributes("<x" + item.attrs + ">");
      const classAttribute = attrs?.find(attr => attr.name === "class");
      if (!classAttribute?.value || classAttribute.valueStart === undefined || classAttribute.valueEnd === undefined) return;
      const offset = item.openEnd - 2;
      for (const [name, value] of styleAttrs) element.setAttribute(name, value);
      const slotBase = element.getAttribute("data-ase-button-slot-base");
      const currentBase = element.getAttribute("data-ase-button-style-base");
      const classes = classAttribute.value.trim().split(/\s+/).filter(Boolean);
      if (slotBase && classes.includes(slotBase)) element.setAttribute("data-ase-button-style-base", slotBase);
      else if (currentBase && classes.includes(currentBase)) element.setAttribute("data-ase-button-style-base", currentBase);
      else element.removeAttribute("data-ase-button-style-base");
      element.setAttribute("data-ase-button-style-class", transaction.path + ":" + (offset + classAttribute.start) + ":" + (offset + classAttribute.end));
      element.setAttribute("data-ase-button-style-value", transaction.path + ":" + (offset + classAttribute.valueStart) + ":" + (offset + classAttribute.valueEnd));
    };
    for (const element of replacements)
      for (const [name, value] of scope) element.setAttribute(name, value);
    replacements.forEach((element, index) => applyPreparedButtonAttrs(element, transaction.afterRun[index]));
    const clone = parent.cloneNode(true);
    const applyScope = (fragment) => {
      for (const element of fragment.querySelectorAll("[data-ase]"))
        for (const [name, value] of scope) element.setAttribute(name, value);
      [...fragment.querySelectorAll("a[data-ase], button[data-ase]")].forEach((element, index) =>
        applyPreparedButtonAttrs(element, transaction.afterRun.filter(item => item.tag === "a" || item.tag === "button")[index]));
      return fragment;
    };
    const structuralRange = (owner, run, beforeNode, afterNode) => {
      const range = document.createRange();
      if (afterNode && transaction.oldAfterAnchor?.end === transaction.beforeSpan.start) range.setStartAfter(afterNode);
      else if (run.length) range.setStartBefore(run[0]);
      else if (beforeNode) range.setStartBefore(beforeNode);
      else range.setStart(owner, owner.childNodes.length);
      if (beforeNode && transaction.oldBeforeAnchor?.start === transaction.beforeSpan.end) range.setEndBefore(beforeNode);
      else if (run.length) range.setEndAfter(run.at(-1));
      else if (afterNode) range.setEndAfter(afterNode);
      else range.setEnd(owner, owner.childNodes.length);
      if (range.startContainer !== owner || range.endContainer !== owner) return null;
      const runNodes = new Set(run);
      for (let index = range.startOffset; index < range.endOffset; index++) {
        const child = owner.childNodes[index];
        if (runNodes.has(child)) continue;
        if (child.nodeType !== Node.TEXT_NODE || !/^\s*$/.test(child.textContent ?? "")) return null;
      }
      return range;
    };
    const mutateClone = () => {
      const fragment = structuralFragment(transaction, true);
      if (!fragment) return false;
      applyScope(fragment);
      const cloneMapped = [...clone.querySelectorAll("[data-ase][data-ase-heading-open][data-ase-heading-close]")];
      const cloneRun = transaction.beforeRun.map((item) => uniqueStructural(cloneMapped, item, transaction.path));
      if (cloneRun.some((element) => !element)) return false;
      const beforeNode = transaction.oldBeforeAnchor && uniqueStructural(cloneMapped, transaction.oldBeforeAnchor, transaction.path);
      const afterNode = transaction.oldAfterAnchor && uniqueStructural(cloneMapped, transaction.oldAfterAnchor, transaction.path);
      if (transaction.oldBeforeAnchor && !beforeNode) return false;
      if (transaction.oldAfterAnchor && !afterNode) return false;
      const range = structuralRange(clone, cloneRun, beforeNode, afterNode);
      if (!range) return false;
      range.deleteContents();
      range.insertNode(fragment);
      return true;
    };
    if (!mutateClone()) return false;
    const expected = transaction.afterRun;
    const actual = [...clone.querySelectorAll("[data-ase-structural-fresh][data-ase][data-ase-heading-open][data-ase-heading-close]")]
      .filter((element) => parseLoc(element.getAttribute("data-ase"))?.file === transaction.path);
    if (actual.length !== expected.length) return false;
    for (let index = 0; index < expected.length; index++)
      if (!sameStructuralElement(actual[index], expected[index])) return false;
    const fragment = structuralFragment(transaction);
    if (!fragment) return false;
    applyScope(fragment);
    const beforeNode = transaction.oldBeforeAnchor && uniqueStructural(current, transaction.oldBeforeAnchor, transaction.path);
    const afterNode = transaction.oldAfterAnchor && uniqueStructural(current, transaction.oldAfterAnchor, transaction.path);
    if (transaction.oldBeforeAnchor && !beforeNode) return false;
    if (transaction.oldAfterAnchor && !afterNode) return false;
    const range = structuralRange(parent, oldRun, beforeNode, afterNode);
    if (!range) return false;
    range.deleteContents();
    range.insertNode(fragment);
    const replacementSource = transaction.source.slice(transaction.afterSpan.start, transaction.afterSpan.end);
    shiftSourceRanges(transaction.path, transaction.beforeSpan.start, transaction.beforeSpan.end, replacementSource);
    lastStructuralShift = {
      file: transaction.path,
      previous: transaction.previous,
      source: transaction.source,
    };
    return true;
  }
  function rectOf(element) {
    const { left, top, right, bottom } = element.getBoundingClientRect();
    return { left, top, right, bottom };
  }
  // Selectors from same-origin stylesheets that match an element, in sheet
  // order, so the editor can find and highlight every rule that styles it.
  // State and pseudo-element variants (a:hover, h1::before) count as matches.
  const pseudo = /::?(before|after|marker|placeholder|selection|first-line|first-letter|hover|focus|focus-visible|focus-within|active|visited|link|target|checked|disabled|enabled|placeholder-shown)\b/g;
  function matchedSelectors(element) {
    const found = [];
    const visit = (rules) => {
      for (const rule of rules) {
        if (rule.cssRules && rule.cssRules.length) visit(rule.cssRules);
        if (!rule.selectorText) continue;
        for (const part of rule.selectorText.split(",")) {
          const selector = part.trim();
          // Relative nested selectors need their parent context; matching a bare
          // ampersand against the element would report unrelated rules.
          if (!selector || selector.includes("&") || selector.includes("data-ase") || found.includes(selector)) continue;
          const base = selector.replace(pseudo, "").trim() || "*";
          try { if (element.matches(selector) || element.matches(base)) found.push(selector); } catch {}
        }
        if (found.length >= 40) return;
      }
    };
    for (const sheet of document.styleSheets) { try { visit(sheet.cssRules); } catch {} }
    return found;
  }
  let editing = null;
  let selectedElement = null;
  let positionFrame = 0;
  const selectedSize = new ResizeObserver(() => queuePosition());
  function queuePosition() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      if (!selectedElement?.isConnected) return;
      post({ type: "position", loc: selectedElement.getAttribute("data-ase"), rect: rectOf(selectedElement) });
    });
  }
  function trackSelected(element) {
    selectedSize.disconnect();
    selectedElement = element;
    if (element) selectedSize.observe(element);
  }
  addEventListener("scroll", queuePosition, true);
  addEventListener("resize", queuePosition);
  let savedRange = null;
  let formatSerial = 0;
  let latestFormat = null;
  function selectionOffset(root, node, offset) {
    if (!node || !root.contains(node)) return null;
    const range = document.createRange();
    range.setStart(root, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  }
  function saveSelection(leaving = false) {
    if (!editing || (!leaving && document.activeElement !== editing.element)) return;
    const selection = getSelection();
    if (!selection || !selection.rangeCount) return;
    const anchor = selectionOffset(editing.element, selection.anchorNode, selection.anchorOffset);
    const focus = selectionOffset(editing.element, selection.focusNode, selection.focusOffset);
    if (anchor !== null && focus !== null)
      savedRange = { open: editing.element.getAttribute("data-ase-heading-open"), anchor, focus };
  }
  function restoreSelection(element) {
    if (!savedRange?.open || savedRange.open !== element.getAttribute("data-ase-heading-open")) return false;
    const seek = (wanted) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let seen = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (wanted <= seen + node.textContent.length) return [node, wanted - seen];
        seen += node.textContent.length;
      }
      return null;
    };
    const points = [seek(savedRange.anchor), seek(savedRange.focus)];
    if (points.some((point) => !point)) return false;
    getSelection().setBaseAndExtent(points[0][0], points[0][1], points[1][0], points[1][1]);
    return true;
  }
  function applyFormat(element, tag) {
    const start = Math.min(savedRange.anchor, savedRange.focus);
    const end = Math.max(savedRange.anchor, savedRange.focus);
    if (start === end) return false;
    const chars = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const bold = Boolean(node.parentElement?.closest("strong"));
      const italic = Boolean(node.parentElement?.closest("em"));
      for (let index = 0; index < node.textContent.length; index++) chars.push({ char: node.textContent[index], bold, italic });
    }
    const key = tag === "strong" ? "bold" : "italic";
    const enabled = !chars.slice(start, end).every((char) => char[key]);
    for (let index = start; index < end; index++) chars[index][key] = enabled;
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < chars.length;) {
      const state = chars[index];
      let text = "";
      while (index < chars.length && chars[index].bold === state.bold && chars[index].italic === state.italic)
        text += chars[index++].char;
      let parent = fragment;
      if (state.bold) { const strong = document.createElement("strong"); parent.append(strong); parent = strong; }
      if (state.italic) { const em = document.createElement("em"); parent.append(em); parent = em; }
      parent.append(document.createTextNode(text));
    }
    element.replaceChildren(fragment);
    return restoreSelection(element);
  }
  function formatState() {
    if (!editing || !editing.element.hasAttribute("data-ase-heading-open")) return;
    const start = Math.min(savedRange?.anchor ?? 0, savedRange?.focus ?? 0);
    const end = Math.max(savedRange?.anchor ?? 0, savedRange?.focus ?? 0);
    const states = [];
    const walker = document.createTreeWalker(editing.element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const bold = Boolean(node.parentElement?.closest("strong"));
      const italic = Boolean(node.parentElement?.closest("em"));
      for (let index = 0; index < node.textContent.length; index++) states.push({ bold, italic });
    }
    const selected = states.slice(start, end);
    post({ type: "format-state", loc: editing.element.getAttribute("data-ase"),
      bold: Boolean(selected.length) && selected.every((state) => state.bold),
      italic: Boolean(selected.length) && selected.every((state) => state.italic) });
  }
  document.addEventListener("selectionchange", saveSelection);
  document.addEventListener("selectionchange", formatState);
  function finish(revert) {
    if (!editing) return;
    const { element, original } = editing;
    editing = null;
    if (revert) {
      const previous = escape(element.textContent);
      element.textContent = unescape(original);
      const at = applyChange(element, original);
      post({ type: "input", loc: at.file + ":" + at.start + ":" + (at.start + previous.length), expected: previous, text: original });
    }
    element.removeAttribute("contenteditable");
    post({ type: "commit", loc: element.getAttribute("data-ase") });
  }
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const mapped = target?.closest("[data-ase]");
    if (target?.closest("a, button")) event.preventDefault();
    if (readOnly) return;
    if (editing && mapped === editing.element) return;
    finish(false);
    const reason = target?.closest("[data-ase-reason]");
    if (mapped) {
      trackSelected(mapped);
      const current = mapped.hasAttribute("data-ase-heading-open") ? headingMarkup(mapped) : escape(mapped.textContent);
      if (current === null) return;
      editing = { element: mapped, original: current, previous: current };
      mapped.setAttribute("contenteditable", mapped.hasAttribute("data-ase-heading-open") ? "true" : "plaintext-only");
      if (mapped.contentEditable !== "plaintext-only" && !mapped.hasAttribute("data-ase-heading-open")) mapped.setAttribute("contenteditable", "true");
      mapped.focus();
      // A click on a link leaves the caret where it was; move it inside.
      const selection = getSelection();
      if (selection && !(selection.anchorNode && mapped.contains(selection.anchorNode))) {
        const range = document.createRange();
        range.selectNodeContents(mapped);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      post({ type: "select", loc: mapped.getAttribute("data-ase"), tag: mapped.tagName.toLowerCase(), text: current, classes: [...mapped.classList], selectors: matchedSelectors(mapped), href: linkOf(mapped), heading: headingOf(mapped), rect: rectOf(mapped) });
    } else if (reason) {
      trackSelected(null);
      post({ type: "reject", reason: reason.getAttribute("data-ase-reason"), tag: reason.tagName.toLowerCase(), text: reason.textContent.slice(0, 80) });
    } else if (target) {
      trackSelected(null);
      post({ type: "reject", reason: "unmapped", tag: target.tagName.toLowerCase(), text: target.textContent.slice(0, 80) });
    }
  }, true);
  document.addEventListener("input", (event) => {
    if (!editing || event.target !== editing.element) return;
    const element = editing.element;
    const text = element.hasAttribute("data-ase-heading-open") ? headingMarkup(element) : escape(element.textContent);
    if (text === null) return;
    const expected = editing.previous;
    const at = parseLoc(element.getAttribute("data-ase"));
    applyChange(element, text);
    editing.previous = text;
    post({ type: "input", loc: at.file + ":" + at.start + ":" + at.end, expected, text });
  });
  document.addEventListener("keydown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const key = event.key.toLowerCase();
    const direction = (event.ctrlKey || event.metaKey) && key === "z"
      ? (event.shiftKey ? "redo" : "undo")
      : event.ctrlKey && !event.shiftKey && key === "y" ? "redo" : null;
    if (direction && !target?.closest("input, textarea, select")) {
      event.preventDefault();
      post({ type: "history", direction });
      return;
    }
    if (!editing || event.target !== editing.element) return;
    if (event.key === "Enter") { event.preventDefault(); finish(false); }
    if (event.key === "Escape") { event.preventDefault(); finish(true); }
  });
  document.addEventListener("focusout", (event) => {
    if (editing && event.target === editing.element) {
      saveSelection(true);
      finish(false);
    }
  });
  document.addEventListener("paste", (event) => {
    if (!editing || event.target !== editing.element) return;
    event.preventDefault();
    document.execCommand("insertText", false, (event.clipboardData?.getData("text/plain") ?? "").replace(/\s+/g, " "));
  });
  // Applies the editor's changes: link edits as they happen, and every
  // recorded change again after a reload of the same build.
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== "astro-site-editor") return;
    if (data.type === "theme") {
      if (event.source === window.parent && typeof data.focus === "string" && /^#[0-9a-f]{6}$/i.test(data.focus)) {
        // Only the editor annotation uses this namespaced token. Never replace
        // the site's framework variables or authored element styles.
        style.textContent = style.textContent.replace(/var\(--ase-editor-focus, [^)]+\)/g,
          "var(--ase-editor-focus, " + data.focus + ")");
      }
      return;
    }
    if (data.type === "readonly") {
      readOnly = true;
      structuralCommitId = "";
      finish(false);
      document.documentElement.setAttribute("data-ase-readonly", "");
      return;
    }
    if (data.type === "structural-preview") {
      readOnly = true;
      structuralCommitId = "";
      finish(false);
      document.documentElement.setAttribute("data-ase-readonly", "");
      const id = String(data.id ?? "");
      const ok = applyStructuralPreview(data.transaction);
      structuralCommitId = ok ? id : "";
      post({ type: "structural-preview-result", id, ok, headings: headingInventory(), links: linkInventory() });
      return;
    }
    if (data.type === "structural-preview-commit") {
      const id = String(data.id ?? "");
      if (!structuralCommitId || id !== structuralCommitId) return;
      structuralCommitId = "";
      readOnly = false;
      document.documentElement.removeAttribute("data-ase-readonly");
      return;
    }
    if (data.type !== "patch") return;
    if (data.attr === "capture-selection") {
      saveSelection(true);
      return;
    }
    if (data.attr === "finish") {
      finish(false);
      return;
    }
    if (data.attr === "select") {
      const at = parseLoc(String(data.loc));
      const element = [...document.querySelectorAll("[data-ase]")].find((candidate) => {
        const loc = parseLoc(candidate.getAttribute("data-ase"));
        return loc?.file === at.file && loc.start === at.start && loc.end === at.end;
      });
      if (!element) return;
      trackSelected(element);
      const current = element.hasAttribute("data-ase-heading-open") ? headingMarkup(element) : escape(element.textContent);
      if (current === null) return;
      editing = { element, original: current, previous: current };
      element.setAttribute("contenteditable", element.hasAttribute("data-ase-heading-open") ? "true" : "plaintext-only");
      if (element.contentEditable !== "plaintext-only" && !element.hasAttribute("data-ase-heading-open")) element.setAttribute("contenteditable", "true");
      element.focus();
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      post({ type: "select", loc: element.getAttribute("data-ase"), tag: element.tagName.toLowerCase(), text: current, classes: [...element.classList], selectors: matchedSelectors(element), href: linkOf(element), heading: headingOf(element), rect: rectOf(element) });
      return;
    }
    if (data.attr === "invalidate") {
      const at = parseLoc(String(data.loc));
      const element = [...document.querySelectorAll("[data-ase]")].find((candidate) => {
        const loc = parseLoc(candidate.getAttribute("data-ase"));
        return loc.file === at.file && loc.start === at.start;
      });
      if (!element) return;
      if (latestFormat?.element === element) {
        if (replaceHeadingMarkup(element, latestFormat.before)) applyChange(element, latestFormat.before);
        latestFormat = null;
      }
      if (editing?.element === element) finish(false);
      element.removeAttribute("contenteditable");
      for (const attr of ["data-ase", "data-ase-heading-open", "data-ase-heading-close", "data-ase-heading-leading", "data-ase-heading-trailing"])
        element.removeAttribute(attr);
      element.setAttribute("data-ase-reason", "unverified");
      if (selectedElement === element) trackSelected(null);
      latestFormat = null;
      return;
    }
    if (data.attr === "format-ack") {
      if (latestFormat?.id === data.editId) latestFormat = null;
      return;
    }
    if (data.attr === "format-revert") {
      if (!latestFormat || latestFormat.id !== data.editId) return;
      const element = latestFormat.element;
      const current = parseLoc(element.getAttribute("data-ase"));
      const at = parseLoc(String(data.loc));
      if (!current || !at || current.file !== at.file || current.start !== at.start || current.end !== at.end) return;
      if (!replaceHeadingMarkup(element, data.text)) return;
      applyChange(element, data.text);
      editing = { element, original: data.text, previous: data.text };
      element.setAttribute("contenteditable", "true");
      element.focus();
      restoreSelection(element);
      latestFormat = null;
      formatState();
      return;
    }
    if (data.attr === "format") {
      const at = parseLoc(String(data.loc));
      const element = [...document.querySelectorAll("[data-ase][data-ase-heading-open]")].find((candidate) => {
        const loc = parseLoc(candidate.getAttribute("data-ase"));
        return loc.file === at.file && loc.start === at.start && loc.end === at.end;
      });
      if (!element || !/^(strong|em)$/.test(data.text)) return;
      element.setAttribute("contenteditable", "true");
      element.focus();
      const markup = headingMarkup(element);
      editing = { element, original: markup, previous: markup };
      if (!restoreSelection(element)) return;
      if (!applyFormat(element, data.text)) return formatState();
      const expected = editing.previous;
      const text = headingMarkup(element);
      const loc = parseLoc(element.getAttribute("data-ase"));
      applyChange(element, text);
      editing.previous = text;
      const editId = String(++formatSerial);
      latestFormat = { id: editId, element, before: expected };
      post({ type: "input", loc: loc.file + ":" + loc.start + ":" + loc.end, expected, text, format: true, editId });
      formatState();
      return;
    }
    if (data.attr === "heading") {
      const open = parseLoc(String(data.loc));
      const close = parseLoc(String(data.closeLoc));
      for (const element of document.querySelectorAll("[data-ase-heading-open]")) {
        const a = parseLoc(element.getAttribute("data-ase-heading-open"));
        const b = parseLoc(element.getAttribute("data-ase-heading-close"));
        if (a.file !== open.file || a.start !== open.start || a.end !== open.end || b.file !== close.file || b.start !== close.start || b.end !== close.end) continue;
        // Replacing a focused element can synchronously finish its edit. Keep
        // the session before replacement so history can restore one active host.
        const activeEdit = editing?.element === element ? editing : null;
        if (activeEdit) saveSelection();
        const replacement = document.createElement(data.text);
        for (const attribute of element.attributes) replacement.setAttribute(attribute.name, attribute.value);
        replacement.removeAttribute("contenteditable");
        while (element.firstChild) replacement.append(element.firstChild);
        element.replaceWith(replacement);
        if (selectedElement === element) trackSelected(replacement);
        if (activeEdit) {
          editing = { ...activeEdit, element: replacement };
          replacement.setAttribute("contenteditable", "true");
          replacement.focus();
          restoreSelection(replacement);
          formatState();
        }
        if (data.focus && savedRange?.open === replacement.getAttribute("data-ase-heading-open")) {
          const markup = headingMarkup(replacement);
          replacement.setAttribute("contenteditable", "true");
          editing = { element: replacement, original: markup, previous: markup };
          replacement.focus();
          restoreSelection(replacement);
          formatState();
        }
        queuePosition();
        break;
      }
      return;
    }
    if (data.attr === "class-styles") {
      let entries;
      try { entries = JSON.parse(data.text); } catch { return; }
      if (!Array.isArray(entries)) return;
      for (const entry of entries) {
        if (!/^\.[a-zA-Z_][\w-]*$/.test(entry.selector) || typeof entry.value !== "string") continue;
        let found = false;
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules) {
              if (!simpleClassSelectorList(rule.selectorText)?.includes(entry.selector)) continue;
              found = true;
              if (entry.value) rule.style.setProperty("font-size", entry.value);
              else rule.style.removeProperty("font-size");
            }
          } catch {}
        }
        if (!found && entry.value) {
          let style = document.querySelector("style[data-ase-class-styles]");
          if (!style) { style = document.createElement("style"); style.setAttribute("data-ase-class-styles", ""); document.head.append(style); }
          const at = style.sheet.insertRule(entry.selector + " {}", style.sheet.cssRules.length);
          style.sheet.cssRules[at].style.setProperty("font-size", entry.value);
        }
      }
      sendTextSize(); queuePosition(); return;
    }
    if (data.attr === "text-attributes") {
      const element = [...document.querySelectorAll("[data-ase-heading-open]")].find(el => el.getAttribute("data-ase-heading-open") === data.loc);
      if (!element || typeof data.text !== "string") return;
      const attributes = readTextAttributes("<x" + data.text + ">");
      if (!attributes) return;
      for (const name of ["class", "style"]) {
        const attr = attributes.find(item => item.name === name);
        const scopeClasses = name === "class" ? [...element.classList].filter(item => /^astro-[a-z0-9]+$/i.test(item)) : [];
        if (attr?.value !== undefined) element.setAttribute(name, attr.value);
        else element.removeAttribute(name);
        if (scopeClasses.length) element.classList.add(...scopeClasses);
      }
      const open = parseLoc(data.loc);
      const style = attributes.find(item => item.name === "style");
      for (const attr of ["data-ase-heading-style", "data-ase-heading-style-value", "data-ase-heading-style-insert"]) element.removeAttribute(attr);
      if (style?.valueStart !== undefined && style.valueEnd !== undefined) {
        const offset = open.end - 2;
        element.setAttribute("data-ase-heading-style", open.file + ":" + (offset + style.start) + ":" + (offset + style.end));
        element.setAttribute("data-ase-heading-style-value", open.file + ":" + (offset + style.valueStart) + ":" + (offset + style.valueEnd));
      } else {
        const insert = open.end + data.text.length;
        element.setAttribute("data-ase-heading-style-insert", open.file + ":" + insert + ":" + insert);
      }
      sendTextSize(); queuePosition(); return;
    }
    if (data.attr === "button-mapping") {
      const open = parseLoc(data.loc);
      const close = parseLoc(data.closeLoc);
      if (!open || !close || open.file !== close.file || typeof data.text !== "string" ||
          typeof data.sourceText !== "string" || !Number.isSafeInteger(data.sourceStart) ||
          !Number.isSafeInteger(data.sourceEnd) || data.sourceStart <= open.end ||
          data.sourceEnd - data.sourceStart !== data.sourceText.length || close.start !== data.sourceEnd + 2) return;
      const element = [...document.querySelectorAll("[data-ase-button-style-base]")].find(el => el.getAttribute("data-ase-heading-open") === data.loc);
      if (!element || editing?.element === element || headingMarkup(element) !== data.sourceText) return;
      const attributes = readTextAttributes("<x" + data.text + ">");
      if (!attributes) return;
      element.setAttribute("data-ase", open.file + ":" + data.sourceStart + ":" + data.sourceEnd);
      element.setAttribute("data-ase-heading-close", data.closeLoc);
      const offset = open.end - 2;
      const href = attributes.find(item => item.name === "href");
      if (href?.valueStart !== undefined && href.valueEnd !== undefined && href.value === element.getAttribute("href"))
        element.setAttribute("data-ase-href", open.file + ":" + (offset + href.valueStart) + ":" + (offset + href.valueEnd));
      const classAttribute = attributes.find(item => item.name === "class");
      if (element.hasAttribute("data-ase-button-style-base") && classAttribute?.valueStart !== undefined && classAttribute.valueEnd !== undefined) {
        element.setAttribute("data-ase-button-style-class", open.file + ":" + (offset + classAttribute.start) + ":" + (offset + classAttribute.end));
        element.setAttribute("data-ase-button-style-value", open.file + ":" + (offset + classAttribute.valueStart) + ":" + (offset + classAttribute.valueEnd));
      }
      return;
    }
    if (data.attr === "button-style") {
      const classAttr = parseLoc(String(data.loc));
      const classValue = parseLoc(String(data.closeLoc));
      if (!classAttr || !classValue || typeof data.text !== "string") return;
      const element = [...document.querySelectorAll("[data-ase-button-style-value]")].find((candidate) => {
        const loc = parseLoc(candidate.getAttribute("data-ase-button-style-value"));
        return loc?.file === classValue.file && loc.start === classValue.start && loc.end === classValue.end;
      });
      if (!element) return;
      const scopeClasses = [...element.classList].filter(item => /^astro-[a-z0-9]+$/i.test(item));
      element.setAttribute("class", data.text);
      if (scopeClasses.length) element.classList.add(...scopeClasses);
      applyChange(element, data.text, "data-ase-button-style-value");
      const delta = data.text.length - (classValue.end - classValue.start);
      element.setAttribute("data-ase-button-style-class", classAttr.file + ":" + classAttr.start + ":" + (classAttr.end + delta));
      queuePosition();
      return;
    }
    if (data.attr === "heading-size") {
      const at = parseLoc(String(data.loc));
      const open = parseLoc(String(data.closeLoc));
      if (!at || !Number.isSafeInteger(data.sourceStart) || !Number.isSafeInteger(data.sourceEnd) || typeof data.sourceText !== "string") return;
      const element = [...document.querySelectorAll("[data-ase-heading-open]")].find((candidate) => {
        const loc = parseLoc(candidate.getAttribute("data-ase-heading-open"));
        return open && loc?.file === open.file && loc.start === open.start && loc.end === open.end;
      });
      if (!element) return;
      if (data.text) element.style.setProperty("font-size", data.text);
      else element.style.removeProperty("font-size");
      updateHeadingStyleMapping(element, at.file, data.sourceStart, data.sourceEnd, data.sourceText);
      queuePosition();
      return;
    }
    if (data.attr === "heading-size-only") {
      const open = parseLoc(String(data.closeLoc));
      const element = [...document.querySelectorAll("[data-ase-heading-open]")].find((candidate) => {
        const loc = parseLoc(candidate.getAttribute("data-ase-heading-open"));
        return open && loc?.file === open.file && loc.start === open.start && loc.end === open.end;
      });
      if (!element) return;
      if (data.text) element.style.setProperty("font-size", data.text);
      else element.style.removeProperty("font-size");
      if (Number.isSafeInteger(data.sourceStart) && Number.isSafeInteger(data.sourceEnd) && typeof data.sourceText === "string")
        updateHeadingStyleMapping(element, open.file, data.sourceStart, data.sourceEnd, data.sourceText);
      queuePosition();
      return;
    }
    if (data.attr === "source-shift") {
      const at = parseLoc(String(data.loc));
      if (at && Number.isSafeInteger(data.sourceStart) && Number.isSafeInteger(data.sourceEnd) && typeof data.sourceText === "string") {
        if (lastStructuralShift && lastStructuralShift.file === at.file &&
            lastStructuralShift.previous.slice(0, data.sourceStart) + data.sourceText + lastStructuralShift.previous.slice(data.sourceEnd) === lastStructuralShift.source) {
          lastStructuralShift = null;
          return;
        }
        lastStructuralShift = null;
        shiftSourceRanges(at.file, data.sourceStart, data.sourceEnd, data.sourceText);
      }
      return;
    }
    const attr = data.attr === "href" ? "data-ase-href" : "data-ase";
    const at = parseLoc(String(data.loc));
    for (const element of document.querySelectorAll("[" + attr + "]")) {
      const o = parseLoc(element.getAttribute(attr));
      if (o.file === at.file && o.start === at.start && o.end === at.end) {
        applyPatch(element, data.text, data.attr);
        break;
      }
    }
  });
  post({ type: "ready", path: location.pathname, headings: headingInventory(), links: linkInventory() });
}
`;

// The overlay stores edited text with these five entities; other entities or raw
// markup characters would change length unpredictably, so they stay read-only.
const escapeText = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
const unescapeText = (text) => text.replace(/&#123;/g, "{").replace(/&#125;/g, "}").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const roundTrips = (value) => escapeText(unescapeText(value)) === value;

function validButtonStyles(value) {
  if (!value || typeof value !== "object") return undefined;
  const baseClass = value.baseClass;
  const aliases = Array.isArray(value.aliases) ? value.aliases : [];
  const variants = value.variants;
  const token = (item) => typeof item === "string" && (item === "" || /^[A-Za-z_][\w-]*$/.test(item));
  if (!token(baseClass) || baseClass === "" || !aliases.every(token) || !variants || typeof variants !== "object") return undefined;
  const next = {
    baseClass,
    aliases,
    variants: {
      primary: variants.primary,
      secondary: variants.secondary,
      outline: variants.outline,
      link: variants.link,
    },
  };
  if (!Object.values(next.variants).every(token)) return undefined;
  const occupied = new Set([baseClass, ...aliases]);
  const seen = new Set();
  for (const item of Object.values(next.variants).filter(Boolean)) {
    if (occupied.has(item) || seen.has(item)) return undefined;
    seen.add(item);
  }
  return next;
}

function readButtonStyles(root) {
  try {
    return validButtonStyles(JSON.parse(readFileSync(join(root, ".astro-editor/button-styles.json"), "utf8")));
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("Ignoring invalid .astro-editor/button-styles.json:", error.message);
    return undefined;
  }
}

function readButtonSlots(root) {
  try {
    const value = JSON.parse(readFileSync(join(root, ".astro-editor/button-slots.json"), "utf8"));
    if (!value || typeof value !== "object" || value.version !== 1 || !Array.isArray(value.slots)) return [];
    return value.slots.filter(slot =>
      slot && typeof slot === "object" &&
      typeof slot.path === "string" &&
      typeof slot.parentTag === "string" &&
      typeof slot.parentClass === "string" && /^[A-Za-z_][\w-]*$/.test(slot.parentClass) &&
      Array.isArray(slot.allowed) && slot.allowed.includes("button") &&
      typeof slot.buttonBaseClass === "string" && /^[A-Za-z_][\w-]*$/.test(slot.buttonBaseClass));
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("Ignoring invalid .astro-editor/button-slots.json:", error.message);
    return [];
  }
}

function annotate(source, file, buttonStyles, buttonSlots) {
  const { ast } = parse(source);
  const inserts = [];
  const explicitSlotFor = (node) => {
    if (!buttonStyles) return undefined;
    const name = node.openingElement?.name?.name;
    const attributes = node.openingElement?.attributes ?? [];
    if (attributes.some(attribute => attribute.type === "JSXSpreadAttribute" ||
        (attribute.type === "JSXAttribute" && (attribute.name?.name === "class:list" ||
         (attribute.name?.name === "class" && attribute.value?.type !== "Literal"))))) return undefined;
    const classAttrs = attributes.filter(attribute => attribute.type === "JSXAttribute" && attribute.name?.name === "class");
    const classAttr = classAttrs.length === 1 && classAttrs[0].value?.type === "Literal" ? classAttrs[0] : undefined;
    const classes = classAttr && /^["']/.test(classAttr.value.raw) &&
      source.slice(classAttr.value.start + 1, classAttr.value.end - 1) === classAttr.value.value
      ? classAttr.value.value.trim().split(/\s+/).filter(Boolean)
      : [];
    const matching = buttonSlots.filter(slot => slot.path === file && slot.parentTag === name && classes.includes(slot.parentClass));
    if (matching.length !== 1 || !node.closingElement) return undefined;
    if (matching[0].buttonBaseClass !== buttonStyles.baseClass) return undefined;
    const sameParents = [];
    const visit = (candidate) => {
      if (!candidate || typeof candidate !== "object") return;
      if (Array.isArray(candidate)) return candidate.forEach(visit);
      if (candidate.type === "JSXElement" && candidate.openingElement?.name?.name === name) {
        const attrs = candidate.openingElement.attributes ?? [];
        const literal = attrs.filter(attribute => attribute.type === "JSXAttribute" && attribute.name?.name === "class");
        const classValue = literal.length === 1 && literal[0].value?.type === "Literal" ? literal[0].value.value : "";
        if (String(classValue).trim().split(/\s+/).includes(matching[0].parentClass)) sameParents.push(candidate);
      }
      for (const key of ["children", "body", "template"]) if (candidate[key]) visit(candidate[key]);
    };
    visit(ast);
    if (sameParents.length !== 1) return undefined;
    for (const child of node.children ?? []) {
      if (child.type === "JSXText") {
        if (!/^\s*$/.test(source.slice(child.start, child.end))) return undefined;
      } else if (child.type !== "JSXElement") return undefined;
      else {
        const childAttrs = child.openingElement?.attributes ?? [];
        if (childAttrs.some(attribute => attribute.type === "JSXSpreadAttribute" ||
            (attribute.type === "JSXAttribute" && (attribute.name?.name === "class:list" ||
             (attribute.name?.name === "class" && attribute.value?.type !== "Literal"))))) return undefined;
        const childClasses = childAttrs.filter(attribute => attribute.type === "JSXAttribute" && attribute.name?.name === "class");
        const childClass = childClasses.length === 1 && childClasses[0].value?.type === "Literal" &&
          /^["']/.test(childClasses[0].value.raw) &&
          source.slice(childClasses[0].value.start + 1, childClasses[0].value.end - 1) === childClasses[0].value.value
          ? childClasses[0].value.value.trim().split(/\s+/).filter(Boolean)
          : [];
        const supportedClass = [buttonStyles.baseClass, ...(buttonStyles.aliases ?? [])].some(className => childClass.includes(className));
        if ((child.openingElement?.name?.name === "a" || child.openingElement?.name?.name === "button") && !supportedClass) return undefined;
      }
    }
    return matching[0];
  };
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === "JSXElement" && node.openingElement) {
      const name = node.openingElement.name?.name;
      const explicitSlot = explicitSlotFor(node);
      if (explicitSlot) for (const child of node.children ?? []) {
        const childName = child.type === "JSXElement" ? child.openingElement?.name?.name : "";
        if (childName !== "a" && childName !== "button") continue;
        const close = child.openingElement.end - 1;
        if (source[close] !== ">" || child.openingElement.attributes?.some(attribute => attribute.type === "JSXSpreadAttribute")) continue;
        const at = source[close - 1] === "/" ? close - 1 : close;
        inserts.push({ at, attr: ` data-ase-button-slot-parent="${file}:${node.openingElement.start}:${node.closingElement.end}" data-ase-button-slot-parent-tag="${name}" data-ase-button-slot-parent-class="${explicitSlot.parentClass}" data-ase-button-slot-allowed="${explicitSlot.allowed.join(",")}" data-ase-button-slot-base="${explicitSlot.buttonBaseClass}"` });
      }
      const html = typeof name === "string" && /^[a-z][a-z0-9-]*$/.test(name);
      const close = node.openingElement.end - 1;
      if (html && source[close] === ">") {
        const at = source[close - 1] === "/" ? close - 1 : close;
        const children = node.children ?? [];
        const texts = children.filter((c) => c.type === "JSXText");
        const meaningful = children.filter((c) => c.type !== "JSXText" || c.value.trim());
        let attr;
        const closingName = node.closingElement?.name;
        if (/^(?:h[1-6]|p|a|button)$/.test(name) && closingName?.start >= 0 && closingName?.end > closingName.start) {
          const body = source.slice(node.openingElement.end, node.closingElement.start);
          const leading = body.match(/^\s*/)[0];
          const trailing = body.match(/\s*$/)[0];
          inserts.push({ at, attr: ` data-ase-heading-open="${file}:${node.openingElement.name.start}:${node.openingElement.name.end}" data-ase-heading-close="${file}:${closingName.start}:${closingName.end}" data-ase-heading-leading="${encodeURIComponent(leading)}" data-ase-heading-trailing="${encodeURIComponent(trailing)}"` });
          const attributes = node.openingElement.attributes ?? [];
          const style = attributes.find((attribute) => attribute.type === "JSXAttribute" && attribute.name?.name === "style");
          const hasSpread = attributes.some((attribute) => attribute.type === "JSXSpreadAttribute");
          let sizeMapping = ` data-ase-heading-size-editable="false"`;
          if (!hasSpread && !style) {
            sizeMapping = ` data-ase-heading-size-editable="true" data-ase-heading-style-insert="${file}:${at}:${at}"`;
          } else if (!hasSpread && style?.value?.type === "Literal" && /^["']/.test(style.value.raw) &&
              !style.value.value.includes("/*") && !/(?:^|;)\s*font\s*:/i.test(style.value.value) &&
              (style.value.value.match(/font-size\s*:/gi) ?? []).length <= 1) {
            sizeMapping = ` data-ase-heading-size-editable="true" data-ase-heading-style="${file}:${style.start}:${style.end}" data-ase-heading-style-value="${file}:${style.value.start + 1}:${style.value.end - 1}"`;
          }
          inserts.push({ at, attr: sizeMapping });
          const classAttrs = attributes.filter((attribute) => attribute.type === "JSXAttribute" && attribute.name?.name === "class");
          const classAttr = classAttrs.length === 1 && classAttrs[0].value?.type === "Literal" ? classAttrs[0] : undefined;
          const hasDynamicClass = attributes.some((attribute) => attribute.type === "JSXAttribute" &&
            (attribute.name?.name === "class:list" || (attribute.name?.name === "class" && attribute.value?.type !== "Literal")));
          if (buttonStyles && (name === "a" || name === "button") && !hasSpread && !hasDynamicClass && classAttr && /^["']/.test(classAttr.value.raw) &&
              source.slice(classAttr.value.start + 1, classAttr.value.end - 1) === classAttr.value.value) {
            const classes = classAttr.value.value.trim().split(/\s+/).filter(Boolean);
            const active = Object.entries(buttonStyles.variants).filter(([, className]) => className && classes.includes(className));
            const baseClass = classes.includes(buttonStyles.baseClass)
              ? buttonStyles.baseClass
              : (buttonStyles.aliases ?? []).find(className => classes.includes(className));
            if (baseClass && active.length <= 1) {
              const value = active[0]?.[0] ?? "primary";
              let styleAttr = ` data-ase-button-style-class="${file}:${classAttr.start}:${classAttr.end}" data-ase-button-style-value="${file}:${classAttr.value.start + 1}:${classAttr.value.end - 1}" data-ase-button-style-base="${baseClass}" data-ase-button-style-current="${value}"`;
              for (const [variant, className] of Object.entries(buttonStyles.variants))
                styleAttr += ` data-ase-button-style-${variant}="${className}"`;
              inserts.push({ at, attr: styleAttr });
            }
          }
        }
        // A literal href (quoted, no entities) is mapped to its value bytes.
        const hrefAttributes = node.openingElement.attributes ?? [];
        const href = hrefAttributes.find(
          (a) => a.type === "JSXAttribute" && a.name?.name === "href" && a.value?.type === "Literal",
        );
        if (!hrefAttributes.some((a) => a.type === "JSXSpreadAttribute") && href && /^["']/.test(href.value.raw) && source.slice(href.value.start + 1, href.value.end - 1) === href.value.value)
          inserts.push({ at, attr: ` data-ase-href="${file}:${href.value.start + 1}:${href.value.end - 1}"` });
        const headingChild = (child) => {
          if (child.type === "JSXText") return source.slice(child.start, child.end) === child.value && roundTrips(child.value);
          if (child.type !== "JSXElement" || !/^(strong|em)$/.test(child.openingElement?.name?.name) ||
              child.openingElement.attributes?.length || child.openingElement.name.name !== child.closingElement?.name?.name) return false;
          return (child.children ?? []).every(headingChild);
        };
        if (/^(?:h[1-6]|p|a|button)$/.test(name) && children.length && children.every(headingChild)) {
          const start = node.openingElement.end;
          const end = node.closingElement.start;
          attr = ` data-ase="${file}:${start}:${end}"`;
        } else if (meaningful.length === 1 && meaningful[0].type === "JSXText") {
          const text = meaningful[0];
          if (source.slice(text.start, text.end) === text.value && roundTrips(text.value))
            attr = ` data-ase="${file}:${text.start}:${text.end}"`;
          else attr = ' data-ase-reason="unverified"';
        } else if (children.some((c) => c.type === "JSXExpressionContainer"))
          attr = ' data-ase-reason="expression"';
        else if (texts.some((c) => c.value.trim()) && meaningful.length > 1)
          attr = ' data-ase-reason="mixed"';
        if (attr) inserts.push({ at, attr });
        // A heading is one bounded editing surface. Its allowed strong/em
        // descendants must not receive competing literal mappings.
        if (/^h[1-6]$/.test(name) || (/^(?:p|a|button)$/.test(name) && attr?.startsWith(" data-ase="))) return;
      }
    }
    for (const key of ["children", "body", "template"]) if (node[key]) walk(node[key]);
  };
  walk(ast);
  let out = source;
  for (const { at, attr } of inserts.sort((a, b) => b.at - a.at)) out = out.slice(0, at) + attr + out.slice(at);
  return out;
}

export default function astroSiteEditorAnnotations() {
  return {
    name: "astro-site-editor-annotations",
    hooks: {
      "astro:config:setup": ({ config, injectScript, updateConfig }) => {
        const root = fileURLToPath(config.root);
        const buttonStyles = readButtonStyles(root);
        const buttonSlots = readButtonSlots(root);
        injectScript("page", overlay);
        updateConfig({
          vite: {
            plugins: [
              {
                name: "astro-site-editor-annotate",
                enforce: "pre",
                // Astro's own transform runs first among "pre" plugins, so the
                // annotated source is supplied at load time instead.
                async load(id) {
                  const [file, query] = id.split("?");
                  if (!file.endsWith(".astro") || query || file.includes("node_modules")) return null;
                  const code = await readFile(file, "utf8");
                  return { code: annotate(code, relative(root, file).replaceAll("\\", "/"), buttonStyles, buttonSlots), map: null };
                },
              },
            ],
          },
        });
      },
    },
  };
}
