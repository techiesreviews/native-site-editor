import { button, node } from "../ui/dom";
import { input } from "./media-library-fields";
import { icon } from "../icons";
import { cleanUpMenuItem } from "./media-badge";
import type { MediaCleanUpItem, MediaCleanUpKind, MediaCleanUpSuggestions } from "./media-clean-up";
import {
  cleanedMessage, cleanUpGroupNames, cleanUpLimit, cleanUpScope, groupLine, itemLine, keepSelected,
  selectionLine, sizedSuggestions, undoEntries, undoneMessage,
} from "./media-clean-up-review";
import { basename, mediaKind } from "./media-library-filter";
import { removalNotice } from "./media-recently-removed";
import { takeSheet, type LibrarySheet, type LibrarySheetContext } from "./media-library-sheet";
import type { MediaCleanUpEntry } from "./media-picker";
import "./media-clean-up-review.css";

export interface CleanUpHost extends LibrarySheetContext {
  cleanUp: MediaCleanUpEntry;
  /** Back to the grid, focus to More. */
  close: () => void;
  /** The families Clean up removed last, kept by the view so Undo outlives leaving the screen. */
  memory: { undo?: string[] };
}

type Phase = { at: "groups" } | { at: "review"; kind: MediaCleanUpKind } | { at: "confirm"; kind: MediaCleanUpKind };

/** The Clean up review (ticket 10, the Tiles mockup): groups with preview collages, count and size;
 * a group's files as larger pictures, each chosen on its own; a confirmation with Keep files; then
 * Undo. Removed files go to Recently removed. Its own screen with Back; it redraws when the library
 * refreshes or the use check publishes. */
export function showCleanUp(sheet: LibrarySheet, h: CleanUpHost) {
  let phase: Phase = { at: "groups" };
  let selected = new Set<string>();
  /** The last ready suggestions: a recheck in progress keeps the open review steady. */
  let last: MediaCleanUpSuggestions | undefined;

  const current = () => {
    const state = h.cleanUp.state();
    const sizes = Object.fromEntries(h.library().items.map(item => [item.path, item.size]));
    const live = state && sizedSuggestions(state.suggestions, sizes);
    if (live?.state === "ready") last = live;
    return { live, badge: state?.badge, steady: live?.state === "not-checked" ? last : live };
  };
  const go = (next: Phase, focus = true) => { phase = next; draw(focus); };
  // The listing may not know a file's size; then its line says nothing rather than "0 B".
  const sizeKnown = (item: MediaCleanUpItem) => item.members.every(path => h.library().items.some(entry => entry.path === path && entry.size !== undefined));

  function draw(focus: boolean | string = true) {
    const { element } = sheet;
    takeSheet(sheet);
    element.dataset.mode = "clean-up";
    const version = sheet.version;
    sheet.redraw = () => {
      if (version !== sheet.version) return;
      const active = document.activeElement;
      draw(active instanceof HTMLElement && element.contains(active) ? active.dataset.focusKey ?? false : false);
    };
    const { live, badge, steady } = current();
    const head = node("header", "media-detail__head");
    const back = button("", () => phase.at === "groups" ? h.close() : go(phase.at === "confirm" ? { at: "review", kind: phase.kind } : { at: "groups" }), "media-detail__back");
    back.setAttribute("aria-label", "Back"); back.dataset.focusKey = "back"; back.append(icon("arrow-left", 20));
    const title = node("h3", "", ""); title.tabIndex = -1;
    head.append(back, title);
    element.append(head);

    if (phase.at === "groups") drawGroups();
    else {
      // A blocked or emptied group leads back to the groups, which say why.
      const group = steady?.state === "ready" ? steady.groups.find(entry => entry.kind === (phase as { kind: MediaCleanUpKind }).kind) : undefined;
      selected = keepSelected(selected, group?.items ?? []);
      if (!group || (phase.at === "confirm" && !selected.size)) { phase = { at: "groups" }; draw(focus); return; }
      if (phase.at === "review") drawReview(group.kind, group.items);
      else drawConfirm(group.kind, group.items.filter(item => selected.has(item.main)));
    }
    h.sync();
    if (focus === false) return;
    const target = typeof focus === "string" && element.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focus)}"]`);
    (target || title).focus();

    function drawGroups() {
      title.textContent = "Clean up";
      // Undo is offered while the files Clean up removed last are all still in Recently removed.
      const removed = h.memory.undo;
      if (removed && undoEntries(h.library().removed, removed).length !== removed.length) h.memory.undo = undefined;
      if (h.memory.undo && removed && h.adapter.restore) {
        const notice = node("div", "media-cleanup__notice"); notice.setAttribute("role", "status");
        const again = button("Undo", () => void h.task(async () => {
          const entries = undoEntries(h.library().removed, removed);
          if (entries.length !== removed.length) { h.memory.undo = undefined; h.tell("Restore these files from More → Recently removed."); return; }
          await h.adapter.restore!(entries);
          h.memory.undo = undefined;
          await h.refresh();
          h.tell(undoneMessage(removed));
          if (sheet.element.dataset.mode === "clean-up") draw();
        }), "button secondary");
        again.dataset.focusKey = "undo";
        notice.append(node("span", "", cleanedMessage(removed)), again);
        element.append(notice);
      }
      const ready = live?.state === "ready" && live.count > 0;
      if (!ready) element.append(node("p", "media-check__empty", live ? cleanUpMenuItem(live).disabled ?? "" : "Still checking which files are used."));
      else {
        const list = node("ul", "media-cleanup__groups");
        for (const group of live.groups) {
          const open = button("", () => { selected = new Set(); go({ at: "review", kind: group.kind }); }, "media-cleanup__group");
          open.dataset.focusKey = `group:${group.kind}`;
          const cover = node("span", "media-cleanup__cover"); cover.setAttribute("aria-hidden", "true");
          for (const item of group.items.slice(0, 3)) cover.append(preview(item.main));
          const meta = node("span", "media-cleanup__meta");
          meta.append(node("strong", "", cleanUpGroupNames[group.kind]), node("span", "", groupLine(group)));
          open.append(cover, meta);
          const item = node("li"); item.append(open);
          list.append(item);
        }
        element.append(list);
      }
      const scope = cleanUpScope(h.adapter.usage?.records(), h.library().keep?.length ?? 0);
      const notes = node("div", "media-cleanup__scope");
      for (const line of scope.lines) notes.append(node("p", "", line));
      element.append(notes, node("p", "media-cleanup__limit", cleanUpLimit));
      if (ready && badge?.show) {
        const dismiss = button("Dismiss", () => { h.cleanUp.dismiss(); draw(); }, "button secondary");
        const row = node("div", "media-cleanup__dismiss");
        row.append(dismiss, node("span", "media-library__muted", "Hides the count on the Media tab until other files turn up."));
        element.append(row);
      }
    }

    function drawReview(kind: MediaCleanUpKind, items: MediaCleanUpItem[]) {
      title.textContent = cleanUpGroupNames[kind];
      const all = items.every(item => selected.has(item.main));
      const toggle = button(all ? "Clear selection" : "Select all", () => {
        selected = all ? new Set() : new Set(items.map(item => item.main)); draw("select-all");
      }, "button secondary media-cleanup__select-all");
      toggle.dataset.focusKey = "select-all";
      element.append(node("p", "media-library__muted", "Choose the files to remove. Copies of an image go with it."), toggle);
      const grid = node("ul", "media-cleanup__photos");
      for (const item of items) {
        const card = node("li", "media-cleanup__photo"); card.dataset.path = item.main;
        const label = node("label", "media-cleanup__pick");
        const check = input(`Select ${basename(item.main)}`, "checkbox"); check.checked = selected.has(item.main);
        check.dataset.focusKey = `pick:${item.main}`;
        check.addEventListener("change", () => {
          if (check.checked) selected.add(item.main); else selected.delete(item.main);
          card.classList.toggle("is-selected", check.checked);
          paintFooter();
        });
        card.classList.toggle("is-selected", check.checked);
        const round = node("span", "media-cleanup__check"); round.append(check);
        const name = node("strong", "", basename(item.main)); name.title = item.main;
        const text = node("span", "media-cleanup__photo-text");
        text.append(name, node("span", "media-library__muted", itemLine(item, sizeKnown(item))));
        label.append(preview(item.main, true), round, text);
        card.append(label);
        grid.append(card);
      }
      const footer = node("div", "media-cleanup__footer");
      const sum = node("span", "media-cleanup__sum"); sum.setAttribute("aria-live", "polite");
      const next = button("Review removal", () => go({ at: "confirm", kind }), "button primary");
      next.dataset.focusKey = "review";
      footer.append(sum, next);
      element.append(grid, footer);
      paintFooter();
      function paintFooter() {
        sum.textContent = selectionLine(items, selected);
        next.disabled = !selected.size;
        const every = items.every(item => selected.has(item.main));
        toggle.textContent = every ? "Clear selection" : "Select all";
      }
    }

    function drawConfirm(kind: MediaCleanUpKind, items: MediaCleanUpItem[]) {
      const mains = items.map(item => item.main);
      const notice = removalNotice(mains, h.library().usage);
      title.textContent = notice.title;
      const files = node("ul", "media-check__list media-remove__files media-cleanup__confirm");
      for (const item of items) {
        const row = node("li", "media-check__row"); row.dataset.path = item.main;
        const text = node("div", "media-check__text");
        const name = node("strong", "", basename(item.main)); name.title = item.main;
        text.append(name, node("span", "media-library__muted", itemLine(item, sizeKnown(item))));
        row.append(preview(item.main), text);
        files.append(row);
      }
      element.append(files, node("p", notice.used ? "media-remove__warning" : "media-library__muted", notice.warning), node("p", "media-library__muted", notice.note));
      const keep = button("Keep files", () => go({ at: "review", kind }), "button secondary");
      keep.dataset.focusKey = "keep";
      const remove = button(notice.confirm, () => void h.task(async () => {
        if (version !== sheet.version || sheet.element.dataset.mode !== "clean-up") return;
        // `unusedOnly`: the removal checks every site file again and refuses a file used meanwhile.
        await h.adapter.remove(mains, true);
        phase = { at: "groups" };
        for (const main of mains) selected.delete(main);
        await h.refresh();
        // Recorded once the library lists the removed entries, so a redraw in between cannot drop it.
        h.memory.undo = mains;
        h.tell(cleanedMessage(mains));
        if (h.alive() && sheet.element.dataset.mode === "clean-up") draw();
      }), "button primary");
      const actions = node("div", "media-remove__actions");
      actions.append(keep, remove);
      element.append(actions);
    }
  }

  /** The picture, or a clean surface with the file's type. */
  function preview(path: string, large = false) {
    const frame = node("span", large ? "media-cleanup__preview" : "media-check__preview");
    const surface = () => {
      frame.classList.add("is-file");
      frame.replaceChildren(icon("file", large ? 28 : 20), node("span", "media-library__format", path.split(".").pop()?.toUpperCase() ?? "FILE"));
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
