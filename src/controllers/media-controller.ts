import type { MediaUsageCheckPorts } from "./media-usage-controller";
import type { Stamp } from "../guarded-edit";
import type { DraftScope, SavedDraft } from "../drafts";
import type { DraftAccess } from "../file-changes";
import type { NativeSite, NativeTextEdit } from "../../shared/native-project";
import type { MediaWorkspaceContext, MediaWorkspaceBatch } from "../page-builder/media-workspace";
import type { MediaPathPlacement, MediaPickerOptions } from "../page-builder/media-picker";
type MediaLibraryView = ReturnType<typeof import("../page-builder/media-picker")["mountMediaLibrary"]>;
import type { MediaImage } from "../page-builder/media-markup";
import { mediaAttribute, mediaExistingAlt } from "../page-builder/media-attributes";
import { startTags } from "../../shared/html-source";
import type { EditBarControl } from "../components/edit-bar";
import { locateNativeElementRange } from "../native-source-location";
import { isImagePath } from "../native-structure";
import { removedCopies, uploadImageType } from "../uploads";

/** The videos a picture spot's picker lists beside its pictures: those browsers play. */
const VIDEO_ACCEPT = ".mp4,.m4v,.webm,.mov,.ogv";
const isVideoName = (name: string) => /\.(?:mp4|m4v|webm|mov|ogv|mkv|avi|mpe?g)$/i.test(name);
export interface MediaWorkspaceSnapshot {
  repo: string;
  /** The repository's size in KiB (GitHub); absent for local folders. */
  repoSize?: number;
  scope: DraftScope;
  identity: string;
  site?: NativeSite;
  nativePaths?: string[];
  drafts: DraftAccess & { list(scope: DraftScope): SavedDraft[] };
}
export interface MediaModule {
  openMediaPicker: (options: MediaPickerOptions & { adapter?: import("../page-builder/media-picker").MediaPickerHost }) => Promise<void>;
  closeMediaPicker: () => void;
  mountMediaLibrary: (container: HTMLElement, options: MediaPickerOptions & { refreshKey?: () => string; cleanUp?: import("../page-builder/media-picker").MediaCleanUpMount }) => MediaLibraryView;
}
export interface MediaControllerPorts {
  /** `slot`: `node` is a component instance; measure its fallback image in that slot (a first fill). */
  measureImage?(path: string, node: number[], image: { width?: number; height?: number }, slot?: string, style?: string): Promise<import("../page-builder/media-markup").MediaMeasured | undefined>;
  usage?: MediaUsageCheckPorts;
  /** The clean-up count: where it is remembered (repository and branch) and the controls that show it. */
  cleanUp?: { place(): string; marks(): HTMLElement[] };
  origins?(): string[];
  workspace(): MediaWorkspaceSnapshot | undefined;
  identity(): string;
  stamp(): Stamp;
  generation(): number;
  selected?(path: string, node: number[]): boolean;
  source(path: string, scope?: DraftScope): string | undefined;
  listPaths(workspace: MediaWorkspaceSnapshot): Promise<string[]>;
  findEntry(path: string): Promise<{ sha: string; size?: number } | undefined>;
  entry(path: string): { sha: string; size?: number } | undefined;
  readText(repo: string, sha: string): Promise<string>;
  rememberSource(path: string, source: string): void;
  uploadedBlob(scope: DraftScope, sha: string): Promise<Blob | undefined>;
  readBlob(repo: string, sha: string, path: string): Promise<Blob>;
  applyBatch(scope: DraftScope, stamp: Stamp, batch: MediaWorkspaceBatch): Promise<void>;
  openPage(path: string): Promise<void>;
  load(): Promise<MediaModule>;
  openFile(): string | undefined;
  viewingVersion(): boolean;
  restoreFile(path: string, generation: number): Promise<unknown>;
  change(path: string, source: string, edits: NativeTextEdit[], node: number[], message: string): boolean;
  /** DOM parser seam for source-only controller tests. Production uses the existing locator. */
  locateElement?: (source: string, node: number[]) => { tag: { name: string; start: number; end: number } } | undefined;
  galleryHost(): HTMLElement;
  galleryVisible(): boolean;
  mediaSelected(): boolean;
  gallerySignature(): string;
  observeBusy?(element: HTMLElement, changed: () => void): { disconnect(): void };
  refreshDescriptions(): void;
  /** Selects (and flashes) an element just placed, once the preview shows it. */
  select?(path: string, node: number[]): void;
  /** The place's name in the picker's heading: the page as the Pages tab names it. */
  placeLabel?(page: string): string | undefined;
  /** Where the image popup stands and what it shows on the page before Done. */
  imagePopup?: import("../page-builder/image-popup").ImagePopupHost;
  /** The canvas and selection the edit bar's Play uses. */
  mediaPlay?: import("../page-builder/media-play").MediaPlayHost;
  announce(message: string): void;
  error(error: unknown): void;
}

/** Owns media UI sessions; source receipts, upload staging and Undo stay on the host. */
export function createMediaController(ports: MediaControllerPorts) {
  let usage: ReturnType<typeof import("./media-usage-controller")["createMediaUsageController"]> | undefined;
  let usageLoading: Promise<void> | undefined;
  const usageListeners = new Set<(records: ReturnType<NonNullable<typeof usage>["usageRecords"]>) => void>();
  // Clean up's count rides in the usage chunk: no clean-up code runs at boot.
  let cleanUp: ReturnType<typeof import("./media-clean-up-controller")["createMediaCleanUpController"]> | undefined;
  let cleanUpView: typeof import("../page-builder/media-clean-up-view") | undefined;
  const cleanUpListeners = new Set<() => void>();
  function drawCleanUp() {
    if (!cleanUp || !cleanUpView || !ports.cleanUp) return;
    cleanUpView.drawMediaCount(ports.cleanUp.marks(), cleanUp.state().badge);
    for (const listener of cleanUpListeners) listener();
  }
  // More's Clean up item carries the count; the pane's review (slice 50) reads the suggestions.
  function mountCleanUp() {
    return {
      item: () => cleanUp?.item() ?? { label: "Clean up", disabled: "Still checking which files are used." },
      state: () => cleanUp?.state(),
      dismiss: () => cleanUp?.dismiss(),
      onChange: (listener: () => void) => { cleanUpListeners.add(listener); return () => { cleanUpListeners.delete(listener); }; },
    };
  }
  function refreshUsage() {
    const check = ports.usage;
    if (!check) return;
    if (usage) { usage.refresh(); return; }
    const key = check.key();
    if (!key) return;
    // Even the scanner's chunk waits for the deferred text index and first paint.
    void check.settled().then(() => {
      if (key !== check.key()) return;
      const marks = ports.cleanUp;
      usageLoading ??= Promise.all([import("./media-usage-controller"),
        marks && import("./media-clean-up-controller"), marks && import("../page-builder/media-clean-up-view"),
      ]).then(([{ createMediaUsageController }, cleanUpModule, view]) => {
        if (marks && cleanUpModule && view) {
          cleanUpView = view;
          cleanUp = cleanUpModule.createMediaCleanUpController({ ...check, place: () => marks.place(), storage: () => localStorage, changed: drawCleanUp });
        }
        usage = createMediaUsageController({ ...check, changed: records => {
          check.changed(records);
          void cleanUp?.update(records);
          for (const listener of usageListeners) listener(records);
        } });
        usage.refresh();
      }).catch(error => { usageLoading = undefined; ports.error(error); });
    }).catch(error => ports.error(error));
  }
  let loaded: MediaModule | undefined;
  const load = async () => loaded = await ports.load();

  async function workspaceContext(include: (path: string) => boolean = isImagePath): Promise<MediaWorkspaceContext> {
    const workspace = ports.workspace();
    if (!workspace) throw new Error("Choose a repository before opening Media.");
    const { repo, repoSize, scope, drafts, site } = workspace;
    const stamp = ports.stamp();
    const assertLive = () => { if (!stamp.holds()) throw new Error("The repository changed. Close Media and open it again."); };
    const branchPaths = workspace.nativePaths ?? await ports.listPaths(workspace);
    assertLive();
    const gone = new Set(drafts.list(scope).filter((draft) => draft.deleted).map((draft) => draft.path));
    const paths = [...new Set([...branchPaths, ...drafts.list(scope).filter((draft) => !draft.deleted).map((draft) => draft.path)])].filter((path) => !gone.has(path));
    const read = async (path: string) => {
      assertLive();
      const held = ports.source(path, scope);
      if (held !== undefined) return held;
      const draft = drafts.get(scope, path);
      if (draft?.deleted) return undefined;
      // An uploaded or moved file (an SVG, say) holds no text in its draft: read its bytes.
      if (draft?.opaque && draft.sourceSha) {
        const text = draft.upload ? await (await ports.uploadedBlob(scope, draft.sourceSha))?.text() : await ports.readText(repo, draft.sourceSha);
        assertLive(); return text;
      }
      const entry = await ports.findEntry(path); assertLive();
      if (!entry) return undefined;
      const text = await ports.readText(repo, entry.sha); assertLive();
      ports.rememberSource(path, text); return text;
    };
    for (const path of [".editor/config.json", "CNAME"]) if (paths.includes(path)) await read(path);
    assertLive();
    return {
      key: `${scope.account}:${scope.repoId}`, scope, drafts, paths, repoSize, history: true,
      removedCopies: removedCopies(),
      items: paths.filter(include).map((path) => {
        const draft = drafts.get(scope, path), entry = ports.entry(path);
        return { path, size: draft?.upload?.size ?? entry?.size, date: draft?.updatedAt, draft: Boolean(draft) };
      }),
      pages: site ? Object.values(site.routes) : paths.filter((path) => /(?:^|\/)index\.html$/i.test(path) && !path.startsWith("components/")),
      components: site?.components ?? {}, get origins() { return ports.origins?.() ?? []; }, assertLive, read,
      blob: async (path) => {
        assertLive();
        const draft = drafts.get(scope, path);
        if (draft?.deleted) throw new Error(`${path} is deleted.`);
        if (draft?.upload && draft.sourceSha) {
          const blob = await ports.uploadedBlob(scope, draft.sourceSha); assertLive();
          if (!blob) throw new Error(`${path} is missing from this browser's storage. Upload it again.`);
          return blob;
        }
        const entry = draft?.sourceSha ? { sha: draft.sourceSha } : await ports.findEntry(path); assertLive();
        if (!entry) throw new Error(`${path} is unavailable.`);
        const blob = await ports.readBlob(repo, entry.sha, path); assertLive();
        const type = uploadImageType(path);
        return type && blob.type !== type ? new Blob([blob], { type }) : blob;
      },
      historyBlob: async (sha, path) => {
        assertLive();
        const blob = await ports.readBlob(repo, sha, path); assertLive();
        return blob;
      },
      assetVersion: (path) => {
        assertLive();
        const record = drafts.get(scope, path);
        return record ? JSON.stringify(record) : ports.entry(path)?.sha;
      },
      applyBatch: async (batch) => { assertLive(); await ports.applyBatch(scope, stamp, batch); },
      openPage: async (path) => { assertLive(); await ports.openPage(path); },
    };
  }

  // Keep record parsing and description rules in the lazy media chunk.
  let descriptions: typeof import("../page-builder/media-descriptions") | undefined;
  let recordIO: typeof import("../../shared/media-records") | undefined;
  let removedRules: typeof import("../page-builder/recently-removed") | undefined;
  /** The Git blob SHA of a path's present bytes when known without reading them (an edited text
   * file is not), so a file brought back outside Media (Files' or Save's Restore) gets its records. */
  function presentBlob(path: string) {
    const workspace = ports.workspace();
    const draft = workspace?.drafts.get(workspace.scope, path);
    if (draft) return draft.deleted || !draft.opaque ? undefined : draft.sourceSha;
    return ports.entry(path)?.sha;
  }
  const withBackFiles = <T extends import("../../shared/media-records").MediaRecords>(records: T): T =>
    records.removed?.length && removedRules ? removedRules.pruneRemoved(records, removedRules.removedToday(Date.now()), presentBlob) as T : records;
  let recordsScope = "";
  let warming: Promise<void> | undefined;
  async function warmDescriptions() {
    const identity = ports.identity(), stamp = ports.stamp();
    const [rules, io, references, entities, ctx, removed] = await Promise.all([
      import("../page-builder/media-descriptions"), import("../../shared/media-records"),
      import("../page-builder/media-references"), import("../page-builder/html-entities"), workspaceContext(),
      import("../page-builder/recently-removed"),
    ]);
    if (!stamp.holds() || identity !== ports.identity()) return;
    const source = await ctx.read(io.MEDIA_RECORDS_PATH);
    ctx.assertLive();
    if (!stamp.holds() || identity !== ports.identity()) return;
    io.parseMediaRecords(source);
    resolveFile = (page, src) => references.mediaResolvePath(entities.decodeHtmlEntities(src, true), page);
    decodeAlt = value => entities.decodeHtmlEntities(value, true);
    descriptions = rules; recordIO = io; removedRules = removed; recordsScope = identity;
    ports.refreshDescriptions();
  }
  function placeState(page: string, src: string, alt: string | undefined) {
    if (!descriptions || !recordIO || recordsScope !== ports.identity()) {
      if (!warming) warming = warmDescriptions().catch(() => {}).finally(() => { warming = undefined; });
      return undefined;
    }
    try {
      const records = withBackFiles(recordIO.parseMediaRecords(ports.source(recordIO.MEDIA_RECORDS_PATH)));
      const file = resolveFile(page, src);
      return file ? { ...descriptions.placeDescriptionState(records, file, page, alt === undefined ? undefined : decodeAlt(alt)), fileDecorative: Boolean(records.files[file]?.decorative) } : undefined;
    } catch { return undefined; }
  }
  // Resolve through the same URL rules used by media references, loaded with the rules.
  let decodeAlt = (value: string) => value;
  let resolveFile = (_page: string, _src: string): string | undefined => undefined;
  async function changePlace(page: string, node: number[], decorative: boolean) {
    const stamp = ports.stamp(), source = ports.source(page);
    if (source === undefined || ports.viewingVersion() || ports.openFile() !== page) return;
    // The batch records Undo on the open page, so that page must still be the one marked.
    const current = () => stamp.holds() && !ports.viewingVersion() && ports.openFile() === page && ports.source(page) === source;
    try {
      const [rules, io, references, html, entities, ctx, collections, removed] = await Promise.all([
        import("../page-builder/media-descriptions"), import("../../shared/media-records"),
        import("../page-builder/media-references"), import("../../shared/html-source"),
        import("../page-builder/html-entities"), workspaceContext(), import("../page-builder/media-collections"),
        import("../page-builder/recently-removed"),
      ]);
      removedRules = removed;
      if (!current()) throw new Error("This image changed. Select it again.");
      const metadata = await ctx.read(io.MEDIA_RECORDS_PATH);
      ctx.assertLive();
      if (!current()) throw new Error("This image changed. Select it again.");
      const read = collections.readSiteMediaRecords(metadata, ctx.items.map(item => item.path));
      // Files back outside Media get their records from their present bytes: those bytes are proofs.
      const expectedAssets = new Map<string, string | undefined>();
      if (read.removed?.length) for (const path of new Set(removed.removedPaths(read))) expectedAssets.set(path, ctx.assetVersion(path));
      const records = withBackFiles(read);
      const range = (ports.locateElement ?? locateNativeElementRange)(source, node);
      if (!range || range.tag.name !== "img") return;
      const tag = html.startTags(source).find(tag => tag.start === range.tag.start);
      if (!tag) return;
      const src = html.startTagAttribute(source, tag, "src");
      const file = src && references.mediaResolvePath(entities.decodeHtmlEntities(src.value, true), page);
      if (!file) throw new Error("Choose an image stored in this repository before marking it Decorative.");
      const next = rules.setMediaPlaceDecorative(records, file, page, decorative);
      const edits = new Map<string, string>();
      if (next !== records) edits.set(io.MEDIA_RECORDS_PATH, io.serializeMediaRecords(next));
      if (decorative) {
        const alt = html.startTagAttribute(source, tag, "alt");
        const updated = source.slice(0, alt?.start ?? tag.nameEnd) + ' alt=""' + source.slice(alt?.end ?? tag.nameEnd);
        if (updated !== source) edits.set(page, updated);
      }
      if (!edits.size) return;
      await ctx.applyBatch({ label: "Change Decorative image",
        expectedPaths: ctx.paths, expectedSources: new Map([[page, source], [io.MEDIA_RECORDS_PATH, metadata]]),
        expectedAssets, edits, moves: [], deletes: [], restores: [], uploads: [] });
      ctx.assertLive();
      decodeAlt = value => entities.decodeHtmlEntities(value, true);
      descriptions = rules; recordIO = io;
      recordsScope = ports.identity();
      resolveFile = (page, src) => references.mediaResolvePath(entities.decodeHtmlEntities(src, true), page);
      ports.refreshDescriptions();
    } catch (error) { ports.error(error); }
  }

  /** The Media picker for an image on a page (Edit bar, Structure, canvas double-click or drop). Use
   * swaps the picture with today's markup; the place keeps its own words and its Decorative mark
   * (`swapPlaceImage`), so a moved mark and the page change are one Undo step. */
  async function chooseImage(target: { path: string; node: number[]; width?: number }, files?: File[]) {
    const stamp = ports.stamp(), epoch = ports.generation();
    const source = ports.source(target.path);
    const locate = ports.locateElement ?? locateNativeElementRange;
    const initial = source === undefined ? undefined : locate(source, target.node);
    if (!initial || initial.tag.name !== "img" || ports.viewingVersion()) return;
    const expected = source!.slice(initial.tag.start, initial.tag.end);
    const initialAlt = mediaExistingAlt(expected);
    const { openMediaPicker } = await load();
    if (!stamp.holds() || ports.source(target.path) !== source) return;
    // The place: its page, and the picture by its words ("Home · Studio desk").
    const place = `${ports.placeLabel?.(target.path) ?? target.path} · ${initialAlt?.trim() || "Image"}`;
    // A picture spot (a component's slot picture) also takes a video, which loops silently there (slice 64).
    const spotted = (text: string) => Boolean(mediaAttribute(text, startTags(text)[0], "slot"));
    const parent = locate(source!, target.node.slice(0, -1));
    const spot = spotted(expected) || parent?.tag.name === "picture" && spotted(source!.slice(parent.tag.start, parent.tag.end));
    await openMediaPicker({ files, accept: spot ? `image/*,${VIDEO_ACCEPT}` : "image/*", place, report: ports,
      chosenNote: spot ? name => isVideoName(name) ? "loops silently here" : undefined : undefined,
      onPick: async (image: MediaImage, cancelled, held) => {
        // A file added here is routed by what it became (a GIF becomes a looping MP4), not its own name.
        const added = held?.chosen?.()?.request, output = added?.result?.outputs[0]?.extension;
        const chosen = added ? output ? `added.${output}` : added.file.name : image.path;
        if (spot && isVideoName(chosen)) {
          const { placeChosenMedia } = await import("../page-builder/media-insert");
          await placeChosenMedia(ports, workspaceContext, { kind: "spot", path: target.path, node: target.node }, image, { stamp, epoch, source: source! }, cancelled, held);
          return;
        }
        const { placeMediaImage } = await import("../page-builder/media-place");
        await placeMediaImage(ports, workspaceContext, target, image,
          { stamp, epoch, source: source!, expected, initialAlt }, cancelled, held);
      } }).catch((error: unknown) => ports.error(error));
  }

  /** Add → Media: the picker with every kind; Use inserts the chosen file at `place` (a gap the block
   * rail or the Add panel found on the page's bytes now), with its markup and the site's player, as one
   * Undo step. Cancel adds nothing. */
  async function insertMedia(place: import("../page-builder/media-insert").MediaInsertPlace) {
    const stamp = ports.stamp(), epoch = ports.generation(), source = ports.source(place.path);
    if (source === undefined || ports.viewingVersion()) return;
    const { openMediaPicker } = await load();
    if (!stamp.holds() || ports.source(place.path) !== source) return;
    await openMediaPicker({ place: `${ports.placeLabel?.(place.path) ?? place.path} · Add media`, report: ports, onPick: async (file, cancelled, held) => {
      const { placeChosenMedia } = await import("../page-builder/media-insert");
      // Component templates (their items slots) by path, so the step can prove the ones it read.
      const templates = (tag: string) => { const path = ports.workspace()?.site?.components[tag]; return path === undefined ? undefined : { path, source: ports.source(path) }; };
      await placeChosenMedia(ports, workspaceContext, { kind: "insert", place, templates }, file, { stamp, epoch, source }, cancelled, held);
    } }).catch((error: unknown) => ports.error(error));
  }

  function preparePlacement(target: { path: string; node: number[] }) {
    const stamp = ports.stamp(), epoch = ports.generation(), source = ports.source(target.path);
    const range = source === undefined ? undefined : (ports.locateElement ?? locateNativeElementRange)(source, target.node);
    if (!range || range.tag.name !== "img" || source === undefined) throw new Error("That element is not an image; place_media fills an existing image. Add a section or component with an image first.");
    const expected = source.slice(range.tag.start, range.tag.end), initialAlt = mediaExistingAlt(expected);
    return async (image: MediaImage, asset?: { path: string; version?: string }) => {
      const { placeMediaImage } = await import("../page-builder/media-place");
      await placeMediaImage(ports, workspaceContext, target, image, { stamp, epoch, source, expected, initialAlt, asset }, () => false);
    };
  }

  function prepareFrame(target: { path: string; node: number[] }) {
    const stamp = ports.stamp(), epoch = ports.generation(), source = ports.source(target.path);
    const range = source === undefined ? undefined : (ports.locateElement ?? locateNativeElementRange)(source, target.node);
    if (!range || range.tag.name !== "img" || source === undefined) throw new Error("That element is not an image; place_media fills an existing image. Add a section or component with an image first.");
    // Under a component's own shape the agent writes and reads as the popup does (slice 92). The
    // component's files (folder and flat, present or not) join the proof before the first await.
    const parent = (ports.locateElement ?? locateNativeElementRange)(source, target.node.slice(0, -1))?.tag.name ?? "";
    const files = new Map(parent.includes("-") ? [`components/${parent}/${parent}`, `components/${parent}`]
      .flatMap(base => [`${base}.html`, `${base}.css`]).map(path => [path, ports.source(path)]) : []);
    const proof = { epoch, source, expected: source.slice(range.tag.start, range.tag.end),
      stamp: { holds: () => stamp.holds() && [...files].every(([path, text]) => ports.source(path) === text), changed: () => stamp.changed() } };
    const expected = proof.expected;
    const context = async () => {
      const shapes = await import("../page-builder/component-shapes");
      if (!proof.stamp.holds() || ports.viewingVersion() || ports.source(target.path) !== source) throw new Error("This image changed. Select it again.");
      return { shapes, component: shapes.componentPicture(source, target.node, path => files.has(path) ? files.get(path) : ports.source(path)) };
    };
    return {
      async read(records?: import("../../shared/media-records").MediaRecords) {
        const { shapes, component } = await context();
        return shapes.agentComponentRead(expected, records, target.path, component);
      },
      async frame(change: import("../page-builder/place-frame").PlaceFrameChange) {
        const { framePlace } = await import("../page-builder/place-frame");
        const { shapes, component } = await context();
        await framePlace(ports, target, shapes.agentComponentChange(change, component), proof);
      },
      async trim(request: import("../page-builder/place-trim").PlaceTrimRequest) {
        const { trimPlace } = await import("../page-builder/place-trim");
        const { shapes, component } = await context();
        return trimPlace(ports, workspaceContext, target, shapes.agentTrimRequest(request, expected, target.path, component), proof);
      },
    };
  }

  // The Image button's badge and popup (slice 39) load with the first image selected.
  let popups: ReturnType<typeof import("../page-builder/image-popups")["createImagePopups"]> | undefined;
  let popupsLoading: Promise<void> | undefined;
  const loadPopups = () => popupsLoading ??= import("../page-builder/image-popups").then(module => {
    popups = module.createImagePopups({ ports, workspaceContext, load, chooseImage, records: () => {
      try { return recordIO && recordsScope === ports.identity() ? withBackFiles(recordIO.parseMediaRecords(ports.source(recordIO.MEDIA_RECORDS_PATH))) : undefined; } catch { return undefined; }
    } });
    ports.refreshDescriptions();
  }, error => { popupsLoading = undefined; throw error; });
  function placeFrame(page: string, node: number[], tag: string) {
    if (!popups) void loadPopups().catch(() => {});
    return popups?.placeFrame(page, node, tag);
  }
  async function editImage(target: { path: string; node: number[] }) {
    try { await loadPopups(); await popups!.edit(target); } catch (error) { ports.error(error); }
  }

  /** The Media picker for a value that holds an image's address (component fields, Site settings):
   * resolves to the chosen file's root path on Use, or undefined on Cancel. */
  async function choosePath(place: string, placement?: MediaPathPlacement, accept = "image/*"): Promise<string | undefined> {
    const stamp = ports.stamp();
    const { openMediaPicker } = await load();
    // A repository switched while the picker loaded: no picker opens for the old request.
    if (!stamp.holds()) return undefined;
    return new Promise(resolve => {
      openMediaPicker({ accept, place, report: ports, onClose: () => resolve(undefined), onPick: async (image, cancelled, held) => {
        const { placeMediaPath } = await import("../page-builder/media-page-markup");
        await placeMediaPath(ports, stamp, placement, image, cancelled, held, resolve, workspaceContext);
      } })
        .catch((error: unknown) => { ports.error(error); resolve(undefined); });
    });
  }

  let videos: ReturnType<typeof import("../page-builder/media-video-place")["createVideoPlaces"]> | undefined;
  let videosLoading: Promise<void> | undefined;
  const loadVideos = () => videosLoading ??= import("../page-builder/media-video-place").then(module => {
    videos = module.createVideoPlaces(ports, workspaceContext, load, {
      records: () => usage?.usageRecords(), pageLabel: page => ports.placeLabel?.(page),
      onChange: listener => { usageListeners.add(listener); return () => { usageListeners.delete(listener); }; } });
  }, error => { videosLoading = undefined; throw error; });
  // The edit bar's Play (slice 65) loads with its first press.
  let player: import("../page-builder/media-play").MediaPlay | undefined;
  let playerLoading: Promise<void> | undefined;
  const loadPlayer = (host: import("../page-builder/media-play").MediaPlayHost) => playerLoading ??= import("../page-builder/media-play").then(module => {
    player = module.createMediaPlay({ host, locate: (source, node) => locateNativeElementRange(source, node), site: () => ({ origins: ports.origins?.() ?? [] }),
      source: path => ports.source(path), blob: async path => (await workspaceContext(() => true)).blob(path), refresh: () => ports.refreshDescriptions() });
  }, error => { playerLoading = undefined; throw error; });
  function playControl(path: string, node: number[], source: string): EditBarControl[] {
    const host = ports.mediaPlay;
    if (!host) return [];
    const on = player?.playing(path, node) ?? false;
    return [{ kind: "button", label: on ? "Stop" : "Play", leading: on ? "stop" : "play",
      title: on ? "Stop and show the still picture again" : "Play it here to check it",
      onPress: () => { void loadPlayer(host).then(() => player!.toggle(path, node, source)).catch(error => ports.error(error)); } }];
  }
  /** The edit bar's video, audio and Online video controls, decided from the source so the bar never waits for the lazy module. */
  function videoControls(path: string, node: number[], source: string): EditBarControl[] {
    const range = (ports.locateElement ?? locateNativeElementRange)(source, node);
    if (!range) return [];
    const has = (text: string, name: string) => Boolean(mediaAttribute(text, startTags(text)[0], name));
    const fail = (error: unknown) => ports.error(error);
    const tag = source.slice(range.tag.start, range.tag.end);
    if (range.tag.name === "audio") return playControl(path, node, source);
    if (range.tag.name === "a") return /(?:^|\s)online-video(?:\s|$)/.test(mediaAttribute(tag, startTags(tag)[0], "class")?.value ?? "") ? playControl(path, node, source) : [];
    if (range.tag.name === "video") {
      if (has(tag, "data-background")) return playControl(path, node, source);
      // Looping: muted and loop; in a picture spot (a slot) a video always loops silently.
      const checked = has(tag, "muted") && has(tag, "loop"), disabled = checked && has(tag, "slot");
      return [...playControl(path, node, source), { kind: "checkbox", label: "Looping video", checked, disabled,
        title: disabled ? "A video in a picture spot always loops silently." : "Plays silently by itself, over and over, with a small pause button",
        onChange: on => { void loadVideos().then(() => videos!.toggleLooping(path, node, source, on)).catch(fail); } }];
    }
    if (range.tag.name !== "section") return [];
    // A background video is the section's first child.
    const after = source.slice(range.tag.end), first = /^\s*<video\b/i.test(after) ? source.slice(range.tag.end).trimStart() : "";
    const hasBackground = Boolean(first) && has(first, "data-background");
    return [{ kind: "button", label: "Background video", onPress: () => { void chooseBackground({ path, node }).catch(fail); } },
      ...hasBackground ? [{ kind: "button" as const, label: "Remove background video",
        onPress: () => { void loadVideos().then(() => videos!.removeBackground(path, node, source)).catch(fail); } }] : []];
  }
  async function chooseBackground(target: { path: string; node: number[] }) {
    const source = ports.source(target.path), stamp = ports.stamp();
    if (source === undefined || ports.viewingVersion()) return;
    await loadVideos();
    if (stamp.holds() && ports.source(target.path) === source) await videos!.chooseBackground(target, source);
  }

  let gallery: MediaLibraryView | undefined;
  let galleryScope = "", signature = "", refreshNeeded = false, opening = 0;
  let observer: { disconnect(): void } | undefined;
  function disposeGallery() {
    opening++;
    observer?.disconnect(); observer = undefined;
    gallery?.dispose(); gallery = undefined;
    galleryScope = ""; signature = ""; refreshNeeded = false;
  }
  async function ensureGallery() {
    if (!ports.workspace()?.site) return;
    const scope = ports.identity();
    if (gallery && galleryScope === scope) { requestGalleryRefresh(); return; }
    disposeGallery();
    const attempt = ++opening;
    galleryScope = scope; signature = ports.gallerySignature();
    const { mountMediaLibrary } = await load();
    if (attempt !== opening || scope !== ports.identity() || !ports.mediaSelected()) return;
    gallery = mountMediaLibrary(ports.galleryHost(), { refreshKey: () => ports.gallerySignature(),
      cleanUp: ports.cleanUp && mountCleanUp });
  }
  /** Media's Optimise sheet for files added elsewhere (Files' Review…), once the pane has loaded:
   * only in the repository they were dropped in, by the same pane. */
  async function reviewInGallery(files: File[], folder: string) {
    const stamp = ports.stamp(), scope = ports.identity();
    const holds = () => stamp.holds() && scope === ports.identity();
    await ensureGallery();
    const view = gallery;
    if (!view || !holds() || galleryScope !== scope) return;
    await view.ready;
    if (gallery === view && holds()) view.review(files, folder);
  }
  function requestGalleryRefresh() {
    if (!gallery) return;
    if (galleryScope !== ports.identity()) { disposeGallery(); return; }
    if (!ports.galleryVisible()) { refreshNeeded = true; return; }
    const next = ports.gallerySignature();
    if (next === signature) { if (refreshNeeded) queueMicrotask(flushGalleryRefresh); return; }
    signature = next; refreshNeeded = true;
    queueMicrotask(flushGalleryRefresh);
  }
  function flushGalleryRefresh() {
    const view = gallery;
    if (!view || !refreshNeeded || !ports.galleryVisible()) return;
    if (galleryScope !== ports.identity()) { disposeGallery(); return; }
    if (view.element.getAttribute("aria-busy") === "true") {
      if (!observer) {
        const changed = () => {
          if (view.element.getAttribute("aria-busy") === "true") return;
          observer?.disconnect(); observer = undefined;
          if (gallery === view) flushGalleryRefresh();
        };
        if (ports.observeBusy) observer = ports.observeBusy(view.element, changed);
        else {
          const watching = new MutationObserver(changed);
          watching.observe(view.element, { attributes: true, attributeFilter: ["aria-busy"] });
          observer = watching;
        }
      }
      return;
    }
    refreshNeeded = false;
    if (view.refreshedKey === ports.gallerySignature()) return;
    void view.refresh();
  }
  return { refreshUsage, invalidateUsage: () => { usage?.invalidate(); cleanUp?.invalidate(); }, usageRecords: () => usage?.usageRecords(),
    onUsageChange: (listener: (records: ReturnType<NonNullable<typeof usage>["usageRecords"]>) => void) => {
      usageListeners.add(listener); return () => { usageListeners.delete(listener); };
    },
    shareImage: async (request: import("../page-builder/social-sharing").SocialSharingRequest) =>
      (await import("../page-builder/social-sharing")).shareImage(workspaceContext, request, message => ports.announce(message)),
    /** The canvas stopped the edit bar's play `id`. */
    mediaEnded: (id: number) => player?.ended(id),
    workspaceContext, preparePlacement, prepareFrame, chooseImage, insertMedia, choosePath, chooseBackground, videoControls, placeState, placeFrame, editImage, changePlace, ensureGallery, reviewInGallery, requestGalleryRefresh, disposeGallery,
    closePicker: () => loaded?.closeMediaPicker(), galleryVisible: () => ports.galleryVisible() };
}
