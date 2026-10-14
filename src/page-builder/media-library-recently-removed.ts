import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { mediaKind } from "./media-library-filter";
import { removedMembersLabel, removedRows, restoreRefusal, type RemovedRow } from "./media-recently-removed";
import { removedToday, RECENTLY_REMOVED_DAYS } from "./recently-removed";
import { takeSheet, type LibrarySheet, type LibrarySheetContext } from "./media-library-sheet";

/** What Recently removed needs beyond the sheet context. */
export interface RecentlyRemovedHost extends LibrarySheetContext {
  /** Back to the grid, focus to what opened it. */
  close: () => void;
}

/** Recently removed (ticket 10), from More: each removed file with its date, the days it stays and
 * Restore, which brings it (and its family) back to the same address in one Undo step, even after
 * publishing. Its own screen with Back, like To check; it redraws after every refresh. */
export function showRecentlyRemoved(sheet: LibrarySheet, h: RecentlyRemovedHost) {
  /** Pictures already read, by removal identity, so a redraw does not read them again. */
  const pictures = new Map<string, Promise<string | undefined>>();
  const draw = (focus?: string | null) => {
    const { element } = sheet;
    const rows = removedRows(h.library().removed ?? [], removedToday(Date.now()));
    takeSheet(sheet);
    element.dataset.mode = "recently-removed";
    sheet.redraw = () => {
      const active = document.activeElement;
      draw(active instanceof HTMLElement && element.contains(active) ? active.getAttribute("aria-label") ?? active.textContent ?? "" : null);
    };
    const version = sheet.version;
    const head = node("header", "media-detail__head");
    const back = button("", h.close, "media-detail__back");
    back.setAttribute("aria-label", "Back"); back.append(icon("arrow-left", 20));
    const title = node("h3", "", "Recently removed"); title.tabIndex = -1;
    head.append(back, title);
    element.append(head);
    if (!rows.length) {
      element.append(node("p", "media-check__empty", `Nothing removed in the last ${RECENTLY_REMOVED_DAYS} days. Files you remove wait here for ${RECENTLY_REMOVED_DAYS} days.`));
    } else {
      element.append(node("p", "media-library__muted", `Removed files stay here for ${RECENTLY_REMOVED_DAYS} days. Restore puts a file back at its address, so pages that used it show it again.`));
      const list = node("ul", "media-check__list media-removed__list");
      rows.forEach((row, index) => list.append(drawRow(row, rows[index + 1])));
      element.append(list);
    }
    h.sync();
    if (focus === null) return;
    const target = focus && [...element.querySelectorAll<HTMLElement>("button")]
      .find(control => (control.getAttribute("aria-label") ?? control.textContent) === focus);
    (target || title).focus();

    function drawRow(row: RemovedRow, next: RemovedRow | undefined) {
      const item = node("li", "media-check__row"); item.dataset.path = row.path;
      const text = node("div", "media-check__text");
      const name = node("strong", "", row.name); name.title = row.path;
      text.append(name, node("span", "media-library__muted", `${row.when} · ${row.left}`));
      const family = removedMembersLabel(row.members);
      if (family) text.append(node("span", "media-library__muted", family));
      if (row.browserOnly) text.append(node("span", "media-library__muted", "Kept in this browser only"));
      const restore = button("Restore", () => void h.task(async () => {
        if (version !== sheet.version) return;
        try { await h.adapter.restore!([{ path: row.path, id: row.id }]); }
        catch (error) { h.tell(restoreRefusal(error, row.path)); return; }
        await h.refresh();
        h.tell(`Restored ${row.name} to ${row.path}. Pages that used it show it again.`);
        // Focus moves on to the next row's Restore, or to the heading when nothing is left.
        if (version !== sheet.version && sheet.element.dataset.mode === "recently-removed") {
          const after = next && sheet.element.querySelector<HTMLElement>(`.media-check__row[data-path="${CSS.escape(next.path)}"] button`);
          (after ?? sheet.element.querySelector<HTMLElement>("h3"))?.focus();
        }
      }), "button primary");
      restore.setAttribute("aria-label", `Restore ${row.name}`);
      const actions = node("div", "media-check__actions");
      actions.append(restore);
      item.append(preview(row), text, actions);
      return item;
    }
  };
  /** The removed picture, read from history or this browser's copy; else a clean surface with the type. */
  function preview(row: RemovedRow) {
    const frame = node("span", "media-check__preview");
    const surface = () => {
      frame.classList.add("is-file");
      frame.replaceChildren(icon("file", 20), node("span", "media-library__format", row.path.split(".").pop()?.toUpperCase() ?? "FILE"));
    };
    if (mediaKind(row.path) !== "image" || !h.adapter.removedBlob) { surface(); return frame; }
    const image = node("img"); image.alt = ""; image.decoding = "async";
    image.addEventListener("error", surface, { once: true });
    frame.append(image);
    let url = pictures.get(row.id);
    if (!url) {
      url = h.adapter.removedBlob({ path: row.path, id: row.id }).then(blob => h.alive() ? h.cache.objectUrl(blob) : undefined, () => undefined);
      pictures.set(row.id, url);
    }
    void url.then(value => { if (!value) surface(); else if (h.alive() && frame.isConnected) image.src = value; });
    return frame;
  }
  draw();
}
