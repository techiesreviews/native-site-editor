// The agent changes this tab applied, kept for their undo (ticket am-15): an agent's discard_change, or the
// user's Undo on the change's pin card. Each is its files' drafts as they were just before it and as it left
// them, recorded as its receipt commits (src/agent-site.ts prepareAgentText, src/agent-media-actions.ts).
// Its undo is a guarded edit that puts the drafts before it back whole (`restore`, src/guarded-edit/commit.ts),
// once every file is still as the change left it: one step of its own, which Undo and Redo take back and forth.
//
// Kept in memory only, like the editor's Undo history: a reload forgets them, and the oldest go first past
// KEPT changes or BUDGET characters of text.

import type { DraftScope, SavedDraft } from "./drafts";
import type { PlanResult, Reads } from "./guarded-edit";

export interface AgentChange {
  /** The change's requestId (the receipt's operation id) and the connection and name that made it. */
  id: string;
  grant: string;
  agent: string;
  operation: string;
  scope: DraftScope;
  /** The file the change was about (its command's path): its page, where its undo runs. */
  page: string;
  /** Each file it changed, its draft before it and after it (none: the branch's file, or no file). */
  before: Map<string, SavedDraft | undefined>;
  after: Map<string, SavedDraft | undefined>;
}

const KEPT = 40;
const BUDGET = 16 * 1024 * 1024;
const changes = new Map<string, AgentChange & { size: number }>();
// Undone here: the pin card says so (at most KEPT kept).
const undone = new Set<string>();
const keyOf = (scope: Pick<DraftScope, "repoId" | "branch">, id: string) => JSON.stringify([scope.repoId, scope.branch, id]);
const sizeOf = (drafts: Map<string, SavedDraft | undefined>) => [...drafts.values()].reduce((sum, draft) => sum + (draft ? draft.content.length + draft.original.length : 0), 0);

/** A change that landed: `before` and `after` as its commit wrote them; only the files it changed are kept. */
export function noteAgentChange(change: AgentChange) {
  const after = new Map(change.after), before = new Map([...after.keys()].map(path => [path, change.before.get(path)] as const));
  if (!after.size) return;
  const key = keyOf(change.scope, change.id), kept = { ...change, scope: { ...change.scope }, before, after, size: sizeOf(before) + sizeOf(after) };
  changes.delete(key);
  undone.delete(key);
  changes.set(key, kept);
  let total = [...changes.values()].reduce((sum, item) => sum + item.size, 0);
  for (const [old, item] of changes) {
    if (changes.size <= KEPT && total <= BUDGET) break;
    changes.delete(old);
    total -= item.size;
  }
}

/** The change `id` of this repository and branch, while it is kept and not undone. */
export function keptChange(scope: Pick<DraftScope, "repoId" | "branch">, id: string): AgentChange | undefined {
  return changes.get(keyOf(scope, id));
}

/** Whether the user can undo these changes (a pin's requestIds): one is kept ("ready"), or all that were are undone. */
export function undoState(scope: Pick<DraftScope, "repoId" | "branch">, ids: readonly string[] | undefined): "ready" | "undone" | undefined {
  if (!ids?.length) return undefined;
  if (ids.some(id => changes.has(keyOf(scope, id)))) return "ready";
  return ids.some(id => undone.has(keyOf(scope, id))) ? "undone" : undefined;
}

/** The change was undone: no second undo of it. */
export function changeUndone(change: Pick<AgentChange, "scope" | "id">) {
  const key = keyOf(change.scope, change.id);
  changes.delete(key);
  undone.add(key);
  for (const old of undone) { if (undone.size <= KEPT) break; undone.delete(old); }
}

// A draft as it stands for the undo: its text and where it came from, whenever it was written.
const sameDraft = (a: SavedDraft | undefined, b: SavedDraft | undefined) =>
  a === b || Boolean(a && b) && JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 });

/**
 * The guarded edit that undoes `change`: its files' drafts before it, put back, while each is still as the change
 * left it (`drafts`: the draft of a path now). The page shown stays open when it is still there after; else the
 * change's own page, else the home page.
 */
export function discardPlan(change: AgentChange, r: Reads, drafts: (path: string) => SavedDraft | undefined, openFile: string | undefined): PlanResult {
  const who = change.agent || "the agent";
  for (const [path, after] of change.after) {
    r.source(path);
    if (!sameDraft(drafts(path), after))
      return { refuse: `${path} changed since ${who}'s change ${change.id}, so it cannot be undone as a whole. Change it back with the edit tools.` };
  }
  // A file it changed is there after the undo when it was before (a draft not deleted, or the branch's file).
  const there = (path: string) => {
    if (!change.after.has(path)) return r.exists(path);
    const before = change.before.get(path), after = change.after.get(path);
    return before ? !before.deleted : Boolean(after && after.baseSha !== null && !after.movedFrom);
  };
  const routes = r.site()?.routes ?? {}, pages = new Set(Object.values(routes));
  const open = [openFile, pages.has(change.page) ? change.page : undefined, routes["/"]].find((path): path is string => Boolean(path) && there(path!));
  const now = Date.now();
  return {
    restore: new Map([...change.before].map(([path, draft]) => [path, draft && { ...draft, updatedAt: now }])),
    done: `Undid ${who}'s change.`,
    undone: `Brought back ${who}'s change.`,
    ...(open ? { open } : {}),
  };
}
