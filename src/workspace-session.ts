// The one owner of "is the editor still on the same workspace and load as
// when this work began?" (CONTEXT.md, Workspace session). It holds the load
// counter and the scope of what is open, and one rule for when two scopes are
// the same workspace:
//
// - GitHub: one account whatever its capitals ("Lex" and "lex"), one
//   repository by its id (a renamed repository is the same, a re-created one
//   with the old name is not; by its name only when an id is not known), one
//   branch, one version view.
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

/** Comparison keys of a scope: for two scopes with known repository ids, equal whenever `same` holds (the view aside); none for a repository known only by name. */
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
  /** The keys of `scope`, by default the one open now; none for no scope, an empty branch or a repository known only by name. */
  keys(scope?: WorkspaceScope): WorkspaceKeys | undefined;
  /** How many loads of `scope`'s workspace began so far (a reload counts): work held there sees it shown, even briefly. */
  visits(scope: WorkspaceScope | undefined): number;
}

// A GitHub repository id is a positive whole number; 0 (or none) means it is not known.
const known = (repoId: number | undefined) => Number.isSafeInteger(repoId) && repoId! > 0;

// The workspace a scope names, the view aside; none while it is not loaded, or for a repository known only by name.
function identity(scope: WorkspaceScope | undefined) {
  if (!scope) return undefined;
  if (scope.kind === "folder") return scope.folderId ? JSON.stringify(["folder", scope.folderId]) : undefined;
  return scope.branch && known(scope.repoId) ? JSON.stringify(["github", scope.account.toLowerCase(), scope.repoId, scope.branch]) : undefined;
}

/** A branch of a repository, without its account (work within one account: an agent's grant, an approval). */
export interface BranchScope { repoId?: number; repo?: string; branch: string }

/**
 * The same repository, the account and branch aside: by its id, or by its name (ignoring
 * capitals, as GitHub does) only when either id is not known.
 */
export function sameRepository(a: Omit<BranchScope, "branch"> | undefined, b: Omit<BranchScope, "branch"> | undefined) {
  if (!a || !b) return false;
  if (known(a.repoId) && known(b.repoId)) return a.repoId === b.repoId;
  return !!a.repo && a.repo.toLowerCase() === b.repo?.toLowerCase();
}

/**
 * The same repository and branch, the account aside (`sameRepository`). An empty branch is
 * the same as nothing.
 */
export function sameBranch(a: BranchScope | undefined, b: BranchScope | undefined) {
  return !!a?.branch && a.branch === b?.branch && sameRepository(a, b);
}

// The same workspace, the view aside.
function sameWorkspace(a: WorkspaceScope | undefined, b: WorkspaceScope | undefined) {
  if (a?.kind === "folder" || b?.kind === "folder") return a?.kind === "folder" && b?.kind === "folder" && !!a.folderId && a.folderId === b.folderId;
  return !!a && !!b && a.account.toLowerCase() === b.account.toLowerCase() && sameBranch(a, b);
}

/** The same workspace and version view. */
export function same(a: WorkspaceScope | undefined, b: WorkspaceScope | undefined) {
  return sameWorkspace(a, b) && a!.view === b!.view;
}

export function workspaceKeys(scope: WorkspaceScope | undefined): WorkspaceKeys | undefined {
  const id = identity(scope);
  return id === undefined ? undefined : { drafts: `drafts:${id}`, setup: `setup:${id}`, media: `media:${id}` };
}

/** A draft scope (src/drafts.ts) or a remembered workspace as a GitHub scope. `repo` may be left out (empty): `same` compares the repository id, not its name. */
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

/**
 * Whether work begun on `stamp` is on show: its workspace is (a new load of it too). Another workspace
 * or a version view of it is elsewhere (ticket 23: there work finishes as drafts, with no Undo step).
 */
export function onShow(stamp: SessionStamp) {
  const change = stamp.changed();
  return change === undefined || change === "generation";
}

// A frozen copy, so a caller changing its own object later cannot move a stamp's scope.
const held = (scope: WorkspaceScope | undefined) => scope && Object.freeze({ ...scope });

export function createWorkspaceSession(scope?: WorkspaceScope): WorkspaceSession {
  let load = 0, open = held(scope);
  const visits = new Map<string, number>();
  return {
    current: () => ({ load, scope: open }),
    begin() {
      const began = load, at = open;
      const changed = (): SessionChange | undefined => {
        if (load === began) return undefined;
        if (!sameWorkspace(at, open)) return "scope";
        return at!.view === open!.view ? "generation" : "version-view";
      };
      return { load: began, scope: at, holds: () => load === began, changed };
    },
    next(scope) {
      load++; open = held(scope);
      const key = identity(open);
      if (key) visits.set(key, (visits.get(key) ?? 0) + 1);
    },
    keys: (scope = open) => workspaceKeys(scope),
    visits: scope => visits.get(identity(scope) ?? "") ?? 0,
  };
}
