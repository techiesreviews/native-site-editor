// The editor's one icon set: Phosphor (MIT, phosphoricons.com), Regular
// weight. Each icon is imported as SVG markup, so only the ones named here
// are bundled. Icons in stylesheets use the same files as a mask
// (icons.css).

import "./icons.css";

import arrowDown from "@phosphor-icons/core/regular/arrow-down.svg?raw";
import arrowUp from "@phosphor-icons/core/regular/arrow-up.svg?raw";
import arrowUpRight from "@phosphor-icons/core/regular/arrow-up-right.svg?raw";
import arrowsClockwise from "@phosphor-icons/core/regular/arrows-clockwise.svg?raw";
import caretDown from "@phosphor-icons/core/regular/caret-down.svg?raw";
import caretLeft from "@phosphor-icons/core/regular/caret-left.svg?raw";
import caretRight from "@phosphor-icons/core/regular/caret-right.svg?raw";
import check from "@phosphor-icons/core/regular/check.svg?raw";
import clockCounterClockwise from "@phosphor-icons/core/regular/clock-counter-clockwise.svg?raw";
import copy from "@phosphor-icons/core/regular/copy.svg?raw";
import dotsSixVertical from "@phosphor-icons/core/regular/dots-six-vertical.svg?raw";
import dotsThree from "@phosphor-icons/core/regular/dots-three.svg?raw";
import file from "@phosphor-icons/core/regular/file.svg?raw";
import fileDashed from "@phosphor-icons/core/regular/file-dashed.svg?raw";
import folder from "@phosphor-icons/core/regular/folder.svg?raw";
import folderOpen from "@phosphor-icons/core/regular/folder-open.svg?raw";
import house from "@phosphor-icons/core/regular/house.svg?raw";
import link from "@phosphor-icons/core/regular/link.svg?raw";
import linkBreak from "@phosphor-icons/core/regular/link-break.svg?raw";
import linkSimple from "@phosphor-icons/core/regular/link-simple.svg?raw";
import packageIcon from "@phosphor-icons/core/regular/package.svg?raw";
import plus from "@phosphor-icons/core/regular/plus.svg?raw";
import play from "@phosphor-icons/core/regular/play.svg?raw";
import sparkle from "@phosphor-icons/core/regular/sparkle.svg?raw";
import listChecks from "@phosphor-icons/core/regular/list-checks.svg?raw";
import trash from "@phosphor-icons/core/regular/trash.svg?raw";
import undo from "@phosphor-icons/core/regular/arrow-u-up-left.svg?raw";
import redo from "@phosphor-icons/core/regular/arrow-u-up-right.svg?raw";
import x from "@phosphor-icons/core/regular/x.svg?raw";

const icons = {
  "arrow-down": arrowDown,
  "arrow-up": arrowUp,
  "arrow-up-right": arrowUpRight,
  "arrows-clockwise": arrowsClockwise,
  "caret-down": caretDown,
  "caret-left": caretLeft,
  "caret-right": caretRight,
  check,
  "clock-counter-clockwise": clockCounterClockwise,
  copy,
  "dots-six-vertical": dotsSixVertical,
  "dots-three": dotsThree,
  file,
  "file-dashed": fileDashed,
  folder,
  "folder-open": folderOpen,
  house,
  link,
  "link-break": linkBreak,
  "link-simple": linkSimple,
  "list-checks": listChecks,
  package: packageIcon,
  play,
  plus,
  redo,
  sparkle,
  trash,
  undo,
  x,
};

export type IconName = keyof typeof icons;

/** An icon's markup, sized in px and hidden from assistive technology (the control around it carries the name). */
export function iconMarkup(name: IconName, size = 16, className = "") {
  return icons[name].replace("<svg ", `<svg class="${`icon ${className}`.trim()}" width="${size}" height="${size}" aria-hidden="true" focusable="false" `);
}

/** An icon as an element, drawn in the text colour. */
export function icon(name: IconName, size = 16, className?: string) {
  const template = document.createElement("template");
  template.innerHTML = iconMarkup(name, size, className);
  return template.content.firstElementChild as SVGSVGElement;
}

/** Replaces an element's content with an icon. */
export function setIcon(element: Element, name: IconName, size = 16) {
  element.replaceChildren(icon(name, size));
}
