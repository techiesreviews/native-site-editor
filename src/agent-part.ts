import { outlineId, parseOutlineId, textBytes, type AgentCommandArgs } from "../shared/agent";
import type { JsonValue } from "../shared/agent-command";
import { PartClash, partOf, type AgentEdit, type AgentStatus } from "../shared/agent-edit";
import { catchUpOf, findPageRef, type AgentCatchUp, type AgentMark, type AgentReadResult } from "../shared/agent-read";
import type { EditorContext } from "../shared/types";
import { minimalTextEdit } from "../shared/native-project";
import type { SharedContext } from "./agent-site";
import { pageOutline } from "./agent-site";
import { readSource } from "./page-builder/source-tree";

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
 * that HTML now (elements added or removed before it move it). Throws the clash when it changed or is gone:
 * with it as it is now when the same place still holds an element like it (its tag, among as many siblings).
 */
export function elementsNow(path: string, args: AgentCommandArgs, read: string, now: string, hash: string): AgentCommandArgs {
  const trees = new Map([read, now].map(text => [text, readSource(text, { page: true })]));
  const at = (text: string, id: string) => {
    const tree = trees.get(text)!, node = parseOutlineId(id), el = node && tree.at(node), range = el?.type === "element" ? tree.range(el) : undefined;
    if (!node || !el || el.type !== "element" || !range) return undefined;
    const parent = node.length > 1 ? tree.at(node.slice(0, -1)) : undefined;
    return { tag: el.name, siblings: tree.elements(parent).filter(child => tree.path(child).length === node.length).length,
      text: text.slice(range.start, range.end), start: range.start, end: range.end };
  };
  const moved: AgentCommandArgs = { ...args };
  for (const name of ELEMENT_ARGS) {
    const id = args[name];
    if (typeof id !== "string") continue;
    const was = at(read, id);
    // Not an element of the page read: the live page refuses it as before.
    if (!was) continue;
    const same = at(now, id);
    if (same?.text === was.text) continue;
    const tree = trees.get(now)!;
    const found = tree.elements().filter(el => { const range = tree.range(el); return range && range.end - range.start === was.text.length && now.slice(range.start, range.end) === was.text; });
    if (found.length === 1) { moved[name] = outlineId(tree.path(found[0])); continue; }
    const part = same && same.tag === was.tag && same.siblings === was.siblings ? partOf(path, hash, now, same.start, same.end) : undefined;
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

/** The drafts of `shared` as a mark keeps them. */
function markOf(shared: SharedContext): AgentMark {
  const files: AgentMark["files"] = {};
  for (const draft of shared.context.drafts)
    files[draft.path] = { at: draft.updatedAt, ...(draft.hash ? { hash: draft.hash } : {}), ...(draft.baseSha === null ? { added: true as const } : {}), ...(draft.deleted ? { deleted: true as const } : {}) };
  return { commit: shared.context.commit, files };
}

/**
 * What changed in the workspace `shared` shows since the last reply to the agent `grantId` there, its
 * own changes (`own` paths) left out; its mark moves to now. Nothing on its first reply, or when nothing changed.
 */
export function catchUp(grantId: string | undefined, shared: SharedContext | undefined, own: ReadonlySet<string> = new Set()): AgentCatchUp | undefined {
  if (!grantId || !shared) return undefined;
  const key = JSON.stringify([shared.context.repository.id, shared.context.branch, grantId]);
  const before = marks.get(key), now = markOf(shared);
  marks.delete(key);
  marks.set(key, now);
  for (const old of marks.keys()) { if (marks.size <= MARKS) break; marks.delete(old); }
  if (!before) return undefined;
  const pages = new Set(shared.context.pages?.flatMap(page => page.file ? [page.file] : []));
  const sectionTags = new Set(shared.context.site?.components.filter(item => item.section).map(item => item.tag));
  return catchUpOf(before, now, own, (path, was, is) => {
    const old = was && readText(was), text = is && shared.texts.get(is);
    if (!pages.has(path) || old === undefined || text === undefined) return undefined;
    try { return sectionsTouched(old, text, sectionTags); } catch { return undefined; }
  });
}

/** The files an applied edit changed, which its own catch-up leaves out, but for `changed` (tellAgent). */
function ownPaths(request: AgentEdit | AgentStatus, result: AgentReadResult, context: EditorContext, changed?: string) {
  const own = new Set<string>(), value = result.ok ? result.value : undefined;
  if (request.operation !== "edit" || !value || typeof value !== "object" || Array.isArray(value) || value.state !== "applied") return own;
  const args = request.args as { path?: string; to?: string; page?: string };
  const page = args.page !== undefined && context.pages ? findPageRef(context.pages, args.page)?.file : undefined;
  const detail = value.result && typeof value.result === "object" && !Array.isArray(value.result) ? value.result : {};
  for (const path of [args.path, args.to, page, detail.path, detail.file, ...typeof detail.files === "string" ? detail.files.split(", ") : []])
    if (typeof path === "string" && path && path !== changed) own.add(path);
  return own;
}

/**
 * A reply to the agent `grantId` with what changed in `workspace` since its last call added as
 * `changesSinceLastRead`, while the editor shows that workspace (`shared`); an edit's (`request`) own
 * changes are left out, but for `changed`, the file it landed on in another text than it read (others'
 * changes there are still the agent's to be told). A reply that is no object tells nothing, and keeps the mark.
 */
export function tellAgent(shared: SharedContext | undefined, workspace: { repoId: number; branch: string }, grantId: string | undefined,
  result: AgentReadResult, request?: AgentEdit | AgentStatus, changed?: string): AgentReadResult {
  if (!shared || shared.context.repository.id !== workspace.repoId || shared.context.branch !== workspace.branch) return result;
  if (!result.ok || !result.value || typeof result.value !== "object" || Array.isArray(result.value)) return result;
  const told = catchUp(grantId, shared, request && ownPaths(request, result, shared.context, changed));
  return told ? { ...result, value: { ...result.value, changesSinceLastRead: told as unknown as JsonValue } } : result;
}
