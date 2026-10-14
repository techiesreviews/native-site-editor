import type { MediaCleanUpSuggestions } from "./media-clean-up";

/** The Media tab's count, like an unread count: what Clean up suggests. */
export interface MediaBadge { count: number; show: boolean }

/** Every suggested item, by its main file: what a dismiss remembers. */
export function suggestedFiles(suggestions: MediaCleanUpSuggestions): string[] {
  return suggestions.groups.flatMap(group => group.items.map(item => item.main)).sort();
}

/** The badge shows Clean up's count while there is something to suggest. After a dismiss
 * (`dismissed`: the files suggested then) it returns only when a file not suggested then is. */
export function mediaBadge(suggestions: MediaCleanUpSuggestions, dismissed: readonly string[] | undefined): MediaBadge {
  const count = suggestions.state === "ready" ? suggestions.count : 0;
  const seen = new Set(dismissed);
  return { count, show: count > 0 && (!dismissed || suggestedFiles(suggestions).some(path => !seen.has(path))) };
}

/** Dismissed files as stored in the browser; anything unreadable counts as never dismissed. */
export function readDismissed(text: string | null | undefined): string[] | undefined {
  if (!text) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) && value.every(path => typeof path === "string") ? value : undefined;
  } catch { return undefined; }
}

export function mediaBadgeLabel(count: number): string {
  return `${count} ${count === 1 ? "file" : "files"} to clean up`;
}

/** Clean up in More: the same count, or why there is nothing to open yet. */
export function cleanUpMenuItem(suggestions: MediaCleanUpSuggestions): { label: string; disabled?: string } {
  if (suggestions.state === "not-checked") return { label: "Clean up", disabled: "Still checking which files are used." };
  if (suggestions.state === "blocked") {
    const files = suggestions.blockedBy.slice(0, 3).join(", ") + (suggestions.blockedBy.length > 3 ? ` and ${suggestions.blockedBy.length - 3} more` : "");
    return { label: "Clean up", disabled: `Nothing is suggested until every file can be read: ${files}.` };
  }
  if (!suggestions.count) return { label: "Clean up", disabled: "Nothing to clean up: every file is used or marked Always keep." };
  return { label: `Clean up (${suggestions.count})` };
}
