// What the Add panel lists: the section components a page can take, grouped
// by the first word of their tag when several share it (section-hero,
// section-split → "Sections": Hero, Split), with search and the few
// suggested first when a page is empty. Pure, so it is unit tested.

import { componentLabel } from "../native-insert";

export interface AddChoice {
  tag: string;
  label: string;
}

export interface AddItem {
  tag: string;
  // The name the panel shows: the tag without its group's word ("Hero").
  name: string;
  // The component's full name ("Section hero"), for search and announcements.
  label: string;
  group: string;
}

export interface AddGroup {
  name: string;
  items: AddItem[];
}

/** "section" → "Sections", "gallery" → "Galleries", "box" → "Boxes". */
export function groupName(word: string) {
  const plural = /(?:s|x|z|ch|sh)$/i.test(word)
    ? `${word}es`
    : /[^aeiou]y$/i.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;
  return componentLabel(plural);
}

// How likely a section is to start a page, by the words in its tag: a hero
// or an intro first, a closing call to action or a footer last.
const OPENING: [RegExp, number][] = [
  [/\b(hero|banner|masthead|header|intro|welcome|landing)\b/, 0],
  [/\b(feature|features|split|about|story|services?|highlights?)\b/, 1],
  [/\b(cards?|grid|list|gallery|work|projects?|team|pricing|faq|steps?)\b/, 2],
  [/\b(contact|cta|action|newsletter|signup|footer|outro)\b/, 4],
];

function openingRank(tag: string) {
  const words = tag.split("-").join(" ");
  for (const [pattern, rank] of OPENING) if (pattern.test(words)) return rank;
  return 3;
}

/** `items` the likeliest openers first, keeping their order otherwise. */
function pageOrder(items: AddItem[]) {
  return items
    .map((item, order) => ({ item, order, rank: openingRank(item.tag) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map(({ item }) => item);
}

/**
 * The choices in groups: a word that starts two or more tags makes a group
 * named after it, listed first in name order; the rest go together under
 * "Sections" (or "More sections" after named groups). In a group, items
 * go in the order a page usually has them (a hero first, a call to action
 * last), then in the order they came in.
 */
export function addCatalog(choices: readonly AddChoice[]): AddGroup[] {
  const counts = new Map<string, number>();
  for (const choice of choices) {
    const [word, ...rest] = choice.tag.split("-");
    if (rest.length) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const groups = new Map<string, AddItem[]>();
  const loose: AddItem[] = [];
  for (const choice of choices) {
    const [word, ...rest] = choice.tag.split("-");
    if (rest.length && (counts.get(word) ?? 0) >= 2) {
      const name = groupName(word);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push({ tag: choice.tag, name: componentLabel(rest.join("-")), label: choice.label, group: name });
    } else loose.push({ tag: choice.tag, name: choice.label, label: choice.label, group: "" });
  }
  const named = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, items]) => ({ name, items: pageOrder(items) }));
  if (loose.length) {
    const name = named.length ? "More sections" : "Sections";
    named.push({ name, items: pageOrder(loose.map((item) => ({ ...item, group: name }))) });
  }
  return named;
}

/** Whether `item` matches what was typed: its name, full name, tag or group. */
export function matchesQuery(item: AddItem, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [item.name, item.label, item.tag, item.group].some((text) => text.toLowerCase().includes(needle));
}

/** The groups with only the items that match `query`; empty groups left out. */
export function filterCatalog(groups: readonly AddGroup[], query: string): AddGroup[] {
  return groups
    .map((group) => ({ name: group.name, items: group.items.filter((item) => matchesQuery(item, query)) }))
    .filter((group) => group.items.length);
}

/** Up to `count` items to start an empty page with, the likeliest openers first. */
export function suggestedItems(groups: readonly AddGroup[], count = 3): AddItem[] {
  return pageOrder(groups.flatMap((group) => group.items)).slice(0, count);
}
