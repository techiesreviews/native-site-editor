import { button, node } from "../ui/dom";
import type { AgentRequest } from "../../shared/agent";
import type { SelectionRect } from "./edit-bar";
import "./agent-pins.css";

// Pins: a numbered marker over the preview on the element of each request
// to agents the user has not dismissed (Ask agent in the edit bar,
// src/components/agent-menu.ts). They are the editor's overlays, drawn over
// the frame like the edit bar and never part of the page or its drafts. The
// preview runtime finds each request's element on the page shown and
// reports its frame-viewport rectangle whenever it may have moved (scroll,
// resize, render); a pin whose element is gone stays at its last spot,
// marked detached, and requests on other pages (or never found) are listed
// in a tray in the corner. A pin opens the request: its text, the agent's
// reply, and Dismiss (Clear once answered).
//
// A pin stands where Ask agent's note stood: above its element's top-left
// corner, its small bottom-left corner pointing at the element (hanging
// under the element's top edge when the frame has no room above it), and
// the pins of one element line up left to right. A new pin pops in, and
// again when the agent is done; while an agent works on a request its
// element has a marching outline, drawn solid as it finishes. Hovering or
// focusing a pin shows the request's first line.

/** A request as the tab polls it: its element without the source. */
export type PinRequest = Pick<AgentRequest, "id" | "text" | "state" | "createdAt" | "reply"> & {
  element: Pick<AgentRequest["element"], "file" | "route" | "id" | "tag" | "selector" | "host">;
};

/** Where the runtime looks for a pin's element (native-preview-runtime.js `locatePin`). */
export interface PinLocator {
  id: string;
  route?: string;
  path: string;
  node?: number[];
  tag: string;
  selector?: string;
  host?: { tag: string; selector: string };
}

interface PinHandlers {
  /** The pins to look for on the page shown. */
  locate(pins: PinLocator[]): void;
  onDismiss(id: string): void;
  /** Show the page a request is on. */
  onShowPage(route: string): void;
  /** The pins moved or changed (the edit bar keeps clear of the selection's). */
  onLayout?(): void;
}

const stateLabels: Record<string, string> = {
  open: "Waiting for an agent",
  seen: "An agent is on it",
  done: "Done",
  answered: "Answered",
};

/** Space between an element's top edge and the notes on it. */
export const NOTE_GAP = 4;
/** A pin's height, and Ask agent's note's on one line. */
export const PIN_HEIGHT = 22;
// Between two pins of one element.
const STACK_GAP = 3;
// A request's pin pops in when it shows up this soon after it was asked.
const FRESH = 5000;
// The pop, and the finished outline's fade (agent-pins.css).
const POP_MS = 600;
const FADE_MS = 900;

/**
 * Where the notes on an element start, in frame coordinates: its left edge
 * kept inside the frame, and its top edge, which the notes stand above or,
 * with no room at the top of the frame, hang under (`below`).
 */
export function noteAnchor(rect: SelectionRect, frame: { width: number; height: number }) {
  const edge = Math.max(0, Math.min(rect.top, frame.height));
  return {
    x: Math.max(4, Math.min(rect.left, frame.width - 4 - PIN_HEIGHT)),
    edge,
    below: edge - NOTE_GAP - PIN_HEIGHT < 4,
  };
}
/** The top of a note `height` tall at `anchor`. */
export function noteTop(anchor: ReturnType<typeof noteAnchor>, height: number) {
  return anchor.below ? anchor.edge + NOTE_GAP : anchor.edge - NOTE_GAP - height;
}
const sameRect = (a: SelectionRect, b: SelectionRect) =>
  Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;

const SVG = "http://www.w3.org/2000/svg";

export function createAgentPins(pane: HTMLElement, frame: HTMLElement, handlers: PinHandlers) {
  const layer = node("div", "agent-pins");
  layer.setAttribute("aria-label", "Requests to agents");
  const tray = button("", () => toggleTray(), "agent-pins__tray");
  tray.hidden = true;
  tray.setAttribute("aria-haspopup", "dialog");
  const card = node("div", "agent-pin-card");
  card.setAttribute("role", "dialog");
  card.hidden = true;
  pane.append(layer, tray, card);

  let requests: PinRequest[] = [];
  let route = "";
  // Frame-viewport rectangles as last reported, and the last one each pin had
  // on this page (where a pin whose element is gone stays).
  const rects = new Map<string, SelectionRect | null>();
  const lastRects = new Map<string, SelectionRect>();
  const pins = new Map<string, HTMLButtonElement>();
  // The outlines of the elements agents work on, or just finished.
  const outlines = new Map<string, SVGSVGElement>();
  // Each request's state as last told, and those whose pin pops (or whose
  // outline finishes) when next shown: new ones, and ones just done.
  const states = new Map<string, string>();
  const pops = new Set<string>();
  const finishing = new Set<string>();
  let openId: string | undefined;
  let openFromTray = false;
  let sent = "";

  function geometry() {
    const frameRect = frame.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    return { frameRect, left: frameRect.left - paneRect.left, top: frameRect.top - paneRect.top };
  }
  const numberOf = (id: string) => requests.findIndex((item) => item.id === id) + 1;
  // On the page shown and found now, or found here before.
  const placed = (request: PinRequest) =>
    request.element.route === route ? rects.get(request.id) ?? lastRects.get(request.id) : undefined;
  // A pin's width without the request's line, which grows on hover.
  const restingWidth = (pin: HTMLElement) =>
    pin.offsetWidth - (pin.querySelector<HTMLElement>(".agent-pin__text")?.offsetWidth ?? 0);

  function makePin(id: string) {
    const pin = button("", () => toggle(id), "agent-pin");
    pin.setAttribute("aria-haspopup", "dialog");
    const status = node("span", "agent-pin__status");
    const text = node("span", "agent-pin__text");
    status.setAttribute("aria-hidden", "true");
    text.setAttribute("aria-hidden", "true");
    pin.append(node("span", "agent-pin__number"), status, text);
    return pin;
  }
  // Number, state mark and first line, each set only when it changed so a
  // spinning mark keeps turning across polls.
  function paintPin(pin: HTMLButtonElement, request: PinRequest, number: number) {
    const [numberSpan, status, text] = pin.children as HTMLCollectionOf<HTMLElement>;
    if (numberSpan.textContent !== String(number)) numberSpan.textContent = String(number);
    if (pin.dataset.state !== request.state) {
      pin.dataset.state = request.state;
      status.replaceChildren(
        request.state === "seen" ? node("span", "agent-pin__spinner")
          : document.createTextNode(request.state === "done" ? "✓" : request.state === "answered" ? "…" : ""),
      );
    }
    const line = request.text.split("\n")[0].trim();
    if (text.textContent !== line) text.textContent = line;
  }
  function pop(pin: HTMLElement) {
    pin.classList.remove("is-popping");
    void pin.offsetWidth;
    pin.classList.add("is-popping");
    setTimeout(() => pin.classList.remove("is-popping"), POP_MS);
  }

  // The outline on an element an agent works on: marching while it does,
  // solid for a moment once it is done, then gone.
  function outline(id: string, rect: SelectionRect | undefined, working: boolean) {
    let box = outlines.get(id);
    const done = finishing.has(id) && rect;
    if (done) {
      finishing.delete(id);
      box ??= makeOutline(id);
      box.classList.add("is-done");
      const fading = box;
      setTimeout(() => {
        fading.remove();
        if (outlines.get(id) === fading) outlines.delete(id);
      }, FADE_MS);
    }
    if (!rect || !working && !box?.classList.contains("is-done")) {
      box?.remove();
      outlines.delete(id);
      return;
    }
    box ??= makeOutline(id);
    Object.assign(box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    box.setAttribute("width", String(rect.width));
    box.setAttribute("height", String(rect.height));
    const shape = box.firstElementChild!;
    shape.setAttribute("width", String(Math.max(0, rect.width - 1.5)));
    shape.setAttribute("height", String(Math.max(0, rect.height - 1.5)));
  }
  function makeOutline(id: string) {
    const box = document.createElementNS(SVG, "svg");
    box.classList.add("agent-pin-outline");
    box.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS(SVG, "rect");
    shape.setAttribute("x", "0.75");
    shape.setAttribute("y", "0.75");
    shape.setAttribute("rx", "2");
    box.append(shape);
    layer.prepend(box);
    outlines.set(id, box);
    return box;
  }

  function layout() {
    const { frameRect, left, top } = geometry();
    Object.assign(layer.style, { left: `${left}px`, top: `${top}px`, width: `${frameRect.width}px`, height: `${frameRect.height}px` });
    const elsewhere: PinRequest[] = [];
    const seen = new Set<string>();
    // The pins of one element line up from its anchor, oldest first.
    const rows: { rect: SelectionRect; offset: number }[] = [];
    for (const request of requests) {
      const rect = placed(request);
      if (!rect) {
        elsewhere.push(request);
        continue;
      }
      seen.add(request.id);
      let pin = pins.get(request.id);
      if (!pin) {
        pin = makePin(request.id);
        pins.set(request.id, pin);
        layer.append(pin);
      }
      const number = numberOf(request.id);
      paintPin(pin, request, number);
      pin.dataset.request = request.id;
      const detached = !rects.get(request.id);
      pin.classList.toggle("is-detached", detached);
      pin.setAttribute("aria-label", `Request ${number}: ${stateLabels[request.state] ?? request.state}${detached ? ", its element is gone" : ""}`);
      pin.setAttribute("aria-expanded", String(openId === request.id && !openFromTray));
      pin.hidden = rect.bottom < 0 || rect.top > frameRect.height;
      const anchor = noteAnchor(rect, frameRect);
      let row = rows.find((item) => sameRect(item.rect, rect));
      if (!row) rows.push(row = { rect, offset: 0 });
      pin.classList.toggle("is-below", anchor.below);
      pin.style.left = `${anchor.x + row.offset}px`;
      pin.style.top = `${noteTop(anchor, PIN_HEIGHT)}px`;
      if (!pin.hidden) row.offset += restingWidth(pin) + STACK_GAP;
      if (!pin.hidden && pops.delete(request.id)) pop(pin);
      outline(request.id, detached || pin.hidden ? undefined : rect, request.state === "seen");
    }
    for (const [id, pin] of pins)
      if (!seen.has(id)) {
        pin.remove();
        pins.delete(id);
      }
    for (const [id, box] of outlines)
      if (!seen.has(id)) {
        box.remove();
        outlines.delete(id);
      }
    tray.hidden = !elsewhere.length;
    tray.textContent = `${elsewhere.length} request${elsewhere.length === 1 ? "" : "s"} elsewhere`;
    tray.title = "Requests to agents on other pages, or whose element is not on the page";
    tray.style.left = `${left + frameRect.width - 12}px`;
    tray.style.top = `${top + frameRect.height - 12}px`;
    if (openFromTray && openId) renderTray(elsewhere);
    else if (openId) {
      const request = requests.find((item) => item.id === openId);
      const pin = pins.get(openId);
      if (!request || !pin || pin.hidden) close(false);
      else renderCard(request);
    }
    handlers.onLayout?.();
  }

  function close(restoreFocus: boolean) {
    const anchor = openFromTray ? tray : openId ? pins.get(openId) : undefined;
    card.hidden = true;
    card.replaceChildren();
    openId = undefined;
    openFromTray = false;
    tray.setAttribute("aria-expanded", "false");
    for (const pin of pins.values()) pin.setAttribute("aria-expanded", "false");
    if (restoreFocus) anchor?.focus();
  }
  function toggle(id: string) {
    if (openId === id && !openFromTray) {
      close(true);
      return;
    }
    openId = id;
    openFromTray = false;
    layout();
    card.querySelector<HTMLButtonElement>("button")?.focus();
  }
  function toggleTray() {
    if (openId && openFromTray) {
      close(true);
      return;
    }
    openId = "tray";
    openFromTray = true;
    tray.setAttribute("aria-expanded", "true");
    layout();
    card.querySelector<HTMLButtonElement>("button")?.focus();
  }

  // One request: whose it is, its state, the user's text and the reply.
  function requestBody(request: PinRequest, withPage: boolean) {
    const body = node("div", "agent-pin-card__request");
    body.dataset.state = request.state;
    const head = node("p", "agent-pin-card__head");
    head.append(node("span", `agent-pin-card__number agent-pin-card__number--${request.state}`, String(numberOf(request.id))), node("span", "agent-pin-card__state", stateLabels[request.state] ?? request.state));
    const where = request.element.route && request.element.route !== route ? ` on ${request.element.route}` : "";
    head.append(node("span", "agent-pin-card__where", `<${request.element.tag}>${where}`));
    body.append(head, node("p", "agent-pin-card__text", request.text));
    if (request.reply) {
      const reply = node("p", "agent-pin-card__reply");
      reply.append(node("strong", "", request.reply.status === "done" ? "Agent: " : "Agent replied: "), document.createTextNode(request.reply.message));
      body.append(reply);
    }
    const actions = node("div", "agent-pin-card__actions");
    const answered = request.state === "done" || request.state === "answered";
    const dismiss = button(answered ? "Clear" : "Dismiss", () => {
      close(false);
      handlers.onDismiss(request.id);
    }, "text-button agent-pin-card__dismiss");
    dismiss.title = answered ? "Remove this pin" : "Withdraw this request, so no agent works on it";
    if (withPage && request.element.route && request.element.route !== route) {
      const target = request.element.route;
      actions.append(button("Show page", () => {
        close(false);
        handlers.onShowPage(target);
      }, "text-button"));
    }
    actions.append(dismiss);
    body.append(actions);
    return body;
  }
  function renderCard(request: PinRequest) {
    const pin = pins.get(request.id);
    if (!pin) return;
    card.setAttribute("aria-label", `Request ${numberOf(request.id)}`);
    card.replaceChildren(requestBody(request, false));
    card.hidden = false;
    place(pin);
  }
  function renderTray(elsewhere: PinRequest[]) {
    if (!elsewhere.length) {
      close(false);
      return;
    }
    card.setAttribute("aria-label", "Requests elsewhere");
    card.replaceChildren(...elsewhere.map((request) => requestBody(request, true)));
    card.hidden = false;
    place(tray);
  }
  // Under its pin (above when it does not fit), inside the frame's width.
  function place(anchor: HTMLElement) {
    const { frameRect, left, top } = geometry();
    const paneRect = pane.getBoundingClientRect();
    const at = anchor.getBoundingClientRect();
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const x = Math.max(left + 8, Math.min(at.left - paneRect.left - 8, left + frameRect.width - width - 8));
    const below = at.bottom - paneRect.top + 6;
    const y = below + height <= top + frameRect.height - 8 ? below : Math.max(top + 8, at.top - paneRect.top - 6 - height);
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  }
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  });
  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node;
    if (card.hidden || card.contains(target) || tray.contains(target) || layer.contains(target)) return;
    close(false);
  }
  document.addEventListener("pointerdown", onPointerDown, true);
  const resize = new ResizeObserver(() => layout());
  resize.observe(frame);
  resize.observe(pane);

  function locate() {
    const locators: PinLocator[] = requests.map((request) => {
      const node = request.element.id.split(".").map(Number);
      return {
        id: request.id,
        route: request.element.route,
        path: request.element.file,
        ...(node.every((index) => Number.isInteger(index)) ? { node } : {}),
        tag: request.element.tag,
        ...(request.element.selector ? { selector: request.element.selector } : {}),
        ...(request.element.host ? { host: request.element.host } : {}),
      };
    });
    const key = JSON.stringify(locators);
    if (key === sent) return;
    sent = key;
    handlers.locate(locators);
  }

  return {
    /** The requests to show, oldest first, and the page the preview shows. */
    update(next: PinRequest[], shown: string) {
      requests = [...next].sort((a, b) => a.createdAt - b.createdAt);
      for (const request of requests) {
        const was = states.get(request.id);
        const finished = was !== undefined && was !== request.state && (request.state === "done" || request.state === "answered");
        // Just asked (not one found on opening the editor), or just finished.
        if (was === undefined ? Date.now() - request.createdAt < FRESH : finished) pops.add(request.id);
        if (finished && request.state === "done") finishing.add(request.id);
        states.set(request.id, request.state);
      }
      for (const id of states.keys())
        if (!requests.some((item) => item.id === id)) {
          states.delete(id);
          pops.delete(id);
          finishing.delete(id);
        }
      if (shown !== route) {
        route = shown;
        rects.clear();
        lastRects.clear();
      }
      for (const id of [...rects.keys()]) if (!requests.some((item) => item.id === id)) rects.delete(id);
      locate();
      layout();
    },
    /** The runtime's rectangles for the pins (null: not found on the page shown). */
    rects(list: { id: string; rect: SelectionRect | null }[]) {
      for (const { id, rect } of list) {
        rects.set(id, rect);
        if (rect) lastRects.set(id, rect);
      }
      layout();
    },
    /**
     * The pins on the element at `rect` (the selection): how far from its
     * anchor the next one goes (0: none there), and the number it will have.
     */
    row(rect: SelectionRect) {
      let offset = 0;
      for (const [id, pin] of pins) {
        const live = rects.get(id);
        if (live && !pin.hidden && sameRect(live, rect)) offset += restingWidth(pin) + STACK_GAP;
      }
      return { offset, next: requests.length + 1 };
    },
    /** The frame loaded again: it is told the pins afresh. */
    reset() {
      sent = "";
      locate();
    },
    destroy() {
      resize.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      layer.remove();
      tray.remove();
      card.remove();
    },
  };
}

export type AgentPins = ReturnType<typeof createAgentPins>;
