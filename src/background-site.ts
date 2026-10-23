// Invisible multiplayer, part 2 (ticket 34): an agent's page and file command (create_page,
// set_page_details, make_component, add, move or remove a section, move_file, delete_file) that
// arrived on a site or branch no longer shown runs there after all, as a second, invisible user
// would: the same Pages, Files and component controllers and the same guarded edit run over that
// workspace as the command held it as it arrived (its pin, src/controllers/media-pin.ts), never over
// the one shown.
//
// This module is that workspace as the controllers see it: an `EditorWorkspace` (src/guarded-edit.ts)
// with the pin's scope, site, files and texts and nothing mounted, opened or selected, and the
// controllers' ports with their reads pinned and their screen work (trees, dialogs, toasts) none.
// Every step finishes away (src/guarded-edit/commit.ts `elsewhere`): its drafts land in that
// workspace, its Undo step is parked for its own page (src/guarded-edit/parked.ts). Its workspace
// shown again before the step is written stops it (the scope moves), and the editor runs it on show.
import type { DraftScope, SavedDraft, draftStore } from "./drafts";
import { listChanges, type DraftAccess } from "./file-changes";
import { isSectionTemplate } from "../shared/html-source";
import { NATIVE_CONFIG_PATH, NATIVE_REDIRECTS_PATH, nativeSitePaths, nativeSitePrefix, nativeSiteSettings, type NativeSite } from "../shared/native-project";
import { newDraftPaths } from "../shared/site-overlay";
import { backgroundKey } from "./background-page";
import { NATIVE_HOME_UNREAD, pageOnBranchHere } from "./controllers/pages-state";
import type { AgentSiteActions, AgentStructuralFactories } from "./agent-site";
import type { EditorWorkspace, GuardedEdits, Reads, Stamp } from "./guarded-edit";
import type { ParkedStep } from "./guarded-edit/parked";
import type { MediaPin } from "./controllers/media-controller";
import type { FileOperationsPorts, FileOperationsTreeState } from "./controllers/file-operations-controller";
import type { PagesPorts } from "./controllers/pages-controller";
import type { ComponentDeps } from "./page-builder/components";
import type { LoaderPlanner } from "./page-builder/component-plans";
import type { TreeEntry } from "../shared/types";

/** What the shown editor lends a background site: its primitives that take a scope, and its live ports to pin. */
export interface BackgroundSitePorts {
  /** The editor's live ports; the background site overrides what reads the workspace shown. */
  pages: PagesPorts;
  files: FileOperationsPorts;
  components(): ComponentDeps;
  actions(edits: GuardedEdits, atomic: boolean): AgentSiteActions;
  store(): ReturnType<typeof draftStore>;
  /** Forgets a model the editor keeps for `scope`'s `path`, not mounted, so it reads the drafts again. */
  forget(scope: DraftScope, path: string): void;
  /** The editor's source steps (none are mounted here: an empty receipt). */
  prepareSources: EditorWorkspace["prepareSources"];
  park(step: ParkedStep): void;
  factories: AgentStructuralFactories;
}

const none = () => {};
const holds: Stamp = { holds: () => true, changed: () => undefined };

/** The pinned workspace's files and their places: its tree, deletions and new drafts. */
function pinnedTree(pin: MediaPin, store: DraftAccess & { list(scope: DraftScope): SavedDraft[] }) {
  const drafts = () => store.list(pin.scope);
  const treeState = (): FileOperationsTreeState => {
    const all = drafts();
    return { changes: new Map(listChanges(all).map(change => [change.path, change])),
      deleted: new Map(all.filter(draft => draft.deleted).map(draft => [draft.path, draft])), drafted: newDraftPaths(all) };
  };
  // The branch's files: those it lists, without the new drafts.
  const baseFiles = () => { const drafted = new Set(newDraftPaths(drafts())); return pin.files().filter(path => !drafted.has(path)); };
  function pathNow(path: string, state = treeState()): "file" | "folder" | "deleted" | undefined {
    if (state.deleted.has(path)) return "deleted";
    if (state.drafted.includes(path)) return "file";
    const entry = pin.entry(path), files = pin.files(), prefix = `${path}/`;
    if (entry?.type === "blob" || entry?.type === "commit" || files.includes(path)) return "file";
    if (files.some(file => file.startsWith(prefix))) return "folder";
    if ([...state.deleted.keys()].some(file => file.startsWith(prefix))) return "deleted";
    return entry?.type === "tree" ? "folder" : undefined;
  }
  // Why `path` cannot be made on the branch: there already, or a folder of it a file.
  async function branchPathProblem(path: string) {
    const parts = path.split("/");
    for (let index = 0; index < parts.length; index++) {
      const at = parts.slice(0, index + 1).join("/"), entry = await pin.find(at);
      if (!entry) return undefined;
      if (index === parts.length - 1) return `${at} already exists on GitHub.`;
      if (entry.type !== "tree") return `${at} is a file, so nothing can go in it.`;
    }
    return undefined;
  }
  async function branchFilesUnder(folder: string): Promise<TreeEntry[]> {
    const paths = (await pin.list()).filter(path => path.startsWith(`${folder}/`));
    const entries = await Promise.all(paths.map(async path => { const entry = await pin.find(path); return entry && { ...entry, path }; }));
    return entries.filter((entry): entry is TreeEntry => Boolean(entry) && entry!.type !== "tree");
  }
  return { drafts, treeState, baseFiles, pathNow, branchPathProblem, branchFilesUnder };
}

/**
 * The workspace a command held as it arrived (`pin`), for the controllers to run its command in while
 * another is shown; `home`: the page its steps belong to when they name none (the page open as it
 * arrived, else the home page).
 */
export function backgroundSite(pin: MediaPin, ports: BackgroundSitePorts, opened?: string) {
  const scope = pin.scope, site = pin.site, store = ports.store(), key = backgroundKey(scope);
  const tree = pinnedTree(pin, store);
  const home = opened ?? site?.routes["/"];
  // The branch's text of `path` (its draft's original when it has one).
  const base = (path: string) => { const draft = store.get(scope, path); return draft ? draft.baseSha === null ? undefined : draft.original : pin.source(path); };
  // Its text now: its draft there, else the branch's (none for a deleted or opaque draft).
  const read = (path: string) => pin.source(path);
  const exists = (path: string) => { const now = tree.pathNow(path); return now === "file" || now === "folder"; };
  async function branchText(path: string) {
    const entry = await pin.find(path);
    if (!entry || entry.type !== "blob") return undefined;
    const text = base(path) ?? await ports.files.readFile(pin.repo, entry.sha);
    return { sha: entry.sha, text };
  }
  async function readRedirects() {
    const draft = store.get(scope, NATIVE_REDIRECTS_PATH);
    if (draft) return draft.deleted ? undefined : draft.content;
    return (await branchText(NATIVE_REDIRECTS_PATH))?.text;
  }
  const files: FileOperationsPorts = { ...ports.files,
    draftScope: () => scope, engaged: () => Boolean(site), repository: () => ({ full_name: pin.repo }),
    treeState: tree.treeState, pathNow: tree.pathNow, branchFilesUnder: tree.branchFilesUnder, findEntry: path => pin.find(path),
    baseSource: base, nativeFiles: () => pin.files(), readMediaText: undefined, ensureNativeTextIndex: async () => undefined,
    branchPathProblem: tree.branchPathProblem, onBranchHere: path => pageOnBranchHere(path, tree.baseFiles(), tree.drafts()),
    readNativeRedirects: readRedirects, undoFileChanges: none, afterFileChanges: none, announce: none, refuse: none, errorMessage: none,
    requestAnimationFrame: task => { setTimeout(task, 0); }, openFolder: none, fileRow: () => undefined, renderFileTree: none, filesTabOpen: () => false,
  };
  const entries = ports.factories.createLazyFileOperationsController({ ...files, edits: { stamp: () => holds, run: () => Promise.reject(new Error("Reads only.")), peek: { source: read, exists, template: () => undefined, site: () => site } } },
    () => import("./controllers/file-operations-controller"));
  const workspace: EditorWorkspace = {
    // Its workspace shown again: the scope moves, so a step not written yet stops and the editor runs it.
    scope: () => pin.here() ? "" : key,
    draftScope: () => scope,
    generation: () => 0,
    versionView: () => false, route: () => undefined, editModeEntry: () => undefined, agentActing: () => true,
    site: () => site,
    files: () => pin.files(),
    store,
    source: read,
    exists,
    base,
    branchText,
    entry: async path => (await entries.targetFiles({ path, name: path.slice(path.lastIndexOf("/") + 1), folder: false }, true))[0],
    createProblem: async path => (await pin.find(path)) ? `${path} already exists.` : tree.branchPathProblem(path),
    modelState: () => undefined,
    // Nothing of it is mounted; a model the editor kept for it is forgotten once its drafts change.
    model: () => ({ isCurrent: () => true }),
    mounted: () => false, mountedSource: () => undefined,
    openFile: () => undefined, open: async () => {}, anchor: () => undefined,
    retainModel: () => none,
    evictModel: (path, proof) => { ports.forget(scope, path); return proof; },
    prepareSources: edits => ports.prepareSources(edits),
    replaceRanges() { throw new Error("A background page has no editor."); },
    closeGroup: none, recordHistory: () => false, holdRefresh: () => none, shareHistory: () => none, onMount: none,
    paneFile: () => undefined, closePane: none, afterFileChanges: none, openAfter: none, showRow: none,
    later: task => { setTimeout(task, 0); },
    status: () => "", select: none, announce: none, refuse: none, error: none,
    park: step => ports.park(step),
  };
  const pages: PagesPorts = { ...ports.pages,
    site: () => site,
    routeForPath: file => site && Object.keys(site.routes).find(route => site.routes[route] === file),
    source: read, files: () => pin.files(), baseFiles: tree.baseFiles, drafts: tree.drafts, hasDraftScope: () => true,
    siteUrl: () => nativeSiteSettings(read(NATIVE_CONFIG_PATH)).url,
    writeMeta: async () => "A background page has no Page block.",
    ensureIndex: async () => undefined, readRedirects,
    pageLinks: () => undefined, confirmation: () => undefined, picker: () => undefined,
    refreshMeta: none, refreshLabel: none, tree: () => undefined, pagesHidden: () => true, openFile: () => undefined,
    clearPendingTitles: none, tabsMounted: () => false, paintTabs: none, resetExplorer: none, showMedia: none,
    siteReadForCreate: async () => site && read(site.routes["/"]) === undefined ? NATIVE_HOME_UNREAD : undefined,
    createWithCard: () => undefined, restoreDeleted: none, announce: none, refuse: none, error: none,
  };
  const sources = (site: NativeSite, reader: (path: string) => string | undefined = read) => Object.fromEntries(nativeSitePaths(site).map(path => [path, reader(path) ?? ""]));
  // Its texts are all read (an agent's command came after its context, the whole site): no index to wait for.
  const loader = async (path: string, text: string, r: Reads, check?: () => Promise<void>): ReturnType<LoaderPlanner> => {
    const plan = r.site();
    if (!plan) return "The repository or source changed meanwhile. Review the latest files and try again.";
    const { siteLoaderPlan } = await import("./page-builder/component-loader");
    if (check) await check();
    return siteLoaderPlan(path, text, r, sources(plan, file => r.source(file)), check);
  };
  const components = (page: string): ComponentDeps => ({ ...ports.components(),
    site: () => site, sources: () => site ? sources(site) : {}, files: () => pin.files(), index: async () => undefined, loaderPlan: loader,
    // The command's page stands open here, for Make component's own checks; nothing is shown.
    currentPath: () => page, editor: () => ({ isMounted: (path: string) => path === page }) as unknown as ReturnType<ComponentDeps["editor"]>,
    preview: () => undefined, selection: () => undefined, openFile: async path => path === page, previewPage: () => page,
    announce: none, error: none, images: () => [], prefix: () => nativeSitePrefix(read(NATIVE_CONFIG_PATH)),
    chooseImage: async () => undefined, links: () => [], refreshBar: none, refreshStructure: none, canvasComponent: none, shareHistory: () => none,
  });
  /** The site actions a command runs with there: its page read from the pin, open already, nothing shown. */
  const actions = (edits: GuardedEdits, atomic: boolean): AgentSiteActions => ({ ...ports.actions(edits, atomic),
    text: async path => read(path),
    isMounted: () => true,
    open: async () => true,
    sectionTags: () => new Set(Object.entries(site?.components ?? {}).filter(([, path]) => isSectionTemplate(read(path) ?? "")).map(([tag]) => tag)),
    inspect: () => Promise.reject(new Error("The editor shows another site or branch now; this needs the page on screen. Nothing was changed.")),
  });
  return { workspace, pages, files, components, actions, loader, home };
}
