import { button, node } from "../ui/dom";
import { setIcon } from "../icons";
import { mediaSelectionActions } from "./media-collection-choices";
import type { MediaPickerOptions } from "./media-picker";
import { pickerFileWord, pickerNoun } from "./media-library-filter";
import { allCollectionsOption } from "./media-library-refresh";

export type LibraryShell = ReturnType<typeof createMediaLibraryShell>;

/** The library's frame: header, the One bar, grid, selection bar, sheet and footer. */
export function createMediaLibraryShell(
  container: HTMLElement, options: MediaPickerOptions, id: number,
  actions: {
    addTo: (opener: HTMLButtonElement) => void; takeOut: () => void; remove: () => void; more: (opener: HTMLButtonElement) => void; clear: () => void;
    /** The picker's chosen file: its details, and Use. */
    details: () => void; use: () => void;
    /** Add → Media's address field (slice 68): Use with a pasted YouTube or Vimeo address. */
    address?: (text: string) => void;
  },
  modal?: HTMLDialogElement,
) {
  const dialog = modal ?? node("section", "media-library media-library--pane");
  const close = () => { if (modal) modal.close(); };
  const header = node("header", "media-library__header");
  const heading = node("div");
  const title = node("h2", "", modal ? `Choose ${pickerNoun(options.accept)}` : "Media");
  title.id = `media-library-title-${id}`;
  dialog.setAttribute("aria-labelledby", title.id);
  if (!modal) dialog.setAttribute("role", "region");
  const uploadInput = node("input");
  uploadInput.type = "file"; uploadInput.name = "media-upload"; uploadInput.accept = options.accept?.replace("image/*", "image/*,.heic,.heif") ?? ""; uploadInput.multiple = true; uploadInput.hidden = true;
  uploadInput.className = "media-library__upload-input";
  uploadInput.setAttribute("aria-label", "Add files");
  heading.append(title);
  header.append(heading);
  // The Media picker (ticket 06, tiles.html): a compact header naming the place, and Close.
  // Adding is the first action in More, as in the Media pane.
  if (modal) {
    if (options.place) heading.append(node("p", "media-library__muted media-library__place", options.place));
    // Close and Cancel stay usable while a change runs; neither places anything.
    const shut = button("", close, "media-library__close"); shut.dataset.mediaCancel = "close";
    shut.setAttribute("aria-label", "Close"); setIcon(shut, "x", 20);
    header.append(shut);
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
  collections.append(chosen, allCollectionsOption());
  toolbar.append(searchField, collections);
  const more = node("button", "media-library__more"); more.type = "button";
  more.setAttribute("aria-label", "More"); more.setAttribute("aria-haspopup", "menu"); more.setAttribute("aria-expanded", "false");
  setIcon(more, "dots-three", 24);
  toolbar.append(more);
  // Add → Media (slice 68): one field for a YouTube or Vimeo address, placed by its own Use.
  let online: { form: HTMLFormElement; field: HTMLInputElement; note: HTMLElement } | undefined;
  if (modal && actions.address) {
    const form = node("form", "media-library__online"), field = node("input"), note = node("p", "media-library__online-note");
    form.setAttribute("aria-label", "YouTube or Vimeo video");
    field.type = "url"; field.name = "media-online-address"; field.autocomplete = "off"; field.spellcheck = false;
    field.placeholder = "YouTube or Vimeo address"; field.setAttribute("aria-label", "YouTube or Vimeo address");
    note.id = `media-library-online-${id}`; note.setAttribute("role", "status"); field.setAttribute("aria-describedby", note.id);
    const submit = node("button", "", "Use"); submit.type = "submit";
    form.noValidate = true;
    form.addEventListener("submit", event => { event.preventDefault(); actions.address!(field.value); });
    field.addEventListener("input", () => { note.textContent = ""; field.removeAttribute("aria-invalid"); });
    form.append(field, submit, note);
    online = { form, field, note };
  }
  const body = node("div", "media-library__body");
  const browse = node("section", "media-library__browse");
  // The count is for screen readers; the tiles show it.
  const summary = node("p", "sr-only"); summary.setAttribute("role", "status");
  // The selection bar (research 01, ticket 15): after the grid and sticky, so it stays in reach.
  const bulk = node("div", "media-library__bulk"); bulk.hidden = true;
  bulk.setAttribute("role", "group"); bulk.setAttribute("aria-label", "Selected files");
  // One control clears the selection and shows its count ("✕ 3"), as Google Photos does (slice 107).
  const bulkCount = button("", actions.clear, "media-library__bulk-count");
  const bulkActions = node("div", "media-library__bulk-actions");
  const addTo: HTMLButtonElement = button("Add to collection", () => actions.addTo(addTo));
  addTo.setAttribute("aria-haspopup", "menu"); addTo.setAttribute("aria-expanded", "false");
  const takeOut = button("", actions.takeOut, "media-library__bulk-wide"), removeFiles = button("", actions.remove, "media-library__bulk-wide");
  bulkActions.append(addTo, takeOut, removeFiles);
  const bulkTools = node("div", "media-library__bulk-tools");
  const bulkMore: HTMLButtonElement = button("", () => actions.more(bulkMore), "button secondary media-library__bulk-more");
  bulkMore.setAttribute("aria-label", "More for selected files"); bulkMore.setAttribute("aria-haspopup", "menu"); bulkMore.setAttribute("aria-expanded", "false");
  setIcon(bulkMore, "dots-three", 20);
  bulkTools.append(bulkMore);
  bulk.append(bulkCount, bulkActions, bulkTools);
  // Files being added (ticket 06): the total, Cancel, files that could not be added, Show new files.
  const adding = node("section", "media-library__adding"); adding.hidden = true;
  adding.setAttribute("aria-label", "Files being added");
  const grid = node("div", "media-library__grid"); grid.setAttribute("aria-label", "Media library");
  grid.append(node("p", "media-library__empty", "Reading media…"));
  const sheet = node("aside", "media-library__sheet"); sheet.hidden = true;
  browse.append(summary, adding, grid, bulk); body.append(browse, sheet);
  const message = node("p", "media-library__message"); message.setAttribute("role", "status");
  const footer = modal ? node("footer", "media-library__choice") : node("footer", "media-library__footer", "Drop files anywhere here · Enter opens details · Arrow keys browse");
  // The picker's status above one row of Cancel and Use (phones), beside it on wider screens.
  const choice = node("div", "media-library__chosen"), chosenName = node("span", "media-library__chosen-name");
  const chosenThumb = node("span", "media-library__chosen-thumb");
  const detailsButton = button("File details", actions.details, "media-library__chosen-details");
  const use = button(`Use ${pickerFileWord(options.accept)}`, actions.use, "button primary media-library__use");
  if (modal) {
    const status = node("div", "media-library__chosen-text"); status.setAttribute("role", "status");
    status.append(chosenName);
    choice.append(chosenThumb, status, detailsButton);
    const row = node("div", "media-library__choice-actions");
    const cancel = button("Cancel", close); cancel.dataset.mediaCancel = "close";
    row.append(cancel, use);
    footer.append(choice, row);
  }
  dialog.append(header, toolbar, ...online ? [online.form] : [], body, message, footer);
  container.append(dialog);
  if (modal) { modal.showModal(); search.focus(); }
  return {
    dialog, close, search, collections, more, browse, summary, adding, bulk, bulkCount, bulkMore, addTo, takeOut, removeFiles, grid, sheet, message, uploadInput,
    choice: { thumb: chosenThumb, name: chosenName, details: detailsButton, use }, online,
  };
}

/** Show the selection bar while files are selected: Take out only inside a collection. */
export function syncSelectionBar(shell: Pick<LibraryShell, "bulk" | "bulkCount" | "takeOut" | "removeFiles">, count: number, viewing: string) {
  const labels = mediaSelectionActions(count, viewing);
  shell.bulk.hidden = !count;
  // Phones show the number alone beside the ✕; the words stay for wider screens and screen readers.
  const icon = node("span", "media-library__bulk-clear"); icon.setAttribute("aria-hidden", "true");
  shell.bulkCount.replaceChildren(icon, String(count), node("span", "media-library__bulk-word", " selected"));
  shell.bulkCount.setAttribute("aria-label", `${labels.count}. Clear selection`);
  shell.takeOut.hidden = !labels.takeOut; shell.takeOut.textContent = labels.takeOut ?? "";
  shell.removeFiles.textContent = labels.remove;
}
