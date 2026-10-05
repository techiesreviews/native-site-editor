import type { CollectionIdentity } from "./collection-fields";
import { readCollections } from "./collection-model";
import { applyCollectionEdits } from "./collection-bake";
import { locatePageCollections, readSidecar } from "./document-collections";
import { EDITOR_PAGE_BUILDER_PATH, locateCollectionTarget, makeCollectionTarget, planLegacyCollectionImport, writePageBuilderDocument, type PageBuilderCollection, type PageBuilderDocument } from "./page-builder-document";

/**
 * Builds the one operation that stores a grid's recipe in the editor's page
 * data file. Inline (legacy) recipes on the site are imported in the same step,
 * so the HTML is left with finished cards only. The host planner bakes cards.
 */
export interface CollectionRecipe {
  folders: string[];
  sort: string;
  filter: string;
  limit: number;
  template: string;
  fields?: string[];
  overrides?: Record<string, Record<string, string>>;
}
export interface SidecarOrigin {
  /** Explicit recipe Save requests a bake even when its JSON is unchanged. */
  refreshCollections?: true;
  edits: Map<string, string>;
  creates: { path: string; content: string }[];
  expectedSources: Map<string, string | undefined>;
}
export interface SidecarSite { sources: Readonly<Record<string, string>>; routes: Readonly<Record<string, string>>; identity: CollectionIdentity }

/** The sidecar collection whose target is the element starting at `start` in `path`, if any. */
export function sidecarCollectionAt(sources: Readonly<Record<string, string>>, path: string, start: number): { id: string; collection: PageBuilderCollection } | undefined {
  const document = readSidecar(sources[EDITOR_PAGE_BUILDER_PATH]);
  const source = sources[path];
  if (source === undefined) return undefined;
  const found = Object.entries(locatePageCollections(source, document, path)).find(([, item]) => item.located.element.start === start);
  return found ? { id: found[0], collection: document.collections[found[0]] } : undefined;
}

/** Imports every inline recipe (if any) into the document, returning the cleaned page texts. */
export function withLegacyImported(site: SidecarSite) {
  const sidecar = site.sources[EDITOR_PAGE_BUILDER_PATH];
  const inline = Object.entries(site.sources).some(([path, text]) => path.endsWith(".html") && /data-each/i.test(text) && (() => { try { return readCollections(text).length > 0; } catch { return true; } })());
  if (!inline) return { document: readSidecar(sidecar), texts: new Map<string, string>(), expected: new Map<string, string | undefined>([[EDITOR_PAGE_BUILDER_PATH, sidecar]]) };
  const plan = planLegacyCollectionImport({ sources: { ...site.sources }, routes: { ...site.routes }, identity: site.identity, ...(sidecar !== undefined ? { sidecar } : {}) });
  if ("error" in plan) throw new Error(`The collections already on this site could not be moved into the editor's page data, so nothing was changed: ${plan.error}`);
  const texts = new Map<string, string>();
  for (const [path, edits] of Object.entries(plan.edits)) if (path !== EDITOR_PAGE_BUILDER_PATH) texts.set(path, applyCollectionEdits(site.sources[path], edits));
  return { document: plan.document, texts, expected: new Map(Object.entries(plan.expectedSources)) };
}

/**
 * Sets (or creates) the recipe of the grid at `start` in `path`. `start` is an
 * offset in the current page source; when inline recipes are imported first,
 * the grid is found again in the cleaned text by its exact opening tag.
 */
export function planSidecarRecipe(site: SidecarSite, path: string, start: number, recipe: CollectionRecipe, id?: string): SidecarOrigin {
  const source = site.sources[path];
  if (source === undefined) throw new Error(`Load ${path} before changing its collection.`);
  const existing = sidecarCollectionAt(site.sources, path, start);
  const { document, texts, expected } = withLegacyImported(site);
  const cleaned = texts.get(path) ?? source;
  // Imported recipes keep their element; the cleaned page holds it by its exact opening tag (or id).
  const target = existing?.collection.target ?? (() => {
    const located = locateCollectionTarget(cleaned, makeCollectionTarget(source, start));
    if ("error" in located) throw new Error(`This grid could not be found exactly in ${path}, so nothing was changed. ${located.error}`);
    return located.target;
  })();
  const key = existing?.id ?? id ?? Object.entries(document.collections).find(([, item]) => item.pagePath === path && JSON.stringify(item.target.path) === JSON.stringify(target.path))?.[0]
    ?? freshId(document, path);
  const previous = document.collections[key];
  document.collections[key] = {
    ...(previous ?? {}),
    pagePath: path,
    target,
    folders: [...recipe.folders],
    sort: recipe.sort,
    filter: recipe.filter,
    limit: recipe.limit,
    template: recipe.template,
    fields: [...(recipe.fields ?? previous?.fields ?? [])],
    overrides: structuredClone(recipe.overrides ?? previous?.overrides ?? {}),
  };
  return { ...originFor(site, document, texts, expected), refreshCollections: true };
}

/** Removes the grid's recipe: its current cards stay exactly as they are. */
export function planSidecarRemoval(site: SidecarSite, id: string): SidecarOrigin {
  const { document, texts, expected } = withLegacyImported(site);
  if (!Object.hasOwn(document.collections, id)) throw new Error("This collection is no longer in the editor's page data.");
  delete document.collections[id];
  return originFor(site, document, texts, expected);
}

function originFor(site: SidecarSite, document: PageBuilderDocument, texts: Map<string, string>, expected: Map<string, string | undefined>): SidecarOrigin {
  const before = site.sources[EDITOR_PAGE_BUILDER_PATH];
  const text = writePageBuilderDocument(document, before);
  const edits = new Map(texts);
  const creates: SidecarOrigin["creates"] = [];
  if (before === undefined) creates.push({ path: EDITOR_PAGE_BUILDER_PATH, content: text });
  else if (text !== before) edits.set(EDITOR_PAGE_BUILDER_PATH, text);
  for (const path of edits.keys()) if (!expected.has(path)) expected.set(path, site.sources[path]);
  expected.set(EDITOR_PAGE_BUILDER_PATH, before);
  return { edits, creates, expectedSources: expected };
}

function freshId(document: PageBuilderDocument, path: string): string {
  const base = `cards-${path.replace(/\/index\.html$|\.html$/, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "home"}`;
  let id = base;
  for (let n = 2; Object.hasOwn(document.collections, id); n++) id = `${base}-${n}`;
  return id;
}
