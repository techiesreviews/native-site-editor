// The Icon button part's options, pure: its class and its markup, so node tests and markup strings (the design board)
// read the same button the editor draws.

import { escapeWords } from "../escape";

export interface IconButtonMarkupOptions {
  /** What the button does, read out by assistive technology (`aria-label`). */
  label: string;
  /** The icon's markup. */
  glyph: string;
  /** A screen's own classes, after the part's: they place and size it, never give it a look. */
  className?: string;
  /** The tooltip: the label unless given, none when false. */
  title?: string | false;
}

/** The part's class first, then a screen's own classes. */
export function iconButtonClass(className = ""): string {
  return className ? `icon-button ${className}` : "icon-button";
}

/** The tooltip an icon button shows: its label unless one is given, or none. */
export function iconButtonTitle(label: string, title: string | false | undefined): string | undefined {
  return title === false ? undefined : (title ?? label);
}

/** The button as markup text: a plain button named by its label, holding the icon. */
export function iconButtonMarkup(options: IconButtonMarkupOptions): string {
  const label = escapeWords(options.label);
  const title = iconButtonTitle(options.label, options.title);
  const tooltip = title === undefined ? "" : ` title="${escapeWords(title)}"`;
  return `<button type="button" class="${escapeWords(iconButtonClass(options.className))}" aria-label="${label}"${tooltip}>${options.glyph}</button>`;
}
