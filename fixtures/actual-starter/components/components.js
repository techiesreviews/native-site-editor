// The site's component loader, loaded by every page with
//   <script type="module" src="/components/components.js"></script>
// No dependencies and no build step: it is part of the site, like the pages.
//
// A component is two files, components/<tag>/<tag>.html (the template) and
// components/<tag>/<tag>.css (its styles, optional); there is no list of tags. The
// loader looks for custom elements that are not defined yet (tags with a
// dash): in the page when it loads, in whatever other scripts add to the page
// later, and in each template it renders, so components can use components.
// For each new tag it fetches the two files once and defines the element.
// Every instance gets an open shadow root holding, in order:
//   1. the page's own stylesheets (each <link rel="stylesheet"> in <head>),
//   2. the component's CSS, with a ::slotted() twin added to each selector, so
//      `h1 { … }` styles the template's fallback <h1> and the page's
//      <h1 slot="title"> alike,
//   3. the template.
//
// If a tag's files cannot be fetched, the loader warns once and leaves the
// tag undefined, so a site script may define it instead. It marks the tag's
// elements data-unloaded, which styles/site.css shows as they are.
//
// Optional parts hide themselves (see hideEmpty), and links in the shadow root
// that point at the current page get aria-current="page".

const folder = new URL("./", import.meta.url);
const requested = new Set();
const unloaded = new Set();
const startY = scrollY;
let pending = 0;
let settled = false;

find(document);
new MutationObserver((records) => {
  for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) find(node);
}).observe(document.documentElement, { childList: true, subtree: true });

// Loads the tag of each undefined custom element in `root`, and of `root`.
function find(root) {
  const found = [...root.querySelectorAll(":not(:defined)")];
  if (root.nodeType === 1 && root.matches(":not(:defined)")) found.push(root);
  for (const el of found) {
    const tag = el.localName;
    if (!tag.includes("-")) continue;
    if (unloaded.has(tag)) el.setAttribute("data-unloaded", "");
    else if (!requested.has(tag)) {
      requested.add(tag);
      load(tag);
    }
  }
}

async function load(tag) {
  pending++;
  const base = new URL(`${tag}/${tag}`, folder);
  // A missing stylesheet is no styles; a missing template is no component.
  const text = async (url, optional) => {
    const response = await fetch(url);
    if (optional && response.status === 404) return "";
    if (!response.ok) throw new Error(`${response.status} for ${url}`);
    return response.text();
  };
  try {
    const [html, css] = await Promise.all([text(`${base}.html`), text(`${base}.css`, true)]);
    if (!customElements.get(tag)) define(tag, html, css);
  } catch (error) {
    if (customElements.get(tag)) return;
    unloaded.add(tag);
    console.warn(`<${tag}> was not loaded (${error.message}); its elements show their own content.`);
    mark(document, tag);
  } finally {
    if (--pending === 0 && !settled) {
      settled = true;
      requestAnimationFrame(followHash);
    }
  }
}

// The browser scrolls to a link's target (/#work) before the components above
// it have rendered and grown, so it falls short. Once the page's components
// have loaded, scroll there again, unless the reader has scrolled meanwhile.
function followHash() {
  let target = null;
  try {
    target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  } catch {}
  if (target && scrollY === startY) target.scrollIntoView();
}

// Marks the undefined <tag> elements in `root` and in the shadow roots in it.
function mark(root, tag) {
  for (const el of root.querySelectorAll("*")) {
    if (el.localName === tag && !el.matches(":defined")) el.setAttribute("data-unloaded", "");
    if (el.shadowRoot) mark(el.shadowRoot, tag);
  }
}

function define(tag, html, css) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const section = isSection(template.content);
  const styles = `${withSlottedRules(css)}\n[data-empty] { display: none !important; }\n`;

  customElements.define(tag, class extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: "open" });
      for (const link of document.head.querySelectorAll('link[rel~="stylesheet"]')) root.append(link.cloneNode());
      const style = document.createElement("style");
      style.textContent = styles;
      root.append(style, template.content.cloneNode(true));
      markCurrentPage(root);
      const update = () => hideEmpty(root, section);
      root.addEventListener("slotchange", update);
      update();
      find(root);
    }
  });
}

// A section component's template is one <section> and nothing else.
function isSection(fragment) {
  const nodes = [...fragment.childNodes].filter(isContent);
  return nodes.length === 1 && nodes[0].localName === "section";
}

// An element, or text that is not just white space.
const isContent = (node) => node.nodeType === 1 || (node.nodeType === 3 && node.textContent.trim() !== "");

function markCurrentPage(root) {
  const page = (path) => path.replace(/\/index\.html$/, "/");
  for (const link of root.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href");
    const url = new URL(href, location.href);
    if (!href.includes("#") && url.origin === location.origin && page(url.pathname) === page(location.pathname)) {
      link.setAttribute("aria-current", "page");
    }
  }
}

// Optional parts, recomputed whenever the page changes what fills a slot:
// - In a section component that the page fills at all, a slot the page does
//   not fill is hidden with its fallback. A bare tag (nothing filled) shows
//   every fallback.
// - An element that holds slots, has no text of its own and whose slots all
//   show nothing is hidden too: a wrapper round two unfilled buttons goes.
function hideEmpty(root, section) {
  // The page filled the slot (its fallback does not count).
  const filled = (slot) => Boolean(slot) && slot.assignedNodes().length > 0 && slot.assignedNodes({ flatten: true }).some(isContent);
  const unmet = (slot) => Boolean(section) && [...root.host.childNodes].some(isContent) && !filled(slot);
  const showsSomething = (slot) => filled(slot) || (!unmet(slot) && [...slot.childNodes].some(isContent));
  const ownText = (el) =>
    [...el.childNodes].some((node) =>
      node.nodeType === 3 ? node.textContent.trim() !== "" : node.nodeType === 1 && node.localName !== "slot" && ownText(node));

  for (const el of root.querySelectorAll("*")) {
    if (el.localName === "style" || el.localName === "link") continue;
    let empty;
    if (el.localName === "slot") empty = unmet(el);
    else {
      const inner = el.querySelectorAll("slot");
      empty = inner.length > 0 && ![...inner].some(showsSomething) && !ownText(el);
    }
    el.toggleAttribute("data-empty", empty);
  }
}

// The ::slotted() twins. `h1` also reads `::slotted(h1)`, `.actions a` also
// `.actions ::slotted(a)`: a rule for the template's own elements then also
// reaches what a page slots in, which it cannot across the shadow boundary.
// Only selector lists change. No twin is added where ::slotted() cannot take
// the selector (a pseudo-element, :host, &, :has() in the last compound, or a
// combinator inside a pseudo-class argument), where the selector already
// crosses a slot or part, or where the list already has it. @keyframes,
// @font-face and other non-grouping at-rules are left alone.
const GROUPING = new Set(["media", "supports", "layer", "container", "scope", "starting-style", "document", "-moz-document"]);

function withSlottedRules(css) {
  const inserts = [];
  // What each open block holds: rules, or a style rule's declarations and nested rules.
  const stack = [];
  let mode = "rules";
  let pos = 0;
  while (pos < css.length) {
    pos = skipSpace(css, pos);
    if (pos >= css.length) break;
    if (css[pos] === "}") {
      mode = stack.pop() ?? "rules";
      pos++;
      continue;
    }
    const stop = preludeEnd(css, pos);
    if (css[stop] !== "{") {
      // A declaration or a statement at-rule.
      pos = css[stop] === ";" ? stop + 1 : stop;
      continue;
    }
    const prelude = css.slice(pos, stop);
    const text = prelude.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, " ").trim();
    if (text.startsWith("@")) {
      const name = /^@([\w-]+)/.exec(text)?.[1].toLowerCase() ?? "";
      if (GROUPING.has(name)) {
        stack.push(mode);
        pos = stop + 1;
      } else pos = blockEnd(css, stop);
      continue;
    }
    if (mode === "style" && /^--[\w-]*\s*:/.test(text)) {
      // A custom property whose value holds a block.
      pos = blockEnd(css, stop);
      continue;
    }
    const twins = slottedTwins(text);
    if (twins) inserts.push({ at: pos + prelude.trimEnd().length, text: twins });
    stack.push(mode);
    mode = "style";
    pos = stop + 1;
  }
  let out = "", cursor = 0;
  for (const { at, text } of inserts) {
    out += css.slice(cursor, at) + text;
    cursor = at;
  }
  return out + css.slice(cursor);
}

// `, <twin>…` for the parts of a selector list that lack their twin, or "".
function slottedTwins(list) {
  const parts = splitSelectorList(list);
  const normal = (selector) => selector.replace(/\s+/g, " ").replace(/\s*([>+~(),])\s*/g, "$1").trim();
  const have = new Set(parts.map(normal));
  const twins = [];
  for (const part of parts) {
    const twin = slottedTwin(part);
    if (twin && !have.has(normal(twin))) {
      have.add(normal(twin));
      twins.push(twin);
    }
  }
  return twins.length ? `, ${twins.join(", ")}` : "";
}

// `prefix ::slotted(last compound)` for one complex selector, or undefined.
function slottedTwin(selector) {
  if (/::?(?:slotted|part)\(/i.test(selector)) return undefined;
  const start = lastCompoundStart(selector);
  const compound = selector.slice(start);
  if (!compound || /[&]|:host\b|:has\(|::|:(?:before|after|first-line|first-letter)\b/i.test(compound)) return undefined;
  if (complexArgument(compound)) return undefined;
  return `${selector.slice(0, start)}::slotted(${compound})`;
}

// Whether a pseudo-class argument in the compound holds a combinator
// (`:not(.x .y)`), which ::slotted() refuses. In `:nth-*(An+B of S)` only S
// is a selector.
function complexArgument(compound) {
  const text = compound
    .replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, "\"\"")
    .replace(/(:nth-[\w-]+\()([^()]*?)(?:\bof\b([^()]*))?\)/gi, (_, open, _nth, of = "") => `${open}${of})`);
  const opens = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "(") opens.push(index);
    else if (text[index] === ")" && opens.length) {
      const inner = text.slice(opens.pop() + 1, index);
      if (splitSelectorList(inner).some((part) => lastCompoundStart(part.trim()) > 0)) return true;
    }
  }
  return false;
}

// Where the last compound selector starts: after the last combinator
// (white space, >, +, ~) outside parentheses, brackets and strings.
function lastCompoundStart(selector) {
  let start = 0, depth = 0, quote = "";
  for (let index = 0; index < selector.length; index++) {
    const char = selector[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
    } else if (char === "\\") index++;
    else if (char === "'" || char === "\"") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if ((char === ")" || char === "]") && depth) depth--;
    else if (depth === 0 && /[\s>+~]/.test(char)) start = index + 1;
  }
  return start;
}

// A selector list's parts, split on top-level commas.
function splitSelectorList(selector) {
  const out = [];
  let start = 0, depth = 0, quote = "";
  for (let index = 0; index <= selector.length; index++) {
    const char = selector[index] ?? ",";
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
    } else if (char === "\\") index++;
    else if (char === "'" || char === "\"") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if ((char === ")" || char === "]") && depth) depth--;
    else if (char === "," && depth === 0) {
      const part = selector.slice(start, index).trim();
      if (part) out.push(part);
      start = index + 1;
    }
  }
  return out;
}

function skipSpace(css, pos) {
  while (pos < css.length) {
    if (/\s/.test(css[pos])) pos++;
    else if (css.startsWith("/*", pos)) {
      const close = css.indexOf("*/", pos + 2);
      pos = close === -1 ? css.length : close + 2;
    } else break;
  }
  return pos;
}

// The index of the {, ; or } that ends the statement starting at `pos`
// (outside comments, strings, parentheses and brackets), or the end.
function preludeEnd(css, pos) {
  let depth = 0, quote = "";
  for (let index = pos; index < css.length; index++) {
    const char = css[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote || char === "\n") quote = "";
    } else if (char === "\\") index++;
    else if (char === "/" && css[index + 1] === "*") {
      const close = css.indexOf("*/", index + 2);
      if (close === -1) return css.length;
      index = close + 1;
    } else if (char === "'" || char === "\"") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if ((char === ")" || char === "]") && depth) depth--;
    else if (depth === 0 && (char === "{" || char === ";" || char === "}")) return index;
  }
  return css.length;
}

// Just past the } matching the { at `open`.
function blockEnd(css, open) {
  let depth = 0;
  for (let index = open; index < css.length; index++) {
    const stop = preludeEnd(css, index);
    if (stop >= css.length) return css.length;
    if (css[stop] === "{") depth++;
    else if (css[stop] === "}" && --depth === 0) return stop + 1;
    index = stop;
  }
  return css.length;
}
