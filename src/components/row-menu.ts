import { button, node } from "../ui/dom";
import "./row-menu.css";

export interface MenuItem {
  label: string;
  run: () => void;
  /** Shown beside the label, as a hint (a key such as F2). */
  shortcut?: string;
  /** Why the action is unavailable: the item shows it and does nothing. */
  disabled?: string;
}

/**
 * A row's actions as a menu (`role="menu"`) under a button, at a pointer or
 * beside a focused row: arrows move, Home/End jump, Enter runs, Escape and
 * Tab close it and return focus to where it opened from. Positioned fixed in
 * the viewport, so it works inside the explorer popover (the top layer).
 */
let noteIds = 0;

export function createRowMenu(host: HTMLElement, onClose?: () => void) {
  const element = node("div", "pages-menu row-menu");
  element.setAttribute("role", "menu");
  element.hidden = true;
  host.append(element);
  let opener: HTMLElement | undefined;
  const items = () => [...element.querySelectorAll<HTMLButtonElement>("[role='menuitem']")];
  function close(returnFocus: boolean) {
    if (element.hidden) return;
    element.hidden = true;
    element.replaceChildren();
    document.removeEventListener("pointerdown", outside, true);
    opener?.setAttribute("aria-expanded", "false");
    const target = opener;
    api.opener = opener = undefined;
    if (returnFocus && target?.isConnected) target.focus();
    onClose?.();
  }
  function outside(event: PointerEvent) {
    if (!element.contains(event.target as Node) && !opener?.contains(event.target as Node)) close(false);
  }
  const api = {
    element,
    opener: undefined as HTMLElement | undefined,
    isOpen: () => !element.hidden,
    close,
    /**
     * Opens under `anchor` (or at `at`, a pointer's place), focus on the first
     * item; `returnTo` is where focus goes back to (the anchor by default).
     */
    open(anchor: HTMLElement, entries: MenuItem[], at?: { x: number; y: number }, label?: string) {
      close(false);
      api.opener = opener = anchor;
      element.setAttribute("aria-label", label ?? anchor.getAttribute("aria-label") ?? "Actions");
      element.replaceChildren(...entries.map((entry) => {
        const item = button("", () => {
          if (entry.disabled) return;
          close(false);
          entry.run();
        }, "pages-menu__item");
        item.append(node("span", "", entry.label));
        if (entry.disabled) {
          // Still focusable, as a disabled menu item should be, with its reason.
          item.setAttribute("aria-disabled", "true");
          item.title = entry.disabled;
          const note = node("span", "row-menu__note", entry.disabled);
          note.id = `row-menu-note-${++noteIds}`;
          item.setAttribute("aria-describedby", note.id);
          item.append(note);
        }
        if (entry.shortcut) {
          const hint = node("span", "row-menu__shortcut", entry.shortcut);
          hint.setAttribute("aria-hidden", "true");
          item.append(hint);
          item.setAttribute("aria-keyshortcuts", entry.shortcut);
        }
        item.setAttribute("role", "menuitem");
        item.tabIndex = -1;
        return item;
      }));
      element.hidden = false;
      if (anchor.getAttribute("aria-haspopup")) anchor.setAttribute("aria-expanded", "true");
      const rect = anchor.getBoundingClientRect();
      const x = at?.x ?? rect.right - element.offsetWidth;
      const y = at?.y ?? rect.bottom + 4;
      element.style.left = `${Math.max(8, Math.min(x, innerWidth - element.offsetWidth - 8))}px`;
      element.style.top = `${y + element.offsetHeight > innerHeight - 8 ? Math.max(8, (at?.y ?? rect.top) - element.offsetHeight - 4) : y}px`;
      document.addEventListener("pointerdown", outside, true);
      items()[0]?.focus();
    },
  };
  element.addEventListener("keydown", (event) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (index + 1) % list.length;
    else if (event.key === "ArrowUp") next = (index - 1 + list.length) % list.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = list.length - 1;
    else if (event.key === "Escape") {
      // Closes the menu only, not the explorer around it.
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    } else if (event.key === "Tab") {
      event.preventDefault();
      close(true);
      return;
    }
    if (next === undefined) return;
    event.preventDefault();
    list[next]?.focus();
  });
  element.addEventListener("focusout", (event) => {
    const to = event.relatedTarget as Node | null;
    if (to && !element.contains(to)) close(false);
  });
  return api;
}
