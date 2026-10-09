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
  /** The draft is in a code pane, so `drop` would keep it. */
  isOpen(scope: DraftScope, path: string): boolean;
  drop(scope: DraftScope, path: string): boolean;
  refresh(): void;
  announce(message: string): void;
}

/**
 * The files' side of the page edit's undo step (a history companion): Undo and Redo take all the
 * files back or write them all again, or refuse with a reason before the page edit moves.
 */
export interface ComponentFilesCompanion {
  ready(direction: "undo" | "redo"): Promise<string | undefined>;
  undo(): string | undefined;
  redo(): string | undefined;
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
  // Takes back what this transaction still owns; a draft replaced since, or open, stays.
  const undo = () => {
    for (const [path, record] of own) {
      if (store.get(scope, path) !== record) continue;
      if (transaction.drop(scope, path)) own.delete(path);
      else transaction.announce(`The component file ${path} is open; its draft was kept.`);
    }
    if (transaction.isCurrent()) transaction.refresh();
  };
  // What stands in the way of writing every file, as far as is known without a lookup.
  const writeProblem = () => {
    if (!transaction.isCurrent()) return changed;
    const taken = made.find(file => transaction.exists(file.path) || store.get(scope, file.path));
    return taken && `${taken.path} already exists.`;
  };
  const check = async (): Promise<string | undefined> => {
    for (const file of made) {
      const problem = writeProblem();
      if (problem) return problem;
      try { const problem = await transaction.checkPath(file.path); if (problem) return problem; }
      catch (error) { return error instanceof Error ? error.message : "The component paths could not be checked."; }
    }
    // Validate every path after the final asynchronous lookup, before saving any draft.
    return writeProblem();
  };
  const write = (): string | undefined => {
    const problem = writeProblem();
    if (problem) return problem;
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
  // Undo takes every file back or none: each is still the draft written here, and none is open.
  const undoProblem = () => {
    if (own.size !== made.length) return "The component's files changed since; Undo would leave some of them.";
    for (const [path, record] of own) {
      if (store.get(scope, path) !== record) return `${path} changed since the component was made; Undo would leave it.`;
      if (transaction.isOpen(scope, path)) return `${path} is open; close it before undoing the component.`;
    }
    return undefined;
  };
  const refuse = (problem: string | undefined) => { if (problem) transaction.announce(problem); return problem; };
  const problem = (await check()) ?? write();
  if (problem) return { error: problem };
  const companion: ComponentFilesCompanion = {
    ready: async direction => refuse(direction === "undo" ? undoProblem() : await check()),
    undo: () => { const problem = refuse(undoProblem()); if (!problem) undo(); return problem; },
    redo: () => refuse(write()),
  };
  return { receipt: {
    isCurrent: () => transaction.isCurrent() && own.size === made.length && [...own].every(([path, record]) => store.get(scope, path) === record),
    undo,
    companion,
  } };
}
