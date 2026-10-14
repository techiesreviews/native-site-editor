import { button, node } from "../ui/dom";
import { cleanUpMenuItem, mediaBadgeLabel, type MediaBadge } from "./media-badge";
import type { MediaCleanUpKind } from "./media-clean-up";
import type { MediaCleanUpState } from "../controllers/media-clean-up-controller";
import "./media-clean-up.css";

const NOTE_ID = "media-count-note";
const groupNames: Record<MediaCleanUpKind, string> = {
  unused: "Nothing uses these",
  trimmed: "Trimmed copies nothing uses",
  leftover: "Copies whose main image is gone",
};

/** The count on the Media tab and on the button that opens it, so it shows from anywhere.
 * The tab keeps its name; the count is its description. */
export function drawMediaCount(marks: HTMLElement[], badge: MediaBadge) {
  let note = document.getElementById(NOTE_ID);
  if (!note) { note = node("span"); note.id = NOTE_ID; note.hidden = true; document.body.append(note); }
  for (const mark of marks) {
    let count = mark.querySelector<HTMLElement>(":scope > .media-count");
    if (!count) {
      count = node("span", "media-count"); count.setAttribute("aria-hidden", "true");
      const title = mark.querySelector(":scope > #current-page");
      if (title) title.after(count); else mark.append(count);
    }
    count.textContent = String(badge.count); count.hidden = !badge.show;
    if (badge.show) mark.setAttribute("aria-describedby", NOTE_ID);
    else if (mark.getAttribute("aria-describedby") === NOTE_ID) mark.removeAttribute("aria-describedby");
  }
  note.textContent = mediaBadgeLabel(badge.count);
}

/** Clean up's panel above the grid, opened from More: the files it would suggest by group,
 * Dismiss while the badge shows, and Close. Slice 50 turns it into the review. */
export function drawCleanUpPanel(slot: HTMLElement, state: MediaCleanUpState, open: boolean, actions: { dismiss: () => void; close: () => void }) {
  const { suggestions, badge } = state;
  const signature = open ? JSON.stringify([suggestions.state, suggestions.groups, badge.show]) : "";
  if (slot.dataset.signature === signature) return;
  const opening = !slot.dataset.signature && open;
  slot.dataset.signature = signature;
  const hadFocus = slot.contains(document.activeElement);
  slot.hidden = !open;
  slot.replaceChildren();
  if (!open) return;
  slot.setAttribute("role", "region");
  const heading = node("h3", "media-clean-up__heading", "Clean up"); heading.id = "media-clean-up-heading"; heading.tabIndex = -1;
  slot.setAttribute("aria-labelledby", heading.id);
  const ready = suggestions.state === "ready" && suggestions.count > 0;
  if (ready) {
    const count = node("span", "media-count", String(suggestions.count)); count.setAttribute("aria-hidden", "true");
    heading.append(count);
  }
  const head = node("div", "media-clean-up__head");
  head.append(heading);
  if (ready && badge.show) head.append(button("Dismiss", () => { actions.dismiss(); heading.focus(); }, "button secondary"));
  head.append(button("Close", actions.close, "button secondary"));
  slot.append(head);
  if (!ready) slot.append(node("p", "media-library__muted", cleanUpMenuItem(suggestions).disabled ?? ""));
  for (const group of ready ? suggestions.groups : []) {
    const list = node("ul", "media-clean-up__files");
    for (const item of group.items) {
      const name = node("li", "", item.main.slice(item.main.lastIndexOf("/") + 1)); name.title = item.main;
      list.append(name);
    }
    slot.append(node("p", "media-clean-up__group", `${groupNames[group.kind]} (${group.count})`), list);
  }
  if (opening || (hadFocus && !slot.contains(document.activeElement))) heading.focus();
}
