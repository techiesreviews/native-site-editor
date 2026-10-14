import type { LibraryShell } from "./media-library-shell";
import { MANAGE_COLLECTIONS } from "./media-library-refresh";

export interface LibraryInputHost {
  draw: () => void;
  /** True once the library has loaded. */
  loaded: () => boolean;
  /** Files dropped or chosen: the pane saves them at once, the chooser holds them until Use or Close. */
  add: (files: File[]) => void;
  tell: (text: string) => void;
  /** The collection the grid shows, which Manage collections leaves chosen. */
  viewing: () => string;
  manage: () => void;
}

/** Filters redraw, arrow keys move through thumbnails, and chosen or dropped files are added. */
export function wireMediaLibraryInput(
  { search, collections, grid, uploadInput, dialog }: LibraryShell, h: LibraryInputHost, signal: AbortSignal,
) {
  const { draw, tell } = h;
  search.addEventListener("input", draw, { signal });
  collections.addEventListener("change", () => {
    if (collections.value !== MANAGE_COLLECTIONS) { draw(); return; }
    collections.value = h.viewing(); h.manage();
  }, { signal });
  // Escape in the open Collections list closes only the list, not the explorer around it.
  collections.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selectIsOpen(collections)) event.stopPropagation();
  }, { signal });
  grid.addEventListener("keydown", (event) => {
    const buttons = [...grid.querySelectorAll<HTMLButtonElement>(".media-library__thumbnail")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    // The laid-out tracks, whatever the width: 3, 4 or 6 tiles across.
    const columns = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length);
    const target = mediaLibraryArrowStep(event.key, at, buttons.length, columns);
    if (target !== undefined) { event.preventDefault(); buttons[target]?.focus(); }
  }, { signal });
  const add = (files: File[]) => {
    if (!files.length) return;
    if (h.loaded()) h.add(files);
    else tell("Repository images are loading. Wait for them to finish before uploading images.");
  };
  uploadInput.addEventListener("change", () => {
    const files = [...(uploadInput.files ?? [])]; uploadInput.value = ""; add(files);
  }, { signal });
  // While files are dragged over it, the library shows where they will land.
  let depth = 0;
  const dragging = (on: boolean) => dialog.classList.toggle("is-dropping", on);
  const files = (event: DragEvent) => Boolean(event.dataTransfer?.types.includes("Files"));
  dialog.addEventListener("dragenter", (event) => { if (files(event)) { depth++; dragging(true); } }, { signal });
  dialog.addEventListener("dragleave", (event) => { if (files(event) && --depth <= 0) { depth = 0; dragging(false); } }, { signal });
  dialog.addEventListener("dragover", (event) => { if (files(event)) { event.preventDefault(); event.dataTransfer!.dropEffect = "copy"; } }, { signal });
  dialog.addEventListener("drop", (event) => {
    depth = 0; dragging(false);
    if (!event.dataTransfer?.files.length) return; event.preventDefault();
    add([...event.dataTransfer.files]);
  }, { signal });
}

export function mediaLibraryArrowStep(key: string, at: number, count: number, columns: number) {
  const jump = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[key];
  return jump === undefined ? undefined : Math.max(0, Math.min(count - 1, at + jump));
}

/** A customizable select's list is open (`:open`); browsers without it draw their own list. */
function selectIsOpen(select: HTMLSelectElement) {
  try { return select.matches(":open"); } catch { return false; }
}
