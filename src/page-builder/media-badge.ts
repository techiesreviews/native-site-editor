import type { MediaCleanUpSuggestions } from "./media-clean-up";

/** The Media tab's count, like an unread count: what Clean up suggests, plus the pages and
 * components Improve images would change (`improve`, when there are any). */
export interface MediaBadge { count: number; show: boolean; improve?: number }

/** Every suggested item, by its main file: what a dismiss remembers. */
export function suggestedFiles(suggestions: MediaCleanUpSuggestions): string[] {
  return suggestions.groups.flatMap(group => group.items.map(item => item.main)).sort();
}
/** What a dismiss remembers: Clean up's files and Improve images' rows (`improve:<file>`). */
export function badgeKeys(suggestions: MediaCleanUpSuggestions, improve: readonly string[] = []): string[] {
  return [...suggestedFiles(suggestions), ...improve.map(file => `improve:${file}`)].sort();
}

/** The badge shows Clean up's count and Improve images' rows while there is something. After a
 * dismiss (`dismissed`: the keys then) it returns only when a file or row not there then is. */
export function mediaBadge(suggestions: MediaCleanUpSuggestions, dismissed: readonly string[] | undefined, improve: readonly string[] = []): MediaBadge {
  const count = (suggestions.state === "ready" ? suggestions.count : 0) + improve.length;
  const seen = new Set(dismissed);
  return { count, show: count > 0 && (!dismissed || badgeKeys(suggestions, improve).some(key => !seen.has(key))), ...improve.length ? { improve: improve.length } : {} };
}

/** Dismissed files as stored in the browser; anything unreadable counts as never dismissed. */
export function readDismissed(text: string | null | undefined): string[] | undefined {
  if (!text) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) && value.every(path => typeof path === "string") ? value : undefined;
  } catch { return undefined; }
}

export function mediaBadgeLabel(count: number, improve = 0): string {
  const clean = count - improve, parts: string[] = [];
  if (clean || !improve) parts.push(`${clean} ${clean === 1 ? "file" : "files"} to clean up`);
  if (improve) parts.push(`${improve} ${improve === 1 ? "page" : "pages"} with pictures to improve`);
  return parts.join(" and ");
}

/** Improve images in More: always open (it reads the pictures itself); the count when known. */
export function improveMenuItem(rows: number | undefined): { label: string } {
  return { label: rows ? `Improve images (${rows})` : "Improve images" };
}

/** Clean up in More. Its count is the badge's (`counted`, the last check with Improve images' count
 * too; none before there is one, slice 121), so More always adds up to the badge; the newest check
 * (`suggestions`) only says whether it opens, and why not. */
export function cleanUpMenuItem(suggestions: MediaCleanUpSuggestions, counted: MediaCleanUpSuggestions | null = suggestions): { label: string; disabled?: string } {
  const label = counted?.state === "ready" && counted.count ? `Clean up (${counted.count})` : "Clean up";
  if (suggestions.state === "not-checked") return { label, disabled: "Still checking which files are used." };
  if (suggestions.state === "blocked") {
    const files = suggestions.blockedBy.slice(0, 3).join(", ") + (suggestions.blockedBy.length > 3 ? ` and ${suggestions.blockedBy.length - 3} more` : "");
    return { label, disabled: `Nothing is suggested until every file can be read: ${files}.` };
  }
  if (!suggestions.count) return { label, disabled: "Nothing to clean up: every file is used or marked Always keep." };
  return { label };
}
