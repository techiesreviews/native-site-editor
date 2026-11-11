// The Badge part (atomic catalogue ticket 13): a count, a status, a tag, a dot or a round mark, in one of six tones.
// The editor's screens still use their own badge looks until the Badge swap slice (ticket 31).

import { iconSource, type IconName } from "../../icons";
import { badgeKind, badgeMarkup, type BadgeOptions } from "./badge-options";
import { iconSvg } from "./icon-options";
import "./badge.css";

export interface BadgePartOptions extends BadgeOptions {
  /** The icon a `mark` holds. */
  icon?: IconName;
}
const MARK_ICON: IconName = "check";
/** The mark's icon is drawn small enough to sit inside the circle. */
const MARK_ICON_SIZE = 12;

/** The badge as an element. */
export function badgePart(options: BadgePartOptions = {}): HTMLSpanElement {
  const drawing = badgeKind(options.kind) === "mark" ? iconSvg(iconSource(options.icon ?? MARK_ICON), { size: MARK_ICON_SIZE }) : "";
  const template = document.createElement("template");
  template.innerHTML = badgeMarkup(options, drawing);
  return template.content.firstElementChild as HTMLSpanElement;
}
