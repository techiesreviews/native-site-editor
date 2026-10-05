import "./row-action-overlay.css";

/**
 * The faded action bar every list row shares (Structure, Pages, Files, Media),
 * the row counterpart of the section and component overlay on the canvas: its
 * buttons fade and slide in over the host's end on hover or keyboard focus. A
 * host has one bar; calling again on the same host adds to it.
 */
export function rowActions(host: HTMLElement, controls: HTMLElement[]): HTMLElement {
  host.classList.add("row-action-host");
  let bar = host.querySelector<HTMLElement>(":scope > .row-action-overlay");
  if (!bar) {
    bar = document.createElement("span");
    bar.className = "row-action-overlay";
    host.append(bar);
  }
  bar.append(...controls);
  return bar;
}
