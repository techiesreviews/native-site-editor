// The Keyboard key part's options and how they become markup (atomic catalogue ticket 13). Pure text in, text out;
// src/ui/parts/key.ts draws it. One class, `ui-key`. One key is a single cap; several keys pressed together are a group
// of caps (HTML's nested `kbd` for a keystroke), so a screen reader hears each key.

import { escapeWords } from "./escape";

/** The keys as a list: text splits at `+` (so `Ctrl+K` is two keys), a list is taken as it is. Blank keys are dropped.
 * A `+` key itself needs the list form (`["Ctrl", "+"]`): as text it is the separator. */
export function keyList(keys: string | readonly string[] | undefined): string[] {
  const list = typeof keys === "string" ? keys.split("+") : [...(keys ?? [])];
  return list.map((key) => key.trim()).filter(Boolean);
}

/** The key or keys as markup; nothing to press gives an empty string. */
export function keyMarkup(keys: string | readonly string[] | undefined): string {
  const list = keyList(keys);
  if (list.length === 0) return "";
  if (list.length === 1) return `<kbd class="ui-key">${escapeWords(list[0])}</kbd>`;
  return `<kbd class="ui-key" data-combo>${list.map((key) => `<kbd>${escapeWords(key)}</kbd>`).join("")}</kbd>`;
}
