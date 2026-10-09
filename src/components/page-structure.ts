import { refuse } from "./refusal-note";
import { createRowMenu, type MenuItem } from "./row-menu";
import { setIcon } from "../icons";
import { button, node } from "../ui/dom";
import type { NativeStructure, NativeStructureItem } from "./native-preview";
import { createUrlChange, type UrlPlan } from "./url-change";
import { mark } from "../page-builder/component-icon";
import eyeOpen from "@phosphor-icons/core/regular/eye.svg?raw";
import eyeClosed from "@phosphor-icons/core/regular/eye-closed.svg?raw";
import { rowActions } from "./row-actions";
import { blockIcon } from "./element-icons";
import { handleChunkLoadFailure } from "../chunk-recovery";
import type { FocusRequest, StructureEditing } from "./structure-editing";
import "./page-structure.css";
import type { TemplateStructureItem } from "../page-builder/component-model";
import type { ComponentStructureModel } from "../page-builder/components";
import type { DragPress } from "../page-builder/insert-drag";
import { foldRows, type StructureDropView, type TreeRow } from "../page-builder/tree-drop";

// The page structure sidebar: the rendered page's own elements as a tree,
// fed by the runtime's index paths after each render. A row selects its
// element in the preview (and brings it to the middle of the frame); a
// preview selection marks its row (unfolding the rows above it). Rows with
// children fold; everything inside `<main>` starts folded, so a page opens
// as its list of sections. The folded state is kept per element while the
// same page stays on show. Above the
// tree, a Page block holds the page's title and description from its
// `<head>`; they apply as typed. A row of a block in `<main>` (not a part
// inside a component instance) drags as the page's blocks do (7 px of
// movement starts it, so a plain press still selects); while a block is
// dragged, the tree shows where it lands as an indented line (dropView,
// tree-drop.ts). Folded containers open after a hold or as the target;
// only rows the drag opened fold back when it moves on or ends.

export type PageMetaField = "title" | "description";

/**
 * Edit component mode's rows under the page's instance: the template edited
 * (`path`), or the templates opened down to it, each row of an outer level
 * carrying its own `path` and the opened instance's row its `opened` level.
 */
interface TemplateRows {
  path: string;
  root?: number[];
  /** A nested component is open: the outline goes round its row, not the page instance's. */
  nested?: boolean;
  items: TemplateStructureItem[];
  badge: (at: readonly number[]) => HTMLElement | undefined;
  /** Opens the nested instance at `at` of the template edited ("Open ›"). */
  open?: (at: readonly number[]) => void;
}

export interface PageStructureHandlers {
  templateRows?: (path: string, at: readonly number[]) => TemplateRows | undefined;
  /** `opening` checks a user action; painting the affordance stays silent on stale source. */
  menuItems?: (path: string, item: NativeStructureItem, opening?: boolean) => MenuItem[];
  /** Source-guarded instance fields; synthetic slot rows never identify DOM nodes. */
  /** Include source/template/revision/model changes; enables unchanged-update caching. */
  componentFieldsRevision?: () => string;
  componentSlots?: (path: string, node: readonly number[]) => ComponentStructureModel | undefined;
  /** Open page details; the sidebar retains a compact summary. */
  onPageSettings?: (path: string) => void;
  onNavigation?: (path: string) => void;
  /**
   * The title and description of the page at `path`, empty strings when it
   * has none; nothing when the file is not a page of the site (the fields
   * then stay out of the sidebar). A `notice` closes the fields and says
   * why; with `readOnly` the fields show their values but cannot be
   * changed, and the notice says why. `placeholders` show in an empty
   * field (the page's first heading for the title).
   */
  pageMeta?: (path: string) => {
    title: string;
    description: string;
    notice?: string;
    readOnly?: boolean;
    placeholders?: { title?: string; description?: string };
  } | undefined;
  /** A page field changed: write `value` into the page's head. */
  onPageMeta?: (path: string, field: PageMetaField, value: string) => void;
  /** A page field closed (Enter, Escape or focus loss): its edits are one step. */
  onPageMetaClose?: (path: string, field: PageMetaField) => void;
  /**
   * The URL of the page at `path` and, when it cannot change here, why
   * (`fixed`: the home page).
   */
  pageUrl?: (path: string) => { route: string; fixed?: string } | undefined;
  /** What changing the page's URL to the typed value does. */
  planUrl?: (path: string, value: string) => UrlPlan;
  /** Changes the page's URL (Enter); resolves to an error message, or nothing when done. */
  applyUrl?: (path: string, value: string, keep: boolean) => Promise<string | undefined>;
  /**
   * The kind and distinguishing text a row shows for an element, and
   * whether it is a component instance (its row wears the component mark,
   * and the rows inside it the accent's rail).
   */
  label: (item: NativeStructureItem) => { kind: string; text: string; component?: boolean };
  /** A row was chosen: select this element in the preview. */
  onSelect: (path: string, node: number[]) => void;
  /**
   * Alt+Up/Down on a row: move that element one sibling position. "moved",
   * "stayed" (an edge or refused move) or "pending" (the page file is
   * opening first; the move follows). A moved path restores focus after a
   * depth change. A handled refusal keeps row focus.
   */
  onMove?: (path: string, item: NativeStructureItem, direction: "up" | "down" | "out" | "in") => "moved" | "stayed" | "pending" | number[] | undefined;
  /**
   * A press on the row of a block in `<main>` that may become a drag (the
   * page's block drag, insert-drag.ts `trackDrag`); none when it cannot.
   */
  onRowDrag?: (press: DragPress, item: NativeStructureItem) => { justDragged(): boolean } | undefined;
  /** Which slots of a component are items slots (block-insert.ts `itemsSlotRule`): their rows drag as page blocks do. */
  itemsSlots?: () => (tag: string, slot: string) => boolean;
  /** Status text for the screen reader. */
  announce?: (text: string) => void;
  /**
   * The page's current source bytes. With the painted render's
   * `paintedSource` it proves a structure fresh, so a slot just shown settles
   * its editor only on a paint of the source that holds it.
   */
  pageSource?: (path: string) => string | undefined;
}

const HINT_NO_PAGE = "Open a page of a native project to see its sections and content here.";
const HINT_COMPONENT = "The preview shows a component by itself. Open a page to see its structure.";
// Pointer distance from the tree's top or bottom edge that scrolls it while dragging, and the step per frame.
const EDGE = 28;
const EDGE_STEP = 10;

const key = (node: readonly number[]) => node.join(".");
// Where level 1's drop line starts, from the tree's left edge (page-structure.css `.page-structure__drop`).
const LINE_LEFT = 10;

export function createPageStructure(host: HTMLElement, handlers: PageStructureHandlers) {
  const menu = createRowMenu(host);
  const hint = node("p", "muted sidebar-hint", HINT_NO_PAGE);
  const meta = node("div", "page-structure__meta");
  meta.setAttribute("role", "group");
  meta.setAttribute("aria-label", "Page");
  meta.hidden = true;
  meta.append(node("span", "page-structure__meta-heading", "Page"));
  const summary = node("p", "page-structure__meta-summary");
  const settings = button("Page settings", () => { if (structure?.path) handlers.onPageSettings?.(structure.path); }, "text-button");
  const navigation = button("Navigation", () => { if (structure?.path) handlers.onNavigation?.(structure.path); }, "text-button");
  summary.hidden = settings.hidden = !handlers.onPageSettings;
  navigation.hidden = !handlers.onNavigation;
  meta.append(summary, settings, navigation);
  const fields = {} as Record<PageMetaField, HTMLInputElement>;
  for (const [field, label] of [["title", "Title"], ["description", "Description"]] as const) {
    const wrap = node("label", "page-structure__field");
    const input = node("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = true;
    wrap.append(node("span", "page-structure__field-label", label), input);
    input.addEventListener("input", () => { if (structure?.path) handlers.onPageMeta?.(structure.path, field, input.value); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); input.blur(); }
    });
    input.addEventListener("blur", () => { if (structure?.path) handlers.onPageMetaClose?.(structure.path, field); });
    fields[field] = input;
    wrap.hidden = Boolean(handlers.onPageSettings);
    meta.append(wrap);
  }
  // The URL: applies on Enter only, since it moves files and updates links.
  const url = createUrlChange({
    label: "URL",
    ariaLabel: "URL",
    initial: "",
    plan: (value) => (structure?.path && handlers.planUrl ? handlers.planUrl(structure.path, value) : { ok: false, error: "", unchanged: true }),
    apply: async (value, keep) => (structure?.path && handlers.applyUrl ? handlers.applyUrl(structure.path, value, keep) : undefined),
    cancel: () => handlers.announce?.("Cancelled changing the URL"),
  });
  url.root.classList.add("page-structure__url");
  url.root.hidden = true;
  const urlNote = node("p", "page-structure__url-note");
  urlNote.hidden = true;
  meta.append(url.root, urlNote);
  const metaNotice = node("p", "page-structure__meta-notice");
  metaNotice.setAttribute("role", "status");
  metaNotice.hidden = true;
  meta.append(metaNotice);
  const tree = node("div", "page-structure__tree");
  tree.setAttribute("role", "tree");
  tree.setAttribute("aria-label", "Page structure");
  tree.hidden = true;
  // The line between rows that shows where a dragged block will go.
  const drop = node("div", "page-structure__drop");
  drop.hidden = true;
  host.append(hint, tree);

  // The Page fields for the page on show; a field being typed in keeps its text.
  function renderMeta(path: string) {
    const current = handlers.pageMeta?.(path);
    meta.hidden = !current;
    if (!current) return;
    for (const field of ["title", "description"] as const) {
      if (document.activeElement !== fields[field] || current.notice) fields[field].value = current[field];
      fields[field].readOnly = Boolean(current.readOnly);
      fields[field].disabled = Boolean(current.notice) && !current.readOnly;
      fields[field].placeholder = current.placeholders?.[field] ?? "";
    }
    metaNotice.textContent = current.notice ?? "";
    metaNotice.hidden = !current.notice;
    const address = handlers.pageUrl?.(path);
    summary.textContent = [current.title || current.placeholders?.title || "Untitled page", address?.route].filter(Boolean).join(" · ");
    settings.disabled = Boolean(current.notice || current.readOnly);
    url.root.hidden = !address || Boolean(handlers.onPageSettings);
    if (address) {
      url.reset(address.route);
      url.input.readOnly = Boolean(address.fixed);
      urlNote.textContent = address.fixed ?? "";
      urlNote.hidden = !address.fixed || Boolean(handlers.onPageSettings);
    } else urlNote.hidden = true;
  }

  let structure: NativeStructure | undefined;
  let rendered = "";
  let selected: string | undefined;
  let pendingSelection: { path: string; node: number[] } | undefined;
  // Rows folded or unfolded by hand; any other row inside <main> is folded.
  const foldState = new Map<string, boolean>();
  const inMain = new Set<string>();
  const isFolded = (id: string) => foldState.get(id) ?? inMain.has(id);
  const rows = new Map<string, HTMLElement>();
  const items = new Map<string, NativeStructureItem>();
  // Rows of blocks in <main> that drag (not parts inside an instance).
  const movable = new Set<string>();
  type SlotRowContext = { model: ComponentStructureModel; slot: ComponentStructureModel["slots"][number]; anchor: readonly number[] };
  let openSlot: { host: string; name: string; anchor: string } | undefined;
  let openAttributes: string | undefined;
  const hostKey = (model: ComponentStructureModel) => `${model.host.path}:${key([...model.host.node])}`;
  // Field ids live in separate namespaces so a slot named "attributes" never meets the Attributes panel.
  const slotFieldPrefix = (model: ComponentStructureModel, name: string) => `${hostKey(model)}:slot:${name}:`;
  // A slot with no element of its own (text only, or missing) anchors to a row of its own: no node index.
  const slotRowKey = (model: ComponentStructureModel, name: string) => `~${key([...model.host.node])}:${name}`;
  // "?" waits for a Show to give the slot something to anchor to.
  const PENDING = "?";
  // Per render: whether the painted items are proven current (undefined: no proof
  // either way), and whether a pending Show still waits for a fresh paint.
  let paintFresh: boolean | undefined;
  let keepPending = false;
  // Settle a pending Show on this host's painted children only when they hold the
  // slot's actual assigned nodes (same paths, same slot name) on a paint not proven stale.
  function settlePending(model: ComponentStructureModel, painted: readonly NativeStructureItem[]) {
    if (openSlot?.anchor !== PENDING || openSlot.host !== hostKey(model)) return;
    const slot = model.slots.find(slot => slot.name === openSlot!.name);
    if (!slot) return;
    const matches = slot.assignedNodes.every(node => painted.some(child => key(child.node) === key([...node]) && child.slot === slot.name));
    if (!slot.filled) { if (paintFresh === false) keepPending = true; return; }
    if (paintFresh === false || !matches && paintFresh === undefined) { keepPending = true; return; }
    // A paint proven current that still lacks the assigned paths with this exact
    // slot name (the parser reshaped the markup, or the slot attribute's raw
    // whitespace differs) never will: give up plainly rather than wait forever
    // and take focus on some later render.
    if (!matches) {
      openSlot = undefined;
      focusSlotField = undefined;
      refuse(`The ${slot.name} slot is shown, but its element could not be found in Structure; select it on the page to edit it.`);
      return;
    }
    openSlot.anchor = slot.assignedNodes.length ? key([...slot.assignedNodes[0]]) : slotRowKey(model, slot.name);
    foldState.set(openSlot.anchor, false);
    if (focusSlotField && focusSlotField.row === undefined) focusSlotField.row = openSlot.anchor;
  }
  // Only slots with a field get an editor; content (rich or several roots) is edited on the page.
  const editable = (slot: SlotRowContext["slot"]) => slot.kind === "image" || slot.kind === "link" || slot.kind === "text" && slot.value.editable;
  // Pencil, F2 or badge: open the one inline editor at the slot's first
  // assigned root (else its own slot row), select that real element and
  // focus the editor's first field. Content slots have no fields: the badge
  // only selects their root.
  function requestSlotEdit(context: SlotRowContext | { model: ComponentStructureModel; slot: SlotRowContext["slot"]; anchor?: undefined }, caret?: number) {
    const { model, slot, anchor } = context;
    const target = anchor ?? model.host.node;
    if (!editable(slot)) {
      if (anchor) choose({ node: [...anchor] } as NativeStructureItem);
      return;
    }
    openAttributes = undefined;
    const owner = anchor ? key([...anchor]) : slotRowKey(model, slot.name);
    openSlot = { host: hostKey(model), name: slot.name, anchor: owner };
    foldState.set(key([...model.host.node]), false);
    if (anchor) foldState.set(owner, false);
    selected = key([...target]);
    handlers.onSelect(model.host.path, [...target]);
    focusSlotField = { prefix: slotFieldPrefix(model, slot.name), row: owner, caret };
    editStarted = performance.now();
    if (!editingModule) void loadEditing(true);
    render();
  }
  // The part a slot's row edits in place: its text (a text slot's, a link's
  // label). Everything else (URL, image, alt) is in the card under the row.
  const inPlace = (slot: SlotRowContext["slot"]) => (slot.kind === "text" || slot.kind === "link") && slot.value.editable;
  // When the open editor began: a double-click's second click then selects all.
  let editStarted = 0;
  // The row whose editing just ended, so its first paint eases back.
  let leftEditing: string | undefined;
  const slotRows = new Map<string, HTMLElement>();
  const rowElement = (id: string) => rows.get(id) ?? slotRows.get(id);
  // An element's kind as its icon. A row with text to tell it apart shows the
  // icon alone (the kind stays its tooltip and accessible name); a row without
  // keeps the word beside the icon.
  function kindMark(tag: string, kind: string, iconOnly: boolean) {
    const result = node("span", "page-structure__kind page-structure__kind--icon");
    result.title = kind;
    result.append(blockIcon(tag, kind, false), node("span", iconOnly ? "sr-only" : "", kind));
    return result;
  }
  function iconAction(label: string, icon: Parameters<typeof mark>[0], action: () => void) {
    const result = button("", action, "page-structure__action");
    result.title = label; result.setAttribute("aria-label", label); result.append(mark(icon, 14)); return result;
  }

  // The row to focus once the next render shows a section that just moved.
  let focusAfterRender: string | undefined;

  // The drag a press on a row began (insert-drag.ts): its release is not a click.
  let rowDrag: { justDragged(): boolean } | undefined;

  function pressRow(event: PointerEvent, item: NativeStructureItem, el: HTMLElement) {
    rowDrag = undefined;
    if (event.button !== 0 || !event.isPrimary || !structure?.path || !movable.has(key(item.node))) return;
    if ((event.target as HTMLElement).classList.contains("page-structure__toggle")) return;
    rowDrag = handlers.onRowDrag?.({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, alt: event.altKey, source: el }, item);
  }

  let renderingFields = false;
  // One explicit focus request, consumed by the first render after it.
  let focusSlotField: FocusRequest | undefined;
  // The component row whose Attributes were just opened: focus their first field.
  let focusInline: string | undefined;

  // ---- Editing (structure-editing.ts): loaded the first time it is needed. ----
  // The first press or focus in the tree loads it, so a second click, Enter
  // or F2 finds it there; a request before it arrives draws once it has.
  let editingModule: StructureEditing | undefined;
  let editingLoad: Promise<StructureEditing | undefined> | undefined;
  // After a failed load (said once), it is tried again only on an explicit request (pencil, F2, a second click, Attributes).
  let editingFailed = false;
  function loadEditing(explicit = false) {
    if (editingFailed && !explicit) return Promise.resolve(undefined);
    editingFailed = false;
    editingLoad ??= import("./structure-editing").then(({ createStructureEditing }) => {
      editingModule = createStructureEditing({
        tree,
        componentSlots: (path, node) => handlers.componentSlots?.(path, node),
        announce: (text) => handlers.announce?.(text),
        pageSource: (path) => handlers.pageSource?.(path),
        path: () => structure?.path,
        rowElement,
        rendering: () => renderingFields,
        iconAction,
        isolate,
        ended: editEnded,
        fieldPrefix: slotFieldPrefix,
      });
      return editingModule;
    }).catch((error) => { editingLoad = undefined; editingFailed = true; void handleChunkLoadFailure(error); return undefined; });
    return editingLoad;
  }
  tree.addEventListener("pointerdown", () => void loadEditing(), { once: true });
  tree.addEventListener("focusin", () => void loadEditing(), { once: true });
  // The editing code, or (not loaded yet) nothing, with a redraw once it is.
  // A render that wanted an editor it could not draw yet remembers so (editorWaiting).
  let editorWaiting = false;
  function editingNow() {
    if (!editingModule) { editorWaiting = true; void loadEditing().then(module => { if (module) render(); }); }
    return editingModule;
  }
  // A row edit ended: forget it, redraw, and (asked) give its row focus.
  function editEnded(owner: string, focus: boolean) {
    openSlot = undefined;
    focusSlotField = undefined;
    leftEditing = owner;
    if (focus) rowElement(owner)?.focus();
    render();
    if (focus) rowElement(owner)?.focus();
  }
  function cleanControls() { editingModule?.clean(); }

  function visibilityControl(model: ComponentStructureModel, slot: SlotRowContext["slot"]) {
    if (slot.whenEmpty === "fallback") return slot.filled
      ? iconAction(`Reset ${slot.label} to default`, "reset", () => model.setVisible(slot.name, false))
      : undefined;
    // An eye, as in Figma's layers: open while the slot shows, closed while hidden.
    const toggle = button("", () => {
      const showing = toggle.getAttribute("aria-pressed") === "true", next = !showing;
      const previous = { openSlot, openAttributes, focusSlotField };
      if (next) {
        openAttributes = undefined;
        openSlot = { host: hostKey(model), name: slot.name, anchor: PENDING };
        focusSlotField = { prefix: slotFieldPrefix(model, slot.name), row: undefined };
      }
      paint(next);
      // A refused Show or Hide leaves everything as it was: no armed editor.
      if (!model.setVisible(slot.name, next)) {
        paint(slot.filled);
        ({ openSlot, openAttributes, focusSlotField } = previous);
      }
    }, "page-structure__action page-structure__slot-toggle");
    toggle.setAttribute("aria-label", `Show ${slot.label}`);
    function paint(shown: boolean) {
      toggle.setAttribute("aria-pressed", String(shown));
      toggle.title = shown ? `Hide ${slot.label}` : `Show ${slot.label}`;
      const template = document.createElement("template");
      template.innerHTML = (shown ? eyeOpen : eyeClosed).replace("<svg ", '<svg class="icon" width="14" height="14" aria-hidden="true" focusable="false" ');
      toggle.replaceChildren(template.content.firstElementChild!);
    }
    paint(slot.filled);
    return toggle;
  }
  // Edit precedes visibility/reset in both the row's visual and Tab order.
  function slotActions(model: ComponentStructureModel, slot: SlotRowContext["slot"], edit: () => void) {
    const actions: HTMLElement[] = [];
    if (editable(slot)) actions.push(iconAction(`Edit ${slot.label}`, "edit", edit));
    const visibility = slot.filled ? visibilityControl(model, slot) : undefined;
    if (visibility) actions.push(visibility);
    return actions;
  }
  // Every row's actions share one faded bar at the row's end (rowActions). On
  // a slot row it fades in over the badge, which stays where it is; a row that
  // is both an instance and a slot gets all its actions in that one bar.
  function addRowActions(row: HTMLElement, actions: HTMLElement[]) {
    if (!actions.length) return;
    for (const action of actions) isolate(action);
    rowActions(row, actions);
  }
  // Keep row controls from starting a drag, choosing the row or moving focus by arrow keys.
  function isolate(control: Element) {
    for (const type of ["pointerdown", "click", "keydown"]) control.addEventListener(type, event => event.stopPropagation());
  }

  // A slot with no element of its own: text the page put straight into the
  // instance (an ordinary, editable row), or nothing at all (a dim
  // restoration row). Either way no node index and no Move.
  function slotOnlyRow(model: ComponentStructureModel, slot: ComponentStructureModel["slots"][number], level: number) {
    const id = slotRowKey(model, slot.name);
    const el = node("div", `page-structure__row page-structure__row--slot-only${slot.filled ? "" : " page-structure__row--empty-slot"}`);
    el.setAttribute("role", "treeitem");
    el.setAttribute("aria-level", String(level));
    el.setAttribute("aria-selected", "false");
    el.dataset.slotRow = id;
    el.tabIndex = -1;
    el.style.setProperty("--depth", String(level - 1));
    const kind = slot.kind === "image" ? "img" : slot.kind === "link" ? "a" : "text";
    const label = node("span", "page-structure__label");
    const preview = slot.kind === "image" ? slot.value.alt ?? "" : slot.value.text;
    label.append(node("span", "page-structure__toggle"), kindMark(kind, slot.kind === "image" ? "Image" : slot.kind === "link" ? "Link" : "Text", Boolean(preview)));
    label.firstElementChild!.setAttribute("aria-hidden", "true");
    if (preview) label.append(" ", node("span", "page-structure__text", preview));
    const edit = () => requestSlotEdit({ model, slot });
    const badge = editable(slot) ? button(slot.label, edit, "page-structure__slot-badge") : node("span", "page-structure__slot-badge", slot.label);
    if (badge instanceof HTMLButtonElement) { badge.title = `Edit ${slot.label}`; badge.setAttribute("aria-label", `Edit ${slot.label}`); isolate(badge); }
    el.append(label, badge);
    if (slot.filled) addRowActions(el, slotActions(model, slot, edit));
    else {
      // Missing: an optional slot offers Show, a defaulted slot its pencil, in the same faded bar.
      const show = visibilityControl(model, slot) ?? (editable(slot) ? iconAction(`Edit ${slot.label}`, "edit", edit) : undefined);
      if (show) addRowActions(el, [show]);
    }
    const canEdit = editable(slot) && (slot.filled || slot.whenEmpty === "fallback");
    el.addEventListener("pointerdown", event => notePress(event, el));
    el.addEventListener("click", event => {
      if (inEditor(event.target)) return;
      // A second click on the row (it has focus from the first) edits its text in place.
      if (canEdit && inPlace(slot) && secondClick(event, el, label)) { requestSlotEdit({ model, slot }, event.detail > 1 ? undefined : caretAt(event, label)); return; }
      if (structure?.path) { setSelected(undefined); el.focus(); handlers.onSelect(model.host.path, [...model.host.node]); }
    });
    el.addEventListener("keydown", event => {
      if (event.target !== el) return;
      if ((event.key === "F2" || event.key === "Enter") && canEdit) { event.preventDefault(); event.stopPropagation(); edit(); return; }
      const list = visibleRows(), at = list.indexOf(el);
      const target = event.key === "ArrowDown" ? list[at + 1] : event.key === "ArrowUp" ? list[at - 1] : event.key === "Home" ? list[0] : event.key === "End" ? list[list.length - 1]
        : event.key === "ArrowLeft" ? rows.get(key([...model.host.node])) : undefined;
      if (!target) return;
      event.preventDefault(); event.stopPropagation();
      for (const other of list) other.tabIndex = -1;
      target.tabIndex = 0; target.focus();
    });
    slotRows.set(id, el);
    const result: HTMLElement[] = [el];
    if (openSlot && openSlot.host === hostKey(model) && openSlot.name === slot.name && openSlot.anchor === id
      // A hidden optional slot never edits from its restoration row: that would fill it past Show.
      && (slot.filled || slot.whenEmpty === "fallback")) {
      openSlot.anchor = id;
      if (focusSlotField && focusSlotField.row === undefined) focusSlotField.row = id;
      const editing = editingNow();
      if (editing) {
        editing.editRow(el, label, model, slot, id, inPlace(slot));
        const card = editing.card(model, slot, id, level);
        if (card) result.push(card);
      }
    } else if (leftEditing === id) el.classList.add("was-editing");
    return result;
  }

  const templatePaths = new WeakMap<NativeStructureItem, string>();
  const templateRoots = new WeakMap<NativeStructureItem, { path: string; node: number[] }>();
  let rootAlias: { key: string; id: string } | undefined;
  const templateKey = (path: string, at: number[]) => `@${path}:${key(at)}`;
  const itemKey = (item: NativeStructureItem) => {
    const path = templatePaths.get(item);
    return path ? templateKey(path, item.node) : key(item.node);
  };
  let editingInstance: string | undefined;
  // Rows of an outer level while a nested component is open: shown, not selectable.
  const outerRows = new WeakSet<NativeStructureItem>();
  // The page's instance the mode frames.
  const framedRows = new WeakSet<NativeStructureItem>();
  // Opened rows unfolded once each time they open.
  const unfoldedOpen = new Set<string>();
  let rowNameSeq = 0;
  // This render's items-slot rule; an instance's rows stay sealed except in its items slots.
  let itemsSlot: ((tag: string, slot: string) => boolean) | undefined;
  // `sealed`: inside a component instance, whose parts move with it (its items slots' rows excepted). `template`: Edit component
  // mode's rows of the template shown (never the page's: no drags, drops or moves).
  function row(item: NativeStructureItem, level: number, insideMain = false, slotContext?: SlotRowContext, sealed = false, template?: TemplateRows): HTMLElement[] {
    const own = template && (item as TemplateStructureItem);
    if (template) templatePaths.set(item, own?.path ?? template.path);
    if (own && own.path !== undefined && own.path !== template!.path && !own.opened?.current) outerRows.add(item);
    else outerRows.delete(item);
    const id = itemKey(item);
    if (insideMain && !template) inMain.add(id);
    if (insideMain && !sealed && !template) movable.add(id);
    if (!template) items.set(id, item);
    const el = node("div", "page-structure__row");
    el.setAttribute("role", "treeitem");
    el.setAttribute("aria-level", String(level));
    el.setAttribute("aria-selected", String(id === selected));
    el.dataset.node = id;
    if (template) el.dataset.templatePath = templatePaths.get(item);
    if (outerRows.has(item)) el.classList.add("page-structure__row--outer");
    el.tabIndex = -1;
    el.style.setProperty("--depth", String(level - 1));
    const toggle = node("span", "page-structure__toggle");
    toggle.setAttribute("aria-hidden", "true");
    const name = handlers.label(item);
    const { text, component } = name;
    const kind = template && item.tag === "slot" ? "Empty" : name.kind;
    if (template && item.tag === "slot") el.classList.add("page-structure__row--empty-slot");
    const modeRows = !template && structure?.path ? handlers.templateRows?.(structure.path, item.node) : undefined;
    // The instance's row stands for the root of the template it shows: the page's for the
    // first level, an opened nested instance's for its own.
    const opened = modeRows && !modeRows.nested ? { path: modeRows.path, root: modeRows.root, current: true } : own?.opened;
    if (opened?.root) {
      templateRoots.set(item, { path: opened.path, node: [...opened.root] });
      if (opened.current) rootAlias = { key: templateKey(opened.path, opened.root), id };
      el.dataset.templatePath = opened.path;
    } else templateRoots.delete(item);
    if (modeRows?.nested) outerRows.add(item);
    if (modeRows) framedRows.add(item); else framedRows.delete(item);
    const slotModel = !template && !modeRows && structure?.path ? handlers.componentSlots?.(structure.path, item.node) : undefined;
    // A slot opened before its element existed (Show, or a defaulted slot's
    // first edit) settles on its first actual assigned root.
    if (slotContext && paintFresh !== false && openSlot && openSlot.host === hostKey(slotContext.model) && openSlot.name === slotContext.slot.name
      && openSlot.anchor === slotRowKey(slotContext.model, slotContext.slot.name) && item.slot === slotContext.slot.name) {
      openSlot.anchor = key([...slotContext.anchor]);
      foldState.set(openSlot.anchor, false);
      if (focusSlotField && focusSlotField.row === undefined) focusSlotField.row = openSlot.anchor;
    }
    const editing = !!slotContext && editable(slotContext.slot) && openSlot?.host === hostKey(slotContext.model) && openSlot.name === slotContext.slot.name && openSlot.anchor === id;
    const attributes = !!slotModel && openAttributes === id;
    const children = modeRows?.items ?? item.children;
    const hasChildren = children.length > 0 || !!slotModel;
    const label = node("span", "page-structure__label");
    const named = component;
    const kindName = named ? node("span", "page-structure__kind", kind) : kindMark(item.tag, kind, Boolean(text));
    if (named) {
      if (component) el.classList.add("page-structure__row--component");
      kindName.prepend(blockIcon(item.tag, kind, true));
    }
    label.append(kindName);
    if (text) label.append(" ", node("span", "page-structure__text", text));
    el.append(toggle, label);
    // The element's actions (Make component…), shared with a right-click in the preview.
    const menuPath = structure!.path;
    const entries = (opening = false) => handlers.menuItems?.(menuPath, item, opening) ?? [];
    const hasMenu = entries().length > 0;
    if (slotModel || template || modeRows || hasMenu) {
      // The row is named by its kind and preview only; its action buttons keep their own names.
      kindName.id = `page-structure-kind-${++rowNameSeq}`;
      const parts = [kindName.id];
      const preview = label.querySelector<HTMLElement>(":scope > .page-structure__text");
      if (preview) { preview.id = `page-structure-text-${rowNameSeq}`; parts.push(preview.id); }
      el.setAttribute("aria-labelledby", parts.join(" "));
      if (component) el.classList.add("page-structure__row--instance");
    }
    if (slotModel) {
      const attributesAction = iconAction("Attributes", "content", () => {
          openSlot = undefined;
          openAttributes = openAttributes === id ? undefined : id;
          if (openAttributes && !editingModule) void loadEditing(true);
          if (openAttributes) { foldState.set(id, false); focusInline = id; }
          render();
          if (!openAttributes) rows.get(id)?.focus();
        });
      attributesAction.setAttribute("aria-expanded", String(attributes));
      addRowActions(el, [
        attributesAction,
        slotModel.opens ? (() => {
          const open = button("Open ›", () => slotModel.edit(), "page-structure__action page-structure__action--open");
          open.setAttribute("aria-label", `Open ${kind} component`);
          open.title = `Open ${kind} component`;
          return open;
        })() : iconAction("Edit component", "edit", () => slotModel.edit()),
        iconAction("Disconnect this instance", "detach", () => slotModel.disconnect()),
      ]);
    }

    if (own) {
      for (const at of own.chips) {
        const chip = template!.badge(at);
        if (chip) el.append(chip);
      }
      if (own.opens && template!.open) {
        const open = button("Open ›", () => template!.open!(item.node), "page-structure__action page-structure__action--open");
        open.setAttribute("aria-label", `Open ${kind} component`);
        open.title = `Open ${kind} component`;
        addRowActions(el, [open]);
      }
    }
    const openMenu = (anchor: HTMLElement, at?: { x: number; y: number }) => {
      const items = entries(true);
      if (!items.length) return false;
      menu.open(anchor, items, at, `Actions for ${kind}${text ? ` ${text}` : ""}`);
      return true;
    };
    if (hasMenu) {
      const more = button("", () => {
        if (menu.isOpen() && menu.opener === more) { menu.close(true); return; }
        openMenu(more);
      }, "page-structure__action");
      setIcon(more, "dots-three", 16);
      more.title = "More actions";
      more.setAttribute("aria-label", `Actions for ${kind}${text ? ` ${text}` : ""}`);
      more.setAttribute("aria-haspopup", "menu");
      more.setAttribute("aria-expanded", "false");
      addRowActions(el, [more]);
    }
    el.addEventListener("contextmenu", event => {
      if (inEditor(event.target)) return;
      if (openMenu(el, { x: event.clientX, y: event.clientY })) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    if (slotContext) {
      el.classList.add("page-structure__row--slot");
      const { slot } = slotContext;
      const badge = button(slot.label, () => requestSlotEdit(slotContext), "page-structure__slot-badge");
      badge.title = `Edit ${slot.label}`;
      badge.setAttribute("aria-label", editable(slot) ? `Edit ${slot.label}` : `Select ${slot.label}`);
      if (!editable(slot)) badge.title = `Select ${slot.label}`;
      isolate(badge);
      // The badge goes before the bar so Tab reaches it first.
      const bar = el.querySelector(":scope > .row-action-overlay");
      if (bar) bar.before(badge); else el.append(badge);
      addRowActions(el, slotActions(slotContext.model, slot, () => requestSlotEdit(slotContext)));
    }
    // An unknown slot assignment keeps its CSS-drawn name; a known slot wears its badge.
    if (item.slot) el.dataset.slot = item.slot;
    el.addEventListener("pointerdown", (event) => { if (inEditor(event.target)) return; notePress(event, el); if (!template && !modeRows) pressRow(event, item, el); });
    el.addEventListener("click", (event) => {
      if (rowDrag?.justDragged()) return;
      if (inEditor(event.target)) return;
      if (event.target === toggle && hasChildren) {
        fold(item, el, !isFolded(id));
        return;
      }
      // A second click on the selected row's text edits it in place: the caret
      // where it was clicked, or everything selected for a double-click.
      if (slotContext && inPlace(slotContext.slot) && !editing && secondClick(event, el, label)) {
        requestSlotEdit(slotContext, event.detail > 1 ? undefined : caretAt(event, label));
        return;
      }
      choose(item);
    });
    el.addEventListener("keydown", (event) => {
      // Keys typed in the row's field or on its Done button are theirs, not the tree's.
      if (event.target !== el) return;
      if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
        if (openMenu(el)) { event.preventDefault(); event.stopPropagation(); }
        return;
      }
      if (event.key === "F2" && slotContext) { event.preventDefault(); requestSlotEdit(slotContext); return; }
      // Enter on a row whose text edits in place starts editing it (everything selected).
      if (event.key === "Enter" && slotContext && inPlace(slotContext.slot) && !editing) { event.preventDefault(); event.stopPropagation(); requestSlotEdit(slotContext); return; }
      onKey(event, item, el);
    });
    rows.set(id, el);
    const editor = editing && slotContext ? editingNow() : undefined;
    if (editor && slotContext) editor.editRow(el, label, slotContext.model, slotContext.slot, id, inPlace(slotContext.slot));
    else if (leftEditing === id) el.classList.add("was-editing");
    const inline = editor && slotContext ? editor.card(slotContext.model, slotContext.slot, id, level) : undefined;
    if (inline) inline.id = `structure-inline-${id}`;
    // A row with Attributes open and its panel read as one attached block.
    if (attributes) el.classList.add("has-panel");
    const outlined = modeRows && !modeRows.nested || own?.opened?.current;
    const framed = (parts: HTMLElement[]) => {
      if (!outlined) return parts;
      const outline = node("div", "page-structure__component-outline");
      outline.append(...parts); return [outline];
    };
    if (!hasChildren) return framed(inline ? [el, inline] : [el]);
    el.setAttribute("aria-expanded", String(!isFolded(id)));
    const group = node("div", "page-structure__group");
    group.setAttribute("role", "group");
    if (modeRows) {
      if (!editingInstance || editingInstance !== id) foldState.set(id, false);
      editingInstance = id;
      el.classList.add("page-structure__row--editing-component");
      el.setAttribute("aria-expanded", String(!isFolded(id)));
    }
    if (own?.opened) {
      if (!unfoldedOpen.has(id)) foldState.set(id, false);
      unfoldedOpen.add(id);
      el.setAttribute("aria-expanded", String(!isFolded(id)));
    }
    group.hidden = isFolded(id);
    const childInMain = insideMain || item.tag === "main";
    if (inline) group.append(inline);

    const attributesEditor = attributes && slotModel ? editingNow() : undefined;
    if (attributesEditor && slotModel) {
      const close = () => { openAttributes = undefined; render(); rows.get(id)?.focus(); };
      group.append(attributesEditor.attributesPanel(slotModel, id, level, hostKey(slotModel), close));
    }
    // Every authored child stays a real row in native source order; a known
    // slot's rows share one editor anchor at its first assigned root.
    if (slotModel) settlePending(slotModel, item.children);
    // A hidden slot keeps its place: its row sits where Show puts the slot
    // back, before the first child of a later slot (fillInsertEdit's order).
    const missing = slotModel ? slotModel.slots.filter(slot => !slot.assignedNodes.length) : [];
    const slotOrder = (name: string) => { const at = slotModel!.slots.findIndex(slot => slot.name === name); return at < 0 ? slotModel!.slots.length : at; };
    for (const child of children) {
      while (missing.length && slotOrder(child.slot.trim()) > slotOrder(missing[0].name)) group.append(...slotOnlyRow(slotModel!, missing.shift()!, level + 1));
      const slot = slotModel?.slots.find(slot => slot.assignedNodes.some(node => key([...node]) === key(child.node)));
      const anchor = slot && item.children.find(candidate => slot.assignedNodes.some(node => key([...node]) === key(candidate.node)))?.node;
      const items = Boolean(component) && Boolean(itemsSlot?.(item.tag, child.slot.trim()));
      group.append(...row(child, level + 1, childInMain, slot && anchor && slotModel ? { model: slotModel, slot, anchor } : undefined, sealed || (Boolean(component) && !items), modeRows ?? template));
    }
    for (const slot of missing) group.append(...slotOnlyRow(slotModel!, slot, level + 1));
    return framed([el, group]);
  }

  function fold(item: NativeStructureItem, el: HTMLElement, closed: boolean) {
    const id = itemKey(item);
    foldState.set(id, closed);
    el.setAttribute("aria-expanded", String(!closed));
    const group = el.nextElementSibling;
    if (group instanceof HTMLElement && group.getAttribute("role") === "group") group.hidden = closed;
  }

  // Unfold the rows above a row so it shows.
  function reveal(el: HTMLElement) {
    for (let group = el.parentElement?.closest<HTMLElement>("[role='group']"); group; group = group.parentElement?.closest<HTMLElement>("[role='group']")) {
      const parent = group.previousElementSibling;
      if (group.hidden && parent instanceof HTMLElement && parent.dataset.node !== undefined) {
        foldState.set(parent.dataset.node, false);
        parent.setAttribute("aria-expanded", "true");
        group.hidden = false;
      }
    }
  }

  function choose(item: NativeStructureItem) {
    if (!structure?.path) return;
    // An outer level's row only shows where the opened component sits: the breadcrumb goes back.
    if (outerRows.has(item)) { rows.get(itemKey(item))?.focus(); return; }
    setSelected(itemKey(item));
    rows.get(itemKey(item))?.focus();
    const root = templateRoots.get(item);
    handlers.onSelect(root?.path ?? templatePaths.get(item) ?? structure.path, root?.node ?? item.node);
  }

  // Rows that are on show, in tree order, for the arrow keys.
  const visibleRows = () =>
    [...tree.querySelectorAll<HTMLElement>("[role='treeitem']")].filter((el) => !el.closest("[role='group'][hidden]"));

  function onKey(event: KeyboardEvent, item: NativeStructureItem, el: HTMLElement) {
    // Template rows, and the framed instance's own, never move the page's elements.
    if ((templatePaths.has(item) || templateRoots.has(item) || framedRows.has(item)) && event.altKey) { event.preventDefault(); event.stopPropagation(); return; }
    const list = visibleRows();
    const at = list.indexOf(el);
    const focusRow = (target: HTMLElement | undefined) => {
      if (!target) return;
      list.forEach((other) => { other.tabIndex = -1; });
      target.tabIndex = 0;
      target.focus();
    };
    if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "ArrowLeft" || event.key === "ArrowRight") && structure?.path) {
      const outcome = handlers.onMove?.(structure.path, item, event.key === "ArrowLeft" ? "out" : "in");
      if (Array.isArray(outcome)) focusAfterRender = key(outcome);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // Alt+Up/Down requests a source move; its row keeps focus on refusal.
    if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && structure?.path) {
      const direction = event.key === "ArrowUp" ? "up" : "down";
      const last = item.node.length - 1;
      const target = [...item.node.slice(0, last), item.node[last] + (direction === "up" ? -1 : 1)];
      const outcome = handlers.onMove?.(structure.path, item, direction);
      if (outcome) {
        if (outcome !== "stayed") focusAfterRender = key(Array.isArray(outcome) ? outcome : target);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    switch (event.key) {
      case "ArrowDown": focusRow(list[at + 1]); break;
      case "ArrowUp": focusRow(list[at - 1]); break;
      case "Home": focusRow(list[0]); break;
      case "End": focusRow(list[list.length - 1]); break;
      case "ArrowRight":
        if (!el.hasAttribute("aria-expanded")) return;
        if (isFolded(itemKey(item))) fold(item, el, false);
        else focusRow(list[at + 1]);
        break;
      case "ArrowLeft":
        if (el.hasAttribute("aria-expanded") && !isFolded(itemKey(item))) fold(item, el, true);
        else {
          const parent = el.parentElement?.closest("[role='group']")?.previousElementSibling;
          focusRow(parent instanceof HTMLElement ? parent : undefined);
        }
        break;
      case "Enter":
      case " ":
        choose(item);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function setSelected(id: string | undefined) {
    selected = id;
    // Formatting inside a line of text has no row of its own: its line's row is marked.
    let shown = id;
    while (shown !== undefined && !rows.has(shown)) {
      if (rootAlias?.key === shown) shown = rootAlias.id;
      else shown = shown.includes(".") ? shown.slice(0, shown.lastIndexOf(".")) : undefined;
    }
    let current: HTMLElement | undefined;
    for (const [rowId, el] of rows) {
      const on = rowId === shown;
      el.setAttribute("aria-selected", String(on));
      if (on) current = el;
    }
    // The selected row (else the first) is the tree's tab stop.
    const stop = current ?? rows.values().next().value;
    for (const el of rows.values()) el.tabIndex = el === stop ? 0 : -1;
    return current;
  }

  // ---- Editing a row's text in place. ----
  // What a press on a row looked like: where, and whether the row had focus
  // (it was chosen by an earlier click or the keyboard), so its click can tell
  // a second click from a first one or the end of a drag.
  let press: { row: HTMLElement; x: number; y: number; focused: boolean } | undefined;
  function notePress(event: PointerEvent, row: HTMLElement) {
    // A slot-only row is never marked selected (it stands for its instance): its focus is enough.
    const chosen = row.getAttribute("aria-selected") === "true" || row.dataset.slotRow !== undefined;
    press = event.button === 0 ? { row, x: event.clientX, y: event.clientY, focused: document.activeElement === row && chosen } : undefined;
  }
  const inEditor = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(".page-structure__edit-field, .page-structure__done, .slot-chip"));
  function secondClick(event: MouseEvent, row: HTMLElement, label: HTMLElement) {
    const pressed = press; press = undefined;
    if (!pressed || pressed.row !== row || !pressed.focused) return false;
    if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4) return false;
    // On the row's text, not its chevron, badge or actions.
    const text = label.querySelector(":scope > .page-structure__text") ?? label;
    const box = text.getBoundingClientRect();
    return event.clientX >= box.left - 2 && event.clientY >= box.top - 4 && event.clientY <= box.bottom + 4 && event.target instanceof Node && label.contains(event.target);
  }
  // The character offset in the row's text under a click (its end when right of it).
  function caretAt(event: MouseEvent, label: HTMLElement) {
    const text = label.querySelector<HTMLElement>(":scope > .page-structure__text");
    if (!text) return undefined;
    const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    const position = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
    const range = position ? undefined : document.caretRangeFromPoint?.(event.clientX, event.clientY);
    const at = position ? { node: position.offsetNode, offset: position.offset } : range ? { node: range.startContainer, offset: range.startOffset } : undefined;
    if (!at || !text.contains(at.node)) return event.clientX > text.getBoundingClientRect().right ? text.textContent?.length : undefined;
    let offset = 0;
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    for (let current = walker.nextNode(); current; current = walker.nextNode()) {
      if (current === at.node) return offset + at.offset;
      offset += current.textContent?.length ?? 0;
    }
    return undefined;
  }
  // A paint held back while typing is drawn once focus has left the field.
  tree.addEventListener("focusout", () => {
    if (!editingModule?.held() || renderingFields) return;
    setTimeout(() => {
      const active = document.activeElement;
      if (!editingModule?.held() || (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) && tree.contains(active)) return;
      editingModule.release();
      render();
    });
  });
  // A double-click whose first click began editing selects all of the text.
  tree.addEventListener("dblclick", event => {
    const field = event.target instanceof Element ? event.target.closest<HTMLTextAreaElement>(".page-structure__edit-field") : null;
    if (field && performance.now() - editStarted < 800) field.select();
  });

  function render() {
    menu.close(false);
    rows.clear();
    items.clear();
    movable.clear();
    rootAlias = undefined;
    slotRows.clear();
    inMain.clear();
    const focused = focusAfterRender ?? (tree.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.node : undefined);
    const previousFocus = tree.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.slotRow : undefined;
    // A row's button with focus (a badge, an action) is found again on its redrawn row.
    const active = document.activeElement;
    const focusedControl = active instanceof HTMLElement && active.matches("button, .slot-chip[role='button']") && tree.contains(active) ? (() => {
      const owner = active.closest<HTMLElement>("[role='treeitem']");
      const id = owner?.dataset.node ?? owner?.dataset.slotRow;
      // A slot chip's row can change its path (a part made a slot moves inside it): its place in the tree finds it then.
      const place = owner && active.matches(".slot-chip") ? visibleRows().indexOf(owner) : -1;
      return id === undefined ? undefined : { id, place, name: active.getAttribute("aria-label") ?? active.textContent ?? "" };
    })() : undefined;
    focusAfterRender = undefined;
    if (!structure || !structure.path) {
      hint.textContent = structure ? HINT_COMPONENT : HINT_NO_PAGE;
      hint.hidden = false;
      meta.hidden = true;
      tree.hidden = true;
      tree.replaceChildren();
      cleanControls();
      return;
    }
    hint.hidden = true;
    renderMeta(structure.path);
    tree.hidden = false;
    const activeField = (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) && tree.contains(document.activeElement) ? document.activeElement : undefined;
    const caret = activeField ? [activeField.selectionStart, activeField.selectionEnd] : undefined;
    renderingFields = true;
    const current = structure.paintedSource !== undefined ? handlers.pageSource?.(structure.path) : undefined;
    paintFresh = current === undefined ? undefined : current === structure.paintedSource;
    keepPending = false;
    editorWaiting = false;
    itemsSlot = handlers.itemsSlots?.();
    tree.replaceChildren(...structure.items.flatMap((item) => row(item, 1)), drop);
    const pendingTemplate = pendingSelection && [...rows.values()].some(row => row.dataset.templatePath === pendingSelection!.path);
    if (pendingTemplate && pendingSelection) {
      selected = templateKey(pendingSelection.path, pendingSelection.node);
      pendingSelection = undefined;
    }
    if (!tree.querySelector(".page-structure__component-outline")) { editingInstance = undefined; unfoldedOpen.clear(); }
    // An editor whose anchor went (Hide, Undo, Redo) or a Show that found
    // nothing to anchor to is forgotten, so no later render reopens it.
    // A paint proven stale proves nothing, and a pending Show waits for a fresh one.
    if (openSlot && !editorWaiting && !keepPending && paintFresh !== false && !tree.querySelector("[data-slot-editor]")) { openSlot = undefined; }
    leftEditing = undefined;
    const currentSelection = setSelected(selected);
    if (pendingTemplate && currentSelection) { reveal(currentSelection); currentSelection.scrollIntoView({ block: "nearest" }); }
    if (focusedControl && !tree.contains(document.activeElement)) {
      const again = [...(rowElement(focusedControl.id)?.querySelectorAll<HTMLElement>("button, .slot-chip[role='button']") ?? [])]
        .find(control => (control.getAttribute("aria-label") ?? control.textContent ?? "") === focusedControl.name)
        ?? (focusedControl.place >= 0 && !rowElement(focusedControl.id) ? visibleRows()[focusedControl.place]?.querySelector<HTMLElement>(":scope > .slot-chip") ?? undefined : undefined);
      again?.focus();
    }
    if (activeField && tree.contains(activeField)) {
      activeField.focus();
      if (caret && caret[0] !== null) activeField.setSelectionRange(caret[0], caret[1]);
      renderingFields = false;
      cleanControls();
      return;
    }
    renderingFields = false;
    cleanControls();
    // An explicit edit request is consumed here, by its first render, even
    // when the slot has no field (Content): its row then takes focus.
    // Focus moved elsewhere (the canvas caret) meanwhile: the request lapses, the editor still opens.
    if (focusSlotField && !keepPending && document.activeElement && document.activeElement !== document.body && !tree.contains(document.activeElement)) focusSlotField = undefined;
    // (Editing still loading: the request waits for the render that follows its arrival.)
    if (focusSlotField && !keepPending && editingModule) {
      const wanted = focusSlotField; focusSlotField = undefined;
      if (editingModule.focus(wanted)) return;
      const owner = wanted.row !== undefined ? rowElement(wanted.row) : undefined;
      if (owner) { focusRowOnly(owner); return; }
    }
    if (focusInline && editingModule) {
      const wanted = focusInline; focusInline = undefined;
      const first = tree.querySelector<HTMLElement>(`.page-structure__inline[data-edit-node="${wanted}"] input:not([type=hidden]):not([type=file]), .page-structure__inline[data-edit-node="${wanted}"] textarea`);
      if (first) { first.focus(); return; }
    }
    if (activeField) editingModule?.closeField(activeField);
    // A row moved into a folded container (Alt+→) shows before it takes focus.
    if (focused && rows.has(focused)) { reveal(rows.get(focused)!); focusRowOnly(rows.get(focused)!); }
    else if (!focused && document.activeElement === document.body && previousFocus && slotRows.has(previousFocus)) slotRows.get(previousFocus)!.focus();
  }

  // ---- A block dragged over the page or the tree (tree-drop.ts decides). ----
  // Rows a drag unfolded: folded back once it moves on or ends.
  const dragOpened = new Set<string>();
  let springMarked: HTMLElement | undefined;
  let marked: { sig?: string; row?: HTMLElement; moving?: HTMLElement } = {};
  const subtreeEnd = (el: HTMLElement) => {
    const group = el.nextElementSibling;
    return (group instanceof HTMLElement && group.getAttribute("role") === "group" && !group.hidden ? group : el).getBoundingClientRect().bottom;
  };
  const onWay = (id: string, path: readonly number[] | undefined) => path !== undefined && (key(path) === id || key(path).startsWith(`${id}.`));
  const dropView: StructureDropView = {
    over(x, y) {
      if (tree.hidden) return false;
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && host.contains(hit));
    },
    rows: () => visibleRows().flatMap((el): TreeRow[] => {
      const item = el.dataset.node !== undefined ? items.get(el.dataset.node) : undefined;
      if (!item) return [];
      const { top, bottom } = el.getBoundingClientRect();
      return [{ item, folded: el.getAttribute("aria-expanded") === "false", level: Number(el.getAttribute("aria-level")) || 1, top, bottom, end: subtreeEnd(el) }];
    }),
    indent: () => ({
      left: tree.getBoundingClientRect().left + LINE_LEFT,
      step: parseFloat(getComputedStyle(tree).getPropertyValue("--structure-indent")) || 14,
    }),
    unfold(target, keep) {
      for (const id of [...dragOpened].sort((a, b) => b.length - a.length)) {
        if (onWay(id, target) || onWay(id, keep)) continue;
        dragOpened.delete(id);
        const el = rows.get(id), item = items.get(id);
        if (el && item && !isFolded(id)) fold(item, el, true);
      }
      if (!target) { dragOpened.clear(); return; }
      for (let depth = 1; depth <= target.length; depth++) {
        const id = key(target.slice(0, depth)), el = rows.get(id), item = items.get(id);
        if (el && item && el.hasAttribute("aria-expanded") && isFolded(id)) { fold(item, el, false); dragOpened.add(id); }
      }
    },
    open(target) {
      const id = key(target), el = rows.get(id), item = items.get(id);
      if (el && item && el.hasAttribute("aria-expanded") && isFolded(id)) { fold(item, el, false); dragOpened.add(id); }
    },
    foldBelow(y, target) {
      for (const path of [...foldRows(dropView.rows(), y, target, dragOpened)].reverse()) {
        const id = key(path), el = rows.get(id), item = items.get(id);
        if (!el || !item) continue;
        dragOpened.delete(id);
        fold(item, el, true);
      }
    },
    spring(target) {
      const el = target && rows.get(key(target));
      if (el === springMarked) return;
      springMarked?.classList.remove("is-spring");
      springMarked = el;
      springMarked?.classList.add("is-spring");
    },
    mark(shown, reveal, moving) {
      const sig = JSON.stringify([shown, moving]);
      // Asked every frame: a redrawn tree (rows replaced) is marked again.
      if (sig === marked.sig && (!marked.row || marked.row.isConnected) && (!marked.moving || marked.moving.isConnected)) return;
      marked.row?.classList.remove("is-drop-target", "is-drop-refused");
      marked.moving?.classList.remove("is-drag-source");
      marked = { sig };
      tree.classList.toggle("is-dragging", Boolean(shown || moving));
      const source = moving && rows.get(key(moving));
      if (source) { source.classList.add("is-drag-source"); marked.moving = source; }
      drop.hidden = !shown;
      if (!shown) return;
      drop.style.top = `${shown.line.y - tree.getBoundingClientRect().top}px`;
      drop.style.setProperty("--depth", String(shown.line.level - 1));
      drop.classList.toggle("is-refused", !shown.ok);
      const container = shown.row && rows.get(key(shown.row));
      if (container) { container.classList.add(shown.ok ? "is-drop-target" : "is-drop-refused"); marked.row = container; }
      if (reveal) drop.scrollIntoView({ block: "nearest" });
    },
    edgeScroll(y) {
      const box = host.getBoundingClientRect();
      if (y < box.top + EDGE) host.scrollTop -= EDGE_STEP;
      else if (y > box.bottom - EDGE) host.scrollTop += EDGE_STEP;
    },
    painted: () => structure?.paintedSource,
  };

  function focusRowOnly(el: HTMLElement) {
    for (const other of rows.values()) other.tabIndex = -1;
    el.tabIndex = 0;
    el.focus();
  }

  return {
    /** The page's elements after a render; nothing while no page is on show. */
    update(next: NativeStructure | undefined) {
      const path = next?.path ?? "";
      const previousStructure = structure;
      if (path !== structure?.path) {
        // Another page: a row edit is kept (what waits is written) and ends.
        if (editingModule?.editing()) editingModule.finish("commit", false, true);
        foldState.clear();
        selected = undefined; openSlot = undefined; openAttributes = undefined;
      } else if (editingModule?.editing() && editingModule.stale()) {
        // The source moved on without the row edit (Undo, Redo, another edit): it ends, said so.
        const owner = editingModule.editing()!;
        editingModule.finish("stale", false, true);
        openSlot = undefined; focusSlotField = undefined; leftEditing = owner;
        // Drawn even when the page reads as before the typing (its paints were held).
        rendered = "";
      }
      structure = next;
      const pending = pendingSelection;
      // Selection can arrive before the structure for the same render.
      // Consume it on the next named page only; unrelated navigation drops it.
      if (path && pending) {
        pendingSelection = undefined;
        if (pending.path === path) selected = key(pending.node);
        else if (path === previousStructure?.path) pendingSelection = pending;
      }
      // While a row's text is being typed, the paint of exactly the source that
      // typing made (text alone changed) is kept but not drawn: the tree stays
      // as it is, field, caret and all; it is drawn when editing ends. Any other
      // change (Undo, another edit, a new page) is drawn as ever.
      if (next && previousStructure && openSlot && path === previousStructure.path && editingModule?.holdsPaint(next, previousStructure)) {
        structure = next;
        return;
      }
      const proof = handlers.componentFieldsRevision?.();
      const signature = next ? `${next.path}\n${JSON.stringify(next.items)}\n${next.paintedSource ?? ""}\n${proof ?? ""}` : "";
      if ((!handlers.componentSlots || proof !== undefined) && signature === rendered && !tree.hidden === Boolean(next?.path)) return;
      rendered = signature;
      render();
      if (pending?.path === path) {
        const current = rows.get(key(pending.node));
        if (current) reveal(current);
        current?.scrollIntoView({ block: "nearest" });
      }
    },
    /** Mark the row of the element selected in the preview, and show it. */
    select(target: { path: string; node: number[] } | undefined) {
      pendingSelection = target && target.path !== structure?.path ? { path: target.path, node: [...target.node] } : undefined;
      const template = target && [...rows.values()].some(row => row.dataset.templatePath === target.path);
      if (template) pendingSelection = undefined;
      const id = target && template ? templateKey(target.path, target.node) : target && structure && target.path === structure.path ? key(target.node) : undefined;
      if (id === selected) return;
      // Another element chosen (on the page or here): a row edit is kept and ends. The
      // edited element, its instance (its own writes select that) or what is in it do not count.
      const owner = editingModule?.editing();
      if (owner !== undefined && !(id !== undefined && (id === owner || owner.startsWith(`${id}.`) || id.startsWith(`${owner}.`) || owner.startsWith(`~${id}:`)))) editingModule!.finish("commit", false);
      const current = setSelected(id);
      if (current) reveal(current);
      current?.scrollIntoView({ block: "nearest" });
    },
    /** What a block's drag draws in the tree and measures there (tree-drop.ts). */
    dropView: () => dropView,
    /** Source or mode changed without a new runtime structure report. */
    refresh() { rendered = ""; render(); },
    /** The page changed under the fields: show its title and description again. */
    refreshMeta() {
      if (structure?.path) renderMeta(structure.path);
    },
    destroy() {
      menu.close(false);
      menu.element.remove();
      // A row edit is kept (what waits is written); every other open step ends.
      editingModule?.destroy();
      hint.remove();
      meta.remove();
      tree.remove();
    },
  };
}

export type PageStructure = ReturnType<typeof createPageStructure>;
