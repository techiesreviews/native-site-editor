import type { AddingSettings } from "./media-records";
import type { EditorContext } from "./types";

/**
 * What an agent can ask the open editor tab to do. The Worker validates and
 * queues each one; the browser applies it through the same code the
 * editor's own controls use, so every change is an ordinary draft (Undo,
 * Discard changes, Publish by the user).
 *
 * `update_active_draft` and `create_file_draft` are the Astro-era active-file
 * operations; the code editor still applies them.
 */
export type AgentOperation =
  | "update_active_draft"
  | "create_file_draft"
  | "write_file"
  | "create_page"
  | "set_page_details"
  | "add_section"
  | "make_component"
  | "move_section"
  | "remove_section"
  | "move_file"
  | "delete_file"
  | "open_page"
  | "inspect_preview"
  | "list_media"
  | "preview_media"
  | "place_media"
  | "describe_media"
  | "change_collection"
  | "adding_settings";

export interface AgentCommand {
  id: string;
  operation: AgentOperation;
  /** The file the operation is about (`create_page`: the parent page's route folder). */
  path: string;
  branch: string;
  commit: string;
  /**
   * The content hash (`textHash`) the file must have when the browser
   * applies the change; `null` for a file that must not exist yet.
   */
  expectedHash?: string | null;
  /** New text (`write_file` and the Astro-era operations); empty otherwise. */
  content: string;
  /** The hub keeps a change's text apart, by this hash (worker/agent-store.ts), and fills it in for the tab. */
  contentHash?: string;
  /** Operation arguments, validated by the Worker. */
  args?: AgentCommandArgs;
  /** The connection that queued it; only it can read its status. */
  grantId?: string;
  repoId?: number;
  /** The editor tab applying it. */
  claimedBy?: string;
  state: "pending" | "applied" | "conflict" | "failed";
  message?: string;
  /** What the browser reports back (the new page's file and URL, a file's new hash; inspect_preview's `report`, as JSON). */
  result?: Record<string, string | number | boolean | null>;
  createdAt: number;
}

export interface AgentCommandArgs {
  /** create_page */
  parent?: string;
  title?: string;
  slug?: string;
  /** set_page_details: the fields to set; an empty string removes one. */
  description?: string;
  /** add_section: the section component's tag. */
  component?: string;
  /** Section ids (dot-joined element-child indexes, as in the page outline). */
  section?: string;
  /** add_section / move_section: the containing element's id and the gap index among its element children. */
  container?: string;
  index?: number;
  /** add_section: the section's tag at `section`, as the Worker saw it; make_component: the new component's tag. */
  tag?: string;
  /** make_component: slot names to keep fixed in the template ("" for the unnamed slot). */
  fixed?: string[];
  /** move_file */
  to?: string;
  keepOldUrl?: boolean;
  /** make_component / inspect_preview: the element by outline id; inspect_preview also takes a CSS selector and count. */
  element?: string;
  selector?: string;
  limit?: number;
  file?: string;
  text?: string;
  decorative?: boolean;
  page?: string;
  action?: "new" | "add" | "take-out" | "rename" | "delete";
  name?: string;
  files?: string[];
  image?: AddingSettings["image"];
  video?: AddingSettings["video"];
  audio?: AddingSettings["audio"];
  keepOriginal?: boolean;
  reset?: boolean;
  folder?: string;
  offset?: number;
}

/** The most an inspect_preview report may be, as JSON. */
export const INSPECTION_LIMIT = 24 * 1024;

/** Maximum JSON report and base64 preview sizes sent by the editor tab. */
export const MEDIA_LIST_LIMIT = 40 * 1024;
export const MEDIA_PREVIEW_LIMIT = 96 * 1024;
export const MEDIA_PREVIEW_SIZE = 512;

/** The most JSON the hub keeps of a command's result: reads that report back get room, other results are a few fields. */
export function agentResultLimit(operation: AgentOperation) {
  if (operation === "inspect_preview") return 2 * INSPECTION_LIMIT;
  // Reports are JSON strings inside JSON: quotes and backslashes need slack.
  if (operation === "list_media") return 2 * MEDIA_LIST_LIMIT + 2048;
  if (operation === "preview_media") return MEDIA_PREVIEW_LIMIT + 2048;
  return 2048;
}
/** The largest result any operation may send; the tab's acknowledgement carries it. */
export const AGENT_RESULT_MAX = Math.max(...(["inspect_preview", "list_media", "preview_media"] as const).map(agentResultLimit));

export const isPreviewablePicture = (path: string) => /\.(?:jpe?g|png|webp|gif|avif|svg)$/i.test(path);
export function mediaKind(path: string): "image" | "video" | "audio" | "document" | "other" {
  if (/\.(?:jpe?g|png|webp|gif|avif|svg|ico|bmp|tiff?|heic|heif)$/i.test(path)) return "image";
  if (/\.(?:mp4|webm|mov|m4v|avi|mkv|ogv|mpeg|mpg)$/i.test(path)) return "video";
  if (/\.(?:mp3|wav|ogg|oga|m4a|aac|flac|opus|aiff?)$/i.test(path)) return "audio";
  if (/\.(?:pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|epub|csv)$/i.test(path)) return "document";
  return "other";
}
export function picturePreviewRefusal(path: string) {
  const kind = mediaKind(path), format = /\.([^./]+)$/.exec(path)?.[1].toUpperCase();
  const what = kind === "image" ? `in an image format the preview cannot show${format ? ` (${format})` : ""}`
    : kind === "other" ? "not a picture" : `a ${kind}${format ? ` (${format})` : ""}, not a picture`;
  return `${path} is ${what}; preview_media shows pictures only. list_media gives its description and uses.`;
}

/** The most text one file's draft holds for agents to read or write, in UTF-8 bytes. */
export const AGENT_TEXT_LIMIT = 1024 * 1024;
export const textBytes = (text: string) => new TextEncoder().encode(text).length;
/** Files a site keeps as text (pages, styles, scripts, data, SVG, host rules); the rest are read as bytes. */
export const TEXT_PATH = /\.(?:html?|css|m?js|json|md|txt|xml|svg|webmanifest)$|(?:^|\/)_(?:redirects|headers)$/i;

export async function textHash(content: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Applies exact text replacements: each `oldText` must occur exactly once in
 * the text as the earlier replacements left it (or `all` replaces every
 * occurrence). Returns the new text, or why it cannot.
 */
export function applyReplacements(
  text: string,
  replacements: { oldText: string; newText: string; all?: boolean }[],
): { ok: true; text: string } | { ok: false; error: string } {
  let out = text;
  for (const [index, { oldText, newText, all }] of replacements.entries()) {
    const which = replacements.length > 1 ? ` (replacement ${index + 1})` : "";
    if (!oldText) return { ok: false, error: `oldText is empty${which}.` };
    const first = out.indexOf(oldText);
    if (first < 0)
      return { ok: false, error: `oldText was not found${which}. Read the file again and copy the text exactly.` };
    if (all) {
      out = out.split(oldText).join(newText);
      continue;
    }
    if (out.indexOf(oldText, first + 1) >= 0)
      return { ok: false, error: `oldText occurs more than once${which}. Include more surrounding text, or set all.` };
    out = out.slice(0, first) + newText + out.slice(first + oldText.length);
  }
  return { ok: true, text: out };
}

/** Section and container ids in a page outline: element-child indexes joined with dots. */
export const outlineId = (node: number[]) => node.join(".");
export function parseOutlineId(id: string): number[] | undefined {
  if (!/^\d{1,4}(?:\.\d{1,4}){0,63}$/.test(id)) return undefined;
  return id.split(".").map(Number);
}

export type AgentContext = EditorContext;

// ---- Agent requests ----

/**
 * An element of the site as an agent is shown it: the one selected in the
 * preview, or the one a request is about. `id` is its element-child path in
 * `file` (a page's `<body>`, or a component's template); `selector` is unique
 * among the rendered page's elements, or, for an element in a component's
 * template, among the instance's (`host` is then the instance's own).
 */
export interface AgentElement {
  file: string;
  /** The page the preview showed it on. */
  route?: string;
  id: string;
  tag: string;
  text: string;
  selector?: string;
  host?: { tag: string; selector: string };
  /** Its source in `file`, clipped to REQUEST_HTML_LIMIT (`htmlClipped`). */
  html?: string;
  htmlClipped?: boolean;
  /** The source lines it spans in `file`, from 1. */
  lines?: { start: number; end: number };
  /**
   * The component it belongs to: the instance itself, content a page slots
   * into one (`slot`, "" for the default slot), or part of its template
   * (`slot` when it is a slot's fallback).
   */
  component?: { tag: string; in: "instance" | "slot" | "template"; slot?: string };
}

export type AgentRequestState = "open" | "seen" | "done" | "answered" | "question" | "dismissed";

/** How an agent replied: done (it changed the site), answered (nothing more is needed), or question (it needs the user's answer). */
export type AgentReplyStatus = "done" | "answered" | "question";

/** One message of a request's conversation: the user's words, or an agent's reply. */
export interface AgentRequestMessage {
  from: "user" | "agent";
  text: string;
  at: number;
  /** An agent's: how it replied, and the edits it made for it. */
  status?: AgentReplyStatus;
  requestIds?: string[];
}

/**
 * Something the user asked agents to do about an element, from the edit
 * bar's Ask agent. The hub keeps them per session (worker/agent-requests.ts):
 * open until an agent fetches it (seen), then done, answered or question by
 * its reply, or dismissed by the user. The user answers a question, which
 * opens it again for agents. `thread` is the conversation, `text` its first
 * message and `reply` the agent's latest (requests kept from before threads
 * have only those two).
 */
export interface AgentRequest {
  id: string;
  text: string;
  createdAt: number;
  repoId: number;
  repository: string;
  state: AgentRequestState;
  element: AgentElement;
  seenAt?: number;
  /** The connections wait_for_requests returned it to (since the user last answered). */
  returnedTo?: string[];
  reply?: { status: AgentReplyStatus; message: string; at: number; requestIds?: string[] };
  thread?: AgentRequestMessage[];
}

/**
 * The most text a request (and each answer) holds, the source of its
 * element, how many wait at once, and the messages and text its thread keeps.
 */
export const REQUEST_TEXT_LIMIT = 2000;
export const REQUEST_HTML_LIMIT = 4096;
export const OPEN_REQUESTS_LIMIT = 50;
export const THREAD_LIMIT = 20;
export const THREAD_TEXT_LIMIT = 8000;
/**
 * The most an agent's reply to a request holds, and its question, which the
 * request's pin shows whole on one line.
 */
export const REPLY_TEXT_LIMIT = 200;
export const QUESTION_TEXT_LIMIT = 60;

/** A request's conversation: its thread, or one made of its text and reply. */
export function requestThread(request: Pick<AgentRequest, "text" | "createdAt" | "reply" | "thread">): AgentRequestMessage[] {
  if (request.thread?.length) return request.thread;
  const thread: AgentRequestMessage[] = [{ from: "user", text: request.text, at: request.createdAt }];
  const reply = request.reply;
  if (reply) thread.push({ from: "agent", text: reply.message, at: reply.at, status: reply.status, ...(reply.requestIds ? { requestIds: reply.requestIds } : {}) });
  return thread;
}

/** Outside media cannot be brought in by agents, even through a raw file write. */
export const OUTSIDE_MEDIA_REFUSED = "Agents never upload, fetch or generate media; place a file already in Media (list_media lists them).";
export const isOutsideMediaAddress = (file: string) => /^(?:https?:|data:|blob:|\/\/)/i.test(file.trim());
export const isMediaUploadWrite = (path: string) => !TEXT_PATH.test(path) && mediaKind(path) !== "other";
export function agentMediaArgsProblem(operation: AgentOperation, args: AgentCommandArgs): string | undefined {
  if (operation === "place_media" || operation === "describe_media") {
    if (!args.file || isOutsideMediaAddress(args.file)) return OUTSIDE_MEDIA_REFUSED;
    if (operation === "place_media") {
      if (!args.element || !parseOutlineId(args.element)) return "Give an image element id from get_page or inspect_preview.";
      if (mediaKind(args.file) !== "image") return "Only pictures can be placed for now.";
    } else {
      if ((args.text !== undefined) === (args.decorative !== undefined)) return "Give exactly one of text or decorative.";
      if (args.text !== undefined && !args.text.trim()) return "Use decorative: true for a picture that adds nothing to the page.";
      if (args.element !== undefined && (!args.page || !parseOutlineId(args.element))) return "Give a page and an image element id.";
    }
  }
  if (operation === "adding_settings" && args.reset &&
    [args.image, args.video, args.audio, args.keepOriginal].some(value => value !== undefined)) return "Reset cannot be combined with adding choices.";
  if (operation === "change_collection") {
    if (!args.action || !["new", "add", "take-out", "rename", "delete"].includes(args.action)) return "Choose a collection action: new, add, take-out, rename or delete.";
    if (!args.name?.trim()) return "Enter a collection name.";
    if (args.action === "rename" && !args.to?.trim()) return "Rename needs to.";
    if (["add", "take-out"].includes(args.action) && !args.files?.length) return "Add and take-out need files.";
    if (args.files?.some(isOutsideMediaAddress)) return OUTSIDE_MEDIA_REFUSED;
  }
}
