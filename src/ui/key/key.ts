// The Keyboard key part (atomic catalogue ticket 13): a key cap, or several keys pressed together. It takes the text
// colour of where it stands (a menu row, a tooltip). The editor's screens still draw their own until the swap slice
// (ticket 33).

import { keyMarkup } from "./key-options";
import "./key.css";

/** The key or keys as an element; with nothing to press, no element. */
export function keyPart(keys: string | readonly string[]): HTMLElement | undefined {
  const markup = keyMarkup(keys);
  if (!markup) return undefined;
  const template = document.createElement("template");
  template.innerHTML = markup;
  return template.content.firstElementChild as HTMLElement;
}
