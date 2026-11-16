// The shared host modules: what src/main.ts hands a host or controller whole, in place of
// one loose port per function. Each is one object in main.ts, made once and handed to every
// host that needs it; a host names the members it uses (a Pick) when it uses only some.
// A test fakes a module once, not each of its functions.

import type { Directory, Snapshot, TreeEntry } from "../shared/types";
import type { ApiReceipt } from "./boot-api-response";
import type { SavedDraft, DraftScope } from "./drafts";
import type { createSitePreview } from "./site-preview";
import type { createSiteTextIndex } from "./site-text-index";
import type { SessionStamp, WorkspaceScope, WorkspaceSession } from "./workspace-session";

/** What the editor says: #status, the notice line and the screen reader's words (src/github-reads.ts, src/announce.ts). */
export interface Notices {
  status(message: string): void;
  settleStatus(message: string): void;
  clearError(): void;
  /** `retry` repeats what failed (Try again); `panel`: the failed panel the caller drew, which carries it. */
  errorMessage(error: unknown, retry?: () => void, panel?: HTMLElement): void;
  announce(text: string): void;
}

/** Which load is open: its stamps, the next load and the shown drafts' scope (src/workspace-session.ts). */
export interface Session extends Pick<WorkspaceSession, "begin" | "current"> {
  /** Starts the next load of `scope` and returns its stamp; every stamp before it stops holding. */
  nextLoad(scope?: WorkspaceScope): SessionStamp;
  currentLoad(): number;
  /** A controller's load number as a stamp; once that load moved on, one that says the scope changed. */
  stampOf(epoch: number): SessionStamp;
  draftScope(): DraftScope | undefined;
}

/** The open repository's reads: GitHub's API, its blobs and the snapshot's tree (src/github-reads.ts, src/site-loading.ts). */
export interface Repo {
  api<T>(action: string, params?: Record<string, string>): Promise<T>;
  /** `early`: the page's own first try of this read (src/boot-early.ts). */
  apiResponse<T>(path: string, params?: Record<string, string>, early?: Promise<Response>): Promise<ApiReceipt<T>>;
  readFile(repo: string, sha: string): Promise<string>;
  readFiles(repo: string, shas: string[]): Promise<Record<string, string>>;
  /** The snapshot's entry at `path`, when the snapshot lists it whole. */
  entryAt(path: string): TreeEntry | undefined;
  findEntry(path: string): Promise<TreeEntry | undefined>;
}

/** `retry`: the open this file is part of, offered as Try again when its read gets no answer. */
export type OpenOptions = { linkDefaultStyle?: boolean; keepExplorer?: boolean; quietStatus?: boolean; beforeMount?: () => boolean; retry?: () => void };

/** What the editor shows: the open page or file, and which open of it is the latest (src/main.ts). */
export interface View {
  /** The file selection counter: each open takes the next number, and only the latest open may finish. */
  fileGeneration: number;
  setCurrentPage(path?: string): void;
  showDirectory(directory: Directory): void;
  openNewDraft(draft: SavedDraft, options?: OpenOptions): Promise<void>;
  openEntry(entry: TreeEntry, path: string, at: SessionStamp, options?: OpenOptions): Promise<void>;
  mountSource(path: string, source: string, baseSha: string | null, readOnly: boolean, at: SessionStamp, selection: number, options?: OpenOptions): Promise<void>;
  /** Reopens `path` from the drafts or the snapshot (src/workspace-boot.ts). */
  restoreFile(path: string, at: SessionStamp, options?: OpenOptions): Promise<void>;
  /** Loads the open branch's snapshot again, reopening `resumePath` (src/workspace-boot.ts). */
  loadSnapshot(resumePath?: string, prefetched?: Promise<Snapshot>, warm?: { at?: number }): Promise<void>;
  updateAgentContext(): void;
  updateCurrentPageLabel(): void;
}

/** The open site's routes, titles and preview updates (src/site-preview.ts), handed over whole. */
export type Preview = ReturnType<typeof createSitePreview>;

/** The site's text index, the first-paint wait and the Pages titles held back (src/site-text-index.ts), handed over whole. */
export type TextIndex = ReturnType<typeof createSiteTextIndex>;
