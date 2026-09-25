import { button, node } from "../ui/dom";
import "./create-dialog.css";

/**
 * A modal confirmation inside the explorer popover (so the explorer stays
 * open behind it, as the create dialog does): a title naming what is about
 * to happen, notes under it, and the action or Cancel. The action button has
 * focus, so Enter confirms; Escape cancels, and focus returns to where it
 * was.
 */
export function createConfirmDialog() {
  const dialog = node("dialog", "create-dialog confirm-dialog");
  dialog.setAttribute("aria-labelledby", "confirm-dialog-title");
  dialog.setAttribute("aria-describedby", "confirm-dialog-notes");
  const form = node("form", "create-dialog__form");
  form.method = "dialog";
  const title = node("h2", "create-dialog__title");
  title.id = "confirm-dialog-title";
  const notes = node("div", "confirm-dialog__notes");
  notes.id = "confirm-dialog-notes";
  const cancel = button("Cancel", () => dialog.close("cancel"), "button secondary");
  const confirm = node("button", "button primary", "OK");
  confirm.type = "submit";
  confirm.value = "confirm";
  const actions = node("div", "create-dialog__actions");
  actions.append(cancel, confirm);
  form.append(title, notes, actions);
  dialog.append(form);
  let settle: ((value: boolean) => void) | undefined;
  let opener: Element | null = null;
  // Escape closes the dialog only; the explorer would otherwise close too.
  dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") event.stopPropagation(); });
  dialog.addEventListener("close", () => {
    const done = settle;
    settle = undefined;
    const target = opener;
    opener = null;
    if (target instanceof HTMLElement && target.isConnected && !target.closest("[popover]:not(:popover-open)")) target.focus();
    done?.(dialog.returnValue === "confirm");
  });
  return {
    root: dialog,
    /** Asks; resolves to true when confirmed. */
    ask(question: { title: string; notes: string[]; action: string }): Promise<boolean> {
      if (dialog.open) dialog.close("cancel");
      opener = document.activeElement;
      title.textContent = question.title;
      notes.replaceChildren(...question.notes.map((text) => node("p", "create-dialog__result", text)));
      confirm.textContent = question.action;
      dialog.returnValue = "";
      dialog.showModal();
      confirm.focus();
      return new Promise((resolve) => { settle = resolve; });
    },
    close() {
      if (dialog.open) dialog.close("cancel");
    },
  };
}
