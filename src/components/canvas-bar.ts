// The canvas around the preview frame (page builder, canvas slice; see
// docs/page-builder/canvas.md): a bar above it with the selection's
// breadcrumb on the left and, on the right, the breakpoints (Desktop fills
// the canvas, Tablet 768 and Mobile 390 centre a frame of that width on a
// subtle canvas), the frame's live width, which can be typed, and the
// spacing overlay toggle. In a framed width, a handle on each side of the
// frame drags its width (both edges move, so the frame stays centred).
// The width and the toggle last for the browser session. Nothing here
// touches the site's files.

import { setCurrentBreakpoint, subscribeBreakpoint } from "../page-builder/breakpoints";

import desktop from "@phosphor-icons/core/regular/desktop.svg?raw";
import tablet from "@phosphor-icons/core/regular/device-tablet.svg?raw";
import mobile from "@phosphor-icons/core/regular/device-mobile.svg?raw";
import boundingBox from "@phosphor-icons/core/regular/bounding-box.svg?raw";
import { node } from "../ui/dom";
import {
  CANVAS_DEVICES,
  CANVAS_MIN_WIDTH,
  deviceFor,
  readStoredWidth,
  settleWidth,
  widthFor,
  type CanvasCrumb,
  type CanvasDevice,
  type CanvasWidth,
} from "../page-builder/canvas-model";
import "./canvas-bar.css";

const WIDTH_KEY = "native-site-editor:canvas-width";
const SPACING_KEY = "native-site-editor:canvas-spacing";
const ICONS: Record<CanvasDevice, string> = { desktop, tablet, mobile };

function svg(markup: string) {
  const template = document.createElement("template");
  template.innerHTML = markup.replace("<svg ", `<svg class="icon" width="16" height="16" aria-hidden="true" focusable="false" `);
  return template.content.firstElementChild as SVGSVGElement;
}

function remembered(key: string) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function remember(key: string, value: string) {
  try { sessionStorage.setItem(key, value); } catch { /* storage may be off */ }
}

export interface CanvasHandlers {
  /** A crumb chosen: its index in the last path given, -1 for the page's <body>. */
  onCrumb(index: number): void;
  /** A crumb pointed at (hover or focus), or no longer (`undefined`). */
  onCrumbHover(index: number | undefined): void;
  /** The spacing overlay turned on or off. */
  onSpacing(on: boolean): void;
}

export function createCanvasBar(frameHost: HTMLElement, frame: HTMLIFrameElement, handlers: CanvasHandlers) {
  const bar = node("div", "canvas-bar");

  // Breadcrumb: body › main › section.hero › h1.
  const crumbsNav = node("nav", "canvas-crumbs");
  crumbsNav.setAttribute("aria-label", "Selected element and its ancestors");
  const crumbList = node("ol", "canvas-crumbs__list");
  crumbsNav.append(crumbList);

  // Breakpoints, width and spacing.
  const tools = node("div", "canvas-tools");
  const devices = node("div", "canvas-devices");
  devices.setAttribute("role", "group");
  devices.setAttribute("aria-label", "Breakpoint");
  const deviceButtons = new Map<CanvasDevice, HTMLButtonElement>();
  for (const device of CANVAS_DEVICES) {
    const control = node("button", "canvas-device");
    control.type = "button";
    control.dataset.device = device.id;
    const name = device.width ? `${device.label}, ${device.width} px` : `${device.label}, fills the canvas`;
    control.setAttribute("aria-label", name);
    control.title = name;
    control.append(svg(ICONS[device.id]));
    control.addEventListener("click", () => setWidth(widthFor(device.id), true));
    deviceButtons.set(device.id, control);
    devices.append(control);
  }
  const widthField = node("label", "canvas-width");
  const widthInput = node("input", "canvas-width__input");
  widthInput.type = "text";
  widthInput.inputMode = "numeric";
  widthInput.autocomplete = "off";
  widthInput.spellcheck = false;
  widthInput.setAttribute("aria-label", "Frame width in pixels");
  widthInput.title = "Frame width: type a width and press Enter";
  widthField.append(widthInput, node("span", "canvas-width__unit", "px"));
  const spacingButton = node("button", "canvas-device canvas-spacing");
  spacingButton.type = "button";
  spacingButton.setAttribute("aria-label", "Show margin and padding");
  spacingButton.title = "Show margin and padding";
  spacingButton.append(svg(boundingBox));
  tools.append(devices, widthField, spacingButton);
  bar.append(crumbsNav, tools);

  // The frame sits on a stage that takes the chosen width, with a handle on each side.
  frameHost.classList.add("canvas-host");
  const stage = node("div", "canvas-stage");
  const handles = [-1, 1].map((side) => {
    const handle = node("div", `canvas-handle canvas-handle--${side < 0 ? "left" : "right"}`);
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-label", "Frame width");
    handle.tabIndex = 0;
    handle.append(node("span", "canvas-handle__grip"));
    handle.addEventListener("pointerdown", (event) => startDrag(event, side, handle));
    handle.addEventListener("keydown", (event) => nudge(event, side));
    return handle;
  });
  const sizePill = node("div", "canvas-size");
  sizePill.setAttribute("aria-hidden", "true");
  frame.replaceWith(stage);
  stage.append(handles[0], frame, handles[1], sizePill);

  let width: CanvasWidth = readStoredWidth(remembered(WIDTH_KEY));
  let spacing = remembered(SPACING_KEY) === "on";
  let dragging = false;
  let fromCanvas = false;

  // The canvas's room for a frame: its width less the gutters a framed width keeps.
  function available() {
    const gutter = parseFloat(getComputedStyle(frameHost).getPropertyValue("--canvas-gutter")) || 0;
    return frameHost.clientWidth - 2 * gutter;
  }
  // The width the frame has or is moving to (a transition may be under way):
  // a framed width as far as the canvas allows, else the whole canvas.
  function shownWidth() {
    return Math.round(width === "fill" ? frameHost.clientWidth : Math.min(width, available()));
  }
  function showWidth() {
    const shown = shownWidth();
    if (document.activeElement !== widthInput) widthInput.value = shown ? String(shown) : "";
    sizePill.textContent = `${shown} px`;
    for (const handle of handles) {
      handle.setAttribute("aria-valuenow", String(shown));
      handle.setAttribute("aria-valuetext", width === "fill" ? `${shown} pixels, fills the canvas` : `${shown} pixels`);
      handle.setAttribute("aria-valuemin", String(CANVAS_MIN_WIDTH));
      handle.setAttribute("aria-valuemax", String(Math.max(CANVAS_MIN_WIDTH, Math.round(available()))));
    }
  }
  function setWidth(next: CanvasWidth, store: boolean) {
    width = next;
    fromCanvas = true;
    try { setCurrentBreakpoint(next !== "fill" && next <= 390 ? "mobile" : next !== "fill" && next <= 768 ? "tablet" : "all"); }
    finally { fromCanvas = false; }
    const framed = next !== "fill";
    frameHost.classList.toggle("is-framed", framed);
    stage.style.width = framed ? `${next}px` : "";
    const device = deviceFor(next);
    for (const [id, control] of deviceButtons) control.setAttribute("aria-pressed", String(id === device));
    bar.dataset.device = device ?? "custom";
    if (store) remember(WIDTH_KEY, framed ? String(next) : "fill");
    showWidth();
  }
  function setSpacing(on: boolean) {
    spacing = on;
    spacingButton.setAttribute("aria-pressed", String(on));
    remember(SPACING_KEY, on ? "on" : "off");
    handlers.onSpacing(on);
  }
  spacingButton.addEventListener("click", () => setSpacing(!spacing));

  function applyTyped() {
    const typed = Number(widthInput.value.trim().replace(/px$/i, ""));
    if (widthInput.value.trim() && Number.isFinite(typed) && typed > 0) setWidth(settleWidth(typed, available()), true);
    else showWidth();
  }
  widthInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyTyped();
      widthInput.select();
    } else if (event.key === "Escape") {
      event.preventDefault();
      widthInput.value = String(shownWidth());
      widthInput.blur();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
      setWidth(settleWidth(shownWidth() + step, available()), true);
      widthInput.value = String(shownWidth());
    }
  });
  widthInput.addEventListener("focus", () => widthInput.select());
  widthInput.addEventListener("blur", applyTyped);

  // Dragging a handle: both edges move, so the width changes by twice the pointer's travel.
  function startDrag(event: PointerEvent, side: number, handle: HTMLElement) {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });
    const startX = event.clientX;
    const startWidth = shownWidth();
    dragging = true;
    frameHost.classList.add("is-resizing");
    const move = (moved: PointerEvent) => {
      const next = settleWidth(startWidth + side * 2 * (moved.clientX - startX), available());
      if (next !== width) setWidth(next, false);
    };
    const end = () => {
      dragging = false;
      frameHost.classList.remove("is-resizing");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setWidth(width, true);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }
  function nudge(event: KeyboardEvent, side: number) {
    const step = event.shiftKey ? 50 : 10;
    let next: CanvasWidth | undefined;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") next = settleWidth(shownWidth() + (event.key === "ArrowRight" ? side : -side) * step, available());
    else if (event.key === "Home") next = CANVAS_MIN_WIDTH;
    else if (event.key === "End") next = "fill";
    if (next === undefined) return;
    event.preventDefault();
    setWidth(next, true);
  }

  // The width shown follows the canvas while it resizes (panes, window, transitions).
  const observer = new ResizeObserver(() => {
    if (!dragging) showWidth();
    else sizePill.textContent = `${shownWidth()} px`;
  });
  observer.observe(stage);
  observer.observe(frameHost);

  // The breadcrumb: the page's <body>, then the selection's ancestors, then the selection.
  function setCrumbs(crumbs: CanvasCrumb[]) {
    const items: { label: string; kind: CanvasCrumb["kind"] | "page"; index: number }[] = [
      { label: "body", kind: "page", index: -1 },
      ...crumbs.map((crumb, index) => ({ ...crumb, index })),
    ];
    crumbList.replaceChildren(...items.map((item, at) => {
      const li = node("li", "canvas-crumbs__item");
      if (at) {
        const separator = node("span", "canvas-crumbs__separator", "›");
        separator.setAttribute("aria-hidden", "true");
        li.append(separator);
      }
      const crumb = node("button", `canvas-crumb canvas-crumb--${item.kind}`, item.label);
      crumb.type = "button";
      const last = at === items.length - 1;
      if (last) crumb.setAttribute("aria-current", "true");
      crumb.title = item.index < 0
        ? "Select nothing: the page's body"
        : last ? "The selected element (Esc or Ctrl/⌘+↑ selects its parent)" : `Select this ${item.kind === "component" ? "component" : "element"}`;
      crumb.addEventListener("click", () => handlers.onCrumb(item.index));
      crumb.addEventListener("pointerenter", () => handlers.onCrumbHover(item.index));
      crumb.addEventListener("pointerleave", () => handlers.onCrumbHover(undefined));
      crumb.addEventListener("focus", () => handlers.onCrumbHover(item.index));
      crumb.addEventListener("blur", () => handlers.onCrumbHover(undefined));
      li.append(crumb);
      return li;
    }));
    // The selection stays in view; the outer ancestors fade off the start.
    crumbsNav.scrollLeft = crumbsNav.scrollWidth;
    crumbsNav.classList.toggle("is-clipped", crumbsNav.scrollWidth > crumbsNav.clientWidth + 1);
  }
  crumbsNav.addEventListener("scroll", () => crumbsNav.classList.toggle("is-clipped", crumbsNav.scrollLeft > 1));

  const unsubscribeBreakpoint = subscribeBreakpoint((value) => {
    if (!fromCanvas) setWidth(widthFor(value === "all" ? "desktop" : value), true);
  });
  setWidth(width, false);
  spacingButton.setAttribute("aria-pressed", String(spacing));
  setCrumbs([]);

  return {
    bar,
    setCrumbs,
    /** The overlay state the runtime needs again after it (re)loads. */
    spacing: () => spacing,
    destroy() {
      observer.disconnect();
      unsubscribeBreakpoint();
    },
  };
}
