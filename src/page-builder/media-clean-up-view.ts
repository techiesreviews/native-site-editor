import { node } from "../ui/dom";
import { mediaBadgeLabel, type MediaBadge } from "./media-badge";
import "./media-clean-up.css";

const NOTE_ID = "media-count-note";

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
  note.textContent = mediaBadgeLabel(badge.count, badge.improve);
}
