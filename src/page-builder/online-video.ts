// Pure online-video records and source transforms; loaded only by media actions.
import type { MediaRecords, OnlineVideoRecord } from "../../shared/media-records";
import { descendants, parseSource, startTagAttributes, type SourceElement } from "./component-model";
import { mediaAttribute, mediaEscape, mediaUrl } from "./media-attributes";

export interface OnlineVideoKey { service: "youtube" | "vimeo"; id: string }
export interface OnlineVideo extends OnlineVideoKey { hash?: string; start?: number }
export interface OnlineVideoStill { path: string; width?: number; height?: number }
const same = (a: OnlineVideoKey, b: OnlineVideoKey) => a.service === b.service && a.id === b.id;
const seconds = (value: string | null | undefined) => {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value?.trim() ?? "");
  const time = match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0;
  return Number.isSafeInteger(time) && time > 0 ? time : undefined;
};
export function parseOnlineVideoAddress(text: string): OnlineVideo | undefined {
  let url: URL;
  try { url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text.trim()) ? text.trim() : `https://${text.trim()}`); } catch { return; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return;
  const host = url.hostname.toLowerCase().replace(/^(?:www|m)\./, ""), parts = url.pathname.split("/").filter(Boolean);
  const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start") ?? /(?:^|&)t=([^&]+)/.exec(url.hash.slice(1))?.[1]);
  const youtube = (id?: string | null): OnlineVideo | undefined => id && /^[\w-]{11}$/.test(id) ? { service: "youtube", id, ...start ? { start } : {} } : undefined;
  if (host === "youtu.be") return youtube(parts[0]);
  if (["youtube.com", "youtube-nocookie.com"].includes(host)) {
    if (parts[0] === "watch") return youtube(url.searchParams.get("v"));
    if (["embed", "shorts", "live", "v"].includes(parts[0])) return youtube(parts[1]);
    return;
  }
  let id: string | undefined, hash: string | null | undefined;
  if (host === "player.vimeo.com" && parts[0] === "video") { id = parts[1]; hash = url.searchParams.get("h"); }
  if (host === "vimeo.com") {
    if (/^\d+$/.test(parts[0] ?? "")) { id = parts[0]; hash = parts[1] ?? url.searchParams.get("h"); }
    else { id = [...parts].reverse().find(part => /^\d+$/.test(part)); hash = url.searchParams.get("h"); }
  }
  if (!id || !/^\d+$/.test(id) || (hash && !/^[\da-f]+$/i.test(hash))) return;
  return { service: "vimeo", id, ...hash ? { hash } : {}, ...start ? { start } : {} };
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
