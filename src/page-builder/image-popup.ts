// The image popup (media-manager ticket 09 "Entry point and popup", build slice 39), opened by
// the edit bar's Image button: the whole picture with the shape menu and the focus dot, Replace,
// small phone and computer previews, the one-line message and Done. The page shows each change
// at once (an `image-look` on the canvas), but nothing is written until Done, which is one Undo
// step; ✕ or Escape put everything back, a replacement included. Zoom, Turn, Free trimming and
// the large editor come with trimmed copies (slices 41 and 42).
import type { MediaControllerPorts, MediaModule } from "../controllers/media-controller";
import type { MediaWorkspaceContext } from "./media-workspace";
import type { MediaBox, MediaImage } from "./media-markup";
import { mediaExistingAlt } from "./media-attributes";
import { locateNativeElementRange } from "../native-source-location";
import { framePlace, inlineStyle, readPlaceFrame, writePlaceFrame, type PlaceFocus, type PlaceShape } from "./place-frame";
import { placeMediaImage } from "./media-place";
import { decodeHtmlEntities } from "./html-entities";
import { mediaResolvePath } from "./media-references";
import { startTags, startTagAttribute } from "../../shared/html-source";
import { MEDIA_RECORDS_PATH, parseMediaRecords } from "../../shared/media-records";
import { frameChange, replaceNotice, shapeRatio, type PopupRect, type PopupShape } from "./image-popup-rules";
import { mountImagePopupView, type ImagePopupState } from "./image-popup-view";

/** What the editor lends the popup: where it stands, and the page's live look. */
export interface ImagePopupHost {
  /** The selected image's box in the window, while the edit bar shows it. */
  image(): PopupRect | undefined;
  /** The edit bar (the popup stands level with it and follows it). */
  bar(): HTMLElement | null;
  /** The preview frame's box in the window. */
  frame(): PopupRect | undefined;
  /** Shows the popup's shape, focus or picture on the page before Done; no look puts the image back. */
  look(target: { path: string; node: number[] }, look?: { style?: string; src?: string }): void;
  /** Scrolls the page in the preview (a phone's sheet keeps the picture above it). */
  scroll(dy: number): void;
  /** A picture's bytes as an address the editor can show, also handed to the canvas. */
  picture(path: string): Promise<string | undefined>;
}

export interface ImagePopupOptions {
  ports: MediaControllerPorts;
  host: ImagePopupHost;
  workspaceContext: () => Promise<MediaWorkspaceContext>;
  load: () => Promise<MediaModule>;
  target: { path: string; node: number[] };
  /** The press that opened it still owns the popup (no later press, repository or page change). */
  live(): boolean;
  closed(): void;
}

export async function openImagePopup(options: ImagePopupOptions) {
  const { ports, host, target } = options;
  const stamp = ports.stamp(), epoch = ports.generation(), source = ports.source(target.path);
  const range = source === undefined ? undefined : (ports.locateElement ?? locateNativeElementRange)(source, target.node);
  if (source === undefined || !range || range.tag.name !== "img" || ports.viewingVersion()) return undefined;
  const expected = source.slice(range.tag.start, range.tag.end);
  let records;
  try { records = parseMediaRecords(ports.source(MEDIA_RECORDS_PATH)); } catch { /* Read without the trim. */ }
  const read = readPlaceFrame(expected, records, target.path);
  const tag = startTags(expected)[0], src = tag && startTagAttribute(expected, tag, "src");
  const file = src ? mediaResolvePath(decodeHtmlEntities(src.value, true), target.path) ?? decodeHtmlEntities(src.value, true) : "";
  const start = { shape: read.shape as PopupShape, focus: read.focus };
  const state: ImagePopupState = {
    file, url: file ? await host.picture(file).catch(() => undefined) : undefined,
    shape: start.shape, focus: read.focus ? { ...read.focus } : { x: 50, y: 50 }, boxes: undefined, busy: false,
  };
  if (!stamp.holds() || ports.source(target.path) !== source || !options.live()) return undefined;
  let replacement: MediaImage | undefined;
  let closed = false;

  // The page shows the popup's look; a change of shape (or picture) is measured again for the previews.
  const look = () => {
    const change = frameChange(start, state, Boolean(replacement));
    const styled = change ? writePlaceFrame(expected, change) : expected;
    host.look(target, { style: inlineStyle(styled), ...(replacement ? { src: replacement.path } : {}) });
  };
  let measuring = 0;
  const measure = async () => {
    const asked = ++measuring, change = frameChange(start, state, Boolean(replacement));
    const style = change?.shape !== undefined ? inlineStyle(writePlaceFrame(expected, change)) : undefined;
    const image = replacement ?? {};
    // A shape's box until the measurement answers: the same widths, the shape's height.
    const ratio = shapeRatio(state.shape);
    if (ratio && state.boxes) { state.boxes = state.boxes.map(box => ({ ...box, height: box.width / ratio, fit: "cover" })); view.draw(); }
    let boxes: MediaBox[] | undefined;
    try { boxes = (await (style === undefined && !replacement ? ports.measureImage?.(target.path, target.node, image) : ports.measureImage?.(target.path, target.node, image, undefined, style)))?.boxes; }
    catch { /* The previews keep their estimate. */ }
    if (asked !== measuring || closed || !boxes?.length) return;
    state.boxes = boxes;
    view.draw();
  };

  function close() {
    if (closed) return;
    closed = true;
    // Done leaves the look until the page draws the change; then the image's own attributes are right.
    host.look(target);
    view.remove();
    options.closed();
  }
  // ✕, Escape or a press elsewhere; once Done is writing, it finishes (the window shows it busy).
  const cancel = () => { if (!state.busy) close(); };
  async function done() {
    if (state.busy) return;
    const change = frameChange(start, state, Boolean(replacement));
    if (!change && !replacement) { close(); return; }
    state.busy = true; view.draw();
    try {
      if (replacement) {
        await placeMediaImage(ports, options.workspaceContext, target, replacement,
          { stamp, epoch, source: source!, expected, initialAlt: mediaExistingAlt(expected) }, () => false, undefined, change);
      } else if (change) {
        await framePlace(ports, target, change, { stamp, epoch, source: source!, expected });
        ports.announce(change.shape !== undefined ? "Image shape changed" : "Focus point moved");
      }
      close();
    } catch (error) {
      state.busy = false;
      close();
      ports.error(error);
    }
  }
  async function replace() {
    const { openMediaPicker } = await options.load();
    if (closed) return;
    const words = mediaExistingAlt(expected)?.trim();
    await openMediaPicker({ accept: "image/*", report: ports, place: `${ports.placeLabel?.(target.path) ?? target.path} · ${words || "Image"}`,
      onPick: async (image, cancelled, held) => {
        // Files added in the picker are kept in Media now; the place changes only on Done.
        let picked = image;
        if (held) { const saved = await held.save(); picked = held.image(saved.paths); }
        if (cancelled() || closed) return;
        const url = await host.picture(picked.path).catch(() => undefined);
        if (closed) return;
        replacement = picked;
        state.file = picked.path; state.url = url;
        state.focus = { x: 50, y: 50 };
        state.notice = replaceNotice(picked.path, state.shape, read.trimmed);
        view.draw(true);
        look();
        void measure();
      } }).catch((error: unknown) => ports.error(error));
  }

  const view = mountImagePopupView(state, host, {
    shape: (shape: PlaceShape) => { state.shape = shape; view.draw(); look(); void measure(); },
    focus: (focus: PlaceFocus) => { state.focus = focus; view.draw(); look(); },
    replace: () => { void replace(); },
    done: () => { void done(); },
    cancel,
  });
  look();
  void measure();
  return { cancel };
}
