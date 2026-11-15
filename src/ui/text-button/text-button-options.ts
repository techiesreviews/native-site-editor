// The Text button part's options, pure: its sizes and its class (kept small: the boot bundle carries it).

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

/** The part's class, its size's modifier when not the base size, the underlined modifier, then a screen's own classes. */
export function textButtonClass(options: TextButtonClassOptions = {}): string {
  return ["text-button", options.size === "compact" && "text-button--compact", options.underlined && "text-button--underlined", options.className].filter(Boolean).join(" ");
}
