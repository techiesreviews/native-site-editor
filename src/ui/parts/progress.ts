// The Progress bar part (atomic catalogue ticket 14): a bar that fills as far as a value says (known), or a short bar
// sliding along its track while nobody can tell how long it takes (unknown). It fills the width it is given.
// The editor's screens still draw their own bars until the Progress swap slice (ticket 34).

import "./progress.css";
import { progressAttributes, type ProgressOptions } from "./progress-options";

export function progress(options: ProgressOptions = {}): HTMLSpanElement {
  const result = document.createElement("span");
  const attributes = progressAttributes(options);
  for (const [name, value] of Object.entries(attributes)) result.setAttribute(name, value);
  if (attributes["data-percent"]) result.style.setProperty("--progress", `${attributes["data-percent"]}%`);
  return result;
}
