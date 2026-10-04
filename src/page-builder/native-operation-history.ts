import type { DraftScope, SavedDraft } from "../drafts";
import type { DraftAccess } from "../file-changes";

interface Proof { isCurrent(): boolean }
interface Sources extends Proof { dispose?(): void; apply(): boolean; undo(): boolean; redo(): boolean }
export interface NativeTextHistoryHost {
  persistentModels?: boolean;
  retainModel?(path: string): () => void;
  scope: DraftScope;
  store: DraftAccess & { error: string | null };
  isLive(): boolean;
  source(path: string): string | undefined;
  mounted(path: string): boolean;
  modelState(path: string): Proof;
  evictModel(path: string, proof: Proof): Proof | undefined;
  prepareSources(edits: { path: string; expectedSource: string; text: string }[]): Sources | undefined;
}
export interface NativeTextHistoryPlan {
  retainPaths?: readonly string[];
  before: Map<string, SavedDraft | undefined>;
  after: Map<string, SavedDraft | undefined>;
  beforeSources: Map<string, string | undefined>;
  afterSources: Map<string, string | undefined>;
}
/** A synchronous, source-checked draft transaction; UI refresh and history registration belong to the host. */
export function prepareNativeTextHistory(host: NativeTextHistoryHost, plan: NativeTextHistoryPlan) {
  const scope = { ...host.scope };
  const paths = [...new Set([...plan.beforeSources.keys(), ...plan.afterSources.keys(), ...plan.before.keys(), ...plan.after.keys()])];
  const proofs = new Map(paths.map(path => [path, host.modelState(path)]));
  const mounted = new Map(paths.map(path => [path, host.mounted(path)]));
  const edited = paths.filter(path => plan.beforeSources.get(path) !== plan.afterSources.get(path));
  const retained = new Set(plan.retainPaths ?? []);
  const modelEdits = paths.filter(path => mounted.get(path) && (edited.includes(path) || retained.has(path))).map(path => ({ path, expectedSource: plan.beforeSources.get(path), text: plan.afterSources.get(path) ?? (retained.has(path) ? plan.beforeSources.get(path) : undefined) }));
  if (modelEdits.some(edit => edit.expectedSource === undefined || edit.text === undefined)) return;
  const preparedSources = host.prepareSources(modelEdits as { path: string; expectedSource: string; text: string }[]);
  if (!preparedSources) return;
  const sources: Sources = preparedSources;
  const leases = host.persistentModels ? paths.map(path => host.retainModel?.(path)).filter((dispose): dispose is () => void => !!dispose) : [];
  let lastError: string | undefined;
  let state: "prepared" | "applied" | "undone" | "failed" = "prepared";
  const recordsCurrent = (records: Map<string, SavedDraft | undefined>) => [...records].every(([path, record]) => host.store.get(scope, path) === record);
  const modelsCurrent = () => [...proofs].every(([path, proof]) => proof.isCurrent() && (host.persistentModels || host.mounted(path) === mounted.get(path)));
  const sourceCurrent = (expected: Map<string, string | undefined>) => [...expected].every(([path, text]) => host.source(path) === text);
  const current = (after: boolean) => host.isLive() && recordsCurrent(after ? plan.after : plan.before) && modelsCurrent() && sources.isCurrent() && sourceCurrent(after ? plan.afterSources : plan.beforeSources);
  const save = (path: string, record: SavedDraft | undefined) => record ? host.store.save(record) : host.store.remove(scope, path);
  function sameFields(expected: SavedDraft | undefined, actual: SavedDraft | undefined) {
    if (!expected || !actual) return expected === actual;
    const fields = Object.keys(expected).filter(key => key !== "updatedAt") as (keyof SavedDraft)[];
    return fields.length === Object.keys(actual).filter(key => key !== "updatedAt").length && fields.every(key => {
      const before = expected[key], after = actual[key];
      return before === after || typeof before === "object" && typeof after === "object" && JSON.stringify(before) === JSON.stringify(after);
    });
  }
  function reanchorMountedRecords(records: Map<string, SavedDraft | undefined>, texts: Map<string, string | undefined>) {
    if (!host.isLive() || !modelsCurrent() || !sources.isCurrent() || !sourceCurrent(texts)) return;
    for (const edit of modelEdits) {
      const expected = records.get(edit.path), actual = host.store.get(scope, edit.path);
      // A preceding, proven Monaco Undo/Redo may persist an identical existing
      // file again. New files and every unmounted record retain exact identity.
      if (!expected || expected.baseSha === null || !actual || expected === actual) continue;
      if (sameFields(expected, actual)) records.set(edit.path, actual);
    }
  }
  function transition(direction: "apply" | "undo" | "redo") {
    const after = direction !== "undo";
    if (state === "applied") reanchorMountedRecords(plan.after, plan.afterSources);
    else if (state === "undone") reanchorMountedRecords(plan.before, plan.beforeSources);
    if (state !== (direction === "apply" ? "prepared" : after ? "undone" : "applied") || !current(!after)) {
      const records = after ? plan.before : plan.after, texts = after ? plan.beforeSources : plan.afterSources;
      const changedDraft = [...records].find(([path, record]) => host.store.get(scope, path) !== record);
      const changedModel = [...proofs].find(([path, proof]) => !proof.isCurrent() || !host.persistentModels && host.mounted(path) !== mounted.get(path));
      const changedSource = [...texts].find(([path, text]) => host.source(path) !== text);
      lastError = !host.isLive() ? "The repository changed." : changedDraft ? `The draft for ${changedDraft[0]} changed.` : changedModel ? `The editor model for ${changedModel[0]} changed.` : changedSource ? `The source for ${changedSource[0]} changed.` : "The owned source history step changed.";
      return false;
    }
    lastError = undefined;
    // An unmounted cache is evicted only with its exact proof. Unrelated models
    // retain their original proof through every own source transition.
    for (const path of edited) if (!mounted.get(path)) {
      const proof = host.evictModel(path, proofs.get(path)!);
      if (!proof) return false;
      proofs.set(path, proof);
    }
    if (!sources[direction]()) return false;
    for (const edit of modelEdits) proofs.set(edit.path, host.modelState(edit.path));
    const expected = new Map(after ? plan.before : plan.after), desired = after ? plan.after : plan.before;
    const written = new Map<string, SavedDraft | undefined>();
    const foreign = new Map<string, SavedDraft | undefined>();
    try {
      // Advance only exact owned persistence, including its base and flags.
      // A synchronous listener's same-text replacement is still another draft.
      for (const edit of modelEdits) {
        const record = host.store.get(scope, edit.path);
        if (record !== expected.get(edit.path) && !sameFields(desired.get(edit.path), record)) {
          foreign.set(edit.path, record);
          throw new Error(`The draft for ${edit.path} changed during its source edit.`);
        }
        expected.set(edit.path, record);
      }
      if (!host.isLive() || !recordsCurrent(expected) || !modelsCurrent() || !sources.isCurrent()) throw new Error("The operation source changed.");
      for (const [path, record] of desired) {
        if (!host.isLive() || !modelsCurrent() || host.store.get(scope, path) !== expected.get(path)) throw new Error("The operation changed during its draft write.");
        let saved = false;
        try { saved = save(path, record); }
        finally { written.set(path, record); }
        if (!saved) throw new Error(host.store.error ?? `Could not update ${path}.`);
      }
      if (!host.isLive() || !recordsCurrent(desired) || !modelsCurrent() || !sourceCurrent(after ? plan.afterSources : plan.beforeSources)) throw new Error("The operation changed during its draft write.");
      state = after ? "applied" : "undone";
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "The draft operation failed.";
      // Never overwrite a draft or model changed by a synchronous listener.
      for (const edit of modelEdits) {
        const record = host.store.get(scope, edit.path);
        if (record !== expected.get(edit.path) && record !== written.get(edit.path)) foreign.set(edit.path, record);
      }
      const reverse = after ? "undo" : "redo";
      const restored = sources.isCurrent() && sources[reverse]();
      const original = after ? plan.before : plan.after;
      if (restored) for (const edit of modelEdits) {
        proofs.set(edit.path, host.modelState(edit.path));
        const record = host.store.get(scope, edit.path);
        if (sameFields(original.get(edit.path), record)) written.set(edit.path, record);
      }
      for (const [path, record] of written) if (host.store.get(scope, path) === record && (!modelEdits.some(edit => edit.path === path) || restored)) save(path, foreign.has(path) ? foreign.get(path) : original.get(path));
      if (!current(!after)) state = "failed";
      return false;
    }
  }
  function beginOwnUITransition(changing: readonly string[]) {
    if (!current(state === "applied") || state === "prepared" || state === "failed") {
      const records = state === "applied" ? plan.after : plan.before, texts = state === "applied" ? plan.afterSources : plan.beforeSources;
      const draft = [...records].find(([path, record]) => host.store.get(scope, path) !== record);
      const source = [...texts].find(([path, text]) => host.source(path) !== text);
      const model = [...proofs].find(([, proof]) => !proof.isCurrent());
      lastError = !host.isLive() ? "The repository changed before opening the page." : draft ? `The draft for ${draft[0]} changed before opening the page.` : source ? `The source for ${source[0]} changed before opening the page.` : model ? `The model for ${model[0]} changed before opening the page.` : "The owned source step changed before opening the page.";
      return;
    }
    const unsupported = changing.find(path => proofs.has(path) && !edited.includes(path) && !retained.has(path));
    if (unsupported) { lastError = `The editor for ${unsupported} is not part of this owned source transition.`; return; }
    const phase = state, changed = new Set(changing);
    const records = phase === "applied" ? plan.after : plan.before;
    const texts = phase === "applied" ? plan.afterSources : plan.beforeSources;
    return (owned: ReadonlyMap<string, Proof>) => {
      const draft = [...records].find(([path, record]) => host.store.get(scope, path) !== record);
      const source = [...texts].find(([path, text]) => host.source(path) !== text);
      // Besides the declared paths, a model the host proved at its own mount boundary during
      // this transition (`owned`) is the host's: it must still be current, like a declared one.
      const mountedOwn = [...owned.keys()].filter(path => !changed.has(path) && proofs.has(path));
      const unrelated = [...proofs].find(([path, proof]) => !changed.has(path) && !mountedOwn.includes(path) && !proof.isCurrent());
      const own = [...changed, ...mountedOwn].find(path => proofs.has(path) && !owned.get(path)?.isCurrent());
      if (state !== phase || !host.isLive() || draft || source || !sources.isCurrent() || unrelated || own) {
        lastError = !host.isLive() ? "The repository changed while opening the page." : draft ? `The draft for ${draft[0]} changed while opening the page.` : source ? `The source for ${source[0]} changed while opening the page.` : unrelated ? `The editor for ${unrelated[0]} changed while opening the page.` : own ? `The new editor for ${own} changed while opening the page.` : "The owned source step changed while opening the page.";
        return false;
      }
      // Proofs are captured synchronously at our mount/eviction boundary, never
      // read afresh after an await. Unrelated model proofs stay untouched.
      for (const path of [...changed, ...mountedOwn]) if (proofs.has(path)) {
        proofs.set(path, owned.get(path)!);
        if (host.mounted(path)) mounted.set(path, true);
      }
      return current(phase === "applied");
    };
  }
  /**
   * The host mounted `path` itself, outside a transition (a stylesheet pane following the selection),
   * over exactly this step's bytes: the draft record, stored source and mounted model text all still
   * match the current phase. Only then is the proof taken synchronously at that mount adopted;
   * any other change keeps the old proof, so Undo and Redo still refuse.
   */
  function adoptOwnMount(path: string, proof: Proof, modelText: string | undefined) {
    if (state !== "applied" && state !== "undone" || !proofs.has(path) || !host.isLive()) return false;
    const records = state === "applied" ? plan.after : plan.before, texts = state === "applied" ? plan.afterSources : plan.beforeSources;
    if (!texts.has(path) || texts.get(path) === undefined || modelText !== texts.get(path) || host.source(path) !== texts.get(path)) return false;
    if (records.has(path) && host.store.get(scope, path) !== records.get(path)) return false;
    if (!host.mounted(path) || !proof.isCurrent()) return false;
    proofs.set(path, proof); mounted.set(path, true);
    return true;
  }
  return { beginOwnUITransition, adoptOwnMount, dispose: () => { state = "failed"; sources.dispose?.(); for (const dispose of leases) dispose(); }, error: () => lastError, apply: () => transition("apply"), undo: () => transition("undo"), redo: () => transition("redo"), isCurrent: () => state !== "failed" && current(state === "applied") };
}
