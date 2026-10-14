import type { MediaLibrary } from "./media-picker";
import { parent } from "./media-library-filter";

export const detailIdentity = (value: MediaLibrary | undefined, path: string) => JSON.stringify([
  value?.metadata[path] ?? { tags: [], alt: "" }, value?.usage[path],
  value?.items.find(item => item.path === path)?.version,
]);
export const metadataIdentity = (value: MediaLibrary | undefined, path: string) => JSON.stringify(value?.metadata[path] ?? { tags: [], alt: "" });

export function libraryFolders(items: MediaLibrary["items"]) {
  return [...new Set(items.map((item) => parent(item.path)))].sort();
}

export function pruneLibrarySelection(items: MediaLibrary["items"], selected: Set<string>) {
  for (const path of [...selected]) if (!items.some((item) => item.path === path)) selected.delete(path);
}

export function rebuildLibraryFolders(folders: HTMLSelectElement, items: MediaLibrary["items"]) {
  const folder = folders.value;
  folders.replaceChildren(new Option("All folders", ""),
    ...libraryFolders(items).map((path) => new Option(path || "Repository root", path || "/")));
  folders.value = folder;
  if (folders.selectedIndex < 0) folders.selectedIndex = 0;
}

export function captureDetailForm(sheet: HTMLElement, preserve: boolean) {
  const inputs = preserve ? [...sheet.querySelectorAll<HTMLInputElement>("input")].map(input => ({
    label: input.getAttribute("aria-label"), value: input.value,
    focused: input === document.activeElement, start: input.selectionStart, end: input.selectionEnd,
  })) : [];
  const active = document.activeElement;
  const focus = active instanceof HTMLElement && sheet.contains(active) ? {
    label: active.getAttribute("aria-label"), text: active instanceof HTMLButtonElement ? active.textContent : undefined,
    start: active instanceof HTMLInputElement ? active.selectionStart : null,
    end: active instanceof HTMLInputElement ? active.selectionEnd : null,
  } : undefined;
  return { inputs, active, focus };
}

export function restoreDetailForm(sheet: HTMLElement, savedForm: ReturnType<typeof captureDetailForm>) {
  const { inputs, active, focus } = savedForm;
  for (const saved of inputs) {
    const input = [...sheet.querySelectorAll<HTMLInputElement>("input")].find(input => input.getAttribute("aria-label") === saved.label);
    if (!input) continue;
    input.value = saved.value; input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // Metadata Undo changes values, but it must not strand keyboard focus.
  // A user who focused elsewhere during the read keeps that focus.
  if (focus && document.activeElement === document.body && !active?.isConnected) {
    const controls = [...sheet.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input,button")];
    const control = controls.find(control => focus.label
      ? control.getAttribute("aria-label") === focus.label
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
