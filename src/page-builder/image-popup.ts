// The image popup (media-manager ticket 09 "Entry point and popup", build slice 39), opened by
// the edit bar's Image button: the whole picture with the shape menu and the focus dot, Replace,
// small phone and computer previews, the one-line message and Done. The page shows each change
// at once (an `image-look` on the canvas), but nothing is written until Done, which is one Undo
// step; ✕ or Escape put everything back, a replacement included. Zoom, Turn and Free trimming
// (slice 41) save a Trimmed copy for this spot only; a trimmed spot re-opens on the full original
// with its trim put back. The large editor comes with slice 42.
import type { MediaControllerPorts, MediaModule } from "../controllers/media-controller";
import type { MediaWorkspaceContext } from "./media-workspace";
import type { MediaBox, MediaImage } from "./media-markup";
import { mediaExistingAlt } from "./media-attributes";
import { locateNativeElementRange } from "../native-source-location";
import { framePlace, inlineStyle, readPlaceFrame, writePlaceFrame, type PlaceFocus } from "./place-frame";
import { placeMediaImage } from "./media-place";
import { mediaImageForPlacement } from "./media-markup";
import { decodeHtmlEntities } from "./html-entities";
import { mediaResolvePath } from "./media-references";
import { startTags, startTagAttribute } from "../../shared/html-source";
import { MEDIA_RECORDS_PATH, parseMediaRecords, type MediaRecords } from "../../shared/media-records";
import { frameChange, replaceNotice, shapeRatio, type PopupRect, type PopupShape } from "./image-popup-rules";
import { cutArea, makesNewPicture, placeShape, popupTrim, restoreCut, sameTrim, trimmable, turnBy, uncut, zoomTo, type PictureSize, type TrimRect } from "./image-popup-trim";
import { trimGeometry } from "./trim-geometry";
import { mountImagePopupView, paintTrim, type ImagePopupState } from "./image-popup-view";

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
  let records: MediaRecords | undefined;
  try { records = parseMediaRecords(ports.source(MEDIA_RECORDS_PATH)); } catch { /* Read without the trim. */ }
  const read = readPlaceFrame(expected, records, target.path);
  const tag = startTags(expected)[0], src = tag && startTagAttribute(expected, tag, "src");
  const placed = src ? mediaResolvePath(decodeHtmlEntities(src.value, true), target.path) ?? decodeHtmlEntities(src.value, true) : "";
  const start = { shape: read.shape as PopupShape, focus: read.focus };
  // A trimmed spot re-opens on the full original with the earlier trim put back (an original that
  // is gone leaves the trimmed copy as the picture).
  const earlier = read.trimmed && read.source ? records?.files[placed]?.trimmedFrom : undefined;
  // A trim is cut from the revision the popup shows: it is read before the picture's bytes.
  const files = options.workspaceContext().catch(() => undefined);
  const load = async (path: string) => {
    const ctx = trimmable(path) ? await files : undefined;
    let version: string | undefined;
    try { version = ctx?.assetVersion(path); } catch { /* No trim without a revision. */ }
    const loaded = await loadPicture(host, path);
    return loaded && { ...loaded, version };
  };
  let picture = earlier ? await load(earlier.source) : undefined;
  const restored = picture?.size && earlier ? { trim: earlier.trim } : undefined;
  if (!restored) picture = placed ? await load(placed) : undefined;
  const state: ImagePopupState = {
    file: restored ? earlier!.source : placed, url: picture?.url, image: picture?.image, size: picture?.size, version: picture?.version,
    trimmable: Boolean(picture?.size && trimmable(restored ? earlier!.source : placed)), recrop: Boolean(restored), cut: uncut(),
    shape: start.shape, focus: read.focus ? { ...read.focus } : { x: 50, y: 50 }, boxes: undefined, busy: false,
  };
  if (restored) Object.assign(state, restoreCut(restored.trim, start.shape, picture!.size!));
  if (!stamp.holds() || ports.source(target.path) !== source || !options.live()) return undefined;
  let replacement: MediaImage | undefined;
  let closed = false;
  // A trimmed copy is saved when the result is one; the place shows another picture when it is not
  // the one it has (a replacement, or a re-crop taken back to the original).
  const trimNow = () => state.trimmable && state.size ? popupTrim(state.size, state.shape, state.focus, state.cut) : undefined;
  const swapped = () => Boolean(replacement) || (Boolean(restored) && !trimNow());
  const centred = { x: 50, y: 50 };
  // The shape the place keeps (around a Free trim, Original or a re-opened place's own) and what changes in it.
  const shapeNow = () => placeShape(state.shape, state.around);
  const kept = (shape = shapeNow()) => typeof shape === "string" && shape !== "free" ? { shape } : {};
  const frameNow = () => frameChange(start, { shape: shapeNow(), focus: state.focus }, swapped());
  const trimStyle = () => inlineStyle(writePlaceFrame(expected, { ...kept(), focus: centred }));

  // The page shows the popup's look: the trimmed picture, or the shape and focus (and picture).
  const look = () => {
    if (trimNow()) { host.look(target, { style: trimStyle(), ...(state.cutUrl ? { src: state.cutUrl } : {}) }); return; }
    const change = frameNow();
    const styled = change ? writePlaceFrame(expected, change) : expected;
    host.look(target, { style: inlineStyle(styled), ...(swapped() ? { src: state.file } : {}) });
  };
  // A change of shape, trim or picture is measured again for the previews.
  let measuring = 0, measured = "";
  const measure = async () => {
    const trim = trimNow(), change = frameNow();
    const style = trim ? trimStyle() : change?.shape !== undefined ? inlineStyle(writePlaceFrame(expected, change)) : undefined;
    const image = trim ? { ...state.cutSize } : replacement ?? (swapped() ? { ...state.size } : {});
    const key = JSON.stringify([style, image]);
    if (key === measured) return;
    const asked = ++measuring;
    measured = key;
    // The new box until the measurement answers: the same widths, the shape's (or trim's) height.
    const ratio = trim && state.cutSize ? (shapeRatio(shapeNow()) ?? state.cutSize.width / state.cutSize.height) : shapeRatio(state.shape);
    if (ratio && state.boxes) { state.boxes = state.boxes.map(box => ({ ...box, height: box.width / ratio, fit: "cover" })); view.draw(); }
    let boxes: MediaBox[] | undefined;
    try { boxes = (await (style === undefined && !swapped() ? ports.measureImage?.(target.path, target.node, image) : ports.measureImage?.(target.path, target.node, image, undefined, style)))?.boxes; }
    catch { /* The previews keep their estimate. */ }
    if (asked !== measuring || closed || !boxes?.length) return;
    state.boxes = boxes;
    view.draw();
  };
  // The trimmed picture is drawn once a frame at most (a drag moves it often); the measurement waits for a pause.
  let painting = 0, pause: ReturnType<typeof setTimeout> | undefined, painted = "";
  const paint = () => {
    const trim = trimNow(), key = JSON.stringify(trim ?? null);
    if (key === painted) return;
    painted = key;
    const size = trim && state.size ? trimGeometry(state.size.width, state.size.height, trim) : undefined;
    state.cutSize = size && { width: size.width, height: size.height };
    state.cutUrl = trim && state.image ? trimmedPreview(state.image, trim) : undefined;
  };
  const update = () => {
    view.draw();
    clearTimeout(pause);
    pause = setTimeout(() => { if (!closed) void measure(); }, 150);
    if (painting) return;
    painting = requestAnimationFrame(() => { painting = 0; if (closed) return; paint(); view.draw(); look(); });
  };

  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(painting); clearTimeout(pause);
    // Done leaves the look until the page draws the change; then the image's own attributes are right.
    host.look(target);
    view.remove();
    options.closed();
  }
  // ✕, Escape or a press elsewhere; once Done is writing, it finishes (the window shows it busy).
  const cancel = () => { if (!state.busy) close(); };
  async function done() {
    if (state.busy) return;
    const trim = trimNow(), proof = { stamp, epoch, source: source!, expected }, initialAlt = mediaExistingAlt(expected);
    // A re-crop left as it was keeps its copy; at most the place's shape changes.
    const same = restored && !replacement && trim && sameTrim(trim, restored.trim);
    const shape = kept(), change = same ? (shape.shape && shape.shape !== start.shape ? shape : undefined) : frameNow();
    if (!trim && !swapped() && !change || same && !change) { close(); return; }
    state.busy = true; view.draw();
    try {
      if (trim && !same) {
        // The earlier trimmed copy is replaced when nothing else uses it.
        const previous = records?.files[placed]?.trimmedFrom && placed !== state.file ? placed : undefined;
        const { trimPlace } = await import("./place-trim");
        await trimPlace(ports, options.workspaceContext, target, { source: state.file, sourceVersion: state.version, trim, previous, ...shape },
          { ...proof, initialAlt }, () => !closed);
      } else if (!same && swapped()) {
        const image = replacement ?? mediaImageForPlacement(state.file, state.size ?? {}, (await options.workspaceContext()).paths);
        await placeMediaImage(ports, options.workspaceContext, target, image, { ...proof, initialAlt }, () => false, undefined, change);
      } else if (change) {
        await framePlace(ports, target, change, proof);
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
        const loaded = await load(picked.path);
        if (closed) return;
        // The shape stays (Free leaves Original); the focus goes to the middle; a trim or turn is dropped.
        const trimmed = read.trimmed || makesNewPicture(state.shape, state.cut);
        replacement = picked;
        Object.assign(state, { file: picked.path, url: loaded?.url, image: loaded?.image, size: loaded?.size, version: loaded?.version,
          trimmable: Boolean(loaded?.size && trimmable(picked.path)), recrop: false, cut: uncut(), shape: shapeNow(), around: undefined, focus: { ...centred } });
        state.notice = replaceNotice(picked.path, state.shape, trimmed);
        view.draw(true);
        update();
      } }).catch((error: unknown) => ports.error(error));
  }

  const view = mountImagePopupView(state, host, {
    shape: (shape: PopupShape) => {
      // Free starts from what the place shows now; a shape starts unzoomed.
      if (shape === "free" && state.shape !== "free" && state.size) state.cut = { ...state.cut, rect: cutArea(state.size, state.shape, state.focus, state.cut) };
      else if (shape !== "free") state.cut = { ...state.cut, zoom: 1 };
      // A shape chosen here replaces the one a re-opened Free trim kept.
      if (shape !== state.shape) state.around = undefined;
      state.shape = shape; update();
    },
    focus: (focus: PlaceFocus) => { state.focus = focus; update(); },
    zoom: (percent: number) => { state.cut = zoomTo(state.shape, state.cut, percent); update(); },
    turn: (direction: 1 | -1) => { state.cut = turnBy(state.cut, direction); state.focus = { ...centred }; update(); },
    rect: (rect: TrimRect) => { state.cut = { ...state.cut, rect }; update(); },
    replace: () => { void replace(); },
    done: () => { void done(); },
    cancel,
  });
  paint();
  look();
  void measure();
  return { cancel };
}

/** A picture's address for the editor and its decoded size (none for one that cannot be read). */
async function loadPicture(host: ImagePopupHost, path: string): Promise<{ url: string; image?: HTMLImageElement; size?: PictureSize } | undefined> {
  const url = await host.picture(path).catch(() => undefined);
  if (!url) return undefined;
  const image = new Image();
  image.src = url;
  try { await image.decode(); } catch { return { url }; }
  return image.naturalWidth && image.naturalHeight ? { url, image, size: { width: image.naturalWidth, height: image.naturalHeight } } : { url };
}

/** The trimmed picture as the page and previews show it before Done (the saved copy is made by the image worker). */
function trimmedPreview(image: HTMLImageElement, trim: NonNullable<ReturnType<typeof popupTrim>>) {
  const canvas = document.createElement("canvas");
  paintTrim(canvas, image, trim, 1200);
  return canvas.toDataURL("image/webp", 0.85);
}
