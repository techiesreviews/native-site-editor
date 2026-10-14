import { button, node } from "../ui/dom";
import { input } from "./media-library-fields";
import { setIcon } from "../icons";
import { cancellation } from "./media-busy-lock";
import type { MediaPickerOptions } from "./media-picker";

export type LibraryShell = ReturnType<typeof createMediaLibraryShell>;

/** The library's frame: header, the One bar, bulk bar, grid, sheet and footer. */
export function createMediaLibraryShell(
  container: HTMLElement, options: MediaPickerOptions, id: number,
  actions: { tagSelected: () => void; optimiseHeavy: () => void; deleteUnused: () => void; clear: () => void },
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
  const bulk = node("div", "media-library__bulk"); bulk.hidden = true;
  const bulkCount = node("span");
  const bulkTags = input("Tags for selected images", "text"); bulkTags.placeholder = "Add tags, comma separated";
  const tagButton = button("Tag selected", actions.tagSelected);
  const optimiseButton = button("Optimise heavy", actions.optimiseHeavy);
  const deleteButton = button("Delete unused", actions.deleteUnused);
  bulk.append(bulkCount, bulkTags, tagButton, optimiseButton, deleteButton, button("Clear", actions.clear));
  const grid = node("div", "media-library__grid"); grid.setAttribute("aria-label", "Media library");
  grid.append(node("p", "media-library__empty", "Reading media…"));
  const sheet = node("aside", "media-library__sheet"); sheet.hidden = true;
  browse.append(summary, bulk, grid); body.append(browse, sheet);
  const message = node("p", "media-library__message"); message.setAttribute("role", "status");
  const footer = node("footer", "media-library__footer", `Drop images anywhere here · Enter opens details · Arrow keys browse${modal ? " · Esc closes" : ""}`);
  dialog.append(header, toolbar, body, message, footer);
  container.append(dialog);
  if (modal) { modal.showModal(); search.focus(); }
  return { dialog, close, search, collections, more, browse, summary, bulk, bulkCount, bulkTags, grid, sheet, message, uploadInput };
}
