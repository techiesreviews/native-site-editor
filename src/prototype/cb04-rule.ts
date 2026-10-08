// PROTOTYPE (wayfinder ticket 04, components-and-builder). Throwaway; not kept for the real build.
//
// A rough take on ticket 03's default editables rule, as a DOM walk over the
// element's outer HTML:
// - text elements become whole-element slots (first heading `title`, then
//   `title-2`; paragraphs and other text `text`, `text-2`);
// - img/picture `image`, a standalone link `link`, ul/ol `list`;
// - a nested component instance becomes a whole slot;
// - repeated groups (>= 2 non-text siblings, same tag + same first class)
//   become the unnamed slot (later groups `items-2`);
// - a link-wrapped card becomes a stretched link (`<a slot="link">`);
// - svg stays fixed; anything unticked stays fixed in the template.

export type SlotKind = "text" | "image" | "link" | "list" | "items" | "instance";

export interface PlannedSlot {
  /** Stable key: the element's index path inside the root ("1.0"). */
  key: string;
  /** "" for the unnamed slot. */
  name: string;
  kind: SlotKind;
  excerpt: string;
  /** Members of a repeated group, else 1. */
  count: number;
  /** Index paths (relative to the root) of what the slot outlines. */
  paths: number[][];
  stretched?: boolean;
  fixed: boolean;
}

export interface ComponentPlan {
  slots: PlannedSlot[];
  template: string;
  instance: string;
  css: string;
  notes: string[];
  rootTag: string;
}

const TEXT = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote", "li", "figcaption", "dt", "dd", "address", "pre", "label", "button", "small", "span", "cite", "time"]);
const SKIP = new Set(["svg", "script", "style", "template", "noscript", "br", "hr", "iframe", "video", "audio", "canvas", "input", "select", "textarea"]);
const isHeading = (el: Element) => /^h[1-6]$/.test(el.localName);
const excerptOf = (el: Element) => {
  if (el.localName === "img") return `image ${el.getAttribute("src") ?? ""}`.trim();
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > 48 ? `${text.slice(0, 46)}…` : text;
};

function parse(html: string) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

function isLinkCard(el: Element) {
  return el.localName === "a" && [...el.children].some((child) => isHeading(child) || ["p", "img", "picture", "div", "figure"].includes(child.localName));
}

interface Found extends PlannedSlot { el: Element; members?: Element[]; linkTarget?: Element }

/** Finds the would-be slots of `root`, in document order. */
function findSlots(root: Element, fixed: ReadonlySet<string>): Found[] {
  const found: Found[] = [];
  const counters = new Map<string, number>();
  const nameFor = (base: string) => {
    const n = (counters.get(base) ?? 0) + 1;
    counters.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
  let groups = 0;
  const add = (slot: Omit<Found, "fixed">) => found.push({ ...slot, fixed: fixed.has(slot.key) });

  const visit = (container: Element, prefix: number[]) => {
    const kids = [...container.children];
    const byKey = new Map<string, Element[]>();
    for (const kid of kids) {
      if (TEXT.has(kid.localName) || SKIP.has(kid.localName)) continue;
      const key = `${kid.localName}.${kid.classList[0] ?? ""}`;
      byKey.set(key, [...(byKey.get(key) ?? []), kid]);
    }
    kids.forEach((kid, index) => {
      const path = [...prefix, index];
      const key = path.join(".");
      const group = TEXT.has(kid.localName) || SKIP.has(kid.localName) ? undefined : byKey.get(`${kid.localName}.${kid.classList[0] ?? ""}`);
      if (group && group.length >= 2) {
        if (group[0] !== kid) return;
        const what = kid.localName.includes("-") ? `<${kid.localName}>` : kid.classList[0] ? `.${kid.classList[0]}` : `<${kid.localName}>`;
        add({ key, el: kid, members: group, name: groups++ ? nameFor("items") : "", kind: "items", count: group.length, excerpt: `${group.length} × ${what}`, paths: group.map((member) => [...prefix, kids.indexOf(member)]) });
        return;
      }
      handle(kid, path, key);
    });
  };

  const handle = (el: Element, path: number[], key: string) => {
    const tag = el.localName;
    if (SKIP.has(tag)) return;
    const one = (name: string, kind: SlotKind) => add({ key, el, name, kind, count: 1, excerpt: excerptOf(el), paths: [path] });
    if (tag.includes("-")) return one(nameFor(tag.replace(/^(section|card|site)-/, "") || tag), "instance");
    if (tag === "ul" || tag === "ol") return one(nameFor("list"), "list");
    if (tag === "img" || tag === "picture") return one(nameFor("image"), "image");
    if (isLinkCard(el)) {
      // Stretched link: the heading (or first text) carries the link; the rest is walked as usual.
      const target = [...el.children].find(isHeading) ?? [...el.children].find((child) => TEXT.has(child.localName));
      if (!target || !(el.textContent ?? "").trim()) return one(nameFor("link"), "link");
      add({ key, el, linkTarget: target, name: nameFor("link"), kind: "link", count: 1, excerpt: `${excerptOf(target)} → ${el.getAttribute("href") ?? ""}`, paths: [path], stretched: true });
      [...el.children].forEach((child, index) => { if (child !== target) handle(child, [...path, index], [...path, index].join(".")); });
      return;
    }
    if (tag === "a") return one(nameFor("link"), "link");
    if (TEXT.has(tag)) return one(nameFor(isHeading(el) ? "title" : "text"), "text");
    if (el.children.length) return visit(el, path);
    if ((el.textContent ?? "").trim()) return one(nameFor("text"), "text");
  };

  visit(root, []);
  return found;
}

/** Strips the shared indentation of every line after the first. */
export function dedentTail(text: string) {
  const lines = text.split("\n");
  const rest = lines.slice(1).filter((line) => line.trim());
  const min = rest.length ? Math.min(...rest.map((line) => /^[ \t]*/.exec(line)![0].length)) : 0;
  return [lines[0], ...lines.slice(1).map((line) => line.slice(Math.min(min, /^[ \t]*/.exec(line)![0].length)))].join("\n");
}
export const indentTail = (text: string, indent: string) => text.split("\n").map((line, i) => (i && line ? indent + line : line)).join("\n");

/** The plan for making `outerHtml` into `<tag>`, leaving the `fixed` slot keys in the template. */
export function planComponent(outerHtml: string, tag: string, fixed: ReadonlySet<string> = new Set()): ComponentPlan | { error: string } {
  const root = parse(outerHtml);
  if (!root) return { error: "Nothing to make a component from." };
  const slots = findSlots(root, fixed);
  const doc = root.ownerDocument;
  const entries: string[] = [];
  const notes: string[] = [];
  let stretched = false;
  // Index paths are taken before any change; the changes below only touch the found elements.
  for (const slot of slots) {
    if (slot.fixed) continue;
    if (slot.kind === "items" && slot.members) {
      const holder = doc.createElement("slot");
      if (slot.name) holder.setAttribute("name", slot.name);
      slot.members[0].before(holder);
      for (const member of slot.members) {
        entries.push(dedentTail(member.outerHTML));
        const prev = member.previousSibling;
        if (prev?.nodeType === Node.TEXT_NODE && !prev.textContent?.trim()) prev.remove();
        member.remove();
      }
      notes.push(`These ${slot.count} ${slot.excerpt.replace(/^\d+ × /, "")} become the ${slot.name ? `“${slot.name}” slot` : "list of items (the unnamed slot)"}; Add card works on them.`);
      continue;
    }
    if (slot.stretched && slot.linkTarget) {
      stretched = true;
      const card = slot.el;
      const link = doc.createElement("a");
      link.setAttribute("href", card.getAttribute("href") ?? "#");
      link.innerHTML = slot.linkTarget.innerHTML;
      const instanceLink = link.cloneNode(true) as Element;
      instanceLink.setAttribute("slot", slot.name);
      entries.push(instanceLink.outerHTML);
      const holder = doc.createElement("slot");
      holder.setAttribute("name", slot.name);
      holder.append(link);
      slot.linkTarget.replaceChildren(holder);
      const article = doc.createElement("article");
      for (const attr of card.attributes) if (attr.name !== "href") article.setAttribute(attr.name, attr.value);
      article.append(...card.childNodes);
      card.replaceWith(article);
      notes.push(`The link around the card becomes a stretched link: its heading is <a slot="${slot.name}">, and the CSS keeps the whole card clickable.`);
      continue;
    }
    const clone = slot.el.cloneNode(true) as Element;
    clone.setAttribute("slot", slot.name);
    entries.push(dedentTail(clone.outerHTML));
    const holder = doc.createElement("slot");
    holder.setAttribute("name", slot.name);
    slot.el.replaceWith(holder);
    holder.append(slot.el);
    if (slot.kind === "instance") notes.push(`The nested <${slot.el.localName}> becomes a whole slot: each page keeps its own copy and its slots.`);
  }
  const id = root.getAttribute("id");
  root.removeAttribute("id");
  const template = `${dedentTail(root.outerHTML)}\n`;
  const instance = `<${tag}${id ? ` id="${id}"` : ""}>${entries.length ? `\n${entries.map((entry) => `  ${indentTail(entry, "  ")}`).join("\n")}\n` : ""}</${tag}>`;
  const flow = root.classList.contains("flow");
  const cssParts = [":host {\n  display: block;\n}\n"];
  if (flow) cssParts.push(`/* Slots are display: contents, so .flow's margins between children do not\n   reach what a page slots in: the component spaces its parts with a gap. */\n${root.localName} {\n  display: flex;\n  flex-direction: column;\n  gap: var(--space-m);\n}\n`);
  if (stretched) cssParts.push(`/* Stretched link: the card's heading link covers the whole card. */\narticle {\n  position: relative;\n}\n\narticle a::after {\n  content: "";\n  position: absolute;\n  inset: 0;\n}\n`);
  return { slots: slots.map(({ key, name, kind, excerpt, count, paths, stretched: s, fixed: f }) => ({ key, name, kind, excerpt, count, paths, stretched: s, fixed: f })), template, instance, css: cssParts.join("\n"), notes, rootTag: root.localName };
}

/** A tag name for the element: its id, else its first heading, else its class. */
export function suggestName(outerHtml: string, taken: Iterable<string>) {
  const root = parse(outerHtml);
  const prefix = root?.localName === "article" ? "card" : root?.localName === "header" ? "site-header" : root?.localName === "footer" ? "site-footer" : "section";
  const slug = (text: string, words = 2) => text.toLowerCase().replace(/&[a-z]+;/g, " ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).slice(0, words).join("-");
  const heading = root?.querySelector("h1,h2,h3,h4,h5,h6")?.textContent ?? "";
  const cls = [...(root?.classList ?? [])].find((name) => !["flow", "cards"].includes(name));
  const word = slug(root?.id ?? "") || (heading ? slug(heading.replace(/^(recent|our|the|a|an)\s+/i, ""), 1) : "") || slug(cls ?? "") || "block";
  const base = prefix.includes("-") ? prefix : `${prefix}-${word}`;
  const used = new Set(taken);
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
  return name;
}

/** The instance markup for a template with every named slot's fallback copied in (ticket 03, point 7). */
export function instanceFromTemplate(template: string, tag: string) {
  const tpl = document.createElement("template");
  tpl.innerHTML = template;
  const entries: string[] = [];
  for (const slot of tpl.content.querySelectorAll("slot[name]")) {
    const fallback = slot.firstElementChild;
    if (!fallback) continue;
    const clone = fallback.cloneNode(true) as Element;
    clone.setAttribute("slot", slot.getAttribute("name")!);
    entries.push(dedentTail(clone.outerHTML));
  }
  return `<${tag}>${entries.length ? `\n${entries.map((entry) => `  ${indentTail(entry, "  ")}`).join("\n")}\n` : ""}</${tag}>`;
}
