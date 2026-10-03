import { deriveNativeRoutes, nativePageRoute } from '../../shared/native-routes';
import { type FileMove } from '../native-page-moves';
import { attributeEdit } from './component-model';
import { applyCollectionEdits, planBake, type CollectionPreview } from './collection-bake';
import { collectionFolders, readCollections, validCollectionRoute } from './collection-model';
import type { CollectionIdentity } from './collection-fields';

/** Structurally compatible with the host's atomic NativeOperation. */
export interface NativeCollectionOrigin {
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
    const before = new Map(Object.entries(sources));
    const candidate = new Map(before);
    const afterFiles = new Set(files);
    const expected = new Map<string, string | undefined>();
    const guard = (path: string) => expected.set(path, own(sources, path));
    for (const [path, value] of origin.expectedSources ?? []) {
      if (own(sources, path) !== value) throw Error(`Source changed: ${path}.`);
      expected.set(path, value);
    }
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
    const baked = planBake(candidateSources, afterRoutes, candidateIdentity);
    if ('error' in baked) {
      const listings = Object.entries(afterRoutes).filter(([url, path]) => validCollectionRoute(url, path) && readCollections(candidateSources[path]).length).map(([, path]) => path);
      return { error: `${listings.length ? `Collection listings (${listings.join(", ")})` : "Collection route inputs"}: ${baked.error}` };
    }
    for (const [path, ranges] of Object.entries(baked.edits)) candidate.set(path, applyCollectionEdits(candidate.get(path)!, ranges));
    const finalEdits = new Map<string, string>();
    const createdPaths = new Set(creates.map(create => create.path));
    const oldFor = new Map(moves.map(move => [move.to, move.from]));
    for (const [path, text] of candidate) {
      if (createdPaths.has(path)) continue;
      if (text !== before.get(oldFor.get(path) ?? path)) finalEdits.set(path, text);
    }
    const { folders: _folderIntent, ...nativeOrigin } = origin;
    const operation = { ...nativeOrigin, moves, deletes, creates: creates.map(create => ({ ...create, content: candidate.get(create.path)! })), edits: finalEdits, expectedSources: expected,
      ...(origin.focus ? { focus: { ...origin.focus } } : {}) };
    return { operation, expectedRevision: revision, expectedFiles: [...files].sort(), expectedIdentity: { name: identity.name }, expectedRoutes: { ...routes }, afterRoutes, collections: baked.collections };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Collection operation could not be planned.' };
  }
}
