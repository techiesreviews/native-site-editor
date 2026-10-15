// The site's name that page titles share at their end ("Fern & Kettle · Larkspur Studio"):
// the Pages tab leaves it off its rows, as site builders show page names rather than titles.

import { TITLE_SEPARATORS } from "../native-create";

const SEPARATOR = new RegExp(TITLE_SEPARATORS.map((separator) => separator.replace(/[|]/g, "\\$&")).join("|"), "g");

/** The ending (separator included) shared by at least two titles and by at least half of them, if any. */
export function sharedTitleEnding(titles: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const title of titles) {
    const at = [...title.matchAll(SEPARATOR)].at(-1)?.index;
    if (at === undefined || at === 0) continue;
    const ending = title.slice(at);
    if (ending.trim().length > 2) counts.set(ending, (counts.get(ending) ?? 0) + 1);
  }
  let best: [string, number] | undefined;
  for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
  return best && best[1] >= 2 && best[1] * 2 >= titles.length ? best[0] : undefined;
}

/** `title` without `ending`, unless nothing would be left. */
export function withoutTitleEnding(title: string, ending: string | undefined): string {
  return ending && title.endsWith(ending) && title.length > ending.length ? title.slice(0, -ending.length) : title;
}
