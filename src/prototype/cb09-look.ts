// PROTOTYPE (wayfinder ticket 09, components-and-builder). Throwaway; not kept for the real build.
//
// Card looks, shown: a live thumbnail of a card (its markup rendered with
// the site's own CSS, each component as a declarative shadow root holding
// the page's styles and its CSS with ::slotted() twins, as components.js
// does), and the three ways round 2 offers to choose one: D's menu under a
// chip on the card, E's gallery from the Add card split button, F's row of
// thumbnails in the strip.

import { withSlottedRules } from "../../shared/slotted-css";
import { allLooks, btn, cardMarkup, componentCss, componentSource, deps, el, escapeHtml, frame, sameLook, type Content, type Look } from "./cb09-core";

// ---- The site's CSS, its @imports inlined. ----
let cssCache: { key: string; css: string } | undefined;
function siteCss(): string {
  const read = (path: string, depth = 0): string => {
    const text = deps().source(path) ?? "";
    if (depth > 3) return text;
    const folder = path.replace(/[^/]*$/, "");
    return text.replace(/@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*;/g, (_, href: string) => read(href.startsWith("/") ? href.slice(1) : `${folder}${href}`, depth + 1));
  };
  const css = read("styles/site.css");
  if (cssCache?.key !== css) cssCache = { key: css, css };
  return cssCache.css;
}

const VOID = new Set(["img", "br", "hr", "input", "meta", "link", "source", "wbr", "area", "col", "embed", "track"]);
const attr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** An image as the preview shows it (its loaded address), else a placeholder. */
function imageSrc(src: string): string {
  try {
    const doc = frame()?.contentDocument;
    const hit = doc && [...doc.querySelectorAll("img")].find((img) => img.getAttribute("src") === src);
    if (hit?.currentSrc) return hit.currentSrc;
  } catch { /* another origin */ }
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="#dfe5da"/><path d="M20 72l30-30 22 20 16-12 32 22z" fill="#b9c4b3"/><circle cx="112" cy="28" r="9" fill="#b9c4b3"/></svg>`)}`;
}

function serialize(nodes: ArrayLike<Node>, depth: number): string {
  let out = "";
  for (const node of Array.from(nodes)) {
    if (node.nodeType === Node.TEXT_NODE) out += escapeHtml(node.textContent ?? "");
    else if (node.nodeType === Node.ELEMENT_NODE) out += serializeElement(node as Element, depth);
  }
  return out;
}
function serializeElement(element: Element, depth: number): string {
  const tag = element.localName;
  const attrs = [...element.attributes].map((a) => ` ${a.name}="${attr(tag === "img" && a.name === "src" ? imageSrc(a.value) : a.value)}"`).join("");
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  let inner = "";
  const template = depth < 4 && tag.includes("-") ? componentSource(tag) : undefined;
  if (template !== undefined) inner += `<template shadowrootmode="open"><style>${siteCss()}\n${withSlottedRules(componentCss(tag))}</style>${serializeHtml(template, depth + 1)}</template>`;
  return `<${tag}${attrs}>${inner}${serialize(element.childNodes, depth)}</${tag}>`;
}
function serializeHtml(html: string, depth: number) {
  const t = document.createElement("template");
  t.innerHTML = html;
  return serialize(t.content.childNodes, depth);
}

/** A live thumbnail of `content` as a card in `look`. */
export function thumb(look: Look, content: Content | undefined, size: { width: number; height: number; zoom: number }) {
  const frameEl = el("iframe", "cb09-thumb");
  frameEl.setAttribute("aria-hidden", "true");
  frameEl.tabIndex = -1;
  frameEl.style.width = `${size.width}px`;
  frameEl.style.height = `${size.height}px`;
  const card = serializeHtml(cardMarkup(look, "", content ?? { extras: {} }), 0);
  const inner = Math.round(size.width / size.zoom - 24);
  frameEl.srcdoc = `<!doctype html><html style="zoom:${size.zoom}"><head><style>${siteCss()}</style><style>:not(:defined){visibility:visible!important}html,body{overflow:hidden}body{margin:0;padding:12px;background:var(--page,#f5f5f0)}.cb09-t{width:${inner}px}</style></head><body><div class="cb09-t">${card}</div></body></html>`;
  return frameEl;
}

const flat = (base: Look) => allLooks(base).flatMap((entry) => [entry.component, ...entry.variants]);

// ---- Popups. ----
let openPopup: { close: () => void } | undefined;
function popup(anchor: HTMLElement, box: HTMLElement, place: "below" | "above-or-below" = "above-or-below") {
  openPopup?.close();
  document.body.append(box);
  const a = anchor.getBoundingClientRect();
  const width = box.offsetWidth;
  box.style.left = `${Math.max(8, Math.min(a.left, innerWidth - width - 8))}px`;
  const height = box.offsetHeight;
  const below = a.bottom + 6;
  const fitsBelow = below + height <= innerHeight - 60;
  box.style.top = `${place === "below" || fitsBelow ? Math.min(below, innerHeight - height - 60) : Math.max(8, a.top - height - 6)}px`;
  const onDown = (event: PointerEvent) => { if (!box.contains(event.target as Node) && !anchor.contains(event.target as Node)) close(); };
  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); anchor.focus(); } };
  setTimeout(() => document.addEventListener("pointerdown", onDown, true));
  document.addEventListener("keydown", onKey, true);
  function close() {
    box.remove();
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    if (openPopup?.close === close) openPopup = undefined;
  }
  openPopup = { close };
  (box.querySelector("[aria-current='true']") as HTMLElement | null ?? box.querySelector("button"))?.focus();
  return close;
}

function tile(look: Look, content: Content | undefined, current: boolean, label: string, size: { width: number; height: number; zoom: number }, pick: () => void, badge?: string) {
  const out = btn("", pick, `cb09-tile${current ? " is-current" : ""}`);
  out.setAttribute("aria-current", String(current));
  const name = el("span", "cb09-tile__label", label);
  if (badge) name.append(el("span", "cb09-tile__badge", badge));
  out.append(thumb(look, content, size), name);
  return out;
}

/** D: the menu under the card's "Card: … ▾" chip: card components, then the current component's variants. */
export function lookMenu(anchor: HTMLElement, base: Look, current: Look, content: Content, onPick: (look: Look) => void) {
  const box = el("div", "cb09-lookmenu");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Card look");
  const size = { width: 132, height: 96, zoom: 0.42 };
  let close = () => {};
  const choose = (look: Look) => { close(); onPick(look); };
  box.append(el("p", "cb09-lookmenu__head", "Card component"));
  const comps = el("div", "cb09-lookmenu__grid");
  for (const entry of allLooks(base)) {
    const look = entry.component;
    const isCurrent = look.html ? Boolean(current.html) : current.tag === look.tag;
    comps.append(tile(look, content, isCurrent, look.html ? "this grid's item" : look.tag!, size, () => choose(look), sameLook(look, base) ? "usual" : undefined));
  }
  box.append(comps);
  const own = allLooks(base).find((entry) => entry.component.tag && entry.component.tag === current.tag);
  if (own?.variants.length) {
    box.append(el("p", "cb09-lookmenu__head", `Variants of ${current.tag}`));
    const variants = el("div", "cb09-lookmenu__grid");
    const plain: Look = { tag: current.tag, label: current.tag! };
    variants.append(tile(plain, content, !current.variant, "default", size, () => choose(plain)));
    for (const look of own.variants) variants.append(tile(look, content, sameLook(look, current), `${look.variant!.name.replace(/^data-/, "")}: ${look.variant!.value}`, size, () => choose(look)));
    box.append(variants);
  }
  box.append(el("p", "cb09-hint", "The card keeps its title, text, image and link; what a look has no slot for is listed after the swap."));
  close = popup(anchor, box);
}

/** E: the gallery from Add card's ▾: every look, as a blank card of it. */
export function lookGallery(anchor: HTMLElement, base: Look, noun: string, onPick: (look: Look) => void) {
  const box = el("div", "cb09-gallery");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Add a card in a look");
  box.append(el("p", "cb09-gallery__title", `Add ${noun} as…`), el("p", "cb09-gallery__sub", "Card components and their variants, with the site's styles. A blank card of that look goes after the last one; link it to a page next."));
  const grid = el("div", "cb09-gallery__grid");
  let close = () => {};
  for (const look of flat(base))
    grid.append(tile(look, undefined, false, look.html ? "this grid's item" : look.variant ? `${look.tag} · ${look.variant.value}` : look.tag!, { width: 168, height: 132, zoom: 0.5 }, () => { close(); onPick(look); }, sameLook(look, base) ? "usual" : undefined));
  box.append(grid);
  close = popup(anchor, box);
}

/** F: the strip's Look row: the card's own content in every look; the current one marked. */
export function lookRow(base: Look, current: Look, content: Content, onPick: (look: Look) => void) {
  const row = el("div", "cb09-lookrow");
  for (const look of flat(base))
    row.append(tile(look, content, sameLook(look, current), look.html ? "grid item" : look.variant ? `${look.tag!.replace(/^card-/, "")} · ${look.variant.value}` : look.tag!.replace(/^card-/, ""), { width: 112, height: 92, zoom: 0.38 }, () => { if (!sameLook(look, current)) onPick(look); }, sameLook(look, base) ? "usual" : undefined));
  return row;
}

export const closeLookPopup = () => openPopup?.close();
