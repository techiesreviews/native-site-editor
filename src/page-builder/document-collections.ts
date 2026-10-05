import { applyCollectionEdits, bindCollectionTemplate, selectCollectionRecords, type BakePageData, type BrokenListing } from "./collection-bake";
import { mediaResolvePath, rewriteMediaReferences } from "./media-references";
import { mediaUrl } from "./media-markup";
import { descendants, parseSource, startTagAttributes } from "./component-model";
import { builtinFields, resolvePageFields, type CollectionIdentity, type PageFields } from "./collection-fields";
import { collectionRecords, collectionSpec, MAX_COLLECTION_ITEMS, type CollectionRecord } from "./collection-model";
import { readNativeSectionLinks } from "./native-section-links";
import { readPagePartLinks } from "./native-page-parts";
import { EDITOR_PAGE_BUILDER_PATH, locateCollectionTarget, locateCollections, readPageBuilderDocument, type LocatedCollectionTarget, writePageBuilderDocument, type PageBuilderCollection, type PageBuilderDocument } from "./page-builder-document";

/**
 * Collections whose recipes live only in `.editor/page-builder.json`. The page
 * HTML holds finished cards and nothing else; the editor rebuilds them from the
 * recipe and page data, and records the exact cards it wrote so a later change
 * can tell its own output from hand edits. Deleting the JSON leaves the cards.
 */
export interface DocumentCollectionPreview { id: string; path: string; start: number; records: CollectionRecord[]; output: string }
export interface DocumentBakeInput {
  identity: CollectionIdentity;
  beforeIdentity?: CollectionIdentity;
  /** Host operations may leave unrelated broken listings untouched. */
  skipBroken?: true;
  /** Pre-Code-edit page text, used only to compare selected inputs. */
  inputBasis?: { path: string; source: string };
  /** Recipes explicitly saved even when no recipe bytes changed. */
  touchCollections?: readonly string[];
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
  /**
   * The site-managed link rewrite the origin applied (a page move's URL change). A shared
   * section or page part copy that matched its basis before, and matches the rewritten basis
   * now, keeps counting as unchanged: its basis gets the same rewrite.
   */
  rewriteLinks?: (html: string) => string;
}
export interface DocumentBakePlan {
  /** Full new text of every changed page and of the sidecar (`undefined`: no sidecar file). */
  texts: Map<string, string | undefined>;
  collections: DocumentCollectionPreview[];
  /** Collection ids found drifted before the change (for recovery UI). */
  drifted: { id: string; kind: "edited" | "unbuilt" }[];
  skipped: BrokenListing[];
}

const SIDECAR_INVALID = (error: unknown) =>
  `The editor's page data file ${EDITOR_PAGE_BUILDER_PATH} is not valid (${error instanceof Error ? error.message : String(error)}). Fix it in Code; the editor changes no collection until it is valid, and never removes your page data.`;

/**
 * Page data for a bake, from the whole file graph: `files` lists every path
 * that exists, read or not. A JSON that exists but is not read (or is invalid)
 * refuses; it is never taken as absent. Without `files`, a JSON missing from
 * `sources` is taken as absent (standalone callers that pass every file).
 */
export function bakePageData(sources: Readonly<Record<string, string | undefined>>, files?: readonly string[]): BakePageData {
  return () => {
    const text = Object.hasOwn(sources, EDITOR_PAGE_BUILDER_PATH) ? sources[EDITOR_PAGE_BUILDER_PATH] : undefined;
    if (text === undefined && files?.includes(EDITOR_PAGE_BUILDER_PATH)) throw new Error(`Load ${EDITOR_PAGE_BUILDER_PATH} before rebuilding collections.`);
    return { pages: readSidecar(text).pages };
  };
}

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
  if ("error" in found) throw new Error(`The collections on ${pagePath} can no longer be found exactly (${found.error}). Undo the change that moved them, or open Page settings › Fields and forget the recipe there; its cards stay as they are.`);
  return Object.fromEntries(Object.entries(found.collections).map(([id, located]) => [id, { located, start: located.element.tag.end, end: located.element.close!.start, text: source.slice(located.element.tag.end, located.element.close!.start) }]));
}

/** Each existing collection's current cards against the exact output the editor last wrote. */
export function documentDrift(sources: Readonly<Record<string, string>>, document: PageBuilderDocument): { id: string; kind: "edited" | "unbuilt" | "missing"; reason?: string }[] {
  const drift: { id: string; kind: "edited" | "unbuilt" | "missing"; reason?: string }[] = [];
  for (const pagePath of new Set(Object.values(document.collections).map((collection) => collection.pagePath))) {
    const ids = Object.entries(document.collections).filter(([, collection]) => collection.pagePath === pagePath).map(([id]) => id);
    const source = sources[pagePath];
    if (source === undefined) { for (const id of ids) drift.push({ id, kind: "missing", reason: `${pagePath} is not loaded or no longer exists. If it was moved or deleted, open Page settings › Fields and forget the recipe of “${id}”; its cards are not affected.` }); continue; }
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
  return selectCollectionRecords(records, collectionSpec({ folders: collection.folders, sort: collection.sort, filter: collection.filter, limit: String(collection.limit) }), declared);
}

/** The recipe's data-if conditions are editor-only: the published card carries none. */
function withoutConditions(html: string): string {
  const edits = [...descendants(parseSource(html))].flatMap((element) => startTagAttributes(html, element.tag).filter((attr) => attr.name === "data-if").map((attr) => ({ start: attr.start, end: attr.end, text: "" })));
  return edits.length ? applyCollectionEdits(html, edits) : html;
}

/**
 * Plans every sidecar collection's cards for the candidate graph. Refuses,
 * writing nothing, when a collection's current cards differ from what the
 * editor last wrote (unless that id is explicitly accepted), when its target
 * cannot be found uniquely, or when the sidecar is invalid. With `skipBroken`,
 * an untouched broken listing is left exactly as it was and named in `skipped`;
 * invalid JSON syntax/schema and changed inputs still refuse the whole plan.
 */
export function planDocumentBake(input: DocumentBakeInput): DocumentBakePlan | { error: string } {
  try {
    const beforeText = input.before.sources[EDITOR_PAGE_BUILDER_PATH];
    const afterText = input.candidate.sources[EDITOR_PAGE_BUILDER_PATH];
    const before = readSidecar(beforeText);
    const after = readSidecar(afterText);
    const accept = new Set(input.accept ?? []);
    const drift = documentDrift(input.before.sources, before);
    const skipped: BrokenListing[] = [];
    const skippedIds = new Set<string>();
    // Compare the whole selected input set, before sort/filter/limit: a broken
    // recipe cannot safely tell which records would have reached its cards.
    const inputs = (graph: DocumentBakeInput["before"], document: PageBuilderDocument, collection: PageBuilderCollection, identity: CollectionIdentity) =>
      JSON.stringify(collectionRecords({ ...graph.sources }, { ...graph.routes }, identity,
        { folder: collection.folders.join(" "), folders: collection.folders, sort: "", filter: "", limit: Number.MAX_SAFE_INTEGER }, collection.pagePath, collection.fields)
        .map(record => [record.path, record.url, { ...resolvePageFields(record.fields, document.pages[record.path]), ...(collection.overrides[record.path] ?? {}) }]));
    const beforeInputs = input.inputBasis ? { ...input.before, sources: { ...input.before.sources, [input.inputBasis.path]: input.inputBasis.source } } : input.before;
    const leaveBroken = (id: string, error: unknown): boolean => {
      const previous = before.collections[id], next = after.collections[id];
      if (!input.skipBroken || !previous || !next || (input.accept ?? []).includes(id) || input.touchCollections?.includes(id) ||
          !sameJson(previous, next) || input.moves?.has(previous.pagePath) || input.deletes?.includes(previous.pagePath) ||
          input.before.sources[previous.pagePath] !== input.candidate.sources[next.pagePath] ||
          previous.folders.some(folder => (input.relocateFolder?.(folder) ?? folder) !== folder) ||
          inputs(beforeInputs, before, previous, input.beforeIdentity ?? input.identity) !== inputs(input.candidate, after, next, input.identity)) return false;
      if (!skippedIds.has(id)) skipped.push({ path: previous.pagePath, start: -1, error: error instanceof Error ? error.message : String(error) });
      skippedIds.add(id);
      return true;
    };
    // Cards that cannot be located refuse first: acceptance never stands in for a target.
    for (const item of drift) if (item.kind === "missing" && Object.hasOwn(after.collections, item.id) && !leaveBroken(item.id, item.reason!)) throw new Error(item.reason!);
    for (const id of accept) if (!drift.some((item) => item.id === id)) throw new Error(`The cards of collection “${id}” already match their page data.`);
    for (const item of drift) {
      // A collection the change removes from the sidecar keeps its cards as they are.
      if (!Object.hasOwn(after.collections, item.id) || skippedIds.has(item.id)) continue;
      if (item.kind === "missing") throw new Error(item.reason!);
      if (accept.has(item.id)) continue;
      const page = before.collections[item.id].pagePath;
      const error = new Error(item.kind === "edited"
        ? `The cards in ${page} were edited by hand and no longer match the page data, so this change would replace them. Select the collection and choose “Use manual cards” to keep them, or “Rebuild cards from page data” to replace them.`
        : `The cards in ${page} have not been built from page data yet. Select the collection and choose “Build cards from page data” first.`);
      if (!leaveBroken(item.id, error)) throw error;
    }
    const moves = input.moves ?? new Map<string, string>();
    const deletes = new Set(input.deletes ?? []);
    const relocate = input.relocateFolder ?? ((folder: string) => folder);
    const document: PageBuilderDocument = structuredClone(after);
    /**
     * Page metadata follows moved pages and leaves with deleted ones. This is
     * the single writer of that metadata for file moves and deletes (whole
     * entries: fields, sections, page parts and unknown data alike). It never
     * merges: a move whose destination already has its own metadata (left over
     * from a file that no longer exists) refuses before anything changes.
     * Creates, including duplicates, start without metadata or links.
     */
    const rekey = <T>(map: Record<string, T>) => {
      for (const [from, to] of moves) if (Object.hasOwn(map, from) && Object.hasOwn(map, to) && !moves.has(to))
        throw new Error(`${to} already has page data in ${EDITOR_PAGE_BUILDER_PATH}, left from an earlier page there, so moving ${from} onto it would replace that data. Move the page somewhere else, or remove the leftover entry for ${to} in Code first.`);
      for (const [from, to] of moves) if (Object.hasOwn(map, from)) { map[to] = map[from]; delete map[from]; }
      for (const path of deletes) delete map[path];
    };
    rekey(document.pages);
    if (input.rewriteLinks) rebaseSharedLinks(input, document, beforeText, afterText, moves, deletes, input.rewriteLinks);
    const pageEdits = new Map<string, { start: number; end: number; text: string; id: string }[]>();
    const previews: DocumentCollectionPreview[] = [];
    // Page paths and folders are updated first so each page's collections are located together.
    for (const [id, collection] of Object.entries(document.collections)) {
      collection.pagePath = moves.get(collection.pagePath) ?? collection.pagePath;
      if (deletes.has(collection.pagePath)) delete document.collections[id];
    }
    const located = new Map<string, ReturnType<typeof locatePageCollections>>();
    for (const [id, collection] of Object.entries(document.collections)) {
      if (skippedIds.has(id)) continue;
      try {
        collection.folders = collection.folders.map(relocate);
        rekey(collection.overrides);
        const source = input.candidate.sources[collection.pagePath];
        if (source === undefined) throw new Error(`Load ${collection.pagePath} before baking its collection.`);
        const inner = (located.get(collection.pagePath) ?? located.set(collection.pagePath, locatePageCollections(source, document, collection.pagePath)).get(collection.pagePath)!)[id];
        collection.target = inner.located.target;
        const all = collectionRecords({ ...input.candidate.sources }, { ...input.candidate.routes }, input.identity,
          { folder: collection.folders.join(" "), folders: collection.folders, sort: "", filter: "", limit: Number.MAX_SAFE_INTEGER }, collection.pagePath, collection.fields)
          .map((record) => {
            // Same page fields as legacy listings (JSON authoritative), then this recipe's own per-card overrides.
            const fields: PageFields = { ...resolvePageFields(record.fields, document.pages[record.path]), ...(collection.overrides[record.path] ?? {}) };
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
      } catch (error) {
        if (!leaveBroken(id, error)) throw error;
        document.collections[id] = structuredClone(after.collections[id]);
      }
    }
    const texts = new Map<string, string | undefined>();
    for (const [path, edits] of pageEdits) {
      if (skipped.some(item => item.path === path)) throw new Error(`The cards in ${path} could not be checked before this change, so no collection on that page was rewritten.`);
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
    return { texts, collections: previews, skipped, drifted: drift.filter((item): item is { id: string; kind: "edited" | "unbuilt" } => item.kind !== "missing") };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The collections could not be baked." };
  }
}

/**
 * Native section and page part links whose copy the origin's URL rewrite changed. Only a copy
 * that was pristine before (its exact bytes were its basis) and is now exactly the rewritten
 * basis is rebased; a customised copy, any other change to it, or a link the origin itself
 * changed (its kind, record, target or basis) stays as it is. Malformed recognised links, before
 * or in the candidate JSON, refuse the whole plan.
 */
function rebaseSharedLinks(input: DocumentBakeInput, document: PageBuilderDocument, beforeText: string | undefined, afterText: string | undefined,
  moves: ReadonlyMap<string, string>, deletes: ReadonlySet<string>, rewrite: (html: string) => string) {
  type Link = { kind: string; recordId: string; basis: string; target: Parameters<typeof locateCollectionTarget>[1] };
  const kinds: [string, Record<string, Record<string, Link>>, Record<string, Record<string, Link>>][] = [
    ["sections", readNativeSectionLinks(beforeText), readNativeSectionLinks(afterText)],
    ["pageParts", readPagePartLinks(beforeText), readPagePartLinks(afterText)],
  ];
  for (const [field, links, afterLinks] of kinds) for (const [from, entries] of Object.entries(links)) {
    if (deletes.has(from)) continue;
    const page = moves.get(from) ?? from;
    const old = input.before.sources[from], now = input.candidate.sources[page];
    if (old === undefined || now === undefined) continue;
    for (const [key, link] of Object.entries(entries)) {
      // Still the same recognised link in the candidate JSON (keyed as before the move).
      const same = Object.hasOwn(afterLinks, from) && Object.hasOwn(afterLinks[from], key) ? afterLinks[from][key] : undefined;
      if (!same || same.kind !== link.kind || same.recordId !== link.recordId || same.basis !== link.basis || !sameJson(same.target, link.target)) continue;
      const was = locateCollectionTarget(old, link.target);
      if ("error" in was || old.slice(was.element.start, was.element.end) !== link.basis) continue;
      const basis = rewrite(link.basis);
      if (basis === link.basis) continue;
      const group = document.pages[page]?.[field];
      const entry = group && typeof group === "object" && !Array.isArray(group) ? group[key] : undefined;
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || entry.basis !== link.basis) continue;
      const is = locateCollectionTarget(now, link.target);
      if ("error" in is || now.slice(is.element.start, is.element.end) !== basis) continue;
      entry.basis = basis;
    }
  }
}

/** Structural equality of JSON values; object key order does not matter. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => sameJson(item, b[index]));
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = Object.keys(a), right = Object.keys(b);
  return left.length === right.length && left.every((key) => Object.hasOwn(b, key) && sameJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/**
 * An image batch (rename, move, delete) rewrites references in page HTML,
 * including inside cards a JSON collection made. This carries that change
 * into the editor's JSON in the same batch: a collection whose cards matched
 * what the editor wrote records the rewritten cards as its output again, and
 * references to a moved image follow it: literal ones in the card template,
 * and stored values (per-card overrides, page fields), page-relative or not. Cards that were already edited by hand stay recorded as edited. Returns
 * the JSON text to write, or undefined when nothing in it changes.
 */
export function planDocumentMediaBatch(sources: Readonly<Record<string, string | undefined>>, sidecar: string | undefined, edits: ReadonlyMap<string, string>, moves: readonly { from: string; to: string }[], routes: Readonly<Record<string, string>> = {}): string | undefined {
  if (sidecar === undefined) return undefined;
  const document = readSidecar(sidecar);
  const renamed = new Map(moves.map(({ from, to }) => [from, to]));
  // Template references are rewritten one move at a time, so a chain (a to b, b to c) could move twice.
  if (moves.some(({ to }) => renamed.has(to))) throw new Error("These image moves overlap (one moves onto another that also moves). Move them one at a time.");
  /**
   * A stored value is one URL, as it will be written into a card on page `file`, resolved there exactly as
   * the page HTML rewriter resolves it. Only a repository image that moved changes, and it changes to what
   * that rewriter writes into the card itself (keeping ?query/#hash), so the next bake matches the cards.
   * External, own-site absolute and data URLs never change.
   */
  const follow = (value: string, file: string): string => {
    const path = mediaResolvePath(value, file), to = path === undefined ? undefined : renamed.get(path);
    return to === undefined ? value : mediaUrl(to) + (/[?#].*$/.exec(value.trim())?.[0] ?? "");
  };
  const next = structuredClone(document);
  for (const page of new Set(Object.values(document.collections).map((collection) => collection.pagePath))) {
    const before = sources[page], after = edits.get(page);
    if (before === undefined || after === undefined || after === before) continue;
    const old = locatePageCollections(before, document, page), now = locatePageCollections(after, document, page);
    for (const [id, item] of Object.entries(old))
      if (document.collections[id].outputFingerprint === item.text) next.collections[id].outputFingerprint = now[id].text;
  }
  for (const collection of Object.values(next.collections)) {
    // Literal image references in the card template (attributes, srcset, inline CSS url()) move with the same
    // matcher the page HTML uses, resolved against the collection's page; {bindings} are not image paths.
    for (const { from, to } of moves) collection.template = rewriteMediaReferences(collection.pagePath, collection.template, from, to);
    for (const fields of Object.values(collection.overrides)) for (const [name, value] of Object.entries(fields)) fields[name] = follow(value, collection.pagePath);
  }
  // A page's own field is written as-is into the cards of every collection that may list that page, so it is
  // resolved on each of those pages. It changes only when they all agree; otherwise the rename is refused.
  const routeOf = new Map(Object.entries(routes).map(([route, file]) => [file, route]));
  for (const [file, page] of Object.entries(next.pages)) {
    if (!page.fields) continue;
    const route = routeOf.get(file);
    const consumers = [...new Set(Object.values(document.collections).filter((collection) => route !== undefined && collection.pagePath !== file &&
      collection.folders.some((folder) => route.startsWith(folder) && route !== folder)).map((collection) => collection.pagePath))].sort();
    for (const [name, value] of Object.entries(page.fields)) {
      const results = new Set((consumers.length ? consumers : [file]).map((consumer) => follow(value, consumer)));
      if (results.size > 1)
        throw new Error(`The page field “${name}” of ${file} (${value}) points at different images on ${consumers.join(" and ")}, which list it, so the image was not renamed. Make the field a path from the site root first.`);
      page.fields[name] = [...results][0];
    }
  }
  const text = writePageBuilderDocument(next, sidecar);
  return text === sidecar ? undefined : text;
}
