import type { AgentElement } from "./agent";

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { login: string; type: string };
  /** The GitHub App installation that grants access, whose settings page adds and removes repositories. */
  installation_id?: number;
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

/**
 * The commit an empty repository (no commits, no branches yet) is shown at:
 * git's null object name. The editor opens such a repository on its default
 * branch with no files, so drafts can be written; the first Save to GitHub
 * creates the branch (worker/publish.ts `startRepository`).
 */
export const EMPTY_COMMIT = "0".repeat(40);

export interface Snapshot extends Directory {
  commit: string;
  branch: string;
  /** The repository has no commits yet: `commit` is EMPTY_COMMIT and there are no entries. */
  empty?: true;
  /**
   * Every entry in the commit, with full paths, when GitHub returned the
   * recursive tree completely. Absent for very large repositories; callers
   * then walk directories with `/api/tree`.
   */
  tree?: TreeEntry[];
}

/**
 * Most blobs one `/api/files` request reads. Each is its own GitHub fetch, and
 * a Worker request may make only 50 (Cloudflare's free plan), with a few spent
 * on the session and repository checks.
 */
export const MAX_BATCH_FILES = 40;

/** `/api/files`: blob contents keyed by SHA, fetched in one round trip. */
export interface FilesResult {
  files: Record<string, string>;
}

export interface SessionInfo {
  configured: boolean;
  user: { login: string; avatar_url: string } | null;
  /** Every GitHub account signed in on this browser, the current one included. */
  accounts?: { login: string; avatar_url: string; current: boolean }[];
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
  /** The branch's head as the editor last saw it; see GitHub.head (worker/github.ts). */
  head?: string;
  files: PublishFile[];
}
/** An account or organisation the editor's GitHub App is installed on, that the user can reach (`GET /api/owners`). */
export interface OwnerInstallation {
  id: number;
  login: string;
  type: "User" | "Organization";
}

/** A repository the editor made on the signed-in account or one of their organisations (`POST /api/repositories`). */
export interface CreateRepositoryRequest {
  name: string;
  /** The organisation to create it in; absent for the signed-in account. */
  owner?: string;
  private: boolean;
  description?: string;
}

/** A file of a starting point: text, or (an image) base64 bytes. */
export type StarterFile =
  | { path: string; content: string }
  | { path: string; base64: string; size: number };

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
  /** The author's GitHub avatar, when the commit is linked to an account. */
  avatar?: string;
  date: string;
  url: string;
}
export interface HistoryPage {
  head: string;
  commits: HistoryCommit[];
  nextPage: number | null;
}
/** A file a commit changed, as git marks it: added, modified, deleted, renamed. */
export interface CommitFile {
  path: string;
  kind: "A" | "M" | "D" | "R";
  /** A renamed file's earlier path. */
  from?: string;
}
export interface CommitFiles {
  files: CommitFile[];
  /** GitHub lists up to 300 files of a commit. */
  truncated: boolean;
}
/** A file's text as it was at a commit, for History's view of a version. */
export interface FileRevision {
  sha: string;
  content: string;
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
  /**
   * The browser drafts of this repository and branch: a changed file's text
   * content hash (`textHash`), a deletion, or a rename (`movedFrom`). The
   * text goes apart, by its hash (POST /api/agent/drafts); `content` inline
   * is what older tabs sent. A text past AGENT_TEXT_LIMIT has no hash but
   * its `size`; a binary (or not loaded) file's is `binary`.
   */
  drafts: {
    path: string;
    baseSha: string | null;
    updatedAt: number;
    hash?: string;
    content?: string;
    size?: number;
    binary?: boolean;
    deleted?: boolean;
    movedFrom?: string;
  }[];
  /**
   * A native project's pages by route (shared/native-routes.ts: a page's
   * URL is its file's path, `about/index.html` is `/about/`), with the title
   * and description its `<head>` gives, and the route of the row it sits
   * under in the Pages tab (`parent`). A folder of pages with no page of its
   * own has no `file`. Absent for other projects.
   */
  pages?: { route: string; file?: string; title?: string; description?: string; parent?: string; isNew?: boolean }[];
  /** The native site as the editor tab sees it (src/agent-site.ts). */
  site?: AgentSiteContext;
}

/** A section of a page, or of a container that holds sections, in a page outline. */
export interface AgentOutlineSection {
  /** Element-child indexes from the page root, dot-joined ("1.0"). */
  id: string;
  tag: string;
  /** A section component instance (its template is one `<section>`). */
  component?: boolean;
  key?: string;
  heading?: string;
  /** The start of its text, when it has no heading. */
  text?: string;
  /** A component instance's slotted text by slot name. */
  slots?: Record<string, string>;
}
export interface AgentPageOutline {
  file: string;
  /** textHash of the page source the outline was read from. */
  hash: string;
  /** Elements that hold sections (or the `<main>` of a page with none yet), with their element-child count. */
  containers: { id: string; tag: string; children: number }[];
  sections: AgentOutlineSection[];
}
export interface AgentSiteContext {
  /** The file open in the editor and the page the preview shows. */
  openFile: string | null;
  openRoute: string | null;
  /** The element selected in the preview (get_selection gives all of it). */
  selection: AgentElement | null;
  components: { tag: string; file: string; css?: string; section: boolean; slots: string[] }[];
  /** The stylesheets the pages' heads link, in order, each with the files it `@import`s (in cascade order). */
  stylesheets: { file: string; imports: string[] }[];
  /** `.editor/config.json`, when there is one, with the site's name and address. */
  settings: { file: string; name?: string; url?: string } | null;
  outlines: AgentPageOutline[];
  /** Draft changes as the Save panel lists them. */
  changes: { kind: "A" | "M" | "R" | "D"; path: string; from?: string }[];
}
