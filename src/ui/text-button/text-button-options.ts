// The Text button part's options, pure: its sizes and its class.

/** base: link-coloured words that underline on hover. compact: smaller words in a padded box that fills on hover. */
export const TEXT_BUTTON_SIZES = ["base", "compact"] as const;
export type TextButtonSize = (typeof TEXT_BUTTON_SIZES)[number];

export interface TextButtonClassOptions {
  size?: TextButtonSize;
  /** Underlined at rest too, for words that must read as a link among plain text (a file name that downloads). */
  underlined?: boolean;
  /** A screen's own classes, after the part's: they place and size it, never give it a look. */
  className?: string;
}

/** A size in the set, or the base size. */
export function textButtonSize(value: unknown): TextButtonSize {
  return TEXT_BUTTON_SIZES.includes(value as TextButtonSize) ? (value as TextButtonSize) : "base";
}

/** The part's class, its size's modifier when not the base size, the underlined modifier, then a screen's own classes. */
export function textButtonClass(options: TextButtonClassOptions = {}): string {
  const size = textButtonSize(options.size);
  return ["text-button", ...(size === "base" ? [] : [`text-button--${size}`]), ...(options.underlined ? ["text-button--underlined"] : []), ...(options.className ?? "").split(/\s+/).filter(Boolean)].join(" ");
}
