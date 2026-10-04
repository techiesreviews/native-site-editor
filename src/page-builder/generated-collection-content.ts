import { startTagAttribute } from "../../shared/html-source";
import { readCollections, type SourceCollection } from "./collection-model";
import type { CollectionPreview } from "./collection-bake";
import type { SourceElement } from "./component-model";

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
      const inside = edit.start === edit.end
        ? edit.start >= region.start && edit.start <= region.end
        : edit.start < region.end && edit.end > region.start;
      if (inside) return region;
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
