import { groupRouteChanges, rewriteRouteLinks } from "../native-page-moves";
import { readNativeSectionLinks } from "./native-section-links";
import { readPagePartLinks } from "./native-page-parts";
import { EDITOR_PAGE_BUILDER_PATH, readPageBuilderDocument, writePageBuilderDocument, type PageBuilderDocument } from "./page-builder-document";
import { locateSectionTarget, type SectionTarget } from "./source-target";

/**
 * The page entries of `.editor/page-builder.json` (`pages[path]`: shared
 * section links, page parts, anything else kept per page) when pages move,
 * are deleted or change URL. This is the single writer of those entries for
 * file moves and deletes: every operation that moves or deletes files runs it
 * (src/main.ts `applyNativeOperation`).
 */
export interface SidecarPagesChange {
  /** Sources before the change, by path (at least the pages that moved). */
  before: Readonly<Record<string, string | undefined>>;
  /** Sources after the change, by their new path. */
  after: Readonly<Record<string, string | undefined>>;
  /** Files the change moved, old path to new. */
  moves?: ReadonlyMap<string, string>;
  /** Files the change deleted. */
  deletes?: Iterable<string>;
  /**
   * The site-managed link rewrite the change applied (a page move's URL change,
   * see `routeLinkRewrite`). A shared section or page part copy that matched its
   * basis before, and matches the rewritten basis now, keeps counting as
   * unchanged: its basis gets the same rewrite.
   */
  rewriteLinks?: (html: string) => string;
}

/**
 * Entries follow moved pages and leave with deleted ones, whole (sections,
 * page parts and unknown data alike). It never merges: a move whose
 * destination already has its own entry (left from a file that no longer
 * exists) throws before anything changes. Creates, including duplicates,
 * start without an entry.
 */
export function rekeySidecarPages<T>(map: Record<string, T>, moves: ReadonlyMap<string, string>, deletes: Iterable<string>): void {
  for (const [from, to] of moves) if (Object.hasOwn(map, from) && Object.hasOwn(map, to) && !moves.has(to))
    throw new Error(`${to} already has page data in ${EDITOR_PAGE_BUILDER_PATH}, left from an earlier page there, so moving ${from} onto it would replace that data. Move the page somewhere else, or remove the leftover entry for ${to} in Code first.`);
  const moved = [...moves].filter(([from]) => Object.hasOwn(map, from)).map(([from, to]) => [from, to, map[from]] as const);
  for (const [from] of moved) delete map[from];
  for (const [, to, entry] of moved) map[to] = entry;
  for (const path of deletes) delete map[path];
}

/**
 * Shared section and page part links whose copy the change's URL rewrite
 * changed, in `document` (already re-keyed). Only a copy that was pristine
 * before (its exact bytes were its basis) and is now exactly the rewritten
 * basis is rebased; a customised copy, any other change to it, or a link the
 * change itself altered (its kind, record, target or basis between
 * `beforeText` and `afterText`) stays as it is. Malformed recognised links
 * throw.
 */
export function rebaseSectionLinks(document: PageBuilderDocument, beforeText: string | undefined, afterText: string | undefined, change: SidecarPagesChange & { rewriteLinks: (html: string) => string }): void {
  const moves = change.moves ?? new Map<string, string>(), deletes = new Set(change.deletes ?? []);
  type Link = { kind: string; recordId: string; basis: string; target: SectionTarget };
  const kinds: [string, Record<string, Record<string, Link>>, Record<string, Record<string, Link>>][] = [
    ["sections", readNativeSectionLinks(beforeText), readNativeSectionLinks(afterText)],
    ["pageParts", readPagePartLinks(beforeText), readPagePartLinks(afterText)],
  ];
  for (const [field, links, afterLinks] of kinds) for (const [from, entries] of Object.entries(links)) {
    if (deletes.has(from)) continue;
    const page = moves.get(from) ?? from;
    const old = change.before[from], now = change.after[page];
    if (old === undefined || now === undefined) continue;
    for (const [key, link] of Object.entries(entries)) {
      // Still the same recognised link after the change (keyed as before the move).
      const same = Object.hasOwn(afterLinks, from) && Object.hasOwn(afterLinks[from], key) ? afterLinks[from][key] : undefined;
      if (!same || same.kind !== link.kind || same.recordId !== link.recordId || same.basis !== link.basis || !sameJson(same.target, link.target)) continue;
      const was = locateSectionTarget(old, link.target);
      if ("error" in was || old.slice(was.element.start, was.element.end) !== link.basis) continue;
      const basis = change.rewriteLinks(link.basis);
      if (basis === link.basis) continue;
      const group = document.pages[page]?.[field];
      const entry = group && typeof group === "object" && !Array.isArray(group) ? group[key] : undefined;
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || entry.basis !== link.basis) continue;
      const is = locateSectionTarget(now, link.target);
      if ("error" in is || now.slice(is.element.start, is.element.end) !== basis) continue;
      entry.basis = basis;
    }
  }
}

/**
 * The sidecar's new text after a change that moves or deletes pages:
 * `beforeText` is the file before it, `afterText` as the change leaves it
 * otherwise (the same, unless the change edits it). Undefined when there is no
 * file or nothing in it changes. Throws a user-facing reason when the file is
 * not valid or an entry cannot follow its page.
 */
export function planSidecarPages(beforeText: string | undefined, afterText: string | undefined, change: SidecarPagesChange): string | undefined {
  if (afterText === undefined) return undefined;
  let document: PageBuilderDocument;
  try { readPageBuilderDocument(beforeText); document = readPageBuilderDocument(afterText); }
  catch (error) { throw new Error(`The editor's page data file ${EDITOR_PAGE_BUILDER_PATH} is not valid (${error instanceof Error ? error.message : String(error)}). Fix it in Code; nothing was changed.`); }
  rekeySidecarPages(document.pages, change.moves ?? new Map(), change.deletes ?? []);
  if (change.rewriteLinks) rebaseSectionLinks(document, beforeText, afterText, { ...change, rewriteLinks: change.rewriteLinks });
  const text = writePageBuilderDocument(document, afterText);
  return text === afterText ? undefined : text;
}

/**
 * The link rewrite a set of file moves makes to the site's URLs (as the Files
 * move rewrites links), from the routes before and after; undefined when no
 * page URL changes.
 */
export function routeLinkRewrite(routes: Readonly<Record<string, string>>, afterRoutes: Readonly<Record<string, string>>, moves: ReadonlyMap<string, string>): ((html: string) => string) | undefined {
  const afterRouteOf = new Map(Object.entries(afterRoutes).map(([url, path]) => [path, url]));
  const pairs = Object.entries(routes).flatMap(([url, path]): [string, string][] => {
    const next = moves.has(path) ? afterRouteOf.get(moves.get(path)!) : undefined;
    return next && next !== url ? [[url, next]] : [];
  });
  const changes = pairs.length ? groupRouteChanges(Object.keys(routes), pairs) : [];
  return changes.length ? (html: string) => changes.reduce((text, change) => rewriteRouteLinks(text, change.from, change.to, change.subtree).text, html) : undefined;
}

/** Structural equality of JSON values; object key order does not matter. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => sameJson(item, b[index]));
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = Object.keys(a), right = Object.keys(b);
  return left.length === right.length && left.every((key) => Object.hasOwn(b, key) && sameJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
