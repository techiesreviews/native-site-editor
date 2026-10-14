import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { basename, mediaKind } from "./media-library-filter";
import { takeSheet, type LibrarySheet, type LibrarySheetContext } from "./media-library-sheet";
import type { MediaToCheckRow } from "./media-descriptions";

/** What To check needs beyond the sheet context. */
export interface ToCheckHost extends LibrarySheetContext {
  /** Back to the grid, focus to what opened To check. */
  close: () => void;
  /** A page's title in the Pages tab. */
  pageLabel: (page: string) => string | undefined;
}

const rowKey = (row: { file: string; page?: string }) => `${row.file}\n${row.page ?? ""}`;

/** More's item: the count shows while anything waits. */
export const toCheckLabel = (rows: MediaToCheckRow[] | undefined) => rows?.length ? `To check (${rows.length})` : "To check";

/** To check (ticket 13): each description an agent wrote, with its picture or file, its words,
 * OK (the words stay, the mark goes) and Edit (Lex's words replace them, which clears it too).
 * Its own screen with Back, like File details; it redraws after every refresh, keeping open edits. */
export function showToCheck(sheet: LibrarySheet, h: ToCheckHost) {
  /** Open edits: the agent's words Lex saw when pressing Edit, and the words typed so far. */
  const editing = new Map<string, { seen: string; value: string }>();
  // `focus` names the control to focus; null leaves focus alone (a background refresh).
  const draw = (focus?: string | null) => {
    const { element } = sheet;
    const rows = h.library().toCheck ?? [];
    for (const key of [...editing.keys()]) if (!rows.some(row => rowKey(row) === key)) editing.delete(key);
    takeSheet(sheet);
    element.dataset.mode = "to-check";
    sheet.redraw = () => {
      const active = document.activeElement;
      // Unfinished words survive the redraw.
      for (const area of element.querySelectorAll<HTMLTextAreaElement>("textarea[data-key]")) {
        const open = editing.get(area.dataset.key!);
        if (open) open.value = area.value;
      }
      draw(active instanceof HTMLElement && element.contains(active) ? active.getAttribute("aria-label") ?? active.textContent ?? "" : null);
    };
    const version = sheet.version;
    const head = node("header", "media-detail__head");
    const back = button("", h.close, "media-detail__back");
    back.setAttribute("aria-label", "Back"); back.append(icon("arrow-left", 20));
    const title = node("h3", "", "To check"); title.tabIndex = -1;
    head.append(back, title);
    element.append(head);
    if (!rows.length) {
      element.append(node("p", "media-check__empty", "Nothing to check. Descriptions an agent writes wait here until you press OK or edit them."));
    } else {
      element.append(node("p", "media-library__muted", "An agent wrote these descriptions. Press OK if they read right, or Edit to change them."));
      const list = node("ul", "media-check__list");
      rows.forEach((row, index) => list.append(drawRow(row, rows[index + 1])));
      element.append(list);
    }
    h.sync();
    if (focus === null) return;
    const target = focus && [...element.querySelectorAll<HTMLElement>("button, textarea")]
      .find(control => (control.getAttribute("aria-label") ?? control.textContent) === focus);
    (target || title).focus();

    function drawRow(row: MediaToCheckRow, next: MediaToCheckRow | undefined) {
      const key = rowKey(row), name = basename(row.file);
      const where = row.page === undefined ? "" : ` on ${h.pageLabel(row.page) ?? row.page}`;
      const item = node("li", "media-check__row"); item.dataset.path = row.file;
      if (row.page !== undefined) item.dataset.page = row.page;
      item.append(preview(row.file));
      const text = node("div", "media-check__text");
      const file = node("strong", "", name); file.title = row.file;
      text.append(file, node("span", "media-library__muted", row.page === undefined ? "Description" : `Own words${where}`));
      const actions = node("div", "media-check__actions");
      const open = editing.get(key);
      if (!open) {
        text.append(node("p", "media-check__words", row.text));
        const ok = button("OK", () => void h.task(async () => {
          if (version !== sheet.version) return;
          await h.adapter.check!(row);
          await h.refresh();
          h.tell(`Checked the description of ${name}${where}.`);
          // Focus moves on to the next row's OK, or to the heading when nothing is left.
          if (version !== sheet.version && sheet.element.dataset.mode === "to-check") focusAfter(next);
        }), "button primary");
        ok.setAttribute("aria-label", `OK ${name}${where}`);
        const edit = button("Edit", () => {
          editing.set(key, { seen: row.text, value: row.text });
          draw(`Description for ${name}${where}`);
        });
        edit.setAttribute("aria-label", `Edit ${name}${where}`);
        actions.append(ok, edit);
      } else {
        const area = node("textarea", "media-check__field"); area.rows = 3; area.value = open.value; area.dataset.key = key;
        area.setAttribute("aria-label", `Description for ${name}${where}`);
        area.addEventListener("input", () => { open.value = area.value; });
        text.append(area);
        const save = button("Save", () => {
          if (!area.value.trim()) { h.tell("Write the description, or press OK to keep these words."); area.focus(); return; }
          void h.task(async () => {
            if (version !== sheet.version) return;
            // The words Lex was editing: if an agent changed them meanwhile, the host refuses.
            await h.adapter.check!({ ...row, text: open.seen }, area.value);
            editing.delete(key);
            await h.refresh();
            h.tell(`Saved the description of ${name}${where} as a draft.`);
            if (version !== sheet.version && sheet.element.dataset.mode === "to-check") focusAfter(next);
          });
        }, "button primary");
        save.setAttribute("aria-label", `Save ${name}${where}`);
        const cancel = button("Cancel", () => { editing.delete(key); draw(`Edit ${name}${where}`); });
        cancel.setAttribute("aria-label", `Cancel ${name}${where}`);
        actions.append(save, cancel);
      }
      item.append(text, actions);
      return item;
    }
  };
  /** After a row leaves, focus the next row's first action, or the heading. */
  function focusAfter(next: MediaToCheckRow | undefined) {
    const row = next && [...sheet.element.querySelectorAll<HTMLElement>(".media-check__row")]
      .find(item => item.dataset.path === next.file && item.dataset.page === next.page);
    (row?.querySelector<HTMLElement>("button, textarea") ?? sheet.element.querySelector<HTMLElement>("h3"))?.focus();
  }
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
    void h.cache.get(path).then(data => { if (h.alive() && frame.isConnected) image.src = data.url; }).catch(surface);
    return frame;
  }
  draw();
}
