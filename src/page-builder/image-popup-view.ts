// The image popup (crop-popup.html, made shorter like Brizy's in slice 109) in the media popup
// frame (media-popup-frame.ts): beside the picture on wide screens, a bottom sheet with 44 px
// targets on phones, a centred layer above Settings. The picture with the shape menu on it (a dark
// pill, its menu anchored to it) and the frame, dragged as the focus square; a one-time hint and
// Replace under it; Zoom with the two Turn buttons at its end; small previews; one quiet message
// line and Done. Escape closes the shape menu first, then the popup. A picture that can be trimmed gets Free (four
// corners), Zoom and Turn (slice 41), and Open large editor in the head (slice 42). Fixed to one
// shape (Settings' Social image, slice 44): its label instead of the shape menu, Zoom only, and a
// link card for the preview.
import "./image-popup.css";
import { node } from "../ui/dom";
import { icon } from "../icons";
import mobileIcon from "@phosphor-icons/core/regular/device-mobile.svg?raw";
import desktopIcon from "@phosphor-icons/core/regular/desktop.svg?raw";
import checkCircleIcon from "@phosphor-icons/core/regular/check-circle.svg?raw";
import infoIcon from "@phosphor-icons/core/regular/info.svg?raw";
import imageIcon from "@phosphor-icons/core/regular/image-square.svg?raw";
import largeIcon from "@phosphor-icons/core/regular/arrows-out-simple.svg?raw";
import turnLeftIcon from "@phosphor-icons/core/regular/arrow-counter-clockwise.svg?raw";
import turnRightIcon from "@phosphor-icons/core/regular/arrow-clockwise.svg?raw";
import type { MediaTrim } from "../../shared/media-records";
import type { MediaBox } from "./media-markup";
import type { PlaceFocus } from "./place-frame";
import type { ImagePopupHost } from "./image-popup";
import { componentShapeNotice, type ComponentPicture } from "./component-shapes";
import { SQUARE_HINT, nudgeFocus, pictureHint, popupMessage, seenHints, shapeRatio, sheetScroll, squareFocus, type PopupShape } from "./image-popup-rules";
import { MAX_ZOOM, cutArea, makesNewPicture, moveFree, placeShape, nudgeFree, resizeFree, shownTrim, squareApplies, turnText, turnedSize, zoomPercent, type PictureSize, type PopupCut, type TrimRect } from "./image-popup-trim";
import { trimGeometry } from "./trim-geometry";
import { markTransparency, mediaMayBeTransparent } from "./media-transparency";
import { actionButton, mountMediaPopupFrame, phonePopup, popupRow } from "./media-popup-frame";
import { mountShapeMenu } from "./shape-menu";

export interface ImagePopupState {
  component?: ComponentPicture;
  file: string; url?: string; shape: PopupShape; focus: PlaceFocus; boxes?: MediaBox[]; busy: boolean;
  /** Said at the top after Replace. */
  notice?: string;
  /** The decoded picture and its size, when it could be read. */
  image?: HTMLImageElement; size?: PictureSize;
  /** Zoom, Turn and Free: a raster picture in the site. */
  trimmable: boolean; cut: PopupCut;
  /** The spot already has a trimmed copy, re-cropped from its original. */
  recrop: boolean;
  /** The place's shape kept around a re-opened Free trim (else Original). */
  around?: PopupShape;
  /** The place's focus kept with `around`. */
  aroundFocus?: PlaceFocus;
  /** The picture's revision, read before its bytes: Done trims that revision or refuses. */
  version?: string;
  /** The trimmed picture as shown before Done, and its size. */
  cutUrl?: string; cutSize?: PictureSize;
}
/** A popup fixed to one shape (Settings' Social image): its label, its one message and a link card. */
export interface ImagePopupFixed {
  label: string;
  message: ReturnType<typeof popupMessage>;
  card: { title: string; site: string };
}
export interface ImagePopupEvents {
  shape(shape: PopupShape): void;
  focus(focus: PlaceFocus): void;
  zoom(percent: number): void;
  turn(direction: 1 | -1): void;
  rect(rect: TrimRect): void;
  replace(): void;
  large(): void;
  done(): void;
  cancel(): void;
}

const svg = (raw: string, size = 16) => {
  const template = document.createElement("template");
  template.innerHTML = raw.replace("<svg ", `<svg class="icon" width="${size}" height="${size}" aria-hidden="true" focusable="false" `);
  return template.content.firstElementChild as SVGSVGElement;
};
// The small previews: a phone and a computer screen at the widths the page is measured at, at most 72 px tall.
const DEVICES: readonly PreviewDevice[] = [{ name: "Phone", viewport: 390, width: 40, height: 72 }, { name: "Computer", viewport: 1280, width: 128, height: 72 }];
const HINTS_KEY = "ase.image-popup.hints";

export function mountImagePopupView(state: ImagePopupState, host: ImagePopupHost, events: ImagePopupEvents, fixed?: ImagePopupFixed) {
  const frameView = mountMediaPopupFrame(host, {
    title: fixed ? "Social image" : "Image", opener: ".edit-bar__media", className: fixed ? "image-popup--fixed" : undefined,
    // Each change shows on the page as it is made and closing keeps it; the social image keeps Done.
    closeLabel: fixed ? undefined : "Close",
    cancel: () => events.cancel(),
    escape: () => { if (!shapes.open) return false; shapes.toggle(false); shapeButton.focus(); return true; },
    resized: () => layoutPicture(),
  });
  const { root, where, notice, rows, message, foot, place } = frameView;

  // The picture: the shape menu over it and the place's frame on it, which is the focus square.
  const shapeButton = node("button", "image-popup__shape"); shapeButton.type = "button";
  const shapeText = node("span");
  shapeButton.append(shapeText, icon("caret-down", 13));
  const shapes = mountShapeMenu(shapeButton, shapeText, state.component, shape => events.shape(shape));
  const menu = shapes.menu;
  const picture = node("img", "image-popup__pic"); picture.alt = ""; picture.draggable = false;
  // A turned (or straightened, flipped) picture is drawn.
  const turned = node("canvas", "image-popup__pic"); turned.hidden = true;
  // The frame and its wash are clipped to the picture; Free's corners stand over the frame, unclipped,
  // so their 44 px grab areas reach past the picture's edges.
  const frame = node("div", "image-popup__frame");
  const shade = node("div", "image-popup__shade"); shade.append(frame);
  const handles = node("div", "image-popup__handles"); handles.setAttribute("aria-hidden", "true");
  handles.append(...["nw", "ne", "se", "sw"].map(corner => {
    const handle = node("span", `image-popup__corner image-popup__corner--${corner}`);
    handle.dataset.corner = corner;
    return handle;
  }));
  const picbox = node("div", "image-popup__picbox"); picbox.append(picture, turned, shade, handles);
  // A fixed shape is named where the menu would be.
  const shapeHead = fixed ? node("span", "image-popup__shape image-popup__shape--fixed", fixed.label) : shapeButton;
  const well = node("div", "image-popup__well"); well.append(shapeHead, ...fixed ? [] : [menu], picbox);
  // The hint shows the first time it applies (in this browser), then stays as the square's and the trim's description.
  const hint = node("p", "image-popup__hint"); hint.id = "image-popup-hint";
  shapeButton.setAttribute("aria-describedby", hint.id);
  const seen = seenHints(readHints()), shown = new Set<string>();
  const replace = actionButton("image-popup__link", () => events.replace());
  replace.append(svg(imageIcon, 14), "Replace"); replace.title = "Choose another picture for this spot";
  const under = node("div", "image-popup__under"); under.append(hint, replace);
  const pictureCell = node("div"); pictureCell.append(well, under);
  const pictureRow = popupRow("Picture", pictureCell, "image-popup__row--picture");

  const previews = fixed ? mountCard(fixed.card) : mountPreviews(DEVICES);
  // Zoom, and Turn at its end, save a trimmed copy; they show when the picture can be trimmed.
  const zoom = node("input", "image-popup__range");
  Object.assign(zoom, { type: "range", min: "100", max: String(MAX_ZOOM * 100), step: "5", id: "image-popup-zoom" });
  zoom.addEventListener("input", () => events.zoom(Number(zoom.value)));
  const zoomValue = node("output", "image-popup__value"); zoomValue.htmlFor.add("image-popup-zoom");
  const zoomCell = node("div", "image-popup__zoom"); zoomCell.append(zoom, zoomValue);
  const zoomRow = popupRow("Zoom", zoomCell);
  const zoomLabel = zoomRow.firstElementChild as HTMLElement;
  zoomLabel.id = "image-popup-zoom-label"; zoom.setAttribute("aria-labelledby", zoomLabel.id);
  const turnButton = (label: string, raw: string, direction: 1 | -1) => {
    const button = actionButton("image-popup__icon", () => events.turn(direction));
    button.append(svg(raw, 18)); button.setAttribute("aria-label", label); button.title = label;
    return button;
  };
  const turnLeft = turnButton("Turn left", turnLeftIcon, -1), turnRight = turnButton("Turn right", turnRightIcon, 1);
  const turnCell = node("div", "image-popup__turn"); turnCell.setAttribute("role", "group");
  turnCell.append(turnLeft, turnRight);
  if (!fixed) zoomCell.append(turnCell);
  rows.append(pictureRow, zoomRow, popupRow("Preview", previews.element));

  const doneButton = actionButton("image-popup__button image-popup__button--primary", () => events.done());
  doneButton.textContent = "Done";
  // Open large editor: an icon in the head, so the message and Done share one line.
  const largeButton = actionButton("image-popup__icon", () => events.large());
  largeButton.append(svg(largeIcon, 18)); largeButton.setAttribute("aria-label", "Open large editor"); largeButton.title = "Open large editor";
  if (!fixed) frameView.tools.prepend(largeButton);
  if (fixed) foot.append(doneButton);

  // The picture (turned as it will be) fits the well under the shape menu; the frame shows what the place shows.
  const size = () => state.size ?? { width: picture.naturalWidth || 4, height: picture.naturalHeight || 3 };
  let drawn = "";
  function layoutPicture() {
    const { width, height } = turnedSize(size(), state.cut.turn);
    const pad = 8, top = shapeHead.offsetTop + shapeHead.offsetHeight + 6, ww = well.clientWidth, wh = well.clientHeight;
    if (!ww) return;
    const scale = Math.min((ww - 2 * pad) / width, (wh - top - pad) / height);
    const pw = Math.max(1, Math.round(width * scale)), ph = Math.max(1, Math.round(height * scale));
    Object.assign(picbox.style, { width: `${pw}px`, height: `${ph}px`, left: `${Math.round((ww - pw) / 2)}px`, top: `${Math.round(top + (wh - top - pad - ph) / 2)}px` });
    const { turn, straighten, flipX, flipY } = state.cut, drawing = Boolean(state.image && (turn || straighten || flipX || flipY));
    picture.hidden = drawing; turned.hidden = !drawing;
    const key = `${state.url}|${turn}|${straighten}|${flipX}|${flipY}|${pw}x${ph}@${devicePixelRatio}`;
    if (drawing && key !== drawn) {
      drawn = key;
      paintTrim(turned, state.image!, shownTrim(size(), state.cut), Math.max(pw, ph) * (devicePixelRatio || 1));
    }
    const area = cutArea(size(), state.shape, state.focus, state.cut);
    const at = { left: `${area.x * pw}px`, top: `${area.y * ph}px`, width: `${area.w * pw}px`, height: `${area.h * ph}px` };
    Object.assign(frame.style, at); Object.assign(handles.style, at);
    // A square as tall as the picture cannot move up or down: a vertical swipe on it scrolls the sheet (slice 94).
    frame.classList.toggle("image-popup__frame--full-height", squareApplies(state.shape, state.cut) && area.h >= 1 - 1e-6);
  }
  const drawPreviews = () => previews.draw(state, size());
  picture.addEventListener("load", () => { layoutPicture(); drawPreviews(); });

  // The frame's part: the focus square (a slider), Free's trim area, or only a picture of what the place shows.
  const frameRoles = {
    square: { role: "slider", "aria-label": "Focus point", "aria-valuemin": "0", "aria-valuemax": "100" },
    free: { role: "group", "aria-roledescription": "trim area", "aria-label": "Trim area. Arrow keys move it. Alt and arrow keys change its size." },
  };
  const frameNames = ["tabindex", "role", "aria-roledescription", "aria-label", "aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext", "aria-describedby", "aria-hidden"];
  // Only what differs changes: dropping `tabindex` for a moment would take the keyboard focus off the
  // square, and dropping its value would have a screen reader hear it go and come back.
  function frameAs(part: keyof typeof frameRoles | undefined, values: Record<string, string> = {}) {
    const wanted: Record<string, string> = part ? { tabindex: "0", "aria-describedby": hint.id, ...frameRoles[part], ...values } : { "aria-hidden": "true" };
    for (const name of frameNames) if (!(name in wanted)) frame.removeAttribute(name);
    for (const [name, value] of Object.entries(wanted)) if (frame.getAttribute(name) !== value) frame.setAttribute(name, value);
  }

  function draw(focusSquare = false) {
    where.textContent = state.file.split("/").pop() ?? "";
    where.title = state.file;
    // Replace's note and a component's "looks different" note can both stand.
    const saidNotice = [state.notice, componentShapeNotice(state.shape, state.component)].filter(Boolean).join(" ") || undefined;
    notice.hidden = !saidNotice; notice.textContent = saidNotice ?? "";
    shapes.draw(state.shape, state.trimmable);
    // A see-through picture sits on 106's light checkerboard (the well is dark).
    if (state.url && picture.getAttribute("src") !== state.url) showPicture(picture, state.url, state.file);
    const applies = squareApplies(state.shape, state.cut), free = state.shape === "free";
    // A shape: the frame is the focus square, dragged or moved by arrow keys. Free: the frame is the
    // trim, moved by dragging or arrow keys, sized by its corners or Alt and arrow keys.
    const across = Math.round(state.focus.x), down = Math.round(state.focus.y);
    if (applies) frameAs("square", { "aria-valuenow": String(across), "aria-valuetext": `${across}% across, ${down}% down. Arrow keys move it.` });
    else frameAs(free ? "free" : undefined);
    frame.classList.toggle("image-popup__frame--square", applies);
    frame.classList.toggle("image-popup__frame--free", free);
    picbox.classList.toggle("image-popup__picbox--free", free);
    zoomRow.hidden = largeButton.hidden = !state.trimmable;
    const percent = zoomPercent(state.shape, state.cut);
    if (Number(zoom.value) !== percent) zoom.value = String(percent);
    zoom.style.setProperty("--fill", `${(percent - 100) / (MAX_ZOOM - 1)}%`);
    zoom.setAttribute("aria-valuetext", `${percent} percent`);
    zoomValue.textContent = `${percent} %`;
    // The turn shows in the buttons' tooltips and the group's name.
    const turnNow = turnText(state.cut);
    turnCell.setAttribute("aria-label", `Turn, now ${turnNow}`);
    turnLeft.title = `Turn left (now ${turnNow})`; turnRight.title = `Turn right (now ${turnNow})`;
    const said = pictureHint(state.shape, state.cut.zoom > 1.001);
    hint.textContent = said;
    // The square's hint is never shown, only read out as the square's description.
    if (!seen.has(said) && said !== SQUARE_HINT) shown.add(said);
    hint.classList.toggle("sr-only", !shown.has(said));
    const line = fixed?.message ?? popupMessage({ newPicture: state.trimmable && makesNewPicture(state.shape, state.cut), recrop: state.recrop });
    message.className = `image-popup__message image-popup__message--${line.tone}`;
    message.title = line.tip;
    message.replaceChildren(svg(line.tone === "new" ? infoIcon : checkCircleIcon, 14), node("span", "", line.text));
    doneButton.disabled = largeButton.disabled = zoom.disabled = state.busy;
    root.setAttribute("aria-busy", String(state.busy));
    layoutPicture();
    drawPreviews();
    place();
    if (focusSquare) (applies || free ? frame : shapeButton).focus({ preventScroll: true });
  }

  // Dragging: a press on the picture centres the square there (a finger's on release); a press on the square keeps where it was held.
  // Free: a corner sizes the trim, the frame moves it.
  let drag: { id: number; dx: number; dy: number; corner?: string; from?: TrimRect; x?: number; y?: number } | undefined;
  let tap: number | undefined;
  well.addEventListener("pointerdown", event => {
    const target = event.target as Element;
    if (target.closest(".image-popup__shape, .image-popup__menu")) return;
    if (shapes.open) { shapes.toggle(false); return; }
    if (event.button !== 0) return;
    if (state.shape === "free") {
      const corner = (target.closest(".image-popup__corner") as HTMLElement | null)?.dataset.corner;
      if (!corner && !target.closest(".image-popup__frame")) return;
      event.preventDefault();
      well.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, dx: 0, dy: 0, corner: corner ?? "", from: { ...state.cut.rect }, x: event.clientX, y: event.clientY };
      frame.focus({ preventScroll: true });
      return;
    }
    if (!squareApplies(state.shape, state.cut)) return;
    const onSquare = target.closest(".image-popup__frame");
    // A finger on the picture (not the square) moves the square on release, so a swipe there scrolls the sheet (slice 94).
    if (event.pointerType === "touch" && !onSquare) { tap = event.pointerId; return; }
    event.preventDefault();
    well.setPointerCapture(event.pointerId);
    const held = onSquare ? frame.getBoundingClientRect() : undefined;
    drag = { id: event.pointerId, dx: held ? event.clientX - (held.left + held.width / 2) : 0, dy: held ? event.clientY - (held.top + held.height / 2) : 0 };
    frame.focus({ preventScroll: true });
    follow(event);
  });
  const follow = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const box = picbox.getBoundingClientRect();
    if (drag.from) {
      const dx = (event.clientX - drag.x!) / (box.width || 1), dy = (event.clientY - drag.y!) / (box.height || 1);
      events.rect(drag.corner ? resizeFree(drag.from, drag.corner, dx, dy) : moveFree(drag.from, dx, dy));
      return;
    }
    centreSquare(event.clientX - drag.dx, event.clientY - drag.dy);
  };
  // The square centred on a point of the screen, as far as it can go on the picture.
  const centreSquare = (x: number, y: number) => {
    const box = picbox.getBoundingClientRect(), area = cutArea(size(), state.shape, state.focus, state.cut);
    const next = squareFocus(area, { x: (x - box.left) / (box.width || 1), y: (y - box.top) / (box.height || 1) }, state.focus);
    if (next.x !== state.focus.x || next.y !== state.focus.y) events.focus(next);
  };
  well.addEventListener("pointermove", follow);
  const release = (event: PointerEvent) => {
    if (drag?.id === event.pointerId) drag = undefined;
    if (tap !== event.pointerId) return;
    tap = undefined;
    if (event.type !== "pointerup" || !squareApplies(state.shape, state.cut)) return;
    centreSquare(event.clientX, event.clientY);
    frame.focus({ preventScroll: true });
  };
  well.addEventListener("pointerup", release);
  well.addEventListener("pointercancel", release);

  root.addEventListener("keydown", event => {
    if ((event.target as Element).closest(".image-popup__menu")) return;
    if (event.target === frame && squareApplies(state.shape, state.cut)) {
      const next = nudgeFocus(state.focus, event.key, event.shiftKey, cutArea(size(), state.shape, state.focus, state.cut));
      if (next) { event.preventDefault(); events.focus(next); }
    }
    if (event.target === frame && state.shape === "free") {
      const next = nudgeFree(state.cut.rect, event.key, event.shiftKey, event.altKey);
      if (next) { event.preventDefault(); events.rect(next); }
    }
  });

  draw();
  requestAnimationFrame(() => {
    if (!root.isConnected) return;
    // On a phone the page scrolls so the picture sits just above the sheet.
    const image = host.image();
    if (phonePopup() && image) {
      const dy = sheetScroll(image, root.getBoundingClientRect().top, host.frame()?.top ?? 0);
      if (dy) host.scroll(dy);
    }
    draw(true);
  });

  return {
    draw,
    /** Back from the large editor: its button has the focus again. */
    focusLarge: () => largeButton.focus({ preventScroll: true }),
    remove() {
      if (shown.size) writeHints([...seen, ...shown]);
      frameView.remove();
    },
  };
}

// The pictures `showPicture` has given their one error listener.
const dropsMarkOnError = new WeakSet<HTMLImageElement>();
/** A new picture in `image`: its see-through mark is for this picture, sampled once it has loaded (slice 106's checkerboard).
 *  A file that may be see-through keeps the last mark until then, so a trim drawn per step does not flash its checkerboard;
 *  a picture that fails to load drops it, as it describes another picture. */
function showPicture(image: HTMLImageElement, url: string, path: string) {
  if (!dropsMarkOnError.has(image)) {
    dropsMarkOnError.add(image);
    image.addEventListener("error", () => image.removeAttribute("data-transparent"));
  }
  if (!mediaMayBeTransparent(path)) image.removeAttribute("data-transparent");
  image.src = url;
  markTransparency(image, path);
}

function readHints() { try { return localStorage.getItem(HINTS_KEY); } catch { return null; } }
function writeHints(hints: string[]) { try { localStorage.setItem(HINTS_KEY, JSON.stringify(hints)); } catch { /* private mode: hints show again */ } }

export interface PreviewDevice { name: "Phone" | "Computer"; viewport: number; width: number; height: number }
/** The live previews: the spot in a phone's and a computer's screen at the widths the page is measured at; the spot is sized in shares of its screen. */
export function mountPreviews(devices: readonly PreviewDevice[]) {
  const element = node("div", "image-popup__previews");
  const shown = devices.map(device => {
    const figure = node("figure", `image-popup__device image-popup__device--${device.name.toLowerCase()}`);
    const caption = node("figcaption"); caption.append(svg(device.name === "Phone" ? mobileIcon : desktopIcon, 12), device.name);
    const screen = node("div", "image-popup__screen");
    // At most the device's size, in its proportions: a narrower column scales the screen down whole (slice 110).
    screen.style.width = `${device.width}px`; screen.style.aspectRatio = `${device.width} / ${device.height}`;
    const spot = node("div", "image-popup__spot"), image = node("img"); image.alt = "";
    spot.append(image); screen.append(spot); figure.append(caption, screen); element.append(figure);
    return { device, spot, image };
  });
  function draw(state: ImagePopupState, size: PictureSize) {
    // A trim shows the trimmed picture, which already has its shape.
    const cut = state.cutUrl && state.cutSize, url = cut ? state.cutUrl : state.url;
    const { width, height } = cut ? state.cutSize! : size, ratio = cut ? shapeRatio(placeShape(state.shape, state.around)) ?? width / height : shapeRatio(state.shape);
    for (const { device, spot, image } of shown) {
      const box = state.boxes?.find(item => item.viewport === device.viewport), scale = device.width / device.viewport;
      let w = box ? box.width * scale : device.width * 0.8;
      let h = box ? box.height * scale : ratio ? w / ratio : w * height / width;
      const fit = Math.min(1, (device.width - 6) / w, (device.height - 6) / h);
      w = Math.max(2, w * fit); h = Math.max(2, h * fit);
      spot.style.width = `${(w / device.width) * 100}%`; spot.style.aspectRatio = `${w} / ${h}`;
      if (url && image.getAttribute("src") !== url) showPicture(image, url, state.file);
      image.style.objectFit = box?.fit ?? (ratio ? "cover" : "fill");
      image.style.objectPosition = cut ? state.aroundFocus ? `${state.aroundFocus.x}% ${state.aroundFocus.y}%` : ""
        : squareApplies(state.shape, state.cut) ? `${state.focus.x}% ${state.focus.y}%` : "";
    }
  }
  return { element, draw };
}

/** The link card a sharing service shows: the frame (the trimmed picture), the site and the title. */
function mountCard(text: { title: string; site: string }) {
  const element = node("figure", "image-popup__card");
  const image = node("img", "image-popup__card-image"); image.alt = "";
  const caption = node("figcaption");
  caption.append(node("span", "image-popup__card-site", text.site), node("b", "", text.title));
  element.append(image, caption);
  function draw(state: ImagePopupState) {
    const url = state.cutUrl ?? state.url;
    if (url && image.getAttribute("src") !== url) showPicture(image, url, state.file);
  }
  return { element, draw };
}

/** A picture's address for the editor and its decoded size (none for one that cannot be read). */
export async function loadPicture(host: Pick<ImagePopupHost, "picture">, path: string): Promise<{ url: string; image?: HTMLImageElement; size?: PictureSize } | undefined> {
  const url = await host.picture(path).catch(() => undefined);
  if (!url) return undefined;
  const image = new Image();
  image.src = url;
  try { await image.decode(); } catch { return { url }; }
  return image.naturalWidth && image.naturalHeight ? { url, image, size: { width: image.naturalWidth, height: image.naturalHeight } } : { url };
}

/** The trimmed picture as the page and previews show it before Done (the saved copy is made by the image worker). */
export function trimmedPreview(image: HTMLImageElement, trim: MediaTrim, longest = 1200) {
  const canvas = document.createElement("canvas");
  paintTrim(canvas, image, trim, longest);
  return canvas.toDataURL("image/webp", 0.85);
}

/** Draws `trim` of `image` into `canvas`, its longer side at most `longest` pixels. */
export function paintTrim(canvas: HTMLCanvasElement, image: HTMLImageElement, trim: MediaTrim, longest: number) {
  const geometry = trimGeometry(image.naturalWidth, image.naturalHeight, trim);
  const scale = Math.min(1, longest / Math.max(geometry.width, geometry.height));
  canvas.width = Math.max(1, Math.round(geometry.width * scale)); canvas.height = Math.max(1, Math.round(geometry.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.transform(...geometry.matrix);
  context.drawImage(image, 0, 0);
}
