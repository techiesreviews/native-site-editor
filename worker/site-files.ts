// Repository files as the connected editor tab sees them, for the MCP site
// tools: GitHub at the revision the tab shows, overlaid with the tab's
// browser drafts (new, changed, renamed and deleted files).
import { textHash } from "../shared/agent";
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
      if (draft.content === undefined)
        throw new HttpError(
          413,
          `${path} has a browser draft too large (or binary) to share with agents. Open it in the editor, or ask the user to save it first.`,
        );
      return {
        path,
        source: "draft",
        content: draft.content,
        hash: draft.hash ?? (await textHash(draft.content)),
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
    return "Invalid path. Use a repository path such as src/pages/about.html.";
  if (path.startsWith(".github/workflows/"))
    return "Workflows cannot be changed through the editor.";
  return undefined;
}
