// The Section heading part's options and how they become markup (atomic catalogue ticket 13). Pure text in, text out;
// src/ui/parts/section-heading.ts draws it and puts a node in the end slot. One class, `ui-section-heading`; the words
// are a real heading, the end slot (a count, a button) sits at the far end of the same line.

import { escapeWords } from "./escape";

/** Heading levels the part offers: a panel's section sits under the panel's own title, so it starts at 2. */
export const HEADING_LEVELS = [2, 3, 4] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];
export const DEFAULT_HEADING_LEVEL: HeadingLevel = 3;

export interface SectionHeadingOptions {
  level?: number | string;
}

export function headingLevel(value: unknown): HeadingLevel {
  const level = Number(value);
  return HEADING_LEVELS.find((allowed) => allowed === level) ?? DEFAULT_HEADING_LEVEL;
}

/**
 * The heading as markup. `end` is the slot at the far end: text, or `true` for an empty slot the caller fills with a
 * node. Nothing (or blank text) leaves no slot, so the words have the whole line.
 */
export function sectionHeadingMarkup(words: string, options: SectionHeadingOptions = {}, end?: string | true): string {
  const level = headingLevel(options.level);
  const slot = end === true ? true : typeof end === "string" && end.trim() ? end.trim() : undefined;
  const endMarkup = slot === undefined ? "" : `<span data-slot="end">${slot === true ? "" : escapeWords(slot)}</span>`;
  return `<div class="ui-section-heading"><h${level}>${escapeWords(words)}</h${level}>${endMarkup}</div>`;
}
