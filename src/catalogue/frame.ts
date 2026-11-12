// Frames: a part or mock-up drawn in its own page, so a menu, a dialog or a phone width has its own top layer, ids,
// fixed positions and window width. On the board a frame is an <iframe> whose document is written inline (`srcdoc`),
// as the editor's preview frame is. A fixed state cell's frame is inert (pointer and wheel go to the board); a live
// one works, its wheel handed on to the board so it still zooms and pans there. The editor's pages refuse to be
// framed (`frame-ancestors 'none'`, public/_headers), and an inline document has no response for that rule to apply
// to. It loads this page's own stylesheets and entry script, reads what to show from its <iframe>'s `data-frame`, and
// redraws when the board sets new options on `data-values`; a live frame shows the board's Tweak edits from
// `data-tweaks` (CSS for this page alone). The same page opened at
// catalogue.html?frame=<part> or ?mockup=<id> (&theme=dark&v=<options>&live=1) shows one frame on its own, as a link;
// `mockup=` also names the editor's own screens (screens.ts).
import { MOCKUPS, type Mockup } from "./mockups";
import { SCREENS } from "./screens";
import { PARTS, isPart, type Part, type Values } from "./parts";

export type Theme = "light" | "dark";
/** `live`: the part works (clicks, hover, keyboard) and starts as the editor shows it; otherwise an inert picture. */
export interface FrameRequest { kind: "frame" | "mockup"; id: string; theme: Theme; values: Values; width: number; height: number; live?: boolean }

/** The query a frame reads: the same as a frame's own link. */
export function frameQuery(request: Omit<FrameRequest, "height" | "width">): string {
  const params = new URLSearchParams({ [request.kind]: request.id, theme: request.theme });
  if (Object.keys(request.values).length) params.set("v", JSON.stringify(request.values));
  if (request.live) params.set("live", "1");
  return params.toString();
}

/** Where a point in a frame's page lies on the board's page: the frame's place there, scaled by the board's zoom. */
export function boardPoint(box: { left: number; top: number; width: number }, frameWidth: number, point: { x: number; y: number }) {
  const scale = frameWidth && box.width ? box.width / frameWidth : 1;
  return { x: box.left + point.x * scale, y: box.top + point.y * scale };
}

const escapeAttribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
/** The inline document of every frame: this page's stylesheets and entry script. */
function frameDocument(doc: Document): string {
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'), (link) => `<link rel="stylesheet" href="${escapeAttribute(link.href)}">`);
  const scripts = Array.from(doc.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'));
  const entry = scripts.find((script) => /catalogue/.test(script.src)) ?? scripts.at(-1);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${links.join("")}${entry ? `<script type="module" src="${escapeAttribute(entry.src)}"></script>` : ""}</head><body></body></html>`;
}

/** The frame a board cell shows: sized, and inert unless it is live. */
export function frameElement(request: FrameRequest, label: string): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.className = request.live ? "cat-iframe cat-iframe--live" : "cat-iframe";
  frame.title = label;
  if (!request.live) {
    frame.inert = true;
    frame.tabIndex = -1;
  }
  frame.width = String(request.width);
  frame.height = String(request.height);
  frame.dataset.frame = frameQuery(request);
  frame.srcdoc = frameDocument(document);
  return frame;
}

/** Draws `values` in a frame already on the board. */
export function updateFrame(frame: HTMLIFrameElement, values: Values) {
  frame.dataset.values = JSON.stringify(values);
}

/** The board's <iframe> around this page, if any (an element of the board's window, so not an instance of ours). */
const hostFrame = () => (window.frameElement?.tagName === "IFRAME" ? window.frameElement as HTMLIFrameElement : undefined);

/** The query this page was opened with: its <iframe>'s on the board, else its own address. */
export function ownQuery(): string {
  return hostFrame()?.dataset.frame ?? location.search;
}

/** What a frame page shows, from its query; undefined when it names no frame. */
export function frameOf(query: string): { entry: Part | Mockup; theme: Theme; values: Values; live: boolean } | undefined {
  const params = new URLSearchParams(query);
  const partId = params.get("frame"), mockupId = params.get("mockup");
  const part = partId ? PARTS.find((item) => item.id === partId) : undefined;
  const entry = part && isPart(part) ? part : mockupId ? [...SCREENS, ...MOCKUPS].find((item) => item.id === mockupId) : undefined;
  if (!entry) return undefined;
  let values: Values = {};
  try { values = JSON.parse(params.get("v") ?? "{}") as Values; } catch { /* A hand-edited address: the defaults. */ }
  return { entry, theme: params.get("theme") === "dark" ? "dark" : "light", values: { ...entry.defaults, ...values }, live: params.get("live") === "1" };
}

/**
 * Storage that lives and dies with one page. The board is served from the preview editor's own site, so its frames
 * share the editor's saved settings; a screen's real parts (the sidebar's width, the canvas's width) read and write
 * this instead, so the board never changes the editor, and every browser shows the screens alike. Only its
 * methods hold items (no `localStorage[key]`), as every part reads storage today.
 */
export function pageStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); },
    clear: () => items.clear(),
  };
}

/** Runs a frame page: the one part or mock-up, in its theme, redrawn when the board sets new options. */
export async function startFrame(shown: NonNullable<ReturnType<typeof frameOf>>) {
  if (!isPart(shown.entry)) for (const name of ["localStorage", "sessionStorage"]) Object.defineProperty(window, name, { value: pageStorage(), configurable: true });
  document.documentElement.dataset.theme = shown.theme;
  document.body.className = `cat-frame-page${isPart(shown.entry) ? "" : " cat-frame-page--screen"}`;
  const stage = document.createElement("div");
  stage.className = "cat-frame-stage";
  stage.dataset.part = shown.entry.id;
  // What a preview annotation inside the frame names besides the part: its files.
  stage.dataset.files = shown.entry.files.join(" ");
  document.body.replaceChildren(stage);
  // The board's Tweak edits, last in the page so they win over the rules they change, also over a part's stylesheet
  // that loads as it first draws.
  const tweaks = document.createElement("style");
  const placeTweaks = () => { if (tweaks.textContent) document.head.append(tweaks); else tweaks.remove(); };
  let drawing = 0;
  const draw = async (values: Values) => {
    const turn = ++drawing;
    const element = isPart(shown.entry) ? await shown.entry.render(values, "normal", shown.live) : await shown.entry.render(values);
    if (turn !== drawing) return;
    stage.firstElementChild?.dispatchEvent(new CustomEvent("cat-redraw"));
    stage.replaceChildren(element);
    placeTweaks();
  };
  // Options the board set while this page was still loading are on `data-values` already: they win over the first ones.
  const host = hostFrame();
  if (host && shown.live) handOnToBoard(host);
  // A state cell's frame on the board is a picture, inert inside too: a part focusing itself as it draws (an open menu
  // its first item, a dialog) would take the keyboard away from the board, and the board cannot fully take it back.
  else if (host) stage.inert = true;
  const set = (): Values | undefined => {
    try { return host?.dataset.values ? { ...shown.values, ...JSON.parse(host.dataset.values) as Values } : undefined; } catch { return undefined; }
  };
  const setTweaks = () => { tweaks.textContent = host?.dataset.tweaks ?? ""; placeTweaks(); };
  if (host) {
    setTweaks();
    new MutationObserver((changes) => {
      if (changes.some((change) => change.attributeName === "data-tweaks")) setTweaks();
      if (changes.some((change) => change.attributeName === "data-values")) { const values = set(); if (values) void draw(values); }
    }).observe(host, { attributes: true, attributeFilter: ["data-values", "data-tweaks"] });
  }
  await draw(set() ?? shown.values);
}

/**
 * A live frame on the board: its wheel goes on to the board (zoom and pan, as over any other cell), a press in it
 * tells the board (`cat-frame-press`) so it selects the frame's card, and a key tells it the keyboard is in use
 * (`cat-frame-key`), so Tab on into the next card's frame brings that card into view.
 */
function handOnToBoard(host: HTMLIFrameElement) {
  const board = host.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  if (!board) return;
  addEventListener("wheel", (event) => {
    event.preventDefault();
    const at = boardPoint(host.getBoundingClientRect(), host.offsetWidth, { x: event.clientX, y: event.clientY });
    host.dispatchEvent(new board.WheelEvent("wheel", {
      bubbles: true, cancelable: true, clientX: at.x, clientY: at.y,
      deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode,
      ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey,
    }));
  }, { passive: false });
  addEventListener("pointerdown", () => host.dispatchEvent(new board.CustomEvent("cat-frame-press", { bubbles: true })), true);
  addEventListener("keydown", () => host.dispatchEvent(new board.CustomEvent("cat-frame-key", { bubbles: true })), true);
}
