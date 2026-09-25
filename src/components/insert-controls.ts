import { node, button } from "../ui/dom";
import "./insert-controls.css";

// Plus buttons between page sections (and between the items inside a
// section) and the picker they open. The preview runtime reports each place
// something can go (the gaps between the children of a page element that
// holds sections, and of a plain section); the buttons sit over the frame on
// those gaps, shown only just above and below the item under the pointer
// (or while focused or open). While a section is dragged in the preview,
// every gap of its parent shows instead, the one under the pointer expanded
// and labelled "Drop section here". The picker lists what fits the point
// (section components between sections; atoms and the other components
// inside a section) and follows the User Editor INSERT contract: title,
// exact position, search, arrow keys, Enter, Escape back to the plus.

export interface InsertPoint {
  // Page file the point belongs to.
  path: string;
  // Element-child indexes of the containing element from the page root.
  parent: number[];
  // Position among that element's element children.
  index: number;
  // Frame-viewport geometry of the gap.
  top: number;
  left: number;
  width: number;
  // Label of the item the insertion goes before; empty at the end.
  before: string;
  // A gap between page sections, or between the items inside a section.
  kind: "page" | "section";
  // The section's heading text for a section gap; empty when it has none.
  container: string;
}

export interface InsertChoice {
  // A component's tag, or the atom's kind (heading, text, button, image).
  tag: string;
  label: string;
  // Shown in place of the tag: the placeholder an atom starts with.
  description?: string;
}

interface InsertHandlers {
  choices(point: InsertPoint): InsertChoice[];
  onInsert(point: InsertPoint, choice: InsertChoice): void;
}

const keyOf = (point: InsertPoint) => `${point.path}|${point.parent.join(".")}|${point.index}`;

// A plus drawn as two bars, so it sits in the exact centre of its circle
// whatever the font's glyph metrics.
function plusIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M6 1v10M1 6h10");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.75");
  path.setAttribute("stroke-linecap", "round");
  svg.append(path);
  return svg;
}

export function createInsertControls(pane: HTMLElement, frame: HTMLElement, handlers: InsertHandlers) {
  const layer = node("div", "insert-layer");
  const picker = node("div", "insert-picker");
  picker.setAttribute("role", "dialog");
  picker.tabIndex = -1;
  picker.hidden = true;
  pane.append(layer, picker);

  let points: InsertPoint[] = [];
  const plusByKey = new Map<string, HTMLElement>();
  let openKey: string | undefined;
  let query = "";
  // The hovered item in the preview: its container's path and its index there.
  let near: { parent: string; index: number } | undefined;
  let pointerOnPlus = false;
  let leaveTimer = 0;
  // A section being dragged in the preview: its parent's gaps are the targets.
  let drag: { parent: string; index: number | undefined } | undefined;

  function geometry() {
    const frameRect = frame.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    return { frameRect, left: frameRect.left - paneRect.left, top: frameRect.top - paneRect.top };
  }

  function layout() {
    const { frameRect, left, top } = geometry();
    Object.assign(layer.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${frameRect.width}px`,
      height: `${frameRect.height}px`,
    });
    layer.classList.toggle("is-dragging", Boolean(drag));
    const seen = new Set<string>();
    for (const point of points) {
      const key = keyOf(point);
      seen.add(key);
      let row = plusByKey.get(key);
      if (!row) {
        row = node("div", "insert-point");
        row.append(node("span", "insert-point__line"));
        const plus = button("", () => toggle(key), "insert-point__plus");
        plus.append(plusIcon());
        // Moving from the preview onto a plus keeps the pair shown.
        plus.addEventListener("pointerenter", () => {
          pointerOnPlus = true;
          clearTimeout(leaveTimer);
        });
        plus.addEventListener("pointerleave", () => {
          pointerOnPlus = false;
          scheduleLeave();
        });
        plus.setAttribute("aria-haspopup", "dialog");
        plus.setAttribute("aria-expanded", "false");
        row.append(plus, node("span", "insert-point__drop", "Drop section here"));
        plusByKey.set(key, row);
        layer.append(row);
      }
      const plus = row.querySelector<HTMLButtonElement>(".insert-point__plus")!;
      const where = point.before ? `before “${point.before}”` : "at the end";
      const name = point.kind === "section"
        ? `Add to ${point.container || "the section"} ${where}`
        : `Add a section ${where}`;
      plus.setAttribute("aria-label", name);
      plus.title = name;
      row.hidden = point.top < 0 || point.top > frameRect.height;
      row.classList.toggle("is-near", Boolean(near && near.parent === point.parent.join(".") &&
        (point.index === near.index || point.index === near.index + 1)));
      const inDrag = Boolean(drag && drag.parent === point.parent.join("."));
      row.classList.toggle("is-drag", inDrag);
      row.classList.toggle("is-target", inDrag && point.index === drag!.index);
      Object.assign(row.style, { left: `${point.left}px`, top: `${point.top}px`, width: `${point.width}px` });
    }
    for (const [key, row] of plusByKey) {
      if (seen.has(key)) continue;
      row.remove();
      plusByKey.delete(key);
    }
    if (openKey && !plusByKey.has(openKey)) close(false);
    else if (openKey) placePicker();
  }
  const resize = new ResizeObserver(() => layout());
  resize.observe(frame);
  resize.observe(pane);

  function placePicker() {
    const row = openKey ? plusByKey.get(openKey) : undefined;
    if (!row) return;
    const { frameRect, left, top } = geometry();
    const plus = row.querySelector<HTMLElement>(".insert-point__plus")!;
    const anchor = plus.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const width = Math.min(320, frameRect.width - 24);
    picker.style.width = `${width}px`;
    const height = picker.offsetHeight;
    const anchorTop = anchor.top - paneRect.top;
    const anchorBottom = anchor.bottom - paneRect.top;
    const below = anchorBottom + 6;
    const above = anchorTop - 6 - height;
    const fitsBelow = below + height <= top + frameRect.height - 12;
    const y = fitsBelow || above < top + 12 ? Math.min(below, top + frameRect.height - 12 - height) : above;
    const x = anchor.left - paneRect.left + anchor.width / 2 - width / 2;
    picker.style.top = `${Math.max(top + 12, y)}px`;
    picker.style.left = `${Math.max(left + 12, Math.min(x, left + frameRect.width - 12 - width))}px`;
  }

  function scheduleLeave() {
    clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      if (pointerOnPlus) return;
      near = undefined;
      layout();
    }, 300);
  }

  function point() {
    return points.find((item) => keyOf(item) === openKey);
  }

  function options() {
    return [...picker.querySelectorAll<HTMLButtonElement>(".insert-picker__option")];
  }

  function renderPicker(focusSearch: boolean) {
    const at = point();
    if (!at) return;
    const all = handlers.choices(at);
    const needle = query.trim().toLowerCase();
    const matches = all.filter((choice) => !needle ||
      choice.label.toLowerCase().includes(needle) || choice.tag.includes(needle) ||
      choice.description?.toLowerCase().includes(needle));
    const inSection = at.kind === "section";
    const title = node("h2", "insert-picker__title", inSection ? `Add to ${at.container || "the section"}` : "Add to the page");
    title.id = "insert-picker-title";
    picker.setAttribute("aria-labelledby", title.id);
    const position = node("p", "insert-picker__position", at.before ? `Goes before “${at.before}”` : "Goes at the end");
    const scope = node("p", "insert-picker__scope", inSection
      ? "Headings, text, buttons, images and components that fit inside a section."
      : "A new section, or components whose template is a single section.");
    const children: HTMLElement[] = [title, position];
    const search = document.createElement("input");
    search.type = "search";
    search.className = "insert-picker__search";
    search.placeholder = "Search components";
    search.setAttribute("aria-label", "Search components");
    search.value = query;
    search.addEventListener("input", () => {
      query = search.value;
      renderPicker(true);
    });
    search.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        options()[0]?.focus();
      } else if (event.key === "Enter" && matches.length === 1) {
        event.preventDefault();
        choose(matches[0]);
      }
    });
    children.push(search, scope);
    if (!matches.length) {
      const empty = node("div", "insert-picker__empty");
      empty.append(
        node("p", "", inSection
          ? `Nothing matches “${query.trim()}”. Only what fits inside a section is listed.`
          : `Nothing matches “${query.trim()}”. Only a section and components that fit between sections are listed.`),
        button("Clear search", () => {
          query = "";
          renderPicker(true);
        }, "insert-picker__clear"),
      );
      children.push(empty);
    } else {
      const list = node("div", "insert-picker__list");
      list.setAttribute("role", "listbox");
      list.setAttribute("aria-label", "Components");
      for (const choice of matches) {
        const option = button("", () => choose(choice), "insert-picker__option");
        option.setAttribute("role", "option");
        option.append(
          node("span", "insert-picker__name", choice.label),
          choice.description ? node("span", "insert-picker__tag", choice.description) : node("code", "insert-picker__tag", `<${choice.tag}>`),
        );
        list.append(option);
      }
      children.push(list);
    }
    picker.replaceChildren(...children);
    if (focusSearch) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
  }

  picker.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const target = event.target as HTMLElement;
    if (!target.classList.contains("insert-picker__option")) return;
    const items = options();
    const index = items.indexOf(target as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = Math.min(index + 1, items.length - 1);
    else if (event.key === "ArrowUp") next = index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Typing on an option keeps refining the search.
      event.preventDefault();
      query += event.key;
      renderPicker(true);
      return;
    }
    if (next === undefined) return;
    event.preventDefault();
    if (next < 0) picker.querySelector<HTMLInputElement>(".insert-picker__search")?.focus();
    else items[next]?.focus();
  });
  picker.addEventListener("focusout", (event) => {
    const to = event.relatedTarget as Node | null;
    if (to && (picker.contains(to) || plusByKey.get(openKey ?? "")?.contains(to))) return;
    // Re-rendering the list moves focus inside the picker without a target.
    queueMicrotask(() => {
      if (!picker.contains(document.activeElement)) close(false);
    });
  });
  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node;
    if (!openKey || picker.contains(target) || plusByKey.get(openKey)?.contains(target)) return;
    close(false);
  }
  document.addEventListener("pointerdown", onPointerDown, true);

  function toggle(key: string) {
    if (openKey === key) {
      close(true);
      return;
    }
    close(false);
    openKey = key;
    query = "";
    const row = plusByKey.get(key);
    row?.classList.add("is-open");
    row?.querySelector(".insert-point__plus")?.setAttribute("aria-expanded", "true");
    picker.hidden = false;
    renderPicker(true);
    placePicker();
    if (!picker.contains(document.activeElement)) picker.focus();
  }

  function close(restoreFocus: boolean) {
    const row = openKey ? plusByKey.get(openKey) : undefined;
    openKey = undefined;
    picker.hidden = true;
    picker.replaceChildren();
    row?.classList.remove("is-open");
    const plus = row?.querySelector<HTMLElement>(".insert-point__plus");
    plus?.setAttribute("aria-expanded", "false");
    if (restoreFocus) plus?.focus();
  }

  function choose(choice: InsertChoice) {
    const at = point();
    close(false);
    if (at) handlers.onInsert(at, choice);
  }

  return {
    /** The runtime reported where things can go on the current page. */
    update(next: InsertPoint[]) {
      points = next;
      layout();
    },
    /** The item under the pointer in the preview, or none. */
    hover(item: { parent: number[]; index: number } | undefined) {
      if (!item) {
        scheduleLeave();
        return;
      }
      clearTimeout(leaveTimer);
      near = { parent: item.parent.join("."), index: item.index };
      layout();
    },
    /** A section drag began in the preview: show its parent's gaps, no plus buttons. */
    dragStart(gap: { parent: number[]; index: number }) {
      close(false);
      clearTimeout(leaveTimer);
      near = undefined;
      drag = { parent: gap.parent.join("."), index: undefined };
      layout();
    },
    /** The gap under the dragged section changed. */
    dragTarget(gap: { parent: number[]; index: number }) {
      if (!drag) return;
      drag = { parent: gap.parent.join("."), index: gap.index };
      layout();
    },
    /** The drag ended (dropped or cancelled): back to plus buttons. */
    dragEnd() {
      if (!drag) return;
      drag = undefined;
      layout();
    },
    clear() {
      close(false);
      near = undefined;
      drag = undefined;
      points = [];
      layout();
    },
    destroy() {
      clearTimeout(leaveTimer);
      resize.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      layer.remove();
      picker.remove();
    },
  };
}

export type InsertControls = ReturnType<typeof createInsertControls>;
