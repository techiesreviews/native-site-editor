import { readMediaPrefix } from "./media-prefix";
import { sitePathPrefix } from "../../shared/site-path-prefix";
// On-demand only: never import from boot.
import { MEDIA_RECORDS_PATH, parseMediaRecords, serializeMediaRecords, type OnlineVideoRecord } from "../../shared/media-records";
import { improveImagesPlan } from "./improve-images";
import { isMediaTextFile } from "./media-mentions";
import { mediaAttribute, mediaEscape } from "./media-attributes";
import { decodeHtmlEntities } from "./html-entities";
import { descendants, parseSource } from "./source-tree";
import { gifLoopingVideo } from "./looping-video";
import { prepareMediaFile } from "./media-prepare";
import { prepareSocialCopy } from "./social-copy-prepare";
import { socialCopyPath, socialImageAddress } from "./social-image";
import { mediaAddingSettings } from "./media-settings";
import { chooseMediaPath, mediaCopyName, mediaStorageName } from "./media-storage";
import { mediaOriginalPath } from "./media-originals";
import { readOnlineVideo } from "./online-video-add";
import { onlineVideoMarkup, onlineVideoStillPlan, parseOnlineVideoAddress, upsertOnlineVideo } from "./online-video";
import { mediaPlayerPlan, writePlayerFiles, type MediaPlayerKind } from "./player-markup";
import { starterPlayerFiles } from "./starter-loader";
import { uploadProblem } from "../uploads";
import type { MediaImportRequest } from "./media-picker";
import type { MediaWorkspaceBatch, MediaWorkspaceContext } from "./media-workspace";

export const onlinePlayersAllowed = (by: "lex" | "agent") => by === "lex";
export interface ConvertedGif { video: string; still?: string; width?: number; height?: number }
export interface PreparedOnlineVideo extends OnlineVideoRecord { width?: number; height?: number }
export interface ImproveGifsPlayersRequest {
  row: string; files: Parameters<typeof improveImagesPlan>[0]["files"]; by: "lex" | "agent";
  fetch?: typeof fetch; siteUrl?: string;
  converted?: Map<string, ConvertedGif>; videos?: Map<string, PreparedOnlineVideo>;
  live?(): boolean; signal?: AbortSignal; progress?(state: string): void;
}
export interface ImproveGifsPlayersResult {
  label: string; changed: boolean;
  converted: { key: string; path: string }[];
  switched: { key: string; service: "youtube" | "vimeo"; id: string }[];
  left: { key: string; address: string; reason: "cannot-convert" | "failed" | "for-lex" | "no-video"; note?: string }[];
  notes: string[];
}
export interface ImproveGifsPlayersPorts {
  prepare?: typeof prepareMediaFile; social?: typeof prepareSocialCopy;
  read?: typeof readOnlineVideo; playerFiles?: typeof starterPlayerFiles;
}

const pending = new WeakMap<MediaWorkspaceBatch, { converted: Map<string, ConvertedGif>; videos: Map<string, PreparedOnlineVideo> }>();

/** Everything is prepared locally; only the caller's single guarded batch can write. */
export async function prepareImproveGifsAndPlayers(ctx: MediaWorkspaceContext, request: ImproveGifsPlayersRequest, ports: ImproveGifsPlayersPorts = {}) {
  const holds = () => !request.signal?.aborted && (request.live?.() ?? true);
  const guard = () => { ctx.assertLive(); if (!holds()) throw new DOMException("Improve images cancelled.", "AbortError"); };
  guard();
  const paths = [...ctx.paths];
  const batch: MediaWorkspaceBatch = { label: "", expectedPaths: paths, expectedSources: new Map(), expectedAssets: new Map(),
    edits: new Map(), moves: [], deletes: [], restores: [], uploads: [], live: holds };
  const prefix = await readMediaPrefix(ctx, batch.expectedSources); guard();
  const sources: Record<string, string | undefined> = {};
  for (const file of new Set([...paths.filter(isMediaTextFile), MEDIA_RECORDS_PATH])) {
    const text = await ctx.read(file); guard();
    if (paths.includes(file) && text === undefined) throw new Error(`Could not read ${file}; image usage is incomplete. Refresh and try again.`);
    if (batch.expectedSources.has(file) && batch.expectedSources.get(file) !== text) throw new Error(`${file} changed while preparing image changes. Try again.`);
    sources[file] = text; batch.expectedSources.set(file, text);
  }
  const converted = new Map<string, ConvertedGif>(), videos = new Map<string, PreparedOnlineVideo>();
  let records = parseMediaRecords(sources[MEDIA_RECORDS_PATH]);
  const files = Object.fromEntries(paths.map(path => [path, request.files[path] ?? {}]));
  const plan = improveImagesPlan({ sources, pages: ctx.pages, components: ctx.components, files, records,
    site: ctx.origins?.length ? { origins: ctx.origins } : undefined, prefix });
  const row = plan.rows.find(row => row.file === request.row);
  const result: ImproveGifsPlayersResult = { label: row?.label ?? request.row, changed: false, converted: [], switched: [], left: [], notes: [] };
  if (!row) return { batch, result };
  batch.label = `Improve images: ${row.label}`;
  const usable = row.pictures.filter(p => p.ticked && p.changes.some(c => ["loop", "first-frame", "player"].includes(c)));
  if (new Set(usable.map(p => p.tag.start)).size < usable.length) throw new Error("This component picture resolves to different files on its pages. Use a site-root address before improving it.");
  const source = sources[row.file]!, nodes = [...descendants(parseSource(source))];
  const edits: { start: number; end: number; text: string }[] = [];
  const reserved = new Set(paths);
  const failures = new Map<string, { reason: "cannot-convert" | "failed" | "no-video"; note: string }>();
  const kinds = new Set<MediaPlayerKind>(), adding = mediaAddingSettings(records.adding);
  const note = (text?: string) => { if (text && !result.notes.includes(text)) result.notes.push(text); };
  const bytes = async (path: string) => {
    guard();
    if (!batch.expectedAssets.has(path)) batch.expectedAssets.set(path, ctx.assetVersion(path));
    const blob = await ctx.blob(path); guard(); return blob;
  };
  const upload = (path: string, blob: Blob) => {
    const problem = uploadProblem({ name: path, size: blob.size }); if (problem) throw new Error(problem);
    reserved.add(path); batch.uploads.push({ path, blob });
  };
  const importPrepared = (input: MediaImportRequest) => {
    const outputs = input.result?.outputs ?? [{ blob: input.file, extension: input.file.name.split(".").at(-1)! }];
    const first = outputs[0];
    if (!first || first.variantWidth) throw new Error("No primary media file was encoded.");
    const path = chooseMediaPath({ folder: "media/videos", name: mediaStorageName(input.file.name, first.extension),
      copies: outputs.flatMap(o => o.variantWidth ? [o.variantWidth] : []), still: input.result?.still?.extension,
      original: input.original?.extension, paths: reserved });
    const pending = outputs.map(o => ({ path: o.variantWidth ? mediaCopyName(path, o.variantWidth) : path, blob: o.blob }));
    const still = input.result?.still ? path.replace(/\.[^./]+$/, ".webp") : undefined;
    if (input.result?.still) pending.push({ path: still!, blob: input.result.still.blob });
    if (input.original) pending.push({ path: mediaOriginalPath(path, input.original.extension), blob: input.original.blob });
    for (const item of pending) { const problem = uploadProblem({ name: item.path, size: item.blob.size }); if (problem) throw new Error(problem); }
    pending.forEach(item => upload(item.path, item.blob));
    return { path, still, width: first.width, height: first.height };
  };
  for (const picture of usable) {
    guard();
    if (picture.changes.includes("player") && !onlinePlayersAllowed(request.by)) {
      result.left.push({ key: picture.key, address: picture.address, reason: "for-lex", note: "Only Lex can switch YouTube and Vimeo players." }); continue;
    }
    const node = nodes.find(node => node.start === picture.tag.start);
    if (!node) throw new Error("The picture's source could not be located.");
    const attribute = (name: string) => { const a = mediaAttribute(source, node.tag, name); return a && decodeHtmlEntities(a.value, true); };
    const failureKey = (picture.changes.includes("player") ? "player:" : picture.changes.includes("loop") ? "loop:" : "social:") + picture.key;
    try {
      const failed = failures.get(failureKey); if (failed) { result.left.push({ key: picture.key, address: picture.address, ...failed }); continue; }
      if (picture.changes.includes("loop")) {
        const old = picture.path!;
        let video = converted.get(old) ?? request.converted?.get(old);
        if (video && !reserved.has(video.video)) video = undefined;
        if (!video) {
          const blob = await bytes(old);
          request.progress?.("Preparing…"); guard();
          const prepared = await (ports.prepare ?? prepareMediaFile)(new File([blob], old.split("/").at(-1)!, { type: "image/gif" }),
            "improve-gif", "media/videos", request.signal, undefined, undefined, undefined, adding.image, false, adding.video); guard();
          if (prepared.request.result?.outputs[0]?.extension !== "mp4") {
            // Nothing is added here, so the adding note ("was added as it is") does not apply.
            const failure = { reason: "cannot-convert" as const, note: /animated GIFs/.test(prepared.warning ?? "")
              ? "This browser cannot turn animated GIFs into videos, so this GIF stays as it is." : "This GIF has no animation, so it stays a picture." };
            failures.set(failureKey, failure); result.left.push({ key: picture.key, address: picture.address, ...failure }); continue;
          }
          const imported = importPrepared(prepared.request);
          video = { video: imported.path, still: imported.still, width: imported.width, height: imported.height };
          records.files[video.video] = { still: video.still, fromGif: true,
            ...prepared.request.result.duration && Number.isFinite(prepared.request.result.duration) && prepared.request.result.duration > 0 ? { duration: Math.round(prepared.request.result.duration * 100) / 100 } : {} };
          converted.set(old, video); note(prepared.warning);
        }
        const spot = node.parent?.name === "picture" ? node.parent : node;
        const written = gifLoopingVideo(source, { tag: spot.tag, start: spot.start, end: spot.end, close: spot.close },
          { path: video.video, still: video.still, width: video.width, height: video.height }, { linked: picture.link !== undefined }, sitePathPrefix(request.siteUrl));
        edits.push({ start: spot.start, end: spot.end, text: written.markup });
        result.converted.push({ key: picture.key, path: video.video }); kinds.add("looping-video");
      } else if (picture.changes.includes("first-frame") && row.kind === "page") {
        const old = picture.path!;
        let path = Object.entries(records.files).find(([path, record]) => record.sharing && record.trimmedFrom?.source === old && reserved.has(path))?.[0];
        if (!path) {
          const blob = await bytes(old);
          const encoded = await (ports.social ?? prepareSocialCopy)(blob, old.split("/").at(-1)!, undefined, request.signal); guard();
          const output = encoded.outputs[0];
          if (encoded.outputs.length !== 1 || !output || output.extension !== "jpg" || output.variantWidth || output.blob.type !== "image/jpeg" || encoded.original)
            throw new Error("A sharing copy must be one JPEG image.");
          if (!encoded.trim) throw new Error("The sharing image has no frame.");
          const trim = encoded.trim;
          path = socialCopyPath({ source: old, paths: reserved, records }); upload(path, output.blob);
          records.files[path] = { sharing: true, trimmedFrom: { source: old, trim } };
        }
        const content = mediaAttribute(source, node.tag, "content")!;
        const address = socialImageAddress(request.siteUrl, path); note(address.note);
        // Change only the attribute's value, keeping the tag's original whitespace and quotes.
        edits.push({ start: content.valueStart, end: content.valueEnd, text: mediaEscape(address.address).replace(/'/g, "&#39;") });
        result.converted.push({ key: picture.key, path });
      } else if (picture.changes.includes("player")) {
        const video = parseOnlineVideoAddress(picture.address.startsWith("//") ? "https:" + picture.address : picture.address)!;
        const key = `${video.service}:${video.id}`;
        let record = videos.get(key) ?? request.videos?.get(key);
        if (record?.still && !reserved.has(record.still)) record = undefined;
        if (!record) {
          const existing = onlineVideoStillPlan(records, video, reserved);
          if (!existing.copy) record = existing.record!;
          else {
            const read = await (ports.read ?? readOnlineVideo)(video, request.fetch ?? globalThis.fetch); guard();
            record = { ...existing.record, service: video.service, id: video.id, ...video.hash ? { hash: video.hash } : {},
              title: read.title, still: undefined, stillCopied: undefined };
            note(read.note);
            if (read.still) {
              const name = mediaStorageName(`${read.title?.replace(/[\\/]+/g, " ") || key}.${read.still.name.split(".").at(-1)}`);
              const prepared = await (ports.prepare ?? prepareMediaFile)(new File([read.still], name, { type: read.still.type }),
                "online-video", "media/videos", request.signal, undefined, undefined, undefined, adding.image, adding.keepOriginal); guard();
              const imported = importPrepared(prepared.request); record.still = imported.path; record.stillCopied = true;
              record.width = imported.width; record.height = imported.height;
              files[imported.path] = { width: imported.width, height: imported.height }; note(prepared.warning);
            }
          }
          videos.set(key, record);
        }
        const { width, height, ...stored } = record;
        records = upsertOnlineVideo(records, stored);
        // Slice 67's saved "Show Vimeo's own bar" choice follows every placement.
        const written = onlineVideoMarkup({ video, title: record.title || attribute("title"), serviceBar: record.serviceBar,
          still: record.still ? { path: record.still, width: width ?? files[record.still]?.width, height: height ?? files[record.still]?.height } : undefined }, sitePathPrefix(request.siteUrl));
        written.notes.forEach(note);
        let markup = written.markup;
        const classes = attribute("class");
        if (classes) markup = markup.replace('class="online-video"', `class="online-video ${mediaEscape(classes)}"`);
        const kept = ["id", "slot", "style"].map(name => mediaAttribute(source, node.tag, name)).filter(a => a !== undefined).map(a => source.slice(a.start, a.end)).join("");
        markup = markup.replace("<a ", "<a" + kept + " ");
        edits.push({ start: node.start, end: node.end, text: markup });
        result.switched.push({ key: picture.key, service: video.service, id: video.id }); kinds.add("online-video");
      }
    } catch (error) {
      guard();
      const message = error instanceof Error ? error.message : String(error);
      const failure = { reason: /YouTube has no video/.test(message) ? "no-video" as const : "failed" as const, note: message };
      failures.set(failureKey, failure); result.left.push({ key: picture.key, address: picture.address, ...failure });
    }
  }
  let rewritten = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) rewritten = rewritten.slice(0, edit.start) + edit.text + rewritten.slice(edit.end);
  if (rewritten !== source) batch.edits.set(row.file, rewritten);
  if (kinds.size) {
    const input = { prefix: sitePathPrefix(request.siteUrl), pages: row.pages, sources: Object.fromEntries(Object.entries(sources).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      exists: (path: string) => reserved.has(path), kinds: [...kinds] };
    input.sources[row.file] = rewritten;
    let player = mediaPlayerPlan(input);
    if (player?.creates.length) { const files = await (ports.playerFiles ?? starterPlayerFiles)(); guard(); player = mediaPlayerPlan({ ...input, files }); }
    for (const file of player?.creates ?? []) reserved.add(file.path);
    writePlayerFiles(batch, player?.creates);
    for (const [path, text] of player?.edits ?? []) batch.edits.set(path, text);
    player?.notes.forEach(note);
  }
  result.changed = batch.edits.size > 0;
  if (result.changed && serializeMediaRecords(records) !== sources[MEDIA_RECORDS_PATH]) batch.edits.set(MEDIA_RECORDS_PATH, serializeMediaRecords(records));
  guard();
  pending.set(batch, { converted, videos });
  return { batch, result };
}

export async function improveGifsAndPlayers(ctx: MediaWorkspaceContext, request: ImproveGifsPlayersRequest, ports: ImproveGifsPlayersPorts = {}) {
  const { batch, result } = await prepareImproveGifsAndPlayers(ctx, request, ports);
  if (result.changed) {
    ctx.assertLive();
    if (request.signal?.aborted || request.live?.() === false) throw new DOMException("Improve images cancelled.", "AbortError");
    await ctx.applyBatch(batch);
    for (const [key, value] of pending.get(batch)?.converted ?? []) request.converted?.set(key, value);
    for (const [key, value] of pending.get(batch)?.videos ?? []) request.videos?.set(key, value);
  }
  return result;
}
