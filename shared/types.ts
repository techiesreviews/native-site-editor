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

export interface Detection {
  status: "detected" | "ambiguous" | "not-detected";
  message: string;
  version?: string;
}

export interface Directory {
  entries: TreeEntry[];
  detection: Detection;
}

export interface Snapshot extends Directory {
  commit: string;
  branch: string;
}

export interface SessionInfo {
  configured: boolean;
  user: { login: string; avatar_url: string } | null;
  installUrl: string | null;
}

export interface PublishFile {
  path: string;
  baseSha: string | null;
  content: string;
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

export type EditorIntegrationState =
  | "current"
  | "outdated"
  | "incomplete"
  | "custom";

export interface EditorIntegration {
  state: EditorIntegrationState;
  message: string;
  files: {
    path: string;
    status: "current" | "outdated" | "missing" | "custom" | "malformed";
    sha?: string;
  }[];
  canUpdate: boolean;
}

export interface EditorIntegrationUpdateResult {
  branch: string;
  commit: string;
  compareUrl: string;
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
}
