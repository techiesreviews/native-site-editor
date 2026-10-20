import type { MediaCleanUpSuggestions } from "./media-clean-up";

/** Improve images in More: always open (it reads the pictures itself); the count when known. */
export function improveMenuItem(rows: number | undefined): { label: string } {
  return { label: rows ? `Improve images (${rows})` : "Improve images" };
}

/** Clean up's screen says this when there is nothing to suggest; More's item is only greyed out (Lex, 2026-10-20). */
export const nothingToCleanUp = "Nothing to clean up: every file is used or marked Always keep.";

/** Clean up in More. Its count is the last check that also counted Improve images (`counted`;
 * none before there is one, slice 121), so More's two counts always come from one check; the newest
 * check (`suggestions`) only says whether it opens, and why not. The Media tab shows no count
 * (Lex, slice 122): More is the one place these numbers live. */
export function cleanUpMenuItem(suggestions: MediaCleanUpSuggestions, counted: MediaCleanUpSuggestions | null = suggestions): { label: string; disabled?: string | true } {
  const label = counted?.state === "ready" && counted.count ? `Clean up (${counted.count})` : "Clean up";
  if (suggestions.state === "not-checked") return { label, disabled: "Still checking which files are used." };
  if (suggestions.state === "blocked") {
    const files = suggestions.blockedBy.slice(0, 3).join(", ") + (suggestions.blockedBy.length > 3 ? ` and ${suggestions.blockedBy.length - 3} more` : "");
    return { label, disabled: `Nothing is suggested until every file can be read: ${files}.` };
  }
  if (!suggestions.count) return { label, disabled: true };
  return { label };
}
