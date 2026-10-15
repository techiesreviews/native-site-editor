import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { cancellation } from "./media-busy-lock";
import { basename, mediaKind } from "./media-library-filter";
import { removalNotice, removedMessage } from "./media-recently-removed";
import { takeSheet, type LibrarySheet, type LibrarySheetContext } from "./media-library-sheet";

type DeleteContext = Pick<LibrarySheetContext, "alive" | "library" | "loading" | "tell" | "done" | "task" | "refresh" | "adapter" | "cache"> & {
  /** Opens a page that uses the file, so Lex can swap its picture first. */
  openPage?: (page: string) => void;
  /** A page's title in the Pages tab. */
  pageLabel?: (page: string) => string | undefined;
};

/** Remove file (ticket 10): its own screen with Back. A file that pages still use is allowed after a
 * warning naming those pages, each with Open; removed files go to Recently removed. `back` is where
 * Cancel and Back return (File details, or the grid); afterwards focus moves to the thumbnail now at
 * the removed one's place. */
export function confirmMediaDelete(sheet: LibrarySheet, grid: HTMLElement, c: DeleteContext, paths: string[], unusedOnly = false, back?: () => void) {
  const { element } = sheet, { tell } = c;
  if (!c.alive()) return;
  if (c.loading()) { tell("Repository images are refreshing. Wait for them to finish before deleting images."); return; }
  takeSheet(sheet);
  if (!paths.length) { element.append(node("p", "", "None of the selected images are unused. References in components and CSS also count.")); return; }
  element.dataset.mode = "delete"; element.dataset.deletePath = paths[0];
  const confirmationVersion = sheet.version;
  const { usage } = c.library();
  const notice = removalNotice(paths, usage);
  const leave = () => {
    sheet.version++; element.hidden = true; delete element.dataset.mode; element.replaceChildren();
    if (back) back();
  };
  const head = node("header", "media-detail__head");
  const backButton = button("", leave, "media-detail__back");
  backButton.setAttribute("aria-label", "Back"); backButton.append(icon("arrow-left", 20));
  const title = node("h3", "", notice.title); title.tabIndex = -1;
  head.append(backButton, title);
  const files = node("ul", "media-check__list media-remove__files");
  for (const path of paths) {
    const row = node("li", "media-check__row"); row.dataset.path = path;
    const text = node("div", "media-check__text");
    const name = node("strong", "", basename(path)); name.title = path;
    const pages = usage[path]?.pages.length ?? 0;
    text.append(name, node("span", "media-library__muted", pages ? `Used on ${pages} ${pages === 1 ? "page" : "pages"}` : "No page uses it"));
    row.append(preview(path), text);
    files.append(row);
  }
  element.append(head, files, node("p", notice.used ? "media-remove__warning" : "", notice.warning));
  if (notice.pages.length) {
    const list = node("ul", "media-remove__pages");
    for (const page of notice.pages) {
      const label = c.pageLabel?.(page);
      const item = node("li"), text = node("span", "media-remove__page");
      text.append(node("strong", "", label ?? page), ...label && label !== page ? [node("span", "media-library__muted", page)] : []);
      item.append(text);
      if (c.openPage) {
        const open = button("Open page", () => c.openPage!(page));
        open.setAttribute("aria-label", `Open ${label ?? page}`);
        item.append(open);
      }
      list.append(item);
    }
    element.append(list);
  }
  if (notice.others.length) element.append(node("p", "media-library__hint", `Also mentioned in ${notice.others.join(", ")}.`));
  const actions = node("div", "media-remove__actions");
  actions.append(cancellation("Cancel", leave),
    button(notice.confirm, () => void c.task(async () => {
      if (confirmationVersion !== sheet.version || element.dataset.mode !== "delete") {
        tell("This delete confirmation has expired. Open a new confirmation to review current image references."); return;
      }
      const thumbnails = [...grid.querySelectorAll<HTMLElement>(".media-library__thumbnail")];
      const deletedIndex = thumbnails.findIndex(control => paths.includes(control.closest<HTMLElement>(".media-library__card")!.dataset.path!));
      const initiatingFocus = document.activeElement;
      const restoreBrowseFocus = initiatingFocus instanceof Element && element.contains(initiatingFocus);
      await c.adapter.remove(paths, unusedOnly); element.hidden = true; delete element.dataset.mode; await c.refresh();
      if (restoreBrowseFocus && (document.activeElement === initiatingFocus || document.activeElement === document.body || !document.activeElement?.isConnected)) {
        const remaining = [...grid.querySelectorAll<HTMLElement>(".media-library__thumbnail")];
        const target = remaining[Math.min(Math.max(deletedIndex, 0), remaining.length - 1)] ?? grid;
        if (target === grid) grid.tabIndex = -1;
        target.focus();
      }
      c.done(removedMessage(paths));
    }), "button primary"));
  element.append(node("p", "media-library__muted", notice.note), actions);
  title.focus();

  /** The picture, or a clean surface with the file's type. */
  function preview(path: string) {
    const frame = node("span", "media-check__preview");
    const surface = () => {
      frame.classList.add("is-file");
      frame.replaceChildren(icon("file", 20), node("span", "media-library__format", path.split(".").pop()?.toUpperCase() ?? "FILE"));
    };
    if (mediaKind(path) !== "image") { surface(); return frame; }
    const image = node("img"); image.alt = ""; image.decoding = "async";
    image.addEventListener("error", surface, { once: true });
    frame.append(image);
    void c.cache.get(path).then(data => { if (c.alive() && frame.isConnected) image.src = data.url; }).catch(surface);
    return frame;
  }
}
