// Share preview's state in the editor (slice 35; CONTEXT.md "Preview link"): what the
// project menu shows, and the preview link of the site shown, which this tab serves
// whenever the editor is open on it. Loaded a moment after the first paint
// (src/preview-share.ts, the boot part); serving (src/preview-serve.ts) and the room
// load once a link is served.
//
// Share preview asks the Worker for a link (POST `/api/live/preview`), makes its
// room key and keeps both in this browser, per sign-in, repository and branch, until
// the link is turned off or ends (30 days): the key never reaches a server, so only
// this browser can serve that link. Turn preview off tells the Worker, which refuses
// the link from then on.

import type { SiteFiles } from "./site-download";

/** What the menu shows: no link (or one being made), or the link, when it ends and whether it is being turned off. */
export type PreviewState = { on: false; starting?: true } | { on: true; link: string; ends: number; stopping?: true };
/** A link as this browser keeps it. `host`: this tab's proof (never in the link). */
interface KeptLink { token: string; host: string; key: string; ends: number; link: string }
/** The links this browser serves, by sign-in, repository and branch. */
const KEPT = "native-site-editor:preview-links";

/** An error with the refusal's HTTP status (401 signed out, 503 not set up). */
export class PreviewRefused extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
function readKept(): Record<string, KeptLink> {
  try {
    const value = JSON.parse(localStorage.getItem(KEPT) ?? "{}") as unknown;
    return value && typeof value === "object" ? value as Record<string, KeptLink> : {};
  } catch { return {}; }
}
function writeKept(change: (links: Record<string, KeptLink>) => void) {
  const links = readKept();
  change(links);
  // Links past their end go whenever the list is written.
  for (const [id, link] of Object.entries(links)) if (!(link.ends > Date.now())) delete links[id];
  try { localStorage.setItem(KEPT, JSON.stringify(links)); } catch { /* A private window keeps nothing: the link lasts while this tab does. */ }
}

async function post(path: string, body: unknown) {
  const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (response.ok) return response;
  const said = await response.json().catch(() => undefined) as { error?: unknown } | undefined;
  throw new PreviewRefused(typeof said?.error === "string" ? said.error : "The preview link could not be changed.", response.status);
}
/** The Worker mints a link for this signed-in tab: its token, this tab's proof, its address (without the key) and end. */
async function mintLink(repo: string, branch: string, site: string) {
  const body = await (await post("/api/live/preview", { repo, branch, site })).json() as { token?: unknown; host?: unknown; link?: unknown; ends?: unknown };
  if (typeof body.token !== "string" || typeof body.host !== "string" || typeof body.link !== "string" || typeof body.ends !== "number")
    throw new PreviewRefused("The preview link could not be made.", 502);
  return { token: body.token, host: body.host, link: body.link, ends: body.ends };
}
/** The Worker turns the link off: refused from now on. One already over counts as off. */
async function turnOff(repo: string, link: Pick<KeptLink, "token" | "host">) {
  try { await post(`/api/live/preview/off?${new URLSearchParams({ token: link.token })}`, { repo, host: link.host }); }
  catch (error) { if (!(error instanceof PreviewRefused && error.status === 410)) throw error; }
}

export interface PreviewSharePorts {
  /** The repository and branch shown while a site is open, the site's name and the login; none otherwise. */
  workspace(): { repo: string; branch: string; site: string; host: string } | undefined;
  /** Whether this editor has a preview Worker (the session's `previewLinks`). */
  enabled(): boolean;
  /** The site as edited (src/site-loading.ts `nativeSiteFiles`). */
  files(): Promise<SiteFiles | undefined>;
  /** The page on show: where a visitor starts. */
  start(): string;
  /** Seams for tests. */
  mint?: typeof mintLink;
  off?: typeof turnOff;
  serve?: (ports: import("./preview-serve").ServePorts) => Promise<{ close(): void }>;
}

/** Share preview for the site shown: the menu's state, and serving its link while the editor shows the site. */
export function createPreviewControl(ports: PreviewSharePorts) {
  const mint = ports.mint ?? mintLink, off = ports.off ?? turnOff;
  const serve = ports.serve ?? (async (serving) => (await import("./preview-serve")).servePreview(serving));
  let state: PreviewState = { on: false };
  const listeners = new Set<(state: PreviewState) => void>();
  const set = (next: PreviewState) => { state = next; for (const listener of [...listeners]) listener(state); };
  // The workspace whose link this tab serves (sign-in, repository, branch), and the serving itself.
  let shown: string | undefined;
  let serving: { close(): void } | undefined;
  let run = 0;
  const where = () => { const at = ports.enabled() ? ports.workspace() : undefined; return at?.host ? at : undefined; };
  const idOf = (at: { repo: string; branch: string; host: string }) => JSON.stringify([at.host.toLowerCase(), at.repo.toLowerCase(), at.branch]);
  // The links this tab made or served, as well: a browser that refuses to keep them (storage full, a strict private
  // window) still turns its link off on the server.
  const held = new Map<string, KeptLink>();
  const kept = (id: string) => { const link = readKept()[id] ?? held.get(id); return link && link.ends > Date.now() ? link : undefined; };
  const drop = (id: string) => { held.delete(id); writeKept((links) => { delete links[id]; }); };

  const stopServing = () => { run++; const open = serving; serving = undefined; open?.close(); };
  /** Serves `link` for workspace `id` until another opens, it is turned off, or the Worker refuses it. */
  const startServing = (id: string, repo: string, link: KeptLink) => {
    stopServing();
    const mine = run;
    return (async () => {
      const raw = Uint8Array.from(atob(link.key.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
      const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      const opened = await serve({
        address: `/api/live/preview?${new URLSearchParams({ token: link.token, repo, host: link.host })}`,
        key, start: () => ports.start(),
        // Only the site this link is for: while another shows (before the next sync), nothing is answered.
        files: async () => { const at = where(); return at && idOf(at) === id ? ports.files() : undefined; },
        closed: (why) => {
          if (mine !== run) return;
          serving = undefined;
          // Turned off, ended or someone else's: this browser forgets it. Anything else ends with this tab's room.
          if (why === 400 || why === 403 || why === 410) { drop(id); if (shown === id) set({ on: false }); }
        },
      });
      if (mine !== run) { opened.close(); return; }
      serving = opened;
    })().catch(() => undefined);
  };

  /** The link of the site shown is served, and another site's is not. */
  const sync = () => {
    const at = where();
    const id = at && idOf(at);
    if (id === shown) return;
    stopServing();
    shown = id;
    const link = id ? kept(id) : undefined;
    if (at && id && link) { held.set(id, link); set({ on: true, link: link.link, ends: link.ends }); void startServing(id, at.repo, link); }
    else set({ on: false });
  };

  return {
    state: () => state,
    /** Whether Share preview shows: a preview Worker is set up and a site is shown, or a link is on. */
    available: () => state.on || where() !== undefined,
    /** Hears each change of state; returns the way to stop. */
    watch(listener: (state: PreviewState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** After a load or a paint. */
    sync,
    /** Share preview: makes a link for the site shown and serves it; resolves its address. Throws PreviewRefused. */
    async start(): Promise<string | undefined> {
      sync();
      if (state.on) return state.link;
      const at = where();
      if (!at || state.starting) return undefined;
      const id = idOf(at), mine = ++run;
      set({ on: false, starting: true });
      try {
        const made = await mint(at.repo, at.branch, at.site);
        const key = b64u(crypto.getRandomValues(new Uint8Array(32)));
        const link: KeptLink = { token: made.token, host: made.host, key, ends: made.ends, link: `${made.link}#k=${key}` };
        if (mine !== run || shown !== id) { if (shown === id) set({ on: false }); return undefined; }
        held.set(id, link);
        writeKept((links) => { links[id] = link; });
        // The link shows (and is copied) once this tab serves it, so whoever opens it at once finds it running.
        await startServing(id, at.repo, link);
        // Another project opened meanwhile: its own state stands (the link is kept for when this one shows again).
        if (shown !== id) return undefined;
        set({ on: true, link: link.link, ends: link.ends });
        return link.link;
      } catch (error) {
        if (mine === run) set({ on: false });
        throw error;
      }
    },
    /** Turn preview off: the link refuses from now on, and visitors' pages say so. Throws PreviewRefused. */
    async stop() {
      sync();
      const at = where();
      const id = at && idOf(at);
      const link = id ? kept(id) : undefined;
      if (!state.on || state.stopping) return;
      if (!at || !id || !link) { stopServing(); set({ on: false }); return; }
      set({ ...state, stopping: true });
      try { await off(at.repo, link); }
      catch (error) { if (shown === id && state.on) set({ ...state, stopping: undefined }); throw error; }
      drop(id);
      if (shown !== id) return;
      stopServing();
      set({ on: false });
    },
  };
}
