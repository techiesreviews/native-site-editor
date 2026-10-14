// Pure source writers and installation plans, shared by placement and agent tools.
// Load this module only when placing media; it is outside the editor's boot path.
import { resolveImportPath } from "../../shared/css-imports";
import { formatBytes } from "../uploads";
import { COMPONENT_LOADER_PATH, insertHeadLine, type ComponentLoaderPlan } from "./component-loader";
import { mediaEscape, mediaUrl } from "./media-attributes";
import { descendants, parseSource, startTagAttributes, type SourceElement } from "./component-model";

export interface PlayerMarkup { markup: string; notes: string[] }
export interface PlayerSubtitles { path: string; lang?: string; label?: string }
export interface PlayerVideo {
  path: string; still?: string; width?: number; height?: number; name?: string; subtitles?: PlayerSubtitles;
}
export interface PlayerAudio { path: string; duration?: number; name?: string; subtitles?: PlayerSubtitles }
export interface PlayerDownload {
  path: string; name?: string; size?: number; preview?: { path: string; width?: number; height?: number };
}
/** Reserved kinds allow later slices to extend placement without changing this contract. */
export type MediaPlayerKind = "video" | "audio" | "download" | "online-video" | "looping-video" | "background-video";
export interface MediaPlayerNeeds { stylesheet: boolean; script: boolean }
export const MEDIA_PLAYER_STYLE = "styles/media-player.css";
export const MEDIA_PLAYER_SCRIPT = "scripts/media-player.js";
export const MEDIA_ONLINE_SCRIPT = "scripts/media-online.js";
export type StarterPlayerFiles = Record<string, string>;
export interface MediaPlayerInput {
  pages: readonly string[];
  sources: Record<string, string>;
  exists: (path: string) => boolean;
  kinds: readonly MediaPlayerKind[];
  /** Omit on the first pass; creates then lists required paths with empty content. */
  files?: StarterPlayerFiles;
}

const attr = (name: string, value: string | number | undefined) => value === undefined ? "" : ` ${name}="${mediaEscape(String(value))}"`;
const positive = (value?: number) => value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
const attribute = (source: string, element: SourceElement, name: string) => startTagAttributes(source, element.tag).find(item => item.name === name)?.value;
const headOf = (source: string) => [...descendants(parseSource(source))].find(element => element.name === "head");
const headElements = (head: SourceElement) => head.children.filter((node): node is SourceElement => node.type === "element");
const stylesheet = (source: string, element: SourceElement) => element.name === "link" &&
  (attribute(source, element, "rel") ?? "").toLowerCase().split(/\s+/).includes("stylesheet");
const moduleScript = (source: string, element: SourceElement, path: string, target: string) => element.name === "script" &&
  (attribute(source, element, "type") ?? "").trim().toLowerCase() === "module" &&
  resolveImportPath(path, attribute(source, element, "src") ?? "") === target;

/** Read the page's language without a DOM; callers pass it to either player writer. */
export function pageMediaLanguage(source: string): string | undefined {
  const html = parseSource(source).find(node => node.type === "element" && node.name === "html");
  return html?.type === "element" ? attribute(source, html, "lang")?.trim() || undefined : undefined;
}

/** A well-formed language tag in its usual spelling ("en-gb" → "en-GB"), else nothing. */
function languageTag(value?: string): string | undefined {
  try { return value?.trim() ? Intl.getCanonicalLocales(value.trim())[0] : undefined; } catch { return undefined; }
}

function subtitleMarkup(subtitles?: PlayerSubtitles, pageLanguage?: string): PlayerMarkup {
  if (!subtitles) return { markup: "", notes: [] };
  if (!/\.vtt$/i.test(subtitles.path)) return { markup: "", notes: ["Subtitles need a WebVTT (.vtt) file; this subtitles file was left out."] };
  // A malformed language falls back to the page's; with neither, browsers still use the track.
  const page = languageTag(pageLanguage), lang = languageTag(subtitles.lang) ?? page;
  let label = subtitles.label;
  if (!label && lang) {
    try { label = new Intl.DisplayNames([page || "en"], { type: "language", fallback: "none" }).of(lang); }
    catch { /* An unsupported language or browser still gets a useful label. */ }
  }
  return { markup: `<track kind="subtitles"${attr("src", mediaUrl(subtitles.path))}${attr("srclang", lang)}${attr("label", label || "Subtitles")}>`, notes: [] };
}

export function videoMarkup(video: PlayerVideo, pageLanguage?: string): PlayerMarkup {
  const track = subtitleMarkup(video.subtitles, pageLanguage);
  return { markup: `<video${attr("src", mediaUrl(video.path))}${attr("poster", video.still ? mediaUrl(video.still) : undefined)} controls preload="none" playsinline${attr("width", positive(video.width))}${attr("height", positive(video.height))}${attr("aria-label", video.name)}>${track.markup}</video>`, notes: track.notes };
}

export function audioMarkup(audio: PlayerAudio, pageLanguage?: string): PlayerMarkup {
  const track = subtitleMarkup(audio.subtitles, pageLanguage);
  const duration = positive(audio.duration);
  return { markup: `<audio${attr("src", mediaUrl(audio.path))} controls preload="none"${attr("data-duration", duration === undefined ? undefined : Math.round(duration))}${attr("aria-label", audio.name)}>${track.markup}</audio>`, notes: track.notes };
}

export function downloadCardMarkup(file: PlayerDownload): PlayerMarkup {
  const filename = file.path.split("/").at(-1) ?? file.path;
  const type = /\.([^./]+)$/.exec(filename)?.[1].toUpperCase() ?? "File";
  const pdf = type === "PDF";
  const size = file.size !== undefined && Number.isFinite(file.size) && file.size >= 0 ? ` · ${formatBytes(file.size)}` : "";
  const image = file.preview ? `<img${attr("src", mediaUrl(file.preview.path))} alt=""${attr("width", positive(file.preview.width))}${attr("height", positive(file.preview.height))} loading="lazy" decoding="async">` : "";
  return { markup: `<a class="download-card"${attr("href", mediaUrl(file.path))}${pdf ? "" : " download"}>${image}<span class="download-card-name">${mediaEscape(file.name || filename.replace(/\.[^.]+$/, ""))}</span><span class="download-card-meta">${mediaEscape(type + size)}</span><span class="download-card-action">${pdf ? "Open" : "Download"}</span></a>`, notes: [] };
}

/** Only the head's own links and module scripts count, as for the component loader. */
export function pageMediaPlayer(source: string, path: string): MediaPlayerNeeds {
  const head = headOf(source), elements = head ? headElements(head) : [];
  return {
    stylesheet: elements.some(element => stylesheet(source, element) && resolveImportPath(path, attribute(source, element, "href") ?? "") === MEDIA_PLAYER_STYLE),
    script: elements.some(element => moduleScript(source, element, path, MEDIA_PLAYER_SCRIPT)),
  };
}

export function addMediaPlayerLinks(source: string, path: string, needs: MediaPlayerNeeds): string | undefined {
  let head = headOf(source);
  if (!head?.close) return;
  const loaded = pageMediaPlayer(source, path);
  if (needs.stylesheet && !loaded.stylesheet) {
    const last = headElements(head).filter(element => stylesheet(source, element)).at(-1);
    source = insertHeadLine(source, head, '<link rel="stylesheet" href="/styles/media-player.css">', last);
  }
  if (needs.script && !loaded.script) {
    head = headOf(source)!;
    const elements = headElements(head);
    const after = elements.find(element => moduleScript(source, element, path, COMPONENT_LOADER_PATH)) ??
      elements.find(element => stylesheet(source, element) && resolveImportPath(path, attribute(source, element, "href") ?? "") === MEDIA_PLAYER_STYLE);
    source = insertHeadLine(source, head, '<script type="module" src="/scripts/media-player.js"></script>', after);
  }
  return source;
}

export function mediaPlayerPlan(input: MediaPlayerInput): ComponentLoaderPlan | undefined {
  // Every kind but a download card is driven by the player's script; cards need only its stylesheet.
  const script = input.kinds.some(kind => kind !== "download");
  const needs = { stylesheet: input.kinds.length > 0, script };
  if (!needs.stylesheet || !input.pages.length) return;
  const edits = new Map<string, string>(), pages: string[] = [], notes: string[] = [];
  let usable = false;
  for (const path of new Set(input.pages)) {
    const source = input.sources[path];
    const next = source === undefined ? undefined : addMediaPlayerLinks(source, path, needs);
    if (next === undefined) notes.push(source === undefined
      ? `${path} could not be read, so the media player was not added to it.`
      : `${path} has no head to place the media player in; the page was left out.`);
    else {
      usable = true;
      if (next !== source) { edits.set(path, next); pages.push(path); }
    }
  }
  const required = usable ? [MEDIA_PLAYER_STYLE, ...(script ? [MEDIA_PLAYER_SCRIPT, MEDIA_ONLINE_SCRIPT] : [])] : [];
  const creates = required.filter(path => !input.exists(path)).map(path => {
    if (input.files && input.files[path] === undefined) throw new Error(`The site's media player file ${path} could not be read.`);
    return { path, content: input.files?.[path] ?? "" };
  });
  if (!creates.length && !pages.length && !notes.length) return;
  const where = pages.length === 1 ? " to the page" : pages.length ? ` to ${pages.length} pages` : "";
  const added = creates.length || pages.length ? `Added the site's media player${where}${creates.length ? ` (${creates.map(file => file.path).join(", ")} created)` : ""}.` : "";
  return { creates, edits, pages, added, notes };
}
