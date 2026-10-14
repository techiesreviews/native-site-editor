import type { MediaControllerPorts } from "../controllers/media-controller";
import type { Stamp } from "../guarded-edit";
import type { MediaWorkspaceContext } from "./media-workspace";
import { mediaImageMarkup, mediaAttributes, mediaPictureUnwrap, type MediaMeasured, type MediaImage } from "./media-markup";
import { mediaPageEdits } from "./media-page-markup";
import type { MediaHeldFiles } from "./media-picker";
import { readSource } from "./source-tree";
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
  const parentNode = target.node.slice(0, -1), parent = locate(latest, parentNode);
  const tree = parent?.tag.name === "picture" ? readSource(latest) : undefined;
  const picture = tree?.elements().find(element => element.type === "element" && element.tag.start === parent!.tag.start);
  const unwrap = mediaPictureUnwrap(latest, { start: range.tag.start, end: range.tag.end }, picture && tree!.range(picture));
  const next = unwrap ? parentNode : target.node;
  const note = unwrap?.artDirected ? " The new picture is now used on all screens." : "";
  const pageRules = mediaPageEdits(latest, measured, target.node, locate);
  // Page places use the rules below; picker alt defaults belong to component and settings fields.
  const swap = (alt: string | undefined, picked = image) => {
    let markup = framed(mediaImageMarkup({ ...picked, alt: alt ?? "" }, expected, pageRules.placement, alt === undefined));
    if (unwrap?.slot !== undefined) markup = mediaAttributes(markup, { slot: unwrap.slot });
    const edits = [...pageRules.edits, ...(unwrap?.edits ?? []), { start: range.tag.start, end: range.tag.end, text: markup }];
    let page = latest;
    for (const edit of edits.sort((a, b) => b.start - a.start)) page = page.slice(0, edit.start) + edit.text + page.slice(edit.end);
    return { markup, page, edits };
  };
  // Files added in the picker are saved with the placement and its records: one Undo step.
  if (held) {
    if (cancelled()) return;
    const saved = await held.save({ path: target.path, source: latest, stale: changed, live: () => !cancelled(), records: { text: metadata },
      apply: (paths, _requests, current) => {
        const picked = held.image(paths), after = rules.swapPlaceImage(current, target.path, from, picked.path, initialAlt, swap(undefined, picked).page);
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
  if (proof.asset && ctx.assetVersion(proof.asset.path) !== proof.asset.version) throw new Error("The image changed while preparing placement. Try again.");
  if (after.records === records || !readable) {
    if (!ports.change(target.path, latest, edits, next, "Image replaced")) throw new Error("The image could not be replaced.");
    if (note) ports.announce(`Image replaced.${note}`);
    return;
  }
  await ctx.applyBatch({ label: "Image replaced", expectedPaths: ctx.paths,
    expectedSources: new Map([[target.path, latest], [io.MEDIA_RECORDS_PATH, metadata]]), expectedAssets: proof.asset ? new Map([[proof.asset.path, proof.asset.version]]) : new Map(),
    edits: new Map([[target.path, page], [io.MEDIA_RECORDS_PATH, io.serializeMediaRecords(after.records)]]), moves: [], deletes: [], restores: [], uploads: [] });
  ports.announce(`Image replaced${note ? "." + note : ""}`);
}
