// The open native site's state (no DOM): its files on the branch with their
// texts, the drafts over them, and what the preview has read and is reading.
// `main.ts` hands in the workspace session, the draft store, GitHub's clean
// texts and the mounted editor as ports, and keeps the preview adapter.
import type { CleanSourceCache } from "./clean-source-cache";
import { draftKey, type DraftScope, type draftStore, type SavedDraft } from "./drafts";
import { nativeShownFiles, type UnreadableFile } from "./native-boot";
import { holdsDraftScope, type WorkspaceScope } from "./workspace-session";
import { NATIVE_CONFIG_PATH, nativeDefaultRoute, nativeSitePaths, nativeSitePrefix, type NativeSite } from "../shared/native-project";
import { effectiveText, newDraftPaths, type NewDraftOptions } from "../shared/site-overlay";
import type { PublishResult } from "../shared/types";

export interface NativeSiteRuntimePorts {
  /** The drafts' scope on show; none on the overview or while a load runs. */
  scope(): DraftScope | undefined;
  /** The session's scope once its load's snapshot is on show. */
  shown(): WorkspaceScope | undefined;
  drafts(): Pick<ReturnType<typeof draftStore>, "get" | "list">;
  /** The open editor's text of `path` while its model is mounted. */
  mounted(path: string): string | undefined;
  /** GitHub's clean texts; `base` holds the site's pages, templates and stylesheets. */
  clean: Pick<CleanSourceCache, "base" | "peek">;
  /** The text index's key (repository, branch, commit and load); none without a site. */
  textKey(): string;
  /** The route the preview shows, and the file open. */
  route(): string | undefined;
  openFile(): string | undefined;
  /** The shared stylesheets of the page on show, with every file they import. */
  pageStyles(): string[];
  /** The branch's file at `path` in the snapshot on show. */
  find(path: string): Promise<{ sha: string } | undefined>;
  /** GitHub's texts of `files`; those it cannot give as text are named, not thrown. */
  readTexts(repo: string, files: { path: string; sha: string }[]): Promise<{ texts: Map<string, string>; unreadable: UnreadableFile[] }>;
  /** Files that cannot be read as text, for the preview's warnings. */
  unreadable(files: UnreadableFile[]): void;
  /** The preview takes the sources again. */
  changed(): void;
  /** The site has been let go: the views that show it close. */
  closed(): void;
}

/** What the preview has read and is reading; `main.ts`'s loaders keep it until they move here (slice 31b). */
export interface NativeSiteState {
  opaqueText: Map<string, { sha: string; text: string }>;
  componentStyles: Map<string, string>;
  missingComponentStyles: Set<string>;
  componentStyleRequests: Set<string>;
  // The stylesheets the pages link and every file those `@import`: loaded,
  // or missing from the branch, or being read. Each is a style dependency:
  // its effective source reaches the preview and edits to it re-render.
  styleFiles: Set<string>;
  missingStyleFiles: Set<string>;
  styleFileRequests: Set<string>;
  // Files GitHub cannot give as text (not UTF-8, binary, over 1 MB), with why.
  // Every read of the site skips them: a stylesheet among them is left out of
  // the preview with a warning, never shown as a preview error.
  unreadable: Map<string, string>;
  // The project's own warnings (shared/native-project.ts), shown with the unreadable stylesheets'.
  projectWarnings: string[];
  /** The load the reads belong to; a reset or a new load moves it on. */
  request: number;
  textIndexing: Promise<boolean> | undefined;
  textIndexScope: string;
  textIndexed: boolean;
  releaseTextIndex: (() => void) | undefined;
  // Paths being read, with the read that owns them: a read left over from a
  // previous load (cleared with the rest of its state) never clears a newer one's.
  shownRequests: Map<string, object>;
  assets: Map<string, string>;
  missingAssets: Set<string>;
  assetRequests: Map<string, number>;
  assetRequestId: number;
  // Paths whose image came from a draft (or that a draft now covers) are read
  // again after files change, so an upload, move or discard shows at once.
  draftAssets: Set<string>;
  // The load whose first paint happened, the files read for it (for the boot memory) and the work waiting for it.
  paintedRequest: number;
  paintedPaths: string[];
  paintWaiters: { request: number; run: () => void }[];
}

export function createNativeSiteRuntime(ports: NativeSiteRuntimePorts) {
  // The loaded native site: its pages by route and its components by tag,
  // read from the repository's files (shared/native-project.ts).
  let nativeSite: NativeSite | undefined;
  // True whenever the project is native (it has `index.html` at its root),
  // even when its sources fail to load: the preview then shows the error
  // instead of the plain file browser.
  let nativeEngaged = false;
  const nativeBaseSources = ports.clean.base;
  // Every file on the branch; pages are routed by where they are
  // (shared/native-routes.ts) and components found by convention
  // (shared/native-project.ts), so this list, with new files drafted in the
  // browser (`nativeFiles`), decides the site's pages and components.
  let nativeBaseFiles: string[] = [];
  const state: NativeSiteState = {
    opaqueText: new Map(), componentStyles: new Map(), missingComponentStyles: new Set(), componentStyleRequests: new Set(),
    styleFiles: new Set(), missingStyleFiles: new Set(), styleFileRequests: new Set(), unreadable: new Map(), projectWarnings: [],
    request: 0, textIndexing: undefined, textIndexScope: "", textIndexed: false, releaseTextIndex: undefined, shownRequests: new Map(),
    assets: new Map(), missingAssets: new Set(), assetRequests: new Map(), assetRequestId: 0, draftAssets: new Set(),
    paintedRequest: -1, paintedPaths: [], paintWaiters: [],
  };

  // Every page, component and style file to its effective source: a mounted
  // editor model wins, then a saved/new browser draft, then the clean snapshot
  // baseline. A plan passes its `r` as `effective`.
  function nativeSources(site = nativeSite, effective?: (path: string) => string | undefined): Record<string, string> {
    const scope = ports.scope();
    return site ? nativeSiteSources(site, effective ?? (path => nativeEffectiveSource(path, scope))) : {};
  }
  /** The site's pages, templates and stylesheets as `effective` reads them. */
  function nativeSiteSources(site: NativeSite, effective: (path: string) => string | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    const paths = new Set([...nativeSitePaths(site), ...state.componentStyles.values()]);
    for (const path of paths) out[path] = effective(path) ?? "";
    // A style file that is neither in the branch nor a draft stays out, so
    // the preview reports the link or import as missing.
    for (const path of [...state.styleFiles, ...state.missingStyleFiles]) {
      if (Object.hasOwn(out, path)) continue;
      const content = effective(path);
      if (content !== undefined) out[path] = content;
    }
    return out;
  }

  function nativeEffectiveSource(path: string, scope = ports.scope()) {
    return effectiveText(path, {
      mounted: (file) => ports.mounted(file),
      draft: (file) => scope ? ports.drafts().get(scope, file) : undefined,
      base: (file) => nativeBaseSources.get(file),
    });
  }

  // The site's sub-folder from its Site address (`/my-site`); none at a domain root.
  function nativePrefix() {
    return nativeSitePrefix(nativeEffectiveSource(NATIVE_CONFIG_PATH) ?? "");
  }

  // Every file the page on show draws from: its page, templates and stylesheets.
  function nativeShownPaths(route = ports.route()) {
    if (!nativeSite) return new Set<string>();
    const site = nativeSite, scope = ports.scope(), files = new Set(nativeFiles(scope));
    const page = (route !== undefined && site.routes[route]) || site.routes[nativeDefaultRoute(site)];
    const open = ports.openFile();
    const pages = [page, ...(open ? [open] : [])];
    return new Set([...nativeShownFiles(site, pages, (path) => nativeEffectiveSource(path, scope), (path) => files.has(path), nativePrefix()).files, ...ports.pageStyles()]);
  }

  // Text read for usage (scripts, data, notes…) is kept out of the preview source map and out of
  // nativeEffectiveSource, whose readers (the draft store's commit check) know only HTML and CSS.
  // Media batches and guarded file operations read it through mediaTextSource.
  function mediaTextSource(path: string, scope = ports.scope()) {
    const held = nativeEffectiveSource(path, scope);
    const draft = scope ? ports.drafts().get(scope, path) : undefined;
    if (draft?.opaque && !draft.deleted && scope) {
      const cached = state.opaqueText.get(draftKey(scope, path));
      return cached?.sha === draft.sourceSha ? cached?.text : undefined;
    }
    if (held !== undefined || draft) return held;
    return ports.clean.peek("", ports.textKey(), path);
  }

  // Every file of the site as drafted: the branch's not deleted, renamed or
  // moved away, and new files drafted in the browser in `scope`. Pages and
  // components are found from these.
  function nativeFiles(scope = ports.scope(), base = nativeBaseFiles): string[] {
    const drafts = scope ? ports.drafts().list(scope) : [];
    const drafted = newDraftPaths(drafts);
    const gone = new Set(drafts.filter((draft) => draft.deleted).map((draft) => draft.path));
    return [...new Set([...base.filter((path) => !gone.has(path)), ...drafted])];
  }

  // Paths of the new files (drafts with no base blob) in the scope.
  function scopeNewDraftPaths(options: NewDraftOptions = {}, scope = ports.scope()) {
    return scope ? newDraftPaths(ports.drafts().list(scope), options) : [];
  }

  // Best effort: whether any predicted file was read. A failure leaves them
  // unread; so does a newer load (`live` false), whose sources it must not touch.
  async function readNativePredicted(repo: string, paths: string[], live: () => boolean) {
    const owner = {};
    paths.forEach((path) => state.shownRequests.set(path, owner));
    try {
      const entries = await Promise.all(paths.map((path) => ports.find(path)));
      if (!live()) return false;
      const found = paths.flatMap((path, index) => (entries[index] ? [{ path, sha: entries[index]!.sha }] : []));
      if (!found.length) return false;
      const { texts, unreadable } = await ports.readTexts(repo, found);
      if (!live()) return false;
      ports.unreadable(unreadable);
      let read = false;
      for (const file of found) {
        const text = texts.get(file.path);
        if (nativeBaseSources.has(file.path) || text === undefined) continue;
        nativeBaseSources.set(file.path, text);
        read = true;
      }
      return read;
    } catch {
      return false;
    } finally {
      paths.forEach((path) => { if (state.shownRequests.get(path) === owner) state.shownRequests.delete(path); });
    }
  }

  // After a successful save, the committed content becomes the new clean baseline.
  // Without this, `reconcilePublished` drops each committed browser draft (a draft
  // whose content equals its baseline is pruned), so a saved file that is not the
  // open editor model would otherwise fall back to the stale pre-save
  // `nativeBaseSources` and the preview would revert to the old content. Guarded so
  // a repo/branch switch that superseded the in-flight save never leaks results.
  function adoptNativeBaseSources(
    scope: { account: string; repoId: number; branch: string },
    result: PublishResult,
    submitted: SavedDraft[],
  ) {
    if (!nativeEngaged || !holdsDraftScope(ports.shown(), scope)) return;
    const removed = new Set(result.deleted ?? []);
    for (const draft of submitted) {
      if (draft.deleted) {
        if (!removed.has(draft.path)) continue;
        nativeBaseSources.delete(draft.path);
        nativeBaseFiles = nativeBaseFiles.filter((path) => path !== draft.path);
        continue;
      }
      if (!draft.opaque) nativeBaseSources.set(draft.path, draft.content);
      if (!nativeBaseFiles.includes(draft.path)) nativeBaseFiles = [...nativeBaseFiles, draft.path];
    }
    if (nativeSite) ports.changed();
  }

  function deactivateNative() {
    nativeSite = undefined;
    nativeBaseFiles = [];
    nativeEngaged = false;
    nativeBaseSources.clear();
    state.opaqueText.clear();
    state.componentStyles.clear();
    state.missingComponentStyles.clear();
    state.componentStyleRequests.clear();
    state.styleFiles.clear();
    state.missingStyleFiles.clear();
    state.styleFileRequests.clear();
    state.unreadable.clear();
    state.shownRequests.clear();
    state.textIndexing = undefined;
    state.textIndexed = false;
    state.releaseTextIndex = undefined;
    state.assets.clear();
    state.missingAssets.clear();
    state.assetRequests.clear();
    state.request++;
    ports.closed();
  }

  return {
    get site() { return nativeSite; },
    set site(site: NativeSite | undefined) { nativeSite = site; },
    get engaged() { return nativeEngaged; },
    set engaged(engaged: boolean) { nativeEngaged = engaged; },
    /** GitHub's layer: the texts read from the branch and every file on it. */
    base: {
      sources: nativeBaseSources,
      get files() { return nativeBaseFiles; },
      set files(files: string[]) { nativeBaseFiles = files; },
    },
    state,
    source: nativeEffectiveSource,
    textSource: mediaTextSource,
    files: nativeFiles,
    newDraftPaths: scopeNewDraftPaths,
    sources: nativeSources,
    prefix: nativePrefix,
    shownPaths: nativeShownPaths,
    readPredicted: readNativePredicted,
    adoptSaved: adoptNativeBaseSources,
    reset: deactivateNative,
  };
}
