import { button, node } from "../ui/dom";
import "./create-dialog.css";

/** A place a page can go: under the page at `route` ("/" the top level). */
export interface PagePickerItem {
  route: string;
  label: string;
  level: number;
  /** Why it cannot be chosen (the page itself, one of its subpages, where it is now). */
  disabled?: string;
}

/**
 * Move to…: a modal inside the explorer listing where a page can go, as a
 * tree (every level open): "Top level" first, then the site's pages. Up and
 * Down (Home, End) move, Enter or a click chooses, Escape cancels and focus
 * returns to where it was.
 */
export function createPagePicker() {
  const dialog = node("dialog", "create-dialog page-picker");
  dialog.setAttribute("aria-labelledby", "page-picker-title");
  const form = node("form", "create-dialog__form");
  form.method = "dialog";
  const title = node("h2", "create-dialog__title");
  title.id = "page-picker-title";
  const list = node("ul", "page-picker__tree");
  list.setAttribute("role", "tree");
  list.setAttribute("aria-labelledby", "page-picker-title");
  const note = node("p", "create-dialog__result");
  note.setAttribute("aria-live", "polite");
  const cancel = button("Cancel", () => dialog.close(""), "button secondary");
  const actions = node("div", "create-dialog__actions");
  actions.append(cancel);
  form.append(title, list, note, actions);
  dialog.append(form);
  let settle: ((route: string | undefined) => void) | undefined;
  let opener: Element | null = null;
  let chosen: string | undefined;

  dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") event.stopPropagation(); });
  dialog.addEventListener("close", () => {
    const done = settle;
    settle = undefined;
    const target = opener;
    opener = null;
    if (target instanceof HTMLElement && target.isConnected && !target.closest("[popover]:not(:popover-open)")) target.focus();
    done?.(chosen);
  });
  const rows = () => [...list.querySelectorAll<HTMLElement>("[role='treeitem']")];
  function focusRow(row: HTMLElement | undefined) {
    if (!row) return;
    for (const other of rows()) other.tabIndex = -1;
    row.tabIndex = 0;
    row.focus();
    note.textContent = row.dataset.disabled ?? "";
  }
  function choose(row: HTMLElement) {
    if (row.dataset.disabled) { note.textContent = row.dataset.disabled; return; }
    chosen = row.dataset.route;
    dialog.close(chosen);
  }
  list.addEventListener("keydown", (event) => {
    const all = rows();
    const index = all.indexOf(document.activeElement as HTMLElement);
    const go = (next: HTMLElement | undefined) => { event.preventDefault(); focusRow(next); };
    if (event.key === "ArrowDown") go(all[Math.min(all.length - 1, index + 1)]);
    else if (event.key === "ArrowUp") go(all[Math.max(0, index - 1)]);
    else if (event.key === "Home") go(all[0]);
    else if (event.key === "End") go(all.at(-1));
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (index >= 0) choose(all[index]);
    }
  });
  return {
    root: dialog,
    /** Asks where `label` goes; resolves to the route of the page chosen ("/" the top level), or nothing. */
    pick(question: { title: string; items: PagePickerItem[]; current?: string }): Promise<string | undefined> {
      if (dialog.open) dialog.close("");
      opener = document.activeElement;
      chosen = undefined;
      title.textContent = question.title;
      note.textContent = "";
      list.replaceChildren(...question.items.map((item) => {
        const row = node("li", `page-picker__item${item.disabled ? " is-disabled" : ""}`);
        row.setAttribute("role", "treeitem");
        row.setAttribute("aria-level", String(item.level));
        row.dataset.route = item.route;
        row.tabIndex = -1;
        row.style.setProperty("--level", String(item.level));
        row.append(node("span", "page-picker__label", item.label), node("span", "page-picker__url", item.route === "/" ? "/" : item.route));
        row.setAttribute("aria-label", item.label);
        if (item.disabled) {
          row.dataset.disabled = item.disabled;
          row.setAttribute("aria-disabled", "true");
          row.title = item.disabled;
        }
        row.addEventListener("click", () => choose(row));
        return row;
      }));
      dialog.returnValue = "";
      dialog.showModal();
      const first = rows().find((row) => !row.dataset.disabled) ?? rows()[0];
      focusRow(first);
      return new Promise((resolve) => { settle = resolve; });
    },
  };
}
