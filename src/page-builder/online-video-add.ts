// Browser service reads and preparation, imported only by the adding action.
import type { MediaRecords, OnlineVideoRecord } from "../../shared/media-records";
import type { MediaImportRequest, MediaPlacement } from "./media-picker";
import type { prepareMediaFile } from "./media-prepare";
import type { OnlineVideo } from "./online-video";

export interface OnlineVideoRead { title?: string; still?: File; width?: number; height?: number; note?: string }
const options: RequestInit = { credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" };
export async function readOnlineVideo(video: OnlineVideo, fetch: typeof globalThis.fetch): Promise<OnlineVideoRead> {
  const { onlineVideoHref } = await import("./online-video");
  const name = video.service === "youtube" ? "YouTube" : "Vimeo";
  const note = `${name} did not share this video's picture, so add your own still picture.`;
  const result: OnlineVideoRead = {};
  let status: number | undefined, data: Record<string, unknown> = {};
  try {
    const address = encodeURIComponent(onlineVideoHref(video, 0));
    const response = await fetch(video.service === "youtube" ? `https://www.youtube.com/oembed?url=${address}&format=json` : `https://vimeo.com/api/oembed.json?url=${address}&width=1280`, options);
    status = response.status;
    if (response.ok) {
      const json: unknown = await response.json();
      if (json && typeof json === "object" && !Array.isArray(json)) data = json as Record<string, unknown>;
      if (typeof data.title === "string") result.title = data.title;
    }
  } catch { /* A missing title never prevents adding the video. */ }
  const image = async (url: string) => {
    const response = await fetch(url, options);
    if (response.status !== 200 || !response.headers.get("content-type")?.toLowerCase().startsWith("image/")) return { status: response.status };
    const blob = await response.blob();
    const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
    result.still = new File([blob], `${video.service}-${video.id}.${extension}`, { type: blob.type });
    return { status: response.status };
  };
  if (video.service === "youtube") {
    for (const size of ["maxresdefault", "sddefault", "hqdefault"]) {
      try {
        const response = await image(`https://i.ytimg.com/vi/${video.id}/${size}.jpg`);
        if (result.still) break;
        if (size === "hqdefault" && response.status === 404 && (status === 404 || status === 400)) throw new Error("YouTube has no video at this address.");
      } catch (error) {
        if (error instanceof Error && error.message === "YouTube has no video at this address.") throw error;
      }
    }
  } else if (status === 200 && typeof data.thumbnail_url === "string") {
    try {
      const url = new URL(data.thumbnail_url);
      if (url.protocol === "https:" && url.hostname === "i.vimeocdn.com" && !url.port && !url.username && !url.password) await image(url.href);
    } catch { /* The fallback also covers blocked/private videos and CORS failures. */ }
  }
  // YouTube's oEmbed size is its embed frame's, not the still's; Vimeo reports the thumbnail's own.
  if (video.service === "vimeo" && result.still) for (const key of ["width", "height"] as const) {
    const value = data[`thumbnail_${key}`];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) result[key] = value;
  }
  if (!result.still) result.note = note;
  return result;
}
export interface OnlineVideoAddInput {
  address?: string; video?: OnlineVideo; records: MediaRecords; paths: Iterable<string>;
  workspace: {
    import(requests: MediaImportRequest[], place?: MediaPlacement): Promise<string[]>;
    onlineVideo(record: OnlineVideoRecord, place?: MediaPlacement): Promise<void>;
  };
  fetch: typeof globalThis.fetch; prepare?: typeof prepareMediaFile; place?: MediaPlacement;
  /** Captured repository/scope proof; checked after every asynchronous preparation. */
  assertLive(): void;
}
export async function addOnlineVideo(input: OnlineVideoAddInput) {
  input.assertLive();
  const { parseOnlineVideoAddress, onlineVideoStillPlan } = await import("./online-video");
  input.assertLive();
  const video = input.video ?? parseOnlineVideoAddress(input.address ?? "");
  if (!video) throw new Error("Enter a YouTube or Vimeo video address.");
  const plan = onlineVideoStillPlan(input.records, video, input.paths);
  if (!plan.copy) return { record: plan.record!, notes: [] as string[] };
  const read = await readOnlineVideo(video, input.fetch);
  input.assertLive();
  const record: OnlineVideoRecord = { ...plan.record, service: video.service, id: video.id, ...video.hash ? { hash: video.hash } : {}, ...read.title ? { title: read.title } : {} };
  // Undefined (not deleted) so the merge in upsertOnlineVideo drops an earlier, missing still.
  record.still = undefined; record.stillCopied = undefined;
  const notes = read.note ? [read.note] : [];
  if (read.still) {
    const { mediaStorageName } = await import("./media-storage");
    input.assertLive();
    const { mediaAddingSettings } = await import("./media-settings");
    input.assertLive();
    const prepare = input.prepare ?? (await import("./media-prepare")).prepareMediaFile;
    input.assertLive();
    const extension = read.still.name.split(".").at(-1);
    const file = new File([read.still], mediaStorageName(`${read.title?.replace(/[\\/]+/g, " ") || `${video.service}-${video.id}`}.${extension}`), { type: read.still.type });
    const prepared = await prepare(file, "online-video", "media/videos", undefined, undefined, undefined, undefined, mediaAddingSettings(input.records.adding).image);
    input.assertLive();
    const paths = await input.workspace.import([{ ...prepared.request, onlineVideo: record }], input.place);
    record.still = paths[0]; record.stillCopied = true;
    if (prepared.warning) notes.push(prepared.warning);
  } else await input.workspace.onlineVideo(record, input.place);
  return { record, notes };
}
