// PROTOTYPE (wayfinder ticket 12, components-and-builder). Throwaway; not kept for the real build.
//
// Loaded only with ?proto=blocks. Mounts the variant switcher and the
// readout, adds the six blocks to the Add panel as draggable tiles, makes the
// edit bar's grip and every Structure row a drag handle, routes the keyboard
// alternatives, and puts labelled test drafts on the home page.

import type { Cb12Host, Cb12Variant } from "./cb12";
import type { NativePreviewSelection } from "../components/native-preview";
import { BLOCKS, btn, deps, draggedFor, el, frameEvents, isTyping, measure, pagePath, readout, state, variant, type BlockKind, type Dragged } from "./cb12-core";
import { dragging, pressToDrag, recentlyDragged, setFrameState } from "./cb12-drag";
import { focusRowSoon, inInsertMode, insertAtSelection, insertKey, moveBy, openMoveTo as openMoveToPath, startInsertMode } from "./cb12-keys";
import { rowFor, treeEl } from "./cb12-tree";
import { mountRail } from "./cb12-rail";
import { locateNativeElement, startTagAttribute } from "../native-source-location";
import { setAttributeEdit } from "../native-structure";
import "./cb12.css";

const NAMES: Record<Cb12Variant, string> = { A: "A · Line and label", B: "B · Boxes and gaps", C: "C · Structure-led", D: "D · Icon rail (A + C)" };
// B stays reachable with ?variant=B but is out of the cycle (round 2).
const ORDER: Cb12Variant[] = variant === "B" ? ["D", "A", "C", "B"] : ["D", "A", "C"];
let mounted = false;

export function install(host: Cb12Host) {
  state.host = host;
  if (mounted) return;
  mounted = true;
  document.documentElement.dataset.cb12Variant = variant;
  mountSwitcher();
  readout(NAMES[variant], variant === "D" ? [
    "Click a rail icon to insert at the selection, or drag it onto the page or into Structure.",
    "Keys: Alt+↑/↓ siblings, Alt+←/→ out/in (canvas or a Structure row), edit bar Move to…",
  ] : [
    "Drag a block from Add, a selected block by its grip in the edit bar, or a row in Structure.",
    variant === "A" ? "Keys: select a block, Alt+↑/↓ siblings, Alt+←/→ out/in, edit bar Move to…" :
      variant === "B" ? "Keys: Enter on a tile or Move… on a block: insert mode (arrows, Enter, Esc)" :
        "Keys: in Structure, Alt+↑/↓ move, Alt+←/→ outdent/indent the focused row",
  ]);
  // The frame gets the prototype's CSS now and after each (re)load.
  setFrameState("");
  window.addEventListener("message", (e) => {
    const data = e.data as { source?: string; type?: string } | undefined;
    if (data?.source === "astro-native-preview" && data.type === "ready") setTimeout(() => setFrameState(""), 50);
  });
  if (variant === "D") mountRail();
  else watchAddPanel();
  watchGrips();
  watchTree();
  watchKeys();
  void seedDrafts();
}

// ---- The switcher: ← label →, outside the design. ----
function mountSwitcher() {
  const go = (step: number) => {
    const next = ORDER[(ORDER.indexOf(variant) + step + ORDER.length) % ORDER.length];
    const url = new URL(location.href);
    url.searchParams.set("variant", next);
    history.replaceState(history.state, "", url);
    location.reload();
  };
  const bar = el("div", "cb12-switcher");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Prototype variant");
  const prev = btn("←", () => go(-1), "cb12-switcher__step");
  prev.title = "Previous variant (←)";
  const next = btn("→", () => go(1), "cb12-switcher__step");
  next.title = "Next variant (→)";
  const label = el("span", "cb12-switcher__label");
  label.append(el("span", "cb12-switcher__tag", "PROTOTYPE cb12"), el("strong", "", NAMES[variant]));
  bar.append(prev, label, next);
  document.body.append(bar);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented || dragging() || inInsertMode()) return;
    const active = document.activeElement as HTMLElement | null;
    if (isTyping() || active?.closest("[role='tree'], [role='listbox'], [role='menu'], [role='tablist'], dialog, .edit-bar")) return;
    if (document.querySelector("dialog[open]")) return;
    go(event.key === "ArrowLeft" ? -1 : 1);
  });
}

// ---- The six blocks in the Add panel. ----
let divLayout: "flow" | "cards" = "flow";
const newBlock = (kind: BlockKind): Extract<Dragged, { kind: "new" }> => {
  const name = BLOCKS.find((b) => b.kind === kind)!.name;
  return { kind: "new", block: kind, layout: divLayout, name: kind === "div" ? `Div (${divLayout === "cards" ? "grid" : "stack"})` : name };
};
function blockTiles(panel: HTMLElement) {
  const wrap = el("section", "cb12-blocks");
  wrap.setAttribute("aria-label", "Blocks");
  const head = el("div", "cb12-blocks__head");
  head.append(el("h3", "cb12-blocks__title", "Blocks"), el("span", "cb12-blocks__tag", "prototype cb12"));
  const grid = el("div", "cb12-blocks__grid");
  for (const block of BLOCKS) {
    const tile = btn("", () => {
      if (recentlyDragged()) return;
      void keyboardInsert(block.kind, panel);
    }, "cb12-tile");
    tile.dataset.block = block.kind;
    tile.title = `Drag onto the page or Structure; Enter ${variant === "B" ? "starts insert mode" : "adds it at the selection"}`;
    tile.append(el("span", "cb12-tile__icon", block.icon), el("span", "cb12-tile__name", block.name), el("span", "cb12-tile__hint", block.hint));
    tile.addEventListener("pointerdown", (event) => pressToDrag(event, tile, () => newBlock(block.kind), 5));
    if (block.kind === "div") {
      const layout = el("span", "cb12-tile__layout");
      for (const [value, text] of [["flow", "Stack"], ["cards", "Grid"]] as const) {
        const option = el("span", "cb12-tile__seg", text);
        option.setAttribute("role", "button");
        option.tabIndex = 0;
        option.setAttribute("aria-pressed", String(divLayout === value));
        const pick = (e: Event) => {
          e.stopPropagation(); e.preventDefault();
          divLayout = value;
          for (const seg of layout.children) seg.setAttribute("aria-pressed", String(seg === option));
        };
        option.addEventListener("pointerdown", (e) => e.stopPropagation());
        option.addEventListener("click", pick);
        option.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") pick(e); });
        layout.append(option);
      }
      tile.append(layout);
    }
    grid.append(tile);
  }
  wrap.append(head, grid);
  return wrap;
}
function watchAddPanel() {
  const decorate = () => {
    const panel = document.querySelector<HTMLElement>(".pb-add-panel");
    if (!panel || panel.querySelector(".cb12-blocks")) return;
    panel.querySelector(".pb-add-panel__position")?.before(blockTiles(panel));
  };
  new MutationObserver(decorate).observe(document.body, { childList: true });
  decorate();
}
async function keyboardInsert(kind: BlockKind, panel: HTMLElement) {
  const d = newBlock(kind);
  if (variant === "B") { await startInsertMode(d); return; }
  const result = await insertAtSelection(d);
  if (result?.ok && variant === "C") {
    panel.querySelector<HTMLButtonElement>(".pb-add-panel__close")?.click();
    focusRowSoon(result.select);
  }
}

// ---- The edit bar's grip (and the section grip) drag any block. ----
function selectedPath() {
  const s = deps().selection();
  return s && !s.host && s.node?.length && s.path === pagePath() ? s.node : undefined;
}
function watchGrips() {
  document.addEventListener("pointerdown", (event) => {
    const grip = (event.target as Element | null)?.closest?.<HTMLElement>(".cb12-grip, .edit-bar__grip");
    if (!grip || event.button !== 0) return;
    const path = selectedPath();
    if (!path) return;
    event.stopPropagation();
    event.preventDefault();
    pressToDrag(event, grip, () => {
      const node = latestNode(path);
      return node ?? undefined;
    }, 7);
  }, true);
  document.addEventListener("click", (event) => {
    if ((event.target as Element | null)?.closest?.(".cb12-grip, .edit-bar__grip") && recentlyDragged()) { event.stopPropagation(); event.preventDefault(); }
  }, true);
}
/** A move of the element at `path`, named from the source (the measurement follows at drag start). */
function latestNode(path: number[]): Dragged | undefined {
  const s = deps().selection();
  const tag = s?.tag ?? "div";
  const label = tag === "section" ? "Section" : tag === "div" ? "Div" : /^h[1-6]$/.test(tag) ? "Heading" : tag === "p" ? "Paragraph" : tag === "img" ? "Image" : tag === "a" ? "Button" : tag.includes("-") ? tag : `<${tag}>`;
  return { kind: "move", path: [...path], key: path.join("."), tag, name: label, band: tag === "section" || tag.startsWith("section-") };
}

/** Enter on the grip button: the variant's keyboard way. */
export async function gripPressed(selection: NativePreviewSelection) {
  if (recentlyDragged() || !selection.node) return;
  const model = await measure();
  const node = model?.get(selection.node);
  if (!node) return;
  if (variant === "A" || variant === "D") return openMoveToPath(selection.node);
  if (variant === "B") return startInsertMode(draggedFor(node));
  const row = rowFor(node.key);
  if (row) { row.tabIndex = 0; row.focus(); readout("Structure", [`${draggedFor(node).name}: Alt+↑/↓ move · Alt+←/→ outdent/indent`]); }
}
/** D: the Div's Layout select on its edit bar: flow ↔ cards in its class, one undo step. */
export function setDivLayout(selection: NativePreviewSelection, layout: "flow" | "cards") {
  const path = selection.path;
  const source = deps().sources()[path];
  const editor = deps().editor();
  const tag = source !== undefined && selection.node ? locateNativeElement(source, selection.node) : undefined;
  if (source === undefined || !editor || !tag || tag.name !== "div" || !selection.node) return;
  const tokens = (startTagAttribute(source, tag, "class")?.value ?? "").split(/\s+/).filter(Boolean);
  const at = tokens.findIndex((t) => t === "flow" || t === "cards");
  if (at >= 0) tokens[at] = layout; else tokens.unshift(layout);
  const edit = setAttributeEdit(source, tag, "class", tokens.join(" "));
  deps().preview()?.selectAfterUpdate({ path, node: selection.node });
  editor.replaceActiveRange({ path, start: edit.start, end: edit.end, expected: source.slice(edit.start, edit.end), text: edit.text });
  readout("Div layout", [`${layout === "cards" ? "Grid (cards)" : "Stack (flow)"} · class="${tokens.join(" ")}" · 1 undo step`], "done");
}
export function openMoveTo(selection: NativePreviewSelection) {
  if (selection.node) void openMoveToPath(selection.node);
}

// ---- Structure rows drag (all variants); C's keys. ----
function watchTree() {
  document.addEventListener("pointerdown", (event) => {
    const tree = treeEl();
    const target = event.target as Element | null;
    if (!tree || !target || !tree.contains(target) || event.button !== 0) return;
    if (target.closest(".page-structure__toggle, button, input, textarea, [contenteditable='true'], .row-action-overlay")) return;
    const row = target.closest<HTMLElement>("[role='treeitem'][data-node]");
    const key = row?.dataset.node;
    if (!row || !key) return;
    const path = key.split(".").map(Number);
    event.stopPropagation();
    pressToDrag(event, row, () => {
      const model = measuredNow;
      const node = model?.get(path);
      if (node) return draggedFor(node);
      const tag = (row.querySelector(".page-structure__kind")?.textContent ?? "element").trim();
      return { kind: "move", path, key, tag, name: tag, band: path.length === 2 };
    }, 7);
    void measure().then((m) => { measuredNow = m; });
  }, true);
  document.addEventListener("click", (event) => {
    const tree = treeEl();
    if (event.isTrusted && tree?.contains(event.target as Node) && recentlyDragged()) { event.stopPropagation(); event.preventDefault(); }
  }, true);
}
let measuredNow: Awaited<ReturnType<typeof measure>>;

function watchKeys() {
  const dirOf = (key: string) => (key === "ArrowUp" ? "up" : key === "ArrowDown" ? "down" : key === "ArrowLeft" ? "left" : key === "ArrowRight" ? "right" : undefined);
  const act = async (path: number[] | undefined, dir: "up" | "down" | "left" | "right", fromTree: boolean) => {
    if (!path) return;
    if (variant === "B") {
      const model = await measure();
      const node = model?.get(path);
      if (node) await startInsertMode(draggedFor(node));
      return;
    }
    const result = await moveBy(path, dir);
    if (result?.ok && (fromTree || variant === "C")) focusRowSoon(result.select);
  };
  // Forwarded from the frame: Alt+arrows on the canvas, or every key in insert mode.
  frameEvents.key = (key, alt) => {
    if (inInsertMode()) { insertKey(key); return; }
    const dir = dirOf(key);
    if (alt && dir) void act(selectedPath(), dir, false);
  };
  document.addEventListener("keydown", (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || dragging() || inInsertMode()) return;
    const dir = dirOf(event.key);
    if (!dir) return;
    const tree = treeEl();
    const row = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>("[role='treeitem'][data-node]");
    if (row && tree?.contains(row)) {
      // C's keyboard alternative lives here; A and B keep the tree's own Alt+↑/↓ but gain ←/→.
      event.preventDefault();
      event.stopPropagation();
      void act(row.dataset.node!.split(".").map(Number), dir, true);
      return;
    }
    if (isTyping()) return;
    const path = selectedPath();
    if (!path) return;
    event.preventDefault();
    event.stopPropagation();
    void act(path, dir, false);
  }, true);
}

// ---- Test drafts on the home page. ----
const SERVICES_HTML = `<section class="services">
  <slot name="title"><h2>Services</h2></slot>
  <div class="services__items">
    <slot name="services"></slot>
  </div>
</section>
`;
const SERVICES_CSS = `/* PROTOTYPE cb12 draft: a section with a title slot and a named items slot. */
:host {
  display: block;
}

section {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
  padding: var(--space-xl);
  border-radius: var(--radius-l);
  background: var(--surface);
}

h2 {
  margin: 0;
  font-size: var(--text-2xl);
}

.services__items {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-m);
}

::slotted(.service) {
  padding: var(--space-l);
  border-radius: var(--radius-m);
  background: var(--page);
  border: 1px solid var(--line);
}
`;
const TEST_MARKUP = `<section class="flow" id="cb12-tests">
  <h2>Drag and drop test area</h2>
  <p>Drafts added by prototype cb12: an empty Section, an empty Div, a deep tree, and a component whose items sit in a named slot. Discard changes to take them away.</p>
</section>
<section class="flow"></section>
<section class="flow">
  <h2>An empty Div below</h2>
  <div class="flow"></div>
</section>
<section class="flow">
  <h2>A deep tree</h2>
  <div class="cards">
    <div class="flow">
      <h3>Plan</h3>
      <p>We agree what the site must do and who it is for.</p>
      <a class="btn" href="/about/">How we plan</a>
    </div>
    <div class="flow">
      <h3>Build</h3>
      <p>Plain HTML and CSS, written so you can read it.</p>
      <a class="btn" href="/#work">See the work</a>
    </div>
    <div class="flow">
      <h3>Hand over</h3>
      <p>You edit it yourself, in the browser, whenever you like.</p>
      <a class="btn" href="/about/#contact">Ask us</a>
    </div>
  </div>
</section>
<section-services>
  <h2 slot="title">Services (draft component)</h2>
  <div class="service flow" slot="services">
    <h3>Websites</h3>
    <p>Small sites in plain HTML and CSS.</p>
  </div>
  <div class="service flow" slot="services">
    <h3>Identity</h3>
    <p>A name, a mark and a palette that fit.</p>
  </div>
  <div class="service flow" slot="services">
    <h3>Care</h3>
    <p>Small changes, kept in good order.</p>
  </div>
</section-services>`;

async function seedDrafts() {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let path: string | undefined;
  for (let i = 0; i < 80; i++) {
    path = pagePath();
    const editor = deps().editor();
    if (path === "index.html" && deps().sources()[path] !== undefined && editor?.isMounted(path)) break;
    await wait(250);
  }
  const editor = deps().editor();
  const source = path ? deps().sources()[path] : undefined;
  if (!path || path !== "index.html" || !editor || source === undefined || source.includes('id="cb12-tests"')) return;
  const at = source.indexOf("<section-contact");
  if (at < 0) return;
  const indent = source.slice(source.lastIndexOf("\n", at - 1) + 1, at);
  const files = deps().sources()["components/section-services/section-services.html"] === undefined
    ? [{ path: "components/section-services/section-services.html", content: SERVICES_HTML }, { path: "components/section-services/section-services.css", content: SERVICES_CSS }]
    : [];
  const result = files.length ? await deps().createFiles(files) : undefined;
  if (result && "error" in result) { readout("test drafts", [`Could not add the draft component: ${result.error}`], "refused"); return; }
  const now = deps().sources()[path];
  if (now !== source) { result?.receipt.undo(); return; }
  const text = `${TEST_MARKUP.replace(/\n/g, `\n${indent}`)}\n${indent}`;
  editor.replaceActiveRange({ path, start: at, end: at, expected: "", text }, false, result ? { undo: () => result.receipt.undo(), redo: () => void result.receipt.redo() } : undefined);
  readout(NAMES[variant], ["Added the test drafts to the home page (one undo step): empty Section, empty Div, deep tree, Services with a named items slot."]);
}
