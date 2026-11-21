import { NATIVE_CONFIG_PATH, nativeSitePrefix } from "../../shared/native-project";
// The image popup (media-manager ticket 09 "Entry point and popup", build slice 39), opened by
// the edit bar's Image button: the whole picture with the shape menu and the focus square, Replace,
// small phone and computer previews and the one-line message. There is no Done: the page shows
// each change at once (an `image-look` on the canvas), and closing (Close, Escape, a press
// elsewhere) writes it as one Undo step. Replace closes the popup and places the choice at once.
// Zoom, Turn and Free trimming (slice 41) save a Trimmed copy for this spot only; a trimmed spot
// re-opens on the full original with its trim put back. Open large editor (slice 42) edits the
// same state in a large window: its Done writes and closes; its Cancel puts the popup back.
import type { MediaControllerPorts, MediaModule, MediaPin } from "../controllers/media-controller";
import { pinnedPorts } from "../background-page";
import type { MediaWorkspaceContext } from "./media-workspace";
import type { MediaBox } from "./media-markup";
import { mediaExistingAlt } from "./media-attributes";
import { locateNativeElementRange } from "../native-source-location";
import { framePlace, inlineStyle, writePlaceFrame, type PlaceFocus, type PlaceFrameChange } from "./place-frame";
import { placeMediaImage } from "./media-place";
import { mediaImageForPlacement } from "./media-markup";
import { decodeHtmlEntities } from "./html-entities";
import { mediaResolvePath } from "./media-references";
import { startTags, startTagAttribute } from "../../shared/html-source";
import { MEDIA_RECORDS_PATH, parseMediaRecords, type MediaRecords } from "../../shared/media-records";
import { frameChange, keepsPopupChanges, shapeRatio, type PopupRect, type PopupShape } from "./image-popup-rules";
import { placeShape, popupTrim, restoreCut, sameTrim, trimmable, turnBy, uncut, zoomTo, type TrimRect } from "./image-popup-trim";
import { chooseShape, editKey, type PopupEdit } from "./image-large-rules";
import { trimGeometry } from "./trim-geometry";
import { componentFrame, componentPicture } from "./component-shapes";
import { loadPicture, mountImagePopupView, trimmedPreview, type ImagePopupState } from "./image-popup-view";
import type { MediaPopupHost } from "./media-popup-frame";
import { isPictureSpot } from "./looping-video";
import { SPOT_ACCEPT, pickedVideo, placeSpotVideo, spotNote } from "./media-spot-pick";
import { PLACEHOLDER_IMAGE_PATH } from "./native-elements";
import { mediaKind } from "./media-library-filter";
import { guestReason } from "../guest-reason";

/** What the editor lends the popup: where it stands, and the page's live look. */
export interface ImagePopupHost extends MediaPopupHost {
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
  /** `pin`: the context of the workspace the popup opened on, whatever is shown (ticket 27). */
  workspaceContext: (include?: (path: string) => boolean, pin?: MediaPin) => Promise<MediaWorkspaceContext>;
  load: () => Promise<MediaModule>;
  target: { path: string; node: number[] };
  /** The press that opened it still owns the popup (no later press, repository or page change). */
  live(): boolean;
  closed(): void;
  /** On a synced session's guest page (TOOLS-185): closing hands the focus and crop to Lex's tab instead of writing
   * them, and Replace opens the guest's own picker, under the same `place` words as Lex's. */
  guest?: { write(edit: PopupEdit, recrop: boolean): void; replace(place: string): void };
  /** On Lex's tab, a guest's change written with no window: their focus and crop, or another picture for the place. */
  apply?: ImagePopupApply;
}
/** A guest's change for a picture (TOOLS-185): a focus and crop, a site picture, or their upload saved into `folder`.
 * A crop says whether the guest's popup re-opened a trimmed spot on its original: Lex's tab opens on the same picture. */
export type ImagePopupApply = { edit: PopupEdit; recrop: boolean } | { file: string } | { upload: File; folder: string };

export async function openImagePopup(options: ImagePopupOptions) {
  const { host, target } = options;
  // What it writes goes to the page it opened on, wherever Lex is by then (ticket 27, `pinnedPorts`).
  const pin = options.ports.pin?.(), ports = pinnedPorts(options.ports, pin, target.path), workspaceContext = (include?: (path: string) => boolean) => options.workspaceContext(include, pin);
  const stamp = options.ports.stamp(), epoch = ports.generation(), source = ports.source(target.path);
  const range = source === undefined ? undefined : (ports.locateElement ?? locateNativeElementRange)(source, target.node);
  if (source === undefined || !range || range.tag.name !== "img" || ports.viewingVersion()) return undefined;
  const expected = source.slice(range.tag.start, range.tag.end);
  let records: MediaRecords | undefined;
  try { records = parseMediaRecords(ports.source(MEDIA_RECORDS_PATH)); } catch { /* Read without the trim. */ }
  const component = componentPicture(source, target.node, path => ports.source(path));
  const read = componentFrame(expected, records, target.path, component, nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH)));
  const tag = startTags(expected)[0], src = tag && startTagAttribute(expected, tag, "src");
  const placed = src ? mediaResolvePath(decodeHtmlEntities(src.value, true), target.path, undefined, nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH))) ?? decodeHtmlEntities(src.value, true) : "";
  const start = { shape: read.shape as PopupShape, focus: read.focus };
  // A trimmed spot re-opens on the full original with the earlier trim put back (an original that
  // is gone leaves the trimmed copy as the picture).
  // A guest's crop is measured on the picture their popup opened on: a crop of the trimmed copy is not re-opened.
  const crop = options.apply && "edit" in options.apply ? options.apply : undefined;
  const earlier = read.trimmed && read.source && crop?.recrop !== false ? records?.files[placed]?.trimmedFrom : undefined;
  // A trim is cut from the revision the popup shows: it is read before the picture's bytes.
  const files = workspaceContext().catch(() => undefined);
  const load = async (path: string) => {
    const ctx = trimmable(path) ? await files : undefined;
    let version: string | undefined;
    try { version = ctx?.assetVersion(path); } catch { /* No trim without a revision. */ }
    const loaded = await loadPicture(host, path);
    return loaded && { ...loaded, version };
  };
  let picture = earlier ? await load(earlier.source) : undefined;
  const restored = picture?.size && earlier ? { trim: earlier.trim } : undefined;
  // A guest's re-crop of an original Lex's tab no longer has would land on the wrong picture: refused.
  if (crop?.recrop && !restored) return undefined;
  if (!restored) picture = placed ? await load(placed) : undefined;
  const state: ImagePopupState = {
    file: restored ? earlier!.source : placed, url: picture?.url, image: picture?.image, size: picture?.size, version: picture?.version,
    trimmable: Boolean(picture?.size && trimmable(restored ? earlier!.source : placed)), recrop: Boolean(restored), cut: uncut(),
    component, shape: start.shape, focus: read.focus ? { ...read.focus } : { x: 50, y: 50 }, boxes: undefined, busy: false,
  };
  if (restored) Object.assign(state, restoreCut(restored.trim, start.shape, picture!.size!));
  if (state.around && read.focus) state.aroundFocus = { ...read.focus };
  if (!stamp.holds() || ports.source(target.path) !== source || !options.live()) return undefined;
  const edit = (): PopupEdit => structuredClone({ shape: state.shape, focus: state.focus, cut: state.cut, around: state.around, aroundFocus: state.aroundFocus });
  // A re-opened trim left as it was saves nothing, even where converting it back is not exact.
  const opened = editKey(edit());
  let closed = false;
  // A trimmed copy is saved when the result is one; the place shows another picture when it is not
  // the one it has (a re-crop taken back to the original).
  const trimNow = () => state.trimmable && state.size ? popupTrim(state.size, state.shape, state.focus, state.cut) : undefined;
  const swapped = () => Boolean(restored) && !trimNow();
  const centred = { x: 50, y: 50 };
  // The shape the place keeps (around a Free trim, Original or a re-opened place's own) and what changes in it.
  const shapeNow = () => placeShape(state.shape, state.around);
  // Under a component's own shape (slice 43): Original must undo the component's crop, and its shape clears the place's own.
  const kept = (shape = shapeNow()): PlaceFrameChange => typeof shape !== "string" ? (shape.kind === "component" ? { shape: "component" } : {})
    : shape === "free" ? {} : { shape, ...(shape === "original" && state.component ? { originalUnderComponent: true } : {}) };
  // A trim's copy has its shape, so the place's focus goes to the middle; one kept around a
  // re-opened Free trim keeps the place's focus too.
  const trimFocus = () => state.aroundFocus ?? centred;
  const frameNow = () => frameChange(start, { shape: shapeNow(), focus: state.focus, component: state.component }, swapped());
  const trimStyle = () => inlineStyle(writePlaceFrame(expected, { ...kept(), focus: trimFocus() }));

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
    const image = trim ? { ...state.cutSize } : swapped() ? { ...state.size } : {};
    const key = JSON.stringify([style, image]);
    if (key === measured) return;
    const asked = ++measuring;
    measured = key;
    // The new box until the measurement answers: the same widths, the shape's (or trim's) height.
    const ratio = trim && state.cutSize ? (shapeRatio(shapeNow()) ?? state.cutSize.width / state.cutSize.height) : shapeRatio(state.shape);
    if (ratio && state.boxes) { state.boxes = state.boxes.map(box => ({ ...box, height: box.width / ratio, fit: "cover" })); redraw(); }
    let boxes: MediaBox[] | undefined;
    try { boxes = (await (style === undefined && !swapped() ? ports.measureImage?.(target.path, target.node, image) : ports.measureImage?.(target.path, target.node, image, undefined, style)))?.boxes; }
    catch { /* The previews keep their estimate. */ }
    if (asked !== measuring || closed || !boxes?.length) return;
    state.boxes = boxes;
    redraw();
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
  // The popup and, when open, the large editor show the same state.
  const redraw = () => { view?.draw(); large?.draw(); };
  const update = () => {
    redraw();
    clearTimeout(pause);
    pause = setTimeout(() => { if (!closed) void measure(); }, 150);
    if (painting) return;
    painting = requestAnimationFrame(() => { painting = 0; if (closed) return; paint(); redraw(); look(); });
  };

  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(painting); clearTimeout(pause);
    // Done leaves the look until the page draws the change; then the image's own attributes are right.
    if (view) host.look(target);
    large?.remove(); large = undefined;
    view?.remove();
    options.closed();
  }
  // There is no Done: the page shows each change as it is made, and ✕, Escape or a press elsewhere
  // keeps it. A page that changed meanwhile (or another press owning the bar) only closes; once
  // writing, it finishes (the window shows it busy).
  const cancel = () => {
    if (state.busy) return;
    // Another workspace shown, or left and shown again, keeps it too: it is written on its page (ticket 27).
    if (keepsPopupChanges({ pinned: Boolean(pin), here: pin?.here() ?? true, sameLoad: stamp.holds(), owned: options.live(),
      sameBytes: ports.source(target.path) === source, viewingVersion: ports.viewingVersion() })) void done();
    else close();
  };
  /** Why a guest's change was not written, as the write said it; false when it gave no words. */
  const reason = (error: unknown) => guestReason(error) ?? false as const;
  async function done(): Promise<boolean | string> {
    if (state.busy) return false;
    // A guest's popup writes nothing itself: Lex's tab writes what changed as his own change.
    if (options.guest) {
      const changed = editKey(edit()) !== opened;
      if (changed) options.guest.write(edit(), state.recrop);
      close();
      return changed;
    }
    const trim = trimNow(), proof = { stamp: pin ? ports.stamp() : stamp, epoch, source: source!, expected }, initialAlt = mediaExistingAlt(expected);
    // A re-crop left as it was keeps its copy; at most the place's shape changes.
    const same = restored && trim && (sameTrim(trim, restored.trim) || editKey(edit()) === opened);
    const shape = kept(), change = same ? (frameNow()?.shape !== undefined ? shape : undefined) : frameNow();
    if (!trim && !swapped() && !change || same && !change) { close(); return false; }
    state.busy = true; redraw();
    try {
      if (trim && !same) {
        // The earlier trimmed copy is replaced when nothing else uses it.
        const { trimPlace } = await import("./place-trim");
        await trimPlace(ports, workspaceContext, target,
          { source: state.file, sourceVersion: state.version, trim, frame: { ...shape, focus: trimFocus() } }, proof);
      } else if (!same && swapped()) {
        const image = mediaImageForPlacement(state.file, state.size ?? {}, (await workspaceContext()).paths);
        await placeMediaImage(ports, workspaceContext, target, image, { ...proof, initialAlt }, () => false, undefined, change);
      } else if (change) {
        await framePlace(ports, target, change, proof);
        ports.announce(change.shape !== undefined ? "Image shape changed" : "Focus point moved");
      }
      close();
      return true;
    } catch (error) {
      state.busy = false;
      close();
      // A guest's refused change is told to the guest (the answer, with why), not on Lex's notice bar.
      if (!options.apply) ports.error(error);
      return options.apply ? reason(error) : false;
    }
  }
  // Another picture for the place with no window (a guest's choice, TOOLS-185), placed as Replace places it.
  // An upload is held as the picker holds a file added in it: the file and the place are one Undo step.
  async function place(choice: { file: string } | { upload: File; folder: string }): Promise<boolean | string> {
    // The proof is taken before the first await and checked again (with the guest's own) when the place is written.
    const proofStamp = pin ? ports.stamp() : stamp;
    const picture = "file" in choice ? await loadPicture(host, choice.file) : undefined;
    if (!stamp.holds() || !options.live() || ports.source(target.path) !== source || ports.viewingVersion()) { close(); return false; }
    const frame = frameChange(start, { shape: shapeNow(), focus: centred, component: state.component }, true);
    try {
      const { image, held } = "file" in choice
        ? { image: mediaImageForPlacement(choice.file, picture?.size ?? {}, (await workspaceContext()).paths), held: undefined }
        : await (await import("./held-upload")).holdUpload(choice.upload, choice.folder, workspaceContext);
      // A place stopped part way (the guest's change no longer holds) writes nothing. The checks run before the write
      // only: once written the page is new, so the guest's proof no longer matching it does not undo the answer.
      let stopped = false;
      const cancelled = () => (stopped ||= !options.live());
      await placeMediaImage(ports, workspaceContext, target, image, { stamp: proofStamp, epoch, source: source!, expected, initialAlt: mediaExistingAlt(expected) }, cancelled, held, frame);
      return !stopped;
    } catch (error) {
      // Refused (the page changed, not a photo): the guest is told by the answer, with why; Lex's notice bar stays clear.
      return reason(error);
    } finally { close(); }
  }
  async function replace() {
    const words = mediaExistingAlt(expected)?.trim(), placeWords = `${ports.placeLabel?.(target.path) ?? target.path} · ${words || "Image"}`;
    if (options.guest) { close(); options.guest.replace(placeWords); return; }
    const { openMediaPicker } = await options.load();
    if (closed) return;
    // A picture spot (a slotted image) keeps its own rule below, even as the placeholder: a picture or a looping video.
    const parent = (ports.locateElement ?? locateNativeElementRange)(source!, target.node.slice(0, -1));
    const spot = isPictureSpot(expected) || parent?.tag.name === "picture" && isPictureSpot(source!.slice(parent.tag.start, parent.tag.end));
    if (!stamp.holds() || !options.live() || ports.source(target.path) !== source || ports.viewingVersion()) return;
    // Replace places the choice at once, with no Done: the popup closes first. The shape chosen
    // so far stays (Free leaves Original), the focus goes to the middle and a trim or turn is dropped.
    const frame = frameChange(start, { shape: shapeNow(), focus: centred, component: state.component }, true);
    close();
    const proof = { stamp: pin ? ports.stamp() : stamp, epoch, source: source! }, imageProof = { ...proof, expected, initialAlt: mediaExistingAlt(expected) };
    // The Media block starts as this image; Replace chooses any media for its place.
    if (placed === PLACEHOLDER_IMAGE_PATH && !spot) {
      const place = { path: target.path, parent: target.node.slice(0, -1), index: target.node.at(-1)!, replaces: true };
      await openMediaPicker({ report: ports, place: `${ports.placeLabel?.(target.path) ?? target.path} · Replace media`,
        onPick: async (chosen, cancelled, held) => {
          const added = held?.chosen?.()?.request, extension = added?.result?.outputs[0]?.extension;
          const kind = mediaKind(added ? extension ? `added.${extension}` : added.file.name : chosen.path);
          if (kind === "image") {
            await placeMediaImage(ports, workspaceContext, target, chosen, imageProof, cancelled, held, frame);
            return;
          }
          const { placeChosenMedia } = await import("./media-insert");
          await placeChosenMedia(ports, workspaceContext, { kind: "insert", place }, chosen, proof, cancelled, held);
        },
        onlineVideo: async (video, cancelled, picker) => {
          const { placeOnlineVideo } = await import("./online-video-place");
          await placeOnlineVideo(ports, workspaceContext, { place }, video, picker, proof, cancelled);
        } }).catch((error: unknown) => ports.error(error));
      return;
    }
    // A picture spot also takes a video, which loops silently there (slice 119).
    await openMediaPicker({ accept: spot ? SPOT_ACCEPT : "image/*", chosenNote: spot ? spotNote : undefined, report: ports, place: placeWords,
      onPick: async (image, cancelled, held) => {
        if (spot && pickedVideo(image, held)) await placeSpotVideo(ports, workspaceContext, target, image, proof, cancelled, held);
        else await placeMediaImage(ports, workspaceContext, target, image, imageProof, cancelled, held, frame);
      } }).catch((error: unknown) => ports.error(error));
  }

  // The large editor (loaded on demand): it changes this state; Cancel puts back what the popup had.
  let large: { draw(): void; remove(): void } | undefined, opening = false;
  async function openLarge() {
    if (large || opening || closed || !state.size || !state.trimmable) return;
    opening = true;
    const { mountLargeEditor } = await import("./image-large-editor").finally(() => { opening = false; });
    if (closed || large) return;
    const before = edit();
    const back = () => { large?.remove(); large = undefined; view?.draw(); view?.focusLarge(); };
    large = mountLargeEditor(state, start.shape, {
      change: (next: PopupEdit) => { Object.assign(state, { around: undefined, aroundFocus: undefined }, structuredClone(next)); update(); },
      done: () => { void done(); },
      cancel: () => { if (state.busy) return; Object.assign(state, before); back(); update(); },
    });
  }

  // Lex's tab writing a guest's change has no window and no look on the page: the change is written at once.
  const view = options.apply ? undefined : mountImagePopupView(state, host, {
    shape: (shape: PopupShape) => { Object.assign(state, chooseShape(state.size, edit(), shape)); update(); },
    focus: (focus: PlaceFocus) => { state.focus = focus; update(); },
    zoom: (percent: number) => { state.cut = zoomTo(state.shape, state.cut, percent); update(); },
    turn: (direction: 1 | -1) => { state.cut = turnBy(state.cut, direction); state.focus = { ...centred }; update(); },
    rect: (rect: TrimRect) => { state.cut = { ...state.cut, rect }; update(); },
    replace: () => { void replace(); },
    large: () => { void openLarge().catch((error: unknown) => ports.error(error)); },
    done: () => { void done(); },
    cancel,
  });
  if (options.apply) {
    if (!("edit" in options.apply)) return { cancel, applied: place(options.apply) };
    Object.assign(state, { around: undefined, aroundFocus: undefined }, structuredClone(options.apply.edit));
    return { cancel, applied: done() };
  }
  paint();
  look();
  void measure();
  return { cancel, applied: undefined };
}
