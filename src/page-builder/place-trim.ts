import type { MediaControllerPorts } from "../controllers/media-controller";
import { MEDIA_RECORDS_PATH, type MediaTrim } from "../../shared/media-records";
import { NOTHING_TO_TRIM } from "../../shared/agent-image-frame";
import { locateNativeElementRange } from "../native-source-location";
import { readPlaceFrame, writePlaceFrame, inlineStyle, type PlaceFrameChange, type PlaceFrameProof } from "./place-frame";
import { readSiteMediaRecords } from "./media-collections";
import { trimStart, isTrim, validTrim } from "./trimmed-copies";
import { prepareTrimmedCopy } from "./trimmed-copy-prepare";
import { olderCopiesQuality } from "./media-older-copies";
import { createMediaWorkspace, type MediaWorkspaceContext } from "./media-workspace";
import { mediaPlaceSwap } from "./media-place-swap";
import { swapPlaceImage } from "./media-descriptions";
import { mediaCopyName } from "./media-storage";
import type { MediaImage, MediaMeasured } from "./media-markup";
import { mediaExistingAlt } from "./media-attributes";

export interface PlaceTrimRequest { trim: MediaTrim; frame?: PlaceFrameChange }

/** Lazy place-only trim: original pixels, shared placement markup, one media batch and Undo. */
export async function trimPlace(
  ports: MediaControllerPorts, workspaceContext: () => Promise<MediaWorkspaceContext>,
  target: { path: string; node: number[] }, request: PlaceTrimRequest, proof: PlaceFrameProof,
  cancelled: () => boolean = () => false,
) {
  if (/^components\//i.test(target.path)) throw new Error("A component template's fallback picture has no image popup.");
  validTrim(request.trim);
  if (!isTrim(request.trim)) throw new Error(NOTHING_TO_TRIM);
  const locate = ports.locateElement ?? locateNativeElementRange;
  const stale = "The page or media records changed while trimming. Nothing was saved.";
  const current = () => {
    const latest = ports.source(target.path), range = latest === undefined ? undefined : locate(latest, target.node);
    if (!proof.stamp.holds() || ports.viewingVersion() || latest !== proof.source || !range || range.tag.name !== "img"
      || latest.slice(range.tag.start, range.tag.end) !== proof.expected) throw new Error(stale);
  };
  current();
  if (ports.openFile() !== target.path) { await ports.restoreFile(target.path, proof.epoch); current(); }
  const ctx = await workspaceContext(); current(); ctx.assertLive();
  const metadata = await ctx.read(MEDIA_RECORDS_PATH); current(); ctx.assertLive();
  const records = readSiteMediaRecords(metadata, ctx.items.map(item => item.path));
  const file = readPlaceFrame(proof.expected, records, target.path).file;
  if (!file || !ctx.items.some(item => item.path === file)) throw new Error("Choose a picture already in Media.");
  const { source, previous } = trimStart(records, file, ctx.paths);
  // A trimmed copy whose original is gone counts as the original (slice 40).
  // The revision is captured before the first byte read, never refreshed after preparation.
  const sourceVersion = ctx.assetVersion(source);
  const check = () => {
    current(); ctx.assertLive();
    if (ports.openFile() !== target.path || ports.source(MEDIA_RECORDS_PATH) !== metadata
      || ctx.assetVersion(source) !== sourceVersion) throw new Error(stale);
  };
  const blob = await ctx.blob(source); check();
  if (cancelled()) return;
  const result = await prepareTrimmedCopy(blob, source.split("/").pop()!, request.trim, olderCopiesQuality(records.adding)); check();
  if (cancelled()) return;
  const main = result.outputs[0];
  if (!main || main.variantWidth) throw new Error("No primary image was encoded.");
  const framed = request.frame ? (tag: string) => writePlaceFrame(tag, request.frame!) : (tag: string) => tag;
  const style = request.frame?.shape !== undefined ? inlineStyle(framed(proof.expected)) : undefined;
  let measured: MediaMeasured | undefined;
  try {
    measured = await (style === undefined ? ports.measureImage?.(target.path, target.node, main)
      : ports.measureImage?.(target.path, target.node, main, undefined, style));
  } catch { /* Measurement failure must never block placement. */ }
  check();
  if (cancelled()) return;
  const host = createMediaWorkspace(async () => ctx);
  const path = await host.trim({ source, previous, trim: request.trim, result, sourceVersion,
    place: { path: target.path, source: proof.source, records: { text: metadata }, stale,
      live: () => { check(); return !cancelled(); },
      apply: (path, records) => {
        check();
        const image: MediaImage = { path, width: main.width, height: main.height, alt: "",
          variants: result.outputs.flatMap(output => output.variantWidth ? [{ path: mediaCopyName(path, output.variantWidth), width: output.variantWidth }] : []) };
        const { swap } = mediaPlaceSwap(proof.source, target, proof.expected, image, measured, locate, framed);
        const after = swapPlaceImage(records, target.path, file, path, mediaExistingAlt(proof.expected), swap(undefined).page);
        // The original's record, like its pixels, stays unchanged; place marks carry to the copy.
        if (records.files[source]) after.records = { ...after.records, files: { ...after.records.files, [source]: records.files[source] } };
        return { page: swap(after.alt).page, records: after.records };
      },
    },
  });
  ports.announce(`Picture trimmed: ${path}`);
  return path;
}
