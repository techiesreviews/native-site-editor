import type { LibraryShell } from "./media-library-shell";

export interface LibraryInputHost {
  draw: () => void;
  busy: () => boolean;
  /** True once the library has loaded. */
  loaded: () => boolean;
  optimise: (files: File[]) => void;
  tell: (text: string) => void;
}

/** Filters redraw, arrow keys move through thumbnails, and uploads or drops open Optimise. */
export function wireMediaLibraryInput(
  { search, folders, sort, grid, uploadInput, dialog }: LibraryShell, h: LibraryInputHost, signal: AbortSignal,
) {
  const { draw, tell } = h;
  search.addEventListener("input", draw, { signal });
  folders.addEventListener("change", draw, { signal });
  sort.addEventListener("change", draw, { signal });
  grid.addEventListener("keydown", (event) => {
    const buttons = [...grid.querySelectorAll<HTMLButtonElement>(".media-library__thumbnail")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const columns = Math.max(1, Math.round(grid.clientWidth / (buttons[at].closest("article")!.getBoundingClientRect().width + 16)));
    const target = mediaLibraryArrowStep(event.key, at, buttons.length, columns);
    if (target !== undefined) { event.preventDefault(); buttons[target]?.focus(); }
  }, { signal });
  uploadInput.addEventListener("change", () => {
    const files = [...(uploadInput.files ?? [])]; uploadInput.value = "";
    if (files.length && h.busy()) tell("An image change is in progress. Wait for it to finish before uploading images.");
    else if (files.length && h.loaded()) h.optimise(files);
    else if (files.length) tell("Repository images are loading. Wait for them to finish before uploading images.");
  }, { signal });
  dialog.addEventListener("dragover", (event) => { if (event.dataTransfer?.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }, { signal });
  dialog.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.files.length) return; event.preventDefault();
    if (h.busy()) tell("An image change is in progress. Wait for it to finish before uploading images.");
    else if (h.loaded()) h.optimise([...event.dataTransfer.files]);
    else tell("Repository images are loading. Wait for them to finish before uploading images.");
  }, { signal });
}

export function mediaLibraryArrowStep(key: string, at: number, count: number, columns: number) {
  const jump = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[key];
  return jump === undefined ? undefined : Math.max(0, Math.min(count - 1, at + jump));
}
