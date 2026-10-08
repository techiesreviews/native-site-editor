import { PIN_HEIGHT, noteAnchor, noteTop } from "./agent-pin-geometry";
export { NOTE_GAP, PIN_HEIGHT, noteAnchor, noteTop } from "./agent-pin-geometry";
import { guardChunkReload } from "../chunk-recovery";
import { button, node } from "../ui/dom";
import { REQUEST_TEXT_LIMIT, requestThread, type AgentRequest } from "../../shared/agent";
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
// in a tray in the corner. A pin opens the request's card: its
// conversation (what the user asked and answered, what agents replied), and
// Dismiss (Clear once answered). Hovering a pin opens the card for a look,
// after a moment so passing over pins shows nothing, and it closes once the
// pointer has left both pin and card; clicking the pin (or Enter on it)
// holds the card open, with the focus in it, until Esc, a click elsewhere
// or the pin again. The card opens right above its pin, left edges aligned,
// so it stays with the pin and clear of the element under it; below the pin
// when the frame has no room above.
//
// An agent's question needs the user: its pin turns orange with a "?" and
// the question itself (agents keep it to a few words), read without opening
// anything, and its card has a box for the answer, focused as a held card
// opens (typing in one looked at holds it), which sends the answer and
// opens the request for agents again. A question scrolled out of view is
// listed in the tray too, which counts the questions it holds. Done and
// answered requests turn grey, pin and card, so they recede.
//
// A pin stands where Ask agent's note stood: above its element's top-left
// corner, its small bottom-left corner pointing at the element (hanging
// under the element's top edge when the frame has no room above it), and
// the pins of one element line up left to right. A new pin pops in, and
// again when the agent is done, answers or asks; while an agent works on a request its
// element has a marching outline, drawn solid as it finishes. Focusing a pin
// from the keyboard shows the request's first line (a question's shows the
// question instead), and so does hovering one while another's card is held
// open.

/** A request as the tab polls it: its element without the source. */
export type PinRequest = Pick<AgentRequest, "id" | "text" | "state" | "createdAt" | "reply" | "thread"> & {
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
  /** The user's answer to an agent's question; rejects with what went wrong. */
  onAnswer(id: string, text: string): Promise<void>;
  /** Show the page a request is on. */
  onShowPage(route: string): void;
  /** Bring a request's element on the page shown into view. */
  onShowElement(id: string): void;
  /** The pins moved or changed (the edit bar keeps clear of the selection's). */
  onLayout?(): void;
}

const stateLabels: Record<string, string> = {
  open: "Waiting",
  seen: "Agent working",
  done: "Done",
  answered: "Agent answered",
  question: "Question",
};
const marks: Record<string, string> = { done: "✓", answered: "…", question: "?" };
// An agent's reply the user may see pop on the pin.
const replied = (state: string) => state === "done" || state === "answered" || state === "question";
// The question an agent asks the user, shown in its pin ("" when none).
const asking = (request: PinRequest) => request.state === "question" ? request.reply?.message.trim() ?? "" : "";

// Between two pins of one element.
const STACK_GAP = 3;
// A request's pin pops in when it shows up this soon after it was asked.
const FRESH = 5000;
// The pop, and the finished outline's fade (agent-pins.css).
const POP_MS = 600;
const FADE_MS = 900;
// The answer box grows with its text up to five lines (agent-pins.css).
const ANSWER_MAX_HEIGHT = 84;
// A hovered pin's card opens after this; one looked at closes this long after
// the pointer left pin and card.
const HOVER_OPEN = 120;
const HOVER_CLOSE = 200;
// Between a pin and its card, and the card and the frame's edges.
const CARD_GAP = 6;
const CARD_MARGIN = 8;
const sizesItself = typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");

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
  // Held open (clicked, or worked in), not just looked at while hovered; and
  // the hovered card's pending open or close.
  let held = false;
  let opening: ReturnType<typeof setTimeout> | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;
  let sent = "";
  // The card as last drawn (it is drawn again only when what it shows
  // changed), the answers being typed and the problems sending them, and a
  // request whose card opens once its pin shows (after Show).
  let cardKey = "";
  const drafts = new Map<string, string>();
  const releaseReloadGuard = guardChunkReload(() => [...drafts.values()].some((answer) => answer.length > 0));
  const problems = new Map<string, string>();
  let pending: string | undefined;
  // The pending request whose element was asked to scroll into view.
  let scrolledTo: string | undefined;

  function geometry() {
    const frameRect = frame.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    return { frameRect, left: frameRect.left - paneRect.left, top: frameRect.top - paneRect.top };
  }
  const numberOf = (id: string) => requests.findIndex((item) => item.id === id) + 1;
  // On the page shown and found now, or found here before.
  const placed = (request: PinRequest) =>
    request.element.route === route ? rects.get(request.id) ?? lastRects.get(request.id) : undefined;
  // A pin's width without the request's line, which grows on focus (a
  // question it shows counts).
  const restingWidth = (pin: HTMLElement) =>
    pin.offsetWidth - (pin.querySelector<HTMLElement>(".agent-pin__text")?.offsetWidth ?? 0);

  function makePin(id: string) {
    const pin = button("", () => toggle(id), "agent-pin");
    pin.setAttribute("aria-haspopup", "dialog");
    // A touch has no hover: its tap is the click.
    pin.addEventListener("pointerenter", (event) => { if (event.pointerType !== "touch") hover(id); });
    pin.addEventListener("pointerleave", (event) => { if (event.pointerType !== "touch") leave(); });
    const status = node("span", "agent-pin__status");
    const question = node("span", "agent-pin__question");
    const text = node("span", "agent-pin__text");
    status.setAttribute("aria-hidden", "true");
    question.setAttribute("aria-hidden", "true");
    text.setAttribute("aria-hidden", "true");
    pin.append(node("span", "agent-pin__number"), status, question, text);
    return pin;
  }
  // Number, state mark, the agent's question while it asks, and the first
  // line, each set only when it changed so a spinning mark keeps turning
  // across polls.
  function paintPin(pin: HTMLButtonElement, request: PinRequest, number: number) {
    const [numberSpan, status, question, text] = pin.children as HTMLCollectionOf<HTMLElement>;
    if (numberSpan.textContent !== String(number)) numberSpan.textContent = String(number);
    if (pin.dataset.state !== request.state) {
      pin.dataset.state = request.state;
      status.replaceChildren(
        request.state === "seen" ? node("span", "agent-pin__spinner") : document.createTextNode(marks[request.state] ?? ""),
      );
    }
    const asked = asking(request);
    if (question.textContent !== asked) question.textContent = asked;
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
    // The tray's: requests elsewhere, and questions out of view.
    const listed: PinRequest[] = [];
    const seen = new Set<string>();
    // The pins of one element line up from its anchor, oldest first.
    const rows: { rect: SelectionRect; offset: number }[] = [];
    for (const request of requests) {
      const rect = placed(request);
      if (!rect) {
        listed.push(request);
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
      const asked = asking(request);
      pin.setAttribute(
        "aria-label",
        `Request ${number}: ${stateLabels[request.state] ?? request.state}${asked ? `, ${asked}` : ""}${detached ? ", its element is gone" : ""}`,
      );
      pin.setAttribute("aria-expanded", String(openId === request.id && !openFromTray));
      pin.hidden = rect.bottom < 0 || rect.top > frameRect.height;
      const anchor = noteAnchor(rect, frameRect);
      let row = rows.find((item) => sameRect(item.rect, rect));
      if (!row) rows.push(row = { rect, offset: 0 });
      pin.classList.toggle("is-below", anchor.below);
      pin.style.left = `${anchor.x + row.offset}px`;
      pin.style.top = `${noteTop(anchor, PIN_HEIGHT)}px`;
      if (!pin.hidden) row.offset += restingWidth(pin) + STACK_GAP;
      else if (request.state === "question") listed.push(request);
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
    paintTray(listed);
    tray.style.left = `${left + frameRect.width - 12}px`;
    tray.style.top = `${top + frameRect.height - 12}px`;
    handlers.onLayout?.();
    layer.classList.toggle("is-holding", Boolean(openId && held));
    if (openFromTray && openId) renderTray(listed);
    else if (openId) {
      const request = requests.find((item) => item.id === openId);
      const pin = pins.get(openId);
      if (!request || !pin || pin.hidden) close(false);
      else renderCard(request);
    }
    const shown = pending ? pins.get(pending) : undefined;
    if (pending && shown && !shown.hidden) {
      const id = pending;
      pending = undefined;
      requestAnimationFrame(() => { if (openId !== id || !held) open(id, true); });
    } else if (pending && shown && rects.get(pending) && scrolledTo !== pending) {
      // Found on the page shown, out of view: brought into view first.
      scrolledTo = pending;
      handlers.onShowElement(pending);
    }
  }
  // "2 requests elsewhere", led by the questions waiting for the user.
  function paintTray(listed: PinRequest[]) {
    tray.hidden = !listed.length;
    const questions = listed.filter((request) => request.state === "question").length;
    const others = listed.length - questions;
    const parts: Node[] = [];
    if (questions) parts.push(node("span", "agent-pins__tray-questions", `${questions} question${questions === 1 ? "" : "s"}`));
    if (others) parts.push(document.createTextNode(`${questions ? " " : ""}${others} request${others === 1 ? "" : "s"} elsewhere`));
    const key = `${questions}/${others}`;
    if (tray.dataset.key !== key) {
      tray.dataset.key = key;
      tray.replaceChildren(...parts);
    }
    tray.classList.toggle("has-questions", questions > 0);
    tray.title = questions
      ? `Agents ask you ${questions === 1 ? "a question" : `${questions} questions`}; requests on other pages or out of view`
      : "Requests to agents on other pages, or whose element is not on the page";
  }

  function close(restoreFocus: boolean) {
    const anchor = openFromTray ? tray : openId ? pins.get(openId) : undefined;
    clearTimeout(opening);
    clearTimeout(closing);
    card.hidden = true;
    card.replaceChildren();
    cardKey = "";
    openId = undefined;
    openFromTray = false;
    held = false;
    layer.classList.remove("is-holding");
    tray.setAttribute("aria-expanded", "false");
    for (const pin of pins.values()) pin.setAttribute("aria-expanded", "false");
    if (restoreFocus) anchor?.focus();
  }
  // A request's card, held open (with the focus in it) or looked at.
  function open(id: string, hold: boolean) {
    clearTimeout(opening);
    clearTimeout(closing);
    openId = id;
    openFromTray = false;
    held = hold;
    tray.setAttribute("aria-expanded", "false");
    layout();
    if (hold) focusCard();
  }
  // A click on a pin holds its card open (the one looked at too), or closes it.
  function toggle(id: string) {
    if (openId === id && !openFromTray && held) close(true);
    else open(id, true);
  }
  // The card being worked in stays open when the pointer leaves.
  function hold() {
    if (!openId || held) return;
    held = true;
    clearTimeout(closing);
    layer.classList.add("is-holding");
  }
  // Hovering a pin opens its card after a moment (switching from the one
  // looked at), unless a card is held open.
  function hover(id: string) {
    clearTimeout(opening);
    clearTimeout(closing);
    if (held || openId === id && !openFromTray) return;
    opening = setTimeout(() => open(id, false), HOVER_OPEN);
  }
  // The pointer left a pin or the card: the card looked at closes unless it
  // comes back to either (the card stands next to its pin, so a moment
  // covers the way between them).
  function leave() {
    clearTimeout(opening);
    if (!openId || held) return;
    clearTimeout(closing);
    closing = setTimeout(() => close(false), HOVER_CLOSE);
  }
  // A question's answer box, else the card's first button.
  function focusCard() {
    (card.querySelector<HTMLElement>(".agent-pin-card__answer-input") ?? card.querySelector<HTMLButtonElement>("button"))?.focus();
  }
  function toggleTray() {
    if (openId && openFromTray) {
      close(true);
      return;
    }
    clearTimeout(opening);
    clearTimeout(closing);
    openId = "tray";
    openFromTray = true;
    held = true;
    tray.setAttribute("aria-expanded", "true");
    layout();
    focusCard();
  }

  // One request as a small conversation: where it is and its state, then
  // what the user said and what agents replied, the answer box while an
  // agent asks, and its actions.
  function requestBody(request: PinRequest, inTray: boolean) {
    const body = node("div", "agent-pin-card__request");
    body.dataset.state = request.state;
    const head = node("p", "agent-pin-card__head");
    const where = request.element.route && request.element.route !== route ? ` on ${request.element.route}` : "";
    head.append(
      node("span", "agent-pin-card__where", `<${request.element.tag}>${where}`),
      node("span", "agent-pin-card__state", stateLabels[request.state] ?? request.state),
    );
    const thread = node("div", "agent-pin-card__thread");
    const messages = requestThread(request);
    messages.forEach((message, index) => {
      const row = node("div", "agent-pin-card__message");
      row.dataset.from = message.from;
      // The question the user is to answer is the last message.
      if (request.state === "question" && index === messages.length - 1 && message.from === "agent") row.classList.add("is-question");
      row.append(node("span", "agent-pin-card__from", message.from === "user" ? "You" : "Agent"), node("p", "agent-pin-card__bubble", message.text));
      thread.append(row);
    });
    body.append(head, thread);
    if (request.state === "question") body.append(answerBox(request));
    const actions = node("div", "agent-pin-card__actions");
    const answered = request.state === "done" || request.state === "answered";
    const dismiss = button(answered ? "Clear" : "Dismiss", () => {
      close(false);
      handlers.onDismiss(request.id);
    }, "text-button agent-pin-card__dismiss");
    dismiss.title = answered ? "Remove this pin" : "Withdraw this request, so no agent works on it";
    if (inTray && request.element.route && request.element.route !== route) {
      const target = request.element.route;
      actions.append(button("Show page", () => {
        close(false);
        pending = request.id;
        scrolledTo = undefined;
        handlers.onShowPage(target);
      }, "text-button"));
    } else if (inTray && rects.get(request.id)) {
      // A question on this page, scrolled out of view.
      actions.append(button("Show", () => {
        close(false);
        pending = scrolledTo = request.id;
        handlers.onShowElement(request.id);
      }, "text-button"));
    }
    actions.append(dismiss);
    body.append(actions);
    return body;
  }
  // The answer to an agent's question: a box that grows with its text, Enter
  // sends it and Shift+Enter starts a new line (Esc closes the card).
  function answerBox(request: PinRequest) {
    const box = node("div", "agent-pin-card__answer");
    const input = document.createElement("textarea");
    input.className = "agent-pin-card__answer-input";
    input.rows = 1;
    input.placeholder = "Answer…";
    input.maxLength = REQUEST_TEXT_LIMIT;
    input.setAttribute("aria-label", "Answer the agent");
    input.dataset.request = request.id;
    input.value = drafts.get(request.id) ?? "";
    const error = node("p", "agent-pin-card__error", problems.get(request.id) ?? "");
    error.setAttribute("role", "alert");
    error.hidden = !error.textContent;
    input.addEventListener("input", () => {
      drafts.set(request.id, input.value);
      fit(input);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      void sendAnswer(request.id, input);
    });
    box.append(input, error);
    requestAnimationFrame(() => fit(input));
    return box;
  }
  function fit(input: HTMLTextAreaElement) {
    if (sizesItself) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, ANSWER_MAX_HEIGHT)}px`;
  }
  async function sendAnswer(id: string, input: HTMLTextAreaElement) {
    const text = input.value.trim();
    if (!text || input.readOnly) return;
    input.readOnly = true;
    input.closest(".agent-pin-card__answer")?.classList.add("is-sending");
    problems.delete(id);
    try {
      await handlers.onAnswer(id, text);
    } catch (error) {
      problems.set(id, (error as Error).message || "The answer could not be sent.");
      input.readOnly = false;
      input.closest(".agent-pin-card__answer")?.classList.remove("is-sending");
      cardKey = "";
      layout();
      card.querySelector<HTMLTextAreaElement>(`.agent-pin-card__answer-input[data-request="${id}"]`)?.focus();
      return;
    }
    drafts.delete(id);
    // Sent: the card closes onto its pin, open again for agents.
    if (openId === id || openFromTray) close(true);
  }
  // The card is drawn again only when what it shows changed, keeping the
  // answer being typed and its focus.
  function draw(key: string, content: () => Node[]) {
    if (key === cardKey) return;
    cardKey = key;
    const focused = document.activeElement instanceof HTMLTextAreaElement && card.contains(document.activeElement)
      ? document.activeElement.dataset.request
      : undefined;
    card.replaceChildren(...content());
    const input = focused ? card.querySelector<HTMLTextAreaElement>(`.agent-pin-card__answer-input[data-request="${focused}"]`) : null;
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  function renderCard(request: PinRequest) {
    const pin = pins.get(request.id);
    if (!pin) return;
    card.setAttribute("aria-label", `Request ${numberOf(request.id)}`);
    card.dataset.state = request.state;
    draw(JSON.stringify([request, route, problems.get(request.id)]), () => [requestBody(request, false)]);
    card.hidden = false;
    atPin(pin);
  }
  function renderTray(listed: PinRequest[]) {
    if (!listed.length) {
      close(false);
      return;
    }
    card.setAttribute("aria-label", "Requests elsewhere");
    delete card.dataset.state;
    draw(JSON.stringify([listed, route, [...problems]]), () => listed.map((request) => requestBody(request, true)));
    card.hidden = false;
    place(tray);
  }
  // A request's card right above its pin, left edges aligned: the pin
  // stands above its element, so the card does not cover it. Below the pin
  // when the frame has no room above, and inside the frame's width.
  function atPin(pin: HTMLElement) {
    const { frameRect, left, top } = geometry();
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const x = Math.max(CARD_MARGIN, Math.min(pin.offsetLeft, frameRect.width - CARD_MARGIN - width));
    const above = pin.offsetTop - CARD_GAP - height;
    const fits = above >= CARD_MARGIN;
    card.dataset.side = fits ? "above" : "below";
    card.style.left = `${left + x}px`;
    card.style.top = `${top + (fits ? above : pin.offsetTop + pin.offsetHeight + CARD_GAP)}px`;
  }
  // The tray's card: under its anchor (above when it does not fit, as in the
  // tray's corner), inside the frame's width.
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
  // Esc closes the card, from inside it or from its pin.
  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !openId || !card.contains(event.target as Node) && openFromTray) return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };
  card.addEventListener("keydown", onEscape);
  layer.addEventListener("keydown", onEscape);
  // Pointing at the card keeps the one looked at open; clicking or typing in
  // it holds it.
  card.addEventListener("pointerenter", () => clearTimeout(closing));
  card.addEventListener("pointerleave", (event) => { if (event.pointerType !== "touch") leave(); });
  card.addEventListener("pointerdown", hold);
  card.addEventListener("focusin", hold);
  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node;
    if (card.hidden || card.contains(target) || tray.contains(target) || layer.contains(target)) return;
    close(false);
  }
  document.addEventListener("pointerdown", onPointerDown, true);
  const resize = new ResizeObserver(() => layout());
  resize.observe(frame);
  resize.observe(pane);
  // A card growing (an answer being typed) may need the other side of its pin.
  resize.observe(card);

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
        const finished = was !== undefined && was !== request.state && replied(request.state);
        // Just asked (not one found on opening the editor), or just replied to.
        if (was === undefined ? Date.now() - request.createdAt < FRESH : finished) pops.add(request.id);
        if (finished && request.state === "done") finishing.add(request.id);
        states.set(request.id, request.state);
      }
      for (const id of states.keys())
        if (!requests.some((item) => item.id === id)) {
          states.delete(id);
          pops.delete(id);
          finishing.delete(id);
          drafts.delete(id);
          problems.delete(id);
        }
      if (shown !== route) {
        route = shown;
        rects.clear();
        lastRects.clear();
      }
      for (const id of [...rects.keys()]) if (!requests.some((item) => item.id === id)) rects.delete(id);
      locate();
      // With no request and nothing of one on show there is nothing to place:
      // the layout's box reads would force a layout of the whole editor on
      // every preview update (several while a file opens).
      if (!requests.length && !pins.size && !outlines.size && tray.hidden && card.hidden && !openId) return;
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
    /**
     * Show a request (from the project selector's list of what agents wait
     * on): its page, then its element scrolled into view, and its card held
     * open with the focus in it (the answer box of a question). A request
     * whose element is not on its page opens the tray.
     */
    show(id: string) {
      const request = requests.find((item) => item.id === id);
      if (!request) return;
      close(false);
      const pin = pins.get(id);
      if (request.element.route && request.element.route !== route) {
        pending = id;
        scrolledTo = undefined;
        handlers.onShowPage(request.element.route);
      } else if (pin && !pin.hidden) open(id, true);
      else if (rects.get(id)) {
        pending = scrolledTo = id;
        handlers.onShowElement(id);
      } else if (!tray.hidden) toggleTray();
    },
    /** The frame loaded again: it is told the pins afresh. */
    reset() {
      sent = "";
      locate();
    },
    destroy() {
      releaseReloadGuard();
      clearTimeout(opening);
      clearTimeout(closing);
      resize.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      layer.remove();
      tray.remove();
      card.remove();
    },
  };
}

export type AgentPins = ReturnType<typeof createAgentPins>;
