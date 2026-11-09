// The preview Worker (slice 35; CONTEXT.md "Preview link"): a small Worker of its own,
// on its own address (its `workers.dev` one by default, wrangler.preview-host.jsonc),
// so a site's scripts run there and never on the editor's origin, whose sign-in
// cookie this address never receives. Each link has a path, `/s/<site>-<token>/`
// (shared/preview-link.ts); sites share this origin with each other.
//
// It serves the link's page (preview-visit.html, src/preview-visit.ts), which opens
// the link's live room and shows the site in a frame; a service worker
// (`/preview-sw.js`, below) answers the frame's requests from that page, which asks
// Lex's tab for each file through the room. Nothing is stored here or on the way.
// The room's socket goes to the editor's Worker through the EDITOR service binding,
// as a fresh request: no cookie, origin or other header of the visitor's crosses.
//
// Every answer tells search engines to stay out, and none sets a cookie. Only the
// page, the room and the service worker run this script; the build's hashed
// `/assets/` go to the static assets directly, which cost no Worker request
// (a leaked or popular link must not eat the daily allowance).

import { readPreviewPath } from "../shared/preview-link";

interface Fetcher { fetch(request: Request): Promise<Response> }
export interface PreviewHostEnv {
  /** The editor's build (`dist`), for the link's page. */
  ASSETS: Fetcher;
  /** The editor's Worker (worker/app.ts), for the link's room. */
  EDITOR: Fetcher;
}

/** On every answer: no indexing, no referrer, no sniffing. */
export const PREVIEW_HEADERS: Readonly<Record<string, string>> = {
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const escape = (text: string) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
/** A plain page with one message, in the visitor's light or dark scheme. */
function note(status: number, title: string, detail: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${escape(title)}</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:16px;box-sizing:border-box;font:16px/1.5 system-ui,sans-serif;background:light-dark(#f6f6f4,#17181b);color:light-dark(#1d1e20,#ececea)}main{text-align:center;display:grid;gap:4px;max-width:36ch}h1{font-size:1.05rem;margin:0}p{margin:0;color:light-dark(#5d5f63,#a4a6aa)}</style>
</head><body><main><h1>${escape(title)}</h1><p>${escape(detail)}</p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** How long a link's "not running" (409) or "over" (410) answer is reused. */
export const NOT_NOW_MS = 20_000;
// By token, in this isolate; and in the Cache API too where it works (on a custom domain: on workers.dev it does nothing).
const notNowMemo = new Map<string, { status: number; until: number }>();
const notNowKey = (token: string) => `https://preview-not-now.internal/${token}`;
const edgeCache = () => (globalThis as { caches?: { default?: Cache } }).caches?.default;
async function notNow(token: string) {
  const held = notNowMemo.get(token);
  if (held && held.until > Date.now()) return held.status;
  notNowMemo.delete(token);
  const cached = await edgeCache()?.match(notNowKey(token)).catch(() => undefined);
  return cached?.status === 409 || cached?.status === 410 ? cached.status : undefined;
}
async function rememberNotNow(token: string, status: number) {
  notNowMemo.set(token, { status, until: Date.now() + NOT_NOW_MS });
  // Old entries go as new ones come, so the memo stays small.
  if (notNowMemo.size > 1000) for (const [key, value] of notNowMemo) if (value.until <= Date.now() || notNowMemo.size > 1000) notNowMemo.delete(key);
  await edgeCache()?.put(notNowKey(token), new Response(null, { status, headers: { "Cache-Control": `max-age=${NOT_NOW_MS / 1000}` } })).catch(() => undefined);
}

export async function previewHost(request: Request, env: PreviewHostEnv): Promise<Response> {
  const response = await route(request, env, new URL(request.url));
  // A socket's answer goes back as it is: it carries no page and no cookie.
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  headers.delete("Set-Cookie");
  for (const [name, value] of Object.entries(PREVIEW_HEADERS)) headers.set(name, value);
  return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}

async function route(request: Request, env: PreviewHostEnv, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed.", { status: 405, headers: { Allow: "GET, HEAD" } });
  if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (url.pathname === "/preview-sw.js")
    return new Response(PREVIEW_SERVICE_WORKER, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" } });
  const link = readPreviewPath(url.pathname);
  if (!link) return note(404, "Nothing here", "Open the whole preview link you were sent.");
  if (link.rest === "") return new Response(null, { status: 301, headers: { Location: `${link.base}/${url.search}` } });
  if (link.rest === "/") {
    const page = await env.ASSETS.fetch(new Request(new URL("/preview-visit.html", url)));
    if (!page.ok) return note(503, "This preview is not available", "Try again in a moment.");
    const headers = new Headers(page.headers);
    headers.set("Cache-Control", "no-cache");
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(page.body, { status: 200, headers });
  }
  if (link.rest === "/live") {
    const query = new URLSearchParams({ token: link.token });
    const rejoin = url.searchParams.get("rejoin");
    if (rejoin !== null) query.set("rejoin", rejoin);
    const upgrade = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
    // A link not running or over answers its pages' looks from memory for a while: a link left open on a closed editor
    // costs the editor's Worker and its Durable Object nothing then.
    if (!upgrade) {
      const known = await notNow(link.token);
      if (known) return new Response(null, { status: known, headers: { "Cache-Control": "no-store" } });
    }
    // A fresh request: only the upgrade goes on, never the visitor's cookies, origin or address.
    const answer = await env.EDITOR.fetch(new Request(`https://editor.internal/api/live/visit?${query}`, { headers: upgrade ? { Upgrade: "websocket" } : {} }));
    if (!upgrade && (answer.status === 409 || answer.status === 410)) await rememberNotNow(link.token, answer.status);
    return answer;
  }
  // The site's own files come from the service worker; a request that reaches here has none running.
  if (link.rest.startsWith("/site/")) return note(404, "Open the preview link again", "This page shows inside the preview link.");
  return note(404, "Nothing here", "Open the whole preview link you were sent.");
}

/** What the service worker reaches (a narrow view of ServiceWorkerGlobalScope). */
interface WindowClient { url: string; postMessage(message: unknown, transfer: unknown[]): void }
interface ServiceWorkerScope {
  location: { origin: string };
  clients: { get(id: string): Promise<{ url: string } | undefined>; matchAll(options: object): Promise<WindowClient[]>; claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: "install" | "activate", listener: (event: { waitUntil(work: Promise<unknown>): void }) => void): void;
  addEventListener(type: "fetch", listener: (event: { request: Request & { mode?: string; referrer?: string }; clientId: string; respondWith(answer: Promise<Response>): void }) => void): void;
}

/**
 * The service worker, as a self-contained function whose source is served (`/preview-sw.js`): it may use nothing from
 * outside itself. Its scope is the whole preview origin, so a site's root-relative addresses (`/styles/site.css`) are
 * answered too: a request under a link's `/site/` path, a subresource of a page there, or a navigation from one
 * (moved under that link's `/site/`). Each file comes from the link's page, the window at `/s/<site>-<token>/`, which
 * holds the room (src/preview-visit.ts); anything else goes to the network.
 */
export function previewServiceWorker(scope: ServiceWorkerScope) {
  const SITE = /^(\/s\/(?:[a-z0-9-]{1,40}-)?[a-f\d]{72})\/site(\/.*)$/;
  const WAIT_MS = 20_000;
  const plain = (status: number, text: string) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const site = (href: string | undefined) => {
    if (!href) return undefined;
    try { const url = new URL(href); return url.origin === scope.location.origin ? SITE.exec(url.pathname) ?? undefined : undefined; } catch { return undefined; }
  };
  /** Asks the link's page for `path` and makes its answer a response. */
  async function serve(base: string, path: string, request: Request): Promise<Response> {
    const windows = await scope.clients.matchAll({ type: "window", includeUncontrolled: true });
    const page = windows.find((client) => new URL(client.url).pathname === `${base}/`);
    if (!page) return plain(503, "Open the preview link again.");
    const answer = await new Promise<{ status: number; type?: string; body?: ArrayBuffer; location?: string } | undefined>((resolve) => {
      const channel = new MessageChannel();
      const settle = (value: unknown) => { clearTimeout(timer); channel.port1.close(); resolve(value as { status: number } | undefined); };
      const timer = setTimeout(() => settle(undefined), WAIT_MS);
      channel.port1.onmessage = (event: { data: unknown }) => settle(event.data);
      page.postMessage({ type: "preview-get", path }, [channel.port2]);
    });
    if (!answer) return plain(504, "The editor did not answer in time.");
    if (answer.status === 301 && answer.location) return new Response(null, { status: 301, headers: { Location: `${base}/site${answer.location}` } });
    if (!answer.body && answer.status !== 200) return plain(answer.status, answer.status === 404 ? "Not found." : "This preview could not show that file.");
    const headers: Record<string, string> = { "Content-Type": answer.type ?? "application/octet-stream", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Accept-Ranges": "bytes" };
    let body = answer.body ?? new ArrayBuffer(0), status = answer.status;
    // A part of the file (Safari plays video and audio only this way): one range, as a static host answers it.
    const range = status === 200 ? /^bytes=(\d*)-(\d*)$/.exec(request.headers?.get("Range") ?? "") : null;
    if (range && (range[1] || range[2])) {
      const size = body.byteLength;
      const first = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const last = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (first >= size || first > last) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Cache-Control": "no-store" } });
      body = body.slice(first, last + 1);
      status = 206;
      headers["Content-Range"] = `bytes ${first}-${last}/${size}`;
    }
    return new Response(request.method === "HEAD" ? null : body, { status, headers });
  }
  scope.addEventListener("install", (event) => event.waitUntil(scope.skipWaiting()));
  scope.addEventListener("activate", (event) => event.waitUntil(scope.clients.claim()));
  scope.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (url.origin !== scope.location.origin || (request.method !== "GET" && request.method !== "HEAD")) return;
    const own = SITE.exec(url.pathname);
    if (own) { event.respondWith(serve(own[1], own[2], request)); return; }
    // A link out of a site page to a root-relative address stays in that site.
    if (request.mode === "navigate") {
      const from = site(request.referrer);
      if (from) event.respondWith(Promise.resolve(new Response(null, { status: 302, headers: { Location: `${from[1]}/site${url.pathname}${url.search}` } })));
      return;
    }
    if (!event.clientId) return;
    event.respondWith(scope.clients.get(event.clientId).then((client) => {
      const from = site(client?.url);
      return from ? serve(from[1], url.pathname, request) : fetch(request);
    }));
  });
}

// The bundler may wrap functions inside it with `__name` (wrangler keeps names): the served file defines it.
const PREVIEW_SERVICE_WORKER = `"use strict";\nvar __name = (target) => target;\n(${previewServiceWorker.toString()})(self);\n`;

export default {
  fetch: (request: Request, env: PreviewHostEnv) => previewHost(request, env),
};
