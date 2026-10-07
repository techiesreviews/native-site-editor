import "./field-suggestions.css";
import { suggestionLines, suggestionSiteName, type FieldSuggestion } from "./suggestion-rows";

// A text field's suggestion list (a URL's pages, an image's files), anchored
// to the field itself: directly under it, or above it when there is no room
// below; left-aligned with it and at least as wide. It lives in the top layer
// (a manual popover), so no sidebar or panel clips it, and it follows the
// field through any scroll or resize. Focus never leaves the field: the
// active option is announced with aria-activedescendant, and a press on an
// option keeps focus where it is. The browser's own datalist placed its list
// against the wrong box when the field sat in the Structure sidebar.
//
// Keys, handled before the field's own (capture): ArrowDown opens the list or
// moves down; ArrowUp moves up; Enter picks the highlighted option (with none
// highlighted the list closes and the field's Enter goes on); Escape closes
// the list first; Tab closes it. Typing filters it.

export type { FieldSuggestion } from "./suggestion-rows";

export interface FieldSuggestions {
  /** New entries for the same field (a render handed it fresh suggestions). */
  update(entries: readonly FieldSuggestion[]): void;
  /** Whether the list is on show. */
  readonly open: boolean;
  close(): void;
  destroy(): void;
}

const GAP = 4;
const MARGIN = 8;
const WIDEST = 360;
let lists = 0;
const attached = new WeakMap<HTMLInputElement, FieldSuggestions>();

/** The field's suggestions; attaching to a field that has them already updates their entries. */
export function attachFieldSuggestions(input: HTMLInputElement, entries: readonly FieldSuggestion[], label: string): FieldSuggestions {
  const existing = attached.get(input);
  if (existing) { existing.update(entries); return existing; }
  let all = [...entries];
  let shown: FieldSuggestion[] = [];
  let active = -1;
  let opened = false;
  // The value the field held when it was focused: until it changes, every suggestion shows.
  let start = input.value;

  const list = document.createElement("div");
  list.className = "field-suggestions";
  list.id = `field-suggestions-${++lists}`;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", label);
  list.setAttribute("popover", "manual");
  list.tabIndex = -1;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", list.id);
  input.autocomplete = "off";
  input.removeAttribute("list");

  // The site's name, when most titles end in it (" · Techies Reviews"): it is
  // dropped from each title it ends, unless it is all the title says.
  let siteName = suggestionSiteName(all);
  function matches() {
    const typed = input.value === start ? "" : input.value.trim().toLowerCase();
    const seen = new Set<string>();
    return all.filter(entry => (!typed || entry.value.toLowerCase().includes(typed) || entry.label?.toLowerCase().includes(typed))
      && !seen.has(entry.value) && Boolean(seen.add(entry.value)));
  }
  function render() {
    shown = matches();
    list.replaceChildren(...shown.map((entry, index) => {
      const option = document.createElement("div");
      option.className = "field-suggestions__option";
      option.id = `${list.id}-${index}`;
      option.setAttribute("role", "option");
      option.dataset.value = entry.value;
      option.setAttribute("aria-selected", String(index === active));
      // Two lines: the page's title on top, its address under it. An entry
      // with no title of its own (an image's path) is its address alone.
      const lines = suggestionLines(entry, siteName);
      option.append(...lines);
      if (lines.length > 1) option.title = `${lines[0].textContent}\n${entry.value}`;
      return option;
    }));
    if (active >= 0) input.setAttribute("aria-activedescendant", `${list.id}-${active}`);
    else input.removeAttribute("aria-activedescendant");
  }
  function show() {
    render();
    if (!shown.length) { close(); return; }
    if (!list.isConnected) document.body.append(list);
    if (!opened) {
      opened = true;
      list.showPopover?.();
      input.setAttribute("aria-expanded", "true");
      window.addEventListener("scroll", place, true);
      window.addEventListener("resize", place);
      fieldSize.observe(input);
    }
    place();
  }
  function close() {
    active = -1;
    input.removeAttribute("aria-activedescendant");
    if (!opened) return;
    opened = false;
    input.setAttribute("aria-expanded", "false");
    window.removeEventListener("scroll", place, true);
    window.removeEventListener("resize", place);
    fieldSize.disconnect();
    if (list.matches(":popover-open")) list.hidePopover?.();
    list.remove();
  }
  // Under the field, or above it when there is more room there; from the field's left edge, at least its width.
  function place() {
    if (!opened) return;
    if (!input.isConnected) { close(); return; }
    const box = input.getBoundingClientRect();
    // From the field's left edge, as wide as the field at least and WIDEST at most (titles truncate).
    const left = Math.max(MARGIN, Math.min(box.left, innerWidth - MARGIN - box.width));
    list.style.left = `${Math.round(left)}px`;
    list.style.minWidth = `${Math.round(box.width)}px`;
    list.style.maxWidth = `${Math.round(Math.max(box.width, Math.min(WIDEST, innerWidth - left - MARGIN)))}px`;
    const below = innerHeight - box.bottom - GAP - MARGIN, above = box.top - GAP - MARGIN;
    const up = list.scrollHeight > below && above > below;
    list.style.maxHeight = `${Math.round(Math.max(80, up ? above : below))}px`;
    list.dataset.side = up ? "above" : "below";
    list.style.top = up ? `${Math.round(box.top - GAP - Math.min(list.scrollHeight, above))}px` : `${Math.round(box.bottom + GAP)}px`;
    // Hidden while the field is scrolled out of its sidebar.
    const clip = input.closest(".page-structure")?.getBoundingClientRect();
    list.style.visibility = clip && (box.bottom < clip.top || box.top > clip.bottom) ? "hidden" : "";
  }
  const fieldSize = new ResizeObserver(() => place());
  function move(step: number) {
    if (!opened) { show(); if (!shown.length) return; }
    active = active < 0 ? (step > 0 ? 0 : shown.length - 1) : Math.max(0, Math.min(shown.length - 1, active + step));
    render();
    list.querySelector<HTMLElement>(`#${CSS.escape(`${list.id}-${active}`)}`)?.scrollIntoView({ block: "nearest" });
  }
  function pick(index: number) {
    const entry = shown[index];
    close();
    if (!entry) return;
    input.value = entry.value;
    // Picked as if typed: the field's own input handling writes it.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    close();
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    const handled = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if (event.key === "ArrowDown" && !event.altKey) { handled(); move(1); }
    else if (event.key === "ArrowDown" && event.altKey) { handled(); show(); }
    else if (event.key === "ArrowUp" && opened) { handled(); move(-1); }
    // Enter picks the highlighted option and editing goes on; with none highlighted
    // the list just closes and Enter does what it does in the field (commit).
    else if (event.key === "Enter" && opened && active >= 0) { handled(); pick(active); }
    else if (event.key === "Enter" && opened) close();
    else if (event.key === "Escape" && opened) { handled(); close(); }
    else if (event.key === "Tab") close();
  };
  const onInput = () => { if (document.activeElement !== input) return; active = -1; show(); };
  const onFocus = () => { start = input.value; };
  const onBlur = () => close();
  input.addEventListener("keydown", onKey, true);
  input.addEventListener("input", onInput);
  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", onBlur);
  // A press on an option keeps focus in the field (no blur, so editing goes on); its click picks it.
  list.addEventListener("pointerdown", event => event.preventDefault());
  list.addEventListener("click", event => {
    const option = (event.target as Element | null)?.closest<HTMLElement>("[role='option']");
    if (!option) return;
    const index = [...list.children].indexOf(option);
    if (index >= 0) pick(index);
  });

  const controller: FieldSuggestions = {
    update(next) { all = [...next]; siteName = suggestionSiteName(all); if (opened) show(); },
    get open() { return opened; },
    close,
    destroy() {
      close();
      input.removeEventListener("keydown", onKey, true);
      input.removeEventListener("input", onInput);
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("blur", onBlur);
      attached.delete(input);
    },
  };
  attached.set(input, controller);
  return controller;
}
