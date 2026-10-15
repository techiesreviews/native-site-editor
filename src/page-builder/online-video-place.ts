// Add → Media with a YouTube or Vimeo video (build slice 68): a pasted address, or an online video
// already in Media, goes into a page at a place as the starter's Online video markup (slice 61) with the
// site's player, as one Undo step. A new video's still is copied once (slice 67's addOnlineVideo); placing
// one again makes no service call. Lazy: loaded by Use.
import type { MediaPickerHost, MediaPlacement } from "./media-picker";
import type { MediaWorkspaceContext } from "./media-workspace";
import { MEDIA_RECORDS_PATH } from "../../shared/media-records";
import { readSiteMediaRecords } from "./media-collections";
import { isMediaLibraryPath } from "./media-library-filter";
import { itemsSlotRule } from "./block-insert";
import { insertAtPlace, insertedNode, pictureSize, type MediaInsertPlace, type MediaInsertPorts } from "./media-insert";
import { mediaPlayerPlan } from "./player-markup";
import { addOnlineVideo } from "./online-video-add";
import { findOnlineVideo, onlineVideoMarkup, parseOnlineVideoAddress, type OnlineVideo, type OnlineVideoKey } from "./online-video";
import type { Stamp } from "../guarded-edit";
import type { prepareMediaFile } from "./media-prepare";
import { NEW_ONLINE_VIDEO_REFUSED } from "../../shared/online-video-address";

export interface OnlineVideoPlaceTarget {
  place: MediaInsertPlace;
  /** A component's template by tag (its path and text), for instances' items slots. */
  templates?: (tag: string) => { path: string; source?: string } | undefined;
}

/** Use in Add → Media's picker for an online video. Refused with nothing written when the page, the
 * records or a template changed while the picker was open, or when the picker closed meanwhile. */
export async function placeOnlineVideo(
  ports: MediaInsertPorts, workspaceContext: (include?: (path: string) => boolean) => Promise<MediaWorkspaceContext>,
  target: OnlineVideoPlaceTarget, chosen: { address: string } | OnlineVideoKey, host: Pick<MediaPickerHost, "import" | "onlineVideo">,
  proof: { stamp: Stamp; epoch: number; source: string }, cancelled: () => boolean,
  /** The service reads and the still's preparation (tests stub them). */
  service: { fetch?: typeof fetch; prepare?: typeof prepareMediaFile } = {},
  recordedOnly = false,
) {
  const { place } = target, path = place.path;
  const changed = "The page changed while the picker was open, so nothing was added. Try again.";
  const current = () => proof.stamp.holds() && !ports.viewingVersion() && ports.source(path) === proof.source;
  const assert = () => { if (!current()) throw new Error(changed); };
  assert();
  if (!host.onlineVideo) throw new Error("Online videos cannot be added here.");
  // The templates whose items slots the place goes through, read once and proved at the write.
  const templates = new Map<string, string | undefined>();
  const items = target.templates ? itemsSlotRule(tag => {
    const template = target.templates!(tag);
    if (template) templates.set(template.path, template.source);
    return template?.source;
  }) : undefined;
  if (insertAtPlace(proof.source, place, "<span></span>", items) === undefined) throw new Error("A video cannot go in that spot of the page.");
  if (ports.openFile() !== path) { await ports.restoreFile(path, proof.epoch); assert(); }
  const ctx = await workspaceContext(isMediaLibraryPath); assert(); ctx.assertLive();
  const live = () => { assert(); ctx.assertLive(); };
  const metadata = await ctx.read(MEDIA_RECORDS_PATH); live();
  const records = readSiteMediaRecords(metadata, ctx.items.map(item => item.path));
  let video: OnlineVideo | undefined;
  // Chosen from Media: placed again as recorded, never contacting the service (with or without a still).
  const addressed = "address" in chosen ? parseOnlineVideoAddress(chosen.address) : undefined;
  const again = "address" in chosen ? recordedOnly && addressed ? findOnlineVideo(records, addressed) : undefined : findOnlineVideo(records, chosen);
  if (recordedOnly && !again) throw new Error(NEW_ONLINE_VIDEO_REFUSED);
  if ("address" in chosen) video = addressed;
  else {
    if (!again) throw new Error("This video is no longer in Media. Paste its address instead.");
    video = { service: again.service, id: again.id, ...again.hash ? { hash: again.hash } : {} };
  }
  if (!video) throw new Error("Paste the address of a YouTube or Vimeo video.");
  const known = findOnlineVideo(records, video);
  // A still already in the site gives the link its shape before anything loads; its revision is
  // captured first and proved at the write, so a still replaced meanwhile refuses.
  const stillPath = known?.still && ctx.paths.includes(known.still) ? known.still : undefined;
  const stillVersion = stillPath === undefined ? undefined : ctx.assetVersion(stillPath);
  const existing = stillPath ? { path: stillPath, ...await pictureSize(ctx, stillPath) } : undefined;
  live();
  if (stillPath !== undefined && ctx.assetVersion(stillPath) !== stillVersion) throw new Error(`${stillPath} changed while the video was being placed. Try again.`);
  // The site's player, once: its files are created only when missing, and the page's head links it.
  const input = { pages: [path], sources: { [path]: proof.source }, exists: (file: string) => ctx.paths.includes(file), kinds: ["online-video" as const] };
  let plan = mediaPlayerPlan(input);
  if (plan?.creates.length) {
    const { starterPlayerFiles } = await import("./starter-loader");
    const files = await starterPlayerFiles(); live();
    plan = mediaPlayerPlan({ ...input, files });
  }
  if (plan?.notes.length) throw new Error(plan.notes.join(" "));
  const label = `${video.service === "youtube" ? "YouTube" : "Vimeo"} video added`;
  if (cancelled()) return;
  const placement: MediaPlacement = {
    label, path, source: proof.source, stale: changed, live: () => !cancelled() && current(), records: { text: metadata },
    expectedPaths: ctx.paths, expectedSources: templates, ...stillPath ? { expectedAssets: new Map([[stillPath, stillVersion]]) } : {},
    files: plan?.creates,
    apply: (paths, requests, now) => {
      const record = findOnlineVideo(now, video), at = record?.still ? paths.indexOf(record.still) : -1;
      const copied = at >= 0 ? requests[at]?.result?.outputs[0] : undefined;
      const still = copied && record?.still ? { path: record.still, width: copied.width, height: copied.height }
        : record?.still && record.still === existing?.path ? existing : undefined;
      const { markup } = onlineVideoMarkup({ video, title: record?.title, still, serviceBar: record?.serviceBar });
      const page = insertAtPlace(proof.source, place, markup, items);
      if (page === undefined) throw new Error("A video cannot go in that spot of the page.");
      return mediaPlayerPlan({ pages: [path], sources: { [path]: page }, exists: () => true, kinds: ["online-video"] })?.edits.get(path) ?? page;
    },
  };
  if (again) {
    await host.onlineVideo(again, placement);
    ctx.assertLive();
    ports.select?.(path, insertedNode(place));
    ports.announce(`${label}.`);
    return;
  }
  const result = await addOnlineVideo({ video, records, paths: ctx.paths, workspace: { import: (requests, at) => host.import(requests, at), onlineVideo: (record, at) => host.onlineVideo!(record, at) }, fetch: service.fetch ?? globalThis.fetch.bind(globalThis), prepare: service.prepare, place: placement, assertLive: live });
  ctx.assertLive();
  ports.select?.(path, insertedNode(place));
  ports.announce([`${label}.`, ...result.notes].join(" "));
}
