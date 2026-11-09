// A preview link's page (slice 35; CONTEXT.md "Preview link"), on the preview
// Worker's address (worker/preview-host.ts), never the editor's: a customer sees
// the real site, its own scripts running, as Lex edits it.
//
// The page opens the link's live room with the key after `#`, says it is here,
// and shows the site in a frame at `<link>/site/<page>`. The preview's service
// worker asks this page for every file the frame needs; this page asks Lex's tab
// through the room (src/preview-serve.ts), which answers from the editor's copy,
// unsaved changes included, and says when a file changed: the frame is drawn
// again where the visitor was, behind the old one until it has loaded. Nothing
// is stored on the way. While Lex's editor is closed the page says the preview is
// not running and looks again now and then, only while it is shown.

import "./preview-visit.css";
import { importSessionKey, randomId, sessionWire } from "./live-wire";
import { LiveRoomClosed, openLiveRoom, type LiveRoom, type LiveRoomSocket } from "./live-room";
import { previewTokenEnds, readPreviewPath, type HostMessage, type VisitorMessage } from "../shared/preview-link";

type Answer = { status: number; type?: string; body?: ArrayBuffer; location?: string };
/** A file not answered by then is given up (the service worker waits a little longer). */
const ANSWER_MS = 15_000;
/** While the preview is not running, it looks again this often: soon at first, then rarely (a link left open on a
 * closed editor must not eat its daily allowance). */
const LOOK_AGAIN_MS = [5_000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000];

const root = document.getElementById("preview")!;
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string) => {
  const made = document.createElement(tag);
  if (className) made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
};
function note(title: string, detail?: string, busy = false) {
  const box = element("section", "preview-visit__note");
  box.setAttribute("role", "status");
  if (busy) box.setAttribute("aria-busy", "true");
  box.append(element("h1", "preview-visit__title", title));
  if (detail) box.append(element("p", "preview-visit__detail", detail));
  root.replaceChildren(box);
}
const decode = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0)).buffer;

const where = readPreviewPath(location.pathname);
const key = new URLSearchParams(location.hash.slice(1)).get("k") ?? "";
if (!where || where.rest !== "/" || !/^[\w-]{43}$/.test(key)) note("This preview link is not complete.", "Ask for the link again, and open all of it.");
else if (!("serviceWorker" in navigator)) note("This browser can't show the preview.", "Open the link in a current browser, outside a private window.");
else void run(where.base, where.token, key);

async function run(base: string, token: string, rawKey: string) {
  note("Opening the preview…", undefined, true);
  let roomKey: CryptoKey;
  try { roomKey = await importSessionKey(rawKey); } catch { note("This preview link is not complete.", "Ask for the link again, and open all of it."); return; }
  try {
    await navigator.serviceWorker.register("/preview-sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  } catch { note("This browser can't show the preview.", "Open the link in a current browser, outside a private window."); return; }

  const over = () => previewTokenEnds(token) <= Date.now()
    ? note("This preview link has ended.", "Ask for a new link.")
    : note("This preview link is turned off.");
  let room: LiveRoom | undefined;
  let version = "";
  let start = "/";
  // The page the visitor is on and where they had scrolled, kept while the preview is not running.
  let lastHref: string | undefined;
  let frame: HTMLIFrameElement | undefined;
  let drawing: HTMLIFrameElement | undefined, drawAgain = false;
  const cache = new Map<string, Answer>();
  const waiting = new Map<string, ((answer: Answer) => void)[]>();
  let looks = 0, look: ReturnType<typeof setTimeout> | undefined, ended = false;
  // This visitor's id in its asks, and the one tab of Lex's it takes the site from (he may have it open twice): that
  // tab's id from its hello and its relay peer, so its leaving is noticed.
  const me = randomId(8);
  let serving: { host: string; peer: string } | undefined;

  // Files come only from Lex's tab, as the relay names the sender: another visitor cannot answer for it.
  const wire = sessionWire<HostMessage>(() => room, (message, from) => {
    if (from.access !== "editor") return;
    if (message.t === "hello" && typeof message.host === "string" && !serving) serving = { host: message.host, peer: from.peer };
    if (from.peer === serving?.peer) heard(message);
  }, () => undefined);
  const send = (message: VisitorMessage) => wire.send(message);
  const ask = (path: string) => { if (serving) send({ t: "get", path, host: serving.host, me }); };

  function heard(message: HostMessage) {
    // Each (re)joining: files may have changed while this page was away, so it starts afresh where the visitor is.
    if (message.t === "hello" && typeof message.version === "string" && typeof message.start === "string") {
      version = message.version;
      start = message.start.startsWith("/") ? message.start : "/";
      forget();
      if (!frame) show(lastHref ?? `${base}/site${start}`);
      else redraw();
    } else if (message.t === "file" && typeof message.path === "string" && message.version === version && Array.isArray(message.to) && message.to.includes(me)) {
      const answer: Answer = {
        status: typeof message.status === "number" ? message.status : 502,
        ...(typeof message.type === "string" ? { type: message.type } : {}),
        ...(typeof message.location === "string" ? { location: message.location } : {}),
      };
      if (typeof message.body === "string") { try { answer.body = decode(message.body); } catch { answer.status = 502; } }
      cache.set(message.path, answer);
      for (const resolve of waiting.get(message.path) ?? []) resolve(answer);
      waiting.delete(message.path);
    } else if (message.t === "changed" && typeof message.version === "string" && message.version !== version) {
      version = message.version;
      forget();
      redraw();
    }
  }
  /** A new version: what this page holds goes, and files still awaited are asked for again. */
  function forget() {
    cache.clear();
    for (const path of waiting.keys()) ask(path);
  }
  /** One file for the service worker, from what this page holds or from Lex's tab. */
  function get(path: string): Promise<Answer> {
    const held = cache.get(path);
    if (held) return Promise.resolve(held);
    if (!room) return Promise.resolve({ status: 503 });
    return new Promise((resolve) => {
      const queue = waiting.get(path);
      const settle = (answer: Answer) => { clearTimeout(timer); resolve(answer); };
      const timer = setTimeout(() => {
        const left = (waiting.get(path) ?? []).filter((item) => item !== settle);
        if (left.length) waiting.set(path, left); else waiting.delete(path);
        resolve({ status: 504 });
      }, ANSWER_MS);
      if (queue) queue.push(settle);
      else { waiting.set(path, [settle]); ask(path); }
    });
  }
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data as { type?: unknown; path?: unknown } | null;
    const port = event.ports[0];
    if (data?.type !== "preview-get" || typeof data.path !== "string" || !port) return;
    void get(data.path).then((answer) => port.postMessage(answer));
  });
  navigator.serviceWorker.startMessages();

  const makeFrame = (href: string) => {
    const made = element("iframe", "preview-visit__frame");
    made.title = "Site preview";
    made.src = href;
    return made;
  };
  /** The site's frame, at `href`; its title becomes the page's. */
  function show(href: string) {
    frame = makeFrame(href);
    frame.addEventListener("load", () => titled(frame));
    root.replaceChildren(frame);
  }
  const titled = (from: HTMLIFrameElement | undefined) => {
    try { const title = from?.contentDocument?.title; if (title) document.title = title; } catch { /* Not the site's page. */ }
  };
  /** Where the visitor is in the frame now, when it shows a page of this link. */
  const place = (from: HTMLIFrameElement | undefined) => {
    try {
      const view = from?.contentWindow;
      if (!view || !view.location.pathname.startsWith(`${base}/site/`)) return undefined;
      return { href: view.location.href, x: view.scrollX, y: view.scrollY };
    } catch { return undefined; }
  };
  /** Calls `restore` once the frame's pictures still loading have finished (at most 3 s), unless the visitor moved first. */
  function settleScroll(shown: HTMLIFrameElement, restore: () => void) {
    let doc: Document | undefined;
    try { doc = shown.contentDocument ?? undefined; } catch { return; }
    const pending = [...doc?.images ?? []].filter((image) => !image.complete);
    if (!doc || !pending.length) return;
    let moved = false;
    const stop = () => { moved = true; };
    for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) doc.addEventListener(type, stop, { once: true, passive: true });
    const done = pending.map((image) => new Promise((resolve) => { image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true }); }));
    void Promise.race([Promise.all(done), new Promise((resolve) => setTimeout(resolve, 3_000))]).then(() => { if (!moved && frame === shown) restore(); });
  }
  /** Draws the page again where the visitor was: the new frame loads behind the old one, then takes its place. */
  function redraw() {
    if (!frame) return;
    if (drawing) { drawAgain = true; return; }
    const at = place(frame) ?? { href: `${base}/site${start}`, x: 0, y: 0 };
    const next = drawing = makeFrame(at.href);
    next.classList.add("is-loading");
    next.addEventListener("load", () => {
      if (drawing !== next) return;
      // Scrolled while hidden (so it never shows its top), then again once shown, and once more as pictures still
      // loading finish and move the page, unless the visitor scrolled meanwhile.
      const restore = () => { try { next.contentWindow?.scrollTo(at.x, at.y); } catch { /* Not the site's page. */ } };
      restore();
      frame?.remove();
      frame = next;
      drawing = undefined;
      next.classList.remove("is-loading");
      restore();
      requestAnimationFrame(restore);
      settleScroll(next, restore);
      titled(next);
      next.addEventListener("load", () => titled(next));
      if (drawAgain) { drawAgain = false; redraw(); }
    }, { once: true });
    root.append(next);
  }

  /** The editor is closed: the page says so and looks again later, only while it is shown. */
  function notRunning() {
    lastHref = place(frame)?.href ?? lastHref;
    frame = drawing = undefined;
    drawAgain = false;
    cache.clear();
    for (const list of waiting.values()) for (const resolve of list) resolve({ status: 503 });
    waiting.clear();
    note("Not running", "This preview shows edits while the editor is open.");
    lookLater();
  }
  function lookLater() {
    clearTimeout(look);
    if (ended || room || document.hidden) return;
    look = setTimeout(join, LOOK_AGAIN_MS[Math.min(looks++, LOOK_AGAIN_MS.length - 1)]);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !room && !ended) { clearTimeout(look); join(); } });

  // A plain look first (no socket): running (204), not now (409), over (410) or broken (400). After a socket closed the
  // look is fresh: the preview Worker asks the editor rather than answer a remembered "not running", as the link may
  // just have been turned off.
  // The page's first look is fresh too: it was just opened, maybe moments after the link was made.
  let fresh = true;
  const connect = async (url: string): Promise<LiveRoomSocket> => {
    const asked = fresh;
    fresh = false;
    const status = await fetch(`${base}/live${asked ? "?fresh=1" : ""}`, { cache: "no-store" }).then((response) => response.status, () => 0);
    if (status === 400 || status === 409 || status === 410) throw new LiveRoomClosed("", status);
    if (status !== 204) throw new Error("The preview could not be reached.");
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(new URL(url, location.href).href.replace(/^http/, "ws"));
      socket.binaryType = "arraybuffer";
      const failed = () => reject(new Error("The preview could not be reached."));
      socket.addEventListener("open", () => {
        socket.removeEventListener("close", failed);
        socket.addEventListener("close", () => { fresh = true; }, { once: true });
        resolve(socket);
      }, { once: true });
      socket.addEventListener("close", failed, { once: true });
    });
  };
  function join() {
    if (room || ended) return;
    const joined = openLiveRoom({
      address: `${base}/live`,
      key: roomKey,
      connect,
      onMessage: (bytes, from) => wire.receive(bytes, from),
      // In, or back after a dropped socket: say so, and Lex's tab answers with where to start.
      onKey: () => { if (room !== joined) return; looks = 0; serving = undefined; send({ t: "hi" }); },
      // The tab it took the site from left while another of Lex's still serves: it takes the site from that one.
      onMembers: (members) => {
        if (room !== joined || !serving || members.has(serving.peer)) return;
        serving = undefined;
        if ([...members.values()].includes("editor")) send({ t: "hi" });
      },
      onClosed: (why) => {
        if (room === joined) room = undefined;
        if (why === 410) { ended = true; clearTimeout(look); over(); return; }
        if (why === 400) { ended = true; note("This preview link is not valid.", "Ask for the link again, and open all of it."); return; }
        notRunning();
      },
    });
    room = joined;
  }
  addEventListener("pagehide", () => { ended = true; room?.close(); }, { once: true });
  // Brought back from the browser's cache, the page has no room any more: it opens again.
  addEventListener("pageshow", (event) => { if (event.persisted) location.reload(); });
  join();
}
