import type { MediaControllerPorts } from "../controllers/media-controller";
import type { Stamp } from "../guarded-edit";
import type { MediaWorkspaceContext } from "./media-workspace";
import type { MediaMeasured, MediaImage } from "./media-markup";
import { mediaPlaceSwap } from "./media-place-swap";
import type { MediaHeldFiles } from "./media-picker";
import { locateNativeElementRange } from "../native-source-location";
import type { PlaceFrameChange } from "./place-frame";

/** The picker's Use, agent placement and the image popup's Replace share this exact swap and
 * transaction. `frame`: the popup's shape and focus, written in the same Undo step. */
export async function placeMediaImage(
  ports: MediaControllerPorts, workspaceContext: () => Promise<MediaWorkspaceContext>,
  target: { path: string; node: number[]; width?: number }, image: MediaImage,
  proof: { stamp: Stamp; epoch: number; source: string; expected: string; initialAlt?: string; asset?: { path: string; version?: string } },
  cancelled: () => boolean, held?: MediaHeldFiles, frame?: PlaceFrameChange,
) {
  const { stamp, epoch, source, expected, initialAlt } = proof;
  const locate = ports.locateElement ?? locateNativeElementRange;
  const changed = "This image changed while the picker was open. Select it again.";
  if (!stamp.holds()) throw new Error("The repository changed. Choose an image again.");
  if (ports.openFile() !== target.path) await ports.restoreFile(target.path, epoch);
  const [rules, io, references, html, entities, ctx, collections, frames] = await Promise.all([
    import("./media-descriptions"), import("../../shared/media-records"),
    import("./media-references"), import("../../shared/html-source"),
    import("./html-entities"), workspaceContext(), import("./media-collections"), frame && import("./place-frame"),
  ]);
  const expectedPaths = [...ctx.paths];
  const mainVersion = ctx.assetVersion(image.path);
  const metadata = await ctx.read(io.MEDIA_RECORDS_PATH);
  ctx.assertLive();
  // A new shape is measured with its style standing in, as `framePlace` does.
  const framed = frames && frame ? (tag: string) => frames.writePlaceFrame(tag, frame) : (tag: string) => tag;
  const style = frames && frame?.shape !== undefined ? frames.inlineStyle(framed(expected)) : undefined;
  let measured: MediaMeasured | undefined;
  try { measured = await (style === undefined ? ports.measureImage?.(target.path, target.node, image) : ports.measureImage?.(target.path, target.node, image, undefined, style)); } catch { /* Measurement failure must never block placement. */ }
  ctx.assertLive();
  const latest = ports.source(target.path);
  const range = latest === undefined ? undefined : locate(latest, target.node);
  // The alt decision rests on the records read: a newer records draft refuses, as a newer page does.
  if (!stamp.holds() || latest === undefined || latest !== source || !range || range.tag.name !== "img" || latest.slice(range.tag.start, range.tag.end) !== expected
    || ports.source(io.MEDIA_RECORDS_PATH) !== metadata) throw new Error(changed);
  const tag = html.startTags(expected)[0], src = tag && html.startTagAttribute(expected, tag, "src");
  const from = src ? references.mediaResolvePath(entities.decodeHtmlEntities(src.value, true), target.path) : undefined;
  // Unreadable records never block a swap, and are never overwritten (slice 13).
  let records = io.parseMediaRecords(undefined), readable = true;
  try { records = collections.readSiteMediaRecords(metadata, ctx.items.map(item => item.path)); } catch { readable = false; }
  let copies: Awaited<ReturnType<typeof import("./media-older-copies")["makeOlderCopies"]>>;
  let copyNote = "";
  const older = await import("./media-older-copies");
  ctx.assertLive();
  if (!cancelled() && !/^components\//.test(target.path) && older.olderCopyWidths({ path: image.path, width: image.width, paths: ctx.paths }).length) {
    try { copies = await older.makeOlderCopies(ctx, image, older.olderCopiesQuality(records.adding)); }
    catch (error) {
      if (cancelled() || (error instanceof DOMException && error.name === "AbortError")) return;
      copyNote = older.OLDER_COPIES_FAILED;
    }
    ctx.assertLive();
  }
  if (cancelled()) return;
  if (!stamp.holds() || ports.source(target.path) !== latest || ports.source(io.MEDIA_RECORDS_PATH) !== metadata) throw new Error(changed);
  if (copies?.uploads.length) image = { ...image, variants: copies.variants };
  const expectedAssets = new Map(proof.asset ? [[proof.asset.path, proof.asset.version]] : []);
  // New copies were made from this revision of the main: a newer one refuses the whole step.
  if (copies?.uploads.length && !expectedAssets.has(image.path)) expectedAssets.set(image.path, mainVersion);
  const placement = mediaPlaceSwap(latest, target, expected, image, measured, locate, framed);
  const { swap, next } = placement;
  const note = placement.note + copyNote;
  // Files added in the picker are saved with the placement and its records: one Undo step.
  if (held) {
    if (cancelled()) return;
    const saved = await held.save({ path: target.path, source: latest, stale: changed, live: () => !cancelled(), records: { text: metadata },
      ...copies?.uploads.length ? { uploads: copies.uploads, expectedAssets, expectedPaths } : {},
      apply: (paths, _requests, current) => {
        const selected = held.image(paths), picked = copies?.uploads.length ? { ...selected, variants: copies.variants } : selected, after = rules.swapPlaceImage(current, target.path, from, picked.path, initialAlt, swap(undefined, picked).page);
        return { page: swap(after.alt, picked).page, records: after.records };
      } });
    ports.announce(saved.placed ? `Image replaced${note ? "." + note : ""}${saved.note ? "." + saved.note : ""}` : `Added ${saved.paths.join(", ")}.${saved.note}`);
    return;
  }
  // Whether the old file stays on the page does not depend on the alt, only on the new src.
  const after = rules.swapPlaceImage(records, target.path, from, image.path, initialAlt, swap(undefined).page);
  const { page, edits } = swap(after.alt);
  // Cancel while the records were read: the placement stays.
  if (cancelled()) return;
  // Agent decoding captures the file revision before its first await.
  if ([...expectedAssets].some(([path, version]) => ctx.assetVersion(path) !== version)) throw new Error("The image changed while preparing placement. Try again.");
  if (!copies?.uploads.length && (after.records === records || !readable)) {
    if (!ports.change(target.path, latest, edits, next, "Image replaced")) throw new Error("The image could not be replaced.");
    if (note) ports.announce(`Image replaced.${note}`);
    return;
  }
  await ctx.applyBatch({ label: "Image replaced", expectedPaths,
    expectedSources: new Map([[target.path, latest], [io.MEDIA_RECORDS_PATH, metadata]]), expectedAssets, ...copies?.uploads.length ? { live: () => !cancelled() && stamp.holds() } : {},
    edits: new Map([[target.path, page], ...readable && after.records !== records ? [[io.MEDIA_RECORDS_PATH, io.serializeMediaRecords(after.records)] as [string, string]] : []]), moves: [], deletes: [], restores: [], uploads: copies?.uploads ?? [] });
  ports.announce(`Image replaced${note ? "." + note : ""}`);
}
