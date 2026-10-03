import type { DraftScope, SavedDraft } from "../drafts";

interface ComponentDraftStore {
  get(scope: DraftScope, path: string): SavedDraft | undefined;
  save(record: SavedDraft): boolean;
  error: string | null;
}

export interface ComponentDraftTransaction {
  scope: DraftScope;
  store: ComponentDraftStore;
  isCurrent(): boolean;
  exists(path: string): boolean;
  checkPath(path: string): Promise<string | undefined>;
  drop(scope: DraftScope, path: string): boolean;
  refresh(): void;
  announce(message: string): void;
}

export async function createComponentFileDrafts(
  files: readonly { path: string; content: string }[],
  transaction: ComponentDraftTransaction,
) {
  const made = files.map(file => ({ ...file }));
  const scope = { ...transaction.scope };
  const { store } = transaction;
  if (new Set(made.map(file => file.path)).size !== made.length) return { error: "Component file paths must be unique." };
  const own = new Map<string, SavedDraft>();
  const changed = "The repository or branch changed. Reopen Make component and try again.";
  const undo = () => {
    for (const [path, record] of own) {
      if (store.get(scope, path) !== record) continue;
      if (transaction.drop(scope, path)) own.delete(path);
      else transaction.announce(`The component file ${path} is open; its draft was kept.`);
    }
    if (transaction.isCurrent()) transaction.refresh();
  };
  const add = async (): Promise<string | undefined> => {
    if (!transaction.isCurrent()) return changed;
    for (const file of made) {
      if (transaction.exists(file.path) || store.get(scope, file.path)) return `${file.path} already exists.`;
      let problem: string | undefined;
      try { problem = await transaction.checkPath(file.path); }
      catch (error) { return error instanceof Error ? error.message : "The component paths could not be checked."; }
      if (!transaction.isCurrent()) return changed;
      if (problem) return problem;
    }
    if (!transaction.isCurrent()) return changed;
    // Validate every path after the final asynchronous lookup, before saving any draft.
    for (const file of made)
      if (transaction.exists(file.path) || store.get(scope, file.path)) return `${file.path} already exists.`;
    for (const file of made) {
      const record: SavedDraft = { ...scope, version: 1, path: file.path, baseSha: null, original: "", content: file.content, updatedAt: Date.now() };
      own.set(file.path, record);
      if (!store.save(record)) {
        const problem = store.error ?? "The component draft could not be saved.";
        undo();
        return problem;
      }
    }
    transaction.refresh();
    return undefined;
  };
  const problem = await add();
  if (problem) return { error: problem };
  return { receipt: {
    isCurrent: () => transaction.isCurrent() && own.size === made.length && [...own].every(([path, record]) => store.get(scope, path) === record),
    undo,
    redo: async () => { const problem = await add(); if (problem) transaction.announce(problem); },
  } };
}
