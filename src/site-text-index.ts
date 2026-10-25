// The site's text index: every page, template and stylesheet read after the
// first paint (or at once when something needs it), the gate that waits for
// it, the first-paint wait, and the Pages tree's titles held back while a row
// is in use. The host (src/main.ts) keeps the session, the site runtime, the
// preview and the explorer, and hands them in as live ports.

import type { Repository, TreeEntry } from "../shared/types";
import type { NativeSite } from "../shared/native-project";
import type { AppStore } from "./app-store";
import type { createNativePreview } from "./components/native-preview";
import { draftStore, type DraftScope } from "./drafts";
import type { SiteIndexGate } from "./native-boot";
import type { createNativeSiteRuntime } from "./native-site-runtime";
import type { createSiteLoading } from "./site-loading";
import type { SessionStamp, WorkspaceSession } from "./workspace-session";

type SiteLoading = ReturnType<typeof createSiteLoading>;

export interface SiteTextIndexPorts {
  runtime: ReturnType<typeof createNativeSiteRuntime>;
  appStore: Pick<AppStore, "repository" | "snapshot">;
  workspaceSession: Pick<WorkspaceSession, "begin">;
  /** Host state, read at call time. */
  readonly mediaController: { refreshUsage(): void };
  readonly pagesAndFiles: { readonly pagesTree: { busy(): boolean } | undefined };
  readonly pagesController: { renderTree(): void };
  readonly componentTools: { refresh(): void } | undefined;
  readonly nativePreview: Pick<ReturnType<typeof createNativePreview>, "setError" | "choicesChanged"> | undefined;
  readonly pageStructure: { refreshMeta(): void } | undefined;
  /** The preview holds sources older than the editor's. */
  nativePreviewBehind: boolean;
  element: <T extends HTMLElement>(id: string) => T;
  currentLoad: () => number;
  draftScope: () => DraftScope | undefined;
  findEntry: (path: string) => Promise<TreeEntry | undefined>;
  updateNativePreviewSources: () => void;
  updateAgentContext: () => void;
  readNativeTexts: SiteLoading["readNativeTexts"];
  noteNativeUnreadable: SiteLoading["noteNativeUnreadable"];
  updateCurrentPageLabel: () => void;
}

// The files read with the site (pages, templates, stylesheets), so links
// to a page are found in all of them; at most 2000.
export const isNativeTextFile = (path: string) => /\.(?:html|css)$/i.test(path) && !path.startsWith("node_modules/");

export function createSiteTextIndex(ports: SiteTextIndexPorts) {
  function nativeTextIndexScopeKey() {
    return ports.appStore.repository.value && ports.appStore.snapshot.value && ports.runtime.site ? `${ports.appStore.repository.value.full_name}\n${ports.appStore.snapshot.value.branch}\n${ports.appStore.snapshot.value.commit}\n${ports.runtime.state.request}` : "";
  }

  // The site's text index: every page, template and stylesheet (with the
  // editor's page data), so links, search, shared sections and agents see the
  // whole site. At boot (`deferred`) it is read once the preview has painted
  // and the browser is idle; anything that needs it sooner asks for it
  // (ensureNativeTextIndex, wantNativeTextIndex) and it is read at once.
  function startNativeTextIndex(repo: Repository, site: NativeSite, scope: DraftScope | undefined, at: SessionStamp, request: number, deferred = false) {
    ports.runtime.state.textIndexScope = nativeTextIndexScopeKey();
    ports.runtime.state.textIndexed = false;
    const commit = ports.appStore.snapshot.value?.commit;
    const live = () => at.holds() && request === ports.runtime.state.request && ports.appStore.snapshot.value?.commit === commit && ports.runtime.site === site;
    let release!: () => void;
    const due = new Promise<void>((resolve) => { release = resolve; });
    ports.runtime.state.releaseTextIndex = release;
    if (deferred) afterNativePaint(request, release);
    else release();
    const indexing: Promise<boolean> = due.then(() => (live() ? indexNativeTextFiles(repo, site, scope, live) : false)).then((done) => {
      if (done && live() && ports.runtime.state.textIndexing === indexing) ports.runtime.state.textIndexed = true;
      if (live()) ports.mediaController.refreshUsage();
      return done;
    }, (error) => {
      if (live() && ports.runtime.site === site) ports.nativePreview?.setError(error instanceof Error ? error.message : "Native sources could not be loaded.");
      return false;
    });
    ports.runtime.state.textIndexing = indexing;
  }
  /** Starts the text index now, if it is waiting for the first paint. */
  function wantNativeTextIndex() {
    ports.runtime.state.releaseTextIndex?.();
  }
  // The text index as a gate (src/native-boot.ts): waited for without being
  // asked for sooner, and only a complete read for the open repository,
  // branch and commit counts.
  const nativeTextIndexGate: SiteIndexGate = {
    key: () => `${ports.currentLoad()}\n${nativeTextIndexScopeKey()}`,
    indexed: () => !ports.runtime.site || ports.runtime.state.textIndexed,
    settled: () => (ports.runtime.state.textIndexing ? ports.runtime.state.textIndexing.catch(() => false) : Promise.resolve(ports.runtime.state.textIndexed)),
    ensure: () => ensureNativeTextIndex(),
  };

  // Work that waits for a native site's first paint (the runtime reporting the
  // page's structure), then for the browser to be idle. A preview that does
  // not paint (an error) holds nothing back for long.
  const whenIdle = (run: () => void) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => run(), { timeout: 300 });
    else setTimeout(run, 50);
  };
  function afterNativePaint(request: number, run: () => void) {
    if (ports.runtime.state.paintedRequest === request) { whenIdle(run); return; }
    ports.runtime.state.paintWaiters = ports.runtime.state.paintWaiters.filter((waiter) => waiter.request === ports.runtime.state.request);
    ports.runtime.state.paintWaiters.push({ request, run });
    setTimeout(run, 10_000);
  }
  function noteNativePainted() {
    if (ports.runtime.state.paintedRequest === ports.runtime.state.request) return;
    ports.runtime.state.paintedRequest = ports.runtime.state.request;
    ports.runtime.state.paintedPaths = [...ports.runtime.base.sources.keys()];
    const due = ports.runtime.state.paintWaiters.filter((waiter) => waiter.request === ports.runtime.state.paintedRequest);
    ports.runtime.state.paintWaiters = [];
    // The runtime reports the structure just before the frame presents it:
    // two frames and a beat later the page is on screen.
    if (due.length) requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => due.forEach((waiter) => whenIdle(waiter.run)), 100)));
  }

  // Titles loaded while a row is being used wait until that interaction ends.
  // The originating index and explorer must still be current when work resumes.
  let pendingNativePageTitles: { host: HTMLElement; live(): boolean } | undefined;
  let nativePageTitlePointer: { id: number } | undefined;
  // Capture before a row menu's outside-pointer listener or an input's blur.
  // The click may stop propagation, so observe it in capture but finish in a task
  // after that click's target handlers have completed. Mouse pointerup also queues
  // a no-click fallback. Touch/pen wait for their potentially delayed click, but
  // only for a grace period: the gesture may end without a click, and the click
  // need not carry the same pointerId.
  const NATIVE_PAGE_TITLE_TAP_GRACE_MS = 1000;
  document.addEventListener("pointerdown", event => {
    if (event.button === 0) nativePageTitlePointer = { id: event.pointerId };
  }, true);
  function finishNativePageTitlePointer(event?: Event) {
    const pointer = nativePageTitlePointer;
    if (pointer === undefined || event instanceof PointerEvent && event.pointerId !== pointer.id) return;
    setTimeout(() => {
      if (nativePageTitlePointer !== pointer) return;
      nativePageTitlePointer = undefined;
      flushPendingNativePageTitles();
    }, 0);
  }
  document.addEventListener("click", finishNativePageTitlePointer, true);
  document.addEventListener("pointerup", event => {
    if (event.pointerType === "mouse") {
      finishNativePageTitlePointer(event);
      return;
    }
    const pointer = nativePageTitlePointer;
    if (pointer?.id !== event.pointerId) return;
    setTimeout(() => {
      if (nativePageTitlePointer === pointer) finishNativePageTitlePointer();
    }, NATIVE_PAGE_TITLE_TAP_GRACE_MS);
  }, true);
  document.addEventListener("pointercancel", finishNativePageTitlePointer, true);
  document.addEventListener("dragend", finishNativePageTitlePointer, true);
  window.addEventListener("blur", finishNativePageTitlePointer);

  function pagesBusy(explorer: HTMLElement) {
    return nativePageTitlePointer !== undefined || Boolean(ports.pagesAndFiles.pagesTree?.busy()) || explorer.matches(":popover-open") &&
      Boolean(explorer.querySelector("[role=menu]:not([hidden]), input:focus, [popover]:popover-open:not(.editor-toast)"));
  }
  function flushPendingNativePageTitles() {
    const pending = pendingNativePageTitles;
    if (!pending) return;
    // A menu action can open Rename or a URL editor in the same turn.
    queueMicrotask(() => {
      if (pendingNativePageTitles !== pending) return;
      if (!pending.live() || pending.host !== ports.element("explorer")) { pendingNativePageTitles = undefined; return; }
      if (pagesBusy(pending.host)) return;
      // render() closes row interactions itself: consume this work before rendering.
      pendingNativePageTitles = undefined;
      ports.pagesController.renderTree();
    });
  }

  async function indexNativeTextFiles(repo: Repository, site: NativeSite, scope: DraftScope | undefined, live: () => boolean) {
    const files = ports.runtime.files(scope).filter((path) => isNativeTextFile(path)).slice(0, 2000);
    const wanted = files.filter((path) => {
      const draft = scope ? draftStore().get(scope, path) : undefined;
      return !ports.runtime.base.sources.has(path) && !ports.runtime.state.unreadable.has(path) && draft?.baseSha !== null && !draft?.deleted;
    });
    const entries = await Promise.all(wanted.map((path) => ports.findEntry(path)));
    if (!live() || ports.runtime.site !== site) return false;
    const sources = wanted.flatMap((path, index) => (entries[index] ? [{ path, sha: entries[index]!.sha }] : []));
    // A file GitHub cannot give as text is skipped: the index is complete
    // without it, and whatever needs its text says so where it is used.
    const { texts, unreadable } = await ports.readNativeTexts(repo.full_name, sources);
    if (!live() || ports.runtime.site !== site) return false;
    if (unreadable.length) { ports.noteNativeUnreadable(unreadable); ports.nativePreviewBehind = true; }
    const loaded: string[] = [];
    for (const source of sources) {
      const text = texts.get(source.path);
      if (ports.runtime.base.sources.has(source.path) || !ports.runtime.base.files.includes(source.path) || text === undefined) continue;
      ports.runtime.base.sources.set(source.path, text);
      loaded.push(source.path);
    }
    if (loaded.length) {
      // The page on show is drawn again only when what it shows was read
      // (a template, its stylesheets): other pages reach the preview with the
      // next update, or when a link shows one (onRouteShown), so a text edit
      // under way is not interrupted by a redraw.
      const templates = new Set(Object.values(site.components));
      const shown = ports.runtime.shownPaths();
      if (loaded.some((path) => templates.has(path) || shown.has(path))) ports.updateNativePreviewSources();
      else { ports.nativePreviewBehind = true; ports.nativePreview?.choicesChanged(); }
      // Titles, headings and templates of every page are known now.
      ports.updateAgentContext();
      ports.pageStructure?.refreshMeta();
      // An open Pages & files with a menu or a rename on a row keeps its rows
      // until the interaction ends; otherwise titles show at once (the pane mounts
      // before the index is read, so Pages may well be open by now).
      const explorer = ports.element("explorer");
      if (pagesBusy(explorer)) pendingNativePageTitles = { host: explorer, live };
      else ports.pagesController.renderTree();
      ports.updateCurrentPageLabel();
      ports.componentTools?.refresh();
    }
    return true;
  }

  async function ensureNativeTextIndex() {
    wantNativeTextIndex();
    const before = nativeTextIndexScopeKey();
    if (ports.runtime.state.textIndexing && ports.runtime.state.textIndexScope !== before) {
      if (!ports.appStore.repository.value || !ports.appStore.snapshot.value || !ports.runtime.site) return "The repository changed meanwhile. Try again.";
      startNativeTextIndex(ports.appStore.repository.value, ports.runtime.site, ports.draftScope(), ports.workspaceSession.begin(), ports.runtime.state.request);
    }
    let ready = ports.runtime.state.textIndexing ? await ports.runtime.state.textIndexing : true;
    if (before !== nativeTextIndexScopeKey()) return "The repository changed meanwhile. Try again.";
    if (!ready && ports.appStore.repository.value && ports.runtime.site) {
      const repo = ports.appStore.repository.value, site = ports.runtime.site, scope = ports.draftScope(), at = ports.workspaceSession.begin(), request = ports.runtime.state.request;
      ports.runtime.state.textIndexing = undefined;
      startNativeTextIndex(repo, site, scope, at, request);
      ready = await ports.runtime.state.textIndexing!;
      if (before !== nativeTextIndexScopeKey()) return "The repository changed meanwhile. Try again.";
    }
    return ready ? undefined : "The site's links could not be fully read. Refresh the repository and try again.";
  }

  /** Rendering the Pages tree, or letting the site go, consumes queued title work. */
  function clearPendingTitles() {
    pendingNativePageTitles = undefined;
  }

  return {
    nativeTextIndexScopeKey, startNativeTextIndex, wantNativeTextIndex, nativeTextIndexGate, afterNativePaint, noteNativePainted,
    flushPendingNativePageTitles, ensureNativeTextIndex, clearPendingTitles,
  };
}
