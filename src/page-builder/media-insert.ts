// Add → Media (build slice 63): the file chosen in the Media picker goes into a page at a place, with
// its kind's markup (pictures by slice 33's rules, videos and audio by slice 62's, PDFs and other
// downloads as cards), the site's player added once, as one Undo step. A picture spot's picker may
// choose a video too: it turns the spot into a Looping video (slice 64). Lazy: loaded by Use.
import type { MediaControllerPorts } from "../controllers/media-controller";
import type { Stamp } from "../guarded-edit";
import type { MediaWorkspaceContext } from "./media-workspace";
import type { MediaHeldFiles, MediaImportRequest } from "./media-picker";
import type { MediaImage } from "./media-markup";
import type { ElementRange } from "../../shared/html-source";
import { MEDIA_RECORDS_PATH, parseMediaRecords, serializeMediaRecords, type MediaFileRecord, type MediaRecords } from "../../shared/media-records";
import { isMediaLibraryPath, mediaKind } from "./media-library-filter";
import { mediaFamilyOf } from "./media-families";
import { mediaStorageName } from "./media-storage";
import { readSiteMediaRecords } from "./media-collections";
import { applyGuardedSourceEdit, nativeMarkupInsertEdit, type ItemsSlotRule } from "./native-operations";
import { itemsSlotRule } from "./block-insert";
import { readSource } from "./source-tree";
import { mediaEscape, mediaUrl } from "./media-attributes";
import { mediaPlaceSwap } from "./media-place-swap";
import { swapPlaceImage } from "./media-descriptions";
import { audioMarkup, downloadCardMarkup, mediaPlayerPlan, pageMediaLanguage, type MediaPlayerKind } from "./player-markup";
import { isPictureSpot, loopsFromStart, pictureSpotVideo, placedVideoMarkup } from "./looping-video";
import { decodeImage } from "./media-byte-cache";

/** A gap in a page (a body path and index, as the block rail and the Add panel find it). */
export interface MediaInsertPlace {
  path: string; parent: number[]; index: number;
  /** In a new Section made for it (no Section on the page yet). */
  wrap?: boolean;
  /** `parent` is a component instance: the items slot it goes in. */
  slot?: string;
}
/** What else a chosen file's markup needs to know: its records, its still picture and its sizes. */
export interface PlacedFacts {
  record?: MediaFileRecord;
  still?: { path: string; width?: number; height?: number };
  subtitles?: string;
  /** The file's bytes (a download card's meta). */
  size?: number;
  /** The video's own size, when known (else its still's). */
  width?: number; height?: number;
}
type Locate = (source: string, node: number[]) => ElementRange | undefined;

/** Pages the preview has not painted (the page with the new file in it) are read without the DOM. */
export const locatePageElement: Locate = (source, node) => {
  const tree = readSource(source, { page: true }), element = tree.at(node);
  return element && tree.range(element);
};
export const insertedNode = (place: Pick<MediaInsertPlace, "parent" | "index" | "wrap">) =>
  place.wrap ? [...place.parent, place.index, 0] : [...place.parent, place.index];

/** The page with `markup` at the place (in a new Section with `wrap`); undefined where HTML refuses it. */
export function insertAtPlace(source: string, place: MediaInsertPlace, markup: string, items?: ItemsSlotRule): string | undefined {
  const text = place.wrap ? `<section class="flow">\n  ${markup}\n</section>` : markup;
  const edit = nativeMarkupInsertEdit(source, place.parent, place.index, text, items, place.slot);
  return edit && applyGuardedSourceEdit(source, edit);
}

/** A video's, audio file's or download's markup and the player kind it needs; pictures are placed by
 * `insertedImagePage`. The name screen readers hear is the file's description, when it has one. */
export function playerMediaMarkup(path: string, facts: PlacedFacts, page: string): { markup: string; kind: MediaPlayerKind; notes: string[] } | undefined {
  const kind = mediaKind(path), name = facts.record?.description?.text?.trim() || undefined;
  const subtitles = facts.subtitles ? { path: facts.subtitles } : undefined;
  if (kind === "video") {
    const video = { path, still: facts.still?.path, width: facts.width ?? facts.still?.width, height: facts.height ?? facts.still?.height, name, subtitles };
    return { ...placedVideoMarkup(video, facts.record, pageMediaLanguage(page)), kind: loopsFromStart(facts.record) ? "looping-video" : "video" };
  }
  if (kind === "audio") return { ...audioMarkup({ path, duration: facts.record?.duration, name, subtitles }, pageMediaLanguage(page)), kind: "audio" };
  if (kind === "document") return { ...downloadCardMarkup({ path, size: facts.size, preview: facts.still }), kind: "download" };
  return undefined;
}

/** The page with a picture at the place by the placed-image rules (slice 33), not measured yet, so
 * lazy with `sizes="auto, 100vw"`; its words follow the file (a description, Decorative, else its name). */
export function insertedImagePage(source: string, place: MediaInsertPlace, image: MediaImage, records: MediaRecords, items?: ItemsSlotRule) {
  const virtual = insertAtPlace(source, place, `<img src="${mediaEscape(mediaUrl(image.path))}" alt="${mediaEscape(image.alt)}">`, items);
  const node = insertedNode(place), range = virtual === undefined ? undefined : locatePageElement(virtual, node);
  if (virtual === undefined || range?.tag.name !== "img") return undefined;
  const { swap } = mediaPlaceSwap(virtual, { node }, virtual.slice(range.tag.start, range.tag.end), image, undefined, locatePageElement);
  const after = swapPlaceImage(records, place.path, undefined, image.path, image.alt, swap(undefined).page);
  return { page: swap(after.alt).page, records: after.records };
}

/** A picture spot (an `<img slot>`, or the `<img>` of a `<picture slot>`) turned into a Looping video
 * keeping its slot, shape and focus; undefined when `node` is no picture spot. */
export function spotVideoPage(source: string, node: number[], video: { path: string; still?: string; width?: number; height?: number }, locate: Locate) {
  const image = locate(source, node);
  if (image?.tag.name !== "img") return undefined;
  let spot = image, at = node;
  if (!isPictureSpot(source.slice(image.tag.start, image.tag.end))) {
    const parent = locate(source, node.slice(0, -1));
    if (parent?.tag.name !== "picture" || !isPictureSpot(source.slice(parent.tag.start, parent.tag.end))) return undefined;
    spot = parent; at = node.slice(0, -1);
  }
  return { page: source.slice(0, spot.start) + pictureSpotVideo(source.slice(spot.start, spot.end), video).markup + source.slice(spot.end), node: at };
}

/** The facts of a file in the site: its record, still (and its size), subtitles and bytes. */
function siteFacts(path: string, records: MediaRecords, paths: string[], size?: number): PlacedFacts {
  const record = records.files[path], family = mediaFamilyOf(path, paths);
  const still = [record?.still, family?.still].find((file): file is string => typeof file === "string" && paths.includes(file));
  const subtitles = [record?.subtitles, ...family?.subtitles.filter(file => /\.vtt$/i.test(file)) ?? [], ...family?.subtitles ?? []]
    .find((file): file is string => typeof file === "string" && paths.includes(file));
  return { record, still: still ? { path: still } : undefined, subtitles, size };
}
/** A file added in the picker: its facts as the addition records them. */
function addedFacts(path: string, records: MediaRecords, paths: string[], request?: MediaImportRequest): PlacedFacts {
  const record = records.files[path], output = request?.result?.outputs[0], still = request?.result?.still;
  const stillPath = typeof record?.still === "string" ? record.still : undefined;
  return { record, size: output?.blob.size ?? request?.file.size, width: output?.width, height: output?.height,
    still: stillPath ? { path: stillPath, width: still?.width, height: still?.height } : undefined,
    subtitles: siteFacts(path, records, paths).subtitles };
}
export async function pictureSize(ctx: MediaWorkspaceContext, path: string) {
  try {
    const url = URL.createObjectURL(await ctx.blob(path));
    try { return await decodeImage(url); } finally { URL.revokeObjectURL(url); }
  } catch { return {}; }
}

export type MediaPlaceTarget =
  /** `templates`: a component's template by tag (its path and text), for instances' items slots. */
  | { kind: "insert"; place: MediaInsertPlace; templates?: (tag: string) => { path: string; source?: string } | undefined }
  | { kind: "spot"; path: string; node: number[] };
export type MediaInsertPorts = Pick<MediaControllerPorts, "stamp" | "source" | "viewingVersion" | "openFile" | "restoreFile" | "announce" | "select" | "locateElement">;
const NOUNS = { image: "Image", video: "Video", audio: "Audio", document: "Download" } as const;

/**
 * Use in Add → Media's picker (or a video in a picture spot's): writes the chosen file's markup and the
 * player (created only when missing) with the records, and saves files added in the picker, in one Undo
 * step; the new element is selected. Refused with nothing written when the page, the file or the
 * records changed while the picker was open, or when the picker closed meanwhile.
 */
export async function placeChosenMedia(
  ports: MediaInsertPorts, workspaceContext: (include?: (path: string) => boolean) => Promise<MediaWorkspaceContext>,
  target: MediaPlaceTarget, chosen: MediaImage, proof: { stamp: Stamp; epoch: number; source: string },
  cancelled: () => boolean, held?: MediaHeldFiles,
) {
  const path = target.kind === "insert" ? target.place.path : target.path;
  const changed = target.kind === "insert" ? "The page changed while the picker was open, so nothing was added. Try again." : "This image changed while the picker was open. Select it again.";
  const current = () => proof.stamp.holds() && !ports.viewingVersion() && ports.source(path) === proof.source;
  const assert = () => { if (!current()) throw new Error(changed); };
  assert();
  // The templates whose items slots the place goes through, read once and proved at the write.
  const templates = new Map<string, string | undefined>();
  const items = target.kind === "insert" && target.templates ? itemsSlotRule(tag => {
    const template = target.templates!(tag);
    if (template) templates.set(template.path, template.source);
    return template?.source;
  }) : undefined;
  // Walking to the place now reads them (the file's own markup is checked when it is built).
  if (target.kind === "insert") insertAtPlace(proof.source, target.place, "<span></span>", items);
  if (ports.openFile() !== path) { await ports.restoreFile(path, proof.epoch); assert(); }
  const ctx = await workspaceContext(isMediaLibraryPath); assert(); ctx.assertLive();
  // A file added in the picker is saved with this step; an existing one must stay as chosen.
  const added = held?.chosen?.();
  const version = added ? undefined : ctx.assetVersion(chosen.path);
  if (!added && version === undefined) throw new Error(`${chosen.path} is no longer in Media. Choose it again.`);
  const unchanged = () => { if (!added && ctx.assetVersion(chosen.path) !== version) throw new Error(`${chosen.path} changed while it was being placed. Choose it again.`); };
  const metadata = await ctx.read(MEDIA_RECORDS_PATH); assert(); ctx.assertLive(); unchanged();
  // Unreadable records never block placing, and are then never written (slice 13).
  let records = parseMediaRecords(undefined), readable = true;
  try { records = readSiteMediaRecords(metadata, ctx.items.map(item => item.path)); } catch { readable = false; }
  const name = added ? mediaStorageName(added.request.file.name, added.request.result?.outputs[0]?.extension) : chosen.path;
  const kind = mediaKind(name);
  if (target.kind === "spot" && kind !== "video") throw new Error("Choose a picture or a video for this spot.");
  const player: MediaPlayerKind | undefined = target.kind === "spot" ? "looping-video" : kind === "image" ? undefined : kind === "document" ? "download" : kind;
  const refused = `This ${kind === "document" ? "file" : kind} cannot go in that spot of the page.`;
  /** The page (and records) with the file placed; `facts` as known now or after the addition. */
  const build = (page: string, file: MediaImage, facts: PlacedFacts, now: MediaRecords) => {
    if (target.kind === "spot") {
      const spot = spotVideoPage(page, target.node, { path: file.path, still: facts.still?.path, width: facts.width ?? facts.still?.width, height: facts.height ?? facts.still?.height }, (ports.locateElement as Locate | undefined) ?? locatePageElement);
      if (!spot) throw new Error(changed);
      return { page: spot.page, node: spot.node, notes: [] as string[] };
    }
    const node = insertedNode(target.place);
    if (kind === "image") {
      const placed = insertedImagePage(page, target.place, file, now, items);
      if (!placed) throw new Error(refused);
      return { page: placed.page, records: placed.records, node, notes: [] as string[] };
    }
    const markup = playerMediaMarkup(file.path, facts, page);
    const next = markup && insertAtPlace(page, target.place, markup.markup, items);
    if (!next) throw new Error(refused);
    return { page: next, node, notes: markup.notes };
  };
  // The site's player, once: its files are created only when missing (two passes, so the starter's
  // bytes load only then), and the page's head links it.
  const playerFiles = async () => {
    if (!player) return undefined;
    const input = { pages: [path], sources: { [path]: proof.source }, exists: (file: string) => ctx.paths.includes(file), kinds: [player] };
    let plan = mediaPlayerPlan(input);
    if (plan?.creates.length) {
      const { starterPlayerFiles } = await import("./starter-loader");
      const files = await starterPlayerFiles(); assert(); ctx.assertLive(); unchanged();
      plan = mediaPlayerPlan({ ...input, files });
    }
    if (plan?.notes.length) throw new Error(plan.notes.join(" "));
    return plan?.creates ?? [];
  };
  const linked = (page: string) => player ? mediaPlayerPlan({ pages: [path], sources: { [path]: page }, exists: () => true, kinds: [player] })?.edits.get(path) ?? page : page;
  const label = `${target.kind === "spot" ? "Looping video" : NOUNS[kind]} added`;
  const say = (notes: string[]) => ports.announce([`${label}.`, ...notes].join(" "));

  // An existing file's facts are read now; a file added in the picker has them once it is saved.
  const facts = added ? undefined : siteFacts(chosen.path, records, ctx.paths, ctx.items.find(item => item.path === chosen.path)?.size);
  // The still's own size gives a video or a PDF card its shape before anything loads.
  if (facts?.still && kind !== "image") { facts.still = { ...facts.still, ...await pictureSize(ctx, facts.still.path) }; assert(); ctx.assertLive(); }
  // A picture without copies for older browsers gets them now, as Replace does (slice 35).
  let copies: { uploads: { path: string; blob: Blob }[]; variants: { path: string; width: number }[] } | undefined, copyNote = "";
  if (kind === "image" && !added && !cancelled()) {
    const older = await import("./media-older-copies");
    if (older.olderCopyWidths({ path: chosen.path, width: chosen.width, paths: ctx.paths }).length) {
      try { copies = await older.makeOlderCopies(ctx, chosen, older.olderCopiesQuality(records.adding)); }
      catch (error) {
        if (cancelled() || error instanceof DOMException && error.name === "AbortError") return;
        copyNote = older.OLDER_COPIES_FAILED.trim();
      }
      assert(); ctx.assertLive(); unchanged();
    }
  }
  if (copies?.uploads.length) chosen = { ...chosen, variants: copies.variants };
  const creates = await playerFiles();
  assert(); ctx.assertLive(); unchanged();
  if (cancelled()) return;
  const expectedAssets = new Map<string, string | undefined>(added ? [] : [[chosen.path, version]]);
  const copyUploads = copies?.uploads ?? [];
  // Files added in the picker are saved with the placement and its records: one Undo step.
  if (held) {
    let placed: ReturnType<typeof build> | undefined;
    const saved = await held.save({ label, path, source: proof.source, stale: changed, live: () => !cancelled() && current(), records: { text: metadata },
      expectedPaths: ctx.paths, expectedAssets, expectedSources: templates,
      uploads: copyUploads, files: creates,
      apply: (paths, requests, now) => {
        const picked = held.image(paths), file = added ? picked : chosen, at = paths.indexOf(file.path);
        placed = build(proof.source, file, facts ?? addedFacts(file.path, now, [...ctx.paths, ...paths], requests[at]), now);
        return { page: linked(placed.page), records: placed.records };
      } });
    if (!saved.placed || !placed) { ports.announce(`Added ${saved.paths.join(", ")}.${saved.note}`); return; }
    ports.select?.(path, placed.node);
    say([...placed.notes, ...copyNote ? [copyNote] : [], ...saved.note ? [saved.note.trim()] : []]);
    return;
  }
  const placed = build(proof.source, chosen, facts!, records);
  const edits = new Map([[path, linked(placed.page)]]);
  const expectedSources = new Map<string, string | undefined>([...templates, [path, proof.source], [MEDIA_RECORDS_PATH, metadata]]);
  if (readable && placed.records && placed.records !== records) edits.set(MEDIA_RECORDS_PATH, serializeMediaRecords(placed.records));
  for (const file of creates ?? []) { expectedSources.set(file.path, undefined); edits.set(file.path, file.content); }
  await ctx.applyBatch({ label, expectedPaths: ctx.paths, expectedSources, expectedAssets, edits,
    live: () => !cancelled() && current(), moves: [], deletes: [], restores: [], uploads: copyUploads });
  ctx.assertLive();
  ports.select?.(path, placed.node);
  say([...placed.notes, ...copyNote ? [copyNote] : []]);
}
