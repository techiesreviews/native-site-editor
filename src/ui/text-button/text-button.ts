// The Text button part: an action written as link-coloured words, for a quiet action beside other text (Undo,
// Review…, Reset to defaults). Its look is text-button.css; a link with the same look is `link(text, href, "text-button")`.

import { button } from "../dom";
import { textButtonClass, type TextButtonClassOptions } from "./text-button-options";

/** A text button reading `words` that runs `action` on a click. */
export function textButton(words: string, action: (() => void) | (() => Promise<void>), options: TextButtonClassOptions = {}): HTMLButtonElement {
  return button(words, action, textButtonClass(options));
}
