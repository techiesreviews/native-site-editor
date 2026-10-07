import type { ApiReceipt } from "../boot-api-response";
import { repositoryReceipt } from "../boot-api-response";
import { startBootReads } from "../boot-reads";
import { autoSignInPlan, AUTO_SIGNIN_DELAY_MS, markAutoSignInTried, rememberSignedIn } from "../auto-signin";
import type { Repository, SessionInfo } from "../../shared/types";
import type { WorkspaceLocation } from "../workspace-state";

export type Onboarding = "install" | "create";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type LoginMode = "auto" | "ready" | "error";

export type RepositoryOpenPlan =
  | { kind: "empty" }
  | { kind: "invalid-link" }
  | { kind: "unavailable-link" }
  | { kind: "open"; id: number; resume?: WorkspaceLocation }
  | { kind: "choose" };

/**
 * Which repository a fresh listing opens. `linked` is the URL fragment's
 * workspace, `remembered` this account's last workspace, and `knownBefore`
 * the ids listed before a visit to GitHub's install page.
 */
export function planRepositoryOpen(input: {
  list: readonly Pick<Repository, "id">[];
  linked?: WorkspaceLocation;
  hashPresent: boolean;
  knownBefore?: readonly number[];
  remembered?: WorkspaceLocation;
}): RepositoryOpenPlan {
  const { list, linked } = input;
  if (!list.length) return { kind: "empty" };
  if (input.hashPresent && !linked) return { kind: "invalid-link" };
  if (linked && !list.some((repo) => repo.id === linked.repoId)) return { kind: "unavailable-link" };
  // Back from giving the editor access: the one repository that is new opens.
  if (input.knownBefore) {
    const known = new Set(input.knownBefore);
    const added = list.filter((repo) => !known.has(repo.id));
    if (added.length === 1 && !linked) return { kind: "open", id: added[0].id };
  }
  const previous = linked ?? input.remembered;
  const remembered = previous && list.find((repo) => repo.id === previous.repoId);
  if (remembered) return { kind: "open", id: remembered.id, resume: previous };
  if (list.length === 1) return { kind: "open", id: list[0].id };
  return { kind: "choose" };
}

export interface BootMenu {
  setRepositories(list: Repository[], message?: string): void;
}

export interface BootPorts {
  /** Read only: the host bumps generation (loadRepositories, renderLogin). */
  generation(): number;
  /** Editor endpoint identity: origin plus pathname. */
  source(): string;
  url(): string;
  replaceUrl(url: URL): void;
  redirect(url: string): void;
  assign(url: string): void;
  readSession(): Promise<ApiReceipt<SessionInfo>>;
  readRepositories(refresh: boolean): Promise<ApiReceipt<Repository[]>>;
  loadDrafts(login: string): Promise<void>;
  /** Installed once the drafts have loaded. */
  onDraftError(): void;
  session(): SessionInfo | undefined;
  adoptSession(session: SessionInfo): void;
  /** Resume the link, mount the workspace and start the agent. */
  enterWorkspace(): void;
  loadRepositories(prefetched?: Repository[], hooks?: { onStarted(epoch: number): void }): Promise<void>;
  renderLogin(mode?: LoginMode): void;
  retainLink(): void;
  showError(error: unknown): void;
  storage(kind: "local" | "session"): Store;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(timer: unknown): void;
  menu(): BootMenu | undefined;
  /** Install a listing in the host's repository selector (not the menu). */
  applyList(list: Repository[]): void;
}

/** Session/repository boot orchestration; the host keeps generation and the workspace DOM. */
export function createBootController(ports: BootPorts) {
  let drafts: Promise<void> = Promise.resolve();
  let openNew = false;
  let onboarding: Onboarding | undefined;
  let listLoaded = false;
  let state: "uninitialized" | "loading" | "ready" | "failed" = "uninitialized";
  let listRequest: Promise<void> | undefined;
  let cancelAuto: (() => void) | undefined;

  /** Read the array endpoint and its onboarding hint without expanding the session. */
  async function fetchList(refresh = false): Promise<Repository[]> {
    const response = await ports.readRepositories(refresh);
    onboarding = response.onboarding;
    return response.value;
  }
  function needsRecovery() {
    return state === "failed" || state === "uninitialized";
  }
  async function recover(next: Repository[]) {
    if (!needsRecovery()) return false;
    await ports.loadRepositories(next);
    return true;
  }
  /** Opening the menu needs the full list; opening a remembered repository does not. */
  async function ensureList() {
    if (listLoaded && !needsRecovery()) return;
    if (listRequest) return listRequest;
    const menu = ports.menu();
    const login = ports.session()?.user?.login;
    listRequest = (async () => {
      try {
        const next = await fetchList();
        if (menu !== ports.menu() || login !== ports.session()?.user?.login) return;
        if (await recover(next)) return;
        listLoaded = true;
        ports.applyList(next);
        menu?.setRepositories(next);
      } catch (error) {
        if (menu === ports.menu()) menu?.setRepositories([], "Repositories could not be loaded. Use Reload to try again.");
        ports.showError(error);
      } finally {
        if (menu === ports.menu()) listRequest = undefined;
      }
    })();
    return listRequest;
  }

  async function start() {
    const bootEpoch = ports.generation();
    let handoff: { epoch: number; session: SessionInfo } | undefined;
    const source = ports.source();
    const current = () => ports.generation() === bootEpoch && ports.source() === source;
    const reads = startBootReads({
      readSession: () => ports.readSession(),
      readRepositories: async () => repositoryReceipt(await ports.readRepositories(false)),
      scope: { source, epoch: bootEpoch },
      isCurrent: scope => current() && scope.source === source && scope.epoch === bootEpoch,
    });
    try {
      const sessionResponse = await reads.session;
      if (!current()) return;
      const session = sessionResponse.value;
      // Back from installing the App while "Request user authorization during
      // installation" is off: GitHub returns to the setup URL (this page) with an
      // installation_id, which is never trusted. Sign in now; the authorization
      // usually needs no click and completes the sign-in.
      const returnedFromInstall = new URL(ports.url());
      if (!session.user && session.configured && (returnedFromInstall.searchParams.has("installation_id") || returnedFromInstall.searchParams.has("setup_action"))) {
        ports.redirect("/auth/login");
        return;
      }
      if (session.user) {
        rememberSignedIn(ports.storage("local"));
        // Drafts are read synchronously once loaded (src/drafts.ts): they load
        // alongside the repository's first reads, and nothing reads them
        // before a snapshot is in (loadSnapshot waits for them).
        drafts = ports.loadDrafts(session.user.login).then(() => ports.onDraftError());
      }
      ports.adoptSession(session);
      if (session.user) {
        ports.enterWorkspace();
        // GitHub sends the user back here after the App was installed or its
        // repositories changed: list them afresh, and tidy the address.
        const returned = new URL(ports.url());
        const installed = returned.searchParams.has("installation_id") || returned.searchParams.has("setup_action");
        if (installed) {
          returned.searchParams.delete("installation_id");
          returned.searchParams.delete("setup_action");
          ports.replaceUrl(returned);
          openNew = true;
        }
        const prefetched = installed ? undefined : await reads.takeRepositories(sessionResponse);
        // Navigation or another boot won while the speculative list was arriving.
        if (!current()) return;
        if (prefetched) onboarding = prefetched.value.onboarding;
        await ports.loadRepositories(installed ? undefined : prefetched?.value.repositories ?? session.repositories ?? undefined, {
          // Capture at the increment, before setup callbacks can throw or navigate.
          onStarted: epoch => { handoff = { epoch, session }; },
        });
      } else if (
        autoSignInPlan({ configured: session.configured, hasSession: false, pathname: new URL(ports.url()).pathname, search: new URL(ports.url()).search, local: ports.storage("local"), session: ports.storage("session") }) === "auto"
      ) {
        // Signed in here before and the session ended: go on to GitHub, which completes
        // the authorization silently. Once per tab session; the message stays readable
        // for a moment and can be cancelled.
        markAutoSignInTried(ports.storage("session"));
        ports.renderLogin("auto");
        const timer = ports.setTimer(() => {
          cancelAuto = undefined;
          ports.retainLink();
          ports.assign("/auth/login");
        }, AUTO_SIGNIN_DELAY_MS);
        cancelAuto = () => {
          ports.clearTimer(timer);
          cancelAuto = undefined;
          ports.renderLogin();
        };
        return;
      } else {
        ports.renderLogin();
      }
      const error = new URL(ports.url()).searchParams.get("error");
      if (error) {
        ports.showError(new Error(error));
        const cleanUrl = new URL(ports.url());
        cleanUrl.searchParams.delete("error");
        ports.replaceUrl(cleanUrl);
      }
    } catch (error) {
      const ownsFailure = handoff
        ? ports.generation() === handoff.epoch && ports.session() === handoff.session && ports.source() === source
        : current();
      if (!ownsFailure) return;
      ports.renderLogin("error");
      ports.showError(error);
    }
  }

  return {
    start,
    /** A fragment change before the session has loaded is not lost: the boot reads the location as it is then. */
    onHashChange() {
      if (ports.session()?.user) void ports.loadRepositories();
    },
    /** The account's drafts, loading since sign-in; snapshots wait for them. */
    draftsReady: () => drafts,
    /** Whether the next listing must be fresh (back from installing the App). */
    refreshPending: () => openNew,
    /** Consume the install return: true once, for the listing that follows it. */
    takeRefresh() {
      const value = openNew;
      openNew = false;
      return value;
    },
    onboarding: () => onboarding,
    fetchList,
    ensureList,
    recover,
    needsRecovery,
    /** loadRepositories' workspace states. */
    loading() { state = "loading"; },
    ready() { listLoaded = true; state = "ready"; },
    failed() { state = "failed"; },
    /** A complete listing is installed outside loadRepositories. */
    listed() { listLoaded = true; },
    cancelAutoSignIn: () => cancelAuto?.(),
    /** Sign-out/login screen: forget the listing state (drafts and the auto sign-in timer are kept as before). */
    reset() {
      listLoaded = false;
      state = "uninitialized";
      listRequest = undefined;
      onboarding = undefined;
    },
  };
}
