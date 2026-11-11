// GitHub's history of a file typed on together (ticket am-59), as src/live-text.ts reads it (`LiveTextPorts.github`):
// the branch's newest version of the file, and the versions before one, newest first, each with the live copies its
// commit names (shared/live-copy.ts). Every version enters the room's copy on top of the one right before it, so all
// tabs write the same items whichever commit each heard first. Loaded with live text, never at boot.

import type { DraftScope } from "./drafts";
import type { LiveGithub, LiveVersion } from "./live-text";
import type { FileRevision, HistoryCommit, HistoryPage, Snapshot } from "../shared/types";

/** The reads it needs: the editor's GitHub API (src/github-reads.ts `api`) and the repository on show. */
export interface GithubReads {
  api<T>(path: string, params?: Record<string, string>): Promise<T>;
  repo(): string | undefined;
}

/** History pages one walk reads at most: src/live-text.ts takes no more than 20 versions back. */
const MAX_PAGES = 3;
/** A file's version at a commit never changes: kept, up to this many, so each commit's version is read once. */
const CACHE_LIMIT = 200;
const revisions = new Map<string, Promise<FileRevision>>();

/** The file `path` at `commit`, read once per commit (a failed read is not kept). */
function revision(reads: GithubReads, repo: string, commit: string, path: string) {
  const key = `${repo}\n${commit}\n${path}`;
  let read = revisions.get(key);
  if (read) { revisions.delete(key); revisions.set(key, read); return read; }
  read = reads.api<FileRevision>("file-at", { repo, commit, path });
  read.catch(() => { if (revisions.get(key) === read) revisions.delete(key); });
  revisions.set(key, read);
  while (revisions.size > CACHE_LIMIT) revisions.delete(revisions.keys().next().value!);
  return read;
}

const versionAt = async (reads: GithubReads, repo: string, commit: HistoryCommit, path: string): Promise<LiveVersion> => {
  const file = await revision(reads, repo, commit.sha, path);
  return { sha: file.sha, text: file.content, ...(commit.copies?.length ? { copies: commit.copies } : {}) };
};

/** The commits that changed `path` on the branch, newest first, all read from one head. */
async function* commits(reads: GithubReads, repo: string, scope: DraftScope, path: string) {
  let head: string | undefined;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const read = await reads.api<HistoryPage>("history", { repo, branch: scope.branch, path, page: String(page), ...(head ? { head } : {}) });
    head = read.head;
    yield* read.commits;
    if (!read.nextPage) return;
  }
}

/** GitHub's history of `path` on `scope`'s branch. */
export function githubHistory(reads: GithubReads, scope: DraftScope, path: string) {
  const repoNow = () => {
    const repo = reads.repo();
    if (!repo || repo !== scope.repo) throw new Error("Another repository is on show.");
    return repo;
  };
  return {
    /** The branch's newest version of the file, read now; none when the file is not there. */
    async newest(): Promise<LiveVersion | undefined> {
      const repo = repoNow();
      for await (const commit of commits(reads, repo, scope, path)) return await versionAt(reads, repo, commit, path);
      return undefined;
    },
    /** The versions before blob `sha`, newest first, from the commit that made its latest occurrence back. Nothing
     * when GitHub's history does not hold it; it ends at the file's first version (an older commit without the file). */
    async *before(sha: string): AsyncGenerator<LiveVersion> {
      const repo = repoNow();
      let found = false, last: string | undefined;
      for await (const commit of commits(reads, repo, scope, path)) {
        let version: LiveVersion;
        try { version = await versionAt(reads, repo, commit, path); }
        catch (error) { if ((error as { status?: number }).status === 404) return; throw error; }
        if (!found) { found = version.sha === sha; last = version.sha; continue; }
        // A commit that left the file as it was (a merge): the same version again.
        if (version.sha === last) continue;
        last = version.sha;
        yield version;
      }
    },
  };
}

/** What the editor's host lends live text for GitHub (src/page-builder-host.ts): its reads, the workspace's snapshot of
 * the branch, and GitHub's text of a file as the workspace read it. */
export interface GithubPort extends GithubReads {
  snapshot(): Snapshot | undefined;
  base(path: string): string | undefined;
}

/** `LiveTextPorts.github` from the host's port: the file's version as the workspace read it (its blob sha in the
 * snapshot and its text), none when the workspace on show is another or does not hold it, and GitHub's history of it. */
export function liveGithub(port: GithubPort) {
  return (scope: DraftScope, path: string): LiveGithub | undefined => {
    const snapshot = port.snapshot(), text = port.base(path);
    if (port.repo() !== scope.repo || snapshot?.branch !== scope.branch || text === undefined) return undefined;
    const entry = snapshot.tree?.find(item => item.path === path && item.type === "blob");
    return entry && { sha: entry.sha, text, ...githubHistory(port, scope, path) };
  };
}
