import { button, node } from "../ui/dom";
import { spotlightLayout, type Box, type Side } from "./spotlight-layout";
import "./spotlight.css";

// A spotlight: dims the page, highlights one element (a ring cut out of the
// dimmed page) and shows a callout beside it with an arrow, a title, some
// text and buttons. Escape and a click outside close it; focus moves to the
// callout and goes back to where it was. A target that is missing, hidden or
// off-screen gets a centred dialog instead; it follows resizes and scrolls.
// Where the callout goes is pure geometry in spotlight-layout.ts.

export interface SpotlightAction {
  label: string;
  primary?: boolean;
  /** Runs after the spotlight has closed (and focus has gone back). */
  run?: () => void;
}

export interface SpotlightOptions {
  title: string;
  /** Paragraphs: strings or elements (a <strong> in a line, say). */
  text: (string | Node)[] | string | Node;
  actions: SpotlightAction[];
  /** The spotlight closed, by an action, Escape, a click outside or `close()`. */
  onClose?: () => void;
}

export type SpotlightTarget = Element | null | undefined | (() => Element | null | undefined);

const MARGIN = 12;
let current: { close: () => void } | undefined;

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function spotlight(target: SpotlightTarget, options: SpotlightOptions) {
  // One at a time.
  current?.close();
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const find = () => (typeof target === "function" ? target() : target) ?? null;

  const root = node("div", "spotlight");
  root.popover = "manual";
  const hole = node("div", "spotlight__hole");
  const callout = node("div", "spotlight__callout");
  callout.setAttribute("role", "dialog");
  callout.setAttribute("aria-modal", "true");
  callout.tabIndex = -1;
  const heading = node("h2", "spotlight__title", options.title);
  heading.id = `spotlight-title-${Math.random().toString(36).slice(2, 8)}`;
  callout.setAttribute("aria-labelledby", heading.id);
  const body = node("div", "spotlight__text");
  const paragraphs = Array.isArray(options.text) ? options.text : [options.text];
  for (const paragraph of paragraphs) {
    const line = node("p", "spotlight__line");
    line.append(paragraph);
    body.append(line);
  }
  const arrow = node("span", "spotlight__arrow");
  arrow.setAttribute("aria-hidden", "true");
  const row = node("div", "spotlight__actions");
  let closed = false;
  for (const action of options.actions) {
    const item = button(action.label, () => close(action.run), action.primary ? "button primary" : "button secondary");
    row.append(item);
  }
  callout.append(arrow, heading, body, row);
  root.append(hole, callout);

  function place() {
    if (closed) return;
    const element = find();
    let box: Box | null = null;
    if (element?.isConnected) {
      const rect = element.getBoundingClientRect();
      box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
    const viewport = { width: document.documentElement.clientWidth || innerWidth, height: innerHeight };
    const width = Math.min(360, viewport.width - 2 * MARGIN);
    callout.style.width = `${width}px`;
    const layout = spotlightLayout(box, { width, height: callout.offsetHeight || 200 }, viewport, { margin: MARGIN });
    root.dataset.mode = layout.mode;
    callout.style.left = `${layout.left}px`;
    callout.style.top = `${layout.top}px`;
    if (layout.mode === "target") {
      hole.hidden = false;
      hole.style.left = `${layout.hole.left}px`;
      hole.style.top = `${layout.hole.top}px`;
      hole.style.width = `${layout.hole.width}px`;
      hole.style.height = `${layout.hole.height}px`;
      callout.dataset.side = layout.side satisfies Side;
      const vertical = layout.side === "left" || layout.side === "right";
      arrow.style.setProperty(vertical ? "--arrow-top" : "--arrow-left", `${layout.arrow}px`);
    } else {
      hole.hidden = true;
      delete callout.dataset.side;
    }
  }

  const reposition = () => place();
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      // Keep the focus in the callout.
      const stops = [callout, ...callout.querySelectorAll<HTMLElement>("button:not(:disabled)")];
      const index = stops.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? stops.length - 1 : index - 1) : index === stops.length - 1 ? 0 : index + 1;
      event.preventDefault();
      stops[next].focus();
    }
  };
  const outside = (event: Event) => {
    if (!callout.contains(event.target as Node)) close();
  };
  let observer: ResizeObserver | undefined;

  function close(after?: () => void) {
    if (closed) return;
    closed = true;
    if (current?.close === close) current = undefined;
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
    document.removeEventListener("keydown", keydown, true);
    observer?.disconnect();
    if (root.matches(":popover-open")) root.hidePopover();
    root.remove();
    if (previous?.isConnected) previous.focus();
    options.onClose?.();
    after?.();
  }
  current = { close };

  // A target a little way off-screen is scrolled into view first.
  const element = find();
  if (element instanceof HTMLElement && element.isConnected) element.scrollIntoView({ block: "nearest", inline: "nearest" });
  root.classList.toggle("is-still", reducedMotion());
  document.body.append(root);
  root.showPopover();
  place();
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
  document.addEventListener("keydown", keydown, true);
  root.addEventListener("pointerdown", outside);
  if (typeof ResizeObserver === "function") {
    observer = new ResizeObserver(reposition);
    observer.observe(callout);
    if (element) observer.observe(element);
  }
  callout.focus({ preventScroll: true });
  // The callout's height is known once it has text and fonts: place it again.
  requestAnimationFrame(place);

  return {
    root,
    close: () => close(),
    /** Places it again (the target moved without the window changing). */
    update: place,
  };
}
