// The Icon part (atomic catalogue ticket 10): a Phosphor Regular icon by name, at a size from a small set, alone or
// standing before or after words. Words are the caller's: put them before or after the icon to match `place`; the part
// only sets the spacing.
// The editor's screens still draw icons through `icon()` in src/icons.ts until the Icon swap slice (ticket 30).

import { iconSource, svgElement, type IconName } from "../../icons";
import { iconSvg, type IconOptions } from "./icon-options";

/** The icon as an element, drawn in the text colour of where it stands. */
export function iconPart(name: IconName, options: IconOptions = {}): SVGSVGElement {
  return svgElement(iconSvg(iconSource(name), options));
}
