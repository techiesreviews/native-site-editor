import { deriveNativeRoutes, nativePageRoute } from '../../shared/native-routes';
import { type FileMove } from '../native-page-moves';
import { attributeEdit } from './component-model';
import { applyCollectionEdits, planBake, type CollectionPreview } from './collection-bake';
import { collectionFolders, readCollections, validCollectionRoute } from './collection-model';
import type { CollectionIdentity } from './collection-fields';
import { bakePageData, planDocumentBake, readSidecar, type DocumentCollectionPreview } from './document-collections';
import { EDITOR_PAGE_BUILDER_PATH } from './page-builder-document';

/** Structurally compatible with the host's atomic NativeOperation. */
export interface NativeCollectionOrigin {
  /** Host routing intent only; does not authorize replacing customised cards. */
  refreshCollections?: true;
  expectedSources?: Map<string, string | undefined>;
  moves?: FileMove[];
  /** Explicit filesystem folder relocation intent; prefixes end in slash. */
  folders?: { from: string; to: string }[];
  deletes?: string[];
  creates?: { path: string; content: string }[];
  edits?: Map<string, string>;
  open?: string;
  done: string;
  undone: string;
  focus?: { file?: string; route?: string };
  /**
   * Listings whose current generated cards may be replaced or detached even
   * though they differ from what the template and page data produce. Each
   * entry names one existing listing by source path and element start; the
   * path must also be pinned in expectedSources. Not a blanket bypass.
   */
  acceptGeneratedDrift?: { path: string; start: number }[];
  /** Sidecar collection ids whose hand-edited or unbuilt cards this change may replace. */
  acceptCollections?: string[];
}
export interface NativeCollectionSnapshot {
  sources: Readonly<Record<string, string>>;
  routes: Readonly<Record<string, string>>;
  revision: string;
  files: readonly string[];
  identity: CollectionIdentity;
}
export interface NativeCollectionPlan {
  operation: NativeCollectionOrigin & { expectedSources: Map<string, string | undefined> };
  expectedRevision: string;
  expectedFiles: readonly string[];
  expectedIdentity: CollectionIdentity;
  expectedRoutes: Readonly<Record<string, string>>;
  afterRoutes: Readonly<Record<string, string>>;
  collections: CollectionPreview[];
  /** Sidecar collections as baked for the candidate graph. */
  documentCollections: DocumentCollectionPreview[];
}
const own = (sources: Readonly<Record<string, string>>, path: string) => Object.hasOwn(sources, path) ? sources[path] : undefined;
const sameRoutes = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([route, path]) => Object.hasOwn(b, route) && b[route] === path);

/** No writes or async work: call again immediately before the atomic host apply. */
export function nativeCollectionPlanIsCurrent(plan: NativeCollectionPlan, snapshot: NativeCollectionSnapshot): boolean {
  const files = [...new Set(snapshot.files)].sort();
  return snapshot.revision === plan.expectedRevision && snapshot.identity.name === plan.expectedIdentity.name &&
    files.length === plan.expectedFiles.length && files.every((path, index) => path === plan.expectedFiles[index]) &&
    sameRoutes(snapshot.routes, deriveNativeRoutes(files)) && sameRoutes(plan.expectedRoutes, snapshot.routes) &&
    [...plan.operation.expectedSources].every(([path, expected]) => own(snapshot.sources, path) === expected);
}

/**
 * Fails closed when an existing listing's cards were edited by hand: a later
 * bake would silently replace that text. Only the before graph is compared,
 * so legitimate metadata changes still rebuild clean listings. Listings whose
 * recipe cannot be baked are left to the bake's own error.
 */
function assertGeneratedCardsCurrent(sources: Readonly<Record<string, string>>, routes: Readonly<Record<string, string>>, identity: CollectionIdentity, origin: NativeCollectionOrigin, files: readonly string[]): GeneratedDrift[] {
  const accepted = origin.acceptGeneratedDrift ?? [];
  for (const entry of accepted) {
    if (!origin.expectedSources?.has(entry.path) || origin.expectedSources.get(entry.path) !== own(sources, entry.path))
      throw Error(`Pin ${entry.path} before replacing its cards.`);
  }
  const all = generatedDrift(sources, routes, identity, files);
  const isAccepted = (item: { path: string; start: number }) => accepted.some(entry => entry.path === item.path && entry.start === item.start);
  for (const entry of accepted) {
    if (!all.some(item => item.path === entry.path && item.start === entry.start))
      throw Error(`The cards in ${entry.path} already match their page data.`);
  }
  const blocked = all.filter(item => item.kind !== 'unchecked' && !isAccepted(item));
  const edited = [...new Set(blocked.filter(item => item.kind === 'edited').map(item => item.path))];
  const moved = [...new Set(blocked.filter(item => item.kind === 'edited' && item.pageData).map(item => item.path))];
  if (moved.length) throw Error(movedPageDataMessage(moved));
  if (edited.length) throw Error(`The cards in ${edited.join(", ")} were edited by hand and no longer match the page data, so this change would replace them. Select the collection and choose “Use manual cards” to keep them, or “Rebuild cards from page data” to replace them.`);
  const unbuilt = [...new Set(blocked.map(item => item.path))];
  if (unbuilt.length) throw Error(`The cards in ${unbuilt.join(", ")} have not been built from page data yet. Select the collection and choose “Build cards from page data” first.`);
  // Listings that cannot be baked as they are: checked again after the bake.
  return all.filter(item => item.kind === 'unchecked' && !isAccepted(item));
}

/** Cards built from page HTML whose values now come from the editor's data. */
export function movedPageDataMessage(paths: readonly string[]): string {
  return `The cards in ${paths.join(", ")} still show page values from before they moved to the editor's data, and some of those values differ now. Select the collection and choose “Rebuild cards from page data” to show the editor's values, or “Use manual cards” to keep the cards as they are.`;
}
export interface GeneratedDrift {
  path: string;
  start: number;
  /** edited: cards differ by hand; unbuilt: no cards yet; unchecked: this listing's recipe cannot be baked as it is. */
  kind: 'edited' | 'unbuilt' | 'unchecked';
  /** Edited only because page data in the editor's JSON differs: the cards still match the page HTML alone. */
  pageData?: true;
}
/**
 * Legacy inline listings (recipe still in the page HTML). When the whole graph
 * bakes, each listing is compared exactly. When it does not, every page that
 * holds a listing (readable or not) is "unchecked": any bake that would then
 * change that page is refused after the fact, page by page.
 */
/** `files`: every path in the graph, read or not, so an unread editor JSON is never taken as absent. */
export function generatedDrift(sources: Readonly<Record<string, string>>, routes: Readonly<Record<string, string>>, identity: CollectionIdentity, files?: readonly string[]): GeneratedDrift[] {
  const listingPages = [...new Set(Object.entries(routes).filter(([url, path]) => validCollectionRoute(url, path)).map(([, path]) => path))]
    .filter(path => sources[path] !== undefined && /data-each/i.test(sources[path]));
  if (!listingPages.length) return [];
  let baked: ReturnType<typeof planBake>;
  try { baked = planBake({ ...sources }, { ...routes }, { name: identity.name }, bakePageData(sources, files)); } catch (error) { baked = { error: String(error) }; }
  const drift: GeneratedDrift[] = [];
  let htmlOnly: ReturnType<typeof planBake> | undefined;
  for (const path of listingPages) {
    const source = sources[path];
    let collections: ReturnType<typeof readCollections> | undefined;
    try { collections = readCollections(source); } catch { collections = undefined; }
    if (!collections) { drift.push({ path, start: -1, kind: 'unchecked' }); continue; }
    for (const collection of collections) {
      if ('error' in baked) { drift.push({ path, start: collection.element.start, kind: 'unchecked' }); continue; }
      if (!(baked.edits[path] ?? []).some(edit => edit.start === collection.element.tag.end)) continue;
      const region = source.slice(collection.template.end, collection.element.close!.start);
      if (!region.trim()) { drift.push({ path, start: collection.element.start, kind: 'unbuilt' }); continue; }
      htmlOnly ??= planBake({ ...sources }, { ...routes }, { name: identity.name });
      const pageData = !('error' in htmlOnly) && !(htmlOnly.edits[path] ?? []).some(edit => edit.start === collection.element.tag.end);
      drift.push({ path, start: collection.element.start, kind: 'edited', ...(pageData ? { pageData: true as const } : {}) });
    }
  }
  return drift;
}

/** Apply the origin to a candidate graph, bake once, and return one operation. */
export function planNativeCollectionOperation(input: NativeCollectionSnapshot & {
  origin: NativeCollectionOrigin;
  /** Identity read by the host from the post-origin candidate; defaults to before identity. */
  candidateIdentity?: CollectionIdentity;
}): NativeCollectionPlan | { error: string } {
  try {
    const { sources, routes, revision, identity, origin } = input;
    const candidateIdentity = { name: (input.candidateIdentity ?? identity).name };
    const files = new Set(input.files);
    if (Object.keys(sources).some(path => !files.has(path))) throw Error("Loaded source is absent from the file graph.");
    if (!sameRoutes(routes, deriveNativeRoutes(files))) throw Error('Load the complete current route graph before planning collections.');
    // The editor's page data file is a planning input: loaded, and pinned by its bytes or absence.
    if (files.has(EDITOR_PAGE_BUILDER_PATH) && own(sources, EDITOR_PAGE_BUILDER_PATH) === undefined) throw Error(`Load ${EDITOR_PAGE_BUILDER_PATH} before planning collections.`);
    const before = new Map(Object.entries(sources));
    const candidate = new Map(before);
    const afterFiles = new Set(files);
    const expected = new Map<string, string | undefined>();
    const guard = (path: string) => expected.set(path, own(sources, path));
    for (const [path, value] of origin.expectedSources ?? []) {
      if (own(sources, path) !== value) throw Error(`Source changed: ${path}.`);
      expected.set(path, value);
    }
    const unchecked = assertGeneratedCardsCurrent(sources, routes, identity, origin, input.files);
    const moves = (origin.moves ?? []).map(move => ({ ...move }));
    const deletes = [...(origin.deletes ?? [])];
    const creates = (origin.creates ?? []).map(create => ({ ...create }));
    const edits = new Map(origin.edits ?? []);
    const used = new Set<string>();
    const claim = (path: string) => {
      if (!path || used.has(path)) throw Error(`Conflicting origin target: ${path}.`);
      used.add(path); guard(path);
    };
    for (const move of moves) {
      claim(move.from); claim(move.to);
      if (!files.has(move.from) || files.has(move.to)) throw Error(`Cannot move ${move.from} to ${move.to}.`);
      candidate.delete(move.from);
      if (before.has(move.from)) candidate.set(move.to, before.get(move.from)!);
      afterFiles.delete(move.from); afterFiles.add(move.to);
    }
    for (const path of deletes) {
      claim(path);
      if (!files.has(path)) throw Error(`Cannot delete missing file: ${path}.`);
      candidate.delete(path); afterFiles.delete(path);
    }
    for (const create of creates) {
      claim(create.path);
      if (files.has(create.path)) throw Error(`Source already exists: ${create.path}.`);
      candidate.set(create.path, create.content); afterFiles.add(create.path);
    }
    for (const [path, text] of edits) {
      guard(path);
      if (used.has(path) && !afterFiles.has(path)) throw Error(`Cannot edit removed source: ${path}.`);
      if (afterFiles.has(path) && !candidate.has(path)) throw Error(`Load ${path} before editing it.`);
      afterFiles.add(path);
      candidate.set(path, text);
    }
    const afterRoutes = deriveNativeRoutes(afterFiles);
    for (const path of new Set([...Object.values(routes), ...Object.values(afterRoutes)])) guard(path);
    guard(EDITOR_PAGE_BUILDER_PATH);
    const movedFiles = new Map(moves.map(move => [move.from, move.to]));
    const folders = (origin.folders ?? []).map(folder => ({ ...folder }));
    const folderPrefix = (path: string) => path.endsWith("/") && !/[\\\x00-\x1f\x7f]/.test(path) &&
      path.slice(0, -1).split("/").every(segment => segment.length > 0 && segment !== "." && segment !== "..");
    for (const [index, folder] of folders.entries()) {
      if (!folderPrefix(folder.from) || !folderPrefix(folder.to) ||
          folder.to.startsWith(folder.from) || folder.from.startsWith(folder.to)) throw Error('Invalid folder relocation intent.');
      if (folders.slice(0, index).some(other => [other.from, other.to].some(prefix =>
        [folder.from, folder.to].some(value => value.startsWith(prefix) || prefix.startsWith(value))))) throw Error('Overlapping folder relocation intents.');
      const members = [...files].filter(path => path.startsWith(folder.from));
      if (!members.length) throw Error(`Source folder has no files: ${folder.from}.`);
      if (files.has(folder.to.slice(0, -1)) || [...files].some(path => path.startsWith(folder.to))) throw Error(`Folder destination must be vacant: ${folder.to}.`);
      for (const path of members) {
        if (movedFiles.get(path) !== folder.to + path.slice(folder.from.length)) throw Error(`Incomplete folder relocation: ${path}.`);
      }
    }
    const relocatedFolder = (folder: string) => {
      const intent = folders.find(intent => folder.startsWith(`/${intent.from}`));
      if (!intent) return folder;
      const destination = `/${intent.to}${folder.slice(intent.from.length + 1)}`;
      try { collectionFolders({ folders: [destination] }); }
      catch { throw Error(`Cannot relocate collection source ${folder} to ${destination}: collection URLs require folder segments starting with an ASCII letter or digit and containing only ASCII letters, digits, _, . or -.`); }
      return destination;
    };
    // Rewrite exact parsed collection scope tokens with the existing route mover.
    // No href/metadata rewriting is invented here: those belong to the origin.
    for (const [url, path] of Object.entries(afterRoutes)) {
      if (!validCollectionRoute(url, path)) continue;
      const loaded = candidate.get(path);
      if (loaded === undefined) throw Error(`Load ${path} before baking collections.`);
      let source: string = loaded;
      let parsed: ReturnType<typeof readCollections>;
      try { parsed = readCollections(source); } catch (error) { throw Error(`${path}: ${error instanceof Error ? error.message : "Invalid listing."}`); }
      const changes = parsed.flatMap(collection => {
        const folders = collection.spec.folders.map(relocatedFolder);
        return folders.some((folder, index) => folder !== collection.spec.folders[index])
          ? [attributeEdit(source, collection.element.tag, 'data-each', folders.join(' '))] : [];
      });
      source = applyCollectionEdits(source, changes);
      candidate.set(path, source);
    }
    const candidateSources = Object.fromEntries(candidate);
    const baked = planBake(candidateSources, afterRoutes, candidateIdentity, bakePageData(candidateSources, [...afterFiles]));
    if ('error' in baked) {
      const listings = Object.entries(afterRoutes).filter(([url, path]) => validCollectionRoute(url, path) && readCollections(candidateSources[path]).length).map(([, path]) => path);
      return { error: `${listings.length ? `Collection listings (${listings.join(", ")})` : "Collection route inputs"}: ${baked.error}` };
    }
    for (const [path, ranges] of Object.entries(baked.edits)) candidate.set(path, applyCollectionEdits(candidate.get(path)!, ranges));
    // A page whose listings could not be checked before must not be rebaked now.
    for (const path of new Set(unchecked.map(item => item.path))) {
      const target = moves.find(move => move.from === path)?.to ?? path;
      if ((baked.edits[target] ?? []).length)
        throw Error(`The cards in ${path} could not be checked against page data before this change, and it would replace them. Select the collection and choose “Use manual cards” to keep them, or fix the collection in Code first.`);
    }
    // Accepting replacement is scoped: the sidecar and each accepted listing page must be pinned at their current bytes.
    if (origin.acceptCollections?.length) {
      const pinned = (path: string) => origin.expectedSources?.has(path) && origin.expectedSources.get(path) === own(sources, path);
      if (!pinned(EDITOR_PAGE_BUILDER_PATH)) throw Error(`Pin ${EDITOR_PAGE_BUILDER_PATH} before replacing cards.`);
      const stored = readSidecar(own(sources, EDITOR_PAGE_BUILDER_PATH));
      for (const id of origin.acceptCollections) {
        const page = stored.collections[id]?.pagePath;
        if (!page || !pinned(page)) throw Error(`Pin the page of collection “${id}” before replacing its cards.`);
      }
    }
    // Sidecar collections: recipes only in JSON, finished cards only in HTML.
    const document = planDocumentBake({
      identity: candidateIdentity,
      before: { sources, routes },
      candidate: { sources: Object.fromEntries(candidate), routes: afterRoutes },
      moves: new Map(moves.map(move => [move.from, move.to])),
      deletes,
      relocateFolder: relocatedFolder,
      accept: origin.acceptCollections,
    });
    if ('error' in document) return { error: document.error };
    for (const [path, text] of document.texts) {
      if (text === undefined) {
        candidate.delete(path);
        if (files.has(path) && !deletes.includes(path)) deletes.push(path);
        continue;
      }
      candidate.set(path, text);
      if (!files.has(path) && !creates.some(create => create.path === path)) creates.push({ path, content: text });
    }
    const finalEdits = new Map<string, string>();
    const createdPaths = new Set(creates.map(create => create.path));
    const oldFor = new Map(moves.map(move => [move.to, move.from]));
    for (const [path, text] of candidate) {
      if (createdPaths.has(path)) continue;
      if (text !== before.get(oldFor.get(path) ?? path)) finalEdits.set(path, text);
    }
    const { refreshCollections: _refresh, folders: _folderIntent, acceptGeneratedDrift: _drift, acceptCollections: _accept, ...nativeOrigin } = origin;
    const operation = { ...nativeOrigin, moves, deletes, creates: creates.map(create => ({ ...create, content: candidate.get(create.path)! })), edits: finalEdits, expectedSources: expected,
      ...(origin.focus ? { focus: { ...origin.focus } } : {}) };
    return { operation, expectedRevision: revision, expectedFiles: [...files].sort(), expectedIdentity: { name: identity.name }, expectedRoutes: { ...routes }, afterRoutes, collections: baked.collections, documentCollections: document.collections };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Collection operation could not be planned.' };
  }
}
