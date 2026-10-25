// The Social image popup (media build slice 44; ticket 09 "Components, sharing and backgrounds"):
// Settings' Image button opens the image popup fixed to the 1200 × 630 sharing shape. The focus
// square moves the sharing copy's frame, Zoom trims it closer, Replace chooses another still picture,
// and the preview is a link card. Done hands the picture and its frame back to the settings dialog,
// whose Apply makes the sharing copy (slice 36) under a fresh name; ✕ or Escape change nothing.
// Loaded when the button is first pressed.
import type { MediaTrim } from "../../shared/media-records";
import type { ImagePopupHost } from "./image-popup";
import type { PlaceFocus } from "./place-frame";
import { loadPicture, mountImagePopupView, trimmedPreview, type ImagePopupState } from "./image-popup-view";
import { uncut, zoomTo } from "./image-popup-trim";
import { gifIsAnimated, pngIsAnimated, webpIsAnimated } from "./media-image-bytes";
import { SOCIAL_MESSAGE, SOCIAL_SHAPE, SOCIAL_SHAPE_LABEL, socialReplaceNotice, socialRestore, socialTrim } from "./social-popup-rules";

export interface SocialFrame { file: string; trim: MediaTrim; preview?: string }
export interface SocialPopupOptions {
  /** The Image button: the popup stands under it, inside its dialog. */
  button: HTMLElement;
  /** The picture (a repository path) and the frame its sharing copy had. */
  file: string; trim?: MediaTrim;
  card: { title: string; site: string };
  picture(path: string): Promise<string | undefined>;
  /** Replace: the picker for still pictures; a repository path, or undefined on Cancel. */
  choose(): Promise<string | undefined>;
  done(frame: SocialFrame): void;
  closed(): void;
}

export const SOCIAL_ANIMATED = "Animated pictures cannot be framed for sharing. Choose a still picture.";

/** A still picture the sharing copy can be cut from (an animated one cannot be drawn into it). */
async function loadStill(options: SocialPopupOptions, path: string) {
  const picture = await loadPicture(options, path);
  if (!picture?.size || !picture.image) return undefined;
  const bytes = await pictureBytes(picture.url);
  return gifIsAnimated(bytes) || pngIsAnimated(bytes) || webpIsAnimated(bytes) ? "animated" as const : picture;
}

/** The bytes behind a picture's address: the editor's are data addresses, which the page's policy does not let it fetch. */
async function pictureBytes(url: string) {
  const data = /^data:[^,]*?(;base64)?,/i.exec(url);
  if (!data) return new Uint8Array(await (await fetch(url)).arrayBuffer());
  const body = url.slice(data[0].length);
  return data[1] ? Uint8Array.from(atob(body), char => char.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(body));
}

/** Opens the popup; undefined when the picture cannot be read (the caller opens the picker instead), `animated` for a moving picture. */
export async function openSocialImagePopup(options: SocialPopupOptions) {
  const picture = await loadStill(options, options.file).catch(() => undefined);
  if (picture === "animated") return picture;
  if (!picture?.size || !picture.image || !options.button.isConnected) return undefined;
  const state: ImagePopupState = { file: options.file, url: picture.url, image: picture.image, size: picture.size,
    trimmable: true, recrop: false, shape: SOCIAL_SHAPE, busy: false, ...socialRestore(options.trim, picture.size) };
  const key = () => JSON.stringify([state.file, state.focus.x, state.focus.y, state.cut.zoom]);
  const opened = key();
  const frameNow = () => socialTrim(state.size!, state.focus, state.cut.zoom);
  let closed = false, painting = 0;
  // The link card shows the frame as the copy will; drawn once a frame at most (a drag moves it often).
  const paint = () => { state.cutUrl = trimmedPreview(state.image!, frameNow(), 600); };
  const update = () => {
    view.draw();
    if (painting) return;
    painting = requestAnimationFrame(() => { painting = 0; if (closed) return; paint(); view.draw(); });
  };
  const dialog = options.button.closest("dialog");
  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(painting);
    dialog?.removeEventListener("close", close);
    view.remove();
    options.closed();
  }
  async function replace() {
    const path = await options.choose().catch(() => undefined);
    if (!path || closed) return;
    const loaded = await loadStill(options, path).catch(() => undefined);
    if (closed) return;
    if (loaded === "animated" || !loaded?.size || !loaded.image) {
      state.notice = loaded === "animated" ? SOCIAL_ANIMATED : `${path.split("/").pop()} could not be read. Choose another picture.`;
      view.draw(); return;
    }
    Object.assign(state, { file: path, url: loaded.url, image: loaded.image, size: loaded.size, cut: uncut(), focus: { x: 50, y: 50 }, notice: socialReplaceNotice(path) });
    view.draw(true);
    update();
  }
  const host: ImagePopupHost = { image: () => undefined, bar: () => null, frame: () => undefined, look() {}, scroll() {},
    picture: path => options.picture(path), button: () => options.button };
  const view = mountImagePopupView(state, host, {
    shape() {},
    focus: (focus: PlaceFocus) => { state.focus = focus; update(); },
    zoom: (percent: number) => { state.cut = zoomTo(state.shape, state.cut, percent); update(); },
    turn() {}, rect() {}, large() {},
    replace: () => { void replace(); },
    done() {
      // A sharing copy left as it opened changes nothing; else the dialog's Apply saves this frame.
      if (key() !== opened || !options.trim) options.done({ file: state.file, trim: frameNow(), preview: state.cutUrl });
      close();
    },
    cancel: close,
  }, { label: SOCIAL_SHAPE_LABEL, message: SOCIAL_MESSAGE, card: options.card });
  // Closing the settings dialog (Apply, Cancel) closes the popup unchanged.
  dialog?.addEventListener("close", close);
  paint();
  view.draw();
  return { cancel: close };
}
