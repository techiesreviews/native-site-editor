import type { MediaLibrary } from "./media-picker";

export const detailIdentity = (value: MediaLibrary | undefined, path: string) => JSON.stringify([
  value?.metadata[path] ?? { tags: [], alt: "" }, value?.usage[path],
  value?.items.find(item => item.path === path)?.version, value?.collections,
]);
export const metadataIdentity = (value: MediaLibrary | undefined, path: string) => JSON.stringify(value?.metadata[path] ?? { tags: [], alt: "" });

export function pruneLibrarySelection(items: MediaLibrary["items"], selected: Set<string>) {
  for (const path of [...selected]) if (!items.some((item) => item.path === path)) selected.delete(path);
}

/** The Collections option that opens Manage collections. Collection names are trimmed, so none starts with a space. */
export const MANAGE_COLLECTIONS = " manage";

/** All collections, then each collection in the library's order, then (in the Media pane)
 * Manage collections; a vanished choice falls back to All. */
export function rebuildLibraryCollections(select: HTMLSelectElement, collections: string[], manage: boolean, chosen = select.value) {
  // The customizable select's button (showing the chosen option) stays first.
  select.replaceChildren(...[...select.children].filter(child => child instanceof HTMLButtonElement),
    new Option("All collections", ""), ...collections.map(name => new Option(name, name)),
    ...manage ? [document.createElement("hr"), new Option("Manage collections…", MANAGE_COLLECTIONS)] : []);
  select.value = collections.includes(chosen) ? chosen : "";
}

/** A control's identity across redraws: membership boxes carry their own key, since a collection
 * may share its name with a field ("Decorative"). */
const formKey = (control: Element) => control.getAttribute("data-form-key") ?? control.getAttribute("aria-label");

export function captureDetailForm(sheet: HTMLElement, preserve: boolean) {
  const inputs = preserve ? [...sheet.querySelectorAll<HTMLInputElement>("input")].map(input => ({
    label: formKey(input), value: input.value, checked: input.checked,
    focused: input === document.activeElement, start: input.selectionStart, end: input.selectionEnd,
  })) : [];
  const active = document.activeElement;
  const focus = active instanceof HTMLElement && sheet.contains(active) ? {
    label: formKey(active), text: active instanceof HTMLButtonElement ? active.textContent : undefined,
    start: active instanceof HTMLInputElement ? active.selectionStart : null,
    end: active instanceof HTMLInputElement ? active.selectionEnd : null,
  } : undefined;
  return { inputs, active, focus };
}

export function restoreDetailForm(sheet: HTMLElement, savedForm: ReturnType<typeof captureDetailForm>) {
  const { inputs, active, focus } = savedForm;
  for (const saved of inputs) {
    const input = [...sheet.querySelectorAll<HTMLInputElement>("input")].find(input => formKey(input) === saved.label);
    if (!input) continue;
    if (input.type === "checkbox") input.checked = saved.checked; else input.value = saved.value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // Metadata Undo changes values, but it must not strand keyboard focus.
  // A user who focused elsewhere during the read keeps that focus.
  if (focus && document.activeElement === document.body && !active?.isConnected) {
    const controls = [...sheet.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input,button")];
    const control = controls.find(control => focus.label
      ? formKey(control) === focus.label
      : control instanceof HTMLButtonElement && control.textContent === focus.text) ?? controls[0];
    control?.focus();
    if (control instanceof HTMLInputElement && focus.start !== null && focus.end !== null) control.setSelectionRange(focus.start, focus.end);
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
