// The Add panel: every section component the site has, as a live thumbnail
// rendered with the site's own CSS, grouped and searchable. It docks at the
// left of the workspace, over the page structure, opened by the top bar's
// "+ Add" (where a click inserts after the selected section, or at the end
// of <main>, and the panel stays open) or by a plus between sections (where
// a click inserts at that gap and the panel closes, like the picker it
// replaces). An item can also be dragged onto the canvas. Code is never
// hidden: the HTML an item adds shows under the list for the item under the
// pointer or focus, and under every item with "</>" pressed.

import type { InsertChoice, InsertPoint } from "../components/insert-controls";
import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { addCatalog, matchesQuery, type AddItem } from "./add-catalog";
import { positionText } from "./insert-target";
import { makeInsertDraggable, type InsertDragContext } from "./insert-drag";
import { createThumbnail, type Thumbnail } from "./thumbnail";
import "./add-panel.css";

export interface AddPanelHandlers {
  choices(): InsertChoice[];
  // The HTML adding `tag` writes, and its thumbnail document.
  preview(tag: string): { markup: string; doc: string } | undefined;
  // The canvas's width, at which thumbnails render before scaling down.
  canvasWidth(): number;
  points(): InsertPoint[];
  // Where a click inserts in docked mode: after the selection, or at the end of <main>.
  defaultPoint(): InsertPoint | undefined;
  // Component styles to read so the thumbnails look right.
  prepare(tags: string[]): void;
  insert(point: InsertPoint, choice: InsertChoice): void;
  // The canvas to drag onto.
  drag(): Omit<InsertDragContext, "drop" | "announce"> | undefined;
  // The area the panel docks in (viewport coordinates).
  dock(): { left: number; top: number; bottom: number; width: number } | undefined;
  // Opened or closed; `gap` is the key of the plus it is (or was) open for.
  onState(state: { open: boolean; gap?: string; restoreFocus: boolean }): void;
}

const CODE_KEY = "native-site-editor:add-panel-code";
/** The key a plus between sections has for its point (insert-controls.ts). */
export const insertPointKey = (point: InsertPoint) => `${point.path}|${point.parent.join(".")}|${point.index}`;
const keyOf = insertPointKey;
let panelId = 0;

export function createAddPanel(handlers: AddPanelHandlers) {
  const id = `pb-add-${++panelId}`;
  const panel = node("div", "pb-add-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", `${id}-title`);
  panel.tabIndex = -1;
  panel.hidden = true;

  const title = node("h2", "pb-add-panel__title", "Add to the page");
  title.id = `${id}-title`;
  let showCode = localStorage.getItem(CODE_KEY) === "1";
  const codeToggle = button("</>", () => setShowCode(!showCode), "pb-add-panel__code-toggle");
  codeToggle.title = "Show the HTML each section adds";
  codeToggle.setAttribute("aria-label", "Show HTML");
  const closeButton = button("", () => close(true), "pb-add-panel__close");
  closeButton.append(icon("x"));
  closeButton.setAttribute("aria-label", "Close");
  closeButton.title = "Close (Esc)";
  const head = node("div", "pb-add-panel__head");
  head.append(title, codeToggle, closeButton);
  const position = node("p", "pb-add-panel__position");
  const search = document.createElement("input");
  search.type = "search";
  search.className = "pb-add-panel__search";
  search.placeholder = "Search components";
  search.setAttribute("aria-label", "Search components");
  search.autocomplete = "off";
  const hint = node("p", "pb-add-panel__hint", "Click to add, or drag onto the page.");
  const list = node("div", "pb-add-panel__list");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Components");
  const message = node("div", "pb-add-panel__message");
  message.hidden = true;
  const body = node("div", "pb-add-panel__body");
  body.append(list, message);
  const peek = node("div", "pb-add-panel__peek");
  peek.hidden = true;
  const peekTitle = node("p", "pb-add-panel__peek-title");
  const peekCode = node("pre", "pb-add-panel__peek-code");
  peek.append(peekTitle, peekCode);
  const live = node("span", "sr-only");
  live.setAttribute("role", "status");
  panel.append(head, position, search, hint, body, peek, live);
  document.body.append(panel);

  let open = false;
  // Opened from a plus: its point's key; docked otherwise.
  let gapKey: string | undefined;
  let query = "";
  let builtFor = "";
  // The item whose HTML shows below the list: last hovered or focused.
  let active: string | undefined;
  interface Entry {
    item: AddItem;
    root: HTMLElement;
    option: HTMLButtonElement;
    code: HTMLElement;
    thumb: Thumbnail;
    markup: string;
  }
  const entries = new Map<string, Entry>();
  const groups: { root: HTMLElement; tags: string[] }[] = [];

  function setShowCode(on: boolean) {
    showCode = on;
    localStorage.setItem(CODE_KEY, on ? "1" : "0");
    codeToggle.setAttribute("aria-pressed", String(on));
    panel.classList.toggle("shows-code", on);
    for (const entry of entries.values()) entry.code.hidden = !on;
    renderPeek();
  }
  setShowCode(showCode);

  function target() {
    if (gapKey) return handlers.points().find((point) => keyOf(point) === gapKey);
    return handlers.defaultPoint();
  }

  function renderPosition() {
    const at = target();
    position.textContent = positionText(at);
    panel.classList.toggle("has-no-place", !at);
    for (const entry of entries.values()) entry.option.setAttribute("aria-disabled", String(!at));
  }

  function renderPeek() {
    const entry = active ? entries.get(active) : undefined;
    peek.hidden = showCode || !entry || entry.root.hidden;
    if (!entry) return;
    peekTitle.textContent = `${entry.item.name} adds this HTML`;
    peekCode.textContent = entry.markup;
  }

  function options() {
    return [...list.querySelectorAll<HTMLButtonElement>(".pb-add-item__option")].filter((option) => !option.closest("[hidden]"));
  }

  // The list is built once per set of components, so thumbnails are not
  // reloaded as the search changes; a search hides what does not match.
  function build() {
    const choices = handlers.choices();
    const key = choices.map((choice) => `${choice.tag}:${choice.label}`).join("|");
    if (key !== builtFor) {
      builtFor = key;
      for (const entry of entries.values()) entry.thumb.destroy();
      entries.clear();
      groups.length = 0;
      list.replaceChildren();
      for (const group of addCatalog(choices)) {
        const groupRoot = node("div", "pb-add-group");
        groupRoot.setAttribute("role", "group");
        const heading = node("h3", "pb-add-group__title", group.name);
        heading.id = `${id}-group-${groups.length}`;
        groupRoot.setAttribute("aria-labelledby", heading.id);
        groupRoot.append(heading);
        for (const item of group.items) groupRoot.append(buildItem(item));
        groups.push({ root: groupRoot, tags: group.items.map((item) => item.tag) });
        list.append(groupRoot);
      }
    }
    renderThumbnails();
    filter();
  }

  function buildItem(item: AddItem) {
    const root = node("div", "pb-add-item");
    const option = button("", () => {
      if (drag.justDragged()) return;
      choose(item.tag);
    }, "pb-add-item__option") as HTMLButtonElement;
    option.setAttribute("role", "option");
    const thumb = createThumbnail("pb-add-item__thumb");
    const label = node("span", "pb-add-item__label");
    label.append(node("span", "pb-add-item__name", item.name), node("code", "pb-add-item__tag", `<${item.tag}>`));
    option.append(thumb.root, label);
    const code = node("pre", "pb-add-item__code");
    code.id = `${id}-code-${entries.size}`;
    code.hidden = !showCode;
    option.setAttribute("aria-describedby", code.id);
    root.append(option, code);
    const drag = makeInsertDraggable(option, () => item.name, () => {
      const canvas = handlers.points().length ? handlers.drag() : undefined;
      return canvas && {
        ...canvas,
        announce: (text: string) => { live.textContent = text; },
        drop: (point: InsertPoint) => {
          if (gapKey) close(false);
          handlers.insert(point, { tag: item.tag, label: item.label });
        },
      };
    });
    const activate = () => {
      active = item.tag;
      renderPeek();
    };
    option.addEventListener("pointerenter", activate);
    option.addEventListener("focus", activate);
    entries.set(item.tag, { item, root, option, code, thumb, markup: "" });
    return root;
  }

  function renderThumbnails() {
    const width = handlers.canvasWidth();
    for (const entry of entries.values()) {
      const shown = handlers.preview(entry.item.tag);
      entry.markup = shown?.markup ?? `<${entry.item.tag}></${entry.item.tag}>`;
      entry.code.textContent = entry.markup;
      if (shown) entry.thumb.render(shown.doc, width);
    }
    renderPeek();
  }

  function filter() {
    const total = entries.size;
    let shown = 0;
    for (const entry of entries.values()) {
      entry.root.hidden = !matchesQuery(entry.item, query);
      if (!entry.root.hidden) shown++;
    }
    for (const group of groups) group.root.hidden = group.tags.every((tag) => entries.get(tag)!.root.hidden);
    search.hidden = !total;
    hint.hidden = !total;
    list.hidden = !shown;
    message.hidden = Boolean(shown);
    if (!total) {
      message.replaceChildren(node("p", "", "No components fit here yet. A component fits between sections when its template is one <section> element."));
    } else if (!shown) {
      message.replaceChildren(
        node("p", "", `No components match “${query.trim()}”. Only components that fit a section slot are listed.`),
        button("Clear search", () => {
          query = "";
          search.value = "";
          filter();
          search.focus();
        }, "pb-add-panel__clear"),
      );
    }
    renderPeek();
  }

  function choose(tag: string) {
    const entry = entries.get(tag);
    const at = target();
    if (!entry) return;
    if (!at) {
      live.textContent = "This page has no place for a section.";
      return;
    }
    const choice = { tag, label: entry.item.label };
    if (gapKey) close(false);
    handlers.insert(at, choice);
  }

  function dock() {
    const area = handlers.dock();
    if (!area) return;
    Object.assign(panel.style, {
      left: `${area.left}px`,
      top: `${area.top}px`,
      height: `${Math.max(240, area.bottom - area.top)}px`,
      width: `${Math.max(320, Math.min(380, area.width))}px`,
    });
  }

  search.addEventListener("input", () => {
    query = search.value;
    filter();
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      options()[0]?.focus();
    } else if (event.key === "Enter") {
      const shown = options();
      if (shown.length !== 1) return;
      event.preventDefault();
      shown[0].click();
    }
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const current = event.target as HTMLElement;
    if (!current.classList.contains("pb-add-item__option")) return;
    const items = options();
    const index = items.indexOf(current as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = Math.min(index + 1, items.length - 1);
    else if (event.key === "ArrowUp") next = index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Typing on an item keeps refining the search.
      event.preventDefault();
      query += event.key;
      search.value = query;
      filter();
      search.focus();
      return;
    }
    if (next === undefined) return;
    event.preventDefault();
    if (next < 0) search.focus();
    else {
      items[next]?.focus();
      items[next]?.scrollIntoView({ block: "nearest" });
    }
  });
  // Opened from a plus, the panel is a picker for that gap: it closes when
  // focus or a click goes elsewhere. Docked, it stays.
  panel.addEventListener("focusout", (event) => {
    if (!open || !gapKey) return;
    const to = event.relatedTarget as HTMLElement | null;
    if (to && (panel.contains(to) || to.closest(".insert-point.is-open"))) return;
    queueMicrotask(() => {
      if (open && gapKey && !panel.contains(document.activeElement) && !document.activeElement?.closest(".insert-point.is-open")) close(false);
    });
  });
  function onPointerDown(event: PointerEvent) {
    if (!open || !gapKey) return;
    const at = event.target as HTMLElement;
    if (panel.contains(at) || at.closest?.(".insert-point.is-open")) return;
    close(false);
  }
  document.addEventListener("pointerdown", onPointerDown, true);
  const onResize = () => { if (open) dock(); };
  window.addEventListener("resize", onResize);

  function show(gap: InsertPoint | undefined) {
    gapKey = gap ? keyOf(gap) : undefined;
    panel.classList.toggle("is-gap", Boolean(gap));
    query = "";
    search.value = "";
    active = undefined;
    if (!open) {
      open = true;
      panel.hidden = false;
      dock();
    }
    handlers.prepare(handlers.choices().map((choice) => choice.tag));
    build();
    renderPosition();
    handlers.onState({ open: true, gap: gapKey, restoreFocus: false });
    if (!search.hidden) {
      search.focus();
    } else panel.focus();
  }

  function close(restoreFocus: boolean) {
    if (!open) return;
    open = false;
    const gap = gapKey;
    gapKey = undefined;
    panel.hidden = true;
    handlers.onState({ open: false, gap, restoreFocus });
  }

  return {
    /** Docked: opened by the top bar's "+ Add". */
    openDocked() {
      show(undefined);
    },
    /** For one gap: opened by its plus. */
    openFor(point: InsertPoint) {
      show(point);
    },
    close,
    isOpen() {
      return open;
    },
    isDocked() {
      return open && !gapKey;
    },
    /** The sources changed: thumbnails and HTML again, when shown. */
    refresh() {
      if (!open) return;
      build();
      renderPosition();
    },
    /** The insert points or the selection changed: where a click inserts. */
    retarget() {
      if (!open) return;
      if (gapKey && !target()) {
        close(false);
        return;
      }
      renderPosition();
    },
    announce(text: string) {
      live.textContent = text;
    },
    destroy() {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onResize);
      for (const entry of entries.values()) entry.thumb.destroy();
      panel.remove();
    },
  };
}

export type AddPanel = ReturnType<typeof createAddPanel>;
