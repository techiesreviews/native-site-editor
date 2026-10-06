import { startTagAttribute } from "../../shared/html-source";
import { makeSectionTarget } from "./source-target";
import { readCollections, type SourceCollection } from "./collection-model";
import type { CollectionPreview } from "./collection-bake";
import type { SourceElement } from "./component-model";
import { locatePageCollections, readSidecar } from "./document-collections";
import { locateCollections, writePageBuilderDocument } from "./page-builder-document";

/**
 * Cards a collection generates live after its template, inside the listing
 * element. That text is rebuilt from the template and page data on every bake,
 * so direct edits to it would be lost. These helpers tell where that text is,
 * which page a card came from, and how to keep the cards as plain HTML.
 */
export interface GeneratedRegion {
  /** Listing element start (the `data-each` host). */
  host: number;
  /** Listing element end, after its close tag. */
  hostEnd: number;
  /** First offset after `</template>`. */
  start: number;
  /** Offset of the listing's close tag. */
  end: number;
  collection: SourceCollection;
}

export function generatedRegions(source: string): GeneratedRegion[] {
  let collections: SourceCollection[];
  try { collections = readCollections(source); } catch { return []; }
  return collections.map((collection) => ({
    host: collection.element.start,
    hostEnd: collection.element.end,
    start: collection.template.end,
    end: collection.element.close!.start,
    collection,
  }));
}

/** The listing whose generated cards contain `offset`, if any. */
export function generatedRegionAt(source: string, offset: number): GeneratedRegion | undefined {
  return generatedRegions(source).find((region) => offset >= region.start && offset < region.end);
}

/**
 * The listing whose generated cards an edit would change. Replacing or
 * removing the whole listing keeps its recipe intact and is allowed.
 */
export function editTouchesGenerated(source: string, edits: readonly { start: number; end: number }[]): GeneratedRegion | undefined {
  const regions = generatedRegions(source);
  for (const edit of edits) {
    for (const region of regions) {
      if (edit.start <= region.host && edit.end >= region.hostEnd) continue;
      // A bake replaces everything inside the listing except the template:
      // the cards after it and anything before it.
      const { element, template } = region.collection;
      const ranges = [[element.tag.end, template.start], [region.start, region.end]];
      const inside = ranges.some(([from, to]) => edit.start === edit.end
        ? edit.start >= from && edit.start <= to
        : edit.start < to && edit.end > from);
      const withinTemplate = edit.start >= template.tag.end && edit.end <= (template.close?.start ?? template.end);
      if (inside && !withinTemplate) return region;
    }
  }
  return undefined;
}

export const GENERATED_EDIT_REFUSED = "These cards are made from page data, so changes here would be replaced. Edit the page the card comes from, or change the collection.";

/**
 * Which page a generated card came from. Only answers when the listing is
 * exactly what its template produces and the template makes one top-level
 * element per page, so card N is page N.
 */
export function generatedCardRecord(source: string, region: GeneratedRegion, preview: CollectionPreview | undefined, offset: number): { path: string; url: string } | undefined {
  if (!preview || preview.start !== region.host) return undefined;
  if (source.slice(region.start, region.end) !== preview.output) return undefined;
  const templateRoots = region.collection.template.children.filter((node): node is SourceElement => node.type === "element");
  const templateText = region.collection.template.children.filter((node) => node.type === "text")
    .every((node) => !source.slice(node.start, node.end).trim());
  if (templateRoots.length !== 1 || !templateText) return undefined;
  const cards = region.collection.element.children.filter((node): node is SourceElement =>
    node.type === "element" && node !== region.collection.template && node.start >= region.start);
  if (cards.length !== preview.records.length) return undefined;
  const index = cards.findIndex((card) => offset >= card.start && offset < card.end);
  return index < 0 ? undefined : { path: preview.records[index].path, url: preview.records[index].url };
}

const AUTHORING = ["data-each", "data-sort", "data-filter", "data-limit", "data-fields", "data-collection-id"];

/**
 * Keeps the current cards as hand-written HTML: drops the direct template
 * and only the collection authoring attributes. Everything else stays.
 */
export function manualCardsSource(source: string, host: number): string {
  const region = generatedRegions(source).find((item) => item.host === host);
  if (!region) throw new Error("The collection could not be found in the source.");
  const { element, template } = region.collection;
  let removeEnd = template.end;
  // The line break the template sat on goes with it.
  const after = /^[ \t]*\r?\n/.exec(source.slice(removeEnd));
  if (after) removeEnd += after[0].length;
  let removeStart = template.start;
  const before = /(\r?\n)[ \t]*$/.exec(source.slice(element.tag.end, removeStart));
  if (before && after) removeStart -= before[0].length - before[1].length;
  // Attribute ranges include their leading whitespace; remove later ones first.
  const found = AUTHORING.map((name) => startTagAttribute(source, element.tag, name)).filter((item) => item !== undefined)
    .sort((a, b) => b.start - a.start);
  let tag = source.slice(element.tag.start, element.tag.end);
  for (const item of found) tag = tag.slice(0, item.start - element.tag.start) + tag.slice(item.end - element.tag.start);
  return source.slice(0, element.tag.start) + tag + source.slice(element.tag.end, removeStart) + source.slice(removeEnd);
}

/** Cards of a collection whose recipe is in the editor's page data file. */
export interface DocumentRegion { id: string; host: number; hostEnd: number; start: number; end: number }
/**
 * The regions the sidecar's collections own in `path`. Throws when the sidecar
 * is invalid or a target cannot be found exactly: callers refuse to write then.
 */
export function documentRegions(source: string, path: string, sidecar: string | undefined): DocumentRegion[] {
  if (sidecar === undefined) return [];
  const document = readSidecar(sidecar);
  return Object.entries(locatePageCollections(source, document, path)).map(([id, item]) =>
    ({ id, host: item.located.element.start, hostEnd: item.located.element.end, start: item.start, end: item.end }));
}
export function documentEditTouches(regions: readonly DocumentRegion[], edits: readonly { start: number; end: number }[]): DocumentRegion | undefined {
  for (const edit of edits) for (const region of regions) {
    if (edit.start <= region.host && edit.end >= region.hostEnd) continue;
    const inside = edit.start === edit.end ? edit.start >= region.start && edit.start <= region.end : edit.start < region.end && edit.end > region.start;
    if (inside) return region;
  }
  return undefined;
}

/**
 * What a page edit does to the collections the editor's JSON keeps on that
 * page. An edit that leaves every grid findable needs nothing. An edit made
 * only inside a grid's own opening tag (a class, style or attribute change)
 * keeps the grid where it is in the page, so its stored target is rewritten
 * from that same element and returned as the JSON to write with the edit.
 * Anything else that would leave a grid missing or ambiguous (deleting it,
 * duplicating it, pasting an identical opening tag) is refused with the
 * reason: a stale position is never taken as proof of which grid is which.
 */
export function planDocumentTargetEdit(source: string, path: string, sidecar: string | undefined, edits: readonly { start: number; end: number; text: string }[]): { sidecar?: string } | { error: string } {
  if (sidecar === undefined || !edits.length) return {};
  const document = readSidecar(sidecar);
  const records = Object.fromEntries(Object.entries(document.collections).filter(([, collection]) => collection.pagePath === path));
  if (!Object.keys(records).length) return {};
  const before = locatePageCollections(source, document, path);
  const ordered = [...edits].sort((a, b) => a.start - b.start);
  for (let index = 1; index < ordered.length; index++) if (ordered[index].start < ordered[index - 1].end) return { error: "Overlapping edits cannot be checked against the page's collections." };
  let candidate = source;
  for (const edit of [...ordered].reverse()) candidate = candidate.slice(0, edit.start) + edit.text + candidate.slice(edit.end);
  if (!("error" in locateCollections(candidate, records))) return {};
  // Each edit must lie strictly inside one grid's opening tag (after its name, before its closing bracket).
  const shift = (at: number) => ordered.reduce((delta, edit) => edit.end <= at ? delta + edit.text.length - (edit.end - edit.start) : delta, 0);
  const changed = new Set<string>();
  for (const edit of ordered) {
    const owner = Object.entries(before).find(([, item]) => {
      const tag = item.located.element.tag;
      return edit.start > tag.start + 1 + item.located.element.name.length && edit.end < tag.end;
    });
    if (!owner) return { error: refusal(path, locateCollections(candidate, records)) };
    changed.add(owner[0]);
  }
  const updated = structuredClone(document);
  try {
    for (const id of changed) {
      const element = before[id].located.element;
      const target = makeSectionTarget(candidate, element.start + shift(element.start));
      if (target.tag !== element.name || JSON.stringify(target.path) !== JSON.stringify(before[id].located.target.path)) return { error: refusal(path) };
      updated.collections[id] = { ...updated.collections[id], target };
    }
  } catch (error) { return { error: refusal(path, { error: (error as Error).message }) }; }
  const after = locateCollections(candidate, Object.fromEntries(Object.entries(updated.collections).filter(([, collection]) => collection.pagePath === path)));
  if ("error" in after) return { error: refusal(path, after) };
  for (const id of changed) if (after.collections[id].element.start !== before[id].located.element.start + shift(before[id].located.element.start)) return { error: refusal(path) };
  return { sidecar: writePageBuilderDocument(updated, sidecar) };
}
function refusal(path: string, found?: { error: string } | object) {
  const reason = found && "error" in found ? ` (${(found as { error: string }).error})` : "";
  return `This change would leave a collection on ${path} without one exact grid to fill${reason}, so nothing was changed. Give the grid a unique id in the Source editor, or remove its collection recipe to keep the cards as authored HTML.`;
}
