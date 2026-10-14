// The large editor (media build slice 42; ticket 09 "Large editor"; the large window in
// crop-wordpress-style.html, laid out as WordPress 7.1's Media Editor): the picture area with the
// frame's handles and a straighten ruler, a side panel with Turn, Flip, Zoom, Shape, the live
// message and previews, Reset, Undo and Redo, Cancel and Done. It edits the image popup's own
// state: Done is the popup's Done (saving closes both); Cancel, ✕ and Escape go back to the popup
// as it was. On phones: one row of icons with the shape menu, and the previews behind Preview.
import "./image-large-editor.css";
import { node } from "../ui/dom";
import { icon } from "../icons";
import turnLeftIcon from "@phosphor-icons/core/regular/arrow-counter-clockwise.svg?raw";
import turnRightIcon from "@phosphor-icons/core/regular/arrow-clockwise.svg?raw";
import flipXIcon from "@phosphor-icons/core/regular/flip-horizontal.svg?raw";
import flipYIcon from "@phosphor-icons/core/regular/flip-vertical.svg?raw";
import zoomInIcon from "@phosphor-icons/core/regular/magnifying-glass-plus.svg?raw";
import zoomOutIcon from "@phosphor-icons/core/regular/magnifying-glass-minus.svg?raw";
import shapeIcon from "@phosphor-icons/core/regular/crop.svg?raw";
import eyeIcon from "@phosphor-icons/core/regular/eye.svg?raw";
import checkCircleIcon from "@phosphor-icons/core/regular/check-circle.svg?raw";
import infoIcon from "@phosphor-icons/core/regular/info.svg?raw";
import { POPUP_SHAPES, popupMessage, shapeLabel, type PopupShape } from "./image-popup-rules";
import { componentShapeEntry } from "./component-shapes";
import { cutArea, makesNewPicture, nudgeFree, shownTrim, turnBy, turnedSize, type TrimRect } from "./image-popup-trim";
import { canZoomOut, chooseShape, editKey, fitView, flipEdit, moveArea, resetEdit, resizeArea, rulerValue, straightenEdit, zoomArea, type PopupEdit } from "./image-large-rules";
import { mountPreviews, paintTrim, type ImagePopupState, type PreviewDevice } from "./image-popup-view";

export interface LargeEditorEvents {
  change(edit: PopupEdit): void;
  done(): void;
  cancel(): void;
}

const DEVICES: readonly PreviewDevice[] = [{ name: "Phone", viewport: 390, width: 92, height: 184 }, { name: "Computer", viewport: 1280, width: 196, height: 122 }];
const SHAPES: readonly PopupShape[] = [...POPUP_SHAPES.map(shape => shape.id), "free"];
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const phone = () => matchMedia("(max-width: 700px)").matches;
const svg = (raw: string, size = 20) => {
  const template = document.createElement("template");
  template.innerHTML = raw.replace("<svg ", `<svg class="icon" width="${size}" height="${size}" aria-hidden="true" focusable="false" `);
  return template.content.firstElementChild as SVGSVGElement;
};

/** Opens the large editor on the popup's `state`; `own` is the place's shape when the popup opened (Reset goes back to it). */
export function mountLargeEditor(state: ImagePopupState, own: PopupShape, events: LargeEditorEvents) {
  const size = state.size!, componentShape = componentShapeEntry(state.component)?.id;
  const edit = (): PopupEdit => ({ shape: state.shape, focus: state.focus, cut: state.cut, around: state.around, aroundFocus: state.aroundFocus });
  const dialog = node("dialog", "image-large");
  dialog.setAttribute("aria-labelledby", "image-large-title");

  // Header: the title and the picture's name; Preview (phones) and ✕.
  const title = node("h2", "image-large__title", "Edit image"); title.id = "image-large-title";
  const where = node("span", "image-large__where");
  const titles = node("div", "image-large__titles"); titles.append(title, where);
  const previewToggle = button("image-large__text image-large__phone-only", () => toggleSheet(!sheetOpen));
  previewToggle.append(svg(eyeIcon, 18), "Preview");
  previewToggle.setAttribute("aria-controls", "image-large-side");
  const close = iconButton("Close without changes", icon("x", 22), () => events.cancel());
  const head = node("header", "image-large__head"); head.append(titles, previewToggle, close);

  // The picture area: the picture moves under a frame that stays fitted in the middle.
  const picture = node("canvas", "image-large__pic");
  const frame = node("div", "image-large__frame");
  frame.tabIndex = 0; frame.setAttribute("role", "group"); frame.setAttribute("aria-roledescription", "crop area");
  const thirds = node("span", "image-large__thirds"); thirds.setAttribute("aria-hidden", "true");
  frame.append(thirds, ...HANDLES.map(handle => {
    const grip = node("span", `image-large__handle image-large__handle--${handle}`);
    grip.dataset.handle = handle; grip.setAttribute("aria-hidden", "true");
    return grip;
  }));
  const stage = node("div", "image-large__stage"); stage.append(picture, frame);

  // The straighten ruler: −45° to 45°, its strip moving under a fixed pointer.
  const strip = node("div", "image-large__strip");
  for (let degrees = -45; degrees <= 45; degrees += 1.5) {
    const tick = node("span", `image-large__tick${degrees % 15 === 0 ? " image-large__tick--big" : degrees % 7.5 === 0 ? " image-large__tick--mid" : ""}`);
    tick.style.left = `${(degrees + 45) * 6}px`;
    strip.append(tick);
    if (degrees % 15 === 0) {
      const number = node("span", "image-large__degrees", `${degrees}°`);
      number.style.left = `${(degrees + 45) * 6}px`; number.dataset.degrees = String(degrees);
      strip.append(number);
    }
  }
  const straighten = node("input", "image-large__straighten");
  Object.assign(straighten, { type: "range", min: "-45", max: "45", step: "0.5" });
  straighten.setAttribute("aria-label", "Straighten");
  const reading = node("span", "image-large__reading");
  const window_ = node("div", "image-large__window"); window_.append(strip);
  const pointer = node("span", "image-large__pointer");
  const ruler = node("div", "image-large__ruler"); ruler.append(window_, pointer, reading, straighten);
  const rulerRow = node("div", "image-large__ruler-row"); rulerRow.append(ruler);
  const area = node("div", "image-large__area"); area.append(stage, rulerRow);

  // Turn, Flip and Zoom: labelled groups in the side panel; one row of icons on phones.
  const tools = (className: string) => {
    const make = (label: string, raw: string, key: string, action: () => void) => {
      const item = iconButton(label, svg(raw, 22), action);
      item.title = `${label} (${key})`;
      return item;
    };
    const turnLeft = make("Turn left", turnLeftIcon, "Shift+R", () => act(turn(-1)));
    const turnRight = make("Turn right", turnRightIcon, "R", () => act(turn(1)));
    const flipX = make("Flip side to side", flipXIcon, "H", () => act(flipEdit(edit(), "x")));
    const flipY = make("Flip upside down", flipYIcon, "V", () => act(flipEdit(edit(), "y")));
    const zoomOut = make("Zoom out", zoomOutIcon, "−", () => act(zoomArea(edit(), 1 / 1.25)));
    const zoomIn = make("Zoom in", zoomInIcon, "+", () => act(zoomArea(edit(), 1.25)));
    const group = (label: string, ...items: HTMLButtonElement[]) => {
      const box = node("div", "image-large__group"); box.setAttribute("role", "group"); box.setAttribute("aria-label", label);
      const row = node("div", "image-large__buttons"); row.append(...items);
      box.append(node("span", "image-large__label", label), row);
      return box;
    };
    const element = node("div", className);
    element.append(group("Turn", turnLeft, turnRight), group("Flip", flipX, flipY), group("Zoom", zoomOut, zoomIn));
    return { element, zoomOut };
  };
  const shapeSelect = (className: string) => {
    const select = node("select", className);
    select.setAttribute("aria-label", "Shape");
    select.addEventListener("change", () => {
      const shape = select.value === "component" ? componentShape : SHAPES.find(item => item === select.value);
      if (shape) act(chooseShape(size, edit(), shape));
    });
    return select;
  };
  const sideTools = tools("image-large__tools"), phoneTools = tools("image-large__tools image-large__iconrow");
  const sideShape = shapeSelect("image-large__select"), phoneShape = shapeSelect("image-large__select image-large__select--icon");
  const shapeHolder = node("span", "image-large__shape-icon"); shapeHolder.append(phoneShape, svg(shapeIcon, 22));
  phoneTools.element.append(shapeHolder);
  const phoneMessage = node("div", "image-large__message image-large__phone-only");
  const sideMessage = node("div", "image-large__message");
  const main = node("div", "image-large__main"); main.append(area, phoneTools.element, phoneMessage);

  const shapeBox = node("div", "image-large__desk-only");
  const shapeLabelElement = node("span", "image-large__label", "Shape");
  shapeBox.append(shapeLabelElement, sideShape);
  const previews = mountPreviews(DEVICES);
  const previewBox = node("div", "image-large__previews");
  previewBox.append(node("span", "image-large__label", "Preview"), previews.element);
  const sideMessageBox = node("div", "image-large__desk-only"); sideMessageBox.append(sideMessage);
  sideTools.element.classList.add("image-large__desk-only");
  const side = node("aside", "image-large__side"); side.id = "image-large-side";
  side.setAttribute("aria-label", "Side panel");
  side.append(sideTools.element, shapeBox, sideMessageBox, previewBox);
  const body = node("div", "image-large__body"); body.append(main, side);

  // Footer: Reset, Undo, Redo; Cancel and Done.
  const reset = button("image-large__text", () => act(resetEdit(own)));
  reset.textContent = "Reset"; reset.title = "Start again from the original";
  const undo = iconButton("Undo", icon("undo", 22), () => step(-1)); undo.title = "Undo (Ctrl+Z)";
  const redo = iconButton("Redo", icon("redo", 22), () => step(1)); redo.title = "Redo (Ctrl+Shift+Z)";
  const cancel = button("image-large__text", () => events.cancel()); cancel.textContent = "Cancel";
  const done = button("image-large__primary", () => { events.done(); draw(); }); done.textContent = "Done";
  const left = node("div", "image-large__foot-group"); left.append(reset, undo, redo);
  const right = node("div", "image-large__foot-group"); right.append(cancel, done);
  const foot = node("footer", "image-large__foot"); foot.append(left, right);
  dialog.append(head, body, foot);
  document.body.append(dialog);

  // The large editor's own Undo and Redo, one step per action (a drag, a ruler move, a few keys).
  const history: PopupEdit[] = [structuredClone(edit())];
  let at = 0, commitTimer: ReturnType<typeof setTimeout> | undefined;
  function commit() {
    clearTimeout(commitTimer);
    if (editKey(history[at]) === editKey(edit())) return;
    history.splice(at + 1, Infinity, structuredClone(edit()));
    at = history.length - 1;
    draw();
  }
  const later = () => { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 400); };
  function step(by: -1 | 1) {
    commit();
    const next = at + by;
    if (next < 0 || next >= history.length) return;
    at = next; settle = true;
    events.change(structuredClone(history[at]));
  }
  // A whole action: the frame settles into the middle again, and it is one Undo step.
  let settle = false;
  function act(next: PopupEdit) { settle = true; events.change(next); commit(); }
  const turn = (direction: 1 | -1): PopupEdit => ({ ...edit(), cut: turnBy(state.cut, direction), focus: { x: 50, y: 50 } });

  let sheetOpen = false;
  function toggleSheet(open: boolean) {
    sheetOpen = open;
    side.classList.toggle("is-open", open);
    previewToggle.setAttribute("aria-expanded", String(open));
  }

  // Layout: the picture's turned size, drawn on a canvas once per turn, straighten or flip.
  const shown = turnedSize(size, state.cut.turn);
  let painted = "", view: ReturnType<typeof fitView> | undefined, held: ReturnType<typeof fitView> | undefined;
  let settling: ReturnType<typeof setTimeout> | undefined;
  function layout() {
    const { width, height } = turnedSize(size, state.cut.turn);
    Object.assign(shown, { width, height });
    const { turn: t, straighten: s, flipX, flipY } = state.cut, key = `${state.url}|${t}|${s}|${flipX}|${flipY}`;
    if (state.image && key !== painted) {
      painted = key;
      paintTrim(picture, state.image, shownTrim(size, state.cut), Math.min(2048, Math.max(width, height)));
    }
    picture.style.width = `${width}px`; picture.style.height = `${height}px`;
    const rect = cutArea(size, state.shape, state.focus, state.cut);
    const room = { width: stage.clientWidth, height: stage.clientHeight };
    if (!room.width || !room.height) return;
    view = held ?? fitView(rect, shown, room, phone() ? 22 : 32);
    if (settle) {
      settle = false;
      stage.classList.add("is-settling");
      clearTimeout(settling);
      settling = setTimeout(() => stage.classList.remove("is-settling"), 320);
    }
    picture.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    Object.assign(frame.style, { left: `${view.x + view.scale * rect.x * width}px`, top: `${view.y + view.scale * rect.y * height}px`,
      width: `${view.scale * rect.w * width}px`, height: `${view.scale * rect.h * height}px` });
  }

  function draw() {
    const now = edit(), free = state.shape === "free";
    where.textContent = state.file.split("/").pop() ?? ""; where.title = state.file;
    for (const select of [sideShape, phoneShape]) {
      // A shaped component's own shape is always offered first (slice 43); a hand-written ratio only while the place has it.
      const other = [...(componentShape ? [componentShape] : []), ...(typeof state.shape === "object" && state.shape.kind !== "component" ? [state.shape] : [])];
      const options = [...other, ...SHAPES].map(shape => {
        const option = node("option", "", shapeLabel(shape));
        option.value = typeof shape === "string" ? shape : shape.kind === "component" ? "component" : "";
        option.selected = shape === state.shape || typeof shape === "object" && shape.kind === "component" && typeof state.shape === "object" && state.shape.kind === "component";
        return option;
      });
      if (select.options.length !== options.length || [...select.options].some((option, index) => option.value !== options[index].value)) select.replaceChildren(...options);
      else for (const [index, option] of [...select.options].entries()) option.selected = options[index].selected;
    }
    phoneShape.title = `Shape: ${shapeLabel(state.shape)}`;
    const said = popupMessage({ newPicture: makesNewPicture(state.shape, state.cut), recrop: state.recrop });
    for (const message of [sideMessage, phoneMessage]) {
      message.classList.toggle("image-large__message--new", said.tone === "new");
      message.setAttribute("role", "status");
      message.replaceChildren(svg(said.tone === "new" ? infoIcon : checkCircleIcon, 18), node("span", "", said.text));
    }
    for (const zoomOut of [sideTools.zoomOut, phoneTools.zoomOut]) zoomOut.disabled = !canZoomOut(now);
    const degrees = state.cut.straighten ?? 0;
    straighten.value = String(degrees);
    straighten.setAttribute("aria-valuetext", `${degrees} degrees`);
    reading.textContent = `${degrees}°`;
    strip.style.transform = `translateX(${ruler.clientWidth / 2 - (degrees + 45) * 6}px)`;
    for (const number of strip.querySelectorAll<HTMLElement>(".image-large__degrees")) number.style.visibility = Math.abs(Number(number.dataset.degrees) - degrees) < 6 ? "hidden" : "";
    frame.classList.toggle("image-large__frame--free", free);
    frame.setAttribute("aria-label", free ? "Trim area. Arrow keys move it. Alt and arrow keys change its size." : "What stays in view. Arrow keys move it.");
    reset.disabled = editKey(now) === editKey(resetEdit(own));
    undo.disabled = at <= 0 && editKey(history[0]) === editKey(now);
    redo.disabled = at >= history.length - 1;
    done.disabled = cancel.disabled = state.busy;
    dialog.setAttribute("aria-busy", String(state.busy));
    previews.draw(state, size);
    layout();
  }

  // Dragging: the picture moves under the frame (what stays in view); a handle resizes the frame,
  // which then settles back into the middle.
  let drag: { id: number; x: number; y: number; from: TrimRect; handle?: string; scale: number } | undefined;
  stage.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !view) return;
    event.preventDefault();
    stage.setPointerCapture(event.pointerId);
    const handle = (event.target as HTMLElement).closest<HTMLElement>(".image-large__handle")?.dataset.handle;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, from: cutArea(size, state.shape, state.focus, state.cut), handle, scale: view.scale };
    if (handle) held = view;
    stage.classList.remove("is-settling");
    stage.classList.add("is-dragging");
    frame.focus({ preventScroll: true });
  });
  stage.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = (event.clientX - drag.x) / (drag.scale * shown.width), dy = (event.clientY - drag.y) / (drag.scale * shown.height);
    events.change(drag.handle ? resizeArea(size, edit(), drag.from, drag.handle, dx, dy) : moveArea(size, edit(), drag.from, -dx, -dy));
  });
  const release = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const resized = Boolean(drag.handle);
    drag = undefined; held = undefined;
    stage.classList.remove("is-dragging");
    if (resized) settle = true;
    commit();
    draw();
  };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  stage.addEventListener("wheel", event => {
    event.preventDefault();
    if (event.deltaY) { events.change(zoomArea(edit(), event.deltaY < 0 ? 1.1 : 1 / 1.1)); later(); }
  }, { passive: false });

  // The ruler: drag its strip, or the arrow keys on it.
  let turning: { id: number; x: number; from: number } | undefined;
  ruler.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    ruler.setPointerCapture(event.pointerId);
    turning = { id: event.pointerId, x: event.clientX, from: state.cut.straighten ?? 0 };
    straighten.focus({ preventScroll: true });
  });
  ruler.addEventListener("pointermove", event => {
    if (turning?.id !== event.pointerId) return;
    const value = rulerValue(turning.from, event.clientX - turning.x);
    if (value !== (state.cut.straighten ?? 0)) events.change(straightenEdit(edit(), value));
  });
  const leave = (event: PointerEvent) => { if (turning?.id === event.pointerId) { turning = undefined; commit(); } };
  ruler.addEventListener("pointerup", leave);
  ruler.addEventListener("pointercancel", leave);
  straighten.addEventListener("input", () => { events.change(straightenEdit(edit(), Number(straighten.value))); later(); });

  // Escape is Cancel (below); a window the browser closes all the same is a Cancel too.
  let removed = false;
  dialog.addEventListener("cancel", event => event.preventDefault());
  dialog.addEventListener("close", () => { if (!removed) events.cancel(); });
  dialog.addEventListener("keydown", event => {
    const target = event.target as HTMLElement, key = event.key;
    if (key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (sheetOpen) { toggleSheet(false); previewToggle.focus(); return; }
      events.cancel();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key.toLowerCase() === "z" || event.ctrlKey && key.toLowerCase() === "y")) {
      event.preventDefault(); event.stopPropagation();
      step(event.shiftKey || key.toLowerCase() === "y" ? 1 : -1);
      return;
    }
    if (target === frame && /^Arrow/.test(key)) {
      event.preventDefault();
      const from = cutArea(size, state.shape, state.focus, state.cut), by = event.shiftKey ? 0.1 : 0.02;
      const [dx, dy] = ({ ArrowLeft: [-by, 0], ArrowRight: [by, 0], ArrowUp: [0, -by], ArrowDown: [0, by] } as Record<string, [number, number]>)[key] ?? [0, 0];
      if (state.shape === "free") { const rect = nudgeFree(from, key, event.shiftKey, event.altKey); if (rect) events.change({ ...edit(), cut: { ...state.cut, rect } }); }
      else events.change(moveArea(size, edit(), from, dx, dy));
      if (event.altKey) settle = true;
      later();
      return;
    }
    if (target.closest("select") || event.ctrlKey || event.metaKey || event.altKey) return;
    const next = key === "+" || key === "=" ? zoomArea(edit(), 1.25) : key === "-" || key === "_" ? canZoomOut(edit()) && zoomArea(edit(), 1 / 1.25)
      : key.toLowerCase() === "r" ? turn(event.shiftKey ? -1 : 1) : key.toLowerCase() === "h" ? flipEdit(edit(), "x") : key.toLowerCase() === "v" ? flipEdit(edit(), "y") : undefined;
    if (next === undefined) return;
    event.preventDefault();
    if (next) act(next);
  });
  const resized = () => { if (!phone()) toggleSheet(false); draw(); };
  addEventListener("resize", resized);

  dialog.showModal();
  toggleSheet(false);
  draw();
  frame.focus({ preventScroll: true });
  requestAnimationFrame(() => { if (dialog.isConnected) draw(); });

  return {
    draw,
    remove() {
      removed = true;
      clearTimeout(commitTimer); clearTimeout(settling);
      removeEventListener("resize", resized);
      dialog.close();
      dialog.remove();
    },
  };
}

function button(className: string, action: () => void) {
  const item = node("button", className);
  item.type = "button";
  item.addEventListener("click", action);
  return item;
}
function iconButton(label: string, glyph: Element, action: () => void) {
  const item = button("image-large__icon", action);
  item.append(glyph);
  item.setAttribute("aria-label", label);
  item.title = label;
  return item;
}
