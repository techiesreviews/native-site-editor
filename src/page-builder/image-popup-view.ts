// The image popup's window (crop-popup.html): compact rows with a label on the left, in the
// edit bar's colours, light or dark with the editor. Beside the picture on wide screens (below
// the bar when there is no room), a bottom sheet with 44 px targets on phones. It does not trap
// Tab (as Brizy's); Escape closes the shape menu first, then the popup.
import "./image-popup.css";
import { node } from "../ui/dom";
import { icon } from "../icons";
import mobileIcon from "@phosphor-icons/core/regular/device-mobile.svg?raw";
import desktopIcon from "@phosphor-icons/core/regular/desktop.svg?raw";
import checkCircleIcon from "@phosphor-icons/core/regular/check-circle.svg?raw";
import infoIcon from "@phosphor-icons/core/regular/info.svg?raw";
import imageIcon from "@phosphor-icons/core/regular/image-square.svg?raw";
import type { MediaBox } from "./media-markup";
import type { PlaceFocus, PlaceShape } from "./place-frame";
import type { ImagePopupHost } from "./image-popup";
import { POPUP_SHAPES, focusApplies, focusAt, nudgeFocus, pictureHint, placePopup, popupMessage, shapeLabel, shapeRatio, sheetScroll, visibleArea, type PopupShape } from "./image-popup-rules";

export interface ImagePopupState {
  file: string; url?: string; shape: PopupShape; focus: PlaceFocus; boxes?: MediaBox[]; busy: boolean;
  /** Said at the top after Replace. */
  notice?: string;
}
export interface ImagePopupEvents {
  shape(shape: PlaceShape): void;
  focus(focus: PlaceFocus): void;
  replace(): void;
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
const DEVICES = [{ name: "Phone", viewport: 390, width: 58, height: 104, icon: mobileIcon }, { name: "Computer", viewport: 1280, width: 150, height: 84, icon: desktopIcon }];

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
  const items = POPUP_SHAPES.map(shape => {
    const item = actionButton("image-popup__item", () => { toggleMenu(false); shapeButton.focus(); events.shape(shape.id); });
    item.setAttribute("role", "menuitemradio");
    item.append(node("span", "", shape.label), icon("check", 16));
    item.dataset.shape = shape.id;
    return item;
  });
  menu.append(...items);
  const picture = node("img", "image-popup__pic"); picture.alt = ""; picture.draggable = false;
  const frame = node("div", "image-popup__frame"); frame.setAttribute("aria-hidden", "true");
  const dot = node("span", "image-popup__dot");
  dot.tabIndex = 0; dot.setAttribute("role", "slider"); dot.setAttribute("aria-roledescription", "focus dot");
  dot.setAttribute("aria-label", "Focus dot"); dot.setAttribute("aria-valuemin", "0"); dot.setAttribute("aria-valuemax", "100");
  const picbox = node("div", "image-popup__picbox"); picbox.append(picture, frame, dot);
  const well = node("div", "image-popup__well"); well.append(shapeButton, menu, picbox);
  const hint = node("p", "image-popup__hint");
  const replace = actionButton("image-popup__link", () => events.replace());
  replace.append(svg(imageIcon, 14), "Replace"); replace.title = "Choose another picture for this spot";
  const under = node("div", "image-popup__under"); under.append(hint, replace);
  const pictureCell = node("div"); pictureCell.append(well, under);
  const pictureRow = row("Picture", pictureCell, "image-popup__row--picture");

  const previews = node("div", "image-popup__previews");
  const shown = DEVICES.map(device => {
    const figure = node("figure", `image-popup__device image-popup__device--${device.name.toLowerCase()}`);
    const caption = node("figcaption"); caption.append(svg(device.icon, 12), device.name);
    const screen = node("div", "image-popup__screen");
    screen.style.width = `${device.width}px`; screen.style.height = `${device.height}px`;
    const spot = node("div", "image-popup__spot"), image = node("img"); image.alt = "";
    spot.append(image); screen.append(spot); figure.append(caption, screen); previews.append(figure);
    return { device, spot, image };
  });
  const rows = node("div", "image-popup__rows"); rows.append(pictureRow, row("Preview", previews));

  const message = node("div", "image-popup__message"); message.setAttribute("role", "status");
  const doneButton = actionButton("image-popup__button image-popup__button--primary", () => events.done());
  doneButton.textContent = "Done";
  const foot = node("div", "image-popup__foot"); foot.append(doneButton);
  const bottom = node("div", "image-popup__bottom"); bottom.append(message, foot);
  root.append(nub, grab, head, notice, rows, bottom, close);
  document.body.append(root);

  let menuOpen = false;
  function toggleMenu(open: boolean) {
    menuOpen = open; menu.hidden = !open;
    shapeButton.setAttribute("aria-expanded", String(open));
    if (open) (items.find(item => item.getAttribute("aria-checked") === "true") ?? items[0]).focus();
  }

  // The picture fits the well under the shape menu; the frame shows what the place shows.
  function layoutPicture() {
    const width = picture.naturalWidth || 4, height = picture.naturalHeight || 3;
    const pad = 8, top = shapeButton.offsetTop + shapeButton.offsetHeight + 6, ww = well.clientWidth, wh = well.clientHeight;
    if (!ww) return;
    const scale = Math.min((ww - 2 * pad) / width, (wh - top - pad) / height);
    const pw = Math.max(1, Math.round(width * scale)), ph = Math.max(1, Math.round(height * scale));
    Object.assign(picbox.style, { width: `${pw}px`, height: `${ph}px`, left: `${Math.round((ww - pw) / 2)}px`, top: `${Math.round(top + (wh - top - pad - ph) / 2)}px` });
    const area = visibleArea({ width, height }, shapeRatio(state.shape), state.focus);
    Object.assign(frame.style, { left: `${area.x * pw}px`, top: `${area.y * ph}px`, width: `${area.w * pw}px`, height: `${area.h * ph}px` });
    dot.style.left = `${state.focus.x}%`; dot.style.top = `${state.focus.y}%`;
  }
  function drawPreviews() {
    const width = picture.naturalWidth || 4, height = picture.naturalHeight || 3, ratio = shapeRatio(state.shape);
    for (const { device, spot, image } of shown) {
      const box = state.boxes?.find(item => item.viewport === device.viewport), scale = device.width / device.viewport;
      let w = box ? box.width * scale : device.width * 0.8;
      let h = box ? box.height * scale : ratio ? w / ratio : w * height / width;
      const fit = Math.min(1, (device.width - 6) / w, (device.height - 6) / h);
      w = Math.max(2, w * fit); h = Math.max(2, h * fit);
      spot.style.width = `${w}px`; spot.style.height = `${h}px`;
      if (state.url && image.getAttribute("src") !== state.url) image.src = state.url;
      image.style.objectFit = box?.fit ?? (ratio ? "cover" : "fill");
      image.style.objectPosition = focusApplies(state.shape) ? `${state.focus.x}% ${state.focus.y}%` : "";
    }
  }
  picture.addEventListener("load", () => { layoutPicture(); drawPreviews(); });

  function draw(focusDot = false) {
    where.textContent = state.file.split("/").pop() ?? "";
    where.title = state.file;
    notice.hidden = !state.notice; notice.textContent = state.notice ?? "";
    shapeText.textContent = shapeLabel(state.shape);
    shapeButton.setAttribute("aria-label", `Shape: ${shapeLabel(state.shape)}`);
    for (const item of items) item.setAttribute("aria-checked", String(item.dataset.shape === state.shape));
    if (state.url && picture.getAttribute("src") !== state.url) picture.src = state.url;
    const applies = focusApplies(state.shape);
    dot.hidden = !applies;
    dot.setAttribute("aria-valuenow", String(state.focus.x));
    dot.setAttribute("aria-valuetext", `${state.focus.x}% across, ${state.focus.y}% down. Arrow keys move it.`);
    hint.textContent = pictureHint(state.shape);
    const said = popupMessage({ newPicture: false });
    message.className = `image-popup__message image-popup__message--${said.tone}`;
    message.title = said.tip;
    message.replaceChildren(svg(said.tone === "new" ? infoIcon : checkCircleIcon), node("span", "", said.text));
    doneButton.disabled = state.busy;
    root.setAttribute("aria-busy", String(state.busy));
    layoutPicture();
    drawPreviews();
    place();
    if (focusDot) (applies ? dot : shapeButton).focus({ preventScroll: true });
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
  let drag: { id: number; dx: number; dy: number } | undefined;
  well.addEventListener("pointerdown", event => {
    if ((event.target as Element).closest(".image-popup__shape, .image-popup__menu")) return;
    if (menuOpen) { toggleMenu(false); return; }
    if (!focusApplies(state.shape) || event.button !== 0) return;
    event.preventDefault();
    well.setPointerCapture(event.pointerId);
    const held = (event.target as Element).closest(".image-popup__dot") ? dot.getBoundingClientRect() : undefined;
    drag = { id: event.pointerId, dx: held ? event.clientX - (held.left + held.width / 2) : 0, dy: held ? event.clientY - (held.top + held.height / 2) : 0 };
    dot.focus({ preventScroll: true });
    follow(event);
  });
  const follow = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const box = picbox.getBoundingClientRect();
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
