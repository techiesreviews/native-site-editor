// The Badge part's options and how they become markup (atomic catalogue ticket 13). Pure text in, text out, so a unit
// test can pin it without a browser; src/ui/parts/badge.ts draws it. One class, `ui-badge`; the kind and the tone are
// data attributes. Replaces the shared `.badge` and the look-alikes (research 04) once the editor's screens move over.

import { escapeWords } from "./escape";

/** What the badge is: a number, a state, a label, a bare dot, a round mark holding an icon. */
export const BADGE_KINDS = ["count", "status", "tag", "dot", "mark"] as const;
export type BadgeKind = (typeof BADGE_KINDS)[number];
export const DEFAULT_BADGE_KIND: BadgeKind = "tag";

/** How it reads: quiet, the action colour, something to look at, an agent's question, done, a problem. */
export const BADGE_TONES = ["neutral", "action", "warning", "question", "success", "danger"] as const;
export type BadgeTone = (typeof BADGE_TONES)[number];
export const DEFAULT_BADGE_TONE: BadgeTone = "neutral";

/** A count past this reads as `99+`: the round chip stays small. */
export const COUNT_LIMIT = 99;

export interface BadgeOptions {
  kind?: string;
  tone?: string;
  /** The text. A dot or a mark has none to show: its words are the name a screen reader says. */
  words?: string;
}

export const badgeKind = (value: unknown): BadgeKind => BADGE_KINDS.find((kind) => kind === value) ?? DEFAULT_BADGE_KIND;
export const badgeTone = (value: unknown): BadgeTone => BADGE_TONES.find((tone) => tone === value) ?? DEFAULT_BADGE_TONE;

/** A count's text: a whole number up to the limit as it is, a bigger one as `99+`, nothing as 0, other words kept. */
export function countText(words: string | undefined): string {
  const text = (words ?? "").trim();
  if (!text) return "0";
  if (!/^\d+$/.test(text)) return text;
  return Number(text) > COUNT_LIMIT ? `${COUNT_LIMIT}+` : String(Number(text));
}

/**
 * The badge as markup. `drawing` is the mark's icon (markup from the Icon part); other kinds ignore it. A dot or a mark
 * with words is an image with that name; without words it is hidden from assistive technology, like any decoration.
 */
export function badgeMarkup(options: BadgeOptions = {}, drawing = ""): string {
  const kind = badgeKind(options.kind);
  const tone = badgeTone(options.tone);
  const words = (options.words ?? "").trim();
  const picture = kind === "dot" || kind === "mark";
  // A status with no words is only a dot: decoration, like a dot with no name.
  const name = picture ? (words ? ` role="img" aria-label="${escapeWords(words)}"` : ' aria-hidden="true"') : kind === "status" && !words ? ' aria-hidden="true"' : "";
  // The words sit in their own span so a long text can be cut with an ellipsis inside the badge's width.
  const text = kind === "count" ? countText(options.words) : words;
  const inside = kind === "mark" ? drawing : kind === "dot" ? "" : text ? `<span>${escapeWords(text)}</span>` : "";
  return `<span class="ui-badge" data-kind="${kind}" data-tone="${tone}"${name}>${inside}</span>`;
}
