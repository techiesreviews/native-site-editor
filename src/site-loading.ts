// Site loading: reading a native site's pages, templates, stylesheets,
// component styles and assets for the preview, its files for Download site,
// opening it (activateNativeSite), the top bar's page label, the file readers
// and unreadable-file warnings. The host (src/main.ts) keeps the session, the
// site runtime, the preview and the editor, and hands them in as live ports.

import type { Repository, Snapshot, TreeEntry } from "../shared/types";
import { assetType, audioType, blobUrl, CANVAS_AUDIO_MAX_BYTES, isFontType } from "../shared/asset-types";
import { expandStyleImports, resolveImportPath, rewriteCssUrls } from "../shared/css-imports";
import { NATIVE_CONFIG_PATH, NATIVE_HOME_PAGE, nativeComponentCssPath, nativeDefaultRoute, nativePageStylesheets, nativeSitePaths, resolveNativeProject, type NativeSite } from "../shared/native-project";
import { nativePageRoute } from "../shared/native-routes";
import { isNewDraft } from "../shared/site-overlay";
import type { AppStore } from "./app-store";
import type { CleanSourceCache } from "./clean-source-cache";
import type { createNativePreview } from "./components/native-preview";
import type { PreviewSelectionController } from "./controllers/preview-selection-controller";
import { draftStore, type DraftScope } from "./drafts";
import { ApiError, unanswered } from "./github-reads";
import { dataUrlOf, loadNativeAssetRequests } from "./native-assets";
import { nativeBootExtras, nativeBootStyleExtras, nativeShownFiles, readSiteTexts, unreadableNeededFile, type UnreadableFile } from "./native-boot";
import { firstHeadingText, nativePageLabel } from "./native-pages";
import type { createNativeSiteRuntime } from "./native-site-runtime";
import { readStyleFiles } from "./native-style-files";
import { fetchWithReadRetry } from "./read-retry";
import { readFileText, readFileTexts, type RepositoryApi, type RepositoryIndex } from "./repository-loading";
import type { SiteFiles } from "./site-download";
import { sweepUploads, uploadBytes, uploadDataUrl } from "./uploads";
import type { SessionStamp, WorkspaceSession } from "./workspace-session";

export interface SiteLoadingPorts {
  runtime: ReturnType<typeof createNativeSiteRuntime>;
  appStore: Pick<AppStore, "repository" | "snapshot" | "openFile">;
  workspaceSession: Pick<WorkspaceSession, "begin">;
  api: RepositoryApi;
  cleanSources: CleanSourceCache;
  /** Host state, read at call time. */
  readonly repositoryIndex: Pick<RepositoryIndex, "listRepositoryFiles">;
  readonly nativePreview: Pick<ReturnType<typeof createNativePreview>, "preload" | "activate" | "update" | "setAssets" | "setError" | "setWarnings" | "setUnreadable" | "route" | "shownRoute"> | undefined;
  readonly pageStructure: { refreshMeta(): void } | undefined;
  readonly previewSelection: Pick<PreviewSelectionController, "editableTemplatePath">;
  readonly versions: { readonly view?: { path: string } };
  element: <T extends HTMLElement>(id: string) => T;
  draftScope: () => DraftScope | undefined;
  findEntry: (path: string) => Promise<TreeEntry | undefined>;
  entryAt: (path: string) => TreeEntry | undefined;
  nativeLinkedSheets: (site: NativeSite, sources: Record<string, string>) => string[];
  updateNativePreviewSources: () => void;
  updateNativePreviewAssets: () => void;
  nativeModeActive: () => boolean;
  withSiteConfig: (sources: Record<string, string>) => Record<string, string>;
  nativeRouteForPath: (path: string | undefined) => string | undefined;
  nativeRouteInfo: (route: string) => { title?: string };
  updateAgentContext: () => void;
  startNativeTextIndex: (repo: Repository, site: NativeSite, scope: DraftScope | undefined, at: SessionStamp, request: number, deferred?: boolean) => void;
}

export function createSiteLoading(ports: SiteLoadingPorts) {
  // Reads the stylesheets the pages link and the files those `@import` that
  // are not loaded yet, following imports of imports, into the base sources.
  // True when any loaded.
  function readNativeStyleFiles(repo: string, site: NativeSite, live: () => boolean) {
    const scope = ports.draftScope();
    return readStyleFiles({
      wanted: () => {
        const sources = ports.runtime.sources(site), linked = ports.nativeLinkedSheets(site, sources);
        return [...linked, ...expandStyleImports(linked.filter((path) => Object.hasOwn(sources, path)), (path) => sources[path], undefined, ports.runtime.prefix()).imported]
          .filter((path) => !Object.hasOwn(sources, path));
      },
      skipped: (path) => ports.runtime.state.missingStyleFiles.has(path) || ports.runtime.state.unreadable.has(path) || ports.runtime.state.styleFileRequests.has(path),
      // A stylesheet drafted here (new, or moved) is its draft; one read with the site is there.
      draft: (path) => (scope ? draftStore().get(scope, path) : undefined),
      read: (path) => ports.runtime.base.sources.has(path),
      find: (path) => ports.findEntry(path),
      readTexts: (found) => readNativeTexts(repo, found),
      live,
      reading: (paths, on) => paths.forEach((path) => (on ? ports.runtime.state.styleFileRequests.add(path) : ports.runtime.state.styleFileRequests.delete(path))),
      shown: (path, text) => { if (text !== undefined) ports.runtime.base.sources.set(path, text); ports.runtime.state.styleFiles.add(path); },
      missing: (path) => ports.runtime.state.missingStyleFiles.add(path),
      unreadable: noteNativeUnreadable,
    });
  }

  // Reads what the pages `pages` show that is not read yet (src/native-boot.ts):
  // the pages, the component templates they use with their stylesheets, and
  // the stylesheets they link with their imports, a level at a time, each
  // level in one request; `extra` comes with the first. Stylesheets read here
  // are taken up by readNativeStyleFiles and component stylesheets by
  // `runtime.state.componentStyles`. True when anything was read.
  async function readNativeShownFiles(repo: string, site: NativeSite, pages: string[], live: () => boolean, extra: string[] = [], predicted: string[] = []) {
    const scope = ports.draftScope();
    const held = (path: string) => ports.runtime.base.sources.has(path) || Boolean(scope && draftStore().get(scope, path));
    const fileSet = new Set(ports.runtime.files(scope));
    const isFile = (path: string) => fileSet.has(path);
    let loaded = false, first = true;
    for (let round = 0; round < 20; round++) {
      // A file that cannot be read as text is not asked for again: a
      // stylesheet is left out of the page, and a page or template the page
      // needs is the preview's error (nativeUnreadableShown).
      const shown = nativeShownFiles(site, pages, (path) => ports.runtime.source(path, scope), isFile, ports.runtime.prefix());
      for (const [tag, css] of shown.componentCss)
        if (held(css) && !ports.runtime.state.componentStyles.has(tag)) { ports.runtime.state.componentStyles.set(tag, css); loaded = true; }
      for (const tag of shown.missingComponentCss) ports.runtime.state.missingComponentStyles.add(tag);
      const wanted = [...new Set([...shown.files, ...(first ? extra : [])])].filter((path) =>
        !held(path) && !ports.runtime.state.missingStyleFiles.has(path) && !ports.runtime.state.unreadable.has(path) && !ports.runtime.state.shownRequests.has(path));
      // Predicted files (the site's own stylesheets) come in the same wave but
      // apart: one that cannot be read (not UTF-8) fails only its own batch,
      // and a sheet a page links is then read in a later round as usual.
      const guessed = round === 0 ? predicted.filter((path) => !wanted.includes(path) && !held(path) && !ports.runtime.state.shownRequests.has(path)) : [];
      first = false;
      if (!wanted.length && !guessed.length) break;
      const guessing = guessed.length ? ports.runtime.readPredicted(repo, guessed, live) : Promise.resolve(false);
      if (!wanted.length) {
        if (await guessing) loaded = true;
        if (!live()) return false;
        continue;
      }
      const owner = {};
      wanted.forEach((path) => ports.runtime.state.shownRequests.set(path, owner));
      try {
        const entries = await Promise.all(wanted.map((path) => ports.findEntry(path)));
        if (!live()) return false;
        const found = wanted.flatMap((path, index) => (entries[index] ? [{ path, sha: entries[index]!.sha }] : []));
        // A linked stylesheet that is not in the branch is reported by the preview.
        wanted.forEach((path, index) => { if (!entries[index] && /\.css$/i.test(path)) ports.runtime.state.missingStyleFiles.add(path); });
        const { texts, unreadable } = await readNativeTexts(repo, found);
        if (!live()) return false;
        // Checked at the next round's start, with what this read brought.
        if (unreadable.length) { noteNativeUnreadable(unreadable); loaded = true; }
        for (const file of found) {
          const text = texts.get(file.path);
          if (ports.runtime.base.sources.has(file.path) || text === undefined) continue;
          ports.runtime.base.sources.set(file.path, text);
          loaded = true;
        }
        if (await guessing) loaded = true;
        if (!live()) return false;
        // Files that are not in the branch are not asked for again.
        if (!found.length) break;
      } finally {
        wanted.forEach((path) => { if (ports.runtime.state.shownRequests.get(path) === owner) ports.runtime.state.shownRequests.delete(path); });
      }
    }
    return loaded;
  }

  // The page on show, before the text index has read the whole site: what it
  // shows that is not read yet (a page followed by a link, a component an
  // edit added) is read, and the preview drawn again.
  async function loadNativeShownFiles(route = ports.nativePreview?.route()) {
    if (!ports.runtime.site || !ports.appStore.repository.value || !ports.appStore.snapshot.value || ports.runtime.state.textIndexed) return;
    const site = ports.runtime.site;
    const request = ports.runtime.state.request;
    const at = ports.workspaceSession.begin();
    const live = () => at.holds() && request === ports.runtime.state.request && ports.runtime.site === site;
    const page = (route !== undefined && site.routes[route]) || site.routes[nativeDefaultRoute(site)];
    let loaded = false;
    try {
      loaded = await readNativeShownFiles(ports.appStore.repository.value.full_name, site, [page], live);
    } catch {
      // The text index reads them again.
    }
    if (loaded && live()) ports.updateNativePreviewSources();
  }

  async function loadNativeStyleFiles() {
    if (!ports.runtime.site || !ports.appStore.repository.value || !ports.appStore.snapshot.value) return;
    const site = ports.runtime.site;
    const request = ports.runtime.state.request;
    const at = ports.workspaceSession.begin();
    const live = () => at.holds() && request === ports.runtime.state.request && ports.runtime.site === site;
    let loaded = false;
    try {
      loaded = await readNativeStyleFiles(ports.appStore.repository.value.full_name, site, live);
    } catch {
      // The preview reports the stylesheet as missing.
    }
    if (loaded && live()) ports.updateNativePreviewSources();
  }

  // Images and fonts the page on show, its components and stylesheets refer
  // to, read once per path as data URLs so the sandboxed frame can show them
  // (it has an opaque origin: neither the session cookie nor the editor's blob:
  // URLs reach it). The bytes come from `/api/blob` by SHA, which the browser
  // caches for good, so a reload reads them from its cache. They are read after
  // the page is drawn and shown in place as they arrive (fonts get a short
  // head start, NATIVE_FONT_WAIT_MS); a path that is not in the branch (or not
  // an image or font) is remembered as missing and left as written.
  const NATIVE_FONT_WAIT_MS = 300;
  // The sources of what the page `file` shows: the page, every component and
  // component stylesheet, and the stylesheets it links with their imports.
  function nativePageShownSources(site: NativeSite, file: string) {
    const sources = ports.runtime.sources(site);
    const linked = nativePageStylesheets(sources[file] ?? "", file, ports.runtime.prefix());
    const shown = new Set([file, ...Object.values(site.components), ...ports.runtime.state.componentStyles.values(), ...linked, ...expandStyleImports(linked, (path) => sources[path], undefined, ports.runtime.prefix()).imported]);
    return Object.fromEntries(Object.entries(sources).filter(([path]) => shown.has(path)));
  }
  // The sources of the page at `route` (the home page's for a component shown
  // alone), so its images are found.
  function nativeRouteShownSources(route: string | undefined) {
    if (!ports.runtime.site) return {};
    const site = ports.runtime.site;
    const file = (route && site.routes[route]) || site.routes[nativeDefaultRoute(site)];
    const sources = nativePageShownSources(site, file);
    return sources;
  }
  // The page the preview last drew; nothing before its first draw, so no
  // image is read before the page is on screen (onRouteShown reads them then).
  function nativeAssetSources() {
    const drawn = ports.nativePreview?.shownRoute();
    return drawn === undefined ? {} : nativeRouteShownSources(drawn);
  }
  // A blob's bytes from `/api/blob`, which the browser keeps in its cache (a blob never changes).
  async function readBlob(repo: string, sha: string, path?: string): Promise<Blob> {
    const response = await fetchWithReadRetry(blobUrl(repo, sha, path), { credentials: "same-origin" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new ApiError(response.status, data.error || "Could not load the file.");
    }
    return response.blob();
  }
  // Reads the assets `sources` name that are not read yet (only those `only`
  // keeps); `onProgress` runs as they arrive, in batches.
  async function loadNativeAssets(sources = nativeAssetSources(), onProgress = ports.updateNativePreviewAssets, only: (path: string) => boolean = () => true, fontsOnly = false) {
    if (!ports.appStore.repository.value || !ports.appStore.snapshot.value || !Object.keys(sources).length) return;
    const repo = ports.appStore.repository.value.full_name;
    const request = ports.runtime.state.request;
    const at = ports.workspaceSession.begin();
    const references = new Set<string>(), sounds = new Set<string>();
    if (fontsOnly) {
      // Font preloading precedes paint. The page-media scanner stays out of that boot path.
      for (const [file, source] of Object.entries(sources)) if (file.endsWith(".css")) rewriteCssUrls(source, url => {
        const path = resolveImportPath(file, url, ports.runtime.prefix());
        if (path) references.add(path);
        return undefined;
      });
    } else {
      const { scanMediaReferences } = await import("./page-builder/media-references");
      if (!at.holds() || request !== ports.runtime.state.request) return;
      for (const [file, source] of Object.entries(sources)) for (const ref of scanMediaReferences(file.endsWith(".css") || nativePageRoute(file) ? file : "index.html", source, undefined, ports.runtime.prefix())) {
        references.add(ref.path);
        // An audio player's file, so the canvas shows its length (a link to a recording is not read).
        if (ref.tag === "audio" || ref.tag === "source") sounds.add(ref.path);
      }
    }
    const typeOf = (path: string) => assetType(path) ?? (sounds.has(path) ? audioType(path) : undefined);
    const wanted = [...references].filter((path) =>
      typeOf(path) && only(path) && !ports.runtime.state.assets.has(path) && !ports.runtime.state.missingAssets.has(path) && !ports.runtime.state.assetRequests.has(path));
    if (!wanted.length) return;
    const assetRequest = ++ports.runtime.state.assetRequestId;
    wanted.forEach((path) => ports.runtime.state.assetRequests.set(path, assetRequest));
    const scope = ports.draftScope();
    const live = () => at.holds() && request === ports.runtime.state.request;
    const load = async ({ path, type }: { path: string; type: string }): Promise<string | undefined> => {
      // A drafted image: an upload's bytes from this browser, a moved or
      // copied one's blob; a deleted one is missing.
      const draft = scope ? draftStore().get(scope, path) : undefined;
      if (draft) ports.runtime.state.draftAssets.add(path);
      if (draft?.upload && sounds.has(path) && draft.upload.size > CANVAS_AUDIO_MAX_BYTES) return undefined;
      if (draft?.upload && scope) return uploadDataUrl(uploadBytes(), scope, draft).catch(() => undefined);
      // An SVG written as text here (the block placeholder, an edited one) shows its draft.
      if (draft && !draft.deleted && !draft.opaque && !draft.sourceSha && type === "image/svg+xml") return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(draft.content)}`;
      const entry = draft?.deleted ? undefined : draft?.sourceSha ? { sha: draft.sourceSha } : await ports.findEntry(path);
      if (!live()) return undefined;
      // A batch can place an image just before its upload draft becomes visible.
      if (scope && draftStore().get(scope, path) !== draft) return load({ path, type });
      if (!entry || (sounds.has(path) && ("size" in entry ? entry.size ?? 0 : 0) > CANVAS_AUDIO_MAX_BYTES)) return undefined;
      try {
        return await dataUrlOf(await readBlob(repo, entry.sha, path), type);
      } catch {
        return undefined;
      }
    };
    try {
      await loadNativeAssetRequests({
        requests: wanted.map((path) => ({ path, type: typeOf(path)! })),
        concurrency: 8,
        live,
        load,
        onLoaded: (path, dataUrl) => ports.runtime.state.assets.set(path, dataUrl),
        onMissing: (path) => ports.runtime.state.missingAssets.add(path),
        onProgress,
      });
    } finally {
      wanted.forEach((path) => {
        if (ports.runtime.state.assetRequests.get(path) === assetRequest) ports.runtime.state.assetRequests.delete(path);
      });
    }
  }
  function forgetDraftedAssets() {
    const scope = ports.draftScope();
    let forgot = false;
    for (const path of [...ports.runtime.state.assets.keys(), ...ports.runtime.state.missingAssets])
      if (ports.runtime.state.draftAssets.has(path) || (scope && draftStore().get(scope, path))) {
        forgot = ports.runtime.state.assets.delete(path) || forgot;
        ports.runtime.state.missingAssets.delete(path);
      }
    ports.runtime.state.draftAssets.clear();
    if (forgot && ports.nativeModeActive()) ports.updateNativePreviewSources();
    if (scope) void sweepUploads(uploadBytes(), scope, draftStore().list(scope)).catch(() => undefined);
  }

  async function loadNativeComponentStyles(tags: string[]) {
    if (!ports.runtime.site || !ports.appStore.repository.value || !ports.appStore.snapshot.value) return;
    const site = ports.runtime.site;
    const repo = ports.appStore.repository.value.full_name;
    const request = ports.runtime.state.request;
    const at = ports.workspaceSession.begin();
    const wanted = tags.filter((tag) =>
      Object.hasOwn(site.components, tag) &&
      !ports.runtime.state.componentStyles.has(tag) &&
      !ports.runtime.state.missingComponentStyles.has(tag) &&
      !ports.runtime.state.componentStyleRequests.has(tag),
    );
    if (!wanted.length) return;
    wanted.forEach((tag) => ports.runtime.state.componentStyleRequests.add(tag));
    try {
      const found: { tag?: string; path: string; sha: string }[] = [];
      const scope = ports.draftScope();
      const lookups: { tag?: string; path: string }[] = [];
      for (const tag of wanted) {
        const path = nativeComponentCssPath(site.components[tag]);
        // A stylesheet drafted here (new, or moved with its component) is its draft; a deleted one is missing.
        const draft = scope ? draftStore().get(scope, path) : undefined;
        // One that cannot be read as text is the component's all the same: it styles nothing.
        if ((draft && !draft.deleted) || (!draft && (ports.runtime.base.sources.has(path) || ports.runtime.state.unreadable.has(path)))) ports.runtime.state.componentStyles.set(tag, path);
        else if (draft?.deleted) ports.runtime.state.missingComponentStyles.add(tag);
        else lookups.push({ tag, path });
        // A component the page made on the fly, before the text index read its template.
        const template = site.components[tag];
        if (!ports.runtime.base.sources.has(template) && !ports.runtime.state.unreadable.has(template) && !(scope && draftStore().get(scope, template))) lookups.push({ path: template });
      }
      // Looked up together, read in one request.
      const entries = await Promise.all(lookups.map((lookup) => ports.findEntry(lookup.path)));
      if (!at.holds() || request !== ports.runtime.state.request || ports.runtime.site !== site) return;
      lookups.forEach((lookup, index) => {
        const entry = entries[index];
        if (entry) found.push({ ...lookup, sha: entry.sha });
        else if (lookup.tag) ports.runtime.state.missingComponentStyles.add(lookup.tag);
      });
      const { texts, unreadable } = await readNativeTexts(repo, found);
      if (!at.holds() || request !== ports.runtime.state.request || ports.runtime.site !== site) return;
      noteNativeUnreadable(unreadable);
      for (const file of found) {
        const text = texts.get(file.path);
        if (!ports.runtime.base.sources.has(file.path) && text !== undefined) ports.runtime.base.sources.set(file.path, text);
        if (file.tag) ports.runtime.state.componentStyles.set(file.tag, file.path);
      }
    } finally {
      wanted.forEach((tag) => ports.runtime.state.componentStyleRequests.delete(tag));
    }
    if (at.holds() && request === ports.runtime.state.request && ports.runtime.site === site) ports.updateNativePreviewSources();
  }

  // Every file on the branch, from the snapshot's recursive tree when it has
  // one, else from one recursive listing per top-level folder.
  async function listRepositoryFiles(repo: Repository, result: Snapshot): Promise<string[]> {
    return ports.repositoryIndex.listRepositoryFiles(ports.api, repo, result);
  }

  // The site as edited, for Download site and the site's address: every file
  // of the repository with its drafts. Undefined when no native site is open.
  async function nativeSiteFiles(): Promise<SiteFiles | undefined> {
    const repo = ports.appStore.repository.value;
    const scope = ports.draftScope();
    if (!repo || !scope || !ports.nativeModeActive()) return undefined;
    const draftAt = (path: string) => draftStore().get(scope, path);
    return {
      repository: repo.full_name,
      paths: ports.runtime.files(scope),
      held: (path) => ports.runtime.source(path, scope),
      blob: async (path) => {
        const draft = draftAt(path);
        if (draft?.deleted) return undefined;
        if (draft?.opaque) return draft.sourceSha;
        return (await ports.findEntry(path))?.sha;
      },
      readTexts: (shas) => readFiles(repo.full_name, shas),
      readBytes: async (sha) => new Uint8Array(await (await readBlob(repo.full_name, sha)).arrayBuffer()),
    };
  }

  // A repository with `index.html` at its root is a native site: its files
  // are listed, what the page on show (`openPath`, else the home page) needs
  // is read from the current snapshot, and the native preview activates; the
  // rest of the site follows after the first paint (the text index). All async
  // steps are guarded against a superseding navigation (`at`).
  async function activateNativeSite(repo: Repository, result: Snapshot, at: SessionStamp, openPath?: string) {
    // A new read: until its text index lands, nothing counts as indexed.
    const request = ports.runtime.begin();
    const live = () => at.holds() && request === ports.runtime.state.request;
    const placeholder: NativeSite = { routes: { "/": NATIVE_HOME_PAGE }, components: {} };
    const scope = ports.draftScope();
    // The home page first. Without it the project opens as plain files; once
    // it is there, the project is native and every later failure surfaces as
    // a native error rather than silently hiding the preview.
    // A home page written as a draft (Start your site) counts: the site is native before its first save.
    const draftedHome = scope ? draftStore().get(scope, NATIVE_HOME_PAGE) : undefined;
    if (!result.entries.some((entry) => entry.path === NATIVE_HOME_PAGE && entry.type === "blob") && !isNewDraft(draftedHome)) return false;
    ports.runtime.engaged = true;
    // Load the preview runtime, parked, alongside the file listing and page reads.
    ports.nativePreview?.preload();
    ports.runtime.site = undefined;
    try {
      ports.runtime.base.files = await listRepositoryFiles(repo, result);
    } catch (error) {
      if (!live()) return true;
      // GitHub not answering fails the open itself (the snapshot load's failed state and Try again).
      if (unanswered(error)) throw error;
      ports.nativePreview?.activate(placeholder);
      ports.nativePreview?.setError(error instanceof Error ? error.message : "The site's files could not be listed.");
      return true;
    }
    if (!live()) return true;
    const parsed = resolveNativeProject(ports.runtime.files(scope));
    if (!parsed.ok) {
      ports.nativePreview?.activate(placeholder);
      ports.nativePreview?.setWarnings([]);
      ports.nativePreview?.setError(parsed.error);
      return true;
    }
    const site = parsed.site;
    ports.runtime.clearReads();
    noteNativeUnreadable(undefined);
    try {
      // Only what the page on show needs renders first (src/native-boot.ts):
      // the page, its stylesheets with their imports and the components it
      // uses with theirs, a level at a time, each level's files in one read.
      // The site settings come too, for new pages' addresses. Every other
      // page and template is the text index, read after the first paint.
      const files = ports.runtime.files(scope);
      const opening = openPath && nativeSitePaths(site).includes(openPath) ? openPath : undefined;
      const currentFile = opening ?? (ports.appStore.openFile.value && nativeSitePaths(site).includes(ports.appStore.openFile.value) ? ports.appStore.openFile.value : site.routes[nativeDefaultRoute(site)]);
      // A component shown alone is drawn in the home page.
      const shownPages = [...new Set([nativePageRoute(currentFile) ? currentFile : site.routes[nativeDefaultRoute(site)], currentFile])];
      // Small sites' component templates (with their stylesheets) come with the page in its first read.
      const bootSize = (path: string) => {
        if (scope && draftStore().get(scope, path)) return 0;
        const entry = ports.entryAt(path);
        return entry?.type === "blob" ? entry.size : undefined;
      };
      const extras = nativeBootExtras(site, files, bootSize);
      // So do the site's own stylesheets when small: the sheets the page links and
      // their imports then need no serial reads before the paint.
      const styleExtras = nativeBootStyleExtras(site, files, bootSize);
      await readNativeShownFiles(repo.full_name, site, shownPages, live, [...(files.includes(NATIVE_CONFIG_PATH) ? [NATIVE_CONFIG_PATH] : []), ...extras], styleExtras);
      if (!live()) return true;
      // A page or template the page on show needs that cannot be read as text
      // fails the load with its path (known only once the sources that use it
      // are read: an extra read with them may be unused).
      const needed = nativeUnreadableShown(site, shownPages);
      if (needed) throw new Error(needed);
      // The stylesheets the pages link, and the files those import, render
      // with the first update; one that cannot be read is reported by the
      // preview, not here.
      try {
        await readNativeStyleFiles(repo.full_name, site, live);
      } catch {
        // Reported by the preview as a missing stylesheet.
      }
      if (!live()) return true;
      // The page's fonts get a short head start so its text does not show in a
      // fallback font first; images never hold the page back: they are read
      // after it is drawn and shown in place (see runtime.state.assets).
      await Promise.race([
        loadNativeAssets(nativePageShownSources(site, nativePageRoute(currentFile) ? currentFile : site.routes[nativeDefaultRoute(site)]), () => { if (ports.runtime.site === site) ports.updateNativePreviewAssets(); }, (path) => isFontType(assetType(path)), true).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, NATIVE_FONT_WAIT_MS)),
      ]);
      if (!live()) return true;
    } catch (error) {
      if (!live()) return true;
      if (unanswered(error)) throw error;
      ports.nativePreview?.activate(site);
      ports.nativePreview?.setError(error instanceof Error ? error.message : "Native sources could not be loaded.");
      return true;
    }
    if (!live()) return true;
    ports.runtime.site = site;
    ports.pageStructure?.refreshMeta();
    updateCurrentPageLabel();
    ports.nativePreview?.setError(undefined);
    showNativeWarnings(parsed.warnings);
    ports.nativePreview?.activate(site);
    ports.nativePreview?.update({
      sources: ports.withSiteConfig(ports.runtime.sources()),
      componentStyles: Object.fromEntries(ports.runtime.state.componentStyles),
      assets: Object.fromEntries(ports.runtime.state.assets),
      unreadable: nativePreviewUnreadable(),
      // The page about to open shows at once (its file opens next).
      route: ports.nativeRouteForPath(ports.appStore.openFile.value ?? openPath) ?? nativeDefaultRoute(site),
      editableTemplatePath: ports.previewSelection.editableTemplatePath(),
    });
    ports.updateAgentContext();
    ports.startNativeTextIndex(repo, site, scope, at, request, true);
    return true;
  }

  // The top bar names the open file: a page of the native site as the Pages
  // tab labels it (its `<title>`, else its first heading, else its URL;
  // "Home" for the home page), anything else by
  // its path, which the button's tooltip and `data-path` always give.
  function updateCurrentPageLabel() {
    const path = ports.appStore.openFile.value;
    const span = ports.element("current-page");
    const route = ports.nativeRouteForPath(path);
    const label = path && route && ports.runtime.site
      ? nativePageLabel(path, {
        routes: ports.runtime.site.routes,
        titles: { [route]: ports.nativeRouteInfo(route).title },
        heading: (file) => firstHeadingText(ports.runtime.source(file)),
      })
      : undefined;
    const text = label ?? path ?? "Select a page";
    if (span.textContent !== text) span.textContent = text;
    if (path) span.dataset.path = path;
    else delete span.dataset.path;
  }

  // Immutable blobs share the tab's disposable byte budget with pinned baselines.
  function readFile(repo: string, sha: string): Promise<string> {
    return readFileText(ports.api, ports.cleanSources, repo, sha);
  }
  // Reads many blobs in one request; anything already cached or in flight is
  // reused rather than fetched twice.
  async function readFiles(repo: string, shas: string[]): Promise<Record<string, string>> {
    return readFileTexts(ports.api, ports.cleanSources, repo, shas);
  }
  // The native site's reads: files GitHub cannot give as text are named, not thrown.
  function readNativeTexts(repo: string, files: { path: string; sha: string }[]) {
    return readSiteTexts(files, (shas) => readFiles(repo, shas));
  }
  // Remembers files that cannot be read as text (none: forgets them all): the
  // preview leaves them out quietly, and a stylesheet among them is a warning.
  function noteNativeUnreadable(files: UnreadableFile[] | undefined) {
    if (!files) ports.runtime.state.unreadable.clear();
    else if (!files.length) return;
    for (const file of files ?? []) ports.runtime.state.unreadable.set(file.path, file.message);
    ports.nativePreview?.setUnreadable(nativePreviewUnreadable());
    showNativeWarnings();
  }
  // The first page or template the pages `pages` show that cannot be read as
  // text and has no draft in its place, as "path: why".
  function nativeUnreadableShown(site: NativeSite, pages: string[]) {
    const scope = ports.draftScope(), files = new Set(ports.runtime.files(scope));
    const source = (path: string) => ports.runtime.source(path, scope);
    return unreadableNeededFile(nativeShownFiles(site, pages, source, (path) => files.has(path), ports.runtime.prefix()).files, (path) => source(path) !== undefined, ports.runtime.state.unreadable);
  }
  // The unreadable files with no draft (or History's earlier version) in their
  // place: the preview draws a page or template from that, and lets one without
  // say why it cannot.
  function nativePreviewUnreadable() {
    const scope = ports.draftScope();
    return new Map([...ports.runtime.state.unreadable].filter(([path]) => path !== ports.versions.view?.path && ports.runtime.source(path, scope) === undefined));
  }
  function showNativeWarnings(projectWarnings = ports.runtime.state.projectWarnings) {
    ports.runtime.state.projectWarnings = projectWarnings;
    const sheets = [...ports.runtime.state.unreadable].filter(([path]) => /\.css$/i.test(path))
      .map(([path, message]) => `${path}: ${message} The preview shows the site without it.`);
    ports.nativePreview?.setWarnings([...projectWarnings, ...sheets]);
  }

  return {
    readFile, readFiles, readBlob, readNativeTexts, noteNativeUnreadable, nativePreviewUnreadable, showNativeWarnings, updateCurrentPageLabel,
    loadNativeShownFiles, loadNativeStyleFiles, nativeRouteShownSources, loadNativeAssets, forgetDraftedAssets, loadNativeComponentStyles,
    listRepositoryFiles, nativeSiteFiles, activateNativeSite,
  };
}
