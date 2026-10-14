// The image popup's window (crop-popup.html): compact rows with a label on the left, in the
// edit bar's colours, light or dark with the editor. Beside the picture on wide screens (below
// the bar when there is no room), a bottom sheet with 44 px targets on phones. It does not trap
// Tab (as Brizy's); Escape closes the shape menu first, then the popup. A picture that can be
// trimmed gets Free (four corners), Zoom and Turn (slice 41), and Open large editor (slice 42).
import "./image-popup.css";
import { node } from "../ui/dom";
import { icon } from "../icons";
import mobileIcon from "@phosphor-icons/core/regular/device-mobile.svg?raw";
import desktopIcon from "@phosphor-icons/core/regular/desktop.svg?raw";
import checkCircleIcon from "@phosphor-icons/core/regular/check-circle.svg?raw";
import infoIcon from "@phosphor-icons/core/regular/info.svg?raw";
import imageIcon from "@phosphor-icons/core/regular/image-square.svg?raw";
import turnLeftIcon from "@phosphor-icons/core/regular/arrow-counter-clockwise.svg?raw";
import turnRightIcon from "@phosphor-icons/core/regular/arrow-clockwise.svg?raw";
import type { MediaTrim } from "../../shared/media-records";
import type { MediaBox } from "./media-markup";
import type { PlaceFocus } from "./place-frame";
import type { ImagePopupHost } from "./image-popup";
import { POPUP_SHAPES, focusAt, nudgeFocus, pictureHint, placePopup, popupMessage, shapeLabel, shapeRatio, sheetScroll, type PopupShape } from "./image-popup-rules";
import { MAX_ZOOM, cutArea, dotApplies, makesNewPicture, moveFree, placeShape, nudgeFree, resizeFree, shownTrim, turnText, turnedSize, zoomPercent, type PictureSize, type PopupCut, type TrimRect } from "./image-popup-trim";
import { trimGeometry } from "./trim-geometry";

export interface ImagePopupState {
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
const phone = () => matchMedia("(max-width: 700px)").matches;
// The small previews: a phone and a computer screen at the widths the page is measured at.
const DEVICES: readonly PreviewDevice[] = [{ name: "Phone", viewport: 390, width: 58, height: 104 }, { name: "Computer", viewport: 1280, width: 150, height: 84 }];

export function mountImagePopupView(state: ImagePopupState, host: ImagePopupHost, events: ImagePopupEvents) {
  const root = node("div", "image-popup");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-labelledby", "image-popup-title");
  const nub = node("span", "image-popup__nub"); nub.setAttribute("aria-hidden", "true");
  const grab = node("span", "image-popup__grab"); grab.setAttribute("aria-hidden", "true");
  const title = node("b", "", "Image"); title.id = "image-popup-title";
  const where = node("span", "image-popup__where");
  const head = node("div", "image-popup__head"); head.append(title, where);
  const close = actionButton("image-popup__icon image-popup__x", () => events.cancel());
  close.append(icon("x", 18)); close.setAttribute("aria-label", "Close without changes"); close.title = "Close without changes (Esc)";
  const notice = node("p", "image-popup__notice"); notice.setAttribute("role", "status");

  // The picture: the shape menu over it, the place's frame and the focus dot on it.
  const shapeButton = actionButton("image-popup__shape", () => toggleMenu(!menuOpen));
  shapeButton.setAttribute("aria-haspopup", "menu");
  const shapeText = node("span");
  shapeButton.append(shapeText, icon("caret-down", 13));
  const menu = node("div", "image-popup__menu"); menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "Shape"); menu.hidden = true;
  const items = [...POPUP_SHAPES, { id: "free" as const, label: "Free" }].map(shape => {
    const item = actionButton("image-popup__item", () => { toggleMenu(false); shapeButton.focus(); events.shape(shape.id); });
    item.setAttribute("role", "menuitemradio");
    item.append(node("span", "", shape.label), icon("check", 16));
    item.dataset.shape = shape.id;
    return item;
  });
  menu.append(...items);
  const picture = node("img", "image-popup__pic"); picture.alt = ""; picture.draggable = false;
  // A turned (or straightened, flipped) picture is drawn.
  const turned = node("canvas", "image-popup__pic"); turned.hidden = true;
  const frame = node("div", "image-popup__frame");
  frame.append(...["nw", "ne", "se", "sw"].map(corner => {
    const handle = node("span", `image-popup__corner image-popup__corner--${corner}`);
    handle.dataset.corner = corner;
    return handle;
  }));
  const dot = node("span", "image-popup__dot");
  dot.tabIndex = 0; dot.setAttribute("role", "slider"); dot.setAttribute("aria-roledescription", "focus dot");
  dot.setAttribute("aria-label", "Focus dot"); dot.setAttribute("aria-valuemin", "0"); dot.setAttribute("aria-valuemax", "100");
  const picbox = node("div", "image-popup__picbox"); picbox.append(picture, turned, frame, dot);
  const well = node("div", "image-popup__well"); well.append(shapeButton, menu, picbox);
  const hint = node("p", "image-popup__hint");
  const replace = actionButton("image-popup__link", () => events.replace());
  replace.append(svg(imageIcon, 14), "Replace"); replace.title = "Choose another picture for this spot";
  const under = node("div", "image-popup__under"); under.append(hint, replace);
  const pictureCell = node("div"); pictureCell.append(well, under);
  const pictureRow = row("Picture", pictureCell, "image-popup__row--picture");

  const previews = mountPreviews(DEVICES);
  // Zoom and Turn save a trimmed copy; they show when the picture can be trimmed.
  const zoom = node("input", "image-popup__range");
  Object.assign(zoom, { type: "range", min: "100", max: String(MAX_ZOOM * 100), step: "5", id: "image-popup-zoom" });
  zoom.addEventListener("input", () => events.zoom(Number(zoom.value)));
  const zoomValue = node("output", "image-popup__value"); zoomValue.htmlFor.add("image-popup-zoom");
  const zoomCell = node("div", "image-popup__zoom"); zoomCell.append(zoom, zoomValue);
  const zoomRow = row("Zoom", zoomCell);
  const zoomLabel = zoomRow.firstElementChild as HTMLElement;
  zoomLabel.id = "image-popup-zoom-label"; zoom.setAttribute("aria-labelledby", zoomLabel.id);
  const turnValue = node("span", "image-popup__value image-popup__turned");
  const turnButton = (label: string, raw: string, direction: 1 | -1) => {
    const button = actionButton("image-popup__icon", () => events.turn(direction));
    button.append(svg(raw, 18)); button.setAttribute("aria-label", label); button.title = label;
    return button;
  };
  const turnCell = node("div", "image-popup__turn"); turnCell.setAttribute("role", "group");
  turnCell.append(turnValue, turnButton("Turn left", turnLeftIcon, -1), turnButton("Turn right", turnRightIcon, 1));
  const turnRow = row("Turn", turnCell);
  turnCell.setAttribute("aria-label", "Turn");
  const rows = node("div", "image-popup__rows"); rows.append(pictureRow, zoomRow, turnRow, row("Preview", previews.element));

  const message = node("div", "image-popup__message"); message.setAttribute("role", "status");
  const doneButton = actionButton("image-popup__button image-popup__button--primary", () => events.done());
  doneButton.textContent = "Done";
  const largeButton = actionButton("image-popup__button", () => events.large());
  largeButton.textContent = "Open large editor";
  const foot = node("div", "image-popup__foot"); foot.append(largeButton, doneButton);
  const bottom = node("div", "image-popup__bottom"); bottom.append(message, foot);
  root.append(nub, grab, head, notice, rows, bottom, close);
  document.body.append(root);

  let menuOpen = false;
  function toggleMenu(open: boolean) {
    menuOpen = open; menu.hidden = !open;
    shapeButton.setAttribute("aria-expanded", String(open));
    if (open) (items.find(item => item.getAttribute("aria-checked") === "true") ?? items[0]).focus();
  }

  // The picture (turned as it will be) fits the well under the shape menu; the frame shows what the place shows.
  const size = () => state.size ?? { width: picture.naturalWidth || 4, height: picture.naturalHeight || 3 };
  let drawn = "";
  function layoutPicture() {
    const { width, height } = turnedSize(size(), state.cut.turn);
    const pad = 8, top = shapeButton.offsetTop + shapeButton.offsetHeight + 6, ww = well.clientWidth, wh = well.clientHeight;
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
    Object.assign(frame.style, { left: `${area.x * pw}px`, top: `${area.y * ph}px`, width: `${area.w * pw}px`, height: `${area.h * ph}px` });
    dot.style.left = `${state.focus.x}%`; dot.style.top = `${state.focus.y}%`;
  }
  const drawPreviews = () => previews.draw(state, size());
  picture.addEventListener("load", () => { layoutPicture(); drawPreviews(); });

  function draw(focusDot = false) {
    where.textContent = state.file.split("/").pop() ?? "";
    where.title = state.file;
    notice.hidden = !state.notice; notice.textContent = state.notice ?? "";
    shapeText.textContent = shapeLabel(state.shape);
    shapeButton.setAttribute("aria-label", `Shape: ${shapeLabel(state.shape)}`);
    for (const item of items) {
      item.setAttribute("aria-checked", String(item.dataset.shape === state.shape));
      if (item.dataset.shape === "free") item.hidden = !state.trimmable;
    }
    if (state.url && picture.getAttribute("src") !== state.url) picture.src = state.url;
    const applies = dotApplies(state.shape, state.cut), free = state.shape === "free";
    dot.hidden = !applies;
    const across = Math.round(state.focus.x), down = Math.round(state.focus.y);
    dot.setAttribute("aria-valuenow", String(across));
    dot.setAttribute("aria-valuetext", `${across}% across, ${down}% down. Arrow keys move it.`);
    // Free: the frame is the trim, moved by dragging or arrow keys, sized by its corners or Alt and arrow keys.
    frame.classList.toggle("image-popup__frame--free", free);
    if (free) {
      frame.tabIndex = 0; frame.setAttribute("role", "group"); frame.setAttribute("aria-roledescription", "trim area");
      frame.setAttribute("aria-label", "Trim area. Arrow keys move it. Alt and arrow keys change its size.");
      frame.removeAttribute("aria-hidden");
    } else {
      frame.removeAttribute("tabindex"); frame.removeAttribute("role"); frame.removeAttribute("aria-roledescription"); frame.removeAttribute("aria-label");
      frame.setAttribute("aria-hidden", "true");
    }
    zoomRow.hidden = turnRow.hidden = largeButton.hidden = !state.trimmable;
    const percent = zoomPercent(state.shape, state.cut);
    if (Number(zoom.value) !== percent) zoom.value = String(percent);
    zoom.style.setProperty("--fill", `${(percent - 100) / (MAX_ZOOM - 1)}%`);
    zoom.setAttribute("aria-valuetext", `${percent} percent`);
    zoomValue.textContent = `${percent} %`;
    turnValue.textContent = turnValue.title = turnText(state.cut);
    hint.textContent = pictureHint(state.shape, state.cut.zoom > 1.001);
    const said = popupMessage({ newPicture: state.trimmable && makesNewPicture(state.shape, state.cut), recrop: state.recrop });
    message.className = `image-popup__message image-popup__message--${said.tone}`;
    message.title = said.tip;
    message.replaceChildren(svg(said.tone === "new" ? infoIcon : checkCircleIcon), node("span", "", said.text));
    doneButton.disabled = largeButton.disabled = zoom.disabled = state.busy;
    root.setAttribute("aria-busy", String(state.busy));
    layoutPicture();
    drawPreviews();
    place();
    if (focusDot) (applies ? dot : free ? frame : shapeButton).focus({ preventScroll: true });
  }

  // Beside the picture, level with the edit bar, its nub towards the Image button; a sheet on phones.
  const imageButton = () => host.bar()?.querySelector<HTMLButtonElement>(".edit-bar__image") ?? null;
  function place() {
    if (phone()) { root.style.left = root.style.top = ""; return; }
    const image = host.image(), bar = host.bar(), barBox = bar && !bar.hidden ? bar.getBoundingClientRect() : undefined;
    if (!image || !barBox?.width) return;
    const size = { width: root.offsetWidth, height: root.offsetHeight };
    const at = placePopup(image, barBox, size, { width: document.documentElement.clientWidth, height: innerHeight });
    root.dataset.side = at.side;
    root.style.left = `${at.left}px`; root.style.top = `${at.top}px`;
    const target = (imageButton() ?? bar)!.getBoundingClientRect();
    const clamp = (value: number, high: number) => Math.round(Math.max(12, Math.min(high, value)));
    if (at.side === "below") root.style.setProperty("--nub-x", `${clamp(target.left + target.width / 2 - at.left - 7, size.width - 26)}px`);
    else root.style.setProperty("--nub-y", `${clamp(target.top + target.height / 2 - at.top - 7, size.height - 26)}px`);
  }

  // Dragging: a press on the picture puts the dot there; a press on the dot keeps where it was held.
  // Free: a corner sizes the trim, the frame moves it.
  let drag: { id: number; dx: number; dy: number; corner?: string; from?: TrimRect; x?: number; y?: number } | undefined;
  well.addEventListener("pointerdown", event => {
    const target = event.target as Element;
    if (target.closest(".image-popup__shape, .image-popup__menu")) return;
    if (menuOpen) { toggleMenu(false); return; }
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
    if (!dotApplies(state.shape, state.cut)) return;
    event.preventDefault();
    well.setPointerCapture(event.pointerId);
    const held = target.closest(".image-popup__dot") ? dot.getBoundingClientRect() : undefined;
    drag = { id: event.pointerId, dx: held ? event.clientX - (held.left + held.width / 2) : 0, dy: held ? event.clientY - (held.top + held.height / 2) : 0 };
    dot.focus({ preventScroll: true });
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
    const next = focusAt({ x: event.clientX - drag.dx, y: event.clientY - drag.dy }, box);
    if (next.x !== state.focus.x || next.y !== state.focus.y) events.focus(next);
  };
  well.addEventListener("pointermove", follow);
  const release = (event: PointerEvent) => { if (drag?.id === event.pointerId) drag = undefined; };
  well.addEventListener("pointerup", release);
  well.addEventListener("pointercancel", release);

  // Escape with nothing focused (a press on the page left the focus nowhere) closes it too.
  const stray = (event: KeyboardEvent) => {
    if (event.key === "Escape" && (document.activeElement === document.body || !document.activeElement)) { event.preventDefault(); events.cancel(); }
  };
  document.addEventListener("keydown", stray);
  root.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (menuOpen) { toggleMenu(false); shapeButton.focus(); return; }
      events.cancel();
      return;
    }
    if (menuOpen && (event.target as Element).closest(".image-popup__menu")) {
      const index = items.indexOf(event.target as HTMLButtonElement);
      const next = event.key === "ArrowDown" ? (index + 1) % items.length : event.key === "ArrowUp" ? (index - 1 + items.length) % items.length
        : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : undefined;
      if (next !== undefined) { event.preventDefault(); items[next].focus(); return; }
      if (event.key === "Tab") { event.preventDefault(); toggleMenu(false); shapeButton.focus(); }
      return;
    }
    if (event.target === dot) {
      const next = nudgeFocus(state.focus, event.key, event.shiftKey);
      if (next) { event.preventDefault(); events.focus(next); }
    }
    if (event.target === frame && state.shape === "free") {
      const next = nudgeFree(state.cut.rect, event.key, event.shiftKey, event.altKey);
      if (next) { event.preventDefault(); events.rect(next); }
    }
  });

  // Leaving the popup without Done changes nothing: a press elsewhere, another selection, the bar gone.
  const outside = (event: PointerEvent) => {
    const target = event.target as Element;
    if (root.contains(target) || target.closest?.("dialog, .edit-bar__image")) return;
    events.cancel();
  };
  document.addEventListener("pointerdown", outside, true);
  const still = () => { if (imageButton()?.getAttribute("aria-expanded") !== "true") events.cancel(); else place(); };
  const bar = host.bar(), pane = bar?.parentElement;
  const watch = new MutationObserver(() => queueMicrotask(still));
  if (bar) watch.observe(bar, { childList: true });
  pane?.addEventListener("edit-bar-layout", place);
  const resized = () => { place(); layoutPicture(); };
  addEventListener("resize", resized);
  imageButton()?.setAttribute("aria-expanded", "true");

  draw();
  requestAnimationFrame(() => {
    if (!root.isConnected) return;
    // On a phone the page scrolls so the picture sits just above the sheet.
    const image = host.image();
    if (phone() && image) {
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
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", stray);
      watch.disconnect();
      pane?.removeEventListener("edit-bar-layout", place);
      removeEventListener("resize", resized);
      const focused = root.contains(document.activeElement);
      root.remove();
      const button = imageButton();
      button?.setAttribute("aria-expanded", "false");
      if (focused) button?.focus({ preventScroll: true });
    },
  };
}

function actionButton(className: string, action: () => void) {
  const item = node("button", className);
  item.type = "button";
  item.addEventListener("click", action);
  return item;
}
function row(label: string, content: HTMLElement, className = "") {
  const item = node("div", `image-popup__row ${className}`.trim());
  item.append(node("span", "image-popup__label", label), content);
  return item;
}

export interface PreviewDevice { name: "Phone" | "Computer"; viewport: number; width: number; height: number }
/** The live previews: the spot in a phone's and a computer's screen at the widths the page is measured at. */
export function mountPreviews(devices: readonly PreviewDevice[]) {
  const element = node("div", "image-popup__previews");
  const shown = devices.map(device => {
    const figure = node("figure", `image-popup__device image-popup__device--${device.name.toLowerCase()}`);
    const caption = node("figcaption"); caption.append(svg(device.name === "Phone" ? mobileIcon : desktopIcon, 12), device.name);
    const screen = node("div", "image-popup__screen");
    screen.style.width = `${device.width}px`; screen.style.height = `${device.height}px`;
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
      spot.style.width = `${w}px`; spot.style.height = `${h}px`;
      if (url && image.getAttribute("src") !== url) image.src = url;
      image.style.objectFit = box?.fit ?? (ratio ? "cover" : "fill");
      image.style.objectPosition = cut ? state.aroundFocus ? `${state.aroundFocus.x}% ${state.aroundFocus.y}%` : ""
        : dotApplies(state.shape, state.cut) ? `${state.focus.x}% ${state.focus.y}%` : "";
    }
  }
  return { element, draw };
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
