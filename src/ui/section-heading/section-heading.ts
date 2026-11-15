// The Section heading part (atomic catalogue ticket 13): small uppercase words naming a group, with an optional slot
// at the far end for a count or a button. The editor's screens still draw their own until the swap slice (ticket 32).

import { sectionHeadingMarkup, type SectionHeadingOptions } from "./section-heading-options";
import "./section-heading.css";

export interface SectionHeadingPartOptions extends SectionHeadingOptions {
  /** The end slot, an argument: text, or any node (a Badge, a button). */
  end?: string | Node;
}

/** The heading as an element: the words as a heading, the end slot after them. */
export function sectionHeadingPart(words: string, options: SectionHeadingPartOptions = {}): HTMLDivElement {
  const { end } = options;
  const template = document.createElement("template");
  template.innerHTML = sectionHeadingMarkup(words, options, typeof end === "object" ? true : end);
  const root = template.content.firstElementChild as HTMLDivElement;
  if (typeof end === "object") root.querySelector("[data-slot='end']")!.append(end);
  return root;
}
