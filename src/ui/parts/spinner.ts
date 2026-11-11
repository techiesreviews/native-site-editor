// The Spinner part (atomic catalogue ticket 14): a ring turning while something loads, one size of three, inline or an
// overlay over what is loading (the nearest positioned parent). With reduced motion it turns slower, never stops.
// The editor's screens still draw their own spinners until the Spinner swap slice (ticket 34).

import "./spinner.css";
import { spinnerAttributes, type SpinnerOptions } from "./spinner-options";

export function spinner(options: SpinnerOptions = {}): HTMLSpanElement {
  const result = document.createElement("span");
  for (const [name, value] of Object.entries(spinnerAttributes(options))) result.setAttribute(name, value);
  return result;
}
