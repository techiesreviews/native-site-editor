// A picture of a page as this browser draws it (ticket am-14), so an agent can check its own work. It runs in
// the preview runtime's measuring frame (native-preview-runtime.js), where a copy of the page shown is laid out
// at the width asked. The page's composed tree (each shadow tree with its slots filled, ::before and ::after as
// boxes of their own) is copied with every element's styles as computed there into an SVG foreignObject, which
// the browser draws onto a canvas: no permission, server or network. What an SVG image cannot load stays out:
// pictures and fonts not given as data: URLs (the preview gives the site's own so) and embedded frames; a video
// shows its poster.

const XHTML = "http://www.w3.org/1999/xhtml", SVG = "http://www.w3.org/2000/svg";
/** The tallest picture, in CSS pixels: a taller section is cut there. */
const PICTURE_MAX_HEIGHT = 1600;
/** The most a picture may be, as base64. */
const PICTURE_LIMIT = 600 * 1024;

/** The part of the page to draw, in the page's own coordinates. */
interface PictureBox { left: number; top: number; width: number; height: number }
interface Picture { data: string; mimeType: string; width: number; height: number }

// Elements that draw nothing of their own, or that the copy cannot carry.
const UNDRAWN = new Set(["script", "style", "link", "meta", "template", "noscript", "source", "track", "base", "title", "head"]);
// Styles a still picture leaves out: motion (each element is copied as it is now), what would skip drawing it, and
// custom properties (every value that used them is computed already).
const UNCOPIED = /^(?:--|animation|transition|content-visibility|will-change|view-transition|cursor|pointer-events|content$)/;

/** Each element's default styles (its tag's, in no page's styles), looked up once per tag. */
function defaultStyles(doc: Document) {
  const host = doc.createElement("div");
  host.style.cssText = "all:initial;position:fixed;left:-99999px;top:0";
  const root = host.attachShadow({ mode: "open" }), svg = doc.createElementNS(SVG, "svg");
  root.append(svg);
  doc.documentElement.append(host);
  const found = new Map<string, Map<string, string>>();
  return {
    host,
    of(namespace: string | null, tag: string) {
      const key = `${namespace}|${tag}`;
      let styles = found.get(key);
      if (!styles) {
        const probe = doc.createElementNS(namespace, tag);
        (namespace === SVG && tag !== "svg" ? svg : root).append(probe);
        const style = getComputedStyle(probe);
        styles = new Map();
        for (let at = 0; at < style.length; at++) styles.set(style[at], style.getPropertyValue(style[at]));
        probe.remove();
        found.set(key, styles);
      }
      return styles;
    },
  };
}

/** `style` as inline CSS: each value that differs from the tag's default or from what it inherits. */
function styleText(style: CSSStyleDeclaration, defaults: Map<string, string>, parent?: CSSStyleDeclaration) {
  let text = "";
  for (let at = 0; at < style.length; at++) {
    const name = style[at];
    if (UNCOPIED.test(name)) continue;
    const value = style.getPropertyValue(name);
    if (value === defaults.get(name) && (!parent || value === parent.getPropertyValue(name))) continue;
    text += `${name}:${value};`;
  }
  return text;
}

/** The text a pseudo-element's `content` shows: its strings and attr()s; counters, quotes and images show nothing. */
export function contentText(content: string, el: Element) {
  let text = "";
  // Any other function (url(), counter(), image-set(), a gradient) is matched whole, so no string in it is taken for text.
  const tokens = /attr\(\s*([\w-]+)\s*\)|[\w-]+\((?:[^()"']|"[^"]*"|'[^']*'|\([^()]*\))*\)|"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
  for (const [, attr, double, single] of content.matchAll(tokens)) {
    if (attr !== undefined) text += el.getAttribute(attr) ?? "";
    else if (double !== undefined || single !== undefined) text += (double ?? single).replace(/\\([0-9a-fA-F]{1,6}) ?|\\(.)/g, (_all, hex: string | undefined, plain: string | undefined) =>
      hex ? String.fromCodePoint(parseInt(hex, 16)) : plain ?? "");
  }
  return text;
}

/** What a node shows in the composed tree: a shadow host its shadow tree, a slot what is assigned to it (else its own). */
function composedChildren(el: Element): Node[] {
  if (el.shadowRoot) return [...el.shadowRoot.childNodes];
  if (el instanceof HTMLSlotElement) {
    const assigned = el.assignedNodes();
    if (assigned.length) return assigned;
  }
  return [...el.childNodes];
}

/** The page's own @font-face rules, in a sheet and those it imports, so the picture draws its fonts. */
function fontFaces(sheets: Iterable<CSSStyleSheet>, into: Set<string>) {
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule) into.add(rule.cssText);
      else if (rule instanceof CSSImportRule && rule.styleSheet) visit(rule.styleSheet.cssRules);
      else if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of sheets) try { visit(sheet.cssRules); } catch { /* A sheet from elsewhere has no readable rules. */ }
}

/** A copy of `doc`'s page with its styles as computed, as XHTML markup, and its colour behind everything. */
function copyPage(doc: Document) {
  const defaults = defaultStyles(doc), faces = new Set<string>();
  fontFaces([...doc.styleSheets, ...doc.adoptedStyleSheets], faces);
  const element = (tag: string) => doc.createElementNS(XHTML, tag);
  function pseudo(el: Element, which: "::before" | "::after", parent: CSSStyleDeclaration, into: Element) {
    const style = getComputedStyle(el, which);
    if (!style.content || style.content === "none" || style.content === "normal" || style.display === "none") return;
    const box = element("span");
    box.setAttribute("style", styleText(style, defaults.of(XHTML, "span"), parent));
    box.textContent = contentText(style.content, el);
    into.append(box);
  }
  function copy(node: Node, parent: CSSStyleDeclaration | undefined, into: Element) {
    if (node.nodeType === Node.TEXT_NODE) { into.append(doc.createTextNode((node as Text).data)); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element, svg = el.namespaceURI === SVG;
    if (el === defaults.host || !svg && UNDRAWN.has(el.localName) || el.hasAttribute("data-native-selection-box")) return;
    const style = getComputedStyle(el);
    if (style.display === "none") return;
    let to: Element, replaced = true;
    if (svg) {
      to = doc.createElementNS(SVG, el.localName);
      for (const attr of el.attributes) if (!/^on/i.test(attr.name) && attr.name !== "style" && attr.name !== "class") to.setAttribute(attr.name, attr.value);
      replaced = false;
    } else if (el instanceof HTMLImageElement) {
      to = element("img");
      to.setAttribute("src", el.currentSrc || el.src);
      to.setAttribute("alt", el.alt);
    } else if (el instanceof HTMLCanvasElement || el instanceof HTMLVideoElement) {
      let src = "";
      try { src = el instanceof HTMLCanvasElement ? el.toDataURL() : el.poster; } catch { /* A canvas drawn from elsewhere is not readable. */ }
      to = element(src ? "img" : "div");
      if (src) to.setAttribute("src", src);
    } else if (el instanceof HTMLIFrameElement || el.localName === "object" || el.localName === "embed") to = element("div");
    else if (el instanceof HTMLInputElement) {
      to = element("input");
      for (const name of ["type", "placeholder"]) if (el.hasAttribute(name)) to.setAttribute(name, el.getAttribute(name)!);
      to.setAttribute("value", el.value);
      if (el.checked) to.setAttribute("checked", "");
    } else if (el instanceof HTMLTextAreaElement) {
      to = element("textarea");
      to.textContent = el.value;
    } else {
      // The document's own elements become boxes: an SVG image holds one document of its own.
      to = element(el.localName === "html" || el.localName === "body" ? "div" : el instanceof HTMLSlotElement ? "span" : el.localName);
      replaced = false;
    }
    // The defaults of the element written (a slot becomes a span, the document's own a div), which its styles must override.
    to.setAttribute("style", styleText(style, defaults.of(to.namespaceURI, to.localName), parent));
    if (!replaced) {
      if (!svg) pseudo(el, "::before", style, to);
      if (el.shadowRoot) fontFaces(el.shadowRoot.adoptedStyleSheets, faces);
      for (const child of composedChildren(el)) copy(child, style, to);
      if (!svg) pseudo(el, "::after", style, to);
    }
    into.append(to);
  }
  const page = element("div");
  try { copy(doc.documentElement, undefined, page); }
  finally { defaults.host.remove(); }
  // The canvas takes the root's background, else the body's (CSS backgrounds 3, "The Canvas Background").
  // Fully see-through in any colour space: rgba(…, 0), color(… / 0), oklch(… / 0).
  const clear = (colour: string) => colour === "transparent" || /^rgba\(.*,\s*0\)$/.test(colour) || /\/\s*0(?:\.0+)?%?\)$/.test(colour);
  const backdrop = [doc.documentElement, doc.body].map(el => el && getComputedStyle(el).backgroundColor).find(colour => colour && !clear(colour)) ?? "#ffffff";
  const fonts = element("style");
  fonts.textContent = [...faces].join("\n");
  page.prepend(fonts);
  return { page, backdrop };
}

/** Draws `svg` (an SVG document's markup) onto a canvas `width` × `height`, encoded within `limit` base64 characters. */
export async function encode(svg: string, width: number, height: number, backdrop: string, limit: number): Promise<Picture> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try { await image.decode(); }
  catch { throw new Error("The browser could not draw its copy of the page."); }
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not draw a picture.");
  for (let scale = 1; scale > 0.3; scale *= 0.75) {
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    context.fillStyle = backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.6, 0.4]) {
      let url: string;
      try {
        url = canvas.toDataURL("image/webp", quality);
        if (!url.startsWith("data:image/webp;")) url = canvas.toDataURL("image/jpeg", quality);
      } catch { throw new Error("The browser would not let the editor read its picture of the page."); }
      const data = url.slice(url.indexOf(",") + 1);
      if (data.length <= limit) return { data, mimeType: url.slice(5, url.indexOf(";")), width: canvas.width, height: canvas.height };
    }
  }
  throw new Error("The picture could not fit its size limit. Take one of a section instead.");
}

/**
 * A picture of `box` of the page `doc` draws, as the browser draws it now: at most PICTURE_MAX_HEIGHT tall,
 * WebP (else JPEG) within `limit` base64 characters, made smaller until it fits.
 */
export async function paintPicture(doc: Document, box: PictureBox, limit = PICTURE_LIMIT): Promise<Picture> {
  const width = Math.round(box.width), height = Math.round(Math.min(box.height, PICTURE_MAX_HEIGHT));
  if (width < 1 || height < 1) throw new Error("That part of the page takes no space at this width.");
  const { page, backdrop } = copyPage(doc);
  // The page as wide as it is laid out, moved so the box is at the picture's top left.
  page.setAttribute("style", `width:${doc.documentElement.scrollWidth}px;transform:translate(${-box.left}px,${-box.top}px);transform-origin:0 0;background:${backdrop}`);
  const markup = new XMLSerializer().serializeToString(page);
  const svg = `<svg xmlns="${SVG}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${markup}</foreignObject></svg>`;
  return encode(svg, width, height, backdrop, limit);
}
