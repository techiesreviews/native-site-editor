import { icon } from "../icons";

/** Shows a finished action on the button that ran it: its icon turns into a check for a moment. Anything else is left as it is. */
export function markDone(control: HTMLElement | undefined, ms = 1600) {
  if (!control?.isConnected || !control.getAttribute("aria-haspopup") || control.dataset.done !== undefined) return;
  const size = Number(control.querySelector("svg")?.getAttribute("width")) || 16;
  const kept = [...control.childNodes];
  control.dataset.done = "";
  control.replaceChildren(icon("check", size));
  setTimeout(() => {
    delete control.dataset.done;
    if (control.isConnected) control.replaceChildren(...kept);
  }, ms);
}
