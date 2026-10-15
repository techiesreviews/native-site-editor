// File details' Still picture and Subtitles (media build slice 66, ticket 12): under a video's or
// audio file's player, beside the file's other actions. Each change applies at once, everywhere
// the file is used, as one Undo step. Loaded only when such a file's details open.
import { button, node } from "../ui/dom";
import { basename, mediaKind } from "./media-library-filter";
import type { DetailHost } from "./media-library-details";
import type { MediaMetadata } from "./media-metadata";

/** The current subtitles of `path`: the recorded file while it is in the site, else a `.vtt` beside it. */
export function currentSubtitles(path: string, meta: MediaMetadata, paths: string[]): string | undefined {
  if (meta.subtitles && paths.includes(meta.subtitles)) return meta.subtitles;
  const vtt = path.replace(/\.[^./]+$/, "") + ".vtt";
  return paths.includes(vtt) ? vtt : undefined;
}

/** A frame of the details player as the still's WebP, at the video's own size. */
async function momentPicture(video: HTMLVideoElement): Promise<Blob> {
  video.pause();
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    // Nothing drawn yet (only the length is loaded): load the frame at the current moment.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The video did not load. Play it, pause at the moment you want, then try again.")), 10_000);
      video.addEventListener("seeked", () => { clearTimeout(timer); resolve(); }, { once: true });
      video.currentTime = video.currentTime;
    });
  }
  if (!video.videoWidth || !video.videoHeight) throw new Error("The video did not load. Play it, pause at the moment you want, then try again.");
  const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  const { createMediaEncoder } = await import("./media-encoders");
  return createMediaEncoder()(canvas, "image/webp", 80);
}

function row(title: string, ...content: (HTMLElement | string)[]) {
  const part = node("div", "media-detail__part");
  part.append(node("h4", "", title), ...content);
  return part;
}

/** The parts for `path`: a video's Still picture, and Subtitles for video and audio. */
export function mediaDetailParts(h: DetailHost, path: string, meta: MediaMetadata, player: HTMLVideoElement | HTMLAudioElement | undefined,
  still: string | undefined, current: () => boolean): HTMLElement[] {
  const { adapter, task, tell, refresh, cache } = h, library = h.library(), video = mediaKind(path) === "video";
  const parts: HTMLElement[] = [];
  const done = async (message: string) => { if (!current()) return; await refresh(); tell(message); };
  if (video && adapter.still) {
    const picture = node("img", "media-detail__still"); picture.alt = ""; picture.hidden = true;
    if (still) void cache.get(still).then(bytes => { picture.src = bytes.url; picture.hidden = false; }, () => undefined);
    const moment = button("Use this moment", () => void task(async () => {
      if (!(player instanceof HTMLVideoElement)) return;
      const blob = await momentPicture(player);
      if (!current()) return;
      await adapter.still!(path, { blob });
      cache.drop(path.replace(/\.[^./]+$/, "") + ".webp");
      await done("Still picture changed everywhere the video is used.");
    }));
    const choose = button("Choose picture…", () => void task(async () => {
      const { openMediaPicker } = await import("./media-picker");
      if (!current()) return;
      await openMediaPicker({ adapter, accept: "image/*", place: `${basename(path)} · Still picture`, report: { announce: tell, error: error => tell(String(error)) },
        onPick: async (image, cancelled, held) => {
          let chosen = image.path;
          // A picture added inside the picker is saved first, then becomes the still.
          if (held) { const saved = await held.save(); chosen = held.image(saved.paths).path; }
          if (cancelled() || !h.alive()) return;
          await adapter.still!(path, { path: chosen });
          await done("Still picture changed everywhere the video is used.");
        } });
    }));
    const buttons = node("div", "media-detail__part-actions"); buttons.append(moment, choose);
    const line = node("div", "media-detail__part-row"); line.append(picture, buttons);
    parts.push(row("Still picture", line, node("p", "media-library__hint", "Shown before the video plays, everywhere it is used. Pause at a moment, or choose a picture.")));
  }
  if (adapter.subtitles) {
    const file = currentSubtitles(path, meta, library.items.map(item => item.path));
    const chooser = node("input"); chooser.type = "file"; chooser.accept = ".vtt,.srt"; chooser.hidden = true;
    chooser.addEventListener("change", () => {
      const picked = chooser.files?.[0]; chooser.value = "";
      if (picked) void task(async () => {
        const text = await picked.text();
        if (!current()) return;
        await adapter.subtitles!(path, { name: picked.name, text });
        if (file) cache.drop(file);
        await done(video ? "Subtitles added: the player shows a CC button." : "Subtitles added: the player shows a Transcript button.");
      });
    });
    const buttons = node("div", "media-detail__part-actions");
    const add = button(file ? "Replace…" : "Add subtitles…", () => chooser.click());
    add.setAttribute("aria-label", file ? `Replace subtitles ${basename(file)}` : "Add subtitles");
    buttons.append(add);
    if (file) buttons.append(button("Remove", () => void task(async () => {
      await adapter.subtitles!(path, null);
      await done("Subtitles removed everywhere the file is used.");
    })));
    const line = node("div", "media-detail__part-row");
    line.append(node("span", file ? "" : "media-library__muted", file ? basename(file) : "None yet"), buttons, chooser);
    const hint = node("p", "media-library__hint", video ? "A .vtt or .srt file. Visitors get a CC button." : "A .vtt or .srt file. Visitors get a Transcript button.");
    const part = row("Subtitles", line, hint);
    // Written by an agent (ticket 13) until OK in To check.
    if (file && meta.subtitlesByAgent && meta.subtitles === file) part.append(node("p", "media-library__by-agent", "By agent: press OK in To check, or replace them here."));
    parts.push(part);
  }
  return parts;
}
