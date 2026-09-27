// Repository files as the connected editor tab sees them, for the MCP site
// tools: GitHub at the revision the tab shows, overlaid with the tab's
// browser drafts (new, changed, renamed and deleted files).
import { AGENT_TEXT_LIMIT, textHash } from "../shared/agent";
import type { EditorContext, Repository, TreeEntry } from "../shared/types";
import { HttpError, type GitHub } from "./github";

type Draft = EditorContext["drafts"][number];

export interface SiteFile {
  path: string;
  /** Where the text is from: the tab's draft, or GitHub at the context's commit. */
  source: "draft" | "github";
  content: string;
  hash: string;
  /** The GitHub blob, when the file is on GitHub at this path. */
  baseSha: string | null;
}

export class SiteFiles {
  private tree?: Promise<TreeEntry[]>;
  constructor(
    private github: GitHub,
    private repo: Repository,
    private context: EditorContext,
    /** A draft's text the tab shared, by its hash. */
    private text?: (hash: string) => Promise<string | undefined>,
  ) {}

  private entries() {
    return (this.tree ??= this.github.commitTree(this.repo, this.context.commit));
  }
  draft(path: string): Draft | undefined {
    return this.context.drafts.find((draft) => draft.path === path);
  }

  /** Every file path, drafts applied, sorted. */
  async paths(): Promise<{ path: string; draft?: "A" | "M" | "R" }[]> {
    const drafts = new Map(this.context.drafts.map((draft) => [draft.path, draft]));
    const out = new Map<string, "A" | "M" | "R" | undefined>();
    for (const entry of await this.entries()) {
      if (entry.type === "tree") continue;
      const draft = drafts.get(entry.path);
      if (draft?.deleted) continue;
      out.set(entry.path, draft && draft.baseSha !== null ? "M" : undefined);
    }
    for (const draft of this.context.drafts)
      if (!draft.deleted && draft.baseSha === null)
        out.set(draft.path, draft.movedFrom ? "R" : "A");
    return [...out]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([path, draft]) => (draft ? { path, draft } : { path }));
  }

  /** The file's current text, or undefined when there is no such file. */
  async read(path: string): Promise<SiteFile | undefined> {
    const draft = this.draft(path);
    if (draft?.deleted) return undefined;
    if (draft) {
      // The text is inline (older tabs), or stored apart by its hash.
      const content = draft.content ?? (draft.hash ? await this.text?.(draft.hash) : undefined);
      if (content === undefined) throw draftProblem(path, draft);
      return {
        path,
        source: "draft",
        content,
        hash: draft.hash ?? (await textHash(content)),
        baseSha: draft.baseSha,
      };
    }
    const entry = (await this.entries()).find((item) => item.path === path);
    if (!entry) return undefined;
    if (entry.type !== "blob")
      throw new HttpError(400, `${path} is a ${entry.type === "tree" ? "folder" : "submodule"}, not a file.`);
    const content = await this.github.file(this.repo, entry.sha);
    return { path, source: "github", content, hash: await textHash(content), baseSha: entry.sha };
  }

  /** Whether `path` is a folder (something is inside it). */
  async isFolder(path: string) {
    const prefix = `${path}/`;
    return (await this.paths()).some((item) => item.path.startsWith(prefix));
  }
}

/** Why agents cannot read a draft: binary, too large, or its text not here yet. */
function draftProblem(path: string, draft: Draft) {
  if (draft.hash)
    return new HttpError(409, `The editor tab is still sharing ${path}'s unsaved draft. Try again in a moment.`);
  if (draft.binary)
    return new HttpError(415, `${path} is a binary file (or one the editor has not loaded) in the user's unsaved changes, so agents cannot read it. Ask the user to save it first.`);
  if (draft.size !== undefined)
    return new HttpError(413, `${path}'s unsaved draft is ${Math.ceil(draft.size / 1024)} KB, larger than the ${AGENT_TEXT_LIMIT / 1024 / 1024} MB agents can read or write. Ask the user to save it first.`);
  return new HttpError(409, `The editor tab did not share ${path}'s unsaved draft. Reload the editor, or ask the user to save it first.`);
}

/** Paths agents may write: text files outside Git internals and workflows. */
export function writablePathProblem(path: string): string | undefined {
  if (
    !path ||
    path.length > 1024 ||
    path
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.toLowerCase() === ".git",
      ) ||
    /[\\\u0000-\u001f]/.test(path)
  )
    return "Invalid path. Use a repository path such as about/index.html.";
  if (path.startsWith(".github/workflows/"))
    return "Workflows cannot be changed through the editor.";
  return undefined;
}
