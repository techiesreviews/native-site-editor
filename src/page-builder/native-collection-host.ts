import { deriveNativeRoutes, nativePageRoute } from '../../shared/native-routes';
import { groupRouteChanges, isRouteWithin, type FileMove } from '../native-page-moves';
import { attributeEdit } from './component-model';
import { applyCollectionEdits, planBake, type CollectionPreview } from './collection-bake';
import { readCollections, validCollectionRoute } from './collection-model';
import type { CollectionIdentity } from './collection-fields';

/** Structurally compatible with the host's atomic NativeOperation. */
export interface NativeCollectionOrigin {
  expectedSources?: Map<string, string | undefined>;
  moves?: FileMove[];
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
}
export interface NativeCollectionPlan {
  operation: NativeCollectionOrigin & { expectedSources: Map<string, string | undefined> };
  expectedRevision: string;
  expectedRoutes: Readonly<Record<string, string>>;
  afterRoutes: Readonly<Record<string, string>>;
  collections: CollectionPreview[];
}
const own = (sources: Readonly<Record<string, string>>, path: string) => Object.hasOwn(sources, path) ? sources[path] : undefined;
const sameRoutes = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([route, path]) => Object.hasOwn(b, route) && b[route] === path);

/** No writes or async work: call again immediately before the atomic host apply. */
export function nativeCollectionPlanIsCurrent(plan: NativeCollectionPlan, snapshot: NativeCollectionSnapshot): boolean {
  return snapshot.revision === plan.expectedRevision && sameRoutes(plan.expectedRoutes, snapshot.routes) &&
    [...plan.operation.expectedSources].every(([path, expected]) => own(snapshot.sources, path) === expected);
}

/** Apply the origin to a candidate graph, bake once, and return one operation. */
export function planNativeCollectionOperation(input: NativeCollectionSnapshot & {
  identity: CollectionIdentity;
  origin: NativeCollectionOrigin;
}): NativeCollectionPlan | { error: string } {
  try {
    const { sources, routes, revision, identity, origin } = input;
    if (!sameRoutes(routes, deriveNativeRoutes(Object.keys(sources)))) throw Error('Load the complete current route graph before planning collections.');
    const before = new Map(Object.entries(sources));
    const candidate = new Map(before);
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
      if (!before.has(move.from) || before.has(move.to)) throw Error(`Cannot move ${move.from} to ${move.to}.`);
      candidate.delete(move.from); candidate.set(move.to, before.get(move.from)!);
    }
    for (const path of deletes) {
      claim(path);
      if (!before.has(path)) throw Error(`Cannot delete missing source: ${path}.`);
      candidate.delete(path);
    }
    for (const create of creates) {
      claim(create.path);
      if (before.has(create.path)) throw Error(`Source already exists: ${create.path}.`);
      candidate.set(create.path, create.content);
    }
    for (const [path, text] of edits) {
      guard(path);
      if (!candidate.has(path)) throw Error(`Cannot edit missing source: ${path}.`);
      candidate.set(path, text);
    }
    const afterRoutes = deriveNativeRoutes(candidate.keys());
    for (const path of new Set([...Object.values(routes), ...Object.values(afterRoutes)])) guard(path);
    const routeChanges = groupRouteChanges(Object.keys(routes), moves.flatMap(move => {
      const from = nativePageRoute(move.from), to = nativePageRoute(move.to);
      return from && to ? [[from, to] as [string, string]] : [];
    }));
    // Rewrite exact parsed collection scope tokens with the existing route mover.
    // No href/metadata rewriting is invented here: those belong to the origin.
    for (const [url, path] of Object.entries(afterRoutes)) {
      if (!validCollectionRoute(url, path)) continue;
      let source = candidate.get(path)!;
      const changes = readCollections(source).flatMap(collection => {
        const folders = collection.spec.folders.map(folder => {
          const change = routeChanges.find(change => folder === change.from || (change.subtree && isRouteWithin(folder, change.from)));
          return change ? change.to + folder.slice(change.from.length) : folder;
        });
        return folders.some((folder, index) => folder !== collection.spec.folders[index])
          ? [attributeEdit(source, collection.element.tag, 'data-each', folders.join(' '))] : [];
      });
      source = applyCollectionEdits(source, changes);
      candidate.set(path, source);
    }
    const candidateSources = Object.fromEntries(candidate);
    const baked = planBake(candidateSources, afterRoutes, identity);
    if ('error' in baked) return baked;
    for (const [path, ranges] of Object.entries(baked.edits)) candidate.set(path, applyCollectionEdits(candidate.get(path)!, ranges));
    const finalEdits = new Map<string, string>();
    const createdPaths = new Set(creates.map(create => create.path));
    const oldFor = new Map(moves.map(move => [move.to, move.from]));
    for (const [path, text] of candidate) {
      if (createdPaths.has(path)) continue;
      if (text !== before.get(oldFor.get(path) ?? path)) finalEdits.set(path, text);
    }
    const operation = { ...origin, moves, deletes, creates: creates.map(create => ({ ...create, content: candidate.get(create.path)! })), edits: finalEdits, expectedSources: expected,
      ...(origin.focus ? { focus: { ...origin.focus } } : {}) };
    return { operation, expectedRevision: revision, expectedRoutes: { ...routes }, afterRoutes, collections: baked.collections };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Collection operation could not be planned.' };
  }
}
