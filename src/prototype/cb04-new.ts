// PROTOTYPE (wayfinder ticket 04, components-and-builder). Throwaway; not kept for the real build.
//
// Flow 2, New component made directly, three ways:
// A: a small dialog (name, start from), then the template in the code pane
//    beside the preview and an instance placed on the page;
// B: build first, name at the end: an empty <section class="flow"> on the
//    page in a "Component in progress" frame, a mini block palette, and
//    Finish component… which runs Flow 1's in-preview mode (variant B) on it;
// C: a dialog, then a faked "template canvas" (its own same-origin iframe
//    with the site's CSS) over the preview; Done writes the files.

import { nativeElementMarkup } from "../page-builder/native-elements";
import { locateNativeElementRange } from "../native-source-location";
import { instanceFromTemplate } from "./cb04-rule";
import {
  state, deps, el, btn, toast, takenTags, nameField, codeView, sources, insertMarkup, makeAndPlace,
  frameRects, targetAt, scrollFrame,
} from "./cb04-core";
import { makeInPreview } from "./cb04-make";

const BLANK_TEMPLATE = `<section class="flow">
  <slot name="title"><h2>New section</h2></slot>
  <slot name="text"><p>A sentence or two about what this section is for.</p></slot>
  <slot></slot>
</section>
`;
const BLANK_CSS = `:host {
  display: block;
}

/* Slots are display: contents, so .flow's margins between children do not
   reach what a page slots in: the component spaces its parts with a gap. */
section {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}
`;

const freeName = (base: string) => {
  const taken = new Set(takenTags());
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  return name;
};

async function waitForComponent(tag: string) {
  for (let i = 0; i < 40 && !takenTags().includes(tag); i++) await new Promise((r) => setTimeout(r, 100));
}

/** The start: blank, or a copy of a site component's files. */
function startFrom(choice: string) {
  if (choice === "blank") return { html: BLANK_TEMPLATE, css: BLANK_CSS };
  const path = deps().site()?.components[choice];
  const html = path ? sources()[path] ?? "" : "";
  const css = path ? sources()[path.replace(/\.html$/, ".css")] ?? ":host {\n  display: block;\n}\n" : BLANK_CSS;
  return { html, css };
}

// The dialog A and C share: name + Start from.
function newDialogShell(options: { title: string; note: string; action: string; onCreate: (tag: string, start: { html: string; css: string }, choice: string) => void }) {
  const dialog = el("dialog", "create-dialog cb04-dialog cb04-dialog--small");
  dialog.setAttribute("aria-label", options.title);
  const form = el("form", "create-dialog__form");
  form.method = "dialog";
  const name = nameField(freeName("section-new"), () => render());
  const fieldset = el("fieldset", "cb04-start");
  fieldset.append(el("legend", "", "Start from"));
  const radio = (value: string, label: string, hint: string) => {
    const wrap = el("label", "cb04-start__choice");
    const input = el("input");
    input.type = "radio";
    input.name = "cb04-start";
    input.value = value;
    const text = el("span", "cb04-start__text");
    text.append(el("strong", "", label), el("span", "", hint));
    wrap.append(input, text);
    input.addEventListener("change", () => render());
    return { wrap, input };
  };
  const blank = radio("blank", "Blank section", "A title, a text and room for items: <section class=\"flow\">");
  const copy = radio("copy", "Copy of an existing component", "Its template and CSS, under the new name");
  blank.input.checked = true;
  const select = el("select", "cb04-start__select");
  for (const tag of takenTags().sort()) select.append(new Option(`<${tag}>`, tag));
  select.addEventListener("change", () => { copy.input.checked = true; render(); });
  copy.wrap.querySelector(".cb04-start__text")!.append(select);
  fieldset.append(blank.wrap, copy.wrap);
  const preview = el("details", "cb04-dialog__code");
  preview.append(el("summary", "", "Template preview"));
  const code = el("div");
  preview.append(code);
  const actions = el("div", "create-dialog__actions");
  const ok = el("button", "button primary", options.action);
  ok.type = "submit";
  actions.append(btn("Cancel", () => dialog.close()), ok);
  form.append(el("h2", "create-dialog__title", options.title), el("p", "create-dialog__result", options.note), name.wrap, fieldset, preview, actions);
  dialog.append(form);
  document.body.append(dialog);
  const choice = () => (copy.input.checked ? select.value : "blank");
  function render() {
    const tag = name.value() || "x-component";
    code.replaceChildren(codeView(`components/${tag}/${tag}.html`, startFrom(choice()).html));
    ok.disabled = Boolean(name.problem());
  }
  render();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (name.problem()) return;
    dialog.close();
    options.onCreate(name.value(), startFrom(choice()), choice());
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  name.input.select();
}

// ---------------------------------------------------------------- A: dialog, then the source.
export function newDialog() {
  newDialogShell({
    title: "New component",
    note: "Writes components/<name>/<name>.html and .css, places an instance on this page and opens the template beside the preview.",
    action: "Create component",
    onCreate: async (tag, start) => {
      const placed = await makeAndPlace(tag, start.html, start.css, instanceFromTemplate(start.html, tag));
      if (!placed) return;
      await waitForComponent(tag);
      await state.host?.editComponent(tag);
      toast(`Made <${tag}> · placed on this page; its template is open beside the preview`);
    },
  });
}

// ---------------------------------------------------------------- B: build first, name at the end.
const BLOCKS: { key: string; label: string; markup: (level: number) => string }[] = [
  { key: "heading", label: "Heading", markup: (level) => nativeElementMarkup("heading", { level: Math.min(level, 4) as 2 | 3 | 4, text: "Heading" }) },
  { key: "text", label: "Paragraph", markup: () => nativeElementMarkup("text", { text: "A sentence or two about this." }) },
  { key: "image", label: "Image", markup: () => nativeElementMarkup("image", { src: "/images/studio-desk.svg", alt: "" }) },
  { key: "button", label: "Button", markup: () => nativeElementMarkup("link-button", { className: "btn", href: "/about/#contact", text: "Get in touch" }) },
  { key: "div", label: "Div", markup: () => `<div class="flow"></div>` },
];

let wip: { path: string; node: number[] } | undefined;
let wipCleanup: (() => void) | undefined;

export function newBuildFirst() {
  wipCleanup?.();
  const point = insertMarkup(`<section class="flow"></section>`);
  if (!point) return;
  wip = { path: point.path, node: point.node };
  showWip();
  toast("An empty section is on the page: add blocks, then Finish component…");
}

/** Inserts a block's markup as the last child of the in-progress section (or the selected Div in it). */
function addBlock(block: (typeof BLOCKS)[number]) {
  if (!wip) return;
  const source = sources()[wip.path];
  const editor = deps().editor();
  if (source === undefined || !editor) return;
  // The selected Div inside the section takes the block, else the section.
  let container = wip.node;
  const selection = deps().selection();
  if (selection?.path === wip.path && selection.node && selection.node.length > wip.node.length && wip.node.every((n, i) => selection.node![i] === n)) {
    for (let depth = selection.node.length; depth > wip.node.length; depth--) {
      const candidate = selection.node.slice(0, depth);
      const range = locateNativeElementRange(source, candidate);
      if (range?.tag.name === "div") { container = candidate; break; }
    }
  }
  const range = locateNativeElementRange(source, container);
  if (!range?.close) return;
  const lineStart = source.lastIndexOf("\n", range.start - 1) + 1;
  const indent = source.slice(lineStart, range.start).replace(/\S.*$/, "");
  const inner = source.slice(range.tag.end, range.close.start);
  const level = container.length === wip.node.length ? 2 : 3;
  const text = `${inner.trimEnd()}\n${indent}  ${block.markup(level)}\n${indent}`;
  // The new block is the container's last element child.
  const count = new DOMParser().parseFromString(`<body>${inner}</body>`, "text/html").body.children.length;
  deps().preview()?.selectAfterUpdate({ path: wip.path, node: [...container, count] });
  editor.replaceActiveRange({ path: wip.path, start: range.tag.end, end: range.close.start, expected: inner, text });
}

function showWip() {
  if (!wip) return;
  const current = wip;
  document.documentElement.classList.add("cb04-wip-on");
  const layer = el("div", "cb04-wip");
  const frameBox = el("div", "cb04-wip__frame");
  frameBox.append(el("span", "cb04-wip__label", "Component in progress"));
  const empty = el("div", "cb04-wip__empty", "Empty section: add blocks from the bar below. Select a Div to add into it.");
  frameBox.append(empty);
  frameBox.addEventListener("wheel", (event) => scrollFrame(event.deltaY), { passive: true });
  const palette = el("div", "cb04-wip__palette");
  palette.append(el("span", "cb04-wip__palette-label", "Add"));
  for (const block of BLOCKS) palette.append(btn(block.label, () => addBlock(block), "cb04-wip__block"));
  palette.append(el("span", "cb04-wip__sep"), btn("Discard", () => discard(), "cb04-wip__discard"), btn("Finish component…", () => finishWip(), "cb04-wip__finish"));
  layer.append(frameBox, palette);
  document.body.append(layer);
  let alive = true;
  async function follow() {
    if (!alive) return;
    const [r] = await frameRects(current.path, [current.node]);
    const f = document.querySelector(".native-preview-frame")?.getBoundingClientRect();
    frameBox.hidden = palette.hidden = !r || !f;
    if (r && f) {
      const bottom = Math.min(r.y + r.h, f.bottom);
      Object.assign(frameBox.style, { left: `${r.x - 8}px`, top: `${r.y - 8}px`, width: `${r.w + 16}px`, height: `${r.h + 16}px` });
      frameBox.classList.toggle("is-clipped-top", r.y < f.top);
      Object.assign(palette.style, { left: `${r.x + r.w / 2}px`, top: `${Math.min(Math.max(bottom + 14, f.top + 40), f.bottom - 56)}px` });
      const source = sources()[current.path] ?? "";
      const range = locateNativeElementRange(source, current.node);
      empty.hidden = !range?.close || /<[a-z]/i.test(source.slice(range.tag.end, range.close.start));
    }
    setTimeout(() => void follow(), 120);
  }
  void follow();
  wipCleanup = () => {
    alive = false;
    layer.remove();
    document.documentElement.classList.remove("cb04-wip-on");
    wipCleanup = undefined;
  };
}

function finishWip() {
  if (!wip) return;
  const target = targetAt(wip.path, wip.node);
  if (!target) { toast("The section in progress could not be found."); return; }
  wipCleanup?.();
  document.querySelector(".cb04-toast")?.remove();
  makeInPreview(target, { heading: "Finish component", onCancel: () => showWip() });
}

function discard() {
  if (!wip) return;
  const source = sources()[wip.path];
  const range = source !== undefined ? locateNativeElementRange(source, wip.node) : undefined;
  const editor = deps().editor();
  if (source !== undefined && range && editor) {
    const lineStart = source.lastIndexOf("\n", range.start - 1);
    editor.replaceActiveRange({ path: wip.path, start: lineStart, end: range.end, expected: source.slice(lineStart, range.end), text: "" });
  }
  wipCleanup?.();
  wip = undefined;
}

// ---------------------------------------------------------------- C: template canvas.
export function newCanvas() {
  newDialogShell({
    title: "New component",
    note: "Opens the template canvas: the component alone, with the site's CSS. Done writes its files.",
    action: "Open template canvas",
    onCreate: (tag, start) => openCanvas(tag, start.html, start.css),
  });
}

/** The site's stylesheets for the open page, @imports inlined. */
function siteCss() {
  const all = sources();
  const page = all[deps().currentPath() ?? ""] ?? all["index.html"] ?? "";
  const hrefs = [...page.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ""));
  const seen = new Set<string>();
  const inline = (path: string): string => {
    if (seen.has(path)) return "";
    seen.add(path);
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
    return (all[path] ?? "").replace(/@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*;|@import\s+["']([^"']+)["']\s*;/g, (_m, a, b) => inline((a ?? b).startsWith("/") ? (a ?? b).slice(1) : dir + (a ?? b)));
  };
  return hrefs.map(inline).join("\n");
}

const CANVAS_CSS = `
html { background: var(--page, #fff); }
body { margin: 0; }
.page { padding-top: 56px; }
[data-cb04-slot] { outline: 2px solid #7c3aed; outline-offset: 3px; border-radius: 2px; }
[data-cb04-slot][data-cb04-new] { outline-color: #db2777; }
[contenteditable]:focus { outline: 3px solid #2563eb; }
.cb04-unnamed { display: grid; place-items: center; min-height: 96px; border: 2px dashed #7c3aed; border-radius: 8px; color: #6d28d9; font: 600 14px/1.4 system-ui, sans-serif; background: #f5f3ff; text-align: center; padding: 12px; }
.cb04-picked { box-shadow: 0 0 0 3px #2563eb; }
div.flow:not(:has(> :not(.cb04-x))) { min-height: 80px; border: 2px dashed #94a3b8; border-radius: 8px; }
img { min-width: 160px; min-height: 100px; background: repeating-linear-gradient(45deg, #e2e8f0 0 10px, #f1f5f9 10px 20px); }
#cb04-chips { position: absolute; inset: 0; pointer-events: none; }
.cb04-chip { position: absolute; transform: translateY(-100%); padding: 1px 7px; border-radius: 6px 6px 6px 0; background: #7c3aed; color: #fff; font: 600 11px/1.6 ui-monospace, monospace; white-space: nowrap; }
.cb04-chip.is-new { background: #db2777; }
`;

function openCanvas(tag: string, templateHtml: string, componentCss: string) {
  document.querySelector(".cb04-canvas")?.remove();
  const pane = document.querySelector(".native-preview-pane") ?? document.querySelector(".native-preview-frame")?.parentElement;
  const box = pane?.getBoundingClientRect();
  if (!box) { toast("Open a page first."); return; }
  const shell = el("div", "cb04-canvas");
  Object.assign(shell.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  const banner = el("div", "cb04-canvas__banner");
  const place = el("label", "cb04-canvas__place");
  const placeBox = el("input");
  placeBox.type = "checkbox";
  placeBox.checked = true;
  place.append(placeBox, " Place on this page");
  const say = el("span", "cb04-canvas__say");
  say.append("Editing template ", el("code", "", `<${tag}>`), " — changes apply to every page");
  banner.append(el("span", "cb04-canvas__badge", "Template"), say, place, btn("Cancel", () => shell.remove(), "button secondary"), btn("Done", () => void done(), "button primary"));
  const palette = el("div", "cb04-canvas__palette");
  palette.append(el("span", "cb04-canvas__palette-label", "Add"));
  for (const block of BLOCKS) palette.append(btn(block.label, () => add(block), "cb04-canvas__block"));
  palette.append(el("p", "cb04-canvas__palette-hint", "New text, images and buttons become slots (pink). Click text to edit it. Click a Div to add into it."));
  const iframe = el("iframe", "cb04-canvas__frame");
  iframe.title = `Template of <${tag}>`;
  shell.append(banner, palette, iframe);
  document.body.append(shell);

  // Render the template with each named slot's fallback in place, marked.
  const tpl = document.createElement("template");
  tpl.innerHTML = templateHtml;
  for (const slot of [...tpl.content.querySelectorAll("slot")]) {
    const name = slot.getAttribute("name");
    if (!name) {
      const hole = document.createElement("div");
      hole.className = "cb04-unnamed";
      hole.dataset.cb04Unnamed = "";
      hole.textContent = "Unnamed slot: each page puts its repeated items here (cards); Add card works on them";
      slot.replaceWith(hole);
      continue;
    }
    const fallback = slot.firstElementChild;
    if (fallback) { fallback.setAttribute("data-cb04-slot", name); slot.replaceWith(fallback); }
    else { const hole = document.createElement("p"); hole.dataset.cb04Slot = name; hole.textContent = `(empty ${name})`; slot.replaceWith(hole); }
  }
  const holder = document.createElement("div");
  holder.append(tpl.content.cloneNode(true));
  const ownCss = componentCss.replace(/:host\s*\{[^}]*\}/g, "");
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${siteCss()}</style><style>${ownCss}</style><style>${CANVAS_CSS}</style></head><body><main class="page">${holder.innerHTML}</main><div id="cb04-chips"></div></body></html>`;
  let doc: Document | undefined;
  let picked: Element | undefined;
  const textTags = "h1,h2,h3,h4,h5,h6,p,li,blockquote,a,figcaption";
  const root = () => doc?.querySelector("main.page")?.firstElementChild ?? undefined;
  function chips() {
    if (!doc) return;
    const layer = doc.getElementById("cb04-chips")!;
    layer.replaceChildren();
    for (const node of doc.querySelectorAll<HTMLElement>("[data-cb04-slot]")) {
      const r = node.getBoundingClientRect();
      const chip = doc.createElement("span");
      chip.className = `cb04-chip${node.hasAttribute("data-cb04-new") ? " is-new" : ""}`;
      chip.textContent = `${node.dataset.cb04Slot}${node.hasAttribute("data-cb04-new") ? " · new slot" : ""}`;
      chip.style.left = `${r.left + doc.defaultView!.scrollX - 3}px`;
      chip.style.top = `${r.top + doc.defaultView!.scrollY - 4}px`;
      layer.append(chip);
    }
  }
  iframe.addEventListener("load", () => {
    doc = iframe.contentDocument ?? undefined;
    if (!doc) return;
    for (const node of doc.querySelectorAll<HTMLElement>(textTags)) node.contentEditable = "true";
    doc.addEventListener("input", chips);
    doc.addEventListener("click", (event) => {
      const hit = (event.target as Element).closest?.("div.flow");
      picked?.classList.remove("cb04-picked");
      picked = hit && hit !== root() ? hit : undefined;
      picked?.classList.add("cb04-picked");
      if ((event.target as Element).closest?.("a")) event.preventDefault();
    });
    doc.defaultView?.addEventListener("resize", chips);
    setTimeout(chips, 50);
    setTimeout(chips, 400);
  });
  // A new block: text-like blocks become slots named by ticket 03's rule.
  function add(block: (typeof BLOCKS)[number]) {
    const into = picked ?? root();
    if (!doc || !into) return;
    const holder = doc.createElement("div");
    holder.innerHTML = block.markup(picked ? 3 : 2);
    const made = holder.firstElementChild as HTMLElement;
    const base = block.key === "heading" ? "title" : block.key === "text" ? "text" : block.key === "image" ? "image" : block.key === "button" ? "link" : "";
    if (base) {
      const taken = new Set([...doc.querySelectorAll<HTMLElement>("[data-cb04-slot]")].map((node) => node.dataset.cb04Slot));
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
      made.dataset.cb04Slot = name;
      made.dataset.cb04New = "";
    }
    if (made.matches(textTags)) made.contentEditable = "true";
    const before = into === root() ? into.querySelector(":scope > [data-cb04-unnamed]") : null;
    const indent = into === root() ? "\n  " : "\n    ";
    into.insertBefore(doc.createTextNode(indent), before);
    into.insertBefore(made, before);
    if (!before) into.append(doc.createTextNode(into === root() ? "\n" : "\n  "));
    made.scrollIntoView({ block: "nearest" });
    chips();
  }
  function serialize() {
    const top = root();
    if (!top) return templateHtml;
    const copy = top.cloneNode(true) as Element;
    copy.classList.remove("cb04-picked");
    for (const node of copy.querySelectorAll(".cb04-picked")) node.classList.remove("cb04-picked");
    for (const node of copy.querySelectorAll("[contenteditable]")) node.removeAttribute("contenteditable");
    for (const node of copy.querySelectorAll("[data-cb04-unnamed]")) node.replaceWith(copy.ownerDocument.createElement("slot"));
    for (const node of [...copy.querySelectorAll<HTMLElement>("[data-cb04-slot]")]) {
      const slot = copy.ownerDocument.createElement("slot");
      slot.setAttribute("name", node.dataset.cb04Slot!);
      node.removeAttribute("data-cb04-slot");
      node.removeAttribute("data-cb04-new");
      node.replaceWith(slot);
      slot.append(node);
    }
    for (const node of [copy, ...copy.querySelectorAll("*")]) {
      if (node.getAttribute("class") === "") node.removeAttribute("class");
      if (node.getAttribute("style") === "") node.removeAttribute("style");
    }
    return `${copy.outerHTML.replace(/<slot name="([^"]+)"><p>\(empty [^)]*\)<\/p><\/slot>/g, '<slot name="$1"></slot>')}\n`;
  }
  async function done() {
    const html = serialize();
    shell.remove();
    if (placeBox.checked) {
      const placed = await makeAndPlace(tag, html, componentCss, instanceFromTemplate(html, tag));
      if (!placed) return;
      await waitForComponent(tag);
      toast(`Made <${tag}> and placed it on this page`, { label: "Open template", run: () => void state.host?.editComponent(tag) });
      return;
    }
    const result = await deps().createFiles([
      { path: `components/${tag}/${tag}.html`, content: html },
      { path: `components/${tag}/${tag}.css`, content: componentCss },
    ]);
    if ("error" in result) { toast(result.error); return; }
    toast(`Made <${tag}>; it is in the Add panel`);
  }
}
