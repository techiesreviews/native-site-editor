import { button, node } from "../ui/dom";
import "./create-dialog.css";

/**
 * A modal confirmation inside the explorer popover (so the explorer stays
 * open behind it, as the create dialog does): a title naming what is about
 * to happen, notes under it, and the action or Cancel. The action button has
 * focus, so Enter confirms; Escape cancels, and focus returns to where it
 * was.
 */
export function createConfirmDialog(id = "confirm-dialog") {
  const dialog = node("dialog", "create-dialog confirm-dialog");
  dialog.setAttribute("aria-labelledby", `${id}-title`);
  dialog.setAttribute("aria-describedby", `${id}-notes`);
  const form = node("form", "create-dialog__form");
  form.method = "dialog";
  const title = node("h2", "create-dialog__title");
  title.id = `${id}-title`;
  const notes = node("div", "confirm-dialog__notes");
  notes.id = `${id}-notes`;
  const cancel = button("Cancel", () => dialog.close("cancel"), "button secondary");
  const confirm = node("button", "button primary", "OK");
  confirm.type = "submit";
  confirm.value = "confirm";
  const actions = node("div", "create-dialog__actions");
  actions.append(cancel, confirm);
  // A checkbox under the notes, when a question offers one.
  const optionLabel = node("label", "confirm-dialog__option");
  const option = node("input");
  option.type = "checkbox";
  const optionText = node("span");
  optionLabel.append(option, optionText);
  optionLabel.hidden = true;
  form.append(title, notes, optionLabel, actions);
  dialog.append(form);
  let settle: (() => void) | undefined;
  let opener: Element | null = null;
  // Escape closes the dialog only; the explorer would otherwise close too.
  dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") event.stopPropagation(); });
  dialog.addEventListener("close", () => {
    const done = settle;
    settle = undefined;
    const target = opener;
    opener = null;
    if (target instanceof HTMLElement && target.isConnected && !target.closest("[popover]:not(:popover-open)")) target.focus();
    done?.();
  });
  return {
    root: dialog,
    /** Asks; resolves to true when confirmed. */
    ask(question: { title: string; notes: string[]; action: string }): Promise<boolean> {
      return this.choose({ ...question, actions: [{ label: question.action, value: "confirm" }] }).then((answer) => answer.value === "confirm");
    },
    /**
     * Asks with several actions (the first is focused, the last before
     * Cancel is primary) and, with `option`, a checkbox; resolves to the
     * action chosen (none when cancelled) and the checkbox's state.
     */
    choose(question: { title: string; notes: string[]; actions: { label: string; value: string }[]; option?: { label: string; checked: boolean } }): Promise<{ value?: string; option: boolean }> {
      if (dialog.open) dialog.close("cancel");
      opener = document.activeElement;
      title.textContent = question.title;
      notes.replaceChildren(...question.notes.map((text) => node("p", "create-dialog__result", text)));
      optionLabel.hidden = !question.option;
      option.checked = Boolean(question.option?.checked);
      optionText.textContent = question.option?.label ?? "";
      const buttons = question.actions.map((action, index) => {
        const choice = index === question.actions.length - 1 ? confirm : node("button", "button secondary");
        choice.type = "submit";
        choice.value = action.value;
        choice.textContent = action.label;
        return choice;
      });
      actions.replaceChildren(cancel, ...buttons);
      dialog.returnValue = "";
      dialog.showModal();
      buttons[0]?.focus();
      return new Promise((resolve) => {
        settle = () => {
          const value = dialog.returnValue && dialog.returnValue !== "cancel" ? dialog.returnValue : undefined;
          resolve({ value, option: !optionLabel.hidden && option.checked });
        };
      });
    },
    close() {
      if (dialog.open) dialog.close("cancel");
    },
  };
}
