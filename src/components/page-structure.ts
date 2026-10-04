import { button, node } from "../ui/dom";
import type { NativeStructure, NativeStructureItem } from "./native-preview";
import { createUrlChange, type UrlPlan } from "./url-change";
import { mark, componentIcon } from "../page-builder/component-icon";
import eyeOpen from "@phosphor-icons/core/regular/eye.svg?raw";
import eyeClosed from "@phosphor-icons/core/regular/eye-closed.svg?raw";
import "./row-action-overlay.css";
import "./page-structure.css";
import type { ComponentStructureModel, ComponentSlotPart, ComponentFieldSession } from "../page-builder/components";

// The page structure sidebar: the rendered page's own elements as a tree,
// fed by the runtime's index paths after each render. A row selects its
// element in the preview (and brings it to the middle of the frame); a
// preview selection marks its row (unfolding the rows above it). Rows with
// children fold; everything inside `<main>` starts folded, so a page opens
// as its list of sections. The folded state is kept per element while the
// same page stays on show. Above the
// tree, a Page block holds the page's title and description from its
// `<head>`; they apply as typed. A section row can be dragged with the
// pointer onto another gap among its siblings (7 px of movement starts the
// drag, so a plain press still selects); only the rows sharing its parent
// take the drop.

export type PageMetaField = "title" | "description";

export interface PageStructureHandlers {
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
  /** `generated`: a card a collection makes from page data; it is shown, not edited, here.
   * `ownershipUnknown`: whether a collection makes it cannot be checked yet; it is held, not called generated. */
  label: (item: NativeStructureItem) => { kind: string; text: string; component?: boolean; generated?: boolean; ownershipUnknown?: boolean };
  /** A row was chosen: select this element in the preview. */
  onSelect: (path: string, node: number[]) => void;
  /**
   * Alt+Up/Down on a row: move that element one sibling position. "moved",
   * "stayed" (an edge or refused move) or "pending" (the page file is
   * opening first; the move follows). A handled refusal keeps row focus.
   */
  onMove?: (path: string, item: NativeStructureItem, direction: "up" | "down") => "moved" | "stayed" | "pending" | undefined;
  /** Whether this element's row can be dragged to another position (a whole section). */
  canDrag?: (item: NativeStructureItem) => boolean;
  /**
   * A row was dropped on the gap `index` among its siblings (before the
   * sibling at that index; the sibling count for the end): "moved", "stayed"
   * for the gap it already fills, nothing when the move could not be made.
   */
  onMoveTo?: (path: string, item: NativeStructureItem, index: number) => "moved" | "stayed" | undefined;
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
// Pointer travel before a press on a row becomes a drag.
const DRAG_THRESHOLD = 7;

const key = (node: number[]) => node.join(".");

export function createPageStructure(host: HTMLElement, handlers: PageStructureHandlers) {
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
  // The line between rows that shows where a dragged row will go.
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
      handlers.announce?.(`The ${slot.name} slot is shown, but its element could not be found in Structure; select it on the page to edit it.`);
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
  function requestSlotEdit(context: SlotRowContext | { model: ComponentStructureModel; slot: SlotRowContext["slot"]; anchor?: undefined }) {
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
    focusSlotField = { prefix: slotFieldPrefix(model, slot.name), row: owner };
    render();
  }
  const slotRows = new Map<string, HTMLElement>();
  const rowElement = (id: string) => rows.get(id) ?? slotRows.get(id);
  function iconAction(label: string, icon: Parameters<typeof mark>[0], action: () => void) {
    const result = button("", action, "page-structure__action");
    result.title = label; result.setAttribute("aria-label", label); result.append(mark(icon, 14)); return result;
  }

  // The row to focus once the next render shows a section that just moved.
  let focusAfterRender: string | undefined;

  // A press on a draggable row, and the drag it becomes after 7 px: the
  // sibling rows (with their subtrees) whose gaps take the drop, the group
  // element that holds them, and the gap under the pointer.
  interface RowDrag {
    pointerId: number;
    item: NativeStructureItem;
    el: HTMLElement;
    startX: number;
    startY: number;
    dragging: boolean;
    siblings: HTMLElement[];
    group: HTMLElement;
    target: number | undefined;
  }
  let drag: RowDrag | undefined;
  // The click that follows a drag's release must not select the row again.
  let suppressClick = false;

  // A row's subtree on show: from its top to the bottom of its open group.
  function subtreeBounds(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const group = el.nextElementSibling;
    const bottom = group instanceof HTMLElement && group.getAttribute("role") === "group" && !group.hidden
      ? group.getBoundingClientRect().bottom
      : rect.bottom;
    return { top: rect.top, bottom };
  }

  function dragTarget(current: RowDrag, clientY: number) {
    const box = current.group.getBoundingClientRect();
    if (clientY < box.top || clientY > box.bottom) return undefined;
    for (let index = 0; index < current.siblings.length; index++) {
      const { top, bottom } = subtreeBounds(current.siblings[index]);
      if (clientY < (top + bottom) / 2) return index;
    }
    return current.siblings.length;
  }

  function showDrop(current: RowDrag) {
    const { siblings, target } = current;
    if (target === undefined || !siblings.length) {
      drop.hidden = true;
      return;
    }
    const y = target < siblings.length ? subtreeBounds(siblings[target]).top : subtreeBounds(siblings[siblings.length - 1]).bottom;
    drop.style.top = `${y - tree.getBoundingClientRect().top}px`;
    drop.style.setProperty("--depth", siblings[0].style.getPropertyValue("--depth"));
    drop.hidden = false;
  }

  function onDragKey(event: KeyboardEvent) {
    if (event.key !== "Escape" || !drag) return;
    event.preventDefault();
    event.stopPropagation();
    finishDrag(false);
  }

  function endDrag() {
    const current = drag;
    drag = undefined;
    if (!current) return;
    window.removeEventListener("keydown", onDragKey, true);
    if (current.el.hasPointerCapture(current.pointerId)) current.el.releasePointerCapture(current.pointerId);
    current.el.classList.remove("is-drag-source");
    tree.classList.remove("is-dragging");
    drop.hidden = true;
  }

  function finishDrag(commit: boolean) {
    const current = drag;
    endDrag();
    if (!current?.dragging) return;
    suppressClick = true;
    if (!commit || current.target === undefined || !structure?.path) {
      handlers.announce?.("Section drag cancelled");
      return;
    }
    const targetRow = current.siblings[current.target] ?? current.siblings[current.siblings.length - 1];
    const targetNode = targetRow?.dataset.node?.split(".").map(Number);
    if (!targetNode?.length) { handlers.announce?.("Section drag cancelled"); return; }
    const sourceIndex = targetNode[targetNode.length - 1] + (current.target === current.siblings.length ? 1 : 0);
    const outcome = handlers.onMoveTo?.(structure.path, current.item, sourceIndex);
    if (outcome === "moved") {
      const from = current.item.node[current.item.node.length - 1];
      focusAfterRender = key([...current.item.node.slice(0, -1), sourceIndex > from ? sourceIndex - 1 : sourceIndex]);
    } else if (!outcome) handlers.announce?.("Section drag cancelled");
  }

  function pressRow(event: PointerEvent, item: NativeStructureItem, el: HTMLElement) {
    suppressClick = false;
    if (event.button !== 0 || drag || !structure?.path || !handlers.canDrag?.(item)) return;
    if ((event.target as HTMLElement).classList.contains("page-structure__toggle")) return;
    const parentKey = key(item.node.slice(0, -1));
    const group = el.parentElement;
    if (!(group instanceof HTMLElement) || group !== tree && group.getAttribute("role") !== "group") return;
    const siblings = [...group.children].filter((child): child is HTMLElement => child instanceof HTMLElement
      && child.getAttribute("role") === "treeitem" && child.dataset.node?.split(".").slice(0, -1).join(".") === parentKey);
    if (siblings.length < 2 || !siblings.includes(el)) return;
    drag = { pointerId: event.pointerId, item, el, startX: event.clientX, startY: event.clientY, dragging: false, siblings, group, target: undefined };
    el.setPointerCapture(event.pointerId);
    window.addEventListener("keydown", onDragKey, true);
  }

  function moveRow(event: PointerEvent) {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;
    if (!current.dragging) {
      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_THRESHOLD) return;
      current.dragging = true;
      current.el.classList.add("is-drag-source");
      tree.classList.add("is-dragging");
    }
    event.preventDefault();
    current.target = dragTarget(current, event.clientY);
    showDrop(current);
  }

  const fieldInputs = new Map<string, HTMLInputElement>();
  const fieldClosers = new Map<HTMLInputElement, () => void>();
  let renderingFields = false;
  // One explicit focus request, consumed by the first render after it.
  let focusSlotField: { prefix: string; row: string | undefined } | undefined;
  // The component row whose Attributes were just opened: focus their first field.
  let focusInline: string | undefined;
  const detailOpen = new Map<string, boolean>();
  const attributeForms = new Map<string, HTMLFormElement>();
  const formClosers = new Map<HTMLFormElement, () => void>();
  const uploadClosers = new Map<HTMLInputElement, () => void>();
  function cleanControls() {
    for (const [input, close] of uploadClosers) if (!tree.contains(input)) { close(); uploadClosers.delete(input); }
    for (const [input, close] of fieldClosers) if (!tree.contains(input)) { close(); fieldClosers.delete(input); }
    for (const [id, input] of fieldInputs) if (!tree.contains(input)) fieldInputs.delete(id);
    for (const [id, form] of attributeForms) if (!tree.contains(form)) {
      formClosers.get(form)?.(); formClosers.delete(form); attributeForms.delete(id);
    }
  }
  function guardedField(id: string, label: string, accessible: string, value: string, open: () => ComponentFieldSession | undefined) {
    const previous = fieldInputs.get(id);
    let input: HTMLInputElement;
    if (previous && previous === document.activeElement) input = previous;
    else {
      input = document.createElement("input"); input.type = "text"; input.value = value;
      let session: ComponentFieldSession | undefined;
      input.addEventListener("focus", () => { session ??= open(); });
      input.addEventListener("input", () => { if (!session?.write(input.value)) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); });
      const close = () => { session?.close(); session = undefined; };
      fieldClosers.set(input, close);
      input.addEventListener("blur", () => { if (!renderingFields) close(); });
      input.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== "Escape") return;
        event.preventDefault();
        // Enter applies (blur closes the session) and returns to the owning row; Escape also closes the editor.
        const owner = input.closest<HTMLElement>("[data-edit-node]")?.dataset.editNode;
        input.blur();
        if (event.key === "Enter" && owner !== undefined) { event.stopPropagation(); rowElement(owner)?.focus(); }
      });
      fieldInputs.set(id, input);
    }
    input.setAttribute("aria-label", accessible);
    const wrap = node("label", "page-structure__slot-field"); wrap.append(node("span", "page-structure__slot-field-label", label), input); return wrap;
  }
  function attributeControls(model: ComponentStructureModel) {
    const id = `${hostKey(model)}:attr:`;
    const details = document.createElement("details"); details.className = "page-structure__attributes";
    details.dataset.detailKey = id; details.open = detailOpen.get(id) ?? true;
    details.addEventListener("toggle", () => detailOpen.set(id, details.open));
    const summary = document.createElement("summary"); summary.textContent = "Attributes"; details.append(summary);
    for (const attribute of model.attributes) {
      const row = node("div", "page-structure__attribute");
      row.append(guardedField(`${id}:${attribute.name}`, attribute.name, `Attribute: ${attribute.name}`, attribute.value, () => handlers.componentSlots?.(model.host.path, model.host.node)?.openAttribute(attribute.name)),
        button("Remove", () => model.removeAttribute(attribute.name), "text-button"));
      row.lastElementChild?.setAttribute("aria-label", `Remove ${attribute.name}`);
      details.append(row);
    }
    let form = attributeForms.get(id);
    if (!form) {
      form = document.createElement("form"); form.className = "page-structure__attribute-add";
      const name = document.createElement("input"), value = document.createElement("input");
      name.placeholder = "name"; name.setAttribute("aria-label", "New attribute name");
      value.placeholder = "value"; value.setAttribute("aria-label", "New attribute value");
      const submit = button("Add", () => undefined, "text-button"); submit.type = "submit"; submit.setAttribute("aria-label", "Add attribute");
      const problem = node("p", "page-structure__attribute-error"); problem.setAttribute("role", "alert"); problem.hidden = true;
      let origin: ReturnType<ComponentStructureModel["openAttributeAdd"]>;
      form.addEventListener("focusin", () => {
        origin ??= handlers.componentSlots?.(model.host.path, model.host.node)?.openAttributeAdd();
      });
      form.addEventListener("submit", event => {
        event.preventDefault();
        origin ??= handlers.componentSlots?.(model.host.path, model.host.node)?.openAttributeAdd();
        const result = origin?.add(name.value, value.value);
        if (!result || "error" in result) {
          problem.textContent = result && "error" in result ? result.error : "The instance changed; reopen Attributes before adding it.";
          if (!result || result.stale) { origin?.close(); origin = undefined; }
          problem.hidden = false; return;
        }
        name.value = value.value = ""; origin?.close(); origin = undefined; problem.hidden = true;
        name.focus();
      });
      form.addEventListener("focusout", event => {
        if (!renderingFields && !form!.contains(event.relatedTarget as Node | null) && !name.value && !value.value) { origin?.close(); origin = undefined; }
      });
      const closeDraft = () => { origin?.close(); origin = undefined; };
      formClosers.set(form, closeDraft);
      form.append(name, value, submit, problem); attributeForms.set(id, form);
    }
    details.append(form);
    return details;
  }

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
  // Pencil and visibility for a slot row: they fade in over the row's text
  // while the row is hovered or focused, never covering the badge.
  function slotActions(model: ComponentStructureModel, slot: SlotRowContext["slot"], edit: () => void) {
    const actions = node("div", "row-action-overlay page-structure__slot-actions");
    if (editable(slot)) actions.append(iconAction(`Edit ${slot.label}`, "edit", edit));
    const visibility = slot.filled ? visibilityControl(model, slot) : undefined;
    if (visibility) actions.append(visibility);
    isolate(actions);
    return actions.childElementCount ? actions : undefined;
  }
  // A slot row's actions sit at the row's far right, after the badge, which
  // steps aside while they show. A row that already carries the component
  // actions keeps the slot actions inside its label instead.
  function hostSlotActions(row: HTMLElement, label: HTMLElement, actions: HTMLElement) {
    if (row.classList.contains("row-action-host")) { label.classList.add("row-action-host"); label.append(actions); return; }
    row.classList.add("row-action-host", "page-structure__row--slot-host");
    row.style.setProperty("--slot-action-count", String(actions.childElementCount));
    row.append(actions);
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
    label.append(node("span", "page-structure__toggle"), node("span", "page-structure__kind", kind));
    label.firstElementChild!.setAttribute("aria-hidden", "true");
    const preview = slot.kind === "image" ? slot.value.alt ?? "" : slot.value.text;
    if (preview) label.append(" ", node("span", "page-structure__text", preview));
    const edit = () => requestSlotEdit({ model, slot });
    const badge = editable(slot) ? button(slot.label, edit, "page-structure__slot-badge") : node("span", "page-structure__slot-badge", slot.label);
    if (badge instanceof HTMLButtonElement) { badge.title = `Edit ${slot.label}`; badge.setAttribute("aria-label", `Edit ${slot.label}`); isolate(badge); }
    el.append(label, badge);
    if (slot.filled) {
      const actions = slotActions(model, slot, edit);
      if (actions) hostSlotActions(el, label, actions);
    } else {
      // Missing: an optional slot's Show stays visible; a defaulted slot's pencil fades in.
      const show = visibilityControl(model, slot);
      if (show) { isolate(show); el.append(show); }
      else if (editable(slot)) { const actions = node("div", "row-action-overlay page-structure__slot-actions"); actions.append(iconAction(`Edit ${slot.label}`, "edit", edit)); isolate(actions); hostSlotActions(el, label, actions); }
    }
    el.addEventListener("click", () => { if (structure?.path) { setSelected(undefined); el.focus(); handlers.onSelect(model.host.path, [...model.host.node]); } });
    el.addEventListener("keydown", event => {
      if ((event.key === "F2" || event.key === "Enter") && editable(slot) && (slot.filled || slot.whenEmpty === "fallback")) { event.preventDefault(); event.stopPropagation(); edit(); return; }
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
      result.push(inlineEditor(model, slot, id, level));
    }
    return result;
  }

  // The one inline disclosure: the slot's fields under its anchor row.
  function inlineEditor(model: ComponentStructureModel, slot: ComponentStructureModel["slots"][number], owner: string, level: number) {
    const inline = node("div", "page-structure__inline"); inline.dataset.editNode = owner; inline.dataset.slotEditor = slot.name;
    inline.style.setProperty("--depth", String(level - 1));
    const close = () => { openSlot = undefined; render(); rowElement(owner)?.focus(); };
    inline.append(...slotControls({ ...model, slots: [slot] }, level), iconAction(`Close ${slot.label} editor`, "close", close));
    inline.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } });
    return inline;
  }

  function slotControls(model: ComponentStructureModel, level: number) {
    const result: HTMLElement[] = [];

    for (const slot of model.slots) {
      const block = node("div", "page-structure__slot");
      block.style.setProperty("--depth", String(level - 1));
      block.dataset.slotName = slot.name;
      function field(part: ComponentSlotPart, label: string, value: string) {
        const id = `${slotFieldPrefix(model, slot.name)}${part}`;
        return guardedField(id, label, `${slot.label}: ${label}`, value, () => handlers.componentSlots?.(model.host.path, model.host.node)?.openField(slot.name, part));
      }
      if (slot.kind === "text" && slot.value.editable) block.append(field("text", "Text", slot.value.text));
      else if (slot.kind === "image" || slot.kind === "link") {
        const details = document.createElement("details");
        const detailKey = `${model.host.path}:${key([...model.host.node])}:${slot.name}`;
        details.dataset.detailKey = detailKey;
        details.open = detailOpen.get(detailKey) ?? true;
        details.addEventListener("toggle", () => detailOpen.set(detailKey, details.open));
        const summary = document.createElement("summary"); summary.textContent = slot.kind === "image" ? "Image" : "Link";
        details.append(summary);
        if (slot.kind === "image") {
          const image = field("src", "Image", slot.value.src ?? "");
          const suggestions = document.createElement("datalist");
          suggestions.id = `structure-images-${model.host.node.join("-")}-${result.length}`;
          for (const value of model.images) { const option = document.createElement("option"); option.value = value; suggestions.append(option); }
          image.querySelector("input")?.setAttribute("list", suggestions.id);
          const file = document.createElement("input"); file.type = "file"; file.accept = "image/*"; file.hidden = true;
          let pending: ReturnType<ComponentStructureModel["openImageUpload"]>;
          uploadClosers.set(file, () => { if (pending) handlers.announce?.("The image picker changed; reopen Upload image… before choosing a file."); pending?.close(); pending = undefined; });
          const upload = button("Upload image…", () => {
            pending?.close();
            pending = handlers.componentSlots?.(model.host.path, model.host.node)?.openImageUpload(slot.name);
            if (pending) file.click();
          }, "text-button");
          file.addEventListener("cancel", () => { pending?.close(); pending = undefined; });
          file.addEventListener("change", () => {
            const captured = pending, files = [...(file.files ?? [])]; pending = undefined; file.value = "";
            if (!files.length) captured?.close(); else void captured?.upload(files);
          });
          details.append(image, suggestions, upload, file, field("alt", "Alt text", slot.value.alt ?? ""));
        }
        else {
          if (slot.value.editable) details.append(field("text", "Button text", slot.value.text));
          else details.append(node("span", "page-structure__slot-summary", "Content: select the page element to edit its text"));
          const link = field("href", "Link / URL", slot.value.href ?? "");
          const suggestions = document.createElement("datalist"); suggestions.id = `structure-links-${model.host.node.join("-")}-${result.length}`;
          for (const value of model.links) { const option = document.createElement("option"); option.value = value.value; option.label = value.label; suggestions.append(option); }
          link.querySelector("input")?.setAttribute("list", suggestions.id);
          details.append(link, suggestions);
        }
        if (details.contains(document.activeElement)) details.open = true;
        block.append(details);
      } else block.append(node("span", "page-structure__slot-summary", `Content${slot.value.text ? `: ${slot.value.text}` : ""}`));
      result.push(block);
    }
    return result;
  }

  let rowNameSeq = 0;
  function row(item: NativeStructureItem, level: number, insideMain = false, slotContext?: SlotRowContext): HTMLElement[] {
    const id = key(item.node);
    if (insideMain) inMain.add(id);
    const el = node("div", "page-structure__row");
    el.setAttribute("role", "treeitem");
    el.setAttribute("aria-level", String(level));
    el.setAttribute("aria-selected", String(id === selected));
    el.dataset.node = id;
    el.tabIndex = -1;
    el.style.setProperty("--depth", String(level - 1));
    const toggle = node("span", "page-structure__toggle");
    toggle.setAttribute("aria-hidden", "true");
    const { kind, text, component, generated, ownershipUnknown } = handlers.label(item);
    if (generated) {
      el.classList.add("page-structure__row--generated");
      el.title = "Made from page data. Edit the page it comes from, or the collection.";
    } else if (ownershipUnknown) {
      el.title = "Collection ownership could not be checked; edits are temporarily unavailable.";
      el.setAttribute("aria-description", el.title);
    }
    const slotModel = structure?.path ? handlers.componentSlots?.(structure.path, item.node) : undefined;
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
    const hasChildren = item.children.length > 0 || !!slotModel;
    const label = node("span", "page-structure__label");
    const kindName = node("span", "page-structure__kind", kind);
    if (component) {
      el.classList.add("page-structure__row--component");
      kindName.prepend(componentIcon(12));
    }
    label.append(kindName);
    if (text) label.append(" ", node("span", "page-structure__text", text));
    el.append(toggle, label);
    if (slotModel) {
      // The row is named by its kind and preview only; its action buttons keep their own names.
      kindName.id = `page-structure-kind-${++rowNameSeq}`;
      const parts = [kindName.id];
      const preview = label.querySelector<HTMLElement>(":scope > .page-structure__text");
      if (preview) { preview.id = `page-structure-text-${rowNameSeq}`; parts.push(preview.id); }
      el.setAttribute("aria-labelledby", parts.join(" "));
      el.classList.add("page-structure__row--instance");
      el.classList.add("row-action-host");
      const actions = node("div", "row-action-overlay page-structure__component-actions");
      const attributesAction = iconAction("Attributes", "content", () => {
          openSlot = undefined;
          openAttributes = openAttributes === id ? undefined : id;
          if (openAttributes) { foldState.set(id, false); focusInline = id; }
          render();
          if (!openAttributes) rows.get(id)?.focus();
        });
      attributesAction.setAttribute("aria-expanded", String(attributes));
      actions.append(
        attributesAction,
        iconAction("Edit component", "edit", slotModel.edit),
        iconAction("Disconnect this instance", "detach", slotModel.disconnect),
      );
      isolate(actions);
      el.append(actions);
    }
    if (slotContext) {
      el.classList.add("page-structure__row--slot");
      const { slot } = slotContext;
      const badge = button(slot.label, () => requestSlotEdit(slotContext), "page-structure__slot-badge");
      badge.title = `Edit ${slot.label}`;
      badge.setAttribute("aria-label", editable(slot) ? `Edit ${slot.label}` : `Select ${slot.label}`);
      if (!editable(slot)) badge.title = `Select ${slot.label}`;
      isolate(badge);
      const actions = slotActions(slotContext.model, slot, () => requestSlotEdit(slotContext));
      el.append(badge);
      if (actions) hostSlotActions(el, label, actions);
    }
    // An unknown slot assignment keeps its CSS-drawn name; a known slot wears its badge.
    if (item.slot) el.dataset.slot = item.slot;
    el.addEventListener("pointerdown", (event) => pressRow(event, item, el));
    el.addEventListener("pointermove", moveRow);
    el.addEventListener("pointerup", (event) => { if (drag && event.pointerId === drag.pointerId) finishDrag(true); });
    el.addEventListener("pointercancel", (event) => { if (drag && event.pointerId === drag.pointerId) finishDrag(false); });
    el.addEventListener("lostpointercapture", (event) => { if (drag && event.pointerId === drag.pointerId) finishDrag(false); });
    el.addEventListener("click", (event) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (event.target === toggle && hasChildren) {
        fold(item, el, !isFolded(id));
        return;
      }
      choose(item);
    });
    el.addEventListener("keydown", (event) => {
      if (event.key === "F2" && slotContext) { event.preventDefault(); requestSlotEdit(slotContext); return; }
      onKey(event, item, el);
    });
    rows.set(id, el);
    const inline = editing && slotContext ? inlineEditor(slotContext.model, slotContext.slot, id, level + 1) : undefined;
    if (inline) inline.id = `structure-inline-${id}`;
    if (!hasChildren) return inline ? [el, inline] : [el];
    el.setAttribute("aria-expanded", String(!isFolded(id)));
    const group = node("div", "page-structure__group");
    group.setAttribute("role", "group");
    group.hidden = isFolded(id);
    const childInMain = insideMain || item.tag === "main";
    if (inline) group.append(inline);
    if (attributes && slotModel) {
      const panel = node("div", "page-structure__inline"); panel.dataset.editNode = id;
      panel.style.setProperty("--depth", String(level));
      const close = () => { openAttributes = undefined; render(); rows.get(id)?.focus(); };
      panel.append(attributeControls(slotModel), iconAction("Close Attributes", "close", close));
      panel.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } });
      group.append(panel);
    }
    // Every authored child stays a real row in native source order; a known
    // slot's rows share one editor anchor at its first assigned root.
    if (slotModel) settlePending(slotModel, item.children);
    for (const child of item.children) {
      const slot = slotModel?.slots.find(slot => slot.assignedNodes.some(node => key([...node]) === key(child.node)));
      const anchor = slot && item.children.find(candidate => slot.assignedNodes.some(node => key([...node]) === key(candidate.node)))?.node;
      group.append(...row(child, level + 1, childInMain, slot && anchor && slotModel ? { model: slotModel, slot, anchor } : undefined));
    }
    if (slotModel) for (const slot of slotModel.slots) if (!slot.assignedNodes.length) group.append(...slotOnlyRow(slotModel, slot, level + 1));
    return [el, group];
  }

  function fold(item: NativeStructureItem, el: HTMLElement, closed: boolean) {
    const id = key(item.node);
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
    setSelected(key(item.node));
    rows.get(key(item.node))?.focus();
    handlers.onSelect(structure.path, item.node);
  }

  // Rows that are on show, in tree order, for the arrow keys.
  const visibleRows = () =>
    [...tree.querySelectorAll<HTMLElement>("[role='treeitem']")].filter((el) => !el.closest("[role='group'][hidden]"));

  function onKey(event: KeyboardEvent, item: NativeStructureItem, el: HTMLElement) {
    const list = visibleRows();
    const at = list.indexOf(el);
    const focusRow = (target: HTMLElement | undefined) => {
      if (!target) return;
      list.forEach((other) => { other.tabIndex = -1; });
      target.tabIndex = 0;
      target.focus();
    };
    // Alt+Up/Down requests a source move; its row keeps focus on refusal.
    if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && structure?.path) {
      const direction = event.key === "ArrowUp" ? "up" : "down";
      const last = item.node.length - 1;
      const target = [...item.node.slice(0, last), item.node[last] + (direction === "up" ? -1 : 1)];
      const outcome = handlers.onMove?.(structure.path, item, direction);
      if (outcome) {
        if (outcome !== "stayed") focusAfterRender = key(target);
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
        if (isFolded(key(item.node))) fold(item, el, false);
        else focusRow(list[at + 1]);
        break;
      case "ArrowLeft":
        if (el.hasAttribute("aria-expanded") && !isFolded(key(item.node))) fold(item, el, true);
        else focusRow(rows.get(key(item.node.slice(0, -1))));
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
    while (shown !== undefined && !rows.has(shown)) shown = shown.includes(".") ? shown.slice(0, shown.lastIndexOf(".")) : undefined;
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

  function render() {
    // The rows are about to be replaced: a drag in progress has nothing to land on.
    finishDrag(false);
    rows.clear();
    slotRows.clear();
    inMain.clear();
    const focused = focusAfterRender ?? (tree.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.node : undefined);
    const previousFocus = tree.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.slotRow : undefined;
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
    const activeField = document.activeElement instanceof HTMLInputElement && tree.contains(document.activeElement) ? document.activeElement : undefined;
    const caret = activeField ? [activeField.selectionStart, activeField.selectionEnd] : undefined;
    for (const details of tree.querySelectorAll<HTMLDetailsElement>("details[data-detail-key]")) detailOpen.set(details.dataset.detailKey!, details.open);
    renderingFields = true;
    const current = structure.paintedSource !== undefined ? handlers.pageSource?.(structure.path) : undefined;
    paintFresh = current === undefined ? undefined : current === structure.paintedSource;
    keepPending = false;
    tree.replaceChildren(...structure.items.flatMap((item) => row(item, 1)), drop);
    // An editor whose anchor went (Hide, Undo, Redo) or a Show that found
    // nothing to anchor to is forgotten, so no later render reopens it.
    // A paint proven stale proves nothing, and a pending Show waits for a fresh one.
    if (openSlot && !keepPending && paintFresh !== false && !tree.querySelector(".page-structure__inline[data-slot-editor]")) { openSlot = undefined; }
    setSelected(selected);
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
    if (focusSlotField && !keepPending) {
      const wanted = focusSlotField; focusSlotField = undefined;
      const input = [...fieldInputs].find(([id, input]) => id.startsWith(wanted.prefix) && tree.contains(input) && !input.closest("[hidden]"))?.[1]
        ?? [...fieldInputs].find(([id, input]) => id.startsWith(wanted.prefix) && tree.contains(input))?.[1];
      if (input) {
        const details = input.closest("details"); if (details) details.open = true;
        input.focus(); input.select(); return;
      }
      const owner = wanted.row !== undefined ? rowElement(wanted.row) : undefined;
      if (owner) { focusRowOnly(owner); return; }
    }
    if (focusInline) {
      const wanted = focusInline; focusInline = undefined;
      const first = tree.querySelector<HTMLElement>(`.page-structure__inline[data-edit-node="${wanted}"] input:not([type=hidden]):not([type=file])`);
      if (first) { first.closest("details")?.setAttribute("open", ""); first.focus(); return; }
    }
    if (activeField) fieldClosers.get(activeField)?.();
    if (focused && rows.has(focused)) focusRowOnly(rows.get(focused)!);
    else if (!focused && document.activeElement === document.body && previousFocus && slotRows.has(previousFocus)) slotRows.get(previousFocus)!.focus();
  }

  function focusRowOnly(el: HTMLElement) {
    for (const other of rows.values()) other.tabIndex = -1;
    el.tabIndex = 0;
    el.focus();
  }

  return {
    /** The page's elements after a render; nothing while no page is on show. */
    update(next: NativeStructure | undefined) {
      const path = next?.path ?? "";
      if (path !== structure?.path) {
        foldState.clear();
        selected = undefined; openSlot = undefined; openAttributes = undefined;
      }
      structure = next;
      const pending = pendingSelection;
      // Selection can arrive before the structure for the same render.
      // Consume it on the next named page only; unrelated navigation drops it.
      if (path && pending) {
        pendingSelection = undefined;
        if (pending.path === path) selected = key(pending.node);
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
      const id = target && structure && target.path === structure.path ? key(target.node) : undefined;
      if (id === selected) return;
      const current = setSelected(id);
      if (current) reveal(current);
      current?.scrollIntoView({ block: "nearest" });
    },
    /** The page changed under the fields: show its title and description again. */
    refreshMeta() {
      if (structure?.path) renderMeta(structure.path);
    },
    destroy() {
      for (const close of fieldClosers.values()) close();
      for (const close of uploadClosers.values()) close();
      uploadClosers.clear();
      for (const close of formClosers.values()) close();
      formClosers.clear();
      fieldClosers.clear(); fieldInputs.clear(); detailOpen.clear(); attributeForms.clear();
      endDrag();
      hint.remove();
      meta.remove();
      tree.remove();
    },
  };
}

export type PageStructure = ReturnType<typeof createPageStructure>;
