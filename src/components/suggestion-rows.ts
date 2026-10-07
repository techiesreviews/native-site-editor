import "./suggestion-rows.css";

// A suggestion's rows (a page: its title over its address), shared by the
// Structure fields' list (field-suggestions.ts, loaded on demand) and the edit
// bar's address list. Kept apart so the edit bar does not pull in the list.

export interface FieldSuggestion { value: string; label?: string }

// The last " · "-separated part shared by at least half of the titled entries
// (and two of them): the site's name, as page titles carry it.
export function suggestionSiteName(entries: readonly FieldSuggestion[]) {
  const counts = new Map<string, number>();
  let titled = 0;
  for (const entry of entries) {
    const label = entry.label?.endsWith(` (${entry.value})`) ? entry.label.slice(0, -entry.value.length - 3) : entry.label;
    const parts = label?.split(" · ");
    if (!parts || parts.length < 2) { if (label && label !== entry.value) titled++; continue; }
    titled++;
    const last = parts[parts.length - 1].trim();
    if (last) counts.set(last, (counts.get(last) ?? 0) + 1);
  }
  const [name, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  return name && count >= 2 && count * 2 >= titled ? name : undefined;
}

/** An entry's title: its label without the value it repeats ("Title (/route/)") or the site's name it ends in. */
export function suggestionTitle(entry: FieldSuggestion, siteName: string | undefined) {
  let text = entry.label?.endsWith(` (${entry.value})`) ? entry.label.slice(0, -entry.value.length - 3) : entry.label;
  if (!text || text === entry.value) return undefined;
  if (siteName && text.endsWith(` · ${siteName}`)) text = text.slice(0, -siteName.length - 3);
  return text;
}

/**
 * A suggestion's two lines, the title (primary, truncated) over its address
 * (small, muted, mono); an entry with no title is its address alone. Shared by
 * the Structure fields' list and the edit bar's address list.
 */
export function suggestionLines(entry: FieldSuggestion, siteName: string | undefined): HTMLElement[] {
  const named = suggestionTitle(entry, siteName);
  const value = document.createElement("span");
  value.className = named ? "field-suggestions__value" : "field-suggestions__value field-suggestions__value--only";
  value.textContent = entry.value;
  if (!named) return [value];
  const top = document.createElement("span");
  top.className = "field-suggestions__title";
  top.textContent = named;
  return [top, value];
}
