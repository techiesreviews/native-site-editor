// Undo on its own page (ticket 34, invisible multiplayer): a step written where it was not shown (a
// guarded edit that finished on another page or in another workspace, src/guarded-edit/commit.ts;
// a pinned Media batch written elsewhere, src/media-batch.ts) has no Undo step on the page shown.
// It is parked here for its own page instead, and that page's history takes it as its newest step
// the next time the page opens in its own workspace (or at once, when it is open there as it lands).
// Never on the page shown: only the page the step belongs to adopts it.
//
// A parked step keeps the drafts on each side of it, not a receipt: its Undo is planned when it
// runs, over the editor as it is then (the page's mounted model among it). It runs only while every
// draft it wrote is still as it left it (the same fields; a save, a later edit or another tab's
// write since refuses it), and writes the other side back through one draft receipt
// (prepareNativeTextHistory), so a mounted model follows; Redo is the same the other way. The page
// shown afterwards: the step's own page, or where it came from once Undo takes that page away (a
// page moved back, a created page gone).
//
// Nothing is stored: a reload forgets parked steps, as it forgets every Undo step.
import { draftKey, type DraftScope, type SavedDraft } from "../drafts";
import { prepareNativeTextHistory } from "../page-builder/native-operation-history";
import type { EditorWorkspace } from "../guarded-edit";

/** A step written away from its page, waiting for that page to open. */
export interface ParkedStep {
  scope: DraftScope;
  /** The page whose history takes it. */
  page: string;
  /** The page opened after its Undo when `page` is gone by then (where it was before a move, the page it was made on). */
  home?: string;
  /** The drafts each side of the step (undefined: no draft, the branch's file or none). */
  before: ReadonlyMap<string, SavedDraft | undefined>;
  after: ReadonlyMap<string, SavedDraft | undefined>;
  /** The texts each side (undefined: no such file), the branch's where a side has no draft. */
  beforeSources: ReadonlyMap<string, string | undefined>;
  afterSources: ReadonlyMap<string, string | undefined>;
  done: string;
  undone: string;
}

/**
 * A parked step from the drafts each side of it alone: a side's text is its draft's, else the
 * branch's, which the other side's draft holds as its original (none: the file is new).
 */
export function parkedStep(scope: DraftScope, page: string, sides: Pick<ParkedStep, "before" | "after">, done: string, undone: string, home?: string): ParkedStep {
  const paths = [...new Set([...sides.before.keys(), ...sides.after.keys()])].filter(path => !sameDraft(sides.before.get(path), sides.after.get(path)));
  const branch = (path: string) => { const record = sides.before.get(path) ?? sides.after.get(path); return record && record.baseSha !== null ? record.original : undefined; };
  const text = (side: ReadonlyMap<string, SavedDraft | undefined>, path: string) => side.get(path) ? textOf(side.get(path)) : branch(path);
  const pick = (side: ReadonlyMap<string, SavedDraft | undefined>) => new Map(paths.map(path => [path, side.get(path)]));
  return { scope, page, home, before: pick(sides.before), after: pick(sides.after), done, undone,
    beforeSources: new Map(paths.map(path => [path, text(sides.before, path)])), afterSources: new Map(paths.map(path => [path, text(sides.after, path)])) };
}

/** Steps parked at once, at most; the oldest goes first. */
export const PARKED_LIMIT = 50;

type Record = (undo: () => boolean, redo: () => boolean, dispose: () => void) => boolean;

/**
 * The parked steps of this tab. `open(scope, page)`: how to record a step in `page`'s history while
 * it is open in `scope` now (undefined when it is not), so a step landing on its open page goes there at once.
 */
export function createParkedSteps(ports: { open(scope: DraftScope, page: string): Record | undefined; transitions(step: ParkedStep): { undo: () => boolean; redo: () => boolean } }, limit = PARKED_LIMIT) {
  let steps: ParkedStep[] = [];
  const keyOf = (step: Pick<ParkedStep, "scope" | "page">) => draftKey(step.scope, step.page);
  function record(step: ParkedStep, into: Record) {
    const { undo, redo } = ports.transitions(step);
    return into(undo, redo, () => {});
  }
  return {
    park: (step: ParkedStep) => {
      const open = ports.open(step.scope, step.page);
      if (open && record(step, open)) return;
      steps = [...steps, step].slice(-limit);
    },
    /** `page` opened in `scope` (its history recorded by `into`): its parked steps become its newest, oldest first. */
    adopt(scope: DraftScope, page: string, into: Record) {
      const key = draftKey(scope, page), mine = steps.filter(step => keyOf(step) === key);
      if (!mine.length) return;
      steps = steps.filter(step => keyOf(step) !== key);
      for (const step of mine) if (!record(step, into)) steps.push(step);
    },
    /** Signed out: the steps go with the drafts' owner. */
    clear() { steps = []; },
    count: () => steps.length,
  };
}

const textOf = (record: SavedDraft | undefined) => record && !record.deleted && !record.opaque ? record.content : undefined;
// The same draft as `expected`, read back or saved again since (every field but its time).
function sameDraft(expected: SavedDraft | undefined, actual: SavedDraft | undefined) {
  if (expected === actual) return true;
  if (!expected || !actual) return false;
  const fields = (record: SavedDraft) => JSON.stringify(Object.entries(record).filter(([key]) => key !== "updatedAt").sort(([a], [b]) => a.localeCompare(b)));
  return fields(expected) === fields(actual);
}

/** A parked step's Undo and Redo, over the editor shown (`ws`) once its page has opened there. */
export function parkedTransitions(ws: EditorWorkspace, step: ParkedStep) {
  const { scope } = step;
  const ours = () => { const now = ws.draftScope(); return Boolean(now) && draftKey(now!, step.page) === draftKey(scope, step.page); };
  // The branch's text of a file with no draft on one side: what that side read.
  const base = (path: string) => step.before.get(path) === undefined ? step.beforeSources.get(path)
    : step.after.get(path) === undefined ? step.afterSources.get(path) : ws.base(path);
  function move(direction: "undo" | "redo") {
    const redo = direction === "redo";
    const from = redo ? step.before : step.after, to = redo ? step.after : step.before;
    const fromSources = redo ? step.beforeSources : step.afterSources, toSources = redo ? step.afterSources : step.beforeSources;
    const refused = (reason: string) => { ws.refuse(reason, direction); return false; };
    if (!ours()) return refused("This change belongs to another site or branch.");
    const now = new Map([...from.keys()].map(path => [path, ws.store.get(scope, path)] as const));
    const changed = [...now].find(([path, record]) => !sameDraft(from.get(path), record));
    if (changed) return refused(`${changed[0]} changed since, so this change cannot be ${redo ? "redone" : "undone"}. Review the current drafts instead.`);
    const stored = (path: string) => from.has(path) ? (ws.store.get(scope, path) ? textOf(ws.store.get(scope, path)) : base(path)) : ws.source(path);
    // Only the files the step wrote: what its plan merely read proved the step then, not its Undo now.
    const own = (sources: ReadonlyMap<string, string | undefined>) => new Map([...sources].filter(([path]) => from.has(path)));
    const retainPaths = [...to.keys()].filter(path => ws.mounted(path) && toSources.get(path) === undefined);
    const receipt = prepareNativeTextHistory({ scope, store: ws.store, persistentModels: true, isLive: ours,
      source: stored, mounted: path => ws.mounted(path), retainModel: path => ws.retainModel(path), modelState: path => ws.model(path),
      evictModel: (path, proof) => ws.evictModel(path, proof), prepareSources: changes => ws.prepareSources(changes),
    }, { before: now, after: new Map(to), beforeSources: own(fromSources), afterSources: own(toSources), retainPaths });
    if (!receipt) return refused(ws.store.error ?? "The editor changed, so this change cannot be taken back here. Review the current drafts.");
    if (!receipt.apply()) { const error = receipt.error(); receipt.dispose(); return refused(error ?? "The drafts changed meanwhile."); }
    // The history takes this move first; then the page shown follows (a page Undo took away opens where it came from).
    ws.later(() => {
      try {
        ws.afterFileChanges();
        const open = ws.openFile(), gone = open !== undefined && !ws.exists(open);
        const opening = gone || open === undefined ? ws.openAfter(redo ? step.page : step.home ?? step.page, true) : undefined;
        ws.announce(redo ? step.done : step.undone);
        void Promise.resolve(opening).catch(error => ws.error(error)).finally(() => receipt.dispose());
      } catch (error) { receipt.dispose(); ws.error(error); }
    });
    return true;
  }
  return { undo: () => move("undo"), redo: () => move("redo") };
}
