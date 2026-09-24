import { node } from "../ui/dom";
import type { NativeStructure, NativeStructureItem } from "./native-preview";
import "./page-structure.css";

// The page structure sidebar: the rendered page's own elements as a tree,
// fed by the runtime's index paths after each render. A row selects its
// element in the preview (and brings it to the middle of the frame); a
// preview selection marks its row. Rows with children fold; the folded
// state is kept per element while the same page stays on show.

export interface PageStructureHandlers {
  /** The kind and distinguishing text a row shows for an element. */
  label: (item: NativeStructureItem) => { kind: string; text: string };
  /** A row was chosen: select this element in the preview. */
  onSelect: (path: string, node: number[]) => void;
  /**
   * Alt+Up/Down on a row: move that element one sibling position. "moved" or
   * "stayed" (a section at its first or last position) for a section; nothing
   * for other elements, which do not move.
   */
  onMove?: (path: string, item: NativeStructureItem, direction: "up" | "down") => "moved" | "stayed" | undefined;
}

const HINT_NO_PAGE = "Open a page of a native project to see its sections and content here.";
const HINT_COMPONENT = "The preview shows a component by itself. Open a page to see its structure.";

const key = (node: number[]) => node.join(".");

export function createPageStructure(host: HTMLElement, handlers: PageStructureHandlers) {
  const hint = node("p", "muted sidebar-hint", HINT_NO_PAGE);
  const tree = node("div", "page-structure__tree");
  tree.setAttribute("role", "tree");
  tree.setAttribute("aria-label", "Page structure");
  tree.hidden = true;
  host.append(hint, tree);

  let structure: NativeStructure | undefined;
  let rendered = "";
  let selected: string | undefined;
  const folded = new Set<string>();
  const rows = new Map<string, HTMLElement>();
  // The row to focus once the next render shows a section that just moved.
  let focusAfterRender: string | undefined;

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
    el.addEventListener("click", (event) => {
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
        if (outcome === "moved") focusAfterRender = key(target);
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
    rows.clear();
    const focused = focusAfterRender ?? (tree.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.node : undefined);
    focusAfterRender = undefined;
    if (!structure || !structure.path) {
      hint.textContent = structure ? HINT_COMPONENT : HINT_NO_PAGE;
      hint.hidden = false;
      tree.hidden = true;
      tree.replaceChildren();
      return;
    }
    hint.hidden = true;
    tree.hidden = false;
    tree.replaceChildren(...structure.items.flatMap((item) => row(item, 1)));
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
    destroy() {
      hint.remove();
      tree.remove();
    },
  };
}

export type PageStructure = ReturnType<typeof createPageStructure>;
