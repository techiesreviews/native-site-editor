import { outlineId, parseOutlineId, textBytes, type AgentCommandArgs } from "../shared/agent";
import type { JsonValue } from "../shared/agent-command";
import { PartClash, partOf } from "../shared/agent-edit";
import { catchUpOf, type AgentCatchUp, type AgentMark, type AgentReadResult } from "../shared/agent-read";
import { minimalTextEdit } from "../shared/native-project";
import type { SharedContext } from "./agent-site";
import { pageOutline } from "./agent-site";
import { readSource } from "./page-builder/source-tree";
import { sameBranch } from "./workspace-session";

/*
 * What this tab keeps of what agents were told (ticket 10), so several agents on one page rarely refuse
 * each other: the texts they read, by hash, to find again the part an edit was read against; and per
 * agent, the drafts as of its last reply, so every reply can tell it what changed since.
 * Kept in memory only: a reload starts every agent's catch-up afresh.
 */

const READ_TEXTS = 200, READ_BYTES = 16 * 1024 * 1024;
const texts = new Map<string, string>();
let bytes = 0;

/** Keeps `text`, whose textHash is `hash`, as an agent was given it; the oldest go past the limits. */
export function rememberText(hash: string, text: string) {
  const had = texts.get(hash);
  if (had !== undefined) { texts.delete(hash); texts.set(hash, had); return; }
  texts.set(hash, text);
  bytes += textBytes(text);
  for (const [old, value] of texts) {
    if (texts.size <= READ_TEXTS && bytes <= READ_BYTES) break;
    texts.delete(old);
    bytes -= textBytes(value);
  }
}
/** The text an agent was given with this hash, while the tab keeps it. */
export const readText = (hash: string) => texts.get(hash);

/** Keeps the texts a read reply gives an agent: a file's, a page's, an export's. */
export function rememberRead(value: unknown) {
  if (!value || typeof value !== "object") return;
  const item = value as { hash?: unknown; content?: unknown; html?: unknown; files?: unknown };
  const text = typeof item.content === "string" ? item.content : item.html;
  if (typeof item.hash === "string" && typeof text === "string") rememberText(item.hash, text);
  if (Array.isArray(item.files)) for (const file of item.files) rememberRead(file);
}

// ---- Parts of a page ----

/** The ids of page elements a page command names. */
const ELEMENT_ARGS = ["section", "element", "before", "after"] as const;

/**
 * A page command's element ids, read in `read` (the page as the agent read it), found in `now` (its text
 * now, `hash`): an element whose HTML is unchanged keeps its id, or takes the id of the one element with
 * that HTML now (elements added or removed before it move it). The element a command changes (`section`,
 * `element`) throws the clash when it changed or is gone: with it as it is now when the same place still
 * holds an element like it (its tag, among as many siblings). An anchor (`before`, `after`) is not changed by
 * the command: changed in place like that, it keeps its id; only one gone is refused.
 */
export function elementsNow(path: string, args: AgentCommandArgs, read: string, now: string, hash: string): AgentCommandArgs {
  const readTree = readSource(read, { page: true }), nowTree = readSource(now, { page: true });
  const at = (tree: typeof nowTree, text: string, id: string) => {
    const node = parseOutlineId(id), el = node && tree.at(node), range = el?.type === "element" ? tree.range(el) : undefined;
    if (!node || !el || el.type !== "element" || !range) return undefined;
    const parent = node.length > 1 ? tree.at(node.slice(0, -1)) : undefined;
    return { tag: el.name, siblings: tree.elements(parent).filter(child => tree.path(child).length === node.length).length,
      text: text.slice(range.start, range.end), start: range.start, end: range.end };
  };
  const moved: AgentCommandArgs = { ...args };
  for (const name of ELEMENT_ARGS) {
    const id = args[name];
    if (typeof id !== "string") continue;
    const was = at(readTree, read, id);
    // Not an element of the page read: the live page refuses it as before.
    if (!was) continue;
    const same = at(nowTree, now, id);
    if (same?.text === was.text) continue;
    const found = nowTree.elements().filter(el => { const range = nowTree.range(el); return range && range.end - range.start === was.text.length && now.slice(range.start, range.end) === was.text; });
    if (found.length === 1) { moved[name] = outlineId(nowTree.path(found[0])); continue; }
    const alike = same && same.tag === was.tag && same.siblings === was.siblings;
    if (alike && (name === "before" || name === "after")) continue;
    const part = alike ? partOf(path, hash, now, same.start, same.end) : undefined;
    throw new PartClash(part
      ? `Element ${id} of ${path} was changed meanwhile, by the user or another agent. part has it as it is now: read the page again (get_page) and send the change anew.`
      : `Element ${id} of ${path} is no longer there: the user or another agent changed the page meanwhile. Read the page again (get_page).`, part);
  }
  return moved;
}

/** The sections of the page `now` (by its outline) that the change from `before` touched. */
function sectionsTouched(before: string, now: string, sectionTags: ReadonlySet<string>) {
  const change = minimalTextEdit(before, now);
  if (!change) return [];
  const start = change.start, end = change.start + change.text.length, tree = readSource(now, { page: true });
  return pageOutline(now, sectionTags).sections.filter(section => {
    const node = parseOutlineId(section.id), el = node && tree.at(node), range = el?.type === "element" ? tree.range(el) : undefined;
    return range && range.start <= end && start <= range.end;
  }).map(section => section.id);
}

// ---- Catch-up ----

/** Each agent's mark, by repository, branch and connection. */
const marks = new Map<string, AgentMark>();
const MARKS = 100;
/** The files each agent changed itself since its mark, with the hash its change left (none when it left none). */
const owned = new Map<string, Map<string, string | undefined>>();
const markKey = (repoId: number, branch: string, grantId: string) => JSON.stringify([repoId, branch, grantId]);

/**
 * An agent's change landed (ticket 10): its files are its own, not told back to it, whichever reply comes
 * next (the edit's, a status lookup's once it waited, or any later call). A file left with another hash by
 * the time it is told was changed again since, and is told.
 */
export function noteOwnChange(workspace: { repoId: number; branch: string }, grantId: string, files: ReadonlyMap<string, string | undefined>) {
  const key = markKey(workspace.repoId, workspace.branch, grantId);
  if (!marks.has(key)) return;
  const mine = owned.get(key) ?? new Map<string, string | undefined>();
  for (const [path, hash] of files) mine.set(path, hash);
  owned.set(key, mine);
}

/** The drafts of `shared` as a mark keeps them. */
function markOf(shared: SharedContext): AgentMark {
  // No prototype: a draft named __proto__ is a file like any other.
  const files: AgentMark["files"] = Object.create(null);
  for (const draft of shared.context.drafts)
    files[draft.path] = { at: draft.updatedAt, ...(draft.hash ? { hash: draft.hash } : {}), ...(draft.baseSha === null ? { added: true as const } : {}), ...(draft.deleted ? { deleted: true as const } : {}) };
  return { commit: shared.context.commit, files };
}

/**
 * What changed in the workspace `shared` shows since the last reply to the agent `grantId` there, its
 * own changes (noteOwnChange) left out; its mark moves to now. Nothing on its first reply, or when nothing changed.
 */
function catchUp(grantId: string | undefined, shared: SharedContext): AgentCatchUp | undefined {
  if (!grantId) return undefined;
  const key = markKey(shared.context.repository.id, shared.context.branch, grantId);
  const before = marks.get(key), now = markOf(shared), mine = owned.get(key);
  marks.delete(key);
  owned.delete(key);
  marks.set(key, now);
  for (const old of marks.keys()) { if (marks.size <= MARKS) break; marks.delete(old); owned.delete(old); }
  if (!before) return undefined;
  const own = new Set([...mine ?? []].filter(([path, hash]) => hash === undefined || now.files[path]?.hash === hash).map(([path]) => path));
  const pages = new Set(shared.context.pages?.flatMap(page => page.file ? [page.file] : []));
  const sectionTags = new Set(shared.context.site?.components.filter(item => item.section).map(item => item.tag));
  return catchUpOf(before, now, own, (path, was, is) => {
    const old = was && readText(was), text = is && shared.texts.get(is);
    if (!pages.has(path) || old === undefined || text === undefined) return undefined;
    try { return sectionsTouched(old, text, sectionTags); } catch { return undefined; }
  });
}

/**
 * A reply to the agent `grantId` with what changed in `workspace` since its last call added as
 * `changesSinceLastRead`, while the editor shows that workspace (`shared`); its own changes are left out
 * (noteOwnChange). A reply that is no object tells nothing, and keeps the mark.
 */
export function tellAgent(shared: SharedContext | undefined, workspace: { repoId: number; branch: string }, grantId: string | undefined, result: AgentReadResult): AgentReadResult {
  if (!shared || !sameBranch({ repoId: shared.context.repository.id, branch: shared.context.branch }, workspace)) return result;
  if (!result.ok || !result.value || typeof result.value !== "object" || Array.isArray(result.value)) return result;
  const told = catchUp(grantId, shared);
  return told ? { ...result, value: { ...result.value, changesSinceLastRead: told as unknown as JsonValue } } : result;
}
