// The agent changes this tab applied, kept for their undo (ticket am-15): an agent's discard_change, or the
// user's Undo on the change's pin card. Each is its files' drafts as they were just before it and as it left
// them, recorded as its receipt commits (src/agent-site.ts prepareAgentText, src/agent-media-actions.ts).
// Its undo is a guarded edit that puts the drafts before it back whole (`restore`, src/guarded-edit/commit.ts),
// once every file is still as the change left it: one step of its own, which Undo and Redo take back and forth.
//
// The chip on an agent's presence outline (ticket am-49) undoes the same way its latest change to that page.
//
// Whether a change is undone is read from the drafts now, never recorded: Undo of the undo (Ctrl+Z) brings the
// change back, and its pin card offers Undo again. Several changes (a pin's requestIds) are undone newest first
// as one step, whole or not at all.
//
// Kept in memory only, like the editor's Undo history: a reload forgets them, and the oldest go first past
// KEPT changes or BUDGET characters of text.

import type { DraftScope, SavedDraft } from "./drafts";
import type { GuardedEdits, Outcome, PlanResult, Reads } from "./guarded-edit";
import { githubScope, same } from "./workspace-session";
import { nativePageHead } from "../shared/native-project";

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
type Kept = AgentChange & { size: number; seq: number };
type Scope = Pick<DraftScope, "account" | "repoId" | "branch">;
type Drafts = (path: string) => SavedDraft | undefined;

const KEPT = 40;
const BUDGET = 16 * 1024 * 1024;
const changes = new Map<string, Kept>();
// The order changes were noted in: newest first is the order their undo takes.
let noted = 0;
const keyOf = (scope: Scope, id: string) => JSON.stringify([scope.account.toLowerCase(), scope.repoId, scope.branch, id]);
const sizeOf = (drafts: Map<string, SavedDraft | undefined>) => [...drafts.values()].reduce((sum, draft) => sum + (draft ? draft.content.length + draft.original.length : 0), 0);
/** Whether two workspaces are the same account, repository and branch. */
export const sameScope = (a: Scope | undefined, b: Scope | undefined) => !!a && !!b && same(githubScope(a), githubScope(b));

// A draft as it stands for the undo: its text and where it came from, whenever it was written.
const sameDraft = (a: SavedDraft | undefined, b: SavedDraft | undefined) =>
  a === b || Boolean(a && b) && JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 });

/** A change that landed: `before` and `after` as its commit wrote them; only the files it changed are kept (not the page open it stayed on). */
export function noteAgentChange(change: AgentChange) {
  const after = new Map([...change.after].filter(([path, draft]) => !sameDraft(change.before.get(path), draft))), before = new Map([...after.keys()].map(path => [path, change.before.get(path)] as const));
  if (!after.size) return;
  const key = keyOf(change.scope, change.id);
  changes.delete(key);
  changes.set(key, { ...change, scope: { ...change.scope }, before, after, size: sizeOf(before) + sizeOf(after), seq: ++noted });
  let total = [...changes.values()].reduce((sum, item) => sum + item.size, 0);
  for (const [old, item] of changes) {
    if (changes.size <= KEPT && total <= BUDGET) break;
    changes.delete(old);
    total -= item.size;
  }
}

/** The change `id` of this account, repository and branch, while it is kept (undone or not). */
export function keptChange(scope: Scope, id: string): AgentChange | undefined {
  return changes.get(keyOf(scope, id));
}
/**
 * The kept changes of `ids` made on the connection `grant` (with none given: any), newest first (the order of
 * their undo), whatever order the ids are in. A pin's ids are its agent's words: only its own changes count.
 */
export function keptChanges(scope: Scope, ids: readonly string[], grant?: string): AgentChange[] {
  return [...new Set(ids)].flatMap(id => changes.get(keyOf(scope, id)) ?? [])
    .filter(change => grant === undefined || change.grant === grant).sort((a, b) => b.seq - a.seq);
}
/**
 * The newest kept change (undone or not) the agent `who` (its connection and name) made to the page `page` in this
 * workspace: what its chip's Undo puts back (ticket am-49). Only a change that wrote that page's file: one that landed
 * on another page waits on that page.
 */
export function latestChange(scope: Scope, who: { grant: string; name: string }, page: string): AgentChange | undefined {
  let latest: Kept | undefined;
  for (const change of changes.values())
    if (change.grant === who.grant && change.agent === who.name && change.after.has(page) && sameScope(change.scope, scope)
      && (!latest || change.seq > latest.seq)) latest = change;
  return latest;
}

/**
 * `list` (newest first) against the drafts now: "ready" when each, newest first, finds its files as it left them
 * (the changes as they landed), "undone" when each, oldest first, finds them as they were before it, else
 * `changed`: the first file found otherwise. `merged`: by path, the draft before the oldest change of it, and that
 * change's after (which tells whether a branch file was there).
 */
function walk(list: readonly AgentChange[], drafts: Drafts) {
  const step = (order: readonly AgentChange[], from: "after" | "before", to: "after" | "before") => {
    const now = new Map<string, SavedDraft | undefined>();
    for (const change of order)
      for (const [path, expected] of change[from]) {
        const seen = now.has(path) ? now.get(path) : drafts(path);
        if (!sameDraft(seen, expected)) return { path, change };
        now.set(path, change[to].get(path));
      }
    return undefined;
  };
  const merged = new Map<string, { before: SavedDraft | undefined; after: SavedDraft | undefined }>();
  for (const change of list) for (const path of change.after.keys()) merged.set(path, { before: change.before.get(path), after: change.after.get(path) });
  const changed = step(list, "after", "before");
  if (!changed) return { state: "ready" as const, merged };
  return step([...list].reverse(), "before", "after") ? { state: "changed" as const, changed, merged } : { state: "undone" as const, merged };
}

/**
 * Whether the user can undo these changes (a pin's requestIds) now: "undone" while the files are as before them,
 * else "ready" (a file changed since is refused once pressed, saying which); none when this tab keeps none of them.
 */
export function undoState(scope: Scope, ids: readonly string[] | undefined, drafts: Drafts, grant: string | undefined): "ready" | "undone" | undefined {
  if (!grant) return undefined;
  const list = keptChanges(scope, ids ?? [], grant);
  if (!list.length) return undefined;
  return walk(list, drafts).state === "undone" ? "undone" : "ready";
}

/** A file as the user's refusal names it, never by its path (S7): the page shown, another page by its title, else a file of the change. */
function userFile(path: string, r: Reads, openFile: string | undefined) {
  if (path === openFile) return "This page";
  if (!Object.values(r.site()?.routes ?? {}).includes(path)) return "A file it changed";
  const text = r.source(path), title = text === undefined ? undefined : nativePageHead(text).title?.trim();
  return title ? `The page “${title}”` : "Another page";
}

/**
 * The guarded edit that undoes `list` (newest first) as one step: the drafts before each, put back, while each
 * finds its files as it left them (`drafts`: the draft of a path now). The page shown stays open when it is
 * still there after; else the newest change's own page, else the home page.
 */
export function discardPlan(list: readonly AgentChange[], r: Reads, drafts: Drafts, openFile: string | undefined, reader: "agent" | "user" = "agent"): PlanResult {
  const names = [...new Set(list.map(change => change.agent || "the agent"))].join(", ");
  const { state, changed, merged } = walk(list, drafts);
  for (const path of merged.keys()) r.source(path);
  // Refusals in the reader's words: an agent gets the change's id and its next step; the user, on the pin's card, neither.
  if (state === "undone") return { refuse: reader === "user" ? "This is undone already." :
    `${list.map(change => change.id).join(", ")} ${list.length === 1 ? "is" : "are"} undone already: the files are as they were before.` };
  if (state === "changed") {
    const who = changed.change.agent || "the agent";
    return { refuse: reader === "user" ? `${userFile(changed.path, r, openFile)} changed since ${who}'s change. Nothing was undone.`
      : `${changed.path} changed since ${who}'s change ${changed.change.id}, so it cannot be undone as a whole. Change it back with the edit tools.` };
  }
  // A file changed is there after the undo when it was before (a draft not deleted, or the branch's file).
  const there = (path: string) => {
    const file = merged.get(path);
    if (!file) return r.exists(path);
    return file.before ? !file.before.deleted : Boolean(file.after && file.after.baseSha !== null && !file.after.movedFrom);
  };
  const routes = r.site()?.routes ?? {}, pages = new Set(Object.values(routes)), page = list[0].page;
  const open = [openFile, pages.has(page) ? page : undefined, routes["/"]].find((path): path is string => Boolean(path) && there(path!));
  const now = Date.now();
  return {
    restore: new Map([...merged].map(([path, { before }]) => [path, before && { ...before, updatedAt: now }])),
    // Said in the status line only, no toast: the pin's card shows Undone, and an agent's discard needs none (S4).
    quiet: true,
    done: `Undid ${names}'s change${list.length === 1 ? "" : "s"}.`,
    undone: `Brought back ${names}'s change${list.length === 1 ? "" : "s"}.`,
    ...(open ? { open } : {}),
  };
}

/**
 * The user's Undo on a done pin's card: the kept changes of `ids` its agent's connection (`grant`) made, newest first, put back as one step, in the
 * workspace the click was in (`scope`, taken as it was pressed), while it is the one shown. Undone already (the agent
 * discarded them), nothing happens; refused, nothing is written and the reason is thrown, in the user's words.
 */
export async function undoAgentChanges(ids: readonly string[], grant: string | undefined, ports: {
  scope: DraftScope | undefined;
  /** The workspace shown now. */
  shown(): DraftScope | undefined;
  edits: Pick<GuardedEdits, "run">;
  draft(scope: DraftScope, path: string): SavedDraft | undefined;
  openFile(): string | undefined;
}) {
  const { scope } = ports;
  if (!scope) throw new Error("Open the site first.");
  if (!sameScope(ports.shown(), scope)) throw new Error(SITE_CHANGED);
  const list = grant ? keptChanges(scope, ids, grant) : [];
  if (!list.length) throw new Error("This tab no longer keeps the agent's change. Change it back by hand.");
  const drafts: Drafts = path => ports.draft(scope, path);
  if (walk(list, drafts).state === "undone") return;
  const outcome: Outcome = await ports.edits.run(r => discardPlan(list, r, drafts, ports.openFile(), "user"), { guard: () => sameScope(ports.shown(), scope) });
  if (!outcome.ok) throw new Error(outcome.reason === "stale" ? SITE_CHANGED : outcome.message);
}
const SITE_CHANGED = "The site changed meanwhile. Nothing was undone; try again.";

/**
 * The user's Undo on an agent's chip (ticket am-49): the change `change` its chip offered, which must still be `who`'s
 * latest to the page `page` in the workspace the press was in (`scope`, taken as it was pressed); put back as a pin's
 * Undo does (`undoAgentChanges`). A newer change landed since is refused: the chip offers that one next.
 */
export async function undoLatestChange(who: { grant: string; name: string }, page: string, change: string, ports: Parameters<typeof undoAgentChanges>[2]) {
  const { scope } = ports;
  if (!scope) throw new Error("Open the site first.");
  const latest = latestChange(scope, who, page);
  if (latest && latest.id !== change) throw new Error(`${who.name || "The agent"} changed this page again meanwhile. Nothing was undone; try again.`);
  await undoAgentChanges(latest ? [latest.id] : [], who.grant, ports);
}

/** What an agent is told once discard_change undid its change (its reply, and the receipt's recorded one). */
export const discardedMessage = (id: string) => `Undid change ${id}: its files are as they were before it, unsaved.`;
