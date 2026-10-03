import { button, node } from "../ui/dom";
import type { NativeStructure, NativeStructureItem } from "./native-preview";
import { createUrlChange, type UrlPlan } from "./url-change";
import { componentIcon } from "../page-builder/component-icon";
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
  /** Open all page details; the sidebar then shows only a compact summary. */
  /** Source-guarded instance fields; synthetic slot rows never identify DOM nodes. */
  componentSlots?: (path: string, node: readonly number[]) => ComponentStructureModel | undefined;
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
   * "stayed" (a section at its first or last position) or "pending" (the
   * page file is opening first; the move follows) for a section; nothing
   * for other elements, which do not move.
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
    const outcome = handlers.onMoveTo?.(structure.path, current.item, current.target);
    if (outcome === "moved") {
      const from = current.item.node[current.item.node.length - 1];
      focusAfterRender = key([...current.item.node.slice(0, -1), current.target > from ? current.target - 1 : current.target]);
    } else if (!outcome) handlers.announce?.("Section drag cancelled");
  }

  function pressRow(event: PointerEvent, item: NativeStructureItem, el: HTMLElement) {
    suppressClick = false;
    if (event.button !== 0 || drag || !structure?.path || !handlers.canDrag?.(item)) return;
    if ((event.target as HTMLElement).classList.contains("page-structure__toggle")) return;
    const parentKey = key(item.node.slice(0, -1));
    const parentRow = rows.get(parentKey);
    const group = parentRow ? parentRow.nextElementSibling : tree;
    if (!(group instanceof HTMLElement)) return;
    const siblings = [...group.children].filter((child): child is HTMLElement => child instanceof HTMLElement && child.getAttribute("role") === "treeitem");
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
  const detailOpen = new Map<string, boolean>();
  const attributeForms = new Map<string, HTMLFormElement>();
  const formClosers = new Map<HTMLFormElement, () => void>();
  function cleanControls() {
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
      input.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); input.blur(); } });
      fieldInputs.set(id, input);
    }
    input.setAttribute("aria-label", accessible);
    const wrap = node("label", "page-structure__slot-field"); wrap.append(node("span", "", label), input); return wrap;
  }
  function attributeControls(model: ComponentStructureModel) {
    const id = `${model.host.path}:${key([...model.host.node])}:attributes`;
    const details = document.createElement("details"); details.className = "page-structure__attributes";
    details.dataset.detailKey = id; details.open = detailOpen.get(id) ?? false;
    details.addEventListener("toggle", () => detailOpen.set(id, details.open));
    const summary = document.createElement("summary"); summary.textContent = "Attributes"; details.append(summary);
    for (const attribute of model.attributes) {
      const row = node("div", "page-structure__attribute");
      row.append(guardedField(`${id}:${attribute.name}`, attribute.name, `Attribute: ${attribute.name}`, attribute.value, () => model.openAttribute(attribute.name)),
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
        const result = origin?.add(name.value, value.value);
        if (!result || "error" in result) {
          problem.textContent = result && "error" in result ? result.error : "The instance changed; reopen Attributes before adding it.";
          problem.hidden = false; return;
        }
        name.value = value.value = ""; origin?.close(); origin = undefined; problem.hidden = true;
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

  function slotControls(model: ComponentStructureModel, level: number) {
    const result: HTMLElement[] = [];

    for (const slot of model.slots) {
      const block = node("div", "page-structure__slot");
      block.style.setProperty("--depth", String(level - 1));
      block.dataset.slotName = slot.name;
      const header = node("div", "page-structure__slot-head");
      const select = button(slot.label, () => model.selectSlot(slot.name), "page-structure__slot-name");
      header.append(select);
      if (slot.whenEmpty === "hidden") {
        const visible = document.createElement("input"); visible.type = "checkbox"; visible.checked = slot.filled;
        visible.setAttribute("aria-label", `Show ${slot.label}`);
        visible.addEventListener("change", () => { if (!model.setVisible(slot.name, visible.checked)) visible.checked = slot.filled; });
        header.append(visible);
      } else if (slot.filled) header.append(button("Reset", () => model.setVisible(slot.name, false), "text-button"));
      block.append(header);
      function field(part: ComponentSlotPart, label: string, value: string) {
        const id = `${model.host.path}:${key([...model.host.node])}:${slot.name}:${part}`;
        return guardedField(id, label, `${slot.label}: ${label}`, value, () => model.openField(slot.name, part));
      }
      if (slot.kind === "text" && slot.value.editable) block.append(field("text", "Text", slot.value.text));
      else if (slot.kind === "image" || slot.kind === "link") {
        const details = document.createElement("details");
        const detailKey = `${model.host.path}:${key([...model.host.node])}:${slot.name}`;
        details.dataset.detailKey = detailKey;
        details.open = detailOpen.get(detailKey) ?? false;
        details.addEventListener("toggle", () => detailOpen.set(detailKey, details.open));
        const summary = document.createElement("summary"); summary.textContent = slot.kind === "image" ? "Image" : "Link";
        details.append(summary);
        if (slot.kind === "image") details.append(field("src", "Image", slot.value.src ?? ""), field("alt", "Alt text", slot.value.alt ?? ""));
        else {
          if (slot.value.editable) details.append(field("text", "Button text", slot.value.text));
          else details.append(node("span", "page-structure__slot-summary", "Content: select the page element to edit its text"));
          details.append(field("href", "Link / URL", slot.value.href ?? ""));
        }
        if (details.contains(document.activeElement)) details.open = true;
        block.append(details);
      } else block.append(node("span", "page-structure__slot-summary", `Content${slot.value.text ? `: ${slot.value.text}` : ""}`));
      result.push(block);
    }
    result.push(attributeControls(model));
    return result;
  }

  function row(item: NativeStructureItem, level: number, insideMain = false): HTMLElement[] {
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
    const { kind, text, component } = handlers.label(item);
    const slotModel = structure?.path ? handlers.componentSlots?.(structure.path, item.node) : undefined;
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
      const actions = node("div", "page-structure__component-actions");
      const edit = button("Edit", slotModel.edit, "text-button"); edit.title = "Edit component"; edit.setAttribute("aria-label", "Edit component");
      const disconnect = button("Disconnect", slotModel.disconnect, "text-button"); disconnect.title = "Disconnect this instance"; disconnect.setAttribute("aria-label", "Disconnect this instance");
      actions.append(edit, disconnect);
      for (const type of ["pointerdown", "click", "keydown"]) actions.addEventListener(type, event => event.stopPropagation());
      el.append(actions);
    }
    // What the page slots into an instance names its slot (drawn by CSS, so the row's name stays its own).
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
    el.addEventListener("keydown", (event) => onKey(event, item, el));
    rows.set(id, el);
    if (!hasChildren) return [el];
    el.setAttribute("aria-expanded", String(!isFolded(id)));
    const group = node("div", "page-structure__group");
    group.setAttribute("role", "group");
    group.hidden = isFolded(id);
    const childInMain = insideMain || item.tag === "main";
    const assigned = new Set(slotModel?.slots.flatMap(slot => slot.assignedNodes.map(node => key([...node]))) ?? []);
    if (slotModel) group.append(...slotControls(slotModel, level + 1));
    group.append(...item.children.filter(child => !assigned.has(key(child.node))).flatMap((child) => row(child, level + 1, childInMain)));
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
    // Alt+Up/Down moves a section in the page; its row keeps focus. Other
    // elements do not move and the keys keep walking the rows.
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
    inMain.clear();
    const focused = focusAfterRender ?? (tree.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.node : undefined);
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
    tree.replaceChildren(...structure.items.flatMap((item) => row(item, 1)), drop);
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
    if (activeField) fieldClosers.get(activeField)?.();
    if (focused && rows.has(focused)) {
      for (const el of rows.values()) el.tabIndex = -1;
      const el = rows.get(focused)!;
      el.tabIndex = 0;
      el.focus();
    }
  }

  return {
    /** The page's elements after a render; nothing while no page is on show. */
    update(next: NativeStructure | undefined) {
      const path = next?.path ?? "";
      if (path !== structure?.path) {
        foldState.clear();
        selected = undefined;
      }
      structure = next;
      const pending = pendingSelection;
      // Selection can arrive before the structure for the same render.
      // Consume it on the next named page only; unrelated navigation drops it.
      if (path && pending) {
        pendingSelection = undefined;
        if (pending.path === path) selected = key(pending.node);
      }
      const signature = next ? `${next.path}\n${JSON.stringify(next.items)}` : "";
      if (!handlers.componentSlots && signature === rendered && !tree.hidden === Boolean(next?.path)) return;
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
