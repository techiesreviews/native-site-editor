// The Media button's rules (media build slice 119): what a selected media spot holds, its file and
// its title, read from the page's bytes. Pure; loaded with the Media popup.
import { startTags, type ElementRange } from "../../shared/html-source";
import type { NativeTextEdit } from "../../shared/native-project";
import { mediaAttribute, mediaEscape } from "./media-attributes";
import { decodeHtmlEntities } from "./html-entities";
import { mediaResolvePath } from "./media-references";
import { isPictureSpot } from "./looping-video";

/** A spot the Media popup shows (pictures keep the Image popup). */
export type MediaSpotKind = "video" | "audio" | "download" | "online-video";

const classes = (tag: string) => ` ${mediaAttribute(tag, startTags(tag)[0], "class")?.value ?? ""} `.replace(/\s+/g, " ");
const value = (tag: string, name: string) => {
  const found = mediaAttribute(tag, startTags(tag)[0], name);
  return found ? decodeHtmlEntities(found.value, true) : undefined;
};

/** What the element at `range` is, for the Media popup: a video (a section's background is not), audio, a
 * download card or an Online video; undefined for anything else. */
export function mediaSpotKind(source: string, range: ElementRange): MediaSpotKind | undefined {
  const tag = source.slice(range.tag.start, range.tag.end);
  if (range.tag.name === "video") return value(tag, "data-background") === undefined ? "video" : undefined;
  if (range.tag.name === "audio") return "audio";
  if (range.tag.name !== "a") return undefined;
  const names = classes(tag);
  return names.includes(" download-card ") ? "download" : names.includes(" online-video ") ? "online-video" : undefined;
}

/** A video in a picture spot: it always loops silently, and Replace takes a picture or a video. */
export const inPictureSpot = (source: string, range: ElementRange) =>
  range.tag.name === "video" && isPictureSpot(source.slice(range.tag.start, range.tag.end));

/** The address the spot shows: a player's `src` or its first `<source>`, a card's or link's `href`. */
export function mediaSpotAddress(source: string, range: ElementRange): string | undefined {
  const tag = source.slice(range.tag.start, range.tag.end);
  if (range.tag.name === "a") return value(tag, "href");
  const own = value(tag, "src");
  if (own) return own;
  const inner = source.slice(range.tag.end, range.close?.start ?? range.end);
  const first = startTags(inner).find(item => item.name === "source");
  return first ? value(inner.slice(first.start, first.end), "src") : undefined;
}

/** The spot's file in the site (a root path), or undefined for another site's address. */
export function mediaSpotFile(source: string, range: ElementRange, page: string, prefix = ""): string | undefined {
  const address = mediaSpotAddress(source, range);
  return address ? mediaResolvePath(address, page, undefined, prefix) : undefined;
}

/** A download card's visible name (its `.download-card-name` text), with where it sits in the page. */
function cardName(source: string, range: ElementRange) {
  const inner = source.slice(range.tag.end, range.close?.start ?? range.end);
  const tag = startTags(inner).find(item => item.name === "span" && classes(inner.slice(item.start, item.end)).includes(" download-card-name "));
  if (!tag) return undefined;
  const end = inner.indexOf("</span>", tag.end);
  // Words only: a name holding other markup is edited in Code.
  if (end < 0 || inner.slice(tag.end, end).includes("<")) return undefined;
  return { start: range.tag.end + tag.end, end: range.tag.end + end, text: decodeHtmlEntities(inner.slice(tag.end, end)) };
}

/** The spot's title: the name a player is heard by (`aria-label`), a download card's visible name;
 * undefined where it has none to edit (an Online video is named by its still). */
export function mediaSpotTitle(source: string, range: ElementRange, kind: MediaSpotKind): string | undefined {
  if (kind === "online-video") return undefined;
  if (kind === "download") return cardName(source, range)?.text;
  return value(source.slice(range.tag.start, range.tag.end), "aria-label") ?? "";
}

/** The edit that gives the spot `title` (an empty one takes a player's name off); none when unchanged. */
export function mediaSpotTitleEdit(source: string, range: ElementRange, kind: MediaSpotKind, title: string): NativeTextEdit | undefined {
  const words = title.trim();
  if (mediaSpotTitle(source, range, kind) === words || kind === "online-video") return undefined;
  if (kind === "download") {
    const name = cardName(source, range);
    if (!name) return undefined;
    if (!words) throw new Error("A download needs a name.");
    return { start: name.start, end: name.end, text: mediaEscape(words) };
  }
  const tag = source.slice(range.tag.start, range.tag.end), parsed = startTags(tag)[0], found = mediaAttribute(tag, parsed, "aria-label");
  const text = words ? ` aria-label="${mediaEscape(words)}"` : "";
  if (found) return { start: range.tag.start + found.start, end: range.tag.start + found.end, text };
  return { start: range.tag.start + parsed.nameEnd, end: range.tag.start + parsed.nameEnd, text };
}
