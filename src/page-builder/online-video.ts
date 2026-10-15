// Pure online-video records and source transforms; loaded only by media actions.
import type { MediaRecords, OnlineVideoRecord } from "../../shared/media-records";
import { descendants, parseSource, startTagAttributes, type SourceElement } from "./component-model";
import { mediaAttribute, mediaEscape, mediaUrl } from "./media-attributes";

import { parseOnlineVideoAddress, type OnlineVideo, type OnlineVideoKey } from "../../shared/online-video-address";
export { parseOnlineVideoAddress, type OnlineVideo, type OnlineVideoKey } from "../../shared/online-video-address";
export interface OnlineVideoStill { path: string; width?: number; height?: number }
const same = (a: OnlineVideoKey, b: OnlineVideoKey) => a.service === b.service && a.id === b.id;
/** Why a pasted address cannot be placed (the picker's field, slice 68); undefined when it can. */
export function onlineAddressProblem(text: string): string | undefined {
  const value = text.trim();
  if (!value) return "Paste the address of a YouTube or Vimeo video.";
  if (parseOnlineVideoAddress(value)) return;
  let host = "";
  try { host = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`).hostname.toLowerCase(); } catch { /* not an address */ }
  return /(?:^|\.)(?:youtube(?:-nocookie)?\.com|youtu\.be|vimeo\.com)$/.test(host)
    ? "This address is not one video. Copy the address of the video itself."
    : "Only YouTube and Vimeo videos can be placed. Paste a YouTube or Vimeo address.";
}
export function onlineVideoHref(video: OnlineVideo, start = video.start): string {
  const time = start !== undefined && Number.isSafeInteger(start) && start > 0 ? start : 0;
  return video.service === "youtube" ? `https://www.youtube.com/watch?v=${video.id}${time ? `&t=${time}` : ""}`
    : `https://vimeo.com/${video.id}${video.hash ? `/${video.hash}` : ""}${time ? `#t=${time}s` : ""}`;
}
export const findOnlineVideo = (records: MediaRecords, key: OnlineVideoKey) => records.onlineVideos?.find(video => same(video, key));
export function upsertOnlineVideo(records: MediaRecords, record: OnlineVideoRecord): MediaRecords {
  const previous = findOnlineVideo(records, record), next = { ...previous, ...record };
  return { ...records, onlineVideos: [...records.onlineVideos?.filter(video => !same(video, record)) ?? [], next] };
}
export function setOnlineVideoStill(records: MediaRecords, key: OnlineVideoKey, still: string | undefined): MediaRecords {
  const record = findOnlineVideo(records, key);
  if (!record) return records;
  // Any swap points at another image (or none): it is no longer the copied picture.
  const next = { ...record }; delete next.stillCopied; if (still === undefined) delete next.still; else next.still = still;
  return { ...records, onlineVideos: records.onlineVideos?.map(video => same(video, key) ? next : video) };
}
export function removeOnlineVideo(records: MediaRecords, key: OnlineVideoKey): MediaRecords {
  return { ...records, onlineVideos: records.onlineVideos?.filter(video => !same(video, key)) };
}
export function onlineVideoStillPlan(records: MediaRecords, key: OnlineVideoKey, paths: Iterable<string>) {
  const record = findOnlineVideo(records, key);
  return { record, copy: !record?.still || !new Set(paths).has(record.still) };
}
const attr = (name: string, value?: string | number) => value === undefined ? "" : ` ${name}="${mediaEscape(String(value))}"`;
const positive = (value?: number) => value && Number.isFinite(value) && value > 0 ? value : undefined;
export function onlineVideoMarkup(input: { video: OnlineVideo; title?: string; still?: OnlineVideoStill; start?: number; serviceBar?: boolean }) {
  const title = input.title || (input.video.service === "youtube" ? "YouTube video" : "Vimeo video");
  const image = input.still ? `<img${attr("src", mediaUrl(input.still.path))}${attr("alt", title)}${attr("width", positive(input.still.width))}${attr("height", positive(input.still.height))}>` : mediaEscape(title);
  return { markup: `<a class="online-video"${attr("href", onlineVideoHref(input.video, input.start))}${input.serviceBar ? ' data-controls="service"' : ""}${input.still ? "" : attr("aria-label", title)}>${image}</a>`, notes: input.still ? [] : ["Add your own still picture…"] };
}
function links(source: string) {
  return [...descendants(parseSource(source))].flatMap(element => {
    const attributes = startTagAttributes(source, element.tag);
    if (element.name !== "a" || !attributes.find(attr => attr.name === "class")?.value.split(/\s+/).includes("online-video")) return [];
    const video = parseOnlineVideoAddress(attributes.find(attr => attr.name === "href")?.value ?? "");
    return video ? [{ element, video }] : [];
  });
}
export function onlineVideoUses(sources: Record<string, string>) {
  const uses: Record<string, string[]> = {};
  for (const [path, source] of Object.entries(sources)) for (const { video } of links(source)) {
    const key = `${video.service}:${video.id}`;
    if (!(uses[key] ??= []).includes(path)) uses[key].push(path);
  }
  return uses;
}
/** Media's online videos (slice 68): each recorded video, the HTML files that show it, and its still
 * picture while that is in the site. */
export function mediaOnlineVideos(records: MediaRecords, sources: Record<string, string>, paths: Iterable<string>) {
  const present = new Set(paths);
  const uses = onlineVideoUses(Object.fromEntries(Object.entries(sources).filter(([path]) => /\.html$/i.test(path))));
  return (records.onlineVideos ?? []).map(video => ({
    key: `online:${video.service}:${video.id}`, service: video.service, id: video.id,
    ...video.hash ? { hash: video.hash } : {}, ...video.title ? { title: video.title } : {},
    ...video.still && present.has(video.still) ? { still: video.still } : {}, ...video.stillCopied ? { stillCopied: true } : {}, ...video.serviceBar ? { serviceBar: true } : {},
    uses: (uses[`${video.service}:${video.id}`] ?? []).sort((a, b) => a.localeCompare(b)),
  }));
}
function stillTag(source: string, image: SourceElement, still: OnlineVideoStill) {
  const edits: { start: number; end: number; text: string }[] = [];
  let added = "";
  for (const [name, value] of [["src", mediaUrl(still.path)], ["width", positive(still.width)], ["height", positive(still.height)]] as const) {
    const old = mediaAttribute(source, image.tag, name);
    if (old) edits.push({ start: old.start, end: old.end, text: attr(name, value) });
    else added += attr(name, value);
  }
  const at = image.tag.end - (source[image.tag.end - 2] === "/" ? 2 : 1);
  edits.push({ start: at, end: at, text: added });
  let result = source.slice(image.start, image.tag.end);
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start - image.start) + edit.text + result.slice(edit.end - image.start);
  return result;
}
export function swapOnlineVideoStillInPage(source: string, key: OnlineVideoKey, still: OnlineVideoStill): string {
  const edits = links(source).filter(link => same(link.video, key)).map(({ element }) => {
    const image = [...descendants(element.children)].find(child => child.name === "img");
    return image ? { start: image.start, end: image.tag.end, text: stillTag(source, image, still) }
      // A link without a picture holds the title as text (it keeps its aria-label): the picture replaces it.
      : { start: element.tag.end, end: element.close?.start ?? element.tag.end, text: `<img${attr("src", mediaUrl(still.path))} alt=""${attr("width", positive(still.width))}${attr("height", positive(still.height))}>` };
  });
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}

/** The per-video service bar choice follows every placed copy of the player. */
export function setOnlineVideoServiceBarInPage(source: string, key: OnlineVideoKey, enabled: boolean): string {
  const edits = links(source).filter(link => same(link.video, key)).map(({ element }) => {
    const old = mediaAttribute(source, element.tag, "data-controls");
    return { start: old?.start ?? element.tag.end - 1, end: old?.end ?? element.tag.end - 1, text: enabled ? ' data-controls="service"' : "" };
  });
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
/** The service's own player for `video`, starting as it loads (the starter's `playerAddress` with the
 * service's bar): the edit bar's Play (media-play.ts). */
export function onlinePlayerAddress(video: OnlineVideo): string {
  if (video.service === "youtube") {
    const query = new URLSearchParams({ autoplay: "1", playsinline: "1", rel: "0", iv_load_policy: "3" });
    if (video.start) query.set("start", String(video.start));
    return `https://www.youtube-nocookie.com/embed/${video.id}?${query}`;
  }
  const query = new URLSearchParams({ autoplay: "1", playsinline: "1", dnt: "1", title: "0", byline: "0", portrait: "0" });
  if (video.hash) query.set("h", video.hash);
  return `https://player.vimeo.com/video/${video.id}?${query}${video.start ? `#t=${video.start}s` : ""}`;
}
