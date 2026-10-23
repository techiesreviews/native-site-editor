import { NATIVE_CONFIG_PATH, nativeSitePrefix } from "../../shared/native-project";
import type { MediaUsageCheckPorts } from "./media-usage-controller";
import type { Stamp } from "../guarded-edit";
import type { DraftScope, SavedDraft } from "../drafts";
import type { DraftAccess } from "../file-changes";
import type { NativeSite, NativeTextEdit } from "../../shared/native-project";
import type { MediaWorkspaceBatch } from "../page-builder/media-workspace";
import type { MediaPickerOptions } from "../page-builder/media-picker";
type MediaLibraryView = ReturnType<typeof import("../page-builder/media-picker")["mountMediaLibrary"]>;
import type { MediaImage } from "../page-builder/media-markup";
import { mediaAttribute, mediaExistingAlt } from "../page-builder/media-attributes";
import { startTags } from "../../shared/html-source";
import type { EditBarControl } from "../components/edit-bar";
import { locateNativeElementRange } from "../native-source-location";
import type { TreeEntry } from "../../shared/types";

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
/**
 * What work holds of the workspace it began on (ticket 23): its own reads, so an upload or a media
 * change started there finishes there after a switch. On show (a reload of it too) the reads are the
 * editor's; once another workspace is shown they are the pin's snapshot and that workspace's drafts.
 */
export interface MediaPin extends MediaWorkspaceSnapshot {
  here(): boolean;
  entry(path: string): TreeEntry | undefined;
  find(path: string): Promise<TreeEntry | undefined>;
  source(path: string): string | undefined;
  /** The site's files as drafted in the pin's workspace. */
  files(): string[];
  list(): Promise<string[]>;
  /** A file read for usage, kept for the editor only while the pin's workspace is on show. */
  remember(path: string, source: string): void;
}
export interface MediaModule {
  openMediaPicker: (options: MediaPickerOptions & { adapter?: import("../page-builder/media-picker").MediaPickerHost }) => Promise<void>;
  closeMediaPicker: (away?: boolean) => void;
  mountMediaLibrary: (container: HTMLElement, options: MediaPickerOptions & { refreshKey?: () => string; cleanUp?: import("../page-builder/media-picker").MediaCleanUpMount }) => MediaLibraryView;
}
export interface MediaControllerPorts {
  /** As `measureImage`, for work whose workspace is not shown (ticket 27): measured in a background page of `pin`'s site and page. */
  measureAway?(pin: MediaPin, path: string, node: number[], image: { width?: number; height?: number }, slot?: string, style?: string): Promise<import("../page-builder/media-markup").MediaMeasured | undefined>;
  /** The draft scope shown now: work that finished elsewhere names its repository when it is another (ticket 27). */
  shownScope?(): DraftScope | undefined;
  /** Work finished in `scope`, a workspace not shown: its notification (ticket 24). */
  finishedAway?(scope: DraftScope): void;
  /** `slot`: `node` is a component instance; measure its fallback image in that slot (a first fill). */
  measureImage?(path: string, node: number[], image: { width?: number; height?: number }, slot?: string, style?: string): Promise<import("../page-builder/media-markup").MediaMeasured | undefined>;
  usage?: MediaUsageCheckPorts;
  /** Clean up's and Improve images' counts in More: the place (repository and branch) they count. */
  cleanUp?: { place(): string };
  /** Opens a page in the canvas and waits until it is shown (Improve images measures each page there). */
  showPage?(path: string): Promise<void>;
  origins?(): string[];
  workspace(): MediaWorkspaceSnapshot | undefined;
  pin?(): MediaPin | undefined;
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
  /** Resolves to where the step landed: `undoOn`, the page whose history took its Undo step. */
  /** `opened`: the page the work began on, whose history may take its Undo step (default: the page open now). */
  applyBatch(scope: DraftScope, stamp: Stamp, batch: MediaWorkspaceBatch, pin?: MediaPin, opened?: string): Promise<{ undoOn?: string } | void>;
  openPage(path: string): Promise<void>;
  load(): Promise<MediaModule>;
  openFile(): string | undefined;
  viewingVersion(): boolean;
  restoreFile(path: string, generation: number): Promise<unknown>;
  /** One page edit; `node` is selected after it, or undefined keeps the selection the user moved to meanwhile. */
  change(path: string, source: string, edits: NativeTextEdit[], node: number[] | undefined, message: string): boolean | Promise<boolean>;
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
  /** The toast's Undo for the newest step in `path`'s history, bound to that step now (slice 113). */
  undoAction?(path: string): import("../components/toast").ToastAction | undefined;
  error(error: unknown): void;
}

/** Owns media UI sessions; source receipts, upload staging and Undo stay on the host. */
export function createMediaController(ports: MediaControllerPorts, loadActions: () => Promise<typeof import("./media-actions")>) {
  let usage: ReturnType<typeof import("./media-usage-controller")["createMediaUsageController"]> | undefined;
  let usageLoading: Promise<void> | undefined;
  const usageListeners = new Set<(records: ReturnType<NonNullable<typeof usage>["usageRecords"]>) => void>();
  // Clean up's count rides in the usage chunk: no clean-up code runs at boot.
  let cleanUp: ReturnType<typeof import("./media-clean-up-controller")["createMediaCleanUpController"]> | undefined;
  const cleanUpListeners = new Set<() => void>();
  function drawCleanUp() {
    for (const listener of cleanUpListeners) listener();
  }
  // More's Clean up item carries the count; the pane's review (slice 50) reads the suggestions.
  function mountCleanUp() {
    return {
      item: () => cleanUp?.item() ?? { label: "Clean up", disabled: "Still checking which files are used." },
      state: () => cleanUp?.state(),
      improve: { item: () => cleanUp?.improveItem() ?? { label: "Improve images" }, known: (sizes: Record<string, { width?: number; height?: number }>) => cleanUp?.known(sizes),
        measure: (path: string, node: number[], size: { width?: number; height?: number }) => ports.measureImage?.(path, node, size) ?? Promise.resolve(undefined),
        show: (path: string) => ports.showPage?.(path), url: () => ports.usage?.url() },
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
      const counts = ports.cleanUp;
      usageLoading ??= Promise.all([import("./media-usage-controller"), counts && import("./media-clean-up-controller"),
      ]).then(([{ createMediaUsageController }, cleanUpModule]) => {
        if (counts && cleanUpModule) {
          cleanUp = cleanUpModule.createMediaCleanUpController({ ...check, place: () => counts.place(), changed: drawCleanUp,
            blob: async path => (await workspaceContext()).blob(path),
            version: path => { const at = ports.workspace(), draft = at?.drafts.get(at.scope, path); return draft ? draft.deleted ? undefined : draft.sourceSha : ports.entry(path)?.sha; },
            size: path => { const at = ports.workspace(), draft = at?.drafts.get(at.scope, path); return draft ? draft.upload?.size : ports.entry(path)?.size; } });
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
  let actions: ReturnType<typeof import("./media-actions")["createMediaActions"]> | undefined;
  const getActions = async () => {
    if (actions) return actions;
    const module = await loadActions();
    return actions ??= module.createMediaActions(ports, load, mountCleanUp);
  };
  // A pinned context (`args[1]`) is its workspace's whatever is shown when the chunk arrives.
  async function workspaceContext(...args: Parameters<NonNullable<typeof actions>["workspaceContext"]>) {
    const stamp = ports.stamp();
    const module = await getActions();
    if (!args[1] && !stamp.holds()) throw new Error("The repository changed. Close Media and open it again.");
    return module.workspaceContext(...args);
  }
  /** The Media picker for an image on a page (Edit bar, Structure, canvas double-click or drop). Use
   * swaps the picture with today's markup; the place keeps its own words and its Decorative mark
   * (`swapPlaceImage`), so a moved mark and the page change are one Undo step. */
  async function chooseImage(...args: Parameters<NonNullable<typeof actions>["chooseImage"]>) {
    const stamp = ports.stamp(), source = ports.source(args[0].path);
    const module = await getActions();
    if (stamp.holds() && ports.source(args[0].path) === source) return module.chooseImage(...args);
  }
  /** Add → Media: the picker with every kind; Use inserts the chosen file at `place` (a gap the block
   * rail or the Add panel found on the page's bytes now), with its markup and the site's player, as one
   * Undo step. Cancel adds nothing. */
  async function insertMedia(...args: Parameters<NonNullable<typeof actions>["insertMedia"]>) {
    const stamp = ports.stamp(), source = ports.source(args[0].path);
    const module = await getActions();
    if (stamp.holds() && ports.source(args[0].path) === source) return module.insertMedia(...args);
  }
  /** The Media picker for a value that holds an image's address (component fields, Site settings):
   * resolves to the chosen file's root path on Use, or undefined on Cancel. */
  async function choosePath(...args: Parameters<NonNullable<typeof actions>["choosePath"]>) {
    const stamp = ports.stamp();
    const module = await getActions();
    if (stamp.holds()) return module.choosePath(...args);
    return undefined;
  }

  function placeState(...args: Parameters<NonNullable<typeof actions>["placeState"]>) {
    if (actions) return actions.placeState(...args);
    const stamp = ports.stamp();
    void getActions().then(module => {
      if (stamp.holds()) module.placeState(...args);
    }).catch(() => {});
    return undefined;
  }
  async function changePlace(page: string, node: number[], decorative: boolean) {
    const stamp = ports.stamp(), source = ports.source(page);
    if (source === undefined || ports.viewingVersion() || ports.openFile() !== page) return;
    try {
      const module = await getActions();
      if (!stamp.holds() || ports.source(page) !== source || ports.openFile() !== page) throw new Error("This image changed. Select it again.");
      await module.changePlace(page, node, decorative);
    } catch (error) { ports.error(error); }
  }

  function preparePlacement(target: { path: string; node: number[] }) {
    const stamp = ports.stamp(), epoch = ports.generation(), source = ports.source(target.path);
    const range = source === undefined ? undefined : (ports.locateElement ?? locateNativeElementRange)(source, target.node);
    if (!range || source === undefined) throw new Error("That element is not an image; place_media fills an existing image. Add a section or component with an image first.");
    const expected = source.slice(range.tag.start, range.tag.end), initialAlt = mediaExistingAlt(expected);
    return async (image: MediaImage, asset?: { path: string; version?: string }) => {
      const { placeAgentMedia } = await import("../page-builder/agent-media-place");
      const templates = (tag: string) => { const path = ports.workspace()?.site?.components[tag]; return path === undefined ? undefined : { path, source: ports.source(path) }; };
      return placeAgentMedia(ports, workspaceContext, target, image, { stamp, epoch, source, expected, initialAlt, asset }, templates);
    };
  }

  function prepareLoop(target: { path: string; node: number[] }) {
    const source = ports.source(target.path), stamp = ports.stamp();
    if (source === undefined) throw new Error("Choose a video.");
    return async (looping: boolean) => {
      const { createVideoPlaces } = await import("../page-builder/media-video-place");
      if (!stamp.holds() || ports.source(target.path) !== source) throw new Error("The source changed. Select the element again.");
      await createVideoPlaces({ ...ports, selected: undefined }, workspaceContext, load).toggleLooping(target.path, target.node, source, looping);
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
    const frame = async () => {
      const module = await getActions();
      if (!proof.stamp.holds() || ports.viewingVersion() || ports.source(target.path) !== source) throw new Error("This image changed. Select it again.");
      return module.prepareFrame(target, proof, files);
    };
    return {
      read: async (records?: import("../../shared/media-records").MediaRecords) => (await frame()).read(records),
      frame: async (change: import("../page-builder/place-frame").PlaceFrameChange) => (await frame()).frame(change),
      trim: async (request: import("../page-builder/place-trim").PlaceTrimRequest) => (await frame()).trim(request),
    };
  }

  // The Image button's badge and popup (slice 39) load with the first image selected.
  let popups: ReturnType<typeof import("../page-builder/image-popups")["createImagePopups"]> | undefined;
  let popupsLoading: Promise<void> | undefined;
  const loadPopups = () => popupsLoading ??= import("../page-builder/image-popups").then(module => {
    popups = module.createImagePopups({ ports, workspaceContext, load, chooseImage, records: () => actions?.records() });
    ports.refreshDescriptions();
  }, error => { popupsLoading = undefined; throw error; });
  function placeFrame(page: string, node: number[], tag: string) {
    if (!popups) void loadPopups().catch(() => {});
    return popups?.placeFrame(page, node, tag);
  }
  async function editImage(target: { path: string; node: number[] }) {
    try { await loadPopups(); await popups!.edit(target); } catch (error) { ports.error(error); }
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
    player = module.createMediaPlay({ host, locate: (source, node) => locateNativeElementRange(source, node), site: () => ({ prefix: nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH)), origins: ports.origins?.() ?? [] }),
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
    // Looping video is in the Media popup now (slice 119).
    if (range.tag.name === "video") return playControl(path, node, source);
    if (range.tag.name !== "section") return [];
    // A background video is the section's first child.
    const after = source.slice(range.tag.end), first = /^\s*<video\b/i.test(after) ? source.slice(range.tag.end).trimStart() : "";
    const hasBackground = Boolean(first) && has(first, "data-background");
    return [{ kind: "button", label: "Background video", onPress: () => { void chooseBackground({ path, node }).catch(fail); } },
      ...hasBackground ? [{ kind: "button" as const, label: "Remove background video",
        onPress: () => { void loadVideos().then(() => videos!.removeBackground(path, node, source)).catch(fail); } }] : []];
  }
  /** The edit bar's Media button on a video (a picture spot's too), audio, a download card or an Online
   * video (slice 119; a picture's is drawn with its badge): opens the Media popup for what it holds. */
  function mediaButton(path: string, node: number[], source: string): EditBarControl | undefined {
    const range = (ports.locateElement ?? locateNativeElementRange)(source, node);
    if (!range) return undefined;
    const tag = source.slice(range.tag.start, range.tag.end), first = startTags(tag)[0];
    const names = ` ${mediaAttribute(tag, first, "class")?.value ?? ""} `.replace(/\s+/g, " ");
    const what = range.tag.name === "video" ? mediaAttribute(tag, first, "data-background") ? undefined : mediaAttribute(tag, first, "slot") ? "Looping video" : "Video"
      : range.tag.name === "audio" ? "Audio" : range.tag.name === "a" ? names.includes(" download-card ") ? "Download" : names.includes(" online-video ") ? "Online video" : undefined : undefined;
    if (!what) return undefined;
    if (!popups) void loadPopups().catch(() => {});
    return { kind: "button", label: "Media", leading: "image", names: true, expanded: popups?.open(path, node) ?? false, className: "edit-bar__media",
      title: `${what}: change or replace it`, onPress: () => { void editImage({ path, node }); } };
  }
  async function chooseBackground(target: { path: string; node: number[] }) {
    const source = ports.source(target.path), stamp = ports.stamp();
    if (source === undefined || ports.viewingVersion()) return;
    await loadVideos();
    if (stamp.holds() && ports.source(target.path) === source) await videos!.chooseBackground(target, source);
  }

  let galleryEpoch = 0;
  function disposeGallery() { galleryEpoch++; actions?.disposeGallery(); }
  function requestGalleryRefresh() { actions?.requestGalleryRefresh(); }
  async function ensureGallery() {
    const stamp = ports.stamp(), attempt = galleryEpoch;
    const module = await getActions();
    if (stamp.holds() && attempt === galleryEpoch) await module.ensureGallery();
  }
  async function reviewInGallery(files: File[], folder: string, reasons?: string[]) {
    const stamp = ports.stamp(), attempt = galleryEpoch;
    const module = await getActions();
    if (stamp.holds() && attempt === galleryEpoch) await module.reviewInGallery(files, folder, reasons);
  }
  return { refreshUsage, invalidateUsage: () => { usage?.invalidate(); cleanUp?.invalidate(); }, usageRecords: () => usage?.usageRecords(),
    onUsageChange: (listener: (records: ReturnType<NonNullable<typeof usage>["usageRecords"]>) => void) => {
      usageListeners.add(listener); return () => { usageListeners.delete(listener); };
    },
    shareImage: async (request: import("../page-builder/social-sharing").SocialSharingRequest) =>
      (await import("../page-builder/social-sharing")).shareImage(workspaceContext, request, message => ports.announce(message)),
    /** The canvas stopped the edit bar's play `id`. */
    mediaEnded: (id: number) => player?.ended(id),
    prepareImprove() {
      const stamp = ports.stamp();
      const assertLive = () => {
        if (!stamp.holds()) throw new Error("The editor changed branch or revision.");
        if (actions?.busy()) throw new Error("Media is busy. Wait for the user's Improve images run or other Media work to finish.");
      };
      assertLive();
      return {
        context: async () => {
          assertLive();
          const ctx = await workspaceContext(() => true);
          assertLive();
          return ctx;
        },
        show: (path: string) => ports.showPage?.(path) ?? Promise.resolve(),
        measure: (path: string, node: number[], size: { width?: number; height?: number }) => ports.measureImage?.(path, node, size) ?? Promise.resolve(undefined),
        url: () => ports.usage?.url(),
      };
    },
    workspaceContext, preparePlacement, prepareLoop, prepareFrame, chooseImage, insertMedia, choosePath, chooseBackground, videoControls, mediaButton, placeState, placeFrame, editImage, changePlace, ensureGallery, reviewInGallery, requestGalleryRefresh, disposeGallery,
    closePicker: (away?: boolean) => loaded?.closeMediaPicker(away), galleryVisible: () => ports.galleryVisible() };
}
