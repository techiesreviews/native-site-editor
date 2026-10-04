// The Add panel: every section component the site has, as a live thumbnail
// rendered with the site's own CSS, grouped and searchable. It docks at the
// left of the workspace, over the page structure, opened by the top bar's
// "+ Add" (where a click inserts after the selected section, or at the end
// of <main>, and the panel stays open) or by a plus between sections (where
// a click inserts at that gap and the panel closes, like the picker it
// replaces). An item can also be dragged onto the canvas.

import type { InsertChoice, InsertPoint } from "../components/insert-controls";
import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { addCatalog, matchesQuery, type AddItem, type AddChoice } from "./add-catalog";
import { positionText } from "./insert-target";
import { makeInsertDraggable, type InsertDragContext } from "./insert-drag";
import { createThumbnail, type Thumbnail } from "./thumbnail";
import "./add-panel.css";

// A single HTML element (a heading, a button) shows small and cropped; a plain
// HTML section shows whole at the canvas's width, like a component.
const isElement = (item: AddItem) => item.kind === "native" && item.tag.startsWith("native:");

export interface AddPanelHandlers {
  choices(): InsertChoice[];
  // Optional native choices join the same searchable catalogue. Keys must be unique.
  extraChoices?(): readonly AddChoice[];
  // Why some choices are missing (e.g. unreadable editor data), shown inline in the panel.
  notice?(): string | undefined;
  // Native/container targets can differ from section-component targets.
  pointFor?(choice: InsertChoice, fallback: InsertPoint | undefined, mode?: "click" | "drop" | "gap"): InsertPoint | undefined;
  destinationText?(point: InsertPoint | undefined): string;
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
  const closeButton = button("", () => close(true), "pb-add-panel__close");
  closeButton.append(icon("x"));
  closeButton.setAttribute("aria-label", "Close");
  closeButton.title = "Close (Esc)";
  const head = node("div", "pb-add-panel__head");
  head.append(title, closeButton);
  const position = node("p", "pb-add-panel__position");
  const search = document.createElement("input");
  search.type = "search";
  search.className = "pb-add-panel__search";
  search.placeholder = "Search components";
  search.setAttribute("aria-label", "Search components");
  search.autocomplete = "off";
  const hint = node("p", "pb-add-panel__hint", "Click to add, or drag onto the page.");
  const notice = node("p", "pb-add-panel__hint pb-add-panel__notice");
  notice.setAttribute("role", "status");
  notice.hidden = true;
  const list = node("div", "pb-add-panel__list");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Components");
  const message = node("div", "pb-add-panel__message");
  message.hidden = true;
  const body = node("div", "pb-add-panel__body");
  body.append(list, message);
  const live = node("span", "sr-only");
  live.setAttribute("role", "status");
  panel.append(head, position, search, hint, notice, body, live);
  document.body.append(panel);

  let open = false;
  // Opened from a plus: its point's key; docked otherwise.
  let gapKey: string | undefined;
  let query = "";
  let builtFor = "";
  // Hover/focus updates the insertion destination for native element choices.
  let active: string | undefined;
  let hovered: string | undefined;
  let focused: string | undefined;
  interface Entry {
    item: AddItem;
    root: HTMLElement;
    option: HTMLButtonElement;
    thumb: Thumbnail;
  }
  const entries = new Map<string, Entry>();
  const groups: { root: HTMLElement; tags: string[] }[] = [];

  function target() {
    if (gapKey) return handlers.points().find((point) => keyOf(point) === gapKey);
    return handlers.defaultPoint();
  }

  function choicePoint(choice: InsertChoice) {
    const fallback = target();
    return handlers.pointFor ? handlers.pointFor(choice, fallback, gapKey ? "gap" : "click") : fallback;
  }

  function renderPosition() {
    const entry = active ? entries.get(active) : undefined;
    const at = entry ? choicePoint(entry.item) : target();
    position.textContent = handlers.destinationText?.(at) ?? positionText(at);
    panel.classList.toggle("has-no-place", !at);
    if (entry) entry.option.setAttribute("aria-disabled", String(!at));
    if (entry && !at) position.textContent = `This destination cannot accept ${entry.item.name}.`;
  }

  function clearInactive(tag: string) {
    if (active !== tag || hovered === tag || focused === tag) return;
    active = focused ?? hovered;
    renderPosition();
  }

  function resetActive() { active = undefined; hovered = undefined; focused = undefined; }

  function refreshAvailability() {
    for (const entry of entries.values()) entry.option.setAttribute("aria-disabled", String(!choicePoint(entry.item)));
  }

  function refuse(item: AddItem) {
    entries.get(item.tag)?.option.setAttribute("aria-disabled", "true");
    const text = `This destination cannot accept ${item.name}.`;
    position.textContent = text; live.textContent = text;
    panel.classList.add("has-no-place");
  }

  function options() {
    return [...list.querySelectorAll<HTMLButtonElement>(".pb-add-item__option")].filter((option) => !option.closest("[hidden]"));
  }

  // The list is built once per set of components, so thumbnails are not
  // reloaded as the search changes; a search hides what does not match.
  function build() {
    const choices = [...handlers.choices(), ...(handlers.extraChoices?.() ?? [])];
    const hasNative = choices.some((choice) => "kind" in choice && choice.kind === "native");
    search.placeholder = hasNative ? "Search elements and components" : "Search components";
    search.setAttribute("aria-label", search.placeholder);
    list.setAttribute("aria-label", hasNative ? "Elements and components" : "Components");
    const key = choices.map((choice) => `${choice.tag}:${choice.label}:${"group" in choice ? choice.group : ""}`).join("|");
    if (key !== builtFor) {
      builtFor = key;
      resetActive();
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
    refreshAvailability();
    filter();
  }

  function buildItem(item: AddItem) {
    const root = node("div", "pb-add-item");
    const option = button("", () => {
      if (drag.justDragged()) return;
      choose(item.tag);
    }, "pb-add-item__option") as HTMLButtonElement;
    option.setAttribute("role", "option");
    const thumb = createThumbnail("pb-add-item__thumb", isElement(item) ? 0.45 : undefined, isElement(item) ? 320 : 640);
    if (item.tag === "native:image") {
      const fallback = node("span", "pb-add-item__image-fallback");
      fallback.innerHTML = '<svg viewBox="0 0 48 40" fill="none" aria-hidden="true"><rect x="2" y="2" width="44" height="36" rx="3"/><circle cx="15" cy="13" r="4"/><path d="m3 32 12-12 8 8 9-13 13 17"/></svg>';
      thumb.root.append(fallback);
      const frame = thumb.root.querySelector("iframe")!;
      frame.addEventListener("load", () => {
        const image = frame.contentDocument?.querySelector("img");
        fallback.hidden = Boolean(image?.naturalWidth);
        thumb.root.classList.toggle("has-image-fallback", !fallback.hidden);
      });
      thumb.root.classList.add("has-image-fallback");
    }
    const label = node("span", "pb-add-item__label");
    label.append(node("span", "pb-add-item__name", item.name), node("code", "pb-add-item__tag", item.kind === "native" ? "HTML" : `<${item.tag}>`));
    option.append(thumb.root, label);
    root.append(option);
    const drag = makeInsertDraggable(option, () => item.name, () => {
      const canvas = handlers.points().length ? handlers.drag() : undefined;
      return canvas && {
        ...canvas,
        announce: (text: string) => { live.textContent = text; },
        drop: (point: InsertPoint) => {
          const at = handlers.pointFor ? handlers.pointFor(item, point, "drop") : point;
          if (!at) { refuse(item); return; }
          if (gapKey) close(false);
          handlers.insert(at, { tag: item.tag, label: item.label });
        },
      };
    });
    const activate = () => {
      active = item.tag;
      renderPosition();
    };
    option.addEventListener("pointerenter", () => { hovered = item.tag; activate(); });
    option.addEventListener("focus", () => { focused = item.tag; activate(); });
    option.addEventListener("pointerleave", () => { if (hovered === item.tag) hovered = undefined; clearInactive(item.tag); });
    option.addEventListener("blur", () => { if (focused === item.tag) focused = undefined; clearInactive(item.tag); });
    entries.set(item.tag, { item, root, option, thumb });
    return root;
  }

  function renderThumbnails() {
    const width = handlers.canvasWidth();
    for (const entry of entries.values()) {
      const shown = handlers.preview(entry.item.tag);
      if (shown) entry.thumb.render(shown.doc, isElement(entry.item) ? 320 : width);
    }
  }

  function filter() {
    const total = entries.size;
    let shown = 0;
    for (const entry of entries.values()) {
      entry.root.hidden = !matchesQuery(entry.item, query);
      if (!entry.root.hidden) shown++;
    }
    for (const tag of [hovered, focused]) {
      if (!tag || !entries.get(tag)?.root.hidden) continue;
      if (hovered === tag) hovered = undefined;
      if (focused === tag) focused = undefined;
    }
    if (active && (!entries.has(active) || entries.get(active)!.root.hidden)) {
      active = focused ?? hovered;
      renderPosition();
    }
    for (const group of groups) group.root.hidden = group.tags.every((tag) => entries.get(tag)!.root.hidden);
    search.hidden = !total;
    hint.hidden = !total;
    const why = handlers.notice?.();
    notice.hidden = !why;
    if (notice.textContent !== (why ?? "")) notice.textContent = why ?? "";
    list.hidden = !shown;
    message.hidden = Boolean(shown);
    if (!total) {
      message.replaceChildren(node("p", "", "No components fit here yet. A component fits between sections when its template is one <section> element."));
    } else if (!shown) {
      message.replaceChildren(
        node("p", "", `No items match “${query.trim()}”.`),
        button("Clear search", () => {
          query = "";
          search.value = "";
          filter();
          search.focus();
        }, "pb-add-panel__clear"),
      );
    }
  }

  function choose(tag: string) {
    const entry = entries.get(tag);
    const at = entry ? choicePoint(entry.item) : undefined;
    if (!entry) return;
    if (!at) {
      entry.option.setAttribute("aria-disabled", "true");
      refuse(entry.item);
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
    resetActive();
    gapKey = gap ? keyOf(gap) : undefined;
    panel.classList.toggle("is-gap", Boolean(gap));
    query = "";
    search.value = "";
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
    resetActive();
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
    /** The sources changed: thumbnails again, when shown. */
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
      refreshAvailability();
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
