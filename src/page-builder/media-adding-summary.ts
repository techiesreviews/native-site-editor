import "./media-adding-summary.css";
import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { basename } from "./media-library-filter";
import { MEDIA_ADDING_WORDS, mediaAddingCancellable, mediaAddingOffers, mediaAddingStatus, type MediaAddingState } from "./media-adding-rules";

/** One file as the summary shows it. `cancel` is offered on its row while it can be stopped;
 * `key` keeps the row (and its focus) from one paint to the next. */
export interface MediaAddingSummaryEntry {
  key?: object; name: string; state: MediaAddingState; error?: string; note?: string; cancel?: () => void;
}
export interface MediaAddingSummaryActions {
  cancel(): void; retry(): void; dismiss(): void;
  showNew?(): void; review?(): void;
}
export interface MediaAddingSummaryView {
  entries: MediaAddingSummaryEntry[];
  /** The picker holds ready files for Use: no Dismiss, and its own words once they are ready. */
  hold?: boolean; text?: string;
  showNew?: boolean; review?: boolean;
}

/** The short progress summary every way of adding shares (media-manager ticket 07, research 01 §4):
 * how many files, a bar, Cancel, then what was added, Large download notes, the files that could
 * not be added with their advice, and Retry. The Media pane and picker draw each file's progress on
 * its tile; where there are no tiles (`rows`), each file being added has a row with its own Cancel. */
export function createMediaAddingSummary(root: HTMLElement, actions: MediaAddingSummaryActions, rows = false) {
  const status = node("p", "media-library__adding-status"); status.setAttribute("role", "status");
  const bar = node("progress", "media-library__adding-bar"); bar.setAttribute("aria-label", "Files added");
  const list = node("ul", "media-library__adding-rows"), failed = node("ul", "media-library__adding-failed");
  const notes = node("ul", "media-library__adding-notes");
  const showNew = button("Show new files", () => actions.showNew?.());
  const review = button("Review…", () => actions.review?.());
  const retry = button("Retry", () => actions.retry());
  const cancel = button("Cancel", () => actions.cancel());
  const dismiss = button("", () => actions.dismiss(), "media-library__adding-dismiss");
  dismiss.setAttribute("aria-label", "Dismiss"); dismiss.append(icon("x", 20));
  for (const control of [cancel, dismiss, showNew]) control.dataset.mediaCancel = "adding";
  const head = node("div", "media-library__adding-head"), buttons = node("div", "media-library__adding-actions");
  buttons.append(showNew, review, retry, cancel, dismiss);
  head.append(status, buttons); root.append(head, bar);
  if (rows) root.append(list);
  root.append(failed, notes);
  const rowOf = new Map<object, HTMLLIElement>(), cancels = new Map<object, () => void>();

  function row(entry: MediaAddingSummaryEntry) {
    const key = entry.key ?? entry;
    let item = rowOf.get(key);
    if (entry.cancel) cancels.set(key, entry.cancel);
    if (!item) {
      item = node("li", "media-library__adding-row");
      const name = basename(entry.name), stop = button("", () => cancels.get(key)?.(), "media-library__adding-row-cancel");
      stop.setAttribute("aria-label", `Cancel adding ${name}`); stop.dataset.mediaCancel = "adding"; stop.append(icon("x", 20));
      item.append(node("span", "media-library__adding-row-name", name), node("span", "media-library__adding-row-state"), stop);
      rowOf.set(key, item);
    }
    item.dataset.state = entry.state;
    item.querySelector(".media-library__adding-row-state")!.textContent = MEDIA_ADDING_WORDS[entry.state] ?? "";
    item.querySelector<HTMLButtonElement>(".media-library__adding-row-cancel")!.hidden = !entry.cancel || !mediaAddingCancellable(entry.state);
    return item;
  }
  return {
    paint(view: MediaAddingSummaryView) {
      const states = view.entries.map(entry => entry.state);
      const { text, running, done, total } = mediaAddingStatus(states), offers = mediaAddingOffers(states, view.hold);
      root.hidden = !text; status.textContent = view.text ?? text;
      bar.hidden = !running; bar.max = Math.max(1, total); bar.value = done;
      if (rows) {
        const current = view.entries.filter(entry => mediaAddingCancellable(entry.state) || entry.state === "adding");
        const keys = new Set(current.map(entry => entry.key ?? entry));
        for (const [key, item] of rowOf) if (!keys.has(key)) { item.remove(); rowOf.delete(key); cancels.delete(key); }
        const items = current.map(row);
        if (items.some((item, index) => list.children[index] !== item)) list.replaceChildren(...items);
      }
      failed.replaceChildren(...view.entries.filter(entry => entry.state === "failed").map(entry =>
        node("li", "", `${basename(entry.name)}: ${entry.error}`)));
      // Notes stay with files on their way in or added; a cancelled or failed file's note is moot.
      notes.replaceChildren(...view.entries.filter(entry => entry.note && entry.state !== "cancelled" && entry.state !== "failed")
        .map(entry => node("li", "", entry.note)));
      showNew.hidden = !view.showNew; review.hidden = !view.review;
      retry.hidden = !offers.retry; cancel.hidden = !offers.cancel; dismiss.hidden = !offers.dismiss;
    },
    /** After a Cancel took the focused control away: the row `key`'s Cancel, else the first action. */
    focus(key?: object) {
      const next = key ? rowOf.get(key)?.querySelector<HTMLElement>(".media-library__adding-row-cancel:not([hidden])") : undefined;
      (next ?? root.querySelector<HTMLElement>(".media-library__adding-actions button:not([hidden])"))?.focus();
    },
  };
}
