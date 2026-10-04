import { applyCollectionEdits, bindCollectionTemplate } from "./collection-bake";
import { descendants, parseSource, startTagAttributes } from "./component-model";
import { builtinFields, ownPageField, type CollectionIdentity, type PageFields } from "./collection-fields";
import { collectionRecords, collectionSpec, knownCollectionField, MAX_COLLECTION_ITEMS, type CollectionRecord } from "./collection-model";
import { EDITOR_PAGE_BUILDER_PATH, locateCollections, readPageBuilderDocument, type LocatedCollectionTarget, writePageBuilderDocument, type PageBuilderCollection, type PageBuilderDocument } from "./page-builder-document";

/**
 * Collections whose recipes live only in `.editor/page-builder.json`. The page
 * HTML holds finished cards and nothing else; the editor rebuilds them from the
 * recipe and page data, and records the exact cards it wrote so a later change
 * can tell its own output from hand edits. Deleting the JSON leaves the cards.
 */
export interface DocumentCollectionPreview { id: string; path: string; start: number; records: CollectionRecord[]; output: string }
export interface DocumentBakeInput {
  identity: CollectionIdentity;
  before: { sources: Readonly<Record<string, string>>; routes: Readonly<Record<string, string>> };
  /** Graph after the origin was applied, including the sidecar's new text (or its absence). */
  candidate: { sources: Readonly<Record<string, string>>; routes: Readonly<Record<string, string>> };
  /** Page files the origin moved, old path to new. */
  moves?: ReadonlyMap<string, string>;
  /** Deleted page files. */
  deletes?: readonly string[];
  /** Maps a collection folder URL through the origin's folder relocations. */
  relocateFolder?: (folder: string) => string;
  /** Collection ids whose current cards may be replaced although they differ from the recorded output. */
  accept?: readonly string[];
}
export interface DocumentBakePlan {
  /** Full new text of every changed page and of the sidecar (`undefined`: no sidecar file). */
  texts: Map<string, string | undefined>;
  collections: DocumentCollectionPreview[];
  /** Collection ids found drifted before the change (for recovery UI). */
  drifted: { id: string; kind: "edited" | "unbuilt" }[];
}

const SIDECAR_INVALID = (error: unknown) =>
  `The editor's page data file ${EDITOR_PAGE_BUILDER_PATH} is not valid (${error instanceof Error ? error.message : String(error)}). Fix it in Code, or delete it to keep the cards as plain HTML.`;

/** Reads the sidecar or throws a user-facing reason; absence is an empty document. */
export function readSidecar(text: string | undefined): PageBuilderDocument {
  try { return readPageBuilderDocument(text); } catch (error) { throw new Error(SIDECAR_INVALID(error)); }
}

/**
 * Every collection of one page, located together: same, nested or stale
 * targets refuse the whole page instead of guessing which cards are whose.
 */
export function locatePageCollections(source: string, document: PageBuilderDocument, pagePath: string): Record<string, { located: LocatedCollectionTarget; start: number; end: number; text: string }> {
  const records = Object.fromEntries(Object.entries(document.collections).filter(([, collection]) => collection.pagePath === pagePath));
  if (!Object.keys(records).length) return {};
  const found = locateCollections(source, records);
  if ("error" in found) throw new Error(`The collections on ${pagePath} can no longer be found exactly (${found.error}). Undo the change that moved them, or remove a collection.`);
  return Object.fromEntries(Object.entries(found.collections).map(([id, located]) => [id, { located, start: located.element.tag.end, end: located.element.close!.start, text: source.slice(located.element.tag.end, located.element.close!.start) }]));
}

/** Each existing collection's current cards against the exact output the editor last wrote. */
export function documentDrift(sources: Readonly<Record<string, string>>, document: PageBuilderDocument): { id: string; kind: "edited" | "unbuilt" | "missing"; reason?: string }[] {
  const drift: { id: string; kind: "edited" | "unbuilt" | "missing"; reason?: string }[] = [];
  for (const pagePath of new Set(Object.values(document.collections).map((collection) => collection.pagePath))) {
    const ids = Object.entries(document.collections).filter(([, collection]) => collection.pagePath === pagePath).map(([id]) => id);
    const source = sources[pagePath];
    if (source === undefined) { for (const id of ids) drift.push({ id, kind: "missing", reason: `Load ${pagePath} before changing its collection.` }); continue; }
    let located: ReturnType<typeof locatePageCollections>;
    try { located = locatePageCollections(source, document, pagePath); }
    catch (error) { for (const id of ids) drift.push({ id, kind: "missing", reason: (error as Error).message }); continue; }
    for (const id of ids) {
      const collection = document.collections[id], inner = located[id];
      if (collection.outputFingerprint === inner.text) continue;
      drift.push({ id, kind: collection.outputFingerprint === undefined && !inner.text.trim() ? "unbuilt" : "edited" });
    }
  }
  return drift;
}

function sortedRecords(records: CollectionRecord[], collection: PageBuilderCollection, declared: readonly string[]) {
  const spec = collectionSpec({ folders: collection.folders, sort: collection.sort, filter: collection.filter, limit: String(collection.limit) });
  let out = records;
  if (spec.filter) {
    const at = spec.filter.indexOf("=");
    const field = spec.filter.slice(0, at), value = spec.filter.slice(at + 1);
    if (!knownCollectionField(field, records, declared)) throw new Error(`Unknown collection field: ${field}.`);
    out = out.filter((record) => ownPageField(record.fields, field) === value);
  }
  if (spec.sort) {
    const descending = spec.sort.startsWith("-");
    const field = descending ? spec.sort.slice(1) : spec.sort;
    if (!knownCollectionField(field, records, declared)) throw new Error(`Unknown collection field: ${field}.`);
    out = out.map((record, index) => ({ record, index })).sort((a, b) => {
      const av = ownPageField(a.record.fields, field), bv = ownPageField(b.record.fields, field);
      const comparison = av < bv ? -1 : av > bv ? 1 : 0;
      return comparison ? comparison * (descending ? -1 : 1) : a.index - b.index;
    }).map(({ record }) => record);
  }
  return out.slice(0, spec.limit);
}

/** The recipe's data-if conditions are editor-only: the published card carries none. */
function withoutConditions(html: string): string {
  const edits = [...descendants(parseSource(html))].flatMap((element) => startTagAttributes(html, element.tag).filter((attr) => attr.name === "data-if").map((attr) => ({ start: attr.start, end: attr.end, text: "" })));
  return edits.length ? applyCollectionEdits(html, edits) : html;
}

function stringFields(value: unknown): PageFields {
  const out: PageFields = Object.create(null);
  if (value && typeof value === "object" && !Array.isArray(value))
    for (const [key, item] of Object.entries(value)) if (typeof item === "string" && !builtinFields.includes(key as never)) out[key] = item;
  return out;
}

/**
 * Plans every sidecar collection's cards for the candidate graph. Refuses,
 * writing nothing, when a collection's current cards differ from what the
 * editor last wrote (unless that id is explicitly accepted), when its target
 * cannot be found uniquely, or when the sidecar is invalid.
 */
export function planDocumentBake(input: DocumentBakeInput): DocumentBakePlan | { error: string } {
  try {
    const beforeText = input.before.sources[EDITOR_PAGE_BUILDER_PATH];
    const afterText = input.candidate.sources[EDITOR_PAGE_BUILDER_PATH];
    const before = readSidecar(beforeText);
    const after = readSidecar(afterText);
    const accept = new Set(input.accept ?? []);
    const drift = documentDrift(input.before.sources, before);
    // Cards that cannot be located refuse first: acceptance never stands in for a target.
    for (const item of drift) if (item.kind === "missing" && Object.hasOwn(after.collections, item.id)) throw new Error(item.reason!);
    for (const id of accept) if (!drift.some((item) => item.id === id)) throw new Error(`The cards of collection “${id}” already match their page data.`);
    for (const item of drift) {
      // A collection the change removes from the sidecar keeps its cards as they are.
      if (!Object.hasOwn(after.collections, item.id)) continue;
      if (item.kind === "missing") throw new Error(item.reason!);
      if (accept.has(item.id)) continue;
      const page = before.collections[item.id].pagePath;
      throw new Error(item.kind === "edited"
        ? `The cards in ${page} were edited by hand and no longer match the page data, so this change would replace them. Select the collection and choose “Use manual cards” to keep them, or “Rebuild cards from page data” to replace them.`
        : `The cards in ${page} have not been built from page data yet. Select the collection and choose “Build cards from page data” first.`);
    }
    const moves = input.moves ?? new Map<string, string>();
    const deletes = new Set(input.deletes ?? []);
    const relocate = input.relocateFolder ?? ((folder: string) => folder);
    const document: PageBuilderDocument = structuredClone(after);
    // Page metadata follows moved pages and leaves with deleted ones.
    const rekey = <T>(map: Record<string, T>) => {
      for (const [from, to] of moves) if (Object.hasOwn(map, from)) { map[to] = map[from]; delete map[from]; }
      for (const path of deletes) delete map[path];
    };
    rekey(document.pages);
    const pageEdits = new Map<string, { start: number; end: number; text: string; id: string }[]>();
    const previews: DocumentCollectionPreview[] = [];
    // Page paths and folders are updated first so each page's collections are located together.
    for (const [id, collection] of Object.entries(document.collections)) {
      collection.pagePath = moves.get(collection.pagePath) ?? collection.pagePath;
      if (deletes.has(collection.pagePath)) delete document.collections[id];
    }
    const located = new Map<string, ReturnType<typeof locatePageCollections>>();
    for (const [id, collection] of Object.entries(document.collections)) {
      collection.folders = collection.folders.map(relocate);
      rekey(collection.overrides);
      const source = input.candidate.sources[collection.pagePath];
      if (source === undefined) throw new Error(`Load ${collection.pagePath} before baking its collection.`);
      const inner = (located.get(collection.pagePath) ?? located.set(collection.pagePath, locatePageCollections(source, document, collection.pagePath)).get(collection.pagePath)!)[id];
      collection.target = inner.located.target;
      const all = collectionRecords({ ...input.candidate.sources }, { ...input.candidate.routes }, input.identity,
        { folder: collection.folders.join(" "), folders: collection.folders, sort: "", filter: "", limit: Number.MAX_SAFE_INTEGER }, collection.pagePath, collection.fields)
        .map((record) => {
          const page = document.pages[record.path];
          // An authored date in the JSON stands in only where the page has no real date of its own.
          const date: PageFields = typeof page?.date === "string" && !record.fields.date ? { date: page.date } : {};
          const fields: PageFields = { ...record.fields, ...date, ...stringFields(page?.fields), ...(collection.overrides[record.path] ?? {}) };
          return { ...record, fields };
        });
      if (all.length > MAX_COLLECTION_ITEMS * 4) throw new Error("Too many pages for one collection.");
      const known = [...new Set([...collection.fields, ...all.flatMap((record) => Object.keys(record.fields))])];
      // An empty list still validates its template instead of silently accepting a typo.
      bindCollectionTemplate(collection.template, Object.fromEntries([...builtinFields, ...known].map((field) => [field, ""])), known);
      const records = sortedRecords(all, collection, collection.fields);
      const newline = source.includes("\r\n") ? "\r\n" : "\n";
      const output = records.map((record) => withoutConditions(bindCollectionTemplate(collection.template, record.fields, known))).join(newline);
      collection.outputFingerprint = output;
      if (output !== inner.text) (pageEdits.get(collection.pagePath) ?? pageEdits.set(collection.pagePath, []).get(collection.pagePath)!).push({ start: inner.start, end: inner.end, text: output, id });
      previews.push({ id, path: collection.pagePath, start: inner.located.element.start, records, output });
    }
    const texts = new Map<string, string | undefined>();
    for (const [path, edits] of pageEdits) {
      const next = applyCollectionEdits(input.candidate.sources[path], edits);
      texts.set(path, next);
      // Opening tags are unchanged; refresh each target's path against the new text.
      const placed = locatePageCollections(next, document, path);
      for (const [id, item] of Object.entries(placed)) document.collections[id].target = item.located.target;
    }
    const empty = !Object.keys(document.collections).length && !Object.keys(document.pages).length && Object.keys(document).length === 3;
    // No file is created for nothing; an existing (or deleted) file is otherwise rewritten only when it changes.
    const sidecar = afterText === undefined && empty ? undefined : writePageBuilderDocument(document, afterText);
    if (sidecar !== afterText) texts.set(EDITOR_PAGE_BUILDER_PATH, sidecar);
    return { texts, collections: previews, drifted: drift.filter((item): item is { id: string; kind: "edited" | "unbuilt" } => item.kind !== "missing") };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The collections could not be baked." };
  }
}
