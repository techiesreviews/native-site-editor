import type { LibraryShell } from "./media-library-shell";

export interface LibraryInputHost {
  draw: () => void;
  /** True once the library has loaded. */
  loaded: () => boolean;
  /** Files dropped or chosen: the pane saves them at once, the chooser holds them until Use or Close. */
  add: (files: File[]) => void;
  tell: (text: string) => void;
}

/** Filters redraw, arrow keys move through thumbnails, and chosen or dropped files are added. */
export function wireMediaLibraryInput(
  { search, grid, uploadInput, dialog }: LibraryShell, h: LibraryInputHost, signal: AbortSignal,
) {
  const { draw, tell } = h;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelSearch = () => {
    clearTimeout(searchTimer); searchTimer = undefined;
  };
  // A tile pressed while the search waits keeps its element until its click has run.
  let pressing = false;
  const redrawSearch = () => { cancelSearch(); pressing = false; draw(); };
  signal.addEventListener("abort", cancelSearch, { once: true });
  search.addEventListener("input", () => {
    cancelSearch(); pressing = false;
    if (!search.value) draw();
    else searchTimer = setTimeout(redrawSearch, 150);
  }, { signal });
  search.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); redrawSearch(); }
    // Tab redraws before focus moves, so focus lands in the filtered grid.
    else if (event.key === "Tab" && searchTimer !== undefined) redrawSearch();
  }, { signal });
  search.addEventListener("blur", () => {
    // Touch may blur during synthesized mousedown, after pointerup restarted the timer.
    if (!pressing && searchTimer !== undefined) redrawSearch();
  }, { signal });
  grid.addEventListener("pointerdown", () => {
    if (searchTimer === undefined) return;
    cancelSearch(); pressing = true;
  }, { signal });
  // After the whole click: a checkbox's change, and a label's second click, run before the redraw.
  grid.addEventListener("click", () => {
    if (!pressing) return;
    cancelSearch(); pressing = false; searchTimer = setTimeout(redrawSearch, 0);
  }, { signal });
  // A press that ends without a click on the grid (released elsewhere, or a blocked click) still redraws.
  const released = () => { if (pressing && searchTimer === undefined) searchTimer = setTimeout(redrawSearch, 150); };
  const page: EventTarget = grid.ownerDocument ?? dialog; // the whole page: a release outside Media counts too
  page.addEventListener("pointerup", released, { signal });
  page.addEventListener("pointercancel", released, { signal });
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
