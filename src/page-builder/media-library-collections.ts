import { button, node } from "../ui/dom";
import { icon } from "../icons";
import type { MenuItem } from "../components/row-menu";
import { field, input } from "./media-library-fields";
import { sheetHead, takeSheet, type LibrarySheet, type LibrarySheetContext } from "./media-library-sheet";
import { filesLabel, mediaCollectionNameMessage, mediaCollectionSizes } from "./media-collection-choices";

/** What the collection screens need beyond the sheet context. */
export interface CollectionScreensHost extends LibrarySheetContext {
  /** Close the sheet and give focus back to whatever opened it. */
  close: () => void;
  /** The viewed collection follows its rename. */
  follow: (from: string, to: string) => void;
  /** The view's one menu, under a row's ⋯ (a second press closes it). */
  menu: (opener: HTMLButtonElement, label: string, items: MenuItem[]) => void;
}

let fieldIds = 0;

/** Manage collections: every collection with one ⋯ menu (Rename, Delete), plus New collection
 * (ticket 15, audit slice 111). It redraws after each refresh, so Undo from outside shows at once. */
export function showManageCollections(sheet: LibrarySheet, h: CollectionScreensHost) {
  // `focus` names the control to focus; null leaves focus alone (a background refresh).
  const draw = (focus?: string | null) => {
    const { element } = sheet;
    const library = h.library();
    takeSheet(sheet);
    element.dataset.mode = "collections";
    sheet.redraw = () => {
      const active = document.activeElement;
      draw(active instanceof HTMLElement && element.contains(active) ? active.getAttribute("aria-label") ?? active.textContent ?? "" : null);
    };
    const { title } = sheetHead(element, "Manage collections", h.close, "Deleting a collection keeps its files in Media.");
    const sizes = mediaCollectionSizes(library);
    if (sizes.size) {
      const list = node("ul", "media-library__collection-list");
      for (const [name, size] of sizes) {
        const row = node("li", "media-library__collection-row");
        const more: HTMLButtonElement = button("", () => h.menu(more, `More for ${name}`, [
          { label: "Rename…", run: () => showCollectionName(sheet, h, { renaming: name, done: saved => draw(`More for ${saved ?? name}`) }) },
          { label: "Delete…", danger: true, run: () => showCollectionDelete(sheet, h, name, gone => draw(gone ? "New collection" : `More for ${name}`)) },
        ]), "media-library__row-more");
        more.setAttribute("aria-label", `More for ${name}`); more.setAttribute("aria-haspopup", "menu"); more.setAttribute("aria-expanded", "false");
        more.append(icon("dots-three", 20));
        const text = node("span", "media-library__collection-name");
        text.append(node("strong", "", name), node("span", "media-library__muted", filesLabel(size)));
        row.append(text, more);
        list.append(row);
      }
      element.append(list);
    } else element.append(node("p", "media-library__muted", "No collections yet."));
    // The screen's last action row, pinned at the bottom like every media sub-screen's (audit C1).
    const actions = node("div", "media-library__sheet-actions");
    actions.append(button("New collection", () => showCollectionName(sheet, h, { done: () => draw("New collection") }), "button primary"));
    element.append(actions);
    h.sync();
    if (focus === null) return;
    const target = focus && [...element.querySelectorAll<HTMLElement>("button")]
      .find(control => (control.getAttribute("aria-label") ?? control.textContent) === focus);
    (target || title).focus();
  };
  draw();
}

/** New collection (optionally holding the selected files) or Rename collection. The field says
 * a taken name is taken as you type; nothing is merged. `done` gets the saved name, or nothing on Cancel. */
export function showCollectionName(sheet: LibrarySheet, h: CollectionScreensHost,
  { renaming, paths = [], done }: { renaming?: string; paths?: string[]; done: (saved?: string) => void }) {
  const { element } = sheet;
  takeSheet(sheet);
  element.dataset.mode = "collection-name";
  const version = sheet.version;
  sheetHead(element, renaming ? `Rename "${renaming}"` : "New collection", () => done());
  const name = input("Collection name", "text"); name.value = renaming ?? ""; name.autocomplete = "off";
  const problem = node("p", "media-library__problem"); problem.id = `media-collection-problem-${++fieldIds}`;
  problem.setAttribute("aria-live", "polite");
  name.setAttribute("aria-describedby", problem.id);
  const check = (submitting: boolean) => {
    const message = mediaCollectionNameMessage(h.library().collections, name.value, renaming);
    // An empty field is only a problem once you try to save it.
    problem.textContent = message && (submitting || name.value.trim()) ? message : "";
    name.setAttribute("aria-invalid", String(Boolean(problem.textContent)));
    return !message;
  };
  name.addEventListener("input", () => check(false));
  const submit = () => {
    if (!check(true)) { name.focus(); return; }
    const chosen = name.value.trim();
    void h.task(async () => {
      if (version !== sheet.version) return;
      if (renaming) {
        if (chosen !== renaming) {
          await h.adapter.collections({ kind: "rename", from: renaming, to: chosen });
          h.follow(renaming, chosen);
        }
      } else await h.adapter.collections({ kind: "new", name: chosen, paths });
      await h.refresh();
      if (version === sheet.version) done(chosen);
      h.done(renaming ? `Renamed the collection "${renaming}" to "${chosen}".`
        : paths.length ? `Added ${filesLabel(paths.length)} to the new collection "${chosen}".` : `Created the collection "${chosen}".`);
    });
  };
  name.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); submit(); } });
  element.append(field("Name", name), problem);
  if (paths.length) element.append(node("p", "media-library__muted", `The ${filesLabel(paths.length)} you selected go into it.`));
  const actions = node("div", "media-library__sheet-actions");
  actions.append(button("Cancel", () => done()), button(renaming ? "Rename" : "Create", submit, "button primary"));
  element.append(actions);
  h.sync();
  name.focus(); name.select();
}

/** Deleting a collection removes only the group; its files stay (ticket 15). `done(true)` once deleted. */
export function showCollectionDelete(sheet: LibrarySheet, h: CollectionScreensHost, name: string, done: (deleted?: boolean) => void) {
  const { element } = sheet;
  takeSheet(sheet);
  element.dataset.mode = "collection-delete";
  const version = sheet.version;
  const size = mediaCollectionSizes(h.library()).get(name) ?? 0;
  const { title } = sheetHead(element, `Delete the collection "${name}"?`, () => done());
  element.append(node("p", "", size
    ? `Its ${filesLabel(size)} ${size === 1 ? "stays" : "stay"} in Media, under All and any other collections. Nothing on your site changes.`
    : "It has no files. Nothing on your site changes."));
  const actions = node("div", "media-library__sheet-actions");
  actions.append(button("Cancel", () => done()), button("Delete collection", () => void h.task(async () => {
    if (version !== sheet.version) return;
    await h.adapter.collections({ kind: "delete", name });
    await h.refresh();
    if (version === sheet.version) done(true);
    h.done(`Deleted the collection "${name}". Its files stay in Media.`);
  }), "button primary"));
  element.append(actions);
  h.sync();
  title.focus();
}
