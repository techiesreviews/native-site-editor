// The one owner of "is the editor still on the same workspace and load as
// when this work began?" (CONTEXT.md, Workspace session). It holds the load
// counter and the scope of what is open, and one rule for when two scopes are
// the same workspace:
//
// - GitHub: one account whatever its capitals ("Lex" and "lex"), one
//   repository by its id (a renamed repository is the same, a re-created one
//   with the old name is not), one branch, one version view.
// - Local folder: its own kind with no account; never the same as a GitHub
//   scope, even for the same site.
// - A GitHub scope with an empty branch is not loaded yet: it is the same as
//   nothing (itself included) and has no keys, so nothing is kept under it.
//
// A version view (an earlier version of a file on show) is part of the scope,
// so work begun on the latest version does not land on an old one; drafts,
// setup and media belong to the branch, so their keys leave the view out.

export type WorkspaceScope =
  | { kind: "github"; account: string; repoId: number; repo: string; branch: string; view?: string }
  | { kind: "folder"; folderId: string; view?: string };

/** Comparison keys of a scope: equal whenever `same` holds (the view aside). */
export interface WorkspaceKeys { drafts: string; setup: string; media: string }

/** What moved since a stamp began: another workspace, the version view on it, or a reload of it. */
export type SessionChange = "scope" | "version-view" | "generation";

/** Work's hold on the session: the load and scope it began on, so it can finish there after a switch. */
export interface SessionStamp {
  readonly load: number;
  readonly scope: WorkspaceScope | undefined;
  holds(): boolean;
  changed(): SessionChange | undefined;
}

export interface WorkspaceSession {
  /** The load counter and the scope open now (none on the project overview). */
  current(): { load: number; scope: WorkspaceScope | undefined };
  /** The session now: hold it across a wait; `holds()` until the next load. */
  begin(): SessionStamp;
  /** Starts a new load of `scope` (the same one again is a reload); every stamp before it stops holding. */
  next(scope: WorkspaceScope | undefined): void;
  /** The keys of `scope`, by default the one open now; none for no scope or an empty branch. */
  keys(scope?: WorkspaceScope): WorkspaceKeys | undefined;
}

// The workspace a scope names, the view aside; none while it is not loaded.
function identity(scope: WorkspaceScope | undefined) {
  if (!scope) return undefined;
  if (scope.kind === "folder") return scope.folderId ? JSON.stringify(["folder", scope.folderId]) : undefined;
  return scope.branch ? JSON.stringify(["github", scope.account.toLowerCase(), scope.repoId, scope.branch]) : undefined;
}

/** The same workspace and version view. */
export function same(a: WorkspaceScope | undefined, b: WorkspaceScope | undefined) {
  const id = identity(a);
  return id !== undefined && id === identity(b) && a!.view === b!.view;
}

export function workspaceKeys(scope: WorkspaceScope | undefined): WorkspaceKeys | undefined {
  const id = identity(scope);
  return id === undefined ? undefined : { drafts: `drafts:${id}`, setup: `setup:${id}`, media: `media:${id}` };
}

/** A draft scope (src/drafts.ts) or a remembered workspace as a GitHub scope; `same` reads the id, not the name (left out, it stays empty). */
export function githubScope(scope: { account: string; repoId: number; repo?: string; branch: string }): WorkspaceScope {
  return { kind: "github", account: scope.account, repoId: scope.repoId, repo: scope.repo ?? "", branch: scope.branch };
}

/** The draft store's scope (src/drafts.ts) of a GitHub scope; none for a folder or no scope. */
export function draftScopeOf(scope: WorkspaceScope | undefined) {
  return scope?.kind === "github" ? { account: scope.account, repoId: scope.repoId, repo: scope.repo, branch: scope.branch } : undefined;
}

/** The setup checklist's key of `scope`: empty for none or an empty branch. */
export const setupKeyOf = (scope: WorkspaceScope | undefined) => workspaceKeys(scope)?.setup ?? "";

/** Whether `draft` (a draft scope, src/drafts.ts) is the workspace of `scope`, under the one account rule. */
export const holdsDraftScope = (scope: WorkspaceScope | undefined, draft: { account: string; repoId: number; branch: string }) => same(scope, githubScope(draft));

// A frozen copy, so a caller changing its own object later cannot move a stamp's scope.
const held = (scope: WorkspaceScope | undefined) => scope && Object.freeze({ ...scope });

export function createWorkspaceSession(scope?: WorkspaceScope): WorkspaceSession {
  let load = 0, open = held(scope);
  return {
    current: () => ({ load, scope: open }),
    begin() {
      const began = load, at = open;
      const changed = (): SessionChange | undefined => {
        if (load === began) return undefined;
        const id = identity(at);
        if (id === undefined || id !== identity(open)) return "scope";
        return at!.view === open!.view ? "generation" : "version-view";
      };
      return { load: began, scope: at, holds: () => load === began, changed };
    },
    next(scope) { load++; open = held(scope); },
    keys: (scope = open) => workspaceKeys(scope),
  };
}
