import { node } from "../ui/dom";
import "./url-change.css";

/** What changing a page's URL to a typed value would do, or why it cannot. */
export type UrlPlan =
  | {
      ok: true;
      /** The new URL, normalized. */
      route: string;
      /** What happens: files moved, links updated. */
      message: string;
      warnings?: string[];
      /** Offered when the page is on the live site: keep its old URL working, checked or not by default. */
      redirect?: { checked: boolean; label: string };
    }
  | { ok: false; error: string; /** The value is the page's URL now: nothing to say. */ unchanged?: boolean };

let serial = 0;

/**
 * A page's URL, editable: the field, what the typed URL would do (checked as
 * typed), and "Keep the old URL working" when the page is live. Enter
 * applies, Escape cancels. The Page block of the sidebar and the Pages tab
 * both use it.
 */
export function createUrlChange(options: {
  /** The label shown before the field (none: the field is labelled by `ariaLabel` only). */
  label?: string;
  ariaLabel: string;
  initial: string;
  plan: (value: string) => UrlPlan;
  /** Applies the change; resolves to an error message, or nothing when done. */
  apply: (value: string, keep: boolean) => Promise<string | undefined>;
  /** Escape (or leaving the field unchanged). */
  cancel: () => void;
  /** Shows Cancel and Change URL buttons under the message (the Pages tab). */
  buttons?: boolean;
}) {
  const id = `url-change-${++serial}`;
  const form = node("form", "url-change");
  const field = node("label", "url-change__field");
  const input = node("input", "url-change__input");
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = options.initial;
  input.setAttribute("aria-label", options.ariaLabel);
  input.setAttribute("aria-describedby", `${id}-message`);
  if (options.label) field.append(node("span", "url-change__label page-structure__field-label", options.label));
  field.append(input);
  const details = node("div", "url-change__details");
  details.hidden = true;
  const message = node("p", "url-change__message");
  message.id = `${id}-message`;
  message.setAttribute("aria-live", "polite");
  const keepLabel = node("label", "url-change__keep");
  const keep = node("input");
  keep.type = "checkbox";
  const keepText = node("span", "", "Keep the old URL working");
  keepLabel.append(keep, keepText);
  keepLabel.hidden = true;
  const actions = node("div", "url-change__actions");
  actions.append(node("span", "url-change__hint", "Enter to change, Esc to cancel"));
  if (options.buttons) {
    const cancel = node("button", "pages-edit__action", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => finishCancel());
    const submit = node("button", "pages-edit__action pages-edit__action--primary", "Change URL");
    submit.type = "submit";
    actions.append(cancel, submit);
  }
  details.append(message, keepLabel, actions);
  form.append(field, details);

  let initial = options.initial;
  let keepTouched = false;
  let pending = false;
  keep.addEventListener("change", () => { keepTouched = true; });

  function check() {
    const planned = options.plan(input.value);
    const unchanged = !planned.ok && planned.unchanged;
    details.hidden = Boolean(unchanged) && !options.buttons;
    message.classList.toggle("is-error", !planned.ok && !unchanged);
    input.setAttribute("aria-invalid", String(!planned.ok && !unchanged));
    if (planned.ok) {
      message.textContent = [planned.message, ...(planned.warnings ?? [])].join(" ");
      keepLabel.hidden = !planned.redirect;
      if (planned.redirect) {
        keepText.textContent = planned.redirect.label;
        if (!keepTouched) keep.checked = planned.redirect.checked;
      }
    } else {
      message.textContent = unchanged ? "" : planned.error;
      keepLabel.hidden = true;
    }
    return planned;
  }

  function finishCancel() {
    input.value = initial;
    keepTouched = false;
    check();
    options.cancel();
  }

  input.addEventListener("input", () => check());
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    finishCancel();
  });
  // Keys typed here are the field's, not the tree's or the sidebar's.
  form.addEventListener("click", (event) => event.stopPropagation());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending) return;
    const planned = check();
    if (!planned.ok) {
      if (planned.unchanged) finishCancel();
      else input.focus();
      return;
    }
    pending = true;
    try {
      const error = await options.apply(input.value, !keepLabel.hidden && keep.checked);
      if (error) {
        message.textContent = error;
        message.classList.add("is-error");
        details.hidden = false;
        if (form.isConnected) input.focus();
      }
    } finally {
      pending = false;
    }
  });
  // The sidebar's field is checked once a page is on show (`reset`).
  if (options.buttons) check();

  return {
    root: form,
    input,
    /** Shows `route` as the URL now (another page, or the page moved). */
    reset(route: string) {
      const typing = form.contains(document.activeElement) && input.value !== initial;
      initial = route;
      if (typing) { check(); return; }
      input.value = route;
      keepTouched = false;
      check();
    },
    /** Checks the typed value again (the site changed under it). */
    check,
    focus() {
      input.focus();
      input.select();
    },
  };
}
