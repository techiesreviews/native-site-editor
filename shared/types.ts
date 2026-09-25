export interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { login: string; type: string };
}

export interface TreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

export interface Directory {
  entries: TreeEntry[];
}

export interface Snapshot extends Directory {
  commit: string;
  branch: string;
  /**
   * Every entry in the commit, with full paths, when GitHub returned the
   * recursive tree completely. Absent for very large repositories; callers
   * then walk directories with `/api/tree`.
   */
  tree?: TreeEntry[];
}

/** `/api/files`: blob contents keyed by SHA, fetched in one round trip. */
export interface FilesResult {
  files: Record<string, string>;
}

export interface SessionInfo {
  configured: boolean;
  user: { login: string; avatar_url: string } | null;
  installUrl: string | null;
  ownerSetupUrl?: string | null;
  /**
   * Selected repositories, included for signed-in users so the workspace can
   * open without a second round trip. Null when the listing failed; the
   * browser then requests `/api/repositories` itself.
   */
  repositories?: Repository[] | null;
}

/**
 * One path in a commit. `baseSha` is the blob the change began from (null for
 * a path the branch should not have yet). A deletion (`delete: true`) removes
 * the path and needs its `baseSha`; a new path may name an existing blob in
 * `sha` (a file renamed, moved or copied unchanged, which may be binary)
 * instead of sending `content`. `mode` keeps an executable file executable.
 */
export interface PublishFile {
  path: string;
  baseSha: string | null;
  content: string;
  delete?: boolean;
  sha?: string;
  mode?: "100644" | "100755";
  /** A rename's old path, for the commit message only. */
  movedFrom?: string;
}
export interface PublishRequest {
  branch: string;
  files: PublishFile[];
}
export interface PublishResult {
  commit: string;
  branch: string;
  url: string;
  files: { path: string; sha: string }[];
  /** Paths the commit removed (or that GitHub no longer had). */
  deleted?: string[];
  unchanged: boolean;
}

export interface HistoryCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}
export interface HistoryPage {
  head: string;
  commits: HistoryCommit[];
  nextPage: number | null;
}
export interface RestoreRequest {
  branch: string;
  path: string;
  target: string;
  expectedHead: string;
}
export interface RestoreResult {
  commit: string;
  branch: string;
  url: string;
  unchanged: boolean;
}

export interface EditorContext {
  repository: { id: number; fullName: string };
  branch: string;
  commit: string;
  file: {
    path: string;
    baseSha: string | null;
    language: string;
    readOnly: boolean;
    original: string;
    content: string;
    selection: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    } | null;
    diagnostics: {
      severity: string;
      message: string;
      line: number;
      column: number;
    }[];
  } | null;
  drafts: { path: string; baseSha: string | null; updatedAt: number }[];
  /**
   * A native project's pages by route (shared/native-routes.ts: where a file
   * is under `src/pages/` is its URL, unless native.json maps the route), with
   * the title and description native.json gives the route, else the page's
   * leading `<!-- title: … -->` comment. Absent for other projects.
   */
  pages?: { route: string; file: string; title?: string; description?: string }[];
}
