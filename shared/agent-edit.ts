import { AGENT_TEXT_LIMIT, isMediaUploadWrite, OUTSIDE_MEDIA_REFUSED, parseOutlineId, textBytes,
  type AgentCommandArgs, type AgentOperation } from "./agent";
import { applyReplacements } from "./agent-replacements";
import { minimalTextEdit } from "./native-project";
import { HttpError } from "./http-error";
import { SiteFiles } from "./site-files";
import { fileInTheWay, foldersAbove, makeComponentProblem, pageAddressProblem, writablePathProblem } from "./site-rules";
import { findPageRef, noHomePage } from "./agent-read";
import { agentTools } from "./agent-tool-table";
import type { EditorContext } from "./types";
type Page = NonNullable<EditorContext["pages"]>[number];

export interface AgentEditArgsMap {
  edit_file: { path: string; expectedHash: string; edits: { oldText: string; newText: string; all?: boolean }[] };
  write_file: { path: string; content: string; expectedHash?: string | null };
  move_file: { path: string; to: string; keepOldUrl?: boolean };
  delete_file: { path: string };
  create_page: { title: string; parent?: string; slug?: string };
  set_page_details: { page: string; title?: string; description?: string };
  open_page: { page: string };
  inspect_preview: { page?: string; element?: string; selector?: string; limit?: number };
  make_component: { page: string; element: string; tag: string; fixed?: string[]; expectedHash: string };
  add_section: { page: string; component: string; expectedHash: string; before?: string; after?: string };
  move_section: { page: string; section: string; expectedHash: string; before?: string; after?: string };
  remove_section: { page: string; section: string; expectedHash: string };
}
export type AgentEditTool = keyof AgentEditArgsMap;
export type AgentEdit = { [K in AgentEditTool]: {
  operation: "edit"; tool: K; args: AgentEditArgsMap[K]; id: string; grantId: string; generation?: number; createdAt: number;
} }[AgentEditTool];
export interface AgentStatus { operation: "status"; id: string; grantId: string; generation?: number }
export type PreparedEdit = { operation: AgentOperation; input: {
  path: string; content?: string; expectedHash?: string | null; args?: AgentCommandArgs;
} } | { unchanged: { state: "unchanged"; message: string } };

/*
 * Every refusal an agent edit can get is decided in one place (ticket 51; tests/agent-tools-edit.test.ts lists them):
 * - the Worker, before anything is sent: an edit's shape alone (`editShapeProblem`: paths, size, ids, which
 *   arguments go together), besides its schema;
 * - the tab's preparation (`prepareAgentEdit`): the names an agent gives (a page, a parent page) and the text a
 *   file edit starts from (its hash as read, its replacements, whether it changes anything);
 * - the live page, as the command runs (src/agent-site.ts `applySiteCommand`): its hash, its sections and
 *   components, and the editor's own controls (Make component, New page, Block move, the Files tab).
 */

/** Why `content` cannot be a draft's text, or nothing. */
function contentProblem(content: string) {
  return textBytes(content) > AGENT_TEXT_LIMIT || content.includes("\0") ? `Drafts hold text files up to ${AGENT_TEXT_LIMIT / 1024 / 1024} MB.` : undefined;
}

const notAnElement = (element: string) => `${element} is not an element id; get_page lists them.`;
const oneAnchor = (before?: string, after?: string) => before && after ? "Give before or after, not both." : undefined;

/** Why the edit cannot be what an agent asks, from its arguments alone (the Worker's check, before it sends it), or nothing. */
export function editShapeProblem<K extends AgentEditTool>(tool: K, input: AgentEditArgsMap[K]): string | undefined {
  // A narrowing aid only: pairing the tool with its arguments lets the switch below read each tool's own.
  const { tool: name, args } = { tool, args: input } as { [T in AgentEditTool]: { tool: T; args: AgentEditArgsMap[T] } }[AgentEditTool];
  switch (name) {
    case "edit_file":
    case "delete_file": return writablePathProblem(args.path);
    case "write_file": return writablePathProblem(args.path) ?? (isMediaUploadWrite(args.path) ? OUTSIDE_MEDIA_REFUSED : contentProblem(args.content));
    case "move_file": return writablePathProblem(args.path) ?? writablePathProblem(args.to) ?? (args.path === args.to ? "The new path is the same." : undefined);
    case "create_page": return args.slug === undefined ? undefined : pageAddressProblem(args.slug);
    case "set_page_details": return args.title === undefined && args.description === undefined ? "Give a title, a description, or both." : undefined;
    case "inspect_preview":
      if (args.element !== undefined && args.selector !== undefined) return "Give element or selector, not both.";
      return args.element !== undefined && !parseOutlineId(args.element) ? notAnElement(args.element) : undefined;
    // The name alone: whether another component has it, the editor's Make component decides.
    case "make_component": return parseOutlineId(args.element) ? makeComponentProblem(undefined, args.tag, []) : notAnElement(args.element);
    case "add_section": return oneAnchor(args.before, args.after);
    case "move_section": return !args.before && !args.after ? "Say before or after which section it goes." : oneAnchor(args.before, args.after);
    case "open_page":
    case "remove_section": return undefined;
  }
}

function findPage(context: Pick<EditorContext, "pages">, ref: string) {
  const pages = context.pages;
  if (!pages) throw new HttpError(400, noHomePage);
  const page = findPageRef(pages, ref);
  if (!page?.file) throw new HttpError(404, `No page ${ref}. get_site lists the pages.`);
  return page as Page & { file: string };
}
/** The one wording of a stale read: the agent's hash for a file here, or for a page on the live page (src/agent-site.ts). */
export const changedSinceRead = (path: string) => `${path} changed in the editor since it was read. Read it again.`;
function checkHash(expected: string | undefined, actual: string, what: string) {
  if (expected !== actual) throw new HttpError(409, changedSinceRead(what));
}

/** The longest part a clash sends back; past it the agent reads the file. */
export const PART_LIMIT = 4000;
/** The part of a file an edit targets, as it is now: whole lines (1-based), with the file's hash now. */
export interface AgentPart { path: string; hash: string; lines: { start: number; end: number }; text: string; truncated?: true }
/**
 * A true clash (ticket 10): the words or section an edit changes were changed meanwhile, by the user or
 * another agent. Its refusal carries the part as it is now (none when it is gone), so the agent retries at once.
 */
export class PartClash extends HttpError {
  constructor(message: string, readonly part?: AgentPart) { super(409, message); }
}

/** `[start, end)` of `text` widened to whole lines, as a part of `path`. */
export function partOf(path: string, hash: string, text: string, start: number, end: number): AgentPart {
  const from = text.lastIndexOf("\n", start - 1) + 1, next = text.indexOf("\n", Math.max(from, end - 1));
  const to = next < 0 ? text.length : next;
  const lineAt = (at: number) => text.slice(0, at).split("\n").length;
  const whole = text.slice(from, to), cut = whole.length > PART_LIMIT;
  return { path, hash, lines: { start: lineAt(from), end: lineAt(to) }, text: cut ? whole.slice(0, PART_LIMIT) : whole, ...(cut ? { truncated: true as const } : {}) };
}

/**
 * Where `[start, end)` of `read` (a file's text as an agent read it) is in `now`, its text now: between the
 * nearest lines around it that are still there once each; failing those, where the one stretch that
 * changed between the two puts it. Undefined when that stretch does not meet it.
 */
export function spanNow(read: string, start: number, end: number, now: string): { start: number; end: number } | undefined {
  const lines = (text: string) => { let at = 0; return text.split("\n").map(line => { const item = { line, at }; at += line.length + 1; return item; }); };
  const was = lines(read), is = lines(now);
  const once = new Map<string, number | null>();
  for (const { line, at } of is) if (line.trim()) once.set(line, once.has(line) ? null : at);
  const lineAt = (offset: number) => { let index = 0; while (index + 1 < was.length && was[index + 1].at <= offset) index++; return index; };
  const first = lineAt(start), last = lineAt(Math.max(start, end - 1));
  let from: number | undefined, to: number | undefined;
  for (let index = first - 1; index >= 0 && from === undefined; index--) {
    const at = once.get(was[index].line);
    if (typeof at === "number") from = at + was[index].line.length + 1;
  }
  if (from === undefined && was.slice(0, first).every(item => !item.line.trim())) from = 0;
  for (let index = last + 1; index < was.length && to === undefined; index++) {
    const at = once.get(was[index].line);
    if (typeof at === "number") to = at;
  }
  if (to === undefined && was.slice(last + 1).every(item => !item.line.trim())) to = now.length;
  if (from !== undefined && to !== undefined && from <= to) return { start: from, end: Math.max(from, to - (to > from && now[to - 1] === "\n" ? 1 : 0)) };
  const change = minimalTextEdit(read, now);
  if (!change || end < change.start || start > change.end) return undefined;
  return { start: Math.min(start, change.start), end: Math.max(end, change.end) + change.text.length - (change.end - change.start) };
}

/**
 * The clash of a file edit whose replacements no longer apply to `file`, read by the agent as `read` (its
 * text at the agent's hash, when the tab still has it): the part the first failing replacement changes, now.
 */
function editClash(file: { path: string; hash: string; content: string }, edits: { oldText: string; newText: string; all?: boolean }[], read: string | undefined): never {
  const failing = edits.findIndex((_, index) => !applyReplacements(file.content, edits.slice(0, index + 1)).ok);
  const { oldText } = edits[Math.max(0, failing)];
  const which = edits.length > 1 ? `The words replacement ${failing + 1} changes` : "The words this edit changes";
  const at = read?.indexOf(oldText) ?? -1;
  let span = at >= 0 ? spanNow(read!, at, at + oldText.length, file.content) : undefined;
  if (!span) {
    // No read to go by: where the replaced words' first and last lines still are, once each.
    const ends = oldText.split("\n").filter(line => line.trim());
    const find = (line: string | undefined) => line !== undefined && file.content.indexOf(line) >= 0 && file.content.indexOf(line) === file.content.lastIndexOf(line) ? file.content.indexOf(line) : -1;
    const start = find(ends[0]), last = ends.at(-1)!, end = find(last);
    if (start >= 0 || end >= 0) span = { start: start >= 0 ? start : end, end: end >= start ? end + last.length : start + ends[0].length };
  }
  const part = span && partOf(file.path, file.hash, file.content, span.start, span.end);
  throw new PartClash(part
    ? `${which} in ${file.path} were changed meanwhile, by the user or another agent. part has them as they are now: send the edit again with oldText from part.text and expectedHash part.hash.`
    : `${which} in ${file.path} are no longer there: the user or another agent changed them meanwhile. Read the file again.`, part);
}

/** What the tab's preparation reads of the shared context: the pages, and the page shown. */
export type EditContext = Pick<EditorContext, "pages"> & { site?: Pick<NonNullable<EditorContext["site"]>, "openRoute"> | null };

/**
 * The command an agent's edit becomes, in the receiving tab: its page found by name, a file edit's text
 * from what it was read as. The edit's shape was the Worker's to check; the live page is the command's.
 */
export async function prepareAgentEdit(request: AgentEdit, context: EditContext, files: SiteFiles, read?: (hash: string) => string | undefined): Promise<PreparedEdit> {
  const refuse = (message: string): never => { throw new HttpError(400, message); };
  const unchanged = (value: { state: "unchanged"; message: string }): PreparedEdit => ({ unchanged: value });
  // The command an edit becomes is its table row's (edit_file: write_file).
  const queue = (input: Extract<PreparedEdit, { operation: AgentOperation }>["input"]): PreparedEdit => ({ operation: agentTools[request.tool].operation, input });
  switch (request.tool) {
    case "edit_file": {
      const { path, expectedHash, edits } = request.args;
      const file = await files.read(path);
      if (!file) return refuse(`${path} does not exist. Use write_file to create it.`);
      // Its exact words are its part (ticket 10): it lands on the text now while they are there, whatever
      // else changed since its read; once they changed meanwhile, the clash carries them as they are now.
      const edited = applyReplacements(file.content, edits);
      if (!edited.ok) return file.hash === expectedHash ? refuse(edited.error) : editClash(file, edits, read?.(expectedHash));
      if (edited.text === file.content) return unchanged({ state: "unchanged", message: "The edits change nothing." });
      const big = contentProblem(edited.text);
      if (big) return refuse(big);
      return queue({ path, content: edited.text, expectedHash: file.hash });
    }
    case "write_file": {
      const { path, content, expectedHash } = request.args;
      const file = await files.read(path);
      if (file) {
        if (!expectedHash)
          return refuse(`${path} exists (hash ${file.hash}). Pass that as expectedHash to replace it, or use edit_file.`);
        checkHash(expectedHash, file.hash, path);
        if (file.content === content) return unchanged({ state: "unchanged", message: "The file already has this text." });
      } else {
        if (expectedHash) return refuse(`${path} does not exist; omit expectedHash to create it.`);
        if (await files.isFolder(path)) return refuse(`${path} is a folder.`);
        for (const parent of foldersAbove(path))
          if (await files.read(parent).catch(() => undefined)) return refuse(fileInTheWay(parent));
      }
      return queue({ path, content, expectedHash: file?.hash ?? null });
    }
    case "move_file": {
      const { path, to, keepOldUrl } = request.args;
      return queue({
        path,
        args: { to, ...(keepOldUrl !== undefined ? { keepOldUrl } : {}) },
      });
    }
    case "delete_file":
      return queue({ path: request.args.path });
    case "create_page": {
      const { title, parent, slug } = request.args;
      if (!context.pages) return refuse(noHomePage);
      const under = parent ? parent.replace(/^\/?/, "/").replace(/\/?$/, "/") : "/";
      if (under !== "/" && !context.pages.some((page) => page.route === under))
        return refuse(`No page at ${under}. get_site lists the pages; a page at an .html URL has no subpages.`);
      return queue({
        // The parent's folder: one new page there waits at a time.
        path: under === "/" ? "." : under.slice(1, -1),
        args: { parent: under, title, ...(slug ? { slug } : {}) },
      });
    }
    case "set_page_details": {
      const { page: ref, title, description } = request.args;
      const page = findPage(context, ref);
      return queue({
        path: page.file,
        args: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
        },
      });
    }
    case "open_page": {
      const { page: ref } = request.args;
      const page = context.pages && findPageRef(context.pages, ref);
      const path = page?.file ?? ref;
      // Found by name here, so its path is checked here: opening may show the media records, never the workflows.
      const problem = writablePathProblem(path, { readOnly: true });
      if (problem) return refuse(problem);
      return queue({ path });
    }
    case "inspect_preview": {
      const { page: ref, element, selector, limit } = request.args;
      const route = ref ?? context.site?.openRoute;
      if (!route) return refuse("The editor shows no page now. Give page.");
      const page = findPage(context, route);
      return queue({
        path: page.file,
        args: {
          ...(element !== undefined ? { element } : {}),
          ...(selector !== undefined ? { selector } : {}),
          ...(limit !== undefined ? { limit } : {}),
        },
      });
    }
    // The page's sections, components and hash are the live page's to check (src/agent-site.ts).
    case "make_component": {
      const { page: ref, element, tag, fixed, expectedHash } = request.args;
      return queue({ path: findPage(context, ref).file, expectedHash, args: { element, tag, ...(fixed !== undefined ? { fixed } : {}) } });
    }
    case "add_section": {
      const { page: ref, component, expectedHash, before, after } = request.args;
      return queue({ path: findPage(context, ref).file, expectedHash, args: { component, ...(before ? { before } : {}), ...(after ? { after } : {}) } });
    }
    case "move_section": {
      const { page: ref, section, expectedHash, before, after } = request.args;
      return queue({ path: findPage(context, ref).file, expectedHash, args: { section, ...(before ? { before } : {}), ...(after ? { after } : {}) } });
    }
    case "remove_section": {
      const { page: ref, section, expectedHash } = request.args;
      return queue({ path: findPage(context, ref).file, expectedHash, args: { section } });
    }
  }
}
