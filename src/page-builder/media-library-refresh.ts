import type { MediaLibrary } from "./media-picker";

export const detailIdentity = (value: MediaLibrary | undefined, path: string) => JSON.stringify([
  value?.metadata[path] ?? { tags: [], alt: "" }, value?.usage[path],
  value?.items.find(item => item.path === path)?.version, value?.collections, Boolean(value?.keep?.includes(path)),
]);
export const metadataIdentity = (value: MediaLibrary | undefined, path: string) => JSON.stringify(value?.metadata[path] ?? { tags: [], alt: "" });

export function pruneLibrarySelection(items: MediaLibrary["items"], selected: Set<string>) {
  for (const path of [...selected]) if (!items.some((item) => item.path === path)) selected.delete(path);
}

/** A control's identity across redraws: membership boxes carry their own key, since a collection
 * may share its name with a field ("Decorative"). */
const formKey = (control: Element) => control.getAttribute("data-form-key") ?? control.getAttribute("aria-label");
type DetailControl = HTMLInputElement | HTMLTextAreaElement;
const fields = (sheet: HTMLElement) => [...sheet.querySelectorAll<DetailControl>("input,textarea")];
const typed = (control: Element | null): control is DetailControl => control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement;

/** What a background refresh must keep of File details: unfinished fields, open sections and focus. */
export function captureDetailForm(sheet: HTMLElement, preserve: boolean) {
  const inputs = preserve ? fields(sheet).map(input => ({
    label: formKey(input), value: input.value,
    checked: input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : undefined,
    // Words a field holds aside, such as a description while Decorative is ticked.
    kept: input.dataset.kept,
  })) : [];
  const open = [...sheet.querySelectorAll<HTMLDetailsElement>("details[open]")].map(section => section.dataset.part);
  const active = document.activeElement;
  const focus = active instanceof HTMLElement && sheet.contains(active) ? {
    label: formKey(active), text: active instanceof HTMLButtonElement || active.localName === "summary" ? active.textContent : undefined,
    start: typed(active) && active.type !== "checkbox" ? active.selectionStart : null,
    end: typed(active) && active.type !== "checkbox" ? active.selectionEnd : null,
  } : undefined;
  return { inputs, open, active, focus };
}

export function restoreDetailForm(sheet: HTMLElement, savedForm: ReturnType<typeof captureDetailForm>) {
  const { inputs, open, active, focus } = savedForm;
  for (const section of sheet.querySelectorAll<HTMLDetailsElement>("details")) if (open.includes(section.dataset.part)) section.open = true;
  for (const saved of inputs) {
    const input = fields(sheet).find(input => formKey(input) === saved.label);
    if (!input) continue;
    if (saved.kept !== undefined) input.dataset.kept = saved.kept;
    if (saved.checked !== undefined && input instanceof HTMLInputElement) {
      if (input.checked !== saved.checked) input.click();
    } else { input.value = saved.value; input.dispatchEvent(new Event("input", { bubbles: true })); }
  }
  // Metadata Undo changes values, but it must not strand keyboard focus.
  // A user who focused elsewhere during the read keeps that focus.
  if (focus && document.activeElement === document.body && !active?.isConnected) {
    // Only controls still shown: Save details hides once the saved values match (slice 123), so focus
    // falls back to the first shown control (Back) rather than to nothing.
    const controls = [...sheet.querySelectorAll<HTMLElement>("input,textarea,button,summary")].filter(control => control.getClientRects().length);
    const control = controls.find(control => focus.label
      ? formKey(control) === focus.label
      : (control instanceof HTMLButtonElement || control.localName === "summary") && control.textContent === focus.text) ?? controls[0];
    control?.focus();
    if (typed(control ?? null) && focus.start !== null && focus.end !== null) (control as DetailControl).setSelectionRange(focus.start, focus.end);
  }
}

export function dismissRefreshingDelete(
  sheet: HTMLElement, grid: HTMLElement, invalidate: () => void, tell: (text: string) => void,
) {
  if (!sheet.hidden && sheet.dataset.mode === "delete") {
    const active = document.activeElement;
    const returnPath = sheet.dataset.deletePath;
    const restoreBrowseFocus = active instanceof Element && sheet.contains(active);
    invalidate(); sheet.hidden = true; delete sheet.dataset.mode;
    if (restoreBrowseFocus && (document.activeElement === active || document.activeElement === document.body))
      grid.querySelector<HTMLElement>(`[data-path="${CSS.escape(returnPath ?? "")}"] button`)?.focus();
    tell("Repository images are refreshing. Reopen Delete after the refresh to check current references.");
  }
}
