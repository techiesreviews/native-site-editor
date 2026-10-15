// A video's still picture and a video's or audio file's subtitles (media build slice 66, ticket 12
// "The site's own videos" and "Audio"): the pure rules behind File details' Still picture and
// Subtitles, and the page rewrites that make a change apply everywhere the file is used.
// Loaded only when one of them changes; nothing here is on the editor's boot path.
import { mediaAttribute, mediaEscape, mediaUrl } from "./media-attributes";
import { decodeHtmlEntities } from "./html-entities";
import { mediaResolvePath } from "./media-references";
import type { MediaSite } from "./media-origins";
import { descendants, parseSource, type SourceElement } from "./source-tree";
import { pageMediaLanguage, subtitleMarkup } from "./player-markup";

/** Where a moment picked as the still is saved: beside the video with its name, so it joins its family. */
export const stillPathFor = (video: string) => video.replace(/\.[^./]+$/, "") + ".webp";
/** Where subtitles are saved: beside the file with its exact name (the family rule), always WebVTT. */
export const subtitlesPathFor = (media: string) => media.replace(/\.[^./]+$/, "") + ".vtt";

/** Larger than any real subtitles file; a bigger one is almost surely the wrong file. */
export const SUBTITLES_LIMIT = 2 * 1024 * 1024;

const timing = /^\s*(\d+:)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-->\s*(\d+:)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/;
const stamp = (hours: string | undefined, minutes: string, seconds: string, fraction: string) =>
  `${(hours ? hours.slice(0, -1) : "0").padStart(2, "0")}:${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}.${fraction.padEnd(3, "0")}`;
const lines = (text: string) => text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

/** One SubRip cue line as WebVTT cue text: b/i/u kept, font colours and positioning codes dropped,
 * other markup characters written as text. */
function cueLine(line: string) {
  return line.replace(/\{\\[^}]*\}/g, "").replace(/<\/?font\b[^>]*>/gi, "")
    .replace(/&(?!(?:[a-z][a-z0-9]*|#\d+|#x[0-9a-f]+);)/gi, "&amp;")
    .replace(/<(?!\/?[biu]>)/gi, "&lt;").replace(/-->/g, "--&gt;");
}

/** SubRip (.srt) as WebVTT (ticket 12 ★): numbered cues keep their numbers, times use dots. */
export function srtToVtt(srt: string): string {
  const cues: string[] = [];
  for (const block of lines(srt).split(/\n[ \t]*\n/)) {
    const rows = block.split("\n");
    while (rows.length && !rows[0].trim()) rows.shift();
    const at = rows.findIndex(row => timing.test(row));
    if (at < 0 || at > 1) continue;
    const [, h1, m1, s1, f1, h2, m2, s2, f2] = timing.exec(rows[at])!;
    const id = at === 1 && !rows[0].includes("-->") ? rows[0].trim() : "";
    const text = rows.slice(at + 1).map(cueLine).filter(row => row.trim());
    if (!text.length) continue;
    cues.push([...id ? [id] : [], `${stamp(h1, m1, s1, f1)} --> ${stamp(h2, m2, s2, f2)}`, ...text].join("\n"));
  }
  return cues.length ? `WEBVTT\n\n${cues.join("\n\n")}\n` : "";
}

/** A chosen subtitles file as the WebVTT to save, or why it cannot be used. */
export function readSubtitles(name: string, text: string): { vtt: string } | { problem: string } {
  if (text.length > SUBTITLES_LIMIT) return { problem: `${name} is too large for a subtitles file.` };
  if (/\.srt$/i.test(name)) {
    const vtt = srtToVtt(text);
    return vtt ? { vtt } : { problem: `${name} has no subtitles in it.` };
  }
  if (!/\.vtt$/i.test(name)) return { problem: "Choose a subtitles file ending in .vtt or .srt." };
  const vtt = lines(text);
  if (!/^WEBVTT(?:[ \t\n]|$)/.test(vtt)) return { problem: `${name} is not a WebVTT subtitles file.` };
  if (!/-->/.test(vtt)) return { problem: `${name} has no subtitles in it.` };
  return { vtt: vtt.endsWith("\n") ? vtt : vtt + "\n" };
}

// `site` holds the site's own addresses, so `https://example.com/media/a.mp4` is the site's file too.
const resolves = (source: string, element: SourceElement, page: string, file: string, site?: MediaSite) => {
  const src = mediaAttribute(source, element.tag, "src");
  return Boolean(src && mediaResolvePath(decodeHtmlEntities(src.value, true), page, site) === file);
};
const childElements = (element: SourceElement) => element.children.filter((node): node is SourceElement => node.type === "element");

/** The `<video>`/`<audio>` elements on `page` that play `media`: their own src or one of their `<source>`s. */
export function mediaPlayers(source: string, page: string, media: string, site?: MediaSite): SourceElement[] {
  return [...descendants(parseSource(source))].filter(element => (element.name === "video" || element.name === "audio") &&
    (resolves(source, element, page, media, site) || childElements(element).some(child => child.name === "source" && resolves(source, child, page, media, site))));
}

function apply(source: string, edits: { start: number; end: number; text: string }[]) {
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}

/** Every placed copy of `video` on `page` shows `still` before it plays: a looping one, a section's
 * background and a picture spot's video too. Other attributes stay byte for byte. */
export function setPosterInPage(source: string, page: string, video: string, still: string, site?: MediaSite): string {
  return apply(source, mediaPlayers(source, page, video, site).filter(element => element.name === "video").flatMap(element => {
    const poster = mediaAttribute(source, element.tag, "poster");
    if (poster && mediaResolvePath(decodeHtmlEntities(poster.value, true), page, site) === still) return [];
    const text = ` poster="${mediaEscape(mediaUrl(still))}"`;
    if (poster) return [{ start: poster.start, end: poster.end, text }];
    // Beside src, where the editor writes it.
    const at = mediaAttribute(source, element.tag, "src")?.end ?? element.tag.nameEnd;
    return [{ start: at, end: at, text }];
  }));
}

/** Every placed copy of `media` on `page` gets a subtitles track for `vtt` (in the page's language),
 * after its `<source>`s and other tracks; copies that already have it stay as they are. */
export function addTrackInPage(source: string, page: string, media: string, vtt: string, site?: MediaSite): string {
  const track = subtitleMarkup({ path: vtt }, pageMediaLanguage(source)).markup;
  return apply(source, mediaPlayers(source, page, media, site).flatMap(element => {
    const children = childElements(element);
    if (children.some(child => child.name === "track" && resolves(source, child, page, vtt, site))) return [];
    const last = children.filter(child => child.name === "source" || child.name === "track").at(-1);
    // A void start tag with no end tag (`<video src>` alone) gets nothing it could not hold.
    if (!element.close) return [];
    const at = last?.end ?? element.tag.end;
    return [{ start: at, end: at, text: track }];
  }));
}

/** Every `<track>` on `page` that loads `vtt` is taken out, with its line when it had one of its own. */
export function removeTrackInPage(source: string, page: string, vtt: string, site?: MediaSite): string {
  return apply(source, [...descendants(parseSource(source))].filter(element => element.name === "track" && resolves(source, element, page, vtt, site)).map(element => {
    let start = element.start, end = element.end;
    const before = source.slice(source.lastIndexOf("\n", start - 1) + 1, start), after = /^[ \t]*(?:\r?\n|$)/.exec(source.slice(end));
    if (!before.trim() && after && source.lastIndexOf("\n", start - 1) >= 0) {
      start -= before.length + 1; end += after[0].replace(/\r?\n$/, "").length;
      if (source[start - 1] === "\r") start--;
    }
    return { start, end, text: "" };
  }));
}
