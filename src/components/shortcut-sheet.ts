import "./command-palette.css";
import { node } from "../ui/dom";
import type { ShortcutEntry } from "../page-builder/commands";
import { keyCapsElement, paletteIcon } from "./command-palette";

// The keyboard shortcuts sheet (?): every shortcut the editor has, by the
// part of the editor it works in, with the platform's keys (⌘ on a Mac,
// Ctrl elsewhere). Escape, the close button or a click outside closes it.
export function createShortcutSheet(list: () => { area: string; entries: ShortcutEntry[] }[]) {
  const dialog = node("dialog", "shortcut-sheet");
  dialog.setAttribute("aria-labelledby", "shortcut-sheet-title");
  const header = node("div", "shortcut-sheet__header");
  const titles = node("div", "");
  const title = node("h2", "shortcut-sheet__title", "Keyboard shortcuts");
  title.id = "shortcut-sheet-title";
  const subtitle = node("p", "shortcut-sheet__subtitle");
  titles.append(title, subtitle);
  const close = node("button", "shortcut-sheet__close");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.title = "Close (Esc)";
  close.append(paletteIcon("x"));
  close.addEventListener("click", () => dialog.close());
  header.append(paletteIcon("keyboard", 18), titles, close);
  const body = node("div", "shortcut-sheet__body");
  dialog.append(header, body);
  dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") event.stopPropagation(); });
  dialog.addEventListener("pointerdown", (event) => { if (event.target === dialog) dialog.close(); });
  let opener: Element | null = null;
  dialog.addEventListener("close", () => {
    const target = opener;
    opener = null;
    if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
  });

  function render() {
    body.replaceChildren();
    for (const { area, entries } of list()) {
      const section = node("section", "shortcut-sheet__area");
      const heading = node("h3", "shortcut-sheet__area-title", area);
      const rows = node("dl", "shortcut-sheet__list");
      for (const entry of entries) {
        const row = node("div", "shortcut-sheet__row");
        const label = node("dt", "shortcut-sheet__label");
        label.append(node("span", "", entry.label));
        if (entry.note) label.append(node("span", "shortcut-sheet__note", entry.note));
        const keys = node("dd", "shortcut-sheet__keys");
        entry.keys.forEach((combination, index) => {
          if (index) keys.append(document.createTextNode("or"));
          keys.append(keyCapsElement(combination));
        });
        row.append(label, keys);
        rows.append(row);
      }
      section.append(heading, rows);
      body.append(section);
    }
  }

  return {
    root: dialog,
    open() {
      const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      subtitle.textContent = mac ? "Press ? to show this again. ⌘K finds any action." : "Press ? to show this again. Ctrl+K finds any action.";
      render();
      if (!dialog.open) {
        opener = document.activeElement;
        dialog.showModal();
      }
      close.focus();
    },
    close: () => dialog.close(),
    isOpen: () => dialog.open,
  };
}

export type ShortcutSheet = ReturnType<typeof createShortcutSheet>;
