// New files as drafts, all or none, where there is no page whose history could
// take them as one undo step (an agent's first file in a repository that is
// not a native site yet; src/main.ts). Everywhere else new files are the
// creates of a guarded edit's step (src/guarded-edit.ts).

import type { DraftScope, SavedDraft } from "./drafts";

export interface NewDraftsPort {
  scope: DraftScope;
  store: { get(scope: DraftScope, path: string): SavedDraft | undefined; save(record: SavedDraft): boolean; error: string | null };
  /** Still the repository, branch and state the files were asked for in. */
  isCurrent(): boolean;
  exists(path: string): boolean;
  /** Asks the branch why `path` can't be written (a file there, a file for a folder): the reason, or nothing. */
  checkPath(path: string): Promise<string | undefined>;
  /** Takes a draft back (a write that failed half way). */
  drop(scope: DraftScope, path: string): boolean;
  refresh(): void;
}

/** Writes every file as a new draft, or none: why not, or nothing. */
export async function writeNewDrafts(files: readonly { path: string; content: string }[], port: NewDraftsPort): Promise<string | undefined> {
  const scope = { ...port.scope }, { store } = port;
  if (new Set(files.map(file => file.path)).size !== files.length) return "File paths must be unique.";
  const problem = () => {
    if (!port.isCurrent()) return "The repository or branch changed. Try again.";
    const taken = files.find(file => port.exists(file.path) || store.get(scope, file.path));
    return taken && `${taken.path} already exists.`;
  };
  for (const file of files) {
    const before = problem();
    if (before) return before;
    try { const reason = await port.checkPath(file.path); if (reason) return reason; }
    catch (error) { return error instanceof Error ? error.message : "The paths could not be checked."; }
  }
  // Every path again after the last lookup, before any draft is saved.
  const last = problem();
  if (last) return last;
  const own: SavedDraft[] = [];
  for (const file of files) {
    const record: SavedDraft = { ...scope, version: 1, path: file.path, baseSha: null, original: "", content: file.content, updatedAt: Date.now() };
    own.push(record);
    if (!store.save(record)) {
      const error = store.error ?? "The draft could not be saved.";
      // Takes back only the exact drafts written here.
      for (const written of own) if (store.get(scope, written.path) === written) port.drop(scope, written.path);
      if (port.isCurrent()) port.refresh();
      return error;
    }
  }
  port.refresh();
  return undefined;
}
