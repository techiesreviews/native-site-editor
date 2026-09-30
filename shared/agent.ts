import type { EditorContext } from "./types";

/**
 * What an agent can ask the open editor tab to do. The Worker validates and
 * queues each one; the browser applies it through the same code the
 * editor's own controls use, so every change is an ordinary draft (Undo,
 * Discard changes, Save to GitHub by the user).
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
  | "move_section"
  | "remove_section"
  | "move_file"
  | "delete_file"
  | "open_page"
  | "inspect_preview";

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
  /** add_section: the section's tag at `section`, as the Worker saw it. */
  tag?: string;
  /** move_file */
  to?: string;
  keepOldUrl?: boolean;
  /** inspect_preview: the element by outline id, or a CSS selector, and how many to report. */
  element?: string;
  selector?: string;
  limit?: number;
}

/** The most an inspect_preview report may be, as JSON. */
export const INSPECTION_LIMIT = 24 * 1024;

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

export type AgentRequestState = "open" | "seen" | "done" | "answered" | "dismissed";

/**
 * Something the user asked agents to do about an element, from the edit
 * bar's Ask agent. The hub keeps them per session (worker/agent-requests.ts):
 * open until an agent fetches it (seen), then done or answered by its reply,
 * or dismissed by the user.
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
  /** The connections wait_for_requests returned it to. */
  returnedTo?: string[];
  reply?: { status: "done" | "answered"; message: string; at: number; requestIds?: string[] };
}

/** The most text a request holds, the source of its element, and how many wait at once. */
export const REQUEST_TEXT_LIMIT = 2000;
export const REQUEST_HTML_LIMIT = 4096;
export const OPEN_REQUESTS_LIMIT = 50;
