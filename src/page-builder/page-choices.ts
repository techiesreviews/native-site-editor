// The pages a new card can link to (wayfinder components-and-builder ticket
// 09 §2, build slice 52): every page of the site but the grid's own and the
// not-found page. Pages under the folder the grid's cards link into come
// first, then "Other pages"; a search covers them all. Pages a card of the
// grid already links to stay listed, marked, and can't be picked. Pure: the
// "Link to a page…" combobox (src/components/card-link-picker.ts) shows it.

import { NATIVE_NOT_FOUND_PAGE, NATIVE_NOT_FOUND_ROUTE } from "../../shared/native-routes";

/** A page of the site: its address, file and title (card-fill.ts `pageTitle`). */
export interface SitePage {
  route: string;
  file: string;
  title: string;
}

export interface PageChoice extends SitePage {
  /** A card of the grid links to it already. */
  inGrid: boolean;
}

export interface PageChoiceGroup {
  label: string;
  pages: PageChoice[];
}

/** The folder a grid's cards link into (`/work/`): the most common parent of the pages they link to, the first one seen on a tie. */
export function cardFolder(routes: readonly (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  for (const route of routes) {
    if (!route?.endsWith("/")) continue;
    const parent = route.replace(/[^/]+\/$/, "");
    if (parent !== "/" && parent !== route) counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }
  let best: string | undefined;
  for (const [parent, count] of counts) if (!best || count > counts.get(best)!) best = parent;
  return best;
}

/**
 * The pages offered for a card of the grid on the page file `own`, whose
 * cards link to `inGrid`, in site order: those under the cards' folder,
 * then the others; with `query`, those whose title or address holds it.
 * Empty groups are left out.
 */
export function pageChoiceGroups(input: { pages: readonly SitePage[]; own: string; inGrid: readonly string[]; query?: string }): PageChoiceGroup[] {
  const present = new Set(input.inGrid);
  const folder = cardFolder(input.inGrid);
  const query = input.query?.trim().toLowerCase() ?? "";
  const pages = input.pages
    .filter((page) => page.file !== input.own && page.file !== NATIVE_NOT_FOUND_PAGE && page.route !== NATIVE_NOT_FOUND_ROUTE)
    .filter((page) => !query || page.title.toLowerCase().includes(query) || page.route.toLowerCase().includes(query))
    .map((page): PageChoice => ({ ...page, inGrid: present.has(page.route) }));
  if (!folder) return pages.length ? [{ label: "Pages", pages }] : [];
  const under = (page: PageChoice) => page.route !== folder && page.route.startsWith(folder);
  return [
    { label: `Under ${folder}`, pages: pages.filter(under) },
    { label: "Other pages", pages: pages.filter((page) => !under(page)) },
  ].filter((group) => group.pages.length);
}
