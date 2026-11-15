// The Progress bar part (atomic catalogue ticket 14): a bar that fills as far as a value says (known), or a short bar
// sliding along its track while nobody can tell how long it takes (unknown). It fills the width it is given.
// A bar that is already on the page is moved with `setProgress`, so the fill grows from where it was; drawing a new
// one each time would start from nothing and never animate.
// The editor's screens still draw their own bars until the Progress swap slice (ticket 34).

import "./progress.css";
import { progressAttributes, progressPercent, type ProgressOptions } from "./progress-options";

/** Puts the options on a bar: value, mode and label. Going from known to unknown takes the value away again. */
export function setProgress(bar: HTMLElement, options: ProgressOptions = {}): void {
  const attributes = progressAttributes(options);
  for (const name of ["aria-valuemin", "aria-valuemax", "aria-valuenow"]) if (!(name in attributes)) bar.removeAttribute(name);
  for (const [name, value] of Object.entries(attributes)) bar.setAttribute(name, value);
  const percent = progressPercent(options);
  if (percent === null) bar.style.removeProperty("--progress");
  else bar.style.setProperty("--progress", `${percent}%`);
}

export function progress(options: ProgressOptions = {}): HTMLSpanElement {
  const result = document.createElement("span");
  setProgress(result, options);
  return result;
}
