import { button, node } from "../ui/dom";
import { setIcon } from "../icons";
import { cancellation } from "./media-busy-lock";
import { mediaSelectionActions } from "./media-collection-choices";
import type { MediaPickerOptions } from "./media-picker";

export type LibraryShell = ReturnType<typeof createMediaLibraryShell>;

/** The library's frame: header, the One bar, grid, selection bar, sheet and footer. */
export function createMediaLibraryShell(
  container: HTMLElement, options: MediaPickerOptions, id: number,
  actions: { addTo: (opener: HTMLButtonElement) => void; takeOut: () => void; remove: () => void; more: (opener: HTMLButtonElement) => void; clear: () => void },
  modal?: HTMLDialogElement,
) {
  const dialog = modal ?? node("section", "media-library media-library--pane");
  const close = () => { if (modal) modal.close(); };
  const header = node("header", "media-library__header");
  const heading = node("div");
  const title = node("h2", "", options.onPick ? "Choose image" : "Media");
  title.id = `media-library-title-${id}`;
  dialog.setAttribute("aria-labelledby", title.id);
  if (!modal) dialog.setAttribute("role", "region");
  const uploadInput = node("input");
  uploadInput.type = "file"; uploadInput.name = "media-upload"; uploadInput.accept = "image/*,.heic,.heif"; uploadInput.multiple = true; uploadInput.hidden = true;
  uploadInput.className = "media-library__upload-input";
  uploadInput.setAttribute("aria-label", "Upload images");
  heading.append(title);
  header.append(heading);
  // The chooser keeps its own Upload and Close until the Media picker replaces it (slice 18);
  // in the explorer, adding is the first action in More.
  if (modal) {
    heading.append(node("p", "media-library__muted", "Repository images · Changes stay as drafts until Publish."));
    header.append(button("Upload images…", () => uploadInput.click()), cancellation("Close", close));
  }
  header.append(uploadInput);
  // One bar (media-manager ticket 06, tiles.html): search, Collections and More on one row.
  const toolbar = node("div", "media-library__bar");
  const searchField = node("div", "media-library__search");
  const search = node("input"); search.type = "search"; search.name = "media-search";
  search.placeholder = "Search"; search.setAttribute("aria-label", "Search media");
  searchField.append(search);
  const collections = node("select", "media-library__collections");
  collections.name = "media-collection"; collections.setAttribute("aria-label", "Collections");
  // A customizable select shows the chosen option in this button; other browsers keep the native control.
  const chosen = node("button"); chosen.type = "button";
  chosen.append(document.createElement("selectedcontent"));
  collections.append(chosen, new Option("All collections", ""));
  toolbar.append(searchField, collections);
  const more = node("button", "media-library__more"); more.type = "button";
  more.setAttribute("aria-label", "More"); more.setAttribute("aria-haspopup", "menu"); more.setAttribute("aria-expanded", "false");
  setIcon(more, "dots-three", 24);
  if (!modal) toolbar.append(more);
  const body = node("div", "media-library__body");
  const browse = node("section", "media-library__browse");
  // The count is for screen readers; the tiles show it.
  const summary = node("p", "sr-only"); summary.setAttribute("role", "status");
  // The selection bar (research 01, ticket 15): after the grid and sticky, so it stays in reach.
  const bulk = node("div", "media-library__bulk"); bulk.hidden = true;
  bulk.setAttribute("role", "group"); bulk.setAttribute("aria-label", "Selected files");
  const bulkCount = node("span", "media-library__bulk-count");
  const bulkActions = node("div", "media-library__bulk-actions");
  const addTo: HTMLButtonElement = button("Add to collection", () => actions.addTo(addTo));
  addTo.setAttribute("aria-haspopup", "menu"); addTo.setAttribute("aria-expanded", "false");
  const takeOut = button("", actions.takeOut), removeFiles = button("", actions.remove);
  bulkActions.append(addTo, takeOut, removeFiles);
  const bulkTools = node("div", "media-library__bulk-tools");
  const bulkMore: HTMLButtonElement = button("", () => actions.more(bulkMore), "button secondary media-library__bulk-more");
  bulkMore.setAttribute("aria-label", "More for selected files"); bulkMore.setAttribute("aria-haspopup", "menu"); bulkMore.setAttribute("aria-expanded", "false");
  setIcon(bulkMore, "dots-three", 20);
  bulkTools.append(bulkMore, button("Clear", actions.clear));
  bulk.append(bulkCount, bulkActions, bulkTools);
  // Files being added (ticket 06): the total, Cancel, files that could not be added, Show new files.
  const adding = node("section", "media-library__adding"); adding.hidden = true;
  adding.setAttribute("aria-label", "Files being added");
  const grid = node("div", "media-library__grid"); grid.setAttribute("aria-label", "Media library");
  grid.append(node("p", "media-library__empty", "Reading media…"));
  const sheet = node("aside", "media-library__sheet"); sheet.hidden = true;
  browse.append(summary, adding, grid, bulk); body.append(browse, sheet);
  const message = node("p", "media-library__message"); message.setAttribute("role", "status");
  const footer = node("footer", "media-library__footer", `Drop ${modal ? "images" : "files"} anywhere here · Enter opens details · Arrow keys browse${modal ? " · Esc closes" : ""}`);
  dialog.append(header, toolbar, body, message, footer);
  container.append(dialog);
  if (modal) { modal.showModal(); search.focus(); }
  return { dialog, close, search, collections, more, browse, summary, adding, bulk, bulkCount, addTo, takeOut, removeFiles, grid, sheet, message, uploadInput };
}

/** Show the selection bar while files are selected: Take out only inside a collection. */
export function syncSelectionBar(shell: Pick<LibraryShell, "bulk" | "bulkCount" | "takeOut" | "removeFiles">, count: number, viewing: string) {
  const labels = mediaSelectionActions(count, viewing);
  shell.bulk.hidden = !count; shell.bulkCount.textContent = labels.count;
  shell.takeOut.hidden = !labels.takeOut; shell.takeOut.textContent = labels.takeOut ?? "";
  shell.removeFiles.textContent = labels.remove;
}
