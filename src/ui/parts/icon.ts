// The Icon part (atomic catalogue ticket 10): a Phosphor Regular icon by name, at a size from a small set, alone or
// standing before or after words. With words and a place of before or after, the part returns one line (`icon-line`)
// holding the icon and the words in that order; otherwise the bare icon.
// The editor's screens still draw icons through `icon()` in src/icons.ts until the Icon swap slice (ticket 30).

import { iconSource, svgElement, type IconName } from "../../icons";
import { iconPlace, iconSvg, type IconOptions } from "./icon-options";

/** The icon as an element, drawn in the text colour of where it stands; beside words, the line that holds both. */
export function iconPart(name: IconName, options: IconOptions = {}): SVGSVGElement | HTMLSpanElement {
  const place = iconPlace(options.place);
  const words = options.words === "" ? undefined : options.words;
  const picture = svgElement(iconSvg(iconSource(name), { size: options.size, place: words === undefined ? "alone" : place }));
  if (words === undefined || place === "alone") return picture;
  const line = document.createElement("span");
  line.className = "icon-line";
  line.append(...(place === "before" ? [picture, words] : [words, picture]));
  return line;
}
