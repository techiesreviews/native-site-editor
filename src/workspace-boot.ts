// Opening a repository: its choice and branch (chooseRepository), its
// snapshot and first paint (loadSnapshot), a file reopened from a path
// (restoreFile), and the remembered last boot's guess (src/boot-memory.ts).
// The host (src/main.ts) keeps the workspace session, the DOM and the native
// site, and hands them in as live ports.

import { batch } from "@preact/signals-core";
import type { Directory, FilesResult, Repository, Snapshot, TreeEntry } from "../shared/types";
import type { NativeSite } from "../shared/native-project";
import type { StartingPoint } from "../shared/starting-point";
import type { AppStore } from "./app-store";
import type { ApiReceipt } from "./boot-api-response";
import { forgetBootMemory, memoryMatches, provenFiles, readBootMemory, writeBootMemory, type BootMemory } from "./boot-memory";
import type { CleanSourceCache } from "./clean-source-cache";
import type { createSavePublishController } from "./controllers/save-publish-controller";
import { draftStore, type DraftScope, type SavedDraft } from "./drafts";
import type { RepositoryIndex } from "./repository-loading";
import { githubScope, type SessionStamp, type WorkspaceScope } from "./workspace-session";
import { readWorkspaceUrl, rememberWorkspace, type WorkspaceLocation } from "./workspace-state";

type OpenOptions = { linkDefaultStyle?: boolean; keepExplorer?: boolean; quietStatus?: boolean; beforeMount?: () => boolean };
type Api = <T>(path: string, params?: Record<string, string>) => Promise<T>;
type PartialStart = { point: StartingPoint; committed: string[] };
type Box = Pick<HTMLElement, "replaceChildren">;
type Picker = { disabled: boolean; value: string };

export interface WorkspaceBootPorts {
  appStore: AppStore;
  savePublish: Pick<ReturnType<typeof createSavePublishController>, "trustedHead" | "seeHead" | "resetDeleted" | "checkDeleted" | "isDeleted">;
  repositoryIndex: Pick<RepositoryIndex, "clear" | "seed" | "entry">;
  cleanSources: Pick<CleanSourceCache, "load">;
  filesTreeController: { reset(): void; render(): void };
  pagesController: { updateTabs(force?: boolean): void };
  previewSelection: { recordIntent(path: string): void };
  mediaHistoryHome: { clear(): void };
  /** Host state, read (and the file selection counter written) at call time. */
  readonly user: { login: string } | null | undefined;
  fileGeneration: number;
  readonly repositories: Repository[];
  readonly content: Box;
  readonly files: Box;
  readonly refreshButton: { disabled: boolean };
  readonly branchSelect: Picker;
  readonly repositorySelect: { value: string };
  readonly repositoryMenu: { setRepository(repo?: Repository): void } | undefined;
  readonly explorerDropdown: { close(): void } | undefined;
  readonly siteActions: { revalidate(): void } | undefined;
  readonly nativeSite: NativeSite | undefined;
  readonly nativeSourcesRequest: number;
  readonly nativePaintedRequest: number;
  readonly nativePaintedPaths: string[];
  /** Editor endpoint identity: origin plus pathname. */
  source(): string;
  /** The adopted session's correlation tag (src/controllers/boot-controller.ts). */
  sessionTag(): string | null | undefined;
  draftsReady(): Promise<void>;
  nextLoad(scope?: WorkspaceScope): SessionStamp;
  api: Api;
  apiResponse<T>(path: string, params?: Record<string, string>): Promise<ApiReceipt<T>>;
  readFile(repo: string, sha: string): Promise<string>;
  storage(kind: "local" | "session"): Pick<Storage, "getItem" | "setItem" | "removeItem">;
  element(id: string): { textContent: string | null; title: string };
  node: (tag: "p", className?: string, text?: string) => Node | string;
  options(select: Picker, values: { value: string; label: string }[]): void;
  status(message: string): void;
  settleStatus(message: string): void;
  clearError(): void;
  errorMessage(error: unknown): void;
  draftScope(): DraftScope | undefined;
  entryAt(path: string): TreeEntry | undefined;
  setCurrentPage(path?: string): void;
  openNewDraft(draft: SavedDraft, options?: OpenOptions): Promise<void>;
  openEntry(entry: TreeEntry, path: string, at: SessionStamp, options?: OpenOptions): Promise<void>;
  mountSource(path: string, source: string, baseSha: string | null, readOnly: boolean, at: SessionStamp, selection: number, options?: OpenOptions): Promise<void>;
  deactivateNative(): void;
  activateNativeSite(repo: Repository, result: Snapshot, at: SessionStamp, openPath?: string): Promise<boolean>;
  afterNativePaint(request: number, run: () => void): void;
  updateAgentContext(): void;
  updatePreview(): void;
  showDirectory(directory: Directory): void;
  removeFinishStarter(): void;
  takeStartingPoint(repo: Repository): StartingPoint | undefined;
  writeStartingPoint(point: StartingPoint): Promise<string | undefined>;
  readPartialStart(repoId: number): PartialStart | undefined;
  offerFinishStarter(repo: Repository, partial: PartialStart): void;
}

// How long a failed branch list waits for a guessed snapshot (the only read with a bound).
export const GUESS_AFTER_FAILED_LIST_MS = 5000;

export function createWorkspaceBoot(ports: WorkspaceBootPorts) {
  // Host services that live as long as the page (consts in the host).
  const { api, appStore, savePublish, repositoryIndex, filesTreeController, node } = ports;

  async function restoreFile(
    path: string,
    at: SessionStamp,
    options: { linkDefaultStyle?: boolean; keepExplorer?: boolean; quietStatus?: boolean; beforeMount?: () => boolean } = {},
  ) {
    const selection = ++ports.fileGeneration;
    const repo = appStore.repository.value!;
    const unavailable = () =>
      new Error("The previously open file is no longer available. Choose another file.");
    const nowFolder = () =>
      new Error("The previously open file is now a folder. Choose another file.");
    const savedDraft = () => { const scope = ports.draftScope(); return scope && draftStore().get(scope, path); };
    try {
      let entry: TreeEntry | undefined;
      if (appStore.snapshot.value?.tree) {
        entry = ports.entryAt(path);
      } else {
        let entries = appStore.snapshot.value!.entries;
        const parts = path.split("/");
        for (let index = 0; index < parts.length; index++) {
          if (!at.holds() || selection !== ports.fileGeneration) return;
          entry = entries.find((entry) => entry.path === parts[index]);
          if (!entry) break;
          if (index === parts.length - 1) break;
          if (entry.type !== "tree") throw unavailable();
          entries = (
            await api<Directory>("tree", { repo: repo.full_name, sha: entry.sha })
          ).entries;
        }
      }
      if (!at.holds() || selection !== ports.fileGeneration) return;
      if (!entry) {
        const saved = savedDraft();
        if (saved?.baseSha === null) {
          await ports.openNewDraft(saved, options);
          return;
        }
        // An edit of a file GitHub deleted: opened to be settled.
        if (saved && !saved.deleted) await savePublish.checkDeleted(at);
        if (!at.holds() || selection !== ports.fileGeneration) return;
        if (saved && !saved.deleted && savePublish.isDeleted(path)) {
          if (!options.keepExplorer) ports.explorerDropdown?.close();
          ports.setCurrentPage(path);
          await ports.mountSource(path, saved.original, saved.baseSha, false, at, selection, options);
          return;
        }
        throw unavailable();
      }
      if (entry.type === "tree") throw nowFolder();
      await ports.openEntry(entry, path, at, options);
    } catch (error) {
      if (at.holds() && selection === ports.fileGeneration)
        ports.errorMessage(error);
    }
  }

  async function loadSnapshot(
    resumePath?: string,
    prefetched?: Promise<Snapshot>,
  ) {
    if (!appStore.repository.value || !appStore.branch.value) return;
    ports.removeFinishStarter();
    const reopen =
      resumePath ??
      (appStore.snapshot.value?.branch === appStore.branch.value ? appStore.openFile.value : undefined);
    // The head this tab saw on the branch: a lagging read never steps back from it.
    const known = appStore.snapshot.value && appStore.snapshot.value.branch === appStore.branch.value ? savePublish.trustedHead() : undefined;
    ports.mediaHistoryHome.clear();
    const at = ports.nextLoad(ports.user ? githubScope({ account: ports.user.login, repoId: appStore.repository.value.id, repo: appStore.repository.value.full_name, branch: appStore.branch.value }) : undefined);
    ports.fileGeneration++;
    ports.clearError();
    batch(() => {
      appStore.snapshot.value = undefined;
      repositoryIndex.clear();
      savePublish.resetDeleted();
      ports.siteActions?.revalidate();
      filesTreeController.reset();
      ports.deactivateNative();
      ports.setCurrentPage();
      appStore.selection.value = undefined;
    });
    const repo = appStore.repository.value;
    const branch = appStore.branch.value;
    ports.refreshButton.disabled = true;
    ports.element("revision").textContent = "…";
    ports.files.replaceChildren(node("p", "muted sidebar-hint", "Loading files…"));
    ports.content.replaceChildren(
      node("p", "empty-message", "Opening your repository…"),
    );
    ports.status(`Loading ${repo.name} / ${branch}…`);
    try {
      // The browser's drafts load alongside the snapshot (start()).
      const [result] = await Promise.all([
        prefetched ??
          api<Snapshot>("snapshot", {
            repo: repo.full_name,
            branch,
            ...(known ? { commit: known } : {}),
          }),
        ports.draftsReady(),
      ]);
      if (!at.holds()) return;
      appStore.snapshot.value = result;
      repositoryIndex.seed(repo, result);
      savePublish.seeHead(result.commit);
      ports.updateAgentContext();
      ports.updatePreview();
      // Start reading the file to reopen now, alongside the native site's files.
      const reopenEntry = reopen ? ports.entryAt(reopen) : undefined;
      if (reopenEntry?.type === "blob" && (reopenEntry.size ?? 0) <= 1024 * 1024)
        void ports.readFile(repo.full_name, reopenEntry.sha).catch(() => {});
      const isNative = await ports.activateNativeSite(repo, result, at, reopen);
      if (!at.holds()) return;
      // Drafts of files GitHub deleted or now holds are looked for once the
      // page is on screen (a file opened before then that needs it waits).
      if (isNative && ports.nativeSite) {
        ports.afterNativePaint(ports.nativeSourcesRequest, () => void savePublish.checkDeleted(at));
        const painted = ports.nativeSourcesRequest;
        let remembered = false;
        ports.afterNativePaint(painted, () => {
          const login = ports.user?.login;
          // Only after a real paint (not the 10 s fallback), once.
          if (remembered || ports.nativePaintedRequest !== painted) return;
          remembered = true;
          if (!at.holds() || appStore.snapshot.value !== result || appStore.repository.value !== repo || appStore.branch.value !== branch || !login) return;
          writeBootMemory(ports.storage("local"), { login, repoId: repo.id, fullName: repo.full_name, branch, commit: result.commit,
            files: ports.nativePaintedPaths.flatMap((path) => { const sha = repositoryIndex.entry(repo, result, path)?.sha; return sha ? [{ path, sha }] : []; }) });
        });
      } else {
        forgetBootMemory(ports.storage("local"), repo.id);
        void savePublish.checkDeleted(at);
      }
      // A native project opens on its home page when nothing else is selected;
      // its source is already in memory from the site's prefetch.
      const open = reopen ?? (isNative ? ports.nativeSite?.routes["/"] : undefined);
      ports.element("revision").textContent = result.empty ? "—" : result.commit.slice(0, 7);
      ports.element("revision").title = result.empty ? "No commits yet" : result.commit;
      filesTreeController.render();
      ports.pagesController.updateTabs(true);
      ports.showDirectory(result);
      // Agents see the site as it is now (pages found, or none yet).
      ports.updateAgentContext();
      // A repository made on GitHub's own page for a chosen starting point gets it now.
      // Only an empty repository gets it unasked; for any other the remembered choice is dropped.
      const remembered = !isNative ? ports.takeStartingPoint(repo) : undefined;
      const chosenPoint = result.empty ? remembered : undefined;
      if (chosenPoint) void ports.writeStartingPoint(chosenPoint).then((problem) => { if (problem) ports.errorMessage(new Error(problem)); });
      // A starting point that stopped part way is offered to be finished.
      const partialStart = result.empty ? undefined : ports.readPartialStart(repo.id);
      if (partialStart) ports.offerFinishStarter(repo, partialStart);
      if (ports.user)
        rememberWorkspace(ports.user.login, {
          repoId: repo.id,
          branch,
          path: open,
        });
      if (open) {
        ports.previewSelection.recordIntent(open);
        const opening = restoreFile(open, at), selection = ports.fileGeneration;
        await opening;
        // Its code pane waits for Monaco: a file opened meanwhile (a new page,
        // a rename) has said what happened, and that stands.
        if (selection !== ports.fileGeneration) return;
      }
      if (!at.holds()) return;
      if (result.empty) {
        ports.settleStatus(`${repo.name} is empty. Choose how to start your site.`);
        return;
      }
      ports.settleStatus(
        `Up to date with ${branch} · ${result.commit.slice(0, 7)}. Refresh to check for new commits.`,
      );
    } catch (error) {
      if (at.holds()) {
        ports.files.replaceChildren(
          node(
            "p",
            "muted sidebar-hint",
            "Files could not be loaded. Try refreshing.",
          ),
        );
        ports.content.replaceChildren(
          node("p", "empty-message", "Your repository could not be opened."),
        );
        ports.errorMessage(error);
      }
    } finally {
      if (at.holds()) ports.refreshButton.disabled = false;
    }
  }

  // Remember last boot (src/boot-memory.ts): the hash's repository, as its last
  // first paint read it, is asked for before the session is known. Nothing of it
  // shows until the adopted session, the verified listing and the fresh snapshot
  // prove it; anything else falls back to the normal reads.
  // A taken guess, until it is abandoned: then its files never enter the cache.
  let takenGuess: { abandoned: boolean } | undefined;
  function dropBootGuess() {
    bootGuess = undefined;
    abandonGuess();
  }
  // A taken guess whose repository selection is cleared (a new listing) writes nothing when it lands.
  function abandonGuess() {
    if (takenGuess) takenGuess.abandoned = true;
    takenGuess = undefined;
  }
  let bootGuess: { memory: BootMemory; source: string; snapshot: Promise<ApiReceipt<Snapshot>>; files?: Promise<ApiReceipt<FilesResult>> } | undefined;
  function startBootGuess() {
    const link = readWorkspaceUrl();
    const memory = link && readBootMemory(ports.storage("local"), link.repoId);
    if (!memory || memory.branch !== link.branch) return;
    const quiet = <T,>(read: Promise<T>) => { void read.catch(() => {}); return read; };
    bootGuess = {
      memory,
      source: ports.source(),
      snapshot: quiet(ports.apiResponse<Snapshot>("snapshot", { repo: memory.fullName, branch: memory.branch })),
      files: memory.files.length ? quiet(ports.apiResponse<FilesResult>("files", { repo: memory.fullName, shas: memory.files.map((file) => file.sha).join(",") })) : undefined,
    };
  }
  /** The guessed snapshot for `repo`/`branch`, once only, when this session and listing prove the memory. */
  function takeBootGuess(repo: Repository, branch: string): { snapshot: Promise<Snapshot>; token: { abandoned: boolean } } | undefined {
    const guess = bootGuess;
    // A new repository choice makes any earlier guess irrelevant.
    dropBootGuess();
    const tag = ports.sessionTag();
    const link = readWorkspaceUrl();
    if (!guess || !tag || guess.source !== ports.source() || link?.repoId !== repo.id || link.branch !== branch ||
      !memoryMatches(guess.memory, ports.user?.login, repo, branch)) return undefined;
    // loadSnapshot drops the result if navigation supersedes it meanwhile.
    const fresh = () => api<Snapshot>("snapshot", { repo: repo.full_name, branch });
    const token = takenGuess = { abandoned: false };
    const snapshot = guess.snapshot.then((receipt) => {
      if (receipt.sessionTag !== tag || ports.sessionTag() !== tag || receipt.value.branch !== branch) return fresh();
      const snapshot = receipt.value;
      // Content is addressed by SHA: a path with the remembered SHA in this
      // fresh snapshot has exactly the remembered read's content.
      for (const { sha } of guess.files && !token.abandoned ? provenFiles(guess.memory, snapshot.tree ?? snapshot.entries) : []) {
        // Readers await this cached promise and handle its rejection.
        void ports.cleanSources.load(repo.full_name, sha, () => guess.files!.then((files) => {
          const text = files.value.files[sha];
          if (files.sessionTag !== tag || typeof text !== "string") throw new Error();
          return text;
        }).catch(() => api<{ content: string }>("file", { repo: repo.full_name, sha }).then((file) => file.content)));
      }
      return snapshot;
    }, fresh);
    return { snapshot, token };
  }

  async function chooseRepository(resume?: WorkspaceLocation) {
    ports.mediaHistoryHome.clear();
    const at = ports.nextLoad();
    ports.fileGeneration++;
    appStore.reset(ports.repositories.find(
      (repo) => String(repo.id) === ports.repositorySelect.value,
    ));
    ports.repositoryMenu?.setRepository(appStore.repository.value);
    repositoryIndex.clear();
    ports.setCurrentPage();
    ports.branchSelect.disabled = true;
    ports.refreshButton.disabled = true;
    ports.options(ports.branchSelect, [{ value: "", label: "Loading branches…" }]);
    ports.files.replaceChildren();
    ports.content.replaceChildren(node("p", "empty-message", "Loading branches…"));
    ports.clearError();
    if (!appStore.repository.value) {
      ports.options(ports.branchSelect, [{ value: "", label: "—" }]);
      ports.element("revision").textContent = "—";
      ports.content.replaceChildren(
        node(
          "p",
          "empty-message",
          "Select a repository from Pages & files to open a project.",
        ),
      );
      ports.status("Choose a project to continue.");
      return;
    }
    // Begin independent work together: the selected branch is already known from
    // the bookmark or repository metadata. Validate it before using its snapshot.
    const requestedBranch = resume?.branch ?? appStore.repository.value.default_branch;
    const taken = takeBootGuess(appStore.repository.value, requestedBranch);
    const guessed = taken?.snapshot;
    const opened = appStore.repository.value;
    const snapshotRead = () => api<Snapshot>("snapshot", { repo: opened.full_name, branch: requestedBranch });
    // A rejected guess has already tried a fresh read (takeBootGuess).
    const prefetched = guessed ?? snapshotRead();
    // A branch lookup may fail first or navigation may supersede this request.
    void prefetched.catch(() => {});
    try {
      const listing = api<string[]>("branches", {
        repo: appStore.repository.value.full_name,
      });
      void listing.catch(() => {});
      // The remembered branch opens once its snapshot is in, which proves the
      // branch exists; the branch list fills the selector when it comes. A
      // guess that fails (a deleted branch), or a branch list that comes
      // first, takes the normal path below. A failed branch list waits for
      // the guess, for a while only: past that the failure shows as before,
      // and a late guess is never used.
      let timer: ReturnType<typeof setTimeout> | undefined, decided = false;
      const guessedSnapshot = guessed && await Promise.race([guessed.catch(() => undefined), listing.then(() => undefined, () => decided ? undefined : Promise.race([
        guessed.catch(() => undefined),
        new Promise<undefined>((resolve) => { timer = setTimeout(() => { taken!.token.abandoned = true; resolve(undefined); }, GUESS_AFTER_FAILED_LIST_MS); }),
      ]))]);
      decided = true;
      clearTimeout(timer);
      if (!at.holds()) return;
      if (guessedSnapshot) {
        const branch = requestedBranch;
        ports.options(ports.branchSelect, [{ value: branch, label: `⑂ ${branch}` }]);
        appStore.branch.value = branch;
        ports.branchSelect.value = branch;
        ports.branchSelect.disabled = false;
        void listing.then((branches) => {
          if (appStore.repository.value !== opened || appStore.branch.value !== branch) return;
          ports.options(ports.branchSelect, [...new Set([branch, ...branches])].map((name) => ({ value: name, label: `⑂ ${name}` })));
          ports.branchSelect.value = branch;
        }, () => {});
        await loadSnapshot(resume?.path, Promise.resolve(guessedSnapshot));
        return;
      }
      const branches = await listing;
      if (!at.holds()) return;
      if (!branches.length) {
        // An empty repository opens on its default branch with no files, so
        // drafts work; its first save makes the branch.
        const branch = appStore.repository.value.default_branch || "main";
        ports.options(ports.branchSelect, [{ value: branch, label: `⑂ ${branch}` }]);
        appStore.branch.value = branch;
        ports.branchSelect.value = branch;
        ports.branchSelect.disabled = false;
        // The Worker answers for it with an empty snapshot at EMPTY_COMMIT.
        await loadSnapshot(undefined, branch === requestedBranch ? prefetched : undefined);
        return;
      }
      ports.options(
        ports.branchSelect,
        branches.map((name) => ({ value: name, label: `⑂ ${name}` })),
      );
      if (resume && !branches.includes(resume.branch)) {
        ports.branchSelect.disabled = false;
        ports.content.replaceChildren(
          node(
            "p",
            "empty-message",
            "The linked branch is no longer available. Choose a branch from Pages & files.",
          ),
        );
        return;
      }
      appStore.branch.value =
        resume && branches.includes(resume.branch)
          ? resume.branch
          : branches.includes(appStore.repository.value.default_branch)
            ? appStore.repository.value.default_branch
            : branches[0];
      ports.branchSelect.value = appStore.branch.value ?? "";
      ports.branchSelect.disabled = false;
      await loadSnapshot(
        resume?.branch === appStore.branch.value ? resume.path : undefined,
        appStore.branch.value === requestedBranch ? prefetched : undefined,
      );
    } catch (error) {
      if (at.holds()) {
        ports.options(ports.branchSelect, [{ value: "", label: "Branches unavailable" }]);
        ports.content.replaceChildren(
          node(
            "p",
            "empty-message",
            "Branches could not be loaded. Reload repositories to retry.",
          ),
        );
        ports.errorMessage(error);
      }
    }
  }

  return {
    restoreFile,
    loadSnapshot,
    chooseRepository,
    /** Ask for the hash's remembered snapshot and files before the session is known. */
    startGuess: startBootGuess,
    /** Navigation or sign-out: forget the guess not yet taken and abandon a taken one. */
    dropGuess: dropBootGuess,
    /** The boot's listing is done: a guess it did not take is not kept for a later Reload. */
    forgetGuess() { bootGuess = undefined; },
    /** A new listing clears the repository selection: a taken guess writes nothing when it lands. */
    abandonGuess,
  };
}
