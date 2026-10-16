// Pure source writers. Import lazily when editing or placing a video.
import { siteAddress } from "../../shared/site-path-prefix";
import { startTags, type ElementRange } from "../../shared/html-source";
import type { MediaFileRecord } from "../../shared/media-records";
import type { NativeTextEdit } from "../../shared/native-project";
import { mediaAttribute, mediaEscape } from "./media-attributes";
import { decodeHtmlEntities } from "./html-entities";
import { descendants, parseSource } from "./source-tree";
import { videoMarkup, type PlayerMarkup, type PlayerVideo } from "./player-markup";

const attr = (name: string, value?: string | number) => value === undefined ? "" : ` ${name}="${mediaEscape(String(value))}"`;
const positive = (n?: number) => n !== undefined && Number.isFinite(n) && n > 0 ? n : undefined;
export function loopingVideoMarkup(video: PlayerVideo, prefix = ""): PlayerMarkup {
  return { markup: `<video${attr("src", siteAddress(video.path, prefix))}${attr("poster", video.still ? siteAddress(video.still, prefix) : undefined)} controls muted loop playsinline${attr("width", positive(video.width))}${attr("height", positive(video.height))}${attr("aria-label", video.name || undefined)}></video>`, notes: [] };
}
export function backgroundVideoMarkup(video: { path: string; still?: string }, prefix = ""): string {
  return `<video data-background${attr("src", siteAddress(video.path, prefix))}${attr("poster", video.still ? siteAddress(video.still, prefix) : undefined)} muted loop playsinline preload="none"></video>`;
}
export const loopsFromStart = (record?: MediaFileRecord): boolean => record?.fromGif === true;
export function placedVideoMarkup(video: PlayerVideo, record?: MediaFileRecord, pageLanguage?: string, prefix = ""): PlayerMarkup {
  return loopsFromStart(record) ? loopingVideoMarkup(video, prefix) : videoMarkup(video, pageLanguage, prefix);
}
const first = (text: string) => startTags(text)[0];
const has = (text: string, name: string) => { const tag = first(text); return !!tag && !!mediaAttribute(text, tag, name); };
export function readLooping(tagText: string): boolean {
  return first(tagText)?.name === "video" && has(tagText, "muted") && has(tagText, "loop");
}
export const PICTURE_SPOT_MESSAGE = "A video in a picture spot always loops silently.";
export function isPictureSpot(tagText: string): boolean {
  return ["img", "picture", "video"].includes(first(tagText)?.name ?? "") && has(tagText, "slot");
}
/** Remove all occurrences of owned attributes; preserve every other byte. */
function without(text: string, names: string[]) {
  for (const name of names) {
    for (;;) {
      const tag = first(text), found = tag && mediaAttribute(text, tag, name);
      if (!found) break;
      text = text.slice(0, found.start) + text.slice(found.end);
    }
  }
  return text;
}
function ensure(text: string, name: string, value?: string) {
  if (has(text, name)) return text;
  const tag = first(text)!;
  const at = text[tag.end - 2] === "/" ? tag.end - 2 : tag.end - 1;
  return text.slice(0, at) + (value === undefined ? ` ${name}` : attr(name, value)) + text.slice(at);
}
export function writeLooping(tagText: string, on: boolean): string {
  if (first(tagText)?.name !== "video" || has(tagText, "data-background")) throw new Error("Choose a video that is not a section background.");
  if (!on && isPictureSpot(tagText)) throw new Error(PICTURE_SPOT_MESSAGE);
  let text = without(tagText, on ? ["autoplay", "preload"] : ["muted", "loop", "autoplay", "preload"]);
  for (const name of on ? ["muted", "loop", "playsinline", "controls"] : ["controls", "playsinline"]) text = ensure(text, name);
  if (!on) text = ensure(text, "preload", "none");
  return text;
}
export function pictureSpotVideo(spotText: string, video: PlayerVideo, prefix = ""): PlayerMarkup {
  if (!isPictureSpot(spotText)) throw new Error("Choose a picture spot.");
  return pictureVideo(spotText, video, prefix);
}
/** The attributes a picture spot keeps whatever it shows: its slot, id, class, style (shape and focus) and size. */
const SPOT_KEEPS = ["slot", "id", "class", "style", "width", "height"] as const;
function pictureVideo(spotText: string, video: PlayerVideo, prefix: string): PlayerMarkup {
  const spot = first(spotText);
  if (!spot || !["img", "picture", "video"].includes(spot.name)) throw new Error("Choose a picture spot.");
  // A video already in the spot (ticket 119's Replace): the new one keeps its attributes and name.
  const image = spot.name === "img" || spot.name === "video" ? spot : startTags(spotText).find(tag => tag.name === "img");
  let markup = loopingVideoMarkup({ ...video, width: undefined, height: undefined, name: undefined }, prefix).markup;
  const tag = first(markup)!;
  let kept = "";
  for (const name of SPOT_KEEPS) {
    const owner = mediaAttribute(spotText, spot, name) ?? (image && mediaAttribute(spotText, image, name));
    if (owner) kept += spotText.slice(owner.start, owner.end);
    else if (name === "width" || name === "height") kept += attr(name, positive(video[name]));
  }
  const alt = image && mediaAttribute(spotText, image, spot.name === "video" ? "aria-label" : "alt");
  if (alt?.value) kept += attr("aria-label", decodeHtmlEntities(alt.value, true));
  markup = markup.slice(0, tag.end - 1) + kept + markup.slice(tag.end - 1);
  return { markup, notes: [] };
}
/** A picture spot's video as the `<img>` it held before (ticket 119's Replace with a picture): the
 * spot's slot, id, class, style and size kept, and the video's name as the picture's words. The
 * picture's own file and copies are written over it by the placed-image rules. */
export function spotPictureTag(videoText: string): string {
  const video = first(videoText);
  if (video?.name !== "video" || !has(videoText, "slot")) throw new Error("Choose a picture spot.");
  let kept = "";
  for (const name of SPOT_KEEPS) { const owner = mediaAttribute(videoText, video, name); if (owner) kept += videoText.slice(owner.start, owner.end); }
  const name = mediaAttribute(videoText, video, "aria-label");
  return `<img src=""${kept}${name ? attr("alt", decodeHtmlEntities(name.value, true)) : ""}>`;
}
/** Replace the whole picture wrapper, preserving its presentation attributes. */
export function gifLoopingVideo(source: string, range: ElementRange, video: PlayerVideo, options: { linked?: boolean } = {}, prefix = ""): PlayerMarkup {
  const written = pictureVideo(source.slice(range.start, range.end), video, prefix);
  return options.linked ? { ...written, markup: without(written.markup, ["controls"]) } : written;
}
function sectionAt(source: string, range: ElementRange) {
  const section = [...descendants(parseSource(source))].find(el => el.start === range.tag.start);
  if (range.tag.name !== "section" || section?.name !== "section" || !section.close || section.end !== range.end) throw new Error("Choose a section.");
  return section;
}
export function readSectionBackground(source: string, sectionRange: ElementRange): ElementRange | undefined {
  const section = sectionAt(source, sectionRange);
  const child = section.children.find(node => node.type === "element" || source.slice(node.start, node.end).trim());
  if (child?.type !== "element" || child.name !== "video" || !mediaAttribute(source, child.tag, "data-background") || !child.close) return;
  return { tag: child.tag, start: child.start, end: child.end, close: child.close };
}
export function sectionBackgroundEdits(source: string, sectionRange: ElementRange, video?: { path: string; still?: string }, prefix = ""): NativeTextEdit[] {
  const section = sectionAt(source, sectionRange), old = readSectionBackground(source, sectionRange);
  if (old) {
    if (video) return [{ start: old.start, end: old.end, text: backgroundVideoMarkup(video, prefix) }];
    const before = source.slice(section.tag.end, old.start);
    const line = /(?:\r\n|\n)[\t ]*$/.exec(before);
    return [{ start: line ? section.tag.end + line.index : old.start, end: old.end, text: "" }];
  }
  if (!video) return [];
  const inner = source.slice(section.tag.end, section.close!.start), newline = source.includes("\r\n") ? "\r\n" : "\n";
  const leading = /^(?:\r\n|\n)([\t ]*)/.exec(inner);
  const parentIndent = /(?:^|\n)([\t ]*)[^\n]*$/.exec(source.slice(0, section.start))?.[1] ?? "";
  const indent = leading?.[1] && leading[1].length > parentIndent.length ? leading[1] : parentIndent + "  ";
  const markup = backgroundVideoMarkup(video, prefix);
  return [{ start: section.tag.end, end: section.tag.end, text: leading ? newline + indent + markup : inner.trim() ? markup : newline + indent + markup + (inner ? "" : newline + parentIndent) }];
}
