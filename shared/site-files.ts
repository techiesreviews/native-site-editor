// Repository files as the connected editor tab sees them, for the MCP site
// tools: GitHub at the revision the tab shows, overlaid with the tab's
// browser drafts (new, changed, renamed and deleted files). A file's text is
// the site runtime's text now when the tab holds it, so agents read what the
// preview shows.
import { touchesGithubConfig, GITHUB_CONFIG_REFUSED, touchesMediaRecords, MEDIA_RECORDS_REFUSED } from "./protected-paths";
import { AGENT_TEXT_LIMIT, TEXT_PATH, textBytes, textHash } from "./agent";
import { EMPTY_COMMIT, type EditorContext, type Repository, type TreeEntry } from "./types";
import { HttpError } from "./http-error";
import { newDrafts } from "./site-overlay";

export interface SiteFileReader {
  commitTree(repo: Repository, commit: string): Promise<TreeEntry[]>;
  file(repo: Repository, sha: string): Promise<string>;
  prefetchTexts(repo: Repository, shas: string[]): Promise<void>;
  hasText(repo: Repository, sha: string): boolean;
}

type Draft = EditorContext["drafts"][number];

/** Blobs read from GitHub at a time by an export (most come from the cache). */
const exportConcurrency = 4;
/**
 * Saved files an export reads one request each, when the batched read did
 * not give their text; the rest are listed as omitted, so one call stays
 * within the Worker's subrequests.
 */
const exportSingleReads = 16;

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
    private github: SiteFileReader,
    private repo: Repository,
    private context: EditorContext,
    /** A draft's text the tab shared, by its hash. */
    private text?: (hash: string) => Promise<string | undefined>,
    /**
     * The tab's text of `path` now (the site runtime's, src/native-site-runtime.ts): exactly what
     * the preview shows, unsaved typing included. Given, it alone answers a draft's text, and a
     * saved file's whenever it holds one; without it (an edit held away from its workspace) the
     * texts the tab shared answer.
     */
    private now?: (path: string) => string | undefined,
  ) {}

  /** The tab's text now, unless the draft is binary. */
  private heldText(path: string, draft: Draft | undefined) {
    return draft?.binary ? undefined : this.now?.(path);
  }

  private entries() {
    // An empty repository has no files on GitHub yet, only the tab's drafts.
    return (this.tree ??= this.context.commit === EMPTY_COMMIT ? Promise.resolve([]) : this.github.commitTree(this.repo, this.context.commit));
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
    for (const draft of newDrafts(this.context.drafts)) out.set(draft.path, draft.movedFrom ? "R" : "A");
    return [...out]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([path, draft]) => (draft ? { path, draft } : { path }));
  }

  /** The file's current text, or undefined when there is no such file. */
  async read(path: string): Promise<SiteFile | undefined> {
    const draft = this.draft(path);
    if (draft?.deleted) return undefined;
    if (draft) {
      // Without the tab's text now, the text it shared: inline (older tabs), or stored apart by its hash.
      const content = this.now ? readableText(path, this.heldText(path, draft)) : draft.content ?? (draft.hash ? await this.text?.(draft.hash) : undefined);
      if (content === undefined) throw draftProblem(path, draft);
      return {
        path,
        source: "draft",
        content,
        hash: (!this.now && draft.hash) || (await textHash(content)),
        baseSha: draft.baseSha,
      };
    }
    const entry = (await this.entries()).find((item) => item.path === path);
    if (!entry) return undefined;
    if (entry.type !== "blob")
      throw new HttpError(400, `${path} is a ${entry.type === "tree" ? "folder" : "submodule"}, not a file.`);
    const saved = await this.github.file(this.repo, entry.sha);
    // Typing the tab holds but has not drafted yet is the tab's text, not GitHub's.
    const content = readableText(path, this.heldText(path, draft)) ?? saved;
    return { path, source: content === saved ? "github" : "draft", content, hash: await textHash(content), baseSha: entry.sha };
  }

  /**
   * Every file under `prefix` as `read` gives it, in one pass: text files
   * with their content and hash (drafts applied), binary files by path, blob
   * and size only. Text is included up to `budget` characters in all; the
   * files past it are listed in `omitted`. Saved texts are read from GitHub in
   * a few batched queries, and only the ones those do not give one by one.
   */
  async export(prefix = "", budget = 4 * 1024 * 1024): Promise<SiteExport> {
    const entries = new Map((await this.entries()).map((entry) => [entry.path, entry]));
    const out: SiteExport = { files: [], binaries: [], unreadable: [], omitted: [] };
    const texts: { path: string; draft?: "A" | "M" | "R" }[] = [];
    for (const item of await this.paths()) {
      if (!item.path.startsWith(prefix)) continue;
      const draft = this.draft(item.path);
      const entry = entries.get(item.path);
      if (draft ? draft.binary : entry?.type !== "blob" || !TEXT_PATH.test(item.path))
        out.binaries.push({
          path: item.path,
          sha: draft ? null : (entry?.sha ?? null),
          ...(draft ? (draft.size !== undefined ? { size: draft.size } : {}) : entry?.size !== undefined ? { size: entry.size } : {}),
          ...(item.draft ? { draft: item.draft } : {}),
        });
      else texts.push(item);
    }
    // Saved texts that fit are read from GitHub in a few batched queries first.
    let planned = 0;
    const wanted: string[] = [];
    for (const item of texts) {
      const entry = entries.get(item.path);
      if (this.draft(item.path) || !entry || entry.size === undefined || entry.size > AGENT_TEXT_LIMIT) continue;
      if (planned + entry.size > budget) break;
      planned += entry.size;
      wanted.push(entry.sha);
    }
    await this.github.prefetchTexts(this.repo, wanted);
    let used = 0,
      next = 0,
      singles = 0;
    const read: (SiteFile & { draft?: "A" | "M" | "R" })[] = [];
    await Promise.all(
      Array.from({ length: Math.min(exportConcurrency, texts.length) }, async () => {
        while (next < texts.length) {
          const item = texts[next++];
          const draft = this.draft(item.path);
          const size = draft ? draft.size : entries.get(item.path)?.size;
          if (!draft && size !== undefined && size > AGENT_TEXT_LIMIT) {
            out.unreadable.push({ path: item.path, reason: `Larger than the ${AGENT_TEXT_LIMIT / 1024 / 1024} MB agents can read.` });
            continue;
          }
          if (size !== undefined && used + size > budget) {
            out.omitted.push(item.path);
            continue;
          }
          const entry = entries.get(item.path);
          if (!draft && entry && !this.github.hasText(this.repo, entry.sha) && ++singles > exportSingleReads) {
            out.omitted.push(item.path);
            continue;
          }
          try {
            const file = await this.read(item.path);
            if (!file) continue;
            if (used + file.content.length > budget) {
              out.omitted.push(item.path);
              continue;
            }
            used += file.content.length;
            read.push(item.draft ? { ...file, draft: item.draft } : file);
          } catch (error) {
            // GitHub limiting requests ends the export; one unreadable file does not.
            if (!(error instanceof HttpError) || error.status === 429 || error.status >= 500) throw error;
            out.unreadable.push({ path: item.path, reason: error.message });
          }
        }
      }),
    );
    const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    out.files = read.sort(byPath);
    out.omitted.sort();
    out.unreadable.sort(byPath);
    return out;
  }

  /**
   * The texts of those `paths` that are readable text files, drafts applied;
   * missing, binary and too large ones are left out. Saved texts are read in
   * batched queries first, and only a few one by one: `budget.singles` is
   * shared by calls that pass the same budget.
   */
  async texts(paths: Iterable<string>, budget = { singles: exportSingleReads }): Promise<Map<string, string>> {
    const entries = new Map((await this.entries()).map((entry) => [entry.path, entry]));
    const out = new Map<string, string>();
    const saved = [];
    for (const path of new Set(paths)) {
      const draft = this.draft(path);
      const entry = entries.get(path);
      if (draft ? draft.deleted || draft.binary || (draft.size ?? 0) > AGENT_TEXT_LIMIT : entry?.type !== "blob" || (entry.size ?? 0) > AGENT_TEXT_LIMIT) continue;
      const now = this.heldText(path, draft);
      if (now !== undefined) { if (textBytes(now) <= AGENT_TEXT_LIMIT) out.set(path, now); }
      else if (draft) out.set(path, (await this.read(path))!.content);
      else saved.push({ path, sha: entry!.sha });
    }
    await this.github.prefetchTexts(this.repo, saved.map(({ sha }) => sha));
    for (const { path, sha } of saved) {
      if (!this.github.hasText(this.repo, sha) && --budget.singles < 0)
        throw new HttpError(503, "Too many files to read one by one in one call.");
      out.set(path, await this.github.file(this.repo, sha));
    }
    return out;
  }

  /** Whether `path` is a folder (something is inside it). */
  async isFolder(path: string) {
    const prefix = `${path}/`;
    return (await this.paths()).some((item) => item.path.startsWith(prefix));
  }
}

export interface SiteExport {
  files: (SiteFile & { draft?: "A" | "M" | "R" })[];
  /** Files that are not text: by blob (null for an unsaved one) and size. */
  binaries: { path: string; sha: string | null; size?: number; draft?: "A" | "M" | "R" }[];
  unreadable: { path: string; reason: string }[];
  /** Text files past the export's size budget. */
  omitted: string[];
}

/** The tab's text, refused when it is more than agents can read. */
function readableText(path: string, text: string | undefined) {
  if (text === undefined || textBytes(text) <= AGENT_TEXT_LIMIT) return text;
  throw new HttpError(413, `${path} is ${Math.ceil(textBytes(text) / 1024)} KB in the editor, larger than the ${AGENT_TEXT_LIMIT / 1024 / 1024} MB agents can read or write. Ask the user to save it first.`);
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

/** Paths agents may write; read-only opening also permits the media records. */
export function writablePathProblem(path: string, { readOnly = false }: { readOnly?: boolean } = {}): string | undefined {
  if (touchesGithubConfig(path)) return GITHUB_CONFIG_REFUSED;
  if (!readOnly && touchesMediaRecords(path)) return MEDIA_RECORDS_REFUSED;
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
  return undefined;
}
