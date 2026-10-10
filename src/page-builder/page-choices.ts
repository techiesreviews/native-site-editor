// The pages a new card can link to (wayfinder components-and-builder ticket
// 09 §2, build slice 52): every page of the site but the grid's own and the
// not-found page. Pages under the folder the grid's cards link into come
// first, then "Other pages"; a search covers them all. Pages a card of the
// grid already links to stay listed, marked, and can't be picked. Unknown
// titles and addresses offer Create page, with errors shown disabled. Pure: the
// "Link to a page…" combobox (src/components/card-link-picker.ts) shows it.

import { cardPrefixRequest, planCardPage } from "./cards";
import { slugify } from "../native-pages";
import type { CardPageRequest } from "../components/card-grid-controls";
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
    // A folder page (`/work/a/`) or a file page (`/work/a.html`) alike.
    const parent = route?.replace(/[^/]+\/?$/, "");
    if (parent && parent !== "/" && parent !== route) counts.set(parent, (counts.get(parent) ?? 0) + 1);
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
export function pageChoiceGroups(input: { pages: readonly SitePage[]; own: string; inGrid: readonly string[]; folder?: string; query?: string }): PageChoiceGroup[] {
  const present = new Set(input.inGrid);
  const folder = cardFolder(input.inGrid);
  const typed = input.query?.trim().toLowerCase() ?? "";
  const query = typed.startsWith("/") ? typed.replace(/\/+$/, "") : typed;
  const planned = typed && !typed.startsWith("/") ? `${folder ?? input.folder ?? "/"}${slugify(typed)}/` : undefined;
  const pages = input.pages
    .filter((page) => page.file !== input.own && page.file !== NATIVE_NOT_FOUND_PAGE && page.route !== NATIVE_NOT_FOUND_ROUTE)
    .filter((page) => !query || page.title.toLowerCase().includes(query) || page.route.toLowerCase().includes(query) || page.route.toLowerCase() === planned)
    .map((page): PageChoice => ({ ...page, inGrid: present.has(page.route) }));
  if (!folder) return pages.length ? [{ label: "Pages", pages }] : [];
  const under = (page: PageChoice) => page.route !== folder && page.route.startsWith(folder);
  return [
    { label: `Under ${folder}`, pages: pages.filter(under) },
    { label: "Other pages", pages: pages.filter((page) => !under(page)) },
  ].filter((group) => group.pages.length);
}

/** A new page planned from the combobox; errors stay visible as disabled offers. */
export interface CreatePageOffer {
  title: string;
  route: string;
  request: CardPageRequest;
  error?: string;
}

/** Pure: infer a title's folder, or keep a typed address, and check creation. */
export function createPageOffer(input: {
  query: string;
  pages: readonly SitePage[];
  routes: Record<string, string>;
  inGrid: readonly string[];
  folders: string[];
  folder?: string;
  exists(path: string): boolean;
}): CreatePageOffer | undefined {
  const typed = input.query.trim();
  if (!typed) return undefined;
  const address = (route: string) => route.toLowerCase().replace(/\/+$/, "");
  if (input.pages.some(page => address(page.route) === address(typed) || page.title.toLowerCase() === typed.toLowerCase())) return undefined;
  let title = typed;
  let parent = cardFolder(input.inGrid) ?? input.folder ?? "/";
  let slug: string | undefined;
  if (typed.startsWith("/")) {
    const path = address(typed);
    const at = path.lastIndexOf("/");
    parent = path.slice(0, at + 1) || "/";
    slug = path.slice(at + 1);
    const words = slug.replace(/[-_]+/g, " ");
    title = words.charAt(0).toUpperCase() + words.slice(1);
  }
  const route = `${parent}${slug ?? (slugify(title) || "…")}/`;
  if (Object.keys(input.routes).some(known => address(known) === address(route))) return undefined;
  const parsed = cardPrefixRequest(title, parent, input.folders, true);
  const request: CardPageRequest = { ...(parsed.ok ? parsed.value : { title, parent }), ...(slug === undefined ? {} : { slug }) };
  const planned = parsed.ok ? planCardPage(input, request) : parsed;
  if (!planned.ok && planned.error.startsWith(`The URL ${route} is taken`)) return undefined;
  return { title, route: planned.ok ? planned.value.route : route, request, ...(planned.ok ? {} : { error: planned.error }) };
}
