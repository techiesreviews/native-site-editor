// The Spinner part (atomic catalogue ticket 14): a ring turning while something loads, one size of three, inline or an
// overlay over what is loading (the nearest positioned parent). With reduced motion it turns slower, never stops.
// The overlay is for panels and blocks, not for a control as small as its ring. It only looks like a block: the caller
// marks the host `aria-busy="true"` and `inert` while it loads, so the keyboard and screen readers stay out too.
// The editor's screens still draw their own spinners until the Spinner swap slice (ticket 34).

import "./spinner.css";
import { spinnerAttributes, type SpinnerOptions } from "./spinner-options";

export function spinner(options: SpinnerOptions = {}): HTMLSpanElement {
  const result = document.createElement("span");
  for (const [name, value] of Object.entries(spinnerAttributes(options))) result.setAttribute(name, value);
  return result;
}
