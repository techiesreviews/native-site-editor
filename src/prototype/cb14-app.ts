// PROTOTYPE (wayfinder ticket 14, components-and-builder). Throwaway; not kept for the real build.
//
// Loaded only with ?proto=template. Edit component mode, visually, three ways:
//   A "In place on the page"  the instance turns into its template where it
//                             is (fallbacks in its slots, the page shaded),
//                             a slim bar, a placeholders / page content toggle
//   B "Isolated canvas"       only the component on a neutral stage (width
//                             presets), "Used on" with live thumbnails, slots
//                             filled from a chosen page's instance on request
//   C "Split"                 the page live on the left, the template canvas
//                             on the right; a part picked in either is marked
//                             in the other
// Every entry (the edit bar, a Structure row, Used on, after Create and
// "+ New component") comes through requestEdit (cb14.ts intercepts the
// editor's Edit component). Drafts are put on the home page at load.

import type { Cb14Host, Cb14Variant } from "./cb14";
import {
  VARIANT_NAMES, btn, deps, describePart, el, frameEvents, frameSelect, isComponentTag, isTyping, lastEdit, latest, measure, mode, normaliseName,
  readout, site, state, tagNow, noticeChange, templateNodeOfSelection, templatePath, usageOf, variant, wait, framePost, type Model, type TNode,
} from "./cb14-core";
import { clearLayer, drawLayer, hooks as layerHooks, setFrameState, setHover, endRename, renaming } from "./cb14-layer";
import { drawTree, removeTree, treeHooks, treePanel } from "./cb14-tree";
import { buildHooks, dragging, mountRail } from "./cb14-build";
import { miniView, refreshViews, type MiniView } from "./cb14-mini";
import { decorateLabel, lock, watchLabel } from "./cb14-label";
import { createdSlots } from "./cb14-layer";
import { locateNativeElementRange } from "../native-source-location";
import { fillInsertEdit, fillMarkup, readInstance, slotStates, templateSlots } from "../page-builder/component-model";
import { elementPathAt } from "../native-source-location";
import { descendants, parseSource } from "../page-builder/component-model";
import { nativePageBody } from "../../shared/native-project";
import "./cb14.css";

const ORDER: Cb14Variant[] = ["A", "B", "C"];
let mounted = false;

export function install(host: Cb14Host) {
  state.host = host;
  if (mounted) return;
  mounted = true;
  document.documentElement.dataset.cb14Variant = variant;
  mountSwitcher();
  mountRail();
  watchLabel();
  frameEvents.fixed = (c) => {
    lock.click = c.tag ? { ...c, page: deps().previewPage() ?? deps().currentPath() ?? "", at: Date.now() } : undefined;
    for (const ms of [60, 250, 600]) setTimeout(decorateLabel, ms);
  };
  lock.edit = (tag, part) => void requestEdit(tag, part);
  idleReadout();
  frameEvents.dump = (model) => redraw(model);
  frameEvents.hover = (p, slot) => setHover(p, slot);
  frameEvents.key = (key) => { if (key === "Escape" && mode.now && !dragging()) upALevel(); };
  layerHooks.drill = (n) => void drill(n);
  layerHooks.changed = () => void measure();
  treeHooks.drill = (n) => void drill(n);
  treeHooks.crumb = (i) => void goTo(i);
  buildHooks.afterInsert = (t) => {
    // A, showing the page's content: a block put into a slot's fallback would not show, so placeholders come on.
    const inSlot = t.box.node && (t.box.node.slot || t.box.node.inSlot);
    if (variant === "A" && mode.now?.show === "page" && inSlot) { setShow("fallbacks"); readout("Showing placeholders", ["The block went into the slot's fallback, which shows with placeholders."], "done"); }
  };
  window.addEventListener("message", (e) => {
    const data = e.data as { source?: string; type?: string } | undefined;
    if (data?.source === "astro-native-preview" && data.type === "ready") setTimeout(() => setFrameState(Boolean(mode.now)), 60);
  });
  setInterval(tick, 250);
  setInterval(() => { if (mode.now) refreshViews(); }, 450);
  watchAddPanel();
  void seedDrafts().then(resume);
}

// ---- The loop: selection and sources follow. ----
let lastSel: unknown;
let lastSources: unknown;
let lastTemplate: { path: string; text: string } | undefined;
function tick() {
  if (!mode.now) { lastTemplate = undefined; return; }
  const sel = deps().selection();
  const sources = deps().sources();
  const tp = templatePath();
  const text = tp ? sources[tp] : undefined;
  if (tp && text !== undefined) {
    if (lastTemplate?.path === tp && lastTemplate.text !== text) noticeChange(tp, lastTemplate.text, text);
    lastTemplate = { path: tp, text };
  }
  if (sel !== lastSel || sources !== lastSources) {
    lastSel = sel;
    lastSources = sources;
    if (latest.model) redraw(latest.model);
    const n = templateNodeOfSelection();
    for (const view of views) view.highlight(n ? n.p : null);
  }
  // "Used on" can grow once every page's source has arrived: the live views follow.
  if (variant !== "A" && tagNow()) {
    const key = usageOf(tagNow()!).pages.map((p) => p.file).join("|");
    if (key !== usedKey) { usedKey = key; if (!opening) rebuildViews(); }
  }
  // The template stays the file in the code pane while the mode lasts.
  const path = templatePath();
  if (path && deps().currentPath() !== path && !opening) void leaveQuietly();
}
let opening = false;
let usedKey = "";

function redraw(model: Model) {
  if (!mode.now) return;
  drawLayer(model);
  drawTree(model);
  decorateLabel();
  renderBar();
  if (!dragging()) modeReadout(model);
}
function modeReadout(model?: Model) {
  const now = mode.now;
  if (!now) return;
  const n = templateNodeOfSelection(model);
  const usage = usageOf(tagNow()!);
  const show = variant === "A" ? (now.show === "fallbacks" ? "placeholders (the template's fallbacks)" : "this page's own content (fallbacks where it has none)")
    : variant === "B" ? (now.contentFrom ? `content from ${deps().pageLabel(now.contentFrom)}'s instance` : "placeholders (the template's fallbacks)")
      : "placeholders here; the page pane shows its own content";
  readout(`${VARIANT_NAMES[variant]} · editing <${tagNow()}>`, [
    `Template: ${templatePath()}`,
    `Path: ${now.chain.map((s) => `<${s.tag}>`).join(" › ")}`,
    `Selection: ${describePart(n)}`,
    `Slots show: ${show}`,
    `Used on: ${usage.instances} instance${usage.instances === 1 ? "" : "s"} on ${usage.pages.length} page${usage.pages.length === 1 ? "" : "s"}${usage.components.length ? ` + ${usage.components.length} component${usage.components.length === 1 ? "" : "s"}` : ""}`,
    `Last edit: ${lastEdit.text ?? "none yet"}`,
  ], lastEdit.text ? "done" : "idle");
}
function idleReadout() {
  readout(VARIANT_NAMES[variant], [
    "Select a component instance and choose Edit component (edit bar, its name, or the Structure row's ✎).",
    "Drafts on Home: <section-work> (made from Recent work) and <section-new> (as + New component makes it).",
    "Add panel: + New component lands in Edit component mode too.",
  ]);
}

// ---- Entering, drilling, leaving. ----
function firstInstance(file: string, tag: string) {
  const html = deps().sources()[file];
  if (html === undefined) return undefined;
  const body = nativePageBody(html);
  const found = [...descendants(parseSource(html, body.start, body.end))].find((e) => e.name === tag);
  return found ? elementPathAt(html, found.start) : undefined;
}
export async function requestEdit(tag: string, part?: number[]) {
  const sel = deps().selection();
  const now = mode.now;
  if (now) {
    const at = now.chain.findIndex((s) => s.tag === tag);
    if (at >= 0) { await goTo(at); return; }
    const model = latest.model;
    let n: TNode | undefined = sel && sel.path === templatePath() && sel.node && sel.tag === tag ? model?.get(sel.node) : undefined;
    n ??= model?.all().find((k) => k.t === tag && !k.slot);
    if (n) { await drill(n); return; }
    await exit(false);
  }
  await enter(tag, deps().selection(), part);
}
async function enter(tag: string, sel = deps().selection(), part?: number[]) {
  const page = deps().previewPage() ?? deps().currentPath();
  if (!page || !isComponentTag(tag)) return;
  let topNode = sel && sel.path === page && sel.tag === tag && !sel.host && sel.node ? [...sel.node] : undefined;
  topNode ??= firstInstance(page, tag);
  if (variant === "A" && !topNode) {
    readout(`<${tag}> is not on this page`, ["A edits an instance in place on the page: open a page that uses it, or try B or C (→)."], "refused");
    return;
  }
  mode.now = { page, topNode, chain: [{ tag }], show: "fallbacks", splitPage: page };
  lastEdit.text = undefined;
  activate();
  await openTemplate(tag, true, part);
  remember();
}
async function openTemplate(tag: string, first = false, part?: number[]) {
  opening = true;
  try {
    setFrameState(true);
    await state.host!.editComponent(tag);
    // editComponent puts the caret in the code; the canvas keeps the keys (← → switch variants).
    (document.activeElement as HTMLElement | null)?.blur?.();
    setFrameState(true);
    for (let i = 0; i < 20; i++) {
      await wait(100);
      const m = await measure();
      if (m?.ok && m.tag === tag) {
        // B, C: a click inside the stage first, so the runtime's selection lives in the stage's instance.
        const leaf = variant !== "A" ? m.all().find((n) => n.p.length > 1 && !n.slot && !n.hid && n.r[3] > 0) : undefined;
        if (leaf) { await frameSelect(leaf.p); await wait(120); }
        await frameSelect([0]);
        // Entered from a locked part on the page: that part is selected.
        if (part && m.get(part)) { await wait(150); await frameSelect(part); }
        framePost("reveal", { p: null, block: "center" });
        setTimeout(() => framePost("reveal", { p: null, block: "center" }), 700);
        // The code pane folds a template's top element on opening: the caret inside unfolds it.
        await wait(250);
        const src = deps().sources()[templatePath()!] ?? "";
        const line2 = src.indexOf("\n") + 1;
        if (line2 > 0) deps().editor()?.revealRange(templatePath()!, line2, line2);
        (document.activeElement as HTMLElement | null)?.blur?.();
        break;
      }
    }
  } finally { opening = false; }
  if (first) readout(`${VARIANT_NAMES[variant]} · editing <${tag}>`, [`Template open: ${templatePath()}`]);
  renderBar();
  rebuildViews();
  void measure();
}
async function drill(n: TNode) {
  const now = mode.now;
  if (!now || !n.t.includes("-")) return;
  endRename(false);
  now.chain.push({ tag: n.t, path: [...n.p] });
  await openTemplate(n.t);
  remember();
  // A, with this page's content: when the page shows no such instance there, the fallback one is opened.
  const m = await measure();
  if (variant === "A" && now.show === "page" && m?.host && m.host[2] * m.host[3] === 0) {
    setShow("fallbacks");
    readout("Showing placeholders", [`This page shows no <${n.t}> in that slot, so the slot's fallback <${n.t}> is opened.`], "done");
  }
}
async function goTo(index: number) {
  const now = mode.now;
  if (!now || index >= now.chain.length - 1) return;
  now.chain = now.chain.slice(0, index + 1);
  await openTemplate(now.chain.at(-1)!.tag);
  remember();
}
function upALevel() {
  const s = deps().selection();
  if (!s?.node || s.path !== templatePath() || s.node.length < 2) return;
  void frameSelect(s.node.slice(0, -1));
}
async function exit(back = true) {
  const now = mode.now;
  if (!now) return;
  endRename(false);
  mode.now = undefined;
  sessionStorage.removeItem("cb14-resume");
  setFrameState(false);
  deactivate();
  if (!back) return;
  const done = document.querySelector<HTMLButtonElement>(".canvas-component__done");
  if (done) done.click(); else await deps().openFile(now.page);
  for (let i = 0; i < 20 && deps().currentPath() !== now.page; i++) await wait(100);
  if (now.topNode) deps().preview()?.selectNode({ path: now.page, node: now.topNode });
  idleReadout();
  if (now.topNode && createdSlots.some((c) => c.tag === now.chain[0].tag)) {
    for (let i = 0; i < 30 && !deps().editor()?.isMounted(now.page); i++) await wait(100);
    await wait(300);
    try { fillNewSlots(now.page, now.topNode, now.chain[0].tag); } catch (error) { deps().error(error); }
  }
}
/**
 * Back on the page after Done: slots made in the template this session get this page's own copy
 * of their fallback (as a new instance starts with every fallback copied in, ticket 03 rule 7), so
 * they show on the page and are edited there. The real build does this on every page that uses the
 * component in the same undo step as the template change; the prototype can only write this page.
 */
function fillNewSlots(page: string, node: number[], tag: string) {
  const names = [...new Set(createdSlots.filter((s) => s.tag === tag).map((s) => s.name))];
  for (let i = createdSlots.length - 1; i >= 0; i--) if (createdSlots[i].tag === tag) createdSlots.splice(i, 1);
  const filled: string[] = [];
  for (const name of names) {
    const source = deps().sources()[page];
    const template = deps().sources()[site()?.components[tag] ?? ""];
    const editor = deps().editor();
    if (source === undefined || template === undefined || !editor || deps().currentPath() !== page) break;
    const range = locateNativeElementRange(source, node);
    if (!range?.close || range.tag.name !== tag) break;
    const instance = readInstance(source, range);
    const slots = templateSlots(template);
    const slot = slots.find((s) => s.name === name);
    if (!slot || slotStates(template, instance).get(name)?.filled) continue;
    const edit = fillInsertEdit(source, instance, slots, name, fillMarkup(template, slot));
    if (!edit) continue;
    editor.replaceActiveRange({ path: page, start: edit.start, end: edit.end, expected: source.slice(edit.start, edit.end), text: edit.text });
    filled.push(name);
  }
  if (filled.length) readout(`Back on the page`, [`This page now fills the new slot${filled.length > 1 ? "s" : ""} ${filled.map((n) => `“${n}”`).join(", ")} with ${filled.length > 1 ? "their" : "its"} fallback, so ${filled.length > 1 ? "they show" : "it shows"} and can be edited here (one undo step each).`, "The real build fills every page using the component, in the same undo step as the template change."], "done");
}

/** The code pane moved to another file (Files, ⌘P): the mode ends without moving it back. */
async function leaveQuietly() {
  if (!mode.now) return;

  mode.now = undefined;
  setFrameState(false);
  deactivate();
  idleReadout();
}
function remember() {
  const now = mode.now;
  if (now) sessionStorage.setItem("cb14-resume", JSON.stringify({ chain: now.chain, topNode: now.topNode, page: now.page }));
}
/** After a variant switch (a reload), the same component opens again. */
async function resume() {
  const saved = sessionStorage.getItem("cb14-resume");
  if (!saved) return;
  const { chain, topNode, page } = JSON.parse(saved) as { chain: { tag: string; path?: number[] }[]; topNode?: number[]; page: string };
  for (let i = 0; i < 40 && !(deps().previewPage() === page && isComponentTag(chain[0].tag)); i++) await wait(200);
  if (topNode) deps().preview()?.selectNode({ path: page, node: topNode });
  await wait(400);
  await enter(chain[0].tag, topNode ? { path: page, node: topNode, tag: chain[0].tag } as never : undefined);
  for (const step of chain.slice(1)) {
    const n = latest.model?.get(step.path ?? []);
    if (n) await drill(n);
  }
}

// ---- Turning the mode's dressing on and off. ----
function activate() {
  const html = document.documentElement;
  html.classList.add("cb14-mode");
  treePanel();
  mountBar();
  if (variant === "B") mountSide();
  if (variant === "C") mountSplit();
}
function deactivate() {
  const html = document.documentElement;
  html.classList.remove("cb14-mode");
  clearLayer();
  removeTree();
  bar?.remove(); bar = undefined;
  usedOnMenu?.remove(); usedOnMenu = undefined;
  side?.remove(); side = undefined;
  split?.remove(); split = undefined;
  for (const view of views) view.destroy();
  views.clear();
}
export function setShow(show: "fallbacks" | "page") {
  if (!mode.now) return;
  mode.now.show = show;
  setFrameState(true);
  renderBar();
  setTimeout(() => { framePost("reveal", { p: null, block: "start" }); void measure(); }, 120);
}

// ---- The slim bar (top of the canvas). ----
let bar: HTMLElement | undefined;
let usedOnMenu: HTMLElement | undefined;
function mountBar() {
  bar?.remove();
  bar = el("div", `cb14-bar cb14-bar--${variant}`);
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Edit component");
  document.body.append(bar);
  renderBar();
}
let barKey = "";
function renderBar() {
  const now = mode.now;
  if (!bar || !now) return;
  const tag = tagNow()!;
  const usage = usageOf(tag);
  const key = JSON.stringify([now.chain, now.show, now.contentFrom, now.width, now.splitPage, usage.pages.map((p) => [p.file, p.count]), usage.components.length]);
  const canvasBar = document.querySelector<HTMLElement>(".canvas-bar")?.getBoundingClientRect();
  if (canvasBar) Object.assign(bar.style, { left: `${canvasBar.left + 8}px`, top: `${canvasBar.top + 4}px`, maxWidth: `${canvasBar.width - 190}px` });
  if (key === barKey && bar.childElementCount) return;
  barKey = key;
  bar.replaceChildren();
  const title = el("span", "cb14-bar__title");
  title.append(el("span", "cb14-bar__verb", "Editing"));
  now.chain.forEach((step, i) => {
    if (i) title.append(el("span", "cb14-bar__sep", "›"));
    const last = i === now.chain.length - 1;
    const crumb = btn(`<${step.tag}>`, () => void goTo(i), `cb14-bar__crumb${last ? " is-current" : ""}`);
    crumb.disabled = last;
    title.append(crumb);
  });
  bar.append(title);
  const pages = `${usage.pages.length} page${usage.pages.length === 1 ? "" : "s"}`;
  const used = btn(`used on ${pages}${usage.components.length ? ` · ${usage.components.length} component${usage.components.length === 1 ? "" : "s"}` : ""} ▾`, (e) => toggleUsedOn(e.currentTarget as HTMLElement), "cb14-bar__used");
  used.title = "Where this component is used: one edit here changes every instance";
  if (variant === "A") {
    bar.append(el("span", "cb14-bar__dot", "·"), used, el("span", "cb14-bar__dot", "·"));
    const seg = el("span", "cb14-seg");
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "Slot content");
    for (const [value, text] of [["page", "Show this page's content"], ["fallbacks", "Show placeholders"]] as const) {
      const b = btn(text, () => setShow(value), "cb14-seg__item");
      b.setAttribute("aria-pressed", String(now.show === value));
      seg.append(b);
    }
    bar.append(seg);
  }
  if (variant === "B") {
    // "Used on" is the list beside the stage.
    const widths = el("span", "cb14-seg");
    for (const [value, text] of [[375, "375"], [768, "768"], [1160, "1160"], [0, "Full"]] as const) {
      const b = btn(text, () => { now.width = value || undefined; setFrameState(true); renderBar(); setTimeout(() => void measure(), 220); }, "cb14-seg__item");
      b.setAttribute("aria-pressed", String((now.width ?? 0) === value));
      b.title = value ? `Stage ${value} px wide` : "Stage as wide as the canvas";
      widths.append(b);
    }
    bar.append(widths);
    const pick = el("label", "cb14-bar__pick");
    pick.append(el("span", "", "Preview with content from"));
    const select = el("select", "cb14-select");
    select.append(new Option("Placeholders", ""));
    for (const p of usageOf(tag).pages) select.append(new Option(`${deps().pageLabel(p.file)} (${p.route})`, p.file));
    select.value = now.contentFrom ?? "";
    select.addEventListener("change", () => setContentFrom(select.value || undefined));
    pick.append(select);
    bar.append(pick);
  }
  if (variant === "C") {
    bar.append(el("span", "cb14-bar__dot", "·"), used);
  }
  bar.append(btn("Done", () => void exit(true), "cb14-bar__done"));
}
function setContentFrom(file: string | undefined) {
  if (!mode.now) return;
  mode.now.contentFrom = file;
  setFrameState(true);
  renderBar();
  rebuildViews();
  setTimeout(() => void measure(), 120);
}
function toggleUsedOn(anchor: HTMLElement) {
  if (usedOnMenu) { usedOnMenu.remove(); usedOnMenu = undefined; return; }
  const tag = tagNow()!;
  const usage = usageOf(tag);
  const menu = el("div", "cb14-menu cb14-usedon");
  menu.append(el("div", "cb14-menu__title", `<${tag}> is used on`));
  for (const p of usage.pages) {
    const row = el("div", "cb14-usedon__row");
    row.append(el("span", "cb14-usedon__name", deps().pageLabel(p.file)), el("span", "cb14-usedon__meta", `${p.route} · ${p.count}×${p.file === mode.now?.page ? " · this page" : ""}`));
    menu.append(row);
  }
  for (const c of usage.components) {
    const row = el("div", "cb14-usedon__row");
    row.append(el("span", "cb14-usedon__name", `◇ <${c.tag}>`), el("span", "cb14-usedon__meta", `template · ${c.count}×`));
    menu.append(row);
  }
  menu.append(el("p", "cb14-usedon__note", `One edit of ${templatePath()} changes all ${usage.instances} instance${usage.instances === 1 ? "" : "s"} at once (one undo step).`));
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  Object.assign(menu.style, { left: `${r.left}px`, top: `${r.bottom + 6}px` });
  usedOnMenu = menu;
  setTimeout(() => document.addEventListener("pointerdown", (e) => { if (!menu.contains(e.target as Node) && e.target !== anchor) { menu.remove(); if (usedOnMenu === menu) usedOnMenu = undefined; } }, { once: true }), 0);
}

// ---- B: the "Used on" list with live thumbnails. ----
let side: HTMLElement | undefined;
const views = new Set<MiniView>();
function mountSide() {
  side?.remove();
  side = el("aside", "cb14-side");
  side.setAttribute("aria-label", "Used on");
  document.querySelector<HTMLElement>(".preview-frame-host")?.append(side);
}
function mountSplit() {
  split?.remove();
  split = el("section", "cb14-split");
  split.setAttribute("aria-label", "This page, live");
  document.querySelector<HTMLElement>(".preview-frame-host")?.append(split);
}
let split: HTMLElement | undefined;
function rebuildViews() {
  for (const view of views) view.destroy();
  views.clear();
  const now = mode.now;
  if (!now) return;
  const tag = tagNow()!;
  usedKey = usageOf(tag).pages.map((p) => p.file).join("|");
  if (variant === "B" && side) {
    side.replaceChildren();
    const usage = usageOf(tag);
    const head = el("div", "cb14-side__head");
    head.append(el("strong", "", "Used on"), el("span", "", `${usage.instances} instance${usage.instances === 1 ? "" : "s"} · ${usage.pages.length} page${usage.pages.length === 1 ? "" : "s"}`));
    side.append(head, el("p", "cb14-side__note", "Live: each thumbnail redraws as you edit. Click one to fill the slots with its content."));
    for (const p of usage.pages) {
      const card = el("div", `cb14-thumb${now.contentFrom === p.file ? " is-current" : ""}`);
      const view = miniView(p.file, () => tagNow()!, { width: 1160, height: 760, scale: 0.19, onOpen: () => setContentFrom(now.contentFrom === p.file ? undefined : p.file) });
      views.add(view);
      const meta = el("div", "cb14-thumb__meta");
      meta.append(el("span", "cb14-thumb__name", deps().pageLabel(p.file)), el("span", "cb14-thumb__route", `${p.route} · ${p.count}×`));
      card.append(view.wrap, meta);
      side.append(card);
    }
    for (const c of usage.components) side.append(el("div", "cb14-side__comp", `◇ in <${c.tag}>'s template · ${c.count}×`));
  }
  if (variant === "C" && split) {
    split.replaceChildren();
    const usage = usageOf(tag);
    const head = el("div", "cb14-split__head");
    const pick = el("select", "cb14-select");
    const pages = usage.pages.length ? usage.pages : [{ file: now.page, route: "", count: 0 }];
    if (!pages.some((p) => p.file === now.splitPage)) now.splitPage = pages[0].file;
    for (const p of pages) pick.append(new Option(`${deps().pageLabel(p.file)}${p.count ? ` · ${p.count}×` : ""}`, p.file));
    pick.value = now.splitPage ?? now.page;
    pick.addEventListener("change", () => { now.splitPage = pick.value; rebuildViews(); });
    head.append(el("span", "cb14-split__label", "Page"), pick, el("span", "cb14-split__live", "live · every instance follows the template"));
    split.append(head);
    const width = split.clientWidth || 560;
    const host = split.getBoundingClientRect();
    const scale = Math.min(width / 1160, 1);
    const view = miniView(now.splitPage ?? now.page, () => tagNow()!, {
      width: 1160, height: Math.max(400, Math.round((host.height - 40) / scale)), scale, interactive: true, offset: 60,
      onPick: (path, page) => {
        if (!path) { readout("Not part of the template", ["Click a part of an outlined instance to find it in the template canvas."]); return; }
        void frameSelect(path);
        if (page) readout("This page's content", ["What the page puts in a slot: its slot is selected in the template."]);
      },
    });
    views.add(view);
    split.append(view.wrap);
  }
}

// ---- The variant switcher: ← label →. ----
function mountSwitcher() {
  const go = (step: number) => {
    const next = ORDER[(ORDER.indexOf(variant) + step + ORDER.length) % ORDER.length];
    const url = new URL(location.href);
    url.searchParams.set("variant", next);
    history.replaceState(history.state, "", url);
    location.reload();
  };
  const sw = el("div", "cb14-switcher");
  sw.setAttribute("role", "toolbar");
  sw.setAttribute("aria-label", "Prototype variant");
  const prev = btn("←", () => go(-1), "cb14-switcher__step");
  prev.title = "Previous variant (←)";
  const next = btn("→", () => go(1), "cb14-switcher__step");
  next.title = "Next variant (→)";
  const text = el("span", "cb14-switcher__label");
  text.append(el("span", "cb14-switcher__tag", "PROTOTYPE cb14"), el("strong", "", VARIANT_NAMES[variant]));
  sw.append(prev, text, next);
  document.body.append(sw);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented || dragging() || renaming.p) return;
    if (isTyping() || document.querySelector("dialog[open]")) return;
    if ((document.activeElement as HTMLElement | null)?.closest("[role='tree'], [role='listbox'], [role='menu'], .edit-bar, select")) return;
    go(event.key === "ArrowLeft" ? -1 : 1);
  });
}

// ---- "+ New component" in the Add panel: a blank component, placed and opened in Edit component mode. ----
const BLANK = `<section class="flow">
  <slot name="title"><h2>New section</h2></slot>
  <slot name="items"></slot>
</section>
`;
const BLANK_CSS = (tag: string) => `/* PROTOTYPE cb14 draft: <${tag}>, as "+ New component" makes it (ticket 04 rule 12). */
:host {
  display: block;
}

/* Slots are display: contents, so the section spaces its parts with a gap. */
section {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

h2 {
  margin: 0;
}

${SHARED_CSS}`;
function watchAddPanel() {
  const decorate = () => {
    const panel = document.querySelector<HTMLElement>(".pb-add-panel:not([hidden])");
    if (!panel || panel.querySelector(".cb14-new")) return;
    const entry = el("div", "cb14-new");
    const open = btn("", () => entry.replaceChildren(newForm(() => entry.replaceChildren(open))), "cb14-new__open");
    open.append(el("span", "cb14-new__plus", "+"), el("span", "", "New component"), el("span", "cb14-new__tag", "cb14"));
    entry.append(open);
    const anchor = panel.querySelector(".pb-add-panel__body");
    if (anchor) anchor.before(entry); else panel.append(entry);
  };
  new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
}
function newForm(close: () => void) {
  const form = el("form", "cb14-newform");
  const taken = new Set(Object.keys(site()?.components ?? {}));
  let first = "section-new-2";
  for (let n = 3; taken.has(first); n++) first = `section-new-${n}`;
  const input = el("input", "cb14-newform__input");
  input.value = first;
  input.spellcheck = false;
  input.setAttribute("aria-label", "Component name");
  const tagEl = el("code", "cb14-newform__tag", `<${first}>`);
  input.addEventListener("input", () => { input.value = normaliseName(input.value); tagEl.textContent = `<${input.value || "…"}>`; });
  const create = el("button", "cb14-btn cb14-btn--primary", "Create");
  create.type = "submit";
  form.append(input, tagEl, btn("Cancel", close), create);
  form.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") close(); });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const tag = normaliseName(input.value, true);
    if (!tag.includes("-") || taken.has(tag)) { input.focus(); return; }
    close();
    document.querySelector<HTMLButtonElement>(".pb-add-panel:not([hidden]) .pb-add-panel__close")?.click();
    void newComponent(tag);
  });
  setTimeout(() => { input.focus(); input.select(); });
  return form;
}
async function newComponent(tag: string) {
  if (mode.now) await exit(true);
  const page = deps().currentPath();
  const source = page ? deps().sources()[page] : undefined;
  if (!page || source === undefined) return;
  const close = source.lastIndexOf("</main>");
  if (close < 0) return;
  const lineStart = source.lastIndexOf("\n", close - 1) + 1;
  const indent = source.slice(lineStart, close).replace(/\S.*$/, "");
  const ind = `${indent}  `;
  const markup = `\n${ind}<${tag}>\n${ind}  <h2 slot="title">New section</h2>\n${ind}</${tag}>`;
  const at = lineStart > 0 ? lineStart - 1 : close;
  const ok = await writeWithFiles(page, at, at, markup, [
    { path: `components/${tag}/${tag}.html`, content: BLANK },
    { path: `components/${tag}/${tag}.css`, content: BLANK_CSS(tag) },
  ]);
  if (!ok) return;
  for (let i = 0; i < 40 && !isComponentTag(tag); i++) await wait(100);
  const node = firstInstance(page, tag);
  if (node) deps().preview()?.selectNode({ path: page, node });
  await wait(300);
  await enter(tag, node ? { path: page, node, tag } as never : undefined);
  readout(`Made <${tag}> (+ New component)`, ["A section with a title slot and an empty items slot, placed on this page and open in Edit component mode.", "Build it with the rail: click a block, or drag one into the empty items slot."], "done");
}
async function writeWithFiles(page: string, start: number, end: number, text: string, files: { path: string; content: string }[]) {
  const editor = deps().editor();
  const before = deps().sources()[page];
  const todo = files.filter((f) => deps().sources()[f.path] === undefined);
  const result = todo.length ? await deps().createFiles(todo) : undefined;
  if (result && "error" in result) { readout("Not made", [result.error], "refused"); return false; }
  const now = deps().sources()[page];
  if (!editor || now === undefined || now !== before || deps().currentPath() !== page) { result?.receipt.undo(); return false; }
  editor.replaceActiveRange({ path: page, start, end, expected: now.slice(start, end), text }, false, result ? { undo: () => result.receipt.undo(), redo: () => void result.receipt.redo() } : undefined);
  return true;
}

// ---- Drafts on the home page, as labelled test data. ----
const SHARED_CSS = `/* Prototype stand-ins for the block set (ticket 10): the starter has no .btn yet,
   and the placeholder image is a text draft the preview cannot show. */
.btn {
  display: inline-block;
  justify-self: start;
  align-self: start;
  padding: var(--space-xs) var(--space-m);
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  text-decoration: none;
}

img[src$="placeholder.svg"] {
  content: linear-gradient(transparent, transparent);
  display: block;
  max-width: 100%;
  height: auto;
  aspect-ratio: 8 / 5;
  border-radius: var(--radius-m);
  background: radial-gradient(circle at 36% 38%, #c5cbc1 0 5.5%, transparent 6%), linear-gradient(160deg, transparent 62%, #c5cbc1 62.5%), #e3e6e0;
}
`;
const WORK_HTML = `<section class="flow">
  <slot name="title"><h2>Recent work</h2></slot>
  <div class="cards">
    <slot name="items">
      <card-project></card-project>
    </slot>
  </div>
</section>
`;
const WORK_CSS = `/* PROTOTYPE cb14 draft: <section-work>, made from the home page's Recent work
   (ticket 04: a title slot, and an items slot whose fallback is one card-project). */
:host {
  display: block;
}

/* Slots are display: contents, so the section spaces its parts with a gap. */
section {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

h2 {
  margin: 0;
}

${SHARED_CSS}`;
async function seedDrafts() {
  let path: string | undefined;
  for (let i = 0; i < 80; i++) {
    path = deps().currentPath();
    if (path === "index.html" && deps().sources()[path] !== undefined && deps().editor()?.isMounted(path)) break;
    await wait(250);
  }
  const source = path ? deps().sources()[path] : undefined;
  if (path !== "index.html" || source === undefined || source.includes("PROTOTYPE cb14 draft")) return;
  const body = nativePageBody(source);
  const work = [...descendants(parseSource(source, body.start, body.end))].find((e) => e.name === "section" && /\bid="work"/.test(source.slice(e.start, e.tag.end)));
  if (!work?.close) return;
  const lineStart = source.lastIndexOf("\n", work.start - 1) + 1;
  const indent = source.slice(lineStart, work.start);
  const inner = source.slice(work.tag.end, work.close.start);
  const cards = /<div class="cards">([\s\S]*?)\n\s*<\/div>\s*$/.exec(inner)?.[1] ?? "";
  const items = cards.replace(/<card-project>/g, `<card-project slot="items">`).replace(/\n {8}/g, `\n${indent}  `).trim();
  const text = [
    `<!-- PROTOTYPE cb14 draft: <section-work>, made from Recent work (ticket 04: a title slot; an items slot whose fallback is a card-project) -->`,
    `<section-work id="work">`,
    `  <h2 slot="title">Recent work</h2>`,
    `  ${items}`,
    `</section-work>`,
    `<!-- PROTOTYPE cb14 draft: <section-new>, as "+ New component" makes it (a title slot and an empty items slot) -->`,
    `<section-new>`,
    `  <h2 slot="title">New section</h2>`,
    `</section-new>`,
  ].join(`\n${indent}`);
  const ok = await writeWithFiles(path, work.start, work.end, text, [
    { path: "components/section-work/section-work.html", content: WORK_HTML },
    { path: "components/section-work/section-work.css", content: WORK_CSS },
    { path: "components/section-new/section-new.html", content: BLANK },
    { path: "components/section-new/section-new.css", content: BLANK_CSS("section-new") },
  ]);
  if (ok) readout(VARIANT_NAMES[variant], [
    "Added the drafts to Home (one undo step):",
    "<section-work> in place of Recent work: title slot, items slot whose fallback is a <card-project>.",
    "<section-new> after it: a title slot and an empty items slot (+ New component's blank).",
    "Select one and choose Edit component.",
  ], "done");
}

// Keep the frame told when the mode is on (a render can reload it).
setInterval(() => { if (mode.now && !latest.model?.ok) setFrameState(true); }, 1500);
