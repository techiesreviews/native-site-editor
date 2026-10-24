import type { AgentReadFiles } from "./agent-tools-read";
import type { AgentAwayPorts, AgentSiteActions, AgentSiteInput, SharedContext, agentStructuralActions } from "./agent-site";
import type { AgentCommand } from "../shared/agent";
import type { SessionInfo } from "../shared/types";
import { createGuardedEdits, type GuardedEdits, type Reads, type Stamp } from "./guarded-edit";
import type { createMediaController, MediaControllerPorts, MediaPin } from "./controllers/media-controller";
import { NATIVE_HOME_PAGE, nativePageHead } from "../shared/native-project";
import { nativePageRoute } from "../shared/native-routes";
import { isNewDraft } from "../shared/site-overlay";
import { parentProblem } from "../shared/site-rules";
import { draftKey, draftStore, type DraftScope, type SavedDraft } from "./drafts";
import { createBlockMoves } from "./page-builder/block-move";
import { withPageField } from "./page-builder/site-head";
import { githubScope, holdsDraftScope, sameBranch, type WorkspaceScope, type WorkspaceSession } from "./workspace-session";
import type { AppStore } from "./app-store";
import type { BackgroundSitePorts } from "./background-site";
import type { createNativePreview } from "./components/native-preview";
import type { PageMetaField } from "./components/page-structure";
import type * as sourceEditor from "./components/source-editor";
import type { createAgentPresence } from "./agent-presence";
import type { createFinishedElsewhere } from "./finished-elsewhere";
import type { createGitHubReads } from "./github-reads";
import type { createParkedSteps } from "./guarded-edit/parked";
import type { createNativeSiteRuntime } from "./native-site-runtime";
import type { ComponentTools, PreparedComponentLoader } from "./page-builder/components";
import type { createPagesAndFilesHost } from "./pages-and-files-host";
import type { RepositoryIndex } from "./repository-loading";
import type { createVersionView } from "./version-view";
import type { createWorkspaceBoot } from "./workspace-boot";

export interface AgentSiteHostPorts {
  stamp(): Stamp;
  files?(): AgentReadFiles | undefined;
  source?(path: string): string | undefined;
  load(): Promise<Pick<typeof import("./agent-site"), "buildAgentContext">>;
  input(): AgentSiteInput | undefined;
  /** The workspace shown, pinned for Media work (src/controllers/media-pin.ts). */
  mediaPin?(): MediaPin | undefined;
}

/** Agent waits belong to the repository they began on; the host supplies live inputs after loading. */
export function createAgentSiteHost(ports: AgentSiteHostPorts) {
  async function context(): Promise<SharedContext | undefined> {
    const stamp = ports.stamp();
    const { buildAgentContext } = await ports.load();
    if (!stamp.holds()) return undefined;
    const input = ports.input();
    if (!input) return undefined;
    const context = await buildAgentContext(input);
    return stamp.holds() ? context : undefined;
  }
  // An edit's hold on the workspace (ticket 23): the live context while it is shown, else its own as
  // it arrived (its drafts then, nothing mounted or on show). A draft changed since refuses its write.
  // Its site's pages and outlines come from its pin (ticket 34), so a page or file command is prepared
  // against that site, read as it was when it arrived.
  function pin(build: () => Promise<SharedContext | undefined>) {
    const stamp = ports.stamp(), input = ports.input(), away = () => stamp.changed() === "scope", media = ports.mediaPin?.();
    const site = media?.site, held = site && media && { site, source: (path: string) => media.source(path),
      routeInfo: (route: string) => { const text = Object.hasOwn(site.routes, route) ? media.source(site.routes[route]) : undefined; return text === undefined ? {} : nativePageHead(text); },
      exists: (path: string) => media.files().includes(path) };
    // `opened`: the page open as it arrived, so its work knows when Lex has left that page (ticket 27).
    return input && { away, media, opened: input.native?.openFile, async context() {
      const shown = away() ? undefined : await build();
      if (shown) return shown;
      // Away now: its own. Left and shown again while it was made: the one shown, read again.
      return away() ? (await ports.load()).buildAgentContext({ ...input, file: null, mountedSource: () => undefined, native: held || undefined }) : build();
    } };
  }
  function tools(build = context) {
    return { stamp: () => ports.stamp(), context: build, pin: () => pin(build), files: () => ports.files?.(), source: (path: string) => ports.source?.(path) };
  }
  return { context, tools };
}

/** The host's state the agent's commands read (src/main.ts): consts by value, `let` state as getters. */
export interface AgentCommandPorts {
  appStore: AppStore;
  runtime: Pick<ReturnType<typeof createNativeSiteRuntime>, "site" | "engaged" | "base" | "source">;
  workspaceSession: Pick<WorkspaceSession, "begin" | "current" | "visits">;
  guardedEdits: GuardedEdits;
  editorModule: Pick<typeof sourceEditor, "isMounted" | "getMountedSource" | "dropDraft" | "forgetDraftModel" | "prepareHistorySources" | "flushAgentTyping" | "applyAgentDraft">;
  editorWorkspace: Parameters<typeof agentStructuralActions>[0];
  versions: Pick<ReturnType<typeof createVersionView>, "view">;
  finishedWork: Pick<ReturnType<typeof createFinishedElsewhere>, "add" | "agent">;
  parkedSteps: Pick<ReturnType<typeof createParkedSteps>, "park">;
  repositoryIndex: Pick<RepositoryIndex, "find">;
  mediaController: ReturnType<typeof createMediaController>;
  mediaPorts: MediaControllerPorts;
  blockMoves: Pick<ReturnType<typeof createBlockMoves>, "move">;
  agentPresence: Pick<ReturnType<typeof createAgentPresence>, "show">;
  pagesAndFiles: Pick<ReturnType<typeof createPagesAndFilesHost>, "nativeResyncDone" | "pageActions">;
  pagesController: Pick<ReturnType<typeof createPagesAndFilesHost>["pagesController"], "renderTree">;
  filesTreeController: Pick<ReturnType<typeof createPagesAndFilesHost>["filesTreeController"], "refresh">;
  api: ReturnType<typeof createGitHubReads>["api"];
  readonly info: SessionInfo;
  readonly componentTools: Pick<ComponentTools, "makeFromAgent" | "typingTemplate"> | undefined;
  readonly pageStructure: { refreshMeta(): void } | undefined;
  readonly nativePreview: Pick<ReturnType<typeof createNativePreview>, "isActive" | "inspect"> | undefined;
  loadAgentSite: () => Promise<typeof import("./agent-site")>;
  loadPagesActions: () => Promise<typeof import("./controllers/pages-controller")>;
  loadFileOps: () => Promise<typeof import("./controllers/file-operation-checks")>;
  draftScope: () => DraftScope | undefined;
  shownScope: () => WorkspaceScope | undefined;
  branchText: (path: string) => Promise<{ sha: string; text: string } | undefined>;
  pathNow: ReturnType<typeof createPagesAndFilesHost>["pathNow"];
  treeState: ReturnType<typeof createPagesAndFilesHost>["treeState"];
  branchPathProblem: (path: string) => Promise<string | undefined>;
  afterFileChanges: () => void;
  restoreFile: ReturnType<typeof createWorkspaceBoot>["restoreFile"];
  openNewDraft: (draft: SavedDraft) => Promise<void>;
  nativeComponentLoaderPlan: (path: string, nextPageText: string, r: Reads, check?: () => Promise<void>) => Promise<PreparedComponentLoader | string | undefined>;
  writeNativePageMeta: (path: string, field: PageMetaField, value: string, group?: boolean) => Promise<string | undefined>;
  nativeSectionChoices: () => { tag: string }[];
  pagePorts: () => BackgroundSitePorts["pages"];
  filePorts: () => BackgroundSitePorts["files"];
  componentPorts: BackgroundSitePorts["components"];
  refreshNativeRoutes: () => void;
  updateCurrentPageLabel: () => void;
  updateAgentContext: () => void;
}

/** An agent's commands, applied through the editor's own actions; `acting` while one runs (src/guarded-edit/commit.ts). */
export function createAgentCommands(ports: AgentCommandPorts) {
  const { appStore, runtime, workspaceSession, guardedEdits, editorModule, editorWorkspace, versions, finishedWork, parkedSteps, repositoryIndex,
    mediaController, mediaPorts, blockMoves, agentPresence, pagesAndFiles, pagesController, filesTreeController, api, loadAgentSite, loadPagesActions,
    loadFileOps, draftScope, shownScope, branchText, pathNow, treeState, branchPathProblem, afterFileChanges, restoreFile, openNewDraft,
    nativeComponentLoaderPlan, writeNativePageMeta, nativeSectionChoices, pagePorts, filePorts, componentPorts, refreshNativeRoutes,
    updateCurrentPageLabel, updateAgentContext } = ports;
  // Waits for a home page's resync, refusing when the user opened another
  // account's, repository's or branch's site meanwhile: the agent's command
  // was checked against the one it started on.
  async function awaitNativeResync() {
    if (!pagesAndFiles.nativeResyncDone) return;
    const at = workspaceSession.begin();
    await pagesAndFiles.nativeResyncDone;
    if (at.changed() === "scope")
      throw new Error("The editor tab switched to another site meanwhile. Call get_site and try again.");
  }
  const agentSiteActions = makeAgentSiteActions();
  function makeAgentSiteActions(edits: GuardedEdits = guardedEdits, atomic = false): AgentSiteActions { return {
    makeComponent: async (request) => ports.componentTools?.makeFromAgent(request) ?? "The component tools are not ready.",
    async text(path) {
      await awaitNativeResync();
      const scope = draftScope();
      const draft = scope ? draftStore().get(scope, path) : undefined;
      if (draft?.opaque && !draft.deleted) throw new Error(`${path} is not a text file.`);
      return runtime.source(path) ?? (draft ? undefined : (await branchText(path))?.text);
    },
    isMounted: (path) => Boolean(editorModule?.isMounted(path)),
    edits,
    atomicText: () => atomic,
    loaderPlan: nativeComponentLoaderPlan,
    writeDraft: async (path, content, create, expected) => {
      if (!atomic && !runtime.site && !runtime.engaged && create) {
        const scope = draftScope(), repo = appStore.repository.value, snap = appStore.snapshot.value;
        if (!scope || !repo || !snap) return "Open a repository first.";
        const at = workspaceSession.begin(), store = draftStore(), editor = editorModule;
        // Snapshot/draft presence stays authoritative before native activation starts.
        const hasHome = () => {
          const home = store.get(scope, NATIVE_HOME_PAGE);
          return snap.entries.some(entry => entry.path === NATIVE_HOME_PAGE && entry.type === "blob") ||
            isNewDraft(home);
        };
        if (hasHome()) return "Open a native site first.";
        const graph = JSON.stringify(snap.tree ?? snap.entries);
        const before = new Map(store.list(scope).map(draft => [draft.path, draft]));
        const isCurrent = () => {
          const drafts = store.list(scope);
          return at.holds() && appStore.repository.value === repo && appStore.snapshot.value === snap &&
            !runtime.site && !runtime.engaged && !hasHome() && !versions.view && JSON.stringify(snap.tree ?? snap.entries) === graph &&
            drafts.length === before.size && drafts.every(draft => before.get(draft.path) === draft);
        };
        // Before a home page exists there is no mounted editor to anchor operation
        // history: the file is a new draft, all or nothing, then the site resyncs.
        const { writeNewDrafts } = await import("./new-drafts");
        if (!isCurrent()) return "The repository changed meanwhile. Try again.";
        const error = await writeNewDrafts([{ path, content }], {
          scope, store, isCurrent,
          exists: path => pathNow(path, treeState(scope)) !== undefined,
          checkPath: async path => parentProblem(path, parent => pathNow(parent, treeState(scope)) === "file") ?? branchPathProblem(path),
          drop: (scope, path) => editor?.dropDraft(scope, path) ?? store.remove(scope, path),
          refresh: afterFileChanges,
        });
        if (error) return error;
        await awaitNativeResync();
        return undefined;
      }
      // A plan of one write: the file's bytes now (the branch's read first) are what it replaces.
      const since = edits.stamp("repository");
      if (!create && edits.peek.source(path) === undefined) {
        const base = await branchText(path);
        if (!since.holds()) return "The repository changed meanwhile. Try again.";
        if (base) runtime.base.sources.set(path, base.text);
      }
      const done = `An agent ${create ? "created" : "changed"} ${path}.`, undone = `Undid the agent's change to ${path}.`;
      const outcome = await edits.run(r => create ? { creates: [{ path, content }], ...nativePageRoute(path) && !ports.componentTools?.typingTemplate() || atomic && appStore.openFile.value === undefined ? { open: path } : {}, done, undone }
        : expected !== undefined && r.source(path) !== expected ? { refuse: `${path} changed in the editor since it was read. Read it again.` }
        : r.source(path) === undefined ? { refuse: `${path} does not exist.` }
        : { edits: new Map([[path, content]]), ...nativePageRoute(path) && (!atomic || !editorModule.isMounted(path)) && !ports.componentTools?.typingTemplate() ? { open: path } : {},
          ...atomic ? { select: { historyOnly: true } } : {}, done, undone }, { since });
      // A home page just written switches the site on: the context is whole before the write is answered.
      await pagesAndFiles.nativeResyncDone;
      return outcome.message;
    },
    async open(path) {
      if (appStore.openFile.value !== path || !editorModule?.isMounted(path)) await restoreFile(path, workspaceSession.begin(), { linkDefaultStyle: false });
      return appStore.openFile.value === path;
    },
    async createPage(request) {
      const since = edits.stamp("repository");
      await loadPagesActions();
      if (!since.holds()) return "The repository changed meanwhile. Try again.";
      const plan = pagesAndFiles.pageActions!.planNew(request);
      if (!plan.ok) return plan.error;
      return (await pagesAndFiles.pageActions!.createNew(request)) ?? { file: plan.value.file, route: plan.value.route };
    },
    async setPageDetail(path, field, value) {
      const error = await writeNativePageMeta(path, field, value, false);
      if (error) return error;
      ports.pageStructure?.refreshMeta();
      pagesController.renderTree();
      updateCurrentPageLabel();
      updateAgentContext();
      return undefined;
    },
    sectionTags: () => new Set(nativeSectionChoices().map((choice) => choice.tag)),
    moveSection: (at, gap) => blockMoves.move(at, { gap, section: true }, { stale: "The page changed in the editor meanwhile. Read it again." }),
    // An agent's move_file and delete_file run on their own controllers, which answer its confirmations (agentStructuralActions).
    moveFile: async () => "This editor cannot apply that change. Reload it.",
    deleteFile: async () => "This editor cannot apply that change. Reload it.",
    inspect(request) {
      if (!ports.nativePreview?.isActive()) throw new Error("The preview is not showing a page.");
      return ports.nativePreview.inspect(request);
    },
    async listMedia(request) {
      // The workspace shown as it was asked: listed from there whatever is shown by the time it is read (ticket 27).
      // With nothing to pin, the stamp taken before the chunk loads must hold.
      const pin = mediaPorts.pin?.(), since = guardedEdits.stamp("repository");
      const media = await import("./agent-media");
      if (!pin && !since.holds()) throw new Error("The editor moved to another site or branch meanwhile. Read the site again.");
      const ctx = await mediaController.workspaceContext(media.isAgentMediaPath, pin);
      return media.listWorkspaceMedia(ctx, request);
    },
    async previewMedia(path) {
      const [ctx, media] = await Promise.all([mediaController.workspaceContext(), import("./agent-media")]);
      return media.previewWorkspaceMedia(ctx, path, path => editorModule?.getMountedSource(path));
    },
    async media(command) {
      // Pinned as it arrived (agent-tools-media.ts), the change runs in its workspace's background page (ticket 27);
      // without a pin, the page and stamp taken here, before the chunk loads, are its proofs.
      const page = mediaPorts.source(command.path), since = guardedEdits.stamp("repository");
      const { runAgentMedia } = await import("./agent-media-actions");
      return runAgentMedia(mediaController, mediaPorts, command, page, since);
    },
    legacy: applyAgentCommand,
    presence: (path, find) => agentPresence.show(path, find),
  }; }
  async function applyAgentSiteCommand(command: AgentCommand) {
    const [{ applySiteCommand, applyStructural, prepareAgentText, atomicAgentCommand, agentStructuralActions, finishAgentTextElsewhere, editorOrElsewhere, holdWorkspace, retryProof, pinnedMedia, pinnedMediaActions, pinnedMediaAway }, { createPagesController }, { createLazyFileOperationsController }, { agentCommandFiles }] = await Promise.all([loadAgentSite(), loadPagesActions(), loadFileOps(), import("./agent-tools")]);
    const factories = { createGuardedEdits, createPagesController, createLazyFileOperationsController, createBlockMoves, withPageField };
    // Ticket 27: a Media change runs in its own workspace's background page, whatever is shown.
    // Finished while another workspace is shown, its note waits on that one (ticket 24), as an agent's text write's does.
    if (pinnedMedia(command)) {
      const done = await agentActing(() => applySiteCommand(pinnedMediaActions(agentSiteActions, command, () => appStore.openFile.value), command)), away = pinnedMediaAway(command);
      if (away) finishedWork.add(away, "agent", { id: command.id });
      return done;
    }
    // Ticket 23: an edit read from a site or branch no longer shown finishes there, on its files. On show the editor writes it, holding the workspace
    // from the moment that is known (its stamp below), proved by the commit the command was read on and the bytes its write reads (expectedHash;
    // the guarded edit's own reads); switched away before it was kept, it finishes where it was read after all (editorOrElsewhere), noted there (ticket 24).
    const read = agentCommandFiles.get(command), login = ports.info.user?.login, landed = read && login ? { account: login, repoId: read.repo.id, repo: read.repo.full_name, branch: read.snapshot.branch } : undefined, unchanged = retryProof(command, draftStore(), landed);
    // Ticket 34: a page or file command read there runs in its background site, the editor's own ports pinned to it; run on show again only while `unchanged` holds.
    const away: AgentAwayPorts = { landed: scope => finishedWork.add(scope, "agent", { id: command.id }), site: { pages: pagePorts(), files: filePorts(), components: componentPorts, actions: makeAgentSiteActions,
      store: draftStore, forget: (scope, path) => editorModule.forgetDraftModel(scope, path), visits: scope => workspaceSession.visits(githubScope(scope)), prepareSources: edits => editorModule.prepareHistorySources(edits, true), park: step => parkedSteps.park(step), factories } };
    const elsewhere = finishedWork.agent(landed, command, (scope, path) => draftStore().get(scope, path), () => finishAgentTextElsewhere(command, draftScope, login, draftStore(), (files, path) => repositoryIndex.find(api, files.repo, files.snapshot, path), away));
    const finished = await elsewhere(); if (finished) return finished;
    // Left and shown again before its step was kept, it runs on show again, on a new stamp (editorOrElsewhere).
    const onShow = async (): ReturnType<typeof applySiteCommand> => {
      const scope = draftScope(), { at, left } = holdWorkspace(workspaceSession), revision = appStore.snapshot.value?.commit, current = () => at.holds() && revision === appStore.snapshot.value?.commit && !versions.view;
      if (!current() || !appStore.snapshot.value || !sameBranch({ repoId: command.repoId ?? scope?.repoId, repo: command.repoId === undefined ? scope?.repo : undefined, branch: command.branch },
        { ...scope, branch: appStore.snapshot.value.branch })) throw new Error("The editor changed repository or branch.");
      if (!atomicAgentCommand(command)) {
        if (command.commit !== appStore.snapshot.value.commit) throw new Error(AGENT_REVISION_MOVED);
        return agentActing(() => applySiteCommand(agentSiteActions, command));
      }
      if (!scope) throw new Error("Open a repository first.");
      let prepared: Awaited<ReturnType<typeof prepareAgentText>> | undefined;
      return editorOrElsewhere(async () => {
        const kept = prepared = await prepareAgentText(command, scope, draftStore(), current, (scope, paths) => editorModule.flushAgentTyping(scope, paths),
          () => { if (holdsDraftScope(shownScope(), scope)) afterFileChanges(); });
        if (kept.duplicate) return kept.duplicate;
        // A switch meanwhile is not refused: editorOrElsewhere finishes it where it was read (ticket 34).
        if (command.commit !== appStore.snapshot.value?.commit) throw new Error(AGENT_REVISION_MOVED);
        if (!current()) throw new Error(AGENT_RELOADED);
        const scoped = agentStructuralActions(editorWorkspace, kept.context!, current, {
          actions: makeAgentSiteActions, pages: pagePorts(), files: filePorts(), components: componentPorts, loader: nativeComponentLoaderPlan, factories,
        });
        // The scoped page-details step skips writeNativePageMeta: its labels refresh once it is kept.
        return applyStructural(command, kept, scoped, agentActing, () => {
          if (command.operation === "set_page_details" && current()) { ports.pageStructure?.refreshMeta(); pagesController.renderTree(); updateCurrentPageLabel(); updateAgentContext(); }
        });
      }, () => Boolean(prepared?.applied), left, elsewhere, { shown: () => holdsDraftScope(shownScope(), scope), proof: unchanged, run: onShow });
    };
    return onShow();
  }
  // Its branch, shown, was saved or reloaded at another commit since the command was read there.
  const AGENT_REVISION_MOVED = "This branch is at another revision now than when the change was read. Read the site again.";
  // Shown at the same commit but reloaded, or an earlier version opened, while the command was prepared.
  const AGENT_RELOADED = "The editor reloaded this branch or opened an earlier version meanwhile. Read the site again.";
  // While an agent's command runs, its guarded edits leave .github alone (src/guarded-edit/commit.ts).
  let agentActingDepth = 0;
  async function agentActing<T>(run: () => Promise<T>): Promise<T> {
    agentActingDepth++;
    try {
      return await run();
    } finally {
      agentActingDepth--;
    }
  }
  async function applyAgentCommand(command: AgentCommand) {
    if (
      !ports.info.user ||
      !appStore.repository.value ||
      !appStore.snapshot.value ||
      command.branch !== appStore.snapshot.value.branch ||
      command.commit !== appStore.snapshot.value.commit
    )
      throw new Error("The editor context changed.");
    if (command.operation === "update_active_draft") {
      if (!editorModule) throw new Error("Open the file in the editor first.");
      await editorModule.applyAgentDraft(command);
      return;
    }
    const scope = {
      account: ports.info.user.login,
      repoId: appStore.repository.value.id,
      repo: appStore.repository.value.full_name,
      branch: appStore.snapshot.value.branch,
    };
    const previous = draftStore().get(scope, command.path);
    if (previous) {
      if (previous.baseSha === null && previous.content === command.content)
        return;
      throw new Error(
        "This file already has a browser draft. Open it and read its current context first.",
      );
    }
    const draft: SavedDraft = {
      ...scope,
      version: 1,
      path: command.path,
      baseSha: null,
      original: "",
      content: command.content,
      updatedAt: Date.now(),
    };
    draftStore().save(draft); // The editor reports persistence failures and retains a downloadable in-memory draft.
    if (nativePageRoute(draft.path)) refreshNativeRoutes();
    filesTreeController.refresh();
    await openNewDraft(draft);
  }
  // A reload of the branch an agent wrote: the drafts it took over settle, and the page open is read again (src/agent-transport.ts).
  async function reload(snapshot: Parameters<typeof import("./agent-transport").reloadTakeover>[0]) {
    const scope = draftScope(), open = appStore.openFile.value, at = workspaceSession.begin();
    if (scope) await (await import("./agent-transport")).reloadTakeover(snapshot, { open, key: path => draftKey(scope, path),
      keys: () => draftStore().list(scope).map(draft => draftKey(scope, draft.path)), settle: keys => draftStore().settleAgent(keys),
      draft: path => draftStore().get(scope, path), mounted: path => at.holds() && path === appStore.openFile.value ? editorModule?.getMountedSource(path) : undefined,
      restore: path => restoreFile(path, at) });
  }
  return { actions: agentSiteActions, apply: applyAgentSiteCommand, reload, acting: () => agentActingDepth > 0 };
}
