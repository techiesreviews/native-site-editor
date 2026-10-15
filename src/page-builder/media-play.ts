// The edit bar's Play (lazy, media slice 65): on the canvas everything stays
// still so a click selects it; Play checks a selected video, audio or Online
// video, and Stop (or the end, or the selection moving on) returns it to its
// still. The canvas is a sandboxed frame with an opaque origin, so a site
// video's bytes are posted to it as a Blob and play there from a blob: address
// (the editor's `media-src 'self' blob:`, slice 56). YouTube and Vimeo refuse
// to play inside that sandbox, so an Online video's own player is laid over
// its place on the canvas, in the editor, and follows it.
import type { ElementRange } from "../../shared/html-source";
import { startTags } from "../../shared/html-source";
import { mediaAttribute } from "./media-attributes";
import { decodeHtmlEntities } from "./html-entities";
import { mediaResolvePath } from "./media-references";
import type { MediaSite } from "./media-origins";
import { onlinePlayerAddress, parseOnlineVideoAddress } from "./online-video";

export type Playable =
  | { kind: "file"; path: string; type: string }
  | { kind: "online"; address: string }
  | { kind: "none"; reason: string };

const MEDIA_TYPES: Record<string, string> = {
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", oga: "audio/ogg", ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", flac: "audio/flac",
};
const value = (source: string, tag: ElementRange["tag"], name: string) => {
  const found = mediaAttribute(source, tag, name);
  return found ? decodeHtmlEntities(found.value, true).trim() : undefined;
};
/** What the element at `range` of page `file` plays: a site file, an Online video's player, or why nothing. */
export function playable(source: string, range: ElementRange, file: string, site?: MediaSite): Playable {
  const name = range.tag.name;
  if (name === "a") {
    const href = value(source, range.tag, "href");
    const video = href ? parseOnlineVideoAddress(href) : undefined;
    return video ? { kind: "online", address: onlinePlayerAddress(video) } : { kind: "none", reason: "This link is not a YouTube or Vimeo video." };
  }
  if (name !== "video" && name !== "audio") return { kind: "none", reason: "Choose a video or audio." };
  // The element's own address, else its first <source> with one (as a browser picks without a type check).
  let src = value(source, range.tag, "src");
  if (!src) {
    const inner = source.slice(range.tag.end, range.close?.start ?? range.tag.end);
    for (const tag of startTags(inner)) if (tag.name === "source" && (src = value(inner, tag, "src"))) break;
  }
  if (!src) return { kind: "none", reason: `This ${name} has no file to play.` };
  // A full address counts only when it is one of the site's known addresses.
  const path = mediaResolvePath(src, file, site?.origins.length ? site : undefined, site?.prefix ?? "");
  if (!path) return { kind: "none", reason: `This ${name} is not one of the site's files, so it cannot play here.` };
  const type = MEDIA_TYPES[/\.([a-z\d]+)$/i.exec(path)?.[1].toLowerCase() ?? ""] ?? (name === "audio" ? "audio/mpeg" : "video/mp4");
  return { kind: "file", path, type };
}

export interface MediaPlayHost {
  /** Plays `blob` on the canvas in the element at `request`, or stops (`request` null). */
  send(id: number, request: { path: string; node: number[] } | null, blob?: Blob): void;
  /** The selected element's box in the editor's viewport. */
  box(): { top: number; left: number; bottom: number; right: number } | undefined;
  /** The canvas frame's box in the editor's viewport. */
  frame(): DOMRect | undefined;
  /** Calls `listener` with the selection now and whenever it changes; returns the unsubscribe. */
  watch(listener: (at: { path?: string; node?: number[] } | undefined) => void): () => void;
}
export interface MediaPlayPorts {
  host: MediaPlayHost;
  locate(source: string, node: number[]): ElementRange | undefined;
  site?(): MediaSite | undefined;
  /** The page's source now. */
  source(path: string): string | undefined;
  /** A file's bytes (drafts first, then the branch). */
  blob(path: string): Promise<Blob>;
  /** Draws the edit bar again, so Play reads Stop and back. */
  refresh(): void;
}

export function createMediaPlay(ports: MediaPlayPorts) {
  let current: { path: string; node: string; id: number; unwatch(): void; layer?: HTMLElement; follow?: number } | undefined;
  let ids = 0;
  const playing = (path: string, node: number[]) => current?.path === path && current.node === node.join();
  function stop(tell = true) {
    const was = current;
    if (!was) return;
    current = undefined;
    was.unwatch();
    if (was.follow) cancelAnimationFrame(was.follow);
    if (was.layer) was.layer.remove(); else ports.host.send(was.id, null);
    if (tell) ports.refresh();
  }
  async function toggle(path: string, node: number[], source: string) {
    if (playing(path, node)) { stop(); return; }
    stop(false);
    const range = ports.locate(source, node);
    // The element the bar was drawn for, still at its place in the page now: checked again after every
    // wait, and while it plays (a removed element's sibling may take its place, or its address change).
    const tag = range && source.slice(range.tag.start, range.tag.end);
    let seen: string | undefined, still = false;
    const same = () => {
      const now = ports.source(path);
      if (now !== seen) {
        seen = now;
        const at = now === undefined ? undefined : ports.locate(now, node);
        still = Boolean(tag && at && now!.slice(at.tag.start, at.tag.end) === tag);
      }
      return still;
    };
    if (!same()) { ports.refresh(); return; }
    const what: Playable = range ? playable(source, range, path, ports.site?.()) : { kind: "none", reason: "Choose a video or audio." };
    if (what.kind === "none") { ports.refresh(); throw new Error(what.reason); }
    const id = ++ids;
    const at = { path, node: node.join(), id, unwatch: () => {} };
    current = at;
    // Playback belongs to the selection: choosing something else stops it.
    at.unwatch = ports.host.watch(selected => {
      if (current === at && (selected?.path !== path || selected.node?.join() !== at.node || !same())) stop();
    });
    ports.refresh();
    if (current !== at) return;
    if (what.kind === "online") { overlay(at, what.address, same); return; }
    try {
      const bytes = await ports.blob(what.path);
      if (current === at && !same()) stop();
      if (current === at) ports.host.send(id, { path, node }, bytes.type === what.type ? bytes : new Blob([bytes], { type: what.type }));
    } catch (error) {
      if (current === at) stop();
      throw error;
    }
  }
  /** The Online video's own player over its place, clipped to the canvas. */
  function overlay(at: NonNullable<typeof current>, address: string, same: () => boolean) {
    const layer = document.createElement("div");
    layer.className = "media-play-layer";
    // Under the edit bar (z-index 30), over the canvas.
    Object.assign(layer.style, { position: "fixed", zIndex: "29", overflow: "hidden", pointerEvents: "none" });
    const player = document.createElement("iframe");
    player.title = "Online video";
    player.src = address;
    player.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
    player.allowFullscreen = true;
    player.referrerPolicy = "strict-origin-when-cross-origin";
    Object.assign(player.style, { position: "absolute", border: "0", background: "#000", pointerEvents: "auto" });
    layer.append(player);
    document.body.append(layer);
    at.layer = layer;
    let last = "";
    const follow = () => {
      if (current !== at) return;
      if (!same()) { stop(); return; }
      const clip = ports.host.frame(), box = ports.host.box();
      const key = clip && box ? [clip.left, clip.top, clip.width, clip.height, box.left, box.top, box.right, box.bottom].join() : "";
      if (key !== last) {
        last = key;
        layer.hidden = !key;
        if (clip && box) {
          Object.assign(layer.style, { left: `${clip.left}px`, top: `${clip.top}px`, width: `${clip.width}px`, height: `${clip.height}px` });
          Object.assign(player.style, { left: `${box.left - clip.left}px`, top: `${box.top - clip.top}px`,
            width: `${Math.max(0, box.right - box.left)}px`, height: `${Math.max(0, box.bottom - box.top)}px` });
        }
      }
      at.follow = requestAnimationFrame(follow);
    };
    follow();
  }
  return {
    playing,
    toggle,
    stop,
    /** The canvas stopped play `id` (its end, an error, or the element redrawn). */
    ended(id: number) { if (current?.id === id && !current.layer) stop(); },
  };
}
export type MediaPlay = ReturnType<typeof createMediaPlay>;
