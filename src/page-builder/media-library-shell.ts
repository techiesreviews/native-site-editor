import { button, node } from "../ui/dom";
import { input, select } from "./media-library-fields";
import { cancellation } from "./media-busy-lock";
import type { MediaPickerOptions } from "./media-picker";

export type LibraryShell = ReturnType<typeof createMediaLibraryShell>;

/** The library's frame: header, toolbar, chips, bulk bar, grid, sheet and footer. */
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
  heading.append(title, node("p", "media-library__muted", modal ? "Repository images · Changes stay as drafts until Publish." : "Changes stay as drafts until Publish."));
  const uploadInput = node("input");
  uploadInput.type = "file"; uploadInput.name = "media-upload"; uploadInput.accept = "image/*,.heic,.heif"; uploadInput.multiple = true; uploadInput.hidden = true;
  uploadInput.className = "media-library__upload-input";
  uploadInput.setAttribute("aria-label", "Upload images");
  const uploadButton = button("Upload images…", () => uploadInput.click());
  const closeButton = cancellation("Close", close);
  header.append(heading, uploadButton);
  if (modal) header.append(closeButton);
  header.append(uploadInput);
  const toolbar = node("div", "media-library__toolbar");
  const search = node("input"); search.type = "search"; search.name = "media-search";
  search.placeholder = "Search name, tag or alt text…"; search.setAttribute("aria-label", "Search images");
  const folders = select("Folder", [["", "All folders"]]);
  const sort = select("Sort images", [["name", "Name"], ["date", "Newest drafts"], ["size", "Largest first"]]);
  toolbar.append(search, folders, sort);
  const chips = node("div", "media-library__chips"); chips.setAttribute("aria-label", "Filter by tag");
  const body = node("div", "media-library__body");
  const browse = node("section", "media-library__browse");
  const summary = node("p", "media-library__muted"); summary.setAttribute("role", "status");
  const bulk = node("div", "media-library__bulk"); bulk.hidden = true;
  const bulkCount = node("span");
  const bulkTags = input("Tags for selected images", "text"); bulkTags.placeholder = "Add tags, comma separated";
  const tagButton = button("Tag selected", actions.tagSelected);
  const optimiseButton = button("Optimise heavy", actions.optimiseHeavy);
  const deleteButton = button("Delete unused", actions.deleteUnused);
  bulk.append(bulkCount, bulkTags, tagButton, optimiseButton, deleteButton, button("Clear", actions.clear));
  const grid = node("div", "media-library__grid"); grid.setAttribute("aria-label", "Media library");
  const sheet = node("aside", "media-library__sheet"); sheet.hidden = true;
  browse.append(summary, bulk, grid); body.append(browse, sheet);
  const message = node("p", "media-library__message"); message.setAttribute("role", "status");
  const footer = node("footer", "media-library__footer", `Drop images anywhere here · Enter opens details · Arrow keys browse${modal ? " · Esc closes" : ""}`);
  dialog.append(header, toolbar, chips, body, message, footer);
  container.append(dialog);
  if (modal) { modal.showModal(); search.focus(); }
  return { dialog, close, search, folders, sort, chips, browse, summary, bulk, bulkCount, bulkTags, grid, sheet, message, uploadInput };
}
