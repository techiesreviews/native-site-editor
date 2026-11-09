// Lex's tab serving a preview link (slice 35; CONTEXT.md "Preview link"): it holds
// the link's live room open while the editor shows the site, and answers each file
// a visitor's page asks for (src/preview-visit.ts) as a static host would, from the
// editor's copy: unsaved changes included, nothing stored on the way. It looks at
// the files it answered every moment a visitor is in; when one changed, visitors
// are told and draw the page again. Loaded with the first preview hosted, never at
// boot (src/preview-share.ts keeps the menu's state).

import type { LiveRoom, openLiveRoom } from "./live-room";
import { randomId, sessionWire } from "./live-wire";
import type { SiteFiles } from "./site-download";
import { TEXT_PATH } from "../shared/agent";
import { PREVIEW_FILE_LIMIT, previewContentType, resolvePreviewPath, type HostMessage, type VisitorMessage } from "../shared/preview-link";

/** How often the files visitors were sent are looked at again while someone is in. */
const LOOK_MS = 600;

export interface ServePorts {
  /** The room's address: `/api/live/preview?token&repo&host`. */
  address: string;
  key: CryptoKey;
  /** The site as edited now (src/site-loading.ts `nativeSiteFiles`), or none while no site is open. */
  files(): Promise<SiteFiles | undefined>;
  /** The page on show in the editor: where a new visitor starts. */
  start(): string;
  /** The room ended by itself: refused (its HTTP status: 410 turned off or ended, 403 someone else's), or closed. */
  closed(why?: number): void;
  /** Seams for tests. */
  open?: typeof openLiveRoom;
  every?: (run: () => void, ms: number) => () => void;
}

/** Bytes as base64, in slices (a spread of a whole picture would overflow the call stack). */
export function base64(bytes: Uint8Array) {
  let text = "";
  for (let start = 0; start < bytes.length; start += 0x8000) text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(text);
}

/** Git's blob id of a text: the editor's copy and the branch's file compare by it, whichever is read. */
async function blobId(bytes: Uint8Array) {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const whole = new Uint8Array(header.length + bytes.length);
  whole.set(header);
  whole.set(bytes, header.length);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", whole)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** What answering `path` sends, and what it is made from (the file and its blob id), to tell later whether it changed. */
async function look(site: SiteFiles | undefined, path: string, withBody: boolean): Promise<{ made: string; answer: Omit<Extract<HostMessage, { t: "file" }>, "t" | "version" | "path" | "to"> }> {
  if (!site) return { made: "closed", answer: { status: 503 } };
  const paths = new Set(site.paths);
  const found = resolvePreviewPath(path, (file) => paths.has(file));
  if (found.status === 400) return { made: "400", answer: { status: 400 } };
  if (found.status === 301) return { made: `301:${found.location}`, answer: { status: 301, location: found.location } };
  if (!found.file) return { made: "404", answer: { status: 404 } };
  const file = found.file, type = previewContentType(file);
  const held = site.held(file);
  if (held !== undefined) {
    const bytes = new TextEncoder().encode(held);
    const made = `${found.status}:${file}:${await blobId(bytes)}`;
    if (bytes.length > PREVIEW_FILE_LIMIT) return { made, answer: { status: 413 } };
    return { made, answer: { status: found.status, type, ...(withBody ? { body: base64(bytes) } : {}) } };
  }
  const sha = await site.blob(file);
  if (!sha) return { made: "404", answer: { status: 404 } };
  const made = `${found.status}:${file}:${sha}`;
  if (!withBody) return { made, answer: { status: found.status, type } };
  try {
    const bytes = TEXT_PATH.test(file)
      ? new TextEncoder().encode((await site.readTexts([sha]))[sha] ?? "")
      : await site.readBytes(sha);
    if (bytes.length > PREVIEW_FILE_LIMIT) return { made, answer: { status: 413 } };
    return { made, answer: { status: found.status, type, body: base64(bytes) } };
  } catch { return { made: "502", answer: { status: 502 } }; }
}

/** Holds the preview link's room and answers its visitors until closed. */
export async function servePreview(ports: ServePorts) {
  const openRoom = ports.open ?? (await import("./live-room")).openLiveRoom;
  const every = ports.every ?? ((run, ms) => { const timer = setInterval(run, ms); return () => clearInterval(timer); });
  // The version visitors hold: this tab's own id and a count, so a second tab of Lex's never repeats one.
  const me = randomId(4);
  let count = 0, version = `${me}:0`;
  // Each path answered at this version, and what its answer was made from; and the answers being made, by version and
  // path, with the visitors waiting for each.
  const answered = new Map<string, string>();
  const working = new Map<string, Set<string>>();
  let visitors = 0, looking = false, closed = false;

  const wire = sessionWire<VisitorMessage>(() => room, (message, from) => {
    if (from.access !== "guest" || closed) return;
    if (message.t === "hi") wire.send({ t: "hello", host: me, version, start: ports.start() } satisfies HostMessage);
    // Only asks for this tab (another tab of Lex's may serve the same link), from a visitor that names itself.
    else if (message.t === "get" && message.host === me && typeof message.me === "string" && /^[a-f\d]{8,32}$/.test(message.me) &&
      typeof message.path === "string" && message.path.length <= 2048) answer(message.path, message.me);
  }, () => undefined);

  /** Answers `path` for visitor `to`: one answer for every visitor who asks while it is being made, and only for them
   * (the room forwards every frame to everyone; the others drop it). */
  function answer(path: string, to: string) {
    const at = version, id = `${at}\0${path}`;
    const waiting = working.get(id);
    if (waiting) { waiting.add(to); return; }
    const askers = new Set([to]);
    working.set(id, askers);
    void (async () => {
      const { made, answer: sent } = await look(await ports.files(), path, true);
      if (closed) return;
      if (at === version) answered.set(path, made);
      working.delete(id);
      wire.send({ t: "file", version: at, path, to: [...askers], ...sent } satisfies HostMessage);
    })().catch(() => working.delete(id));
  }
  /** Any file answered changed: a new version, and visitors draw again. */
  async function lookAgain() {
    if (looking || closed || !visitors || !answered.size) return;
    looking = true;
    try {
      const site = await ports.files();
      for (const [path, made] of answered) {
        if ((await look(site, path, false)).made === made) continue;
        if (closed) return;
        version = `${me}:${++count}`;
        answered.clear();
        wire.send({ t: "changed", version } satisfies HostMessage);
        return;
      }
    } finally { looking = false; }
  }
  const stopLooking = every(() => void lookAgain(), LOOK_MS);
  const end = () => {
    if (closed) return;
    closed = true;
    stopLooking();
    room.close();
  };
  const room: LiveRoom = openRoom({
    address: ports.address,
    key: ports.key,
    onMessage: (bytes, from) => wire.receive(bytes, from),
    onMembers: (members) => {
      visitors = [...members.values()].filter((access) => access === "guest").length;
      // Nobody in: the next visitor starts afresh.
      if (!visitors) answered.clear();
    },
    onClosed: (why) => { end(); ports.closed(why); },
  });
  return { close: end };
}
