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
  | "open_page";

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
  /** What the browser reports back (the new page's file and URL, a file's new hash). */
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
}

/** The most text one file's draft holds for agents to read or write, in UTF-8 bytes. */
export const AGENT_TEXT_LIMIT = 1024 * 1024;
export const textBytes = (text: string) => new TextEncoder().encode(text).length;

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
