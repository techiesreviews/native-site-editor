import { isImagePath } from "../native-structure";
import { removedCopies, uploadImageType } from "../uploads";
import { nativeSitePrefix, NATIVE_CONFIG_PATH } from "../../shared/native-project";
import { locateNativeElementRange } from "../native-source-location";
import { mediaAttribute, mediaExistingAlt } from "../page-builder/media-attributes";
import { startTags } from "../../shared/html-source";
import type { MediaControllerPorts, MediaModule } from "./media-controller";
import type { MediaWorkspaceContext } from "../page-builder/media-workspace";
import type { MediaPathPlacement, MediaCleanUpMount } from "../page-builder/media-picker";
import type { MediaImage } from "../page-builder/media-markup";

type MediaLibraryView = ReturnType<typeof import("../page-builder/media-picker")["mountMediaLibrary"]>;

/** The videos a picture spot's picker lists beside its pictures: those browsers play. */
const VIDEO_ACCEPT = ".mp4,.m4v,.webm,.mov,.ogv";
const isVideoName = (name: string) => /\.(?:mp4|m4v|webm|mov|ogv|mkv|avi|mpe?g)$/i.test(name);

/** Action-only workspace reads and picker sessions; boot retains the badge and edit-bar hooks. */
export function createMediaActions(ports: MediaControllerPorts, load: () => Promise<MediaModule>, mountCleanUp: MediaCleanUpMount) {
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
        // An unsaved upload's time dates it until its record's `added` does (slice 103).
        return { path, size: draft?.upload?.size ?? entry?.size, date: draft?.upload ? draft.updatedAt : undefined, draft: Boolean(draft) };
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

  async function insertMedia(place: import("../page-builder/media-insert").MediaInsertPlace) {
    const stamp = ports.stamp(), epoch = ports.generation(), source = ports.source(place.path);
    if (source === undefined || ports.viewingVersion()) return;
    const { openMediaPicker } = await load();
    if (!stamp.holds() || ports.source(place.path) !== source) return;
    // Component templates (their items slots) by path, so the step can prove the ones it read.
    const templates = (tag: string) => { const path = ports.workspace()?.site?.components[tag]; return path === undefined ? undefined : { path, source: ports.source(path) }; };
    await openMediaPicker({ place: `${ports.placeLabel?.(place.path) ?? place.path} · Add media`, report: ports, onPick: async (file, cancelled, held) => {
      const { placeChosenMedia } = await import("../page-builder/media-insert");
      await placeChosenMedia(ports, workspaceContext, { kind: "insert", place, templates }, file, { stamp, epoch, source }, cancelled, held);
    }, onlineVideo: async (video, cancelled, host) => {
      // A pasted YouTube or Vimeo address, or one already in Media (slice 68).
      const { placeOnlineVideo } = await import("../page-builder/online-video-place");
      await placeOnlineVideo(ports, workspaceContext, { place, templates }, video, host, { stamp, epoch, source }, cancelled);
    } }).catch((error: unknown) => ports.error(error));
  }

  async function choosePath(place: string, placement?: MediaPathPlacement, accept = "image/*"): Promise<string | undefined> {
    const stamp = ports.stamp();
    const { openMediaPicker } = await load();
    // A repository switched while the picker loaded: no picker opens for the old request.
    if (!stamp.holds()) return undefined;
    return new Promise(resolve => {
      openMediaPicker({ accept, place, report: ports, onClose: () => resolve(undefined), onPick: async (image, cancelled, held) => {
        const { placeMediaPath } = await import("../page-builder/media-page-markup");
        await placeMediaPath(ports, stamp, placement, image, cancelled, held, resolve, workspaceContext, nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH)));
      } })
        .catch((error: unknown) => { ports.error(error); resolve(undefined); });
    });
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
    resolveFile = (page, src) => references.mediaResolvePath(entities.decodeHtmlEntities(src, true), page, undefined, nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH)));
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
      const expectedSources = new Map<string, string | undefined>([[page, source], [io.MEDIA_RECORDS_PATH, metadata]]);
      const expectedAssets = new Map<string, string | undefined>();
      if (read.removed?.length) for (const path of new Set(removed.removedPaths(read))) expectedAssets.set(path, ctx.assetVersion(path));
      const records = withBackFiles(read);
      const range = (ports.locateElement ?? locateNativeElementRange)(source, node);
      if (!range || range.tag.name !== "img") return;
      const tag = html.startTags(source).find(tag => tag.start === range.tag.start);
      if (!tag) return;
      const src = html.startTagAttribute(source, tag, "src");
      const config = await ctx.read(NATIVE_CONFIG_PATH);
      ctx.assertLive();
      if (!current()) throw new Error("This image changed. Select it again.");
      expectedSources.set(NATIVE_CONFIG_PATH, config);
      const prefix = nativeSitePrefix(config);
      const file = src && references.mediaResolvePath(entities.decodeHtmlEntities(src.value, true), page, undefined, prefix);
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
        expectedPaths: ctx.paths, expectedSources,
        expectedAssets, edits, moves: [], deletes: [], restores: [], uploads: [] });
      ctx.assertLive();
      decodeAlt = value => entities.decodeHtmlEntities(value, true);
      descriptions = rules; recordIO = io;
      recordsScope = ports.identity();
      resolveFile = (page, src) => references.mediaResolvePath(entities.decodeHtmlEntities(src, true), page, undefined, nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH)));
      ports.refreshDescriptions();
    } catch (error) { ports.error(error); }
  }

  function records() {
    try { return recordIO && recordsScope === ports.identity() ? withBackFiles(recordIO.parseMediaRecords(ports.source(recordIO.MEDIA_RECORDS_PATH))) : undefined; } catch { return undefined; }
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
  function prepareFrame(target: { path: string; node: number[] }, proof: import("../page-builder/place-frame").PlaceFrameProof, files: Map<string, string | undefined>) {
    const source = proof.source;
    const expected = proof.expected;
    const context = async () => {
      const shapes = await import("../page-builder/component-shapes");
      if (!proof.stamp.holds() || ports.viewingVersion() || ports.source(target.path) !== source) throw new Error("This image changed. Select it again.");
      return { shapes, component: shapes.componentPicture(source, target.node, path => files.has(path) ? files.get(path) : ports.source(path)) };
    };
    return {
      async read(records?: import("../../shared/media-records").MediaRecords) {
        const { shapes, component } = await context();
        return shapes.agentComponentRead(expected, records, target.path, component, nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH)));
      },
      async frame(change: import("../page-builder/place-frame").PlaceFrameChange) {
        const { framePlace } = await import("../page-builder/place-frame");
        const { shapes, component } = await context();
        await framePlace(ports, target, shapes.agentComponentChange(change, component), proof);
      },
      async trim(request: import("../page-builder/place-trim").PlaceTrimRequest) {
        const { trimPlace } = await import("../page-builder/place-trim");
        const { shapes, component } = await context();
        return trimPlace(ports, workspaceContext, target, shapes.agentTrimRequest(request, expected, target.path, component, nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH))), proof);
      },
    };
  }
  return { workspaceContext, chooseImage, insertMedia, choosePath, placeState, changePlace, prepareFrame, records, ensureGallery, reviewInGallery, requestGalleryRefresh, disposeGallery,
    busy: () => gallery?.element.getAttribute("aria-busy") === "true" };
}
