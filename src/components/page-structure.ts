import { node } from "../ui/dom";
import type { NativeStructure, NativeStructureItem } from "./native-preview";
import "./page-structure.css";

// The page structure sidebar: the rendered page's own elements as a tree,
// fed by the runtime's index paths after each render. A row selects its
// element in the preview (and brings it to the middle of the frame); a
// preview selection marks its row. Rows with children fold; the folded
// state is kept per element while the same page stays on show. Above the
// tree, a Page block holds the route's title and description from the
// manifest; they apply as typed. A section row can be dragged with the
// pointer onto another gap among its siblings (7 px of movement starts the
// drag, so a plain press still selects); only the rows sharing its parent
// take the drop.

export type PageMetaField = "title" | "description";

export interface PageStructureHandlers {
  /**
   * The manifest's title and description for the page at `path`, empty
   * strings when the route is a bare path; nothing when the file is not a
   * route of the site (the fields then stay out of the sidebar). A `notice`
   * closes the fields and says why (the manifest changed on GitHub under a
   * draft).
   */
  pageMeta?: (path: string) => { title: string; description: string; notice?: string } | undefined;
  /** A page field changed: write `value` (empty removes the field) to the manifest. */
  onPageMeta?: (path: string, field: PageMetaField, value: string) => void;
  /** A page field closed (Enter, Escape or focus loss): its edits are one step. */
  onPageMetaClose?: (path: string, field: PageMetaField) => void;
  /** The kind and distinguishing text a row shows for an element. */
  label: (item: NativeStructureItem) => { kind: string; text: string };
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
    meta.append(wrap);
  }
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
  host.append(hint, meta, tree);

  // The Page fields for the page on show; a field being typed in keeps its text.
  function renderMeta(path: string) {
    const current = handlers.pageMeta?.(path);
    meta.hidden = !current;
    if (!current) return;
    for (const field of ["title", "description"] as const) {
      if (document.activeElement !== fields[field] || current.notice) fields[field].value = current[field];
      fields[field].disabled = Boolean(current.notice);
    }
    metaNotice.textContent = current.notice ?? "";
    metaNotice.hidden = !current.notice;
  }

  let structure: NativeStructure | undefined;
  let rendered = "";
  let selected: string | undefined;
  const folded = new Set<string>();
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

  function row(item: NativeStructureItem, level: number): HTMLElement[] {
    const id = key(item.node);
    const el = node("div", "page-structure__row");
    el.setAttribute("role", "treeitem");
    el.setAttribute("aria-level", String(level));
    el.setAttribute("aria-selected", String(id === selected));
    el.dataset.node = id;
    el.tabIndex = -1;
    el.style.setProperty("--depth", String(level - 1));
    const toggle = node("span", "page-structure__toggle");
    toggle.setAttribute("aria-hidden", "true");
    const { kind, text } = handlers.label(item);
    const label = node("span", "page-structure__label");
    label.append(node("span", "page-structure__kind", kind));
    if (text) label.append(" ", node("span", "page-structure__text", text));
    el.append(toggle, label);
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
      if (event.target === toggle && item.children.length) {
        fold(item, el, !folded.has(id));
        return;
      }
      choose(item);
    });
    el.addEventListener("keydown", (event) => onKey(event, item, el));
    rows.set(id, el);
    if (!item.children.length) return [el];
    el.setAttribute("aria-expanded", String(!folded.has(id)));
    const group = node("div", "page-structure__group");
    group.setAttribute("role", "group");
    group.hidden = folded.has(id);
    group.append(...item.children.flatMap((child) => row(child, level + 1)));
    return [el, group];
  }

  function fold(item: NativeStructureItem, el: HTMLElement, closed: boolean) {
    const id = key(item.node);
    if (closed) folded.add(id);
    else folded.delete(id);
    el.setAttribute("aria-expanded", String(!closed));
    const group = el.nextElementSibling;
    if (group instanceof HTMLElement && group.getAttribute("role") === "group") group.hidden = closed;
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
        if (!item.children.length) return;
        if (folded.has(key(item.node))) fold(item, el, false);
        else focusRow(list[at + 1]);
        break;
      case "ArrowLeft":
        if (item.children.length && !folded.has(key(item.node))) fold(item, el, true);
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
    let current: HTMLElement | undefined;
    for (const [rowId, el] of rows) {
      const on = rowId === id;
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
    const focused = focusAfterRender ?? (tree.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.node : undefined);
    focusAfterRender = undefined;
    if (!structure || !structure.path) {
      hint.textContent = structure ? HINT_COMPONENT : HINT_NO_PAGE;
      hint.hidden = false;
      meta.hidden = true;
      tree.hidden = true;
      tree.replaceChildren();
      return;
    }
    hint.hidden = true;
    renderMeta(structure.path);
    tree.hidden = false;
    tree.replaceChildren(...structure.items.flatMap((item) => row(item, 1)), drop);
    setSelected(selected);
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
        folded.clear();
        selected = undefined;
      }
      structure = next;
      const signature = next ? `${next.path}\n${JSON.stringify(next.items)}` : "";
      if (signature === rendered && !tree.hidden === Boolean(next?.path)) return;
      rendered = signature;
      render();
    },
    /** Mark the row of the element selected in the preview, and show it. */
    select(target: { path: string; node: number[] } | undefined) {
      const id = target && structure && target.path === structure.path ? key(target.node) : undefined;
      if (id === selected) return;
      const current = setSelected(id);
      current?.scrollIntoView({ block: "nearest" });
    },
    /** The manifest changed under the fields: show its title and description again. */
    refreshMeta() {
      if (structure?.path) renderMeta(structure.path);
    },
    destroy() {
      endDrag();
      hint.remove();
      meta.remove();
      tree.remove();
    },
  };
}

export type PageStructure = ReturnType<typeof createPageStructure>;
