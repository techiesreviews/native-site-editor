// The Icon button part: an icon alone on a quiet square that fills on hover or press, named by its label for
// assistive technology. Its look is icon-button.css; a screen places and sizes it (width and height in its own CSS).

import { node } from "../dom";
import { reported } from "../report-failure";
import { iconButtonClass, iconButtonTitle } from "./icon-button-options";

export interface IconButtonOptions {
  /** What a click does; a screen that wires the click itself leaves it out. */
  action?: (() => void) | (() => Promise<void>);
  /** A screen's own classes, after the part's. */
  className?: string;
  /** The tooltip: the label unless given, none when false. */
  title?: string | false;
}

/** An icon button named `label`, holding `glyph` (an icon element, or none yet when a screen draws it later). */
export function iconButton(label: string, glyph: Node | null, options: IconButtonOptions = {}): HTMLButtonElement {
  const result = node("button", iconButtonClass(options.className));
  result.type = "button";
  result.setAttribute("aria-label", label);
  const title = iconButtonTitle(label, options.title);
  if (title !== undefined) result.title = title;
  if (glyph) result.append(glyph);
  if (options.action) result.addEventListener("click", reported(options.action));
  return result;
}
