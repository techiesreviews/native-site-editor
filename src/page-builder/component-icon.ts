// The component mark (Phosphor's diamond, as Figma and Framer mark
// instances), drawn in the component accent wherever an instance is named:
// the edit bar, the page structure, the properties panel, the banner over a
// component's template. Kept here so the page builder's component work does
// not touch the shared icon list.

import diamond from "@phosphor-icons/core/regular/diamond.svg?raw";
import pencil from "@phosphor-icons/core/regular/pencil-simple.svg?raw";
import linkBreak from "@phosphor-icons/core/regular/link-break.svg?raw";
import selection from "@phosphor-icons/core/regular/selection-plus.svg?raw";
import x from "@phosphor-icons/core/regular/x.svg?raw";
import check from "@phosphor-icons/core/regular/check.svg?raw";
import plus from "@phosphor-icons/core/regular/plus.svg?raw";
import caretDown from "@phosphor-icons/core/regular/caret-down.svg?raw";
import image from "@phosphor-icons/core/regular/image.svg?raw";
import textT from "@phosphor-icons/core/regular/text-t.svg?raw";
import link from "@phosphor-icons/core/regular/link-simple.svg?raw";
import brackets from "@phosphor-icons/core/regular/brackets-angle.svg?raw";
import arrowCounter from "@phosphor-icons/core/regular/arrow-counter-clockwise.svg?raw";
import "./components.css";

const marks = {
  component: diamond,
  edit: pencil,
  detach: linkBreak,
  make: selection,
  close: x,
  done: check,
  add: plus,
  more: caretDown,
  image,
  text: textT,
  link,
  content: brackets,
  reset: arrowCounter,
};

export type ComponentMark = keyof typeof marks;

/** One of the page builder's component marks as an element, hidden from assistive technology. */
export function mark(name: ComponentMark, size = 14, className = "") {
  const template = document.createElement("template");
  template.innerHTML = marks[name].replace("<svg ", `<svg class="${`icon ${className}`.trim()}" width="${size}" height="${size}" aria-hidden="true" focusable="false" `);
  return template.content.firstElementChild as SVGSVGElement;
}

/** The component diamond, in the component accent. */
export function componentIcon(size = 14) {
  return mark("component", size, "component-mark");
}
