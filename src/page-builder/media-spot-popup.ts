// The Media popup (media build slice 119): what the edit bar's Media button opens on a video, audio,
// a download or an Online video, in the media popup frame the Image popup uses (slice 109). It is
// shaped by what the spot holds:
// - video (a picture spot's looping video too): the video to pause at a moment, Still picture (Use
//   this moment / Choose…), Loop silently, Subtitles and Title; Replace under the video;
// - audio and downloads: the file, its Title and Replace;
// - Online video: its still, Vimeo's own bar (Vimeo only) and Replace.
// Each change applies at once as one Undo step (the still and subtitles everywhere the file is used,
// as File details does); Done closes. Replace closes the popup and opens the Media picker: a picture
// spot takes a picture or a video, any other spot any media; Use puts it in the spot's place.
import "./image-popup.css";
import "./media-spot-popup.css";
import { node } from "../ui/dom";
import fileIcon from "@phosphor-icons/core/regular/file-text.svg?raw";
import imageIcon from "@phosphor-icons/core/regular/image-square.svg?raw";
import { NATIVE_CONFIG_PATH, nativeSitePrefix } from "../../shared/native-project";
import { startTags, type ElementRange } from "../../shared/html-source";
import { MEDIA_RECORDS_PATH, parseMediaRecords, type MediaRecords } from "../../shared/media-records";
import { parseOnlineVideoAddress } from "../../shared/online-video-address";
import type { MediaControllerPorts, MediaModule } from "../controllers/media-controller";
import { locateNativeElementRange } from "../native-source-location";
import type { ImagePopupHost } from "./image-popup";
import type { MediaWorkspaceContext } from "./media-workspace";
import { actionButton, mountMediaPopupFrame, popupRow } from "./media-popup-frame";
import { inPictureSpot, mediaSpotAddress, mediaSpotFile, mediaSpotKind, mediaSpotTitle, mediaSpotTitleEdit, type MediaSpotKind } from "./media-spot-rules";
import { PICTURE_SPOT_MESSAGE, readLooping } from "./looping-video";
import { mediaResolvePath } from "./media-references";
import { decodeHtmlEntities } from "./html-entities";
import { mediaAttribute } from "./media-attributes";

export interface MediaSpotPopupOptions {
  ports: MediaControllerPorts;
  host: ImagePopupHost;
  workspaceContext: (include?: (path: string) => boolean) => Promise<MediaWorkspaceContext>;
  load: () => Promise<MediaModule>;
  target: { path: string; node: number[] };
  /** A picture spot's picker: a picture or a video takes the spot's place (the edit bar's, slices 64 and 119). */
  chooseImage(target: { path: string; node: number[] }): Promise<void>;
  /** The press that opened it still owns the popup (no later press or repository change). */
  live(): boolean;
  closed(): void;
}

const TITLES: Record<MediaSpotKind, string> = { video: "Video", audio: "Audio", download: "Download", "online-video": "Online video" };
const basename = (path: string) => path.split("/").pop() ?? path;
const svg = (raw: string, size = 14) => {
  const template = document.createElement("template");
  template.innerHTML = raw.replace("<svg ", `<svg class="icon" width="${size}" height="${size}" aria-hidden="true" focusable="false" `);
  return template.content.firstElementChild as SVGSVGElement;
};
const link = (label: string, action: () => void, name?: string) => {
  const item = actionButton("image-popup__link", action);
  item.textContent = label;
  if (name) item.setAttribute("aria-label", name);
  return item;
};

export async function openMediaSpotPopup(options: MediaSpotPopupOptions) {
  const { ports, host, target } = options;
  const locate = (ports.locateElement as typeof locateNativeElementRange | undefined) ?? locateNativeElementRange;
  const stamp = ports.stamp(), epoch = ports.generation();
  const prefix = () => nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH));
  /** The spot as the page has it now. */
  const read = () => {
    const source = ports.source(target.path);
    const range = source === undefined ? undefined : locate(source, target.node) as ElementRange | undefined;
    const kind = source !== undefined && range ? mediaSpotKind(source, range) : undefined;
    return source !== undefined && range && kind ? { source, range, kind } : undefined;
  };
  const first = read();
  if (!first || ports.viewingVersion()) return undefined;
  const { kind } = first, noun = TITLES[kind].toLowerCase();
  const address = mediaSpotAddress(first.source, first.range) ?? "";
  const file = kind === "online-video" ? undefined : mediaSpotFile(first.source, first.range, target.path, prefix());
  const online = kind === "online-video" ? parseOnlineVideoAddress(address) : undefined;
  const spot = inPictureSpot(first.source, first.range);
  let closed = false, busy = false;
  const urls: string[] = [];

  /** The spot as the popup opened on it (same kind and file), or a refusal. */
  const now = () => {
    const at = read();
    if (closed || !options.live() || !stamp.holds() || ports.viewingVersion() || !at || at.kind !== kind || mediaSpotAddress(at.source, at.range) !== address)
      throw new Error(`This ${noun} changed. Select it again.`);
    return at;
  };
  const records = (): MediaRecords | undefined => { try { return parseMediaRecords(ports.source(MEDIA_RECORDS_PATH)); } catch { return undefined; } };
  /** The Media host's file changes (still, subtitles, Vimeo's bar): each one Undo step, everywhere. */
  const workspace = async () => {
    const { createMediaWorkspace } = await import("./media-workspace");
    const media = createMediaWorkspace(() => options.workspaceContext());
    await media.load();
    return media;
  };

  const frame = mountMediaPopupFrame(host, {
    title: TITLES[kind], opener: ".edit-bar__media", className: "media-spot-popup", closeLabel: "Close",
    cancel: () => close(),
  });
  const { root, where, rows, message, foot } = frame;
  where.textContent = file ? basename(file) : online ? (online.service === "youtube" ? "YouTube" : "Vimeo") : address;
  where.title = file ?? address;
  const say = (text: string) => { message.className = "image-popup__message"; message.textContent = text; };
  /** One change at a time; its result (or why it could not be made) on the message line. */
  const run = (work: () => Promise<string | void>) => {
    if (busy || closed) return;
    busy = true; root.setAttribute("aria-busy", "true");
    void work().then(said => { if (said) say(said); }, (error: unknown) => say(error instanceof Error ? error.message : String(error)))
      .finally(() => { busy = false; root.removeAttribute("aria-busy"); if (!closed) void draw(); });
  };

  // The file itself: a video to pause at a moment (also the source of Use this moment), an audio
  // player, a download's name, an Online video's still. Made once, so playing survives a redraw.
  const player = kind === "video" ? node("video", "media-spot__player") : kind === "audio" ? node("audio", "media-spot__audio") : undefined;
  if (player) { player.controls = true; player.muted = kind === "video"; player.preload = "metadata"; player.setAttribute("playsinline", ""); }
  const still = node("img", "media-spot__still"); still.alt = ""; still.hidden = true;
  const well = node("div", "image-popup__well media-spot__well");
  if (player) well.append(player);
  if (kind === "online-video") well.append(still);
  if (kind === "download") well.append(svg(fileIcon, 32), node("span", "media-spot__name", file ? basename(file) : address));
  void (async () => {
    if (!file || !player) return;
    try {
      const ctx = await options.workspaceContext();
      const url = URL.createObjectURL(await ctx.blob(file));
      if (closed) { URL.revokeObjectURL(url); return; }
      urls.push(url); player.src = url;
    } catch { /* A file not in the site plays nothing here; the rest still works. */ }
  })();
  const replaceButton = actionButton("image-popup__link", () => void replace());
  replaceButton.append(svg(imageIcon), "Replace");
  replaceButton.title = spot ? "Choose a picture or another video for this spot" : `Choose other media for this place`;
  const hint = node("p", "image-popup__hint", kind === "video" ? spot ? "Loops silently in this picture spot." : "Pause at a moment for its still picture." : "");
  const under = node("div", "image-popup__under"); under.append(hint, replaceButton);
  const fileCell = node("div"); fileCell.append(well, under);
  const fileRow = popupRow(TITLES[kind] === "Online video" ? "Video" : kind === "download" ? "File" : TITLES[kind], fileCell, "image-popup__row--picture");

  // Still picture: a thumbnail, then Use this moment (the paused frame) or Choose… (a picture in Media).
  const thumb = node("img", "media-spot__thumb"); thumb.alt = ""; thumb.hidden = true;
  const moment = link("Use this moment", () => run(async () => {
    now();
    if (!(player instanceof HTMLVideoElement) || !file || player.readyState < 2) throw new Error("Wait for the video to load, then pause at a moment.");
    const { momentPicture } = await import("./video-moment");
    const blob = await momentPicture(player);
    now();
    await (await workspace()).still(file, { blob });
    return "Still picture changed everywhere the video is used.";
  }));
  const chooseStill = link("Choose…", () => run(async () => {
    now();
    if (!file) return;
    const { openMediaPicker } = await options.load();
    await openMediaPicker({ accept: "image/*", place: `${basename(file)} · Still picture`, report: ports,
      onPick: async (image, cancelled, held) => {
        let chosen = image.path;
        // A picture added inside the picker is saved first, then becomes the still.
        if (held) { const saved = await held.save(); chosen = held.image(saved.paths).path; }
        if (cancelled() || closed) return;
        now();
        await (await workspace()).still(file, { path: chosen });
        say("Still picture changed everywhere the video is used.");
        void draw();
      } });
  }), "Choose still picture");
  const stillLine = node("div", "media-spot__line"); stillLine.append(thumb, moment, chooseStill);

  // Loop silently: the place's Looping video (a picture spot's always loops).
  const loop = node("input", "media-spot__switch"); loop.type = "checkbox"; loop.setAttribute("role", "switch");
  loop.setAttribute("aria-label", "Loop silently");
  loop.addEventListener("change", () => run(async () => {
    const at = now(), on = loop.checked;
    const { createVideoPlaces } = await import("./media-video-place");
    await createVideoPlaces(ports, options.workspaceContext, options.load).toggleLooping(target.path, target.node, at.source, on);
    return on ? "Loops silently, over and over." : "Plays with sound when pressed.";
  }));
  const loopNote = node("span", "media-spot__note");
  const loopLine = node("label", "media-spot__line"); loopLine.append(loop, loopNote);

  // Subtitles: the file's own, everywhere it is used (File details' rule, slice 66).
  const chooser = node("input"); chooser.type = "file"; chooser.accept = ".vtt,.srt"; chooser.hidden = true;
  chooser.addEventListener("change", () => {
    const picked = chooser.files?.[0]; chooser.value = "";
    if (picked && file) run(async () => {
      const text = await picked.text();
      now();
      await (await workspace()).subtitles(file, { name: picked.name, text });
      return "Subtitles added: visitors get a CC button.";
    });
  });
  const subtitlesLine = node("div", "media-spot__line");

  // Title: the name a player is heard by, a download card's name.
  const title = node("input", "media-spot__field"); title.type = "text";
  title.placeholder = kind === "download" ? "The file's name on the page" : kind === "video" ? "What the video shows" : "What it is";
  title.setAttribute("aria-label", "Title");
  title.addEventListener("change", () => run(async () => {
    const at = now(), edit = mediaSpotTitleEdit(at.source, at.range, kind, title.value);
    if (!edit) return;
    if (!ports.change(target.path, at.source, [edit], target.node, "Title changed")) throw new Error("The title could not be changed. Select it again.");
    return "Title changed.";
  }));
  title.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); title.blur(); } });

  // Vimeo's own bar: every placed copy of this Online video (slice 68's switch).
  const serviceBar = node("input", "media-spot__switch"); serviceBar.type = "checkbox"; serviceBar.setAttribute("role", "switch");
  serviceBar.setAttribute("aria-label", "Show Vimeo's own bar");
  serviceBar.addEventListener("change", () => run(async () => {
    now();
    if (!online) return;
    await (await workspace()).onlineVideoServiceBar(online, serviceBar.checked);
    return serviceBar.checked ? "Vimeo's own bar shows on every page with this video." : "The site's own bar shows on every page with this video.";
  }));
  const serviceLine = node("label", "media-spot__line"); serviceLine.append(serviceBar, node("span", "media-spot__note", "Instead of the site's bar"));

  const done = actionButton("image-popup__button image-popup__button--primary", () => close());
  done.textContent = "Done";
  foot.append(done);
  say("");

  const picture = async (path: string | undefined, into: HTMLImageElement) => {
    const url = path ? await host.picture(path).catch(() => undefined) : undefined;
    if (closed) return;
    if (url) into.src = url;
    into.hidden = !url;
  };
  /** The rows from the page and records as they are now. */
  async function draw() {
    const at = read();
    if (!at || closed) return;
    const tag = at.source.slice(at.range.tag.start, at.range.tag.end), facts = records();
    const list: HTMLElement[] = [fileRow];
    if (kind === "video" && file) {
      const poster = mediaAttribute(tag, startTags(tag)[0], "poster")?.value;
      const posterPath = poster ? mediaResolvePath(decodeHtmlEntities(poster, true), target.path, undefined, prefix()) : undefined;
      void picture(posterPath, thumb);
      list.push(popupRow("Still picture", stillLine));
      loop.checked = readLooping(tag);
      loop.disabled = spot;
      loopNote.textContent = spot ? PICTURE_SPOT_MESSAGE : "Plays by itself, without sound";
      list.push(popupRow("Loop silently", loopLine));
    }
    if (kind === "video" && file) {
      const ctx = await options.workspaceContext().catch(() => undefined);
      if (closed) return;
      const paths = ctx?.paths ?? [];
      const recorded = facts?.files[file]?.subtitles;
      const vtt = file.replace(/\.[^./]+$/, "") + ".vtt";
      const current = recorded && paths.includes(recorded) ? recorded : paths.includes(vtt) ? vtt : undefined;
      const add = link(current ? "Replace…" : "Add…", () => chooser.click(), current ? `Replace subtitles ${basename(current)}` : "Add subtitles");
      subtitlesLine.replaceChildren(node("span", current ? "media-spot__name" : "media-spot__note", current ? basename(current) : "None yet"), add, chooser);
      if (current) subtitlesLine.append(link("Remove", () => run(async () => {
        now();
        await (await workspace()).subtitles(file, null);
        return "Subtitles removed everywhere the video is used.";
      }), "Remove subtitles"));
      list.push(popupRow("Subtitles", subtitlesLine));
    }
    const words = mediaSpotTitle(at.source, at.range, kind);
    if (words !== undefined) {
      if (document.activeElement !== title) title.value = words;
      list.push(popupRow("Title", title));
    }
    if (online) {
      const record = facts?.onlineVideos?.find(video => video.service === online.service && video.id === online.id);
      // The still the page shows (Lex's own picture or the copied one), else the recorded one.
      const inner = at.source.slice(at.range.tag.end, at.range.close?.start ?? at.range.end), image = startTags(inner).find(item => item.name === "img");
      const src = image && mediaAttribute(inner, image, "src")?.value;
      void picture(src ? mediaResolvePath(decodeHtmlEntities(src, true), target.path, undefined, prefix()) : record?.still, still);
      if (online.service === "vimeo") {
        serviceBar.checked = Boolean(record?.serviceBar) || /\bdata-controls="service"/.test(tag);
        serviceBar.disabled = !record;
        list.push(popupRow("Vimeo's own bar", serviceLine));
      }
    }
    rows.replaceChildren(...list);
    frame.place();
  }

  async function replace() {
    if (busy || closed) return;
    let at: ReturnType<typeof now>;
    try { at = now(); } catch (error) { say((error as Error).message); return; }
    const { openMediaPicker } = await options.load();
    if (closed) return;
    // The spot changes: the popup closes, and the picker puts the chosen file in its place as one Undo step.
    close();
    const proof = { stamp, epoch, source: at.source };
    const place = `${ports.placeLabel?.(target.path) ?? target.path} · Replace ${noun}`;
    // A picture spot: the picker a picture spot always has (pictures, and videos that loop there).
    if (spot) { await options.chooseImage(target); return; }
    const insert = { path: target.path, parent: target.node.slice(0, -1), index: target.node.at(-1)!, replaces: true };
    await openMediaPicker({ place, report: ports,
      onPick: async (chosen, cancelled, held) => {
        const { placeChosenMedia } = await import("./media-insert");
        await placeChosenMedia(ports, options.workspaceContext, { kind: "insert", place: insert }, chosen, proof, cancelled, held);
      },
      onlineVideo: async (video, cancelled, picker) => {
        const { placeOnlineVideo } = await import("./online-video-place");
        await placeOnlineVideo(ports, options.workspaceContext, { place: insert }, video, picker, proof, cancelled);
      } }).catch((error: unknown) => ports.error(error));
  }

  function close() {
    if (closed) return;
    closed = true;
    player?.pause();
    for (const url of urls) URL.revokeObjectURL(url);
    frame.remove();
    options.closed();
  }

  await draw();
  if (!options.live()) { close(); return undefined; }
  frame.place();
  return { cancel: close };
}
