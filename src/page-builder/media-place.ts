import type { MediaControllerPorts } from "../controllers/media-controller";
import type { Stamp } from "../guarded-edit";
import type { MediaWorkspaceContext } from "./media-workspace";
import { mediaImageMarkup, type MediaImage } from "./media-markup";
import type { MediaHeldFiles } from "./media-picker";
import { locateNativeElementRange } from "../native-source-location";

/** The picker's Use and agent placement share this exact swap and transaction. */
export async function placeMediaImage(
  ports: MediaControllerPorts, workspaceContext: () => Promise<MediaWorkspaceContext>,
  target: { path: string; node: number[]; width?: number }, image: MediaImage,
  proof: { stamp: Stamp; epoch: number; source: string; expected: string; initialAlt?: string; asset?: { path: string; version?: string } },
  cancelled: () => boolean, held?: MediaHeldFiles,
) {
  const { stamp, epoch, source, expected, initialAlt } = proof;
  const locate = ports.locateElement ?? locateNativeElementRange;
  const changed = "This image changed while the picker was open. Select it again.";
  if (!stamp.holds()) throw new Error("The repository changed. Choose an image again.");
  if (ports.openFile() !== target.path) await ports.restoreFile(target.path, epoch);
  const [rules, io, references, html, entities, ctx, collections] = await Promise.all([
    import("./media-descriptions"), import("../../shared/media-records"),
    import("./media-references"), import("../../shared/html-source"),
    import("./html-entities"), workspaceContext(), import("./media-collections"),
  ]);
  const metadata = await ctx.read(io.MEDIA_RECORDS_PATH);
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
  // Page places use the rules below; picker alt defaults belong to component and settings fields.
  const swap = (alt: string | undefined, picked = image) => {
    const markup = mediaImageMarkup({ ...picked, alt: alt ?? "" }, expected, target.width, alt === undefined);
    return { markup, page: latest.slice(0, range.tag.start) + markup + latest.slice(range.tag.end) };
  };
  // Files added in the picker are saved with the placement and its records: one Undo step.
  if (held) {
    if (cancelled()) return;
    const saved = await held.save({ path: target.path, source: latest, stale: changed, live: () => !cancelled(), records: { text: metadata },
      apply: (paths, _requests, current) => {
        const picked = held.image(paths), after = rules.swapPlaceImage(current, target.path, from, picked.path, initialAlt, swap(undefined, picked).page);
        return { page: swap(after.alt, picked).page, records: after.records };
      } });
    ports.announce(saved.placed ? `Image replaced${saved.note && `.${saved.note}`}` : `Added ${saved.paths.join(", ")}.${saved.note}`);
    return;
  }
  // Whether the old file stays on the page does not depend on the alt, only on the new src.
  const after = rules.swapPlaceImage(records, target.path, from, image.path, initialAlt, swap(undefined).page);
  const { markup, page } = swap(after.alt);
  // Cancel while the records were read: the placement stays.
  if (cancelled()) return;
  // Agent decoding captures the file revision before its first await.
  if (proof.asset && ctx.assetVersion(proof.asset.path) !== proof.asset.version) throw new Error("The image changed while preparing placement. Try again.");
  if (after.records === records || !readable) {
    if (!ports.change(target.path, latest, [{ start: range.tag.start, end: range.tag.end, text: markup }], target.node, "Image replaced")) throw new Error("The image could not be replaced.");
    return;
  }
  await ctx.applyBatch({ label: "Image replaced", expectedPaths: ctx.paths,
    expectedSources: new Map([[target.path, latest], [io.MEDIA_RECORDS_PATH, metadata]]), expectedAssets: proof.asset ? new Map([[proof.asset.path, proof.asset.version]]) : new Map(),
    edits: new Map([[target.path, page], [io.MEDIA_RECORDS_PATH, io.serializeMediaRecords(after.records)]]), moves: [], deletes: [], uploads: [] });
  ports.announce("Image replaced");
}
