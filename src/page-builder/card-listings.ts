import { readCollections } from "./collection-model";
import { EDITOR_PAGE_BUILDER_PATH, locateCollections, readPageBuilderDocument, type PageBuilderCollection } from "./page-builder-document";

/**
 * Collections layer for Add card (goes with collections): which generated
 * listing a grid is in. `cards.ts` reads it only through `CardsDeps.listing`;
 * without it, every grid is one made by hand.
 */
export interface CardListing {
  /** The source folders of the listing the grid is in (none for a hand-made grid), or why that cannot be told. */
  folders: { folders?: string[]; error?: string };
  /** Whether the grid's cards are baked from a `data-each` listing in the page itself. */
  automatic: boolean;
}

type Range = { start: number; end: number };

/**
 * The source folders of the generated listing a grid (its first item at
 * `first`) is in: from `.editor/page-builder.json` (`sidecar`, its text) or
 * the listing's own `data-each`. None for a grid made by hand; a reason
 * whenever that cannot be told for sure (settings unread, unreadable,
 * unlocatable, or more than one listing).
 */
export function cardRecipeFolders(path: string, source: string, first: Range, sidecar: string | undefined, sidecarExists: boolean): { folders?: string[]; error?: string } {
  const holds = (element: Range) => element.start <= first.start && first.end <= element.end;
  const found: string[][] = [];
  try {
    for (const collection of readCollections(source)) {
      if (holds(collection.element) && !holds(collection.template)) found.push(collection.spec.folders);
    }
  } catch { return { error: "This listing's settings could not be read; fix them in the Collections panel first." }; }
  if (sidecar === undefined && sidecarExists) return { error: "Checking this page's collection settings; try again in a moment." };
  if (sidecar !== undefined) {
    let records: Record<string, PageBuilderCollection>;
    try {
      records = Object.fromEntries(Object.entries(readPageBuilderDocument(sidecar).collections).filter(([, record]) => record.pagePath === path));
    } catch { return { error: `${EDITOR_PAGE_BUILDER_PATH} could not be read, so this listing's folders are unknown.` }; }
    if (Object.keys(records).length) {
      const located = locateCollections(source, records);
      if ("error" in located) return { error: `This page's collections could not be found: ${located.error}` };
      for (const [id, at] of Object.entries(located.collections)) if (holds(at.element)) found.push(records[id].folders);
    }
  }
  if (found.length > 1) return { error: "This grid is in more than one listing; add its page in the Collections panel." };
  return found.length ? { folders: found[0] } : {};
}

/** Whether a grid (its first item at `first`) is inside a `data-each` listing of the page, outside its template. */
export function cardInListing(source: string, first: Range): boolean {
  try {
    return readCollections(source).some(({ element, template }) => element.start <= first.start && first.end <= element.end &&
      !(template.start <= first.start && first.end <= template.end));
  } catch { return false; }
}

/** The listing a grid on page `path` is in, with the sidecar as the editor has it. */
export function cardListing(path: string, source: string, first: Range | undefined, sidecar: string | undefined, sidecarExists: boolean): CardListing {
  if (!first) return { folders: {}, automatic: false };
  return { folders: cardRecipeFolders(path, source, first, sidecar, sidecarExists), automatic: cardInListing(source, first) };
}
