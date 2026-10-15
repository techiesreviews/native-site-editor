// On-demand Improve images engine. Never import this module from the boot bundle.
import type { MediaRecords } from "../../shared/media-records";
import { startTags } from "../../shared/html-source";
import type { ImproveImagesRow, ImprovePicture } from "./improve-images";
import type { MediaImportRequest, MediaPlacement } from "./media-picker";
import { MEDIA_FILE_CAP_BYTES } from "./media-limits";
import { mediaAttribute, mediaUrl } from "./media-attributes";
import { mediaAttributes, mediaSrcset, mediaImageForPlacement, type MediaImage } from "./media-markup";
import { mediaStorageName, mediaCopyName } from "./media-storage";
import { mediaAddingSettings } from "./media-settings";
import { prepareMediaFile } from "./media-prepare";
import { optimiseMedia } from "./media-optimise";
import { socialImageAddress } from "./social-image";
import { parseSource, type SourceNode, type SourceElement } from "./source-tree";

export const OUTSIDE_PICTURE_LABELS = { gone: "website gone", "not-allowed": "not allowed" } as const;
/** Slice 75 must skip bring-in and list these pictures for Lex, including own copies. */
export const outsidePicturesAllowed = (by: "lex" | "agent") => by === "lex";
type Reason = "gone" | "not-allowed" | "failed";
export type OutsidePictureRead = { status: "read"; file: File } | { status: Reason; note?: string };
export interface OutsidePictureReadDeps {
  fetch?: typeof globalThis.fetch;
  probe?: (url: string) => Promise<boolean>;
  signal?: AbortSignal;
  cache?: Map<string, Promise<OutsidePictureRead>>;
  assertLive?: () => void;
}
export function normaliseOutsidePicture(address: string): string {
  const url = new URL(address.startsWith("//") ? "https:" + address : address);
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use an https picture address.");
  url.hash = "";
  return url.href;
}
const formats: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/bmp": "bmp" };
export function outsidePictureName(address: string, contentType?: string): string {
  const url = new URL(normaliseOutsidePicture(address));
  const labels = url.hostname.replace(/^www\./, "").split(".");
  const country = labels.at(-1)?.length === 2 && /^(co|com|org|net|gov|ac|edu)$/.test(labels.at(-2) ?? "");
  const site = labels.at(country ? -3 : -2) ?? labels[0];
  let segment = url.pathname.split("/").at(-1) ?? "";
  try { segment = decodeURIComponent(segment); } catch { /* Malformed escapes still get a tidy name. */ }
  // Decoded slashes are words in a basename, never a repository path.
  segment = segment.replace(/[\\/]/g, "-");
  const extension = formats[contentType?.split(";")[0].trim().toLowerCase() ?? ""];
  const stem = segment.replace(/\.[^.]+$/, "");
  const tidy = stem ? mediaStorageName(stem + ".png").replace(/\.png$/, "") : "";
  const base = tidy && (tidy === site || tidy.startsWith(site + "-")) ? tidy : [site, tidy].filter(Boolean).join("-");
  return mediaStorageName(base + (extension ? "." + extension : /\.[^.]+$/.exec(segment)?.[0] ?? ".webp"));
}
function sniff(bytes: Uint8Array): string | undefined {
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (text(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (/^GIF8[79]a$/.test(text(0, 6))) return "image/gif";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  if (text(4, 8) === "ftyp" && /avif|avis/.test(text(8, 64))) return "image/avif";
  if (text(0, 2) === "BM") return "image/bmp";
}
function check(deps: OutsidePictureReadDeps) { deps.signal?.throwIfAborted(); deps.assertLive?.(); }
function browserProbe(url: string, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    const finish = (loaded: boolean) => { signal?.removeEventListener("abort", abort); image.onload = image.onerror = null; resolve(loaded); };
    const abort = () => {
      signal?.removeEventListener("abort", abort); image.onload = image.onerror = null; image.src = "";
      reject(new DOMException("Picture reading cancelled.", "AbortError"));
    };
    signal?.throwIfAborted();
    signal?.addEventListener("abort", abort, { once: true });
    image.onload = () => finish(true); image.onerror = () => finish(false);
    image.src = url;
  });
}
const runCaches = new WeakMap<OutsidePictureReadDeps, Map<string, Promise<OutsidePictureRead>>>();
const tooLarge = (): OutsidePictureRead => ({ status: "failed", note: "This picture is larger than the 20 MiB adding limit." });
async function readPicture(url: string, deps: OutsidePictureReadDeps): Promise<OutsidePictureRead> {
  let response: Response;
  try {
    response = await (deps.fetch ?? globalThis.fetch)(url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", redirect: "follow", cache: "no-store", signal: deps.signal });
  } catch {
    check(deps);
    const loads = await (deps.probe ? deps.probe(url) : browserProbe(url, deps.signal));
    check(deps);
    return { status: loads ? "not-allowed" : "gone" };
  }
  check(deps);
  if (response.status !== 200) return { status: response.status === 404 || response.status === 410 || (response.status >= 500 && response.status < 600) ? "gone" : "not-allowed" };
  if (Number(response.headers.get("content-length")) > MEDIA_FILE_CAP_BYTES) return tooLarge();
  const blob = await response.blob();
  check(deps);
  if (blob.size > MEDIA_FILE_CAP_BYTES) return tooLarge();
  const bytes = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  check(deps);
  const declared = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const type = sniff(bytes) ?? (declared?.startsWith("image/") ? declared : undefined);
  if (!type) return { status: "gone" };
  if (type === "image/svg+xml") return { status: "failed", note: "Pictures in SVG format stay on their website." };
  return { status: "read", file: new File([blob], outsidePictureName(url, type), { type }) };
}
export async function readOutsidePicture(address: string, deps: OutsidePictureReadDeps = {}): Promise<OutsidePictureRead> {
  check(deps);
  let url: string;
  try { url = normaliseOutsidePicture(address); } catch (error) { return { status: "failed", note: String(error instanceof Error ? error.message : error) }; }
  const cache = deps.cache ?? runCaches.get(deps) ?? new Map<string, Promise<OutsidePictureRead>>();
  runCaches.set(deps, cache);
  if (!cache.has(url)) cache.set(url, readPicture(url, deps));
  try { const result = await cache.get(url)!; check(deps); return result; }
  catch (error) {
    cache.delete(url); check(deps);
    const result: OutsidePictureRead = { status: "failed", note: error instanceof Error ? error.message : "This picture could not be read." };
    cache.set(url, Promise.resolve(result)); return result;
  }
}
export interface OutsidePictureReplacement { picture: ImprovePicture; image: MediaImage }
/** Rewrite only planned opening tags, from the end. Surrounding links retain their exact bytes. */
export function rewriteOutsidePictures(source: string, replacements: OutsidePictureReplacement[], siteUrl?: string): string {
  let text = source;
  for (const { picture, image } of [...replacements].sort((a, b) => b.picture.tag.start - a.picture.tag.start)) {
    const existing = source.slice(picture.tag.start, picture.tag.end);
    const tag = startTags(existing)[0];
    if (!tag || !["img", "meta"].includes(tag.name)) throw new Error("The picture changed. Scan this row again.");
    let changed: string;
    if (picture.kind === "sharing") changed = mediaAttributes(existing, { content: socialImageAddress(siteUrl, image.path).address });
    else {
      const srcset = mediaSrcset(image);
      const attributes: Record<string, string | undefined> = { src: mediaUrl(image.path), srcset, width: image.width ? String(image.width) : undefined, height: image.height ? String(image.height) : undefined };
      if (srcset && !mediaAttribute(existing, tag, "sizes")) {
        const authoredLoading = mediaAttribute(existing, tag, "loading"), priority = mediaAttribute(existing, tag, "fetchpriority");
        attributes.sizes = authoredLoading || priority ? "100vw" : "auto, 100vw";
        if (!authoredLoading && !priority) attributes.loading = "lazy";
      }
      changed = mediaAttributes(existing, attributes);
    }
    text = text.slice(0, picture.tag.start) + changed + text.slice(picture.tag.end);
  }
  return text;
}
function outsideSources(source: string): Set<number> {
  const blocked = new Set<number>();
  const visit = (nodes: SourceNode[]) => {
    for (const node of nodes) if (node.type === "element") {
      if (node.name === "picture" && node.children.some(child => child.type === "element" && child.name === "source" && /(?:https?:)?\/\//i.test(mediaAttribute(source, child.tag, "srcset")?.value ?? ""))) {
        node.children.filter((child): child is SourceElement => child.type === "element" && child.name === "img").forEach(child => blocked.add(child.tag.start));
      }
      visit(node.children);
    }
  };
  visit(parseSource(source)); return blocked;
}
export interface BringInOutsidePicturesInput extends OutsidePictureReadDeps {
  row?: ImproveImagesRow; file?: string; pictures?: ImprovePicture[]; source: string;
  records: MediaRecords; paths: Iterable<string>;
  workspace: { import(requests: MediaImportRequest[], place?: MediaPlacement): Promise<string[]> };
  prepare?: typeof prepareMediaFile; assertLive(): void; live?: () => boolean;
  brought?: Map<string, string>; own?: Map<string, File>; by: "lex" | "agent"; siteUrl?: string;
}
export interface OutsidePicturesResult {
  brought: { key: string; path: string }[];
  /** "for-lex": an agent run left it for Lex (ticket 13), not a refusal by the website. */
  left: { key: string; address: string; reason: Reason | "for-lex"; note?: string }[];
  notes: string[];
}
interface Ready { picture: ImprovePicture; url: string; index?: number; path?: string }
// A sharing picture is brought in without copies, so page pictures with the same address never reuse it.
const broughtKey = (picture: ImprovePicture, url: string) => picture.kind === "sharing" ? url + "#sharing" : url;
const sharedReads = new WeakMap<Map<string, string>, Map<string, Promise<OutsidePictureRead>>>();
const sharedImages = new WeakMap<Map<string, string>, Map<string, MediaImage>>();
export async function bringInOutsidePictures(input: BringInOutsidePicturesInput): Promise<OutsidePicturesResult> {
  const result: OutsidePicturesResult = { brought: [], left: [], notes: [] };
  const pictures = (input.pictures ?? input.row?.pictures ?? []).filter(p => p.ticked && p.changes.includes("bring-in"));
  if (!outsidePicturesAllowed(input.by)) {
    result.left = pictures.map(p => ({ key: p.key, address: p.address, reason: "for-lex", note: "Only Lex can bring in pictures from other websites." }));
    return result;
  }
  const live = () => { check(input); if (input.live?.() === false) throw new DOMException("Picture adding cancelled.", "AbortError"); };
  live();
  const blocked = outsideSources(input.source), requests: MediaImportRequest[] = [], ready: Ready[] = [];
  const pending = new Map<string, number>(), brought = input.brought ?? new Map<string, string>();
  const images = sharedImages.get(brought) ?? new Map<string, MediaImage>(); sharedImages.set(brought, images);
  const cache = input.cache ?? sharedReads.get(brought) ?? new Map<string, Promise<OutsidePictureRead>>();
  sharedReads.set(brought, cache);
  const deps: OutsidePictureReadDeps = { ...input, cache, assertLive: live };
  const existingPaths = [...input.paths];
  const adding = mediaAddingSettings(input.records.adding);
  for (const picture of pictures) {
    if (blocked.has(picture.tag.start) || picture.kind === "svg") {
      result.left.push({ key: picture.key, address: picture.address, reason: "failed", note: "This picture's outside sources stay as they are." }); continue;
    }
    let url: string;
    try { url = normaliseOutsidePicture(picture.url ?? picture.address); }
    catch { result.left.push({ key: picture.key, address: picture.address, reason: "failed", note: "Use an https picture address." }); continue; }
    const own = input.own?.get(picture.key);
    if (!own && brought.has(broughtKey(picture, url))) { ready.push({ picture, url, path: brought.get(broughtKey(picture, url)) }); continue; }
    // Sharing pictures have no responsive copies, so they need their own preparation.
    const identity = own ? picture.key + ":own" : url + (picture.kind === "sharing" ? ":sharing" : "");
    if (pending.has(identity)) { ready.push({ picture, url, index: pending.get(identity) }); continue; }
    try {
      const read = own ? { status: "read" as const, file: own } : await readOutsidePicture(url, deps);
      live();
      if (read.status !== "read") { result.left.push({ key: picture.key, address: picture.address, reason: read.status, ...read.note ? { note: read.note } : {} }); continue; }
      // Sharing pictures use the same recipe without making responsive outputs.
      const encode: typeof optimiseMedia | undefined = picture.kind === "sharing"
        ? (file, recipe, ...rest) => optimiseMedia(file, { ...recipe, responsive: false }, ...rest) : undefined;
      const prepared = await (input.prepare ?? prepareMediaFile)(read.file, picture.key, "media/images", input.signal, encode, undefined, undefined, adding.image, adding.keepOriginal,
        // This step keeps GIF bytes; converting them belongs to the GIF slice.
        undefined, async file => {
          const bytes = new Uint8Array(await file.slice(0, 10).arrayBuffer());
          live();
          return { outputs: [{ blob: file, extension: "gif", width: bytes[6] | bytes[7] << 8, height: bytes[8] | bytes[9] << 8 }], before: file.size, after: file.size };
        });
      live();
      if (picture.kind === "sharing" && prepared.request.result) prepared.request.result = { ...prepared.request.result, outputs: prepared.request.result.outputs.filter(output => !output.variantWidth) };
      pending.set(identity, requests.length); ready.push({ picture, url, index: requests.length }); requests.push(prepared.request);
      if (prepared.warning) result.notes.push(prepared.warning);
    } catch (error) {
      live();
      result.left.push({ key: picture.key, address: picture.address, reason: "failed", note: error instanceof Error ? error.message : "This picture could not be added." });
    }
  }
  if (!ready.length) return result;
  live();
  const file = input.row?.file ?? input.file;
  if (!file) throw new Error("Choose a page or component file.");
  let replacements: OutsidePictureReplacement[] = [];
  const paths = await input.workspace.import(requests, {
    path: file, source: input.source, label: "Bring in outside pictures", expectedPaths: existingPaths,
    stale: "This file changed while pictures were being added. Nothing was added.",
    live: () => { try { live(); return true; } catch { return false; } },
    apply(paths, requests) {
      live();
      replacements = ready.map(item => {
        const path = item.path ?? paths[item.index!], request = item.index === undefined ? undefined : requests[item.index];
        const output = request?.result?.outputs[0];
        const family = request?.result?.outputs.flatMap(copy => copy.variantWidth ? [mediaCopyName(path, copy.variantWidth)] : []) ?? [];
        const image = (item.index === undefined ? images.get(path) : undefined) ?? mediaImageForPlacement(path, output ?? {}, [path, ...family, ...existingPaths]);
        return { picture: item.picture, image };
      });
      return rewriteOutsidePictures(input.source, replacements, input.siteUrl);
    },
  });
  input.assertLive();
  // A committed import is authoritative: update the cross-row map only after it succeeds.
  for (const [index, item] of ready.entries()) {
    const path = item.path ?? paths[item.index!];
    brought.set(broughtKey(item.picture, item.url), path);
    if (replacements[index]) images.set(path, replacements[index].image);
    result.brought.push({ key: item.picture.key, path });
  }
  return result;
}
