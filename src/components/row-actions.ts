import "./row-action-overlay.css";

/**
 * The faded action bar every list row shares (Structure, Pages, Files, Media),
 * the row counterpart of the section and component overlay on the canvas: its
 * buttons fade and slide in over the host's end on hover or keyboard focus. A
 * host has one bar; calling again on the same host adds to it. A `trigger`
 * (the whole row, when the bar sits in a part of it such as its label)
 * reveals the bar while it is hovered or focused.
 */
export function rowActions(host: HTMLElement, controls: HTMLElement[], options: { trigger?: HTMLElement } = {}): HTMLElement {
  host.classList.add("row-action-host");
  if (options.trigger && options.trigger !== host) options.trigger.classList.add("row-action-trigger");
  let bar = host.querySelector<HTMLElement>(":scope > .row-action-overlay");
  if (!bar) {
    bar = document.createElement("span");
    bar.className = "row-action-overlay";
    host.append(bar);
  }
  bar.append(...controls);
  return bar;
}
