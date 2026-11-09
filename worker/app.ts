import { AGENTS_PAUSED, agentControls, agentsPaused, type AgentControlEnv } from "./agent-controls";
import { AGENT_PERMISSION_LIFETIME } from "./agent-lifecycle";
import { cleanupRoute, inventoryRoute } from "./agent-maintenance";
import { requestJson } from "./http";
import { GITHUB_WEBHOOK_PATH, githubWebhook } from "./github-webhook";
import { ASSET_TYPES } from "../shared/asset-types";
import { AgentRelay, LiveRooms, liveRoomObjectName, liveRoomTag, livePreviewObjectName, livePreviewRoomTag, liveSessionObjectName, liveSessionRoomTag, relayObjectName, type LiveAgent } from "./agent-relay";
import { LIVE_SESSION_HOST, LIVE_SESSION_TOKEN, liveRoomFile, type LiveAccess } from "../shared/live-room";
import { PREVIEW_DAYS, PREVIEW_HOST, PREVIEW_TOKEN, previewSlug, previewTokenEnds } from "../shared/preview-link";
import {
  validAgentBranch,
  authenticateAgent,
  createGrant,
  getGrant,
  getHub,
  markGrantUsed,
  revokeGrant,
  rebindGrant,
  endSessionGrants,
  type AgentGrant,
  type AgentHub,
} from "./agent-context";
import {
  handleOAuth,
  isOAuthPath,
  resourceMetadataUrl,
  type OAuthRecord,
} from "./oauth";
import { MAX_PUBLISH_REQUEST_BYTES, publish } from "./publish";
import { requestBytes, uploadBlob } from "./blobs";
import { commitFiles, fileAtRevision, history, restore } from "./history";
import { changeStatus } from "./change-status";
import { publishHosts } from "./hosts";
import { starterProvider } from "./starter";
import { StartingPointError, commitStartingPoint, startingPointFiles, startingSiteName } from "./first-commit";
import { GitHub, HttpError, type RepositoryCache } from "./github";
import { SIGNED_OUT, isDailyQuotaError, nextUtcMidnight, type AgentQuotaBody } from "../shared/agent-failure";

/** The editor session ended; the answer carries a code so the browser asks to sign in again. */
class SignedOutError extends HttpError {
  readonly code = SIGNED_OUT;
}
import { requestFetch, startTiming, timed } from "./timing";
import {
  configuredApp,
  convertManifest,
  githubAppManifest,
  editorOrigin,
  aliasOrigins,
  hasOwnerSetup,
  isOwnerSetupState,
  githubName,
  ownerLogin,
  ownerSetupHtml,
  ownerSetupJs,
  setupPayload,
  validOwnerToken,
  writeConfiguredApp,
  type OwnerSetupState,
} from "./owner-setup";

interface Session {
  kind: "user";
  token: string;
  login: string;
  avatar_url: string;
  expiresAt: number;
  repositoryCache?: RepositoryCache;
  sessionId?: string;
  repositoryCacheGeneration?: number;
}
interface OAuthState {
  kind: "oauth";
  expiresAt: number;
  /** An MCP authorization to continue after signing in (`/auth/mcp/authorize?...`). */
  returnTo?: string;
  /** This sign-in is the end of a trip to GitHub's install page: no second trip is started, whatever the account has. */
  fromInstall?: boolean;
}
/** Set by /auth/install and used once by /auth/callback when GitHub does not send the state back. */
interface InstallPending {
  kind: "install";
  expiresAt: number;
}
export type StoredSession = Session | OAuthState | InstallPending | AgentGrant | AgentHub | OAuthRecord;
export type StoredValue = StoredSession | OwnerSetupState;

export interface Env extends AgentControlEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SESSIONS: {
    idFromName(name: string): any;
    idFromString(id: string): any;
    get(id: any): { fetch(request: Request): Promise<Response> };
  };
  MAINTENANCE_INVENTORY_TOKEN?: string;
  MAINTENANCE_CLEANUP_TOKEN?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_APP_SLUG?: string;
  /** The GitHub App's webhook secret (ticket am-32): set, it wins over the one owner setup kept; neither refuses every delivery. */
  GITHUB_WEBHOOK_SECRET?: string;
  OWNER_SETUP_TOKEN?: string;
  OWNER_GITHUB?: string;
  EDITOR_ORIGIN?: string;
  EDITOR_ALIASES?: string;
  /** Where the Starter site comes from: unset for the template repository, "native-static" for the vendored native starter. */
  STARTER_SOURCE?: string;
  /** The preview Worker's address (worker/preview-host.ts, slice 35); unset leaves Share preview out of the editor. */
  PREVIEW_ORIGIN?: string;
}

/** The preview Worker's origin, when one is set up: an http(s) address. */
function previewOrigin(env: Env) {
  try {
    const url = new URL(env.PREVIEW_ORIGIN ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
  } catch { return undefined; }
}

async function config(env: Env) {
  return configuredApp(env);
}
// Editor read endpoints accept a selected-repository listing up to this old,
// so the burst of reads after sign-in shares one membership check. Writes
// always recheck; agents reuse a listing as long (worker/agent-context.ts).
// A repository the user loses access to must stop authorizing reads within 60 seconds.
const readAuthorizationMaxAge = 60_000;
function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

// Correlates boot reads without exposing the HttpOnly session credential.
async function bootSessionHeaders(user: Session | null): Promise<Headers> {
  const headers = new Headers();
  if (user?.sessionId) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`boot:${user.sessionId}`));
    headers.set("X-Editor-Session", [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
  }
  return headers;
}
// A blob's bytes (GET /api/blob?repo&sha&type): an image or font as the media
// type its extension `type` names (shared/asset-types.ts), anything else as
// plain bytes to download. A blob never changes, so the browser keeps it for
// good, privately: the address names the repository and the SHA. The policy
// sandboxes the file if it is opened on its own, so a repository's SVG runs
// no script in the editor's origin; as an <img> the policy does not apply.
export const BLOB_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
// The type is checked before GitHub is asked; a heavy file streams through (GitHub.bytes).
function blobType(type: string | null) {
  const extension = (type ?? "").toLowerCase();
  const known = extension && Object.hasOwn(ASSET_TYPES, extension) ? ASSET_TYPES[extension] : undefined;
  if (type && !known) throw new HttpError(415, "This file type is not shown in the editor.");
  return known;
}
function blobResponse({ body, size }: { body: Uint8Array | ReadableStream<Uint8Array>; size?: number }, known: string | undefined) {
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": known ?? "application/octet-stream",
      ...(size === undefined ? {} : { "Content-Length": String(size) }),
      "Cache-Control": "private, max-age=31536000, immutable",
      // A cached copy belongs to the signed-in session that read it: another
      // account (or none) on this browser sends other cookies and asks again,
      // so its own access is checked.
      Vary: "Cookie",
      "Content-Security-Policy": BLOB_CONTENT_SECURITY_POLICY,
      "X-Content-Type-Options": "nosniff",
      ...(known ? {} : { "Content-Disposition": "attachment" }),
    },
  });
}
function randomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function cookieName(url: URL, kind: string) {
  return `${url.protocol === "https:" ? "__Host-" : ""}ase_${kind}`;
}
function cookie(request: Request, kind: string): string | null {
  const name = cookieName(new URL(request.url), kind);
  const value = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
// The other GitHub accounts signed in on this browser: their session ids,
// most recent first, so the editor can switch between them without signing
// in again. Each session still expires on its own.
const maxAccounts = 5;
const accountsLifetime = 28800;
function accountIds(request: Request): string[] {
  const name = cookieName(new URL(request.url), "accounts");
  const value = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  const ids = (value ?? "").split(".").filter((id) => /^[a-f0-9]{64}$/.test(id));
  const current = cookie(request, "session");
  return [...new Set([...(current ? [current] : []), ...ids])].slice(0, maxAccounts);
}
function setCookie(url: URL, kind: string, value: string, maxAge: number) {
  return `${cookieName(url, kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${url.protocol === "https:" ? "; Secure" : ""}`;
}
function sessionMaxAge(user: Session) {
  return Math.max(1, Math.floor((user.expiresAt - Date.now()) / 1000));
}
function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({ Location: location });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 302, headers });
}
function html(body: string, headers?: HeadersInit) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action https://github.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      ...headers,
    },
  });
}
async function store(
  env: Env,
  id: string,
  method = "GET",
  value?: StoredValue,
  consume = false,
) {
  if (method === "PUT" || method === "DELETE") forgetRepositoryMemory(id);
  return env.SESSIONS.get(env.SESSIONS.idFromName(id)).fetch(
    new Request(`https://session.internal/${consume ? "consume" : ""}`, {
      method,
      body: value ? JSON.stringify(value) : undefined,
    }),
  );
}
async function sessionWithId(request: Request, env: Env) {
  const id = cookie(request, "session");
  const user = await session(request, env);
  return id && user ? { ...user, id } : null;
}
async function session(request: Request, env: Env): Promise<Session | null> {
  const id = cookie(request, "session");
  return id ? timed(request, "session", loadSession(env, id)) : null;
}
async function loadSession(env: Env, id: string): Promise<Session | null> {
  const response = await store(env, id);
  if (!response.ok) return null;
  const value = (await response.json()) as StoredSession;
  return value.kind === "user" && value.expiresAt > Date.now() ? { ...value, sessionId: id } : null;
}

interface RepositoryMemoryEntry {
  sessionId: string;
  expiresAt: number;
  value?: RepositoryCache;
}
const repositoryMemory = new Map<string, RepositoryMemoryEntry>();
const maxRepositoryMemoryEntries = 256;
function forgetRepositoryMemory(id: string) {
  for (const [key, entry] of repositoryMemory)
    if (entry.sessionId === id) repositoryMemory.delete(key);
}

/** Most recently used last; the oldest entry goes past the bound. */
function remember(key: string, entry: RepositoryMemoryEntry) {
  repositoryMemory.delete(key);
  repositoryMemory.set(key, entry);
  if (repositoryMemory.size > maxRepositoryMemoryEntries)
    repositoryMemory.delete(repositoryMemory.keys().next().value!);
}

function sessionGitHub(user: Session, env: Env, fetcher: typeof fetch) {
  const generation = user.repositoryCacheGeneration ?? 0;
  const key = `${user.sessionId}\n${generation}\n${user.token}`;
  return new GitHub(user.token, fetcher, {
    key,
    async load() {
      if (!user.sessionId) return;
      for (const [storedKey, stored] of repositoryMemory)
        if (stored.expiresAt <= Date.now()) repositoryMemory.delete(storedKey);
      const entry = repositoryMemory.get(key);
      if (entry) {
        remember(key, entry);
        return structuredClone(entry.value);
      }
      const proof: RepositoryMemoryEntry = { sessionId: user.sessionId, expiresAt: user.expiresAt };
      remember(key, proof);
      try {
        const response = await env.SESSIONS.get(env.SESSIONS.idFromName(user.sessionId)).fetch(
          new Request("https://session.internal/repository-cache"),
        );
        if (response.status === 404) throw new HttpError(401, "Your GitHub session expired. Connect again.");
        if (!response.ok) throw new Error("Repository cache read failed");
        const saved = await response.json() as { generation: number; value: RepositoryCache | null };
        if (repositoryMemory.get(key) !== proof || proof.expiresAt <= Date.now()) return;
        if (saved.generation !== generation) {
          repositoryMemory.delete(key);
          return;
        }
        proof.value = saved.value ?? undefined;
        return structuredClone(proof.value);
      } catch (error) {
        if (repositoryMemory.get(key) === proof) repositoryMemory.delete(key);
        if (error instanceof HttpError && error.status === 401) throw error;
        console.warn("Repository listing cache could not be loaded.");
      }
    },
    async save(value) {
      if (!user.sessionId) return;
      // Every save replaces the shared entry, so a slower fallback read or an older save
      // that still holds the previous entry cannot restore the listing this save replaces.
      const proof: RepositoryMemoryEntry = { sessionId: user.sessionId, expiresAt: user.expiresAt };
      remember(key, proof);
      try {
        const response = await env.SESSIONS.get(env.SESSIONS.idFromName(user.sessionId)).fetch(
          new Request("https://session.internal/repository-cache", {
            method: "PUT", body: JSON.stringify({ token: user.token, generation, value: value ?? null }),
          }),
        );
        const current = repositoryMemory.get(key) === proof;
        if (current && response.ok && proof.expiresAt > Date.now() &&
          response.headers.get("X-Repository-Cache-Generation") === String(generation))
          proof.value = structuredClone(value);
        else if (current) repositoryMemory.delete(key);
        if (response.status === 401) throw new HttpError(401, "Your GitHub session expired. Connect again.");
        if (!response.ok) console.warn("Repository listing cache could not be persisted.");
      } catch (error) {
        if (repositoryMemory.get(key) === proof) repositoryMemory.delete(key);
        if (error instanceof HttpError && error.status === 401) throw error;
        console.warn("Repository listing cache could not be persisted.");
      }
    },
  });
}
async function invalidateRepositories(env: Env, id: string) {
  forgetRepositoryMemory(id);
  const response = await env.SESSIONS.get(env.SESSIONS.idFromName(id)).fetch(
    new Request("https://session.internal/repository-cache", { method: "DELETE" }),
  );
  if (!response.ok) throw new HttpError(502, "Could not switch accounts. Try again.");
}

// An isolate's first request is marked `cold` in its Server-Timing.
let warm = false;

export async function handle(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
  ctx?: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response> {
  const url = new URL(request.url);
  const timing = url.pathname.startsWith("/api/") ? startTiming(request, !warm) : undefined;
  warm = true;
  fetcher = requestFetch(fetcher, timing, ctx && ((promise) => ctx.waitUntil(promise)));
  let response: Response;
  try {
    response = await route(request, env, url, fetcher, ctx);
  } catch (error) {
    const quota = !(error instanceof HttpError) && isDailyQuotaError(error);
    const status = error instanceof HttpError ? error.status : quota ? 503 : 500;
    // Unexpected errors reach the user as a plain "Something went wrong":
    // their cause goes to the Worker's logs.
    if (quota) console.error(`${request.method} ${url.pathname} failed: daily quota exhausted`);
    else if (!(error instanceof HttpError))
      console.error(`${request.method} ${url.pathname} failed:`, error instanceof Error ? error.stack ?? error.message : error);
    const message =
      error instanceof HttpError
        ? error.message
        : quota ? "The editor's service has used up today's allowance. It resets at midnight UTC."
        : "Something went wrong. Please try again.";
    response = ["/auth/login", "/auth/install", "/auth/callback"].includes(url.pathname)
      ? redirect(`/?error=${encodeURIComponent(message)}`, [
          setCookie(url, "oauth", "", 0),
          setCookie(url, "install", "", 0),
        ])
      : json(
          {
            error: message,
            ...(quota ? { error: message, code: "daily-quota", resetAt: nextUtcMidnight(Date.now()) } satisfies AgentQuotaBody : {}),
            ...(error instanceof SignedOutError ? { code: error.code } : {}),
            ...(error instanceof HttpError && error.conflicts
              ? { conflicts: error.conflicts, gone: error.gone ?? [] }
              : {}),
          },
          status,
        );
  }
  // Preserve the runtime's WebSocket endpoint on a successful upgrade.
  if (response.status === 101) return response;
  const secured = new Response(response.body, response);
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("Referrer-Policy", "no-referrer");
  secured.headers.set("X-Frame-Options", "DENY");
  if (url.pathname === "/mcp" && response.status === 401)
    secured.headers.set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${resourceMetadataUrl(url.origin)}", scope="site"`,
    );
  if (
    (url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/auth/") ||
      url.pathname === "/mcp") &&
    !(url.pathname === "/api/blob" && request.method === "GET" && response.ok)
  )
    secured.headers.set("Cache-Control", "no-store");
  if (timing) secured.headers.set("Server-Timing", timing.header());
  return secured;
}

// Ticket 07 rollback: stale tabs still cost Worker requests until reloaded, never DO work.
const OBSOLETE_AGENT_ROUTES = new Set([
  "/api/agent/hub", "/api/agent/context", "/api/agent/drafts", "/api/agent/claim",
  "/api/agent/ack", "/api/agent/pause", "/api/agent/ask", "/api/agent/answer", "/api/agent/dismiss",
]);

/** The live room access check (ADR 0003): editor sign-in to a repository the GitHub connection
 * lists, or an agent connection pinned to this repository and branch. Encryption keeps strangers
 * from reading edits; this keeps them from joining at all. A synced session's guests come in by its own route
 * (`/api/live/guest`, slice 30) into that session's room only.
 * A plain request (no upgrade) gets the same answer, so a tab can tell "refused" from "network" (426 when allowed). */
async function liveRoomAccess(request: Request, env: Env, url: URL, fetcher: typeof fetch, fullName: string, branch: string): Promise<{ repoId: number; access: LiveAccess; agent?: LiveAgent }> {
  if (request.headers.has("Authorization")) {
    if (!agentControls(env).relay) throw new HttpError(403, AGENTS_PAUSED);
    const connection = await authenticateAgent(request, env, fetcher);
    // GitHub names are case-insensitive; the repository id is the identity (authenticateAgent checked it).
    if (connection.workspace.repo.toLowerCase() !== fullName.toLowerCase() || connection.workspace.branch !== branch)
      throw new HttpError(403, "This agent connection is for another repository or branch.");
    const { repoId } = connection.workspace;
    return { repoId, access: "agent", agent: { id: connection.id, sessionId: connection.grant.sessionId, generation: connection.grant.generation, repoId, branch } };
  }
  // Only a socket can carry the room's traffic to another site's page: plain requests learn a status, nothing more.
  if (request.headers.has("Upgrade") && request.headers.get("Origin") !== url.origin) throw new HttpError(403, "Invalid request origin.");
  const user = await session(request, env);
  if (!user) throw new SignedOutError(401, "Connect GitHub to join a live room.");
  const repo = await sessionGitHub(user, env, fetcher).authorizeRepository(user.login, fullName);
  return { repoId: repo.id, access: "editor" };
}

const hexOf = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
/** Two hex strings compared in time that does not depend on where they differ. */
function sameHex(a: string, b: string) {
  let differ = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index++) differ |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return differ === 0;
}
/** Synced sessions' tags (slice 30), keyed from the GitHub App's secret, which only this Worker holds: a token's tag over
 * its 128 random bits, and the sharing tab's proof over them, its login and repository id. None before the App exists. */
async function liveSessionKeys(env: Env) {
  const app = await config(env);
  if (!app) return undefined;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`native-site-editor live session v1\0${app.clientSecret}`),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const tag = async (text: string) => hexOf(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text))));
  return {
    guest: async (nonce: string) => (await tag(`guest\0${nonce}`)).slice(0, 32),
    host: (nonce: string, login: string, repoId: number) => tag(`host\0${nonce}\0${login.toLowerCase()}\0${repoId}`),
    // A preview link's (slice 35): its tag covers when it ends, so a changed end is a made-up link.
    preview: async (nonce: string, ends: string) => (await tag(`preview\0${nonce}\0${ends}`)).slice(0, 32),
    previewHost: (nonce: string, login: string, repoId: number) => tag(`preview-host\0${nonce}\0${login.toLowerCase()}\0${repoId}`),
  };
}

/**
 * A preview link (slice 35; shared/preview-link.ts). The signed-in share call (POST `/api/live/preview`) mints it: a
 * token whose tag covers when it ends, and the sharing tab's own proof, never in the link. That tab holds the link's
 * room open with both (GET `/api/live/preview`, a socket) whenever the editor is open on the site; visitors join with
 * the token alone (`/api/live/visit`), through the preview Worker's service binding, so their pages never reach this
 * origin. A plain visit request learns whether the preview runs (204), not now (409), or is over (410). Turning it off
 * (POST `/api/live/preview/off`, with the proof) closes every socket and refuses the link until it would have ended.
 */
async function previewRoute(request: Request, env: Env, url: URL, fetcher: typeof fetch): Promise<Response> {
  const keys = await liveSessionKeys(env), address = previewOrigin(env);
  const path = url.pathname;
  if (path === "/api/live/preview" && request.method === "POST") {
    if (request.headers.get("Origin") !== url.origin) throw new HttpError(403, "Invalid request origin.");
    const user = await session(request, env);
    if (!user) throw new SignedOutError(401, "Connect GitHub to share a preview.");
    const data = await requestJson(request, 4096);
    if (!validAgentBranch(data?.branch)) throw new HttpError(400, "Choose a repository and branch.");
    const repo = await sessionGitHub(user, env, fetcher).authorizeRepository(user.login, String(data?.repo ?? ""));
    if (!keys || !address) throw new HttpError(503, "Preview links are not set up on this editor.");
    const nonce = hexOf(crypto.getRandomValues(new Uint8Array(16)));
    const ends = Math.floor(Date.now() / 1000) + PREVIEW_DAYS * 86_400;
    const endsHex = ends.toString(16).padStart(8, "0");
    const token = nonce + endsHex + await keys.preview(nonce, endsHex);
    // The link's address, its key still to come after `#` (the tab makes it): the site's name, then the token.
    const link = `${address}/s/${previewSlug(typeof data?.site === "string" ? data.site : repo.name)}-${token}/`;
    return json({ token, host: await keys.previewHost(nonce, user.login, repo.id), link, ends: ends * 1000 });
  }
  const token = url.searchParams.get("token") ?? "", rejoin = url.searchParams.get("rejoin");
  if (url.searchParams.getAll("token").length !== 1 || !PREVIEW_TOKEN.test(token) || url.searchParams.getAll("rejoin").length > 1 ||
    (rejoin !== null && !/^[a-f\d]{32}$/.test(rejoin)) || !keys || !sameHex(token.slice(40), await keys.preview(token.slice(0, 32), token.slice(32, 40))))
    throw new HttpError(400, "This preview link is not valid.");
  if (previewTokenEnds(token) <= Date.now()) throw new HttpError(410, "This preview link has ended.");
  const nonce = token.slice(0, 32), ends = previewTokenEnds(token);
  const store = env.SESSIONS.get(env.SESSIONS.idFromName(await livePreviewObjectName(nonce)));
  // Lex's own calls: signed in, from this editor, with access to the repository and the proof the share call gave his tab.
  const owner = async (repoName: string, proof: string) => {
    const user = await session(request, env);
    if (!user) throw new SignedOutError(401, "Connect GitHub to share a preview.");
    const repo = await sessionGitHub(user, env, fetcher).authorizeRepository(user.login, repoName);
    if (!PREVIEW_HOST.test(proof) || !sameHex(proof, await keys.previewHost(nonce, user.login, repo.id))) throw new HttpError(403, "This preview link is someone else's.");
  };
  if (path === "/api/live/preview/off") {
    if (request.method !== "POST") throw new HttpError(405, "Use POST.");
    if (request.headers.get("Origin") !== url.origin) throw new HttpError(403, "Invalid request origin.");
    const data = await requestJson(request, 4096);
    await owner(String(data?.repo ?? ""), String(data?.host ?? ""));
    const done = await store.fetch(new Request("https://session.internal/live/preview-off", { method: "POST", headers: { [LiveRooms.identityHeader]: JSON.stringify({ ends }) } }));
    if (!done.ok) throw new HttpError(502, "The preview link could not be turned off.");
    return new Response(null, { status: 204 });
  }
  if (request.method !== "GET") throw new HttpError(405, "Use GET.");
  const hosting = path === "/api/live/preview";
  // Only a socket carries the room's traffic: a page of another site learns a status, nothing more. Visitors come
  // through the preview Worker, whose forwarded requests carry no Origin; a browser may come only from that Worker's address.
  const from = request.headers.get("Origin");
  if (request.headers.has("Upgrade") && from !== null && from !== (hosting ? url.origin : address)) throw new HttpError(403, "Invalid request origin.");
  if (hosting) {
    if (["repo", "host"].some(key => url.searchParams.getAll(key).length !== 1)) throw new HttpError(400, "Choose a repository.");
    await owner(url.searchParams.get("repo") ?? "", url.searchParams.get("host") ?? "");
  }
  const identity = { room: await livePreviewRoomTag(), access: hosting ? "editor" : "guest", preview: true, ...(rejoin === null ? {} : { rejoin }) };
  const headers = { [LiveRooms.identityHeader]: JSON.stringify(identity) };
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    const admits = (await store.fetch(new Request("https://session.internal/live/admits", { headers }))).status;
    if (admits === 410) throw new HttpError(410, "This preview link is turned off.");
    if (hosting) throw new HttpError(426, "Use a WebSocket upgrade.");
    if (admits !== 204) throw new HttpError(409, "This preview is not running: the editor is closed.");
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  // Fresh headers: no cookie crosses into the room. A visitor is refused there (409) while no editor holds it.
  return store.fetch(new Request("https://session.internal/live/join", { headers: { Upgrade: "websocket", ...headers } }));
}

/** Whether an agent in a live room may stay: its connection is still listed for this repository and branch, at the
 * same generation, within its 8 hours, with agents not paused. One hub read; undefined when the hub cannot be read. */
export async function liveAgentAllowed(env: Env, agent: LiveAgent): Promise<boolean | undefined> {
  if (!agentControls(env).relay) return false;
  let hub: AgentHub | undefined;
  try { hub = await getHub(env, agent.sessionId); } catch { return undefined; }
  const listed = hub?.grants.find(grant => grant.id === agent.id);
  return listed !== undefined && listed.repoId === agent.repoId && listed.branch === agent.branch &&
    listed.generation === agent.generation && listed.createdAt + AGENT_PERMISSION_LIFETIME > Date.now();
}

async function route(
  request: Request,
  env: Env,
  url: URL,
  fetcher: typeof fetch,
  ctx?: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response> {
  const path = url.pathname;
  if (OBSOLETE_AGENT_ROUTES.has(path)) return Response.json({
    error: "This editor was updated. Reload this tab to keep using agents.", code: "editor-updated",
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
  if (!agentControls(env).relay) {
    if (path === "/mcp") {
      const { pausedMcp } = await import("./mcp");
      const body = request.method === "POST" ? await requestJson(request, 3 * 1024 * 1024) : undefined;
      return pausedMcp(body);
    }
    if (["/api/agent/relay", "/api/agent/connect", "/api/agent/rebind", "/api/agent/connections"].includes(path))
      return agentsPaused();
  }
  if (path === "/__maintenance/cleanup") return cleanupRoute(request, env);
  // GitHub's own deliveries: no sign-in or origin, only the webhook secret's signature (worker/github-webhook.ts).
  if (path === GITHUB_WEBHOOK_PATH) return githubWebhook(request, env);
  if (path === "/__maintenance/inventory") return inventoryRoute(request, env);
  if (isOAuthPath(path))
    return handleOAuth(request, env, url, {
      session: (request) => sessionWithId(request, env),
      html,
      fetcher,
    });
  if (path === "/auth/logout") {
    if (request.method !== "POST")
      throw new HttpError(405, "Use POST to disconnect.");
    if (request.headers.get("Origin") !== url.origin)
      throw new HttpError(403, "Invalid request origin.");
    // Signing out of one account moves to the next one still signed in.
    const id = cookie(request, "session");
    if (id) await endSessionGrants(env, id, () => store(env, id, "DELETE"));
    const rest: { id: string; user: Session }[] = [];
    for (const other of accountIds(request).filter((other) => other !== id)) {
      const user = await loadSession(env, other);
      if (user) rest.push({ id: other, user });
    }
    const headers = new Headers();
    const next = rest[0];
    if (next) await invalidateRepositories(env, next.id);
    headers.append(
      "Set-Cookie",
      next
        ? setCookie(url, "session", next.id, sessionMaxAge(next.user))
        : setCookie(url, "session", "", 0),
    );
    headers.append(
      "Set-Cookie",
      setCookie(url, "accounts", rest.map((entry) => entry.id).join("."), rest.length ? accountsLifetime : 0),
    );
    return next
      ? Response.json({ login: next.user.login }, { headers })
      : new Response(null, { status: 204, headers });
  }
  if (path === "/api/accounts/switch") {
    if (request.method !== "POST")
      throw new HttpError(405, "Use POST to switch accounts.");
    if (request.headers.get("Origin") !== url.origin)
      throw new HttpError(403, "Invalid request origin.");
    const data = await requestJson(request, 1024);
    const login = typeof data?.login === "string" ? data.login.toLowerCase() : "";
    for (const id of accountIds(request)) {
      const user = await loadSession(env, id);
      if (user && user.login.toLowerCase() === login) {
        await Promise.all([...new Set([id, cookie(request, "session")].filter((value): value is string => Boolean(value)))].map((other) => invalidateRepositories(env, other)));
        return new Response(null, {
          status: 204,
          headers: { "Set-Cookie": setCookie(url, "session", id, sessionMaxAge(user)) },
        });
      }
    }
    throw new HttpError(404, "That account's sign-in ended. Add it again.");
  }
  if (
    (path.startsWith("/api/") || path.startsWith("/auth/")) &&
    request.method !== "GET" &&
    !(
      (path === "/api/publish" ||
        path === "/api/blob" ||
        path === "/api/restore" ||
        path === "/api/repositories" ||
        path === "/auth/setup/unlock" ||
        path === "/api/accounts/switch" ||
        path === "/api/live/share" ||
        path === "/api/live/preview" ||
        path === "/api/live/preview/off" ||
        path.startsWith("/api/publish/") ||
        path.startsWith("/api/agent/")) &&
      request.method === "POST"
    )
  )
    throw new HttpError(405, "Method not allowed.");

  if (path.startsWith("/auth/setup")) {
    if (url.origin !== editorOrigin(env, url.origin))
      throw new HttpError(403, "Owner setup uses the editor's own address (EDITOR_ORIGIN).");
    if (!hasOwnerSetup(env) && path !== "/auth/setup.js")
      throw new HttpError(404, "Owner setup is not enabled.");
    if (path === "/auth/setup.js")
      return new Response(ownerSetupJs(), {
        headers: {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    if (path === "/auth/setup/unlock") {
      if (request.headers.get("Origin") !== url.origin)
        throw new HttpError(403, "Invalid request origin.");
      if (await config(env))
        throw new HttpError(409, "This editor already has a GitHub App.");
      const token = await setupPayload(request);
      if (!validOwnerToken(token) || token !== env.OWNER_SETUP_TOKEN)
        throw new HttpError(403, "Invalid owner setup link.");
      const id = randomId();
      await store(env, id, "PUT", {
        kind: "owner-setup",
        expiresAt: Date.now() + 600_000,
      });
      const response = json({ ok: true, state: id });
      response.headers.append("Set-Cookie", setCookie(url, "setup", id, 600));
      return response;
    }
    if (path === "/auth/setup/status") {
      const app = await config(env);
      return json({
        configured: Boolean(app),
        // Owner setup installs through /auth/install, so the sign-in that follows has a state.
        installUrl: app ? "/auth/install" : null,
      });
    }
    const app = await config(env);
    const installUrl = app ? "/auth/install" : undefined;
    const owner = ownerLogin(env);
    const setupId = cookie(request, "setup");
    let setupState = "";
    if (setupId && !app) {
      const stateResponse = await store(env, setupId);
      if (stateResponse.ok) {
        const state = (await stateResponse.json()) as StoredValue;
        if (isOwnerSetupState(state) && state.expiresAt > Date.now())
          setupState = setupId;
      }
    }
    if (path === "/auth/setup") {
      // Only a refusal the callback made is shown, built here from checked
      // names, so a link cannot put its own words on this page.
      const refused = url.searchParams.get("refused") ?? "";
      const refusedSlug = url.searchParams.get("slug") ?? "";
      const error =
        owner && githubName(refused) && /^[a-z0-9-]{1,64}$/.test(refusedSlug)
          ? `GitHub made the App on @${refused}, but this editor belongs to @${owner} (OWNER_GITHUB). Nothing was saved. Sign in to GitHub as @${owner} and try again, and delete the extra App at https://github.com/settings/apps/${refusedSlug}/advanced.`
          : undefined;
      // With OWNER_GITHUB there is no private link to unlock: opening the page
      // starts setup, and the callback checks who owns the App GitHub made.
      if (owner && !app && !setupState && !error) {
        const id = randomId();
        await store(env, id, "PUT", { kind: "owner-setup", expiresAt: Date.now() + 600_000 });
        const page = html(ownerSetupHtml(url.origin, { state: id, aliases: aliasOrigins(env), owner }));
        page.headers.append("Set-Cookie", setCookie(url, "setup", id, 600));
        return page;
      }
      return html(ownerSetupHtml(url.origin, { state: setupState, installUrl, aliases: aliasOrigins(env), owner, error }));
    }
    if (path === "/auth/setup/manifest") return json(githubAppManifest(url.origin, aliasOrigins(env), owner));
    if (path === "/auth/setup/callback") {
      if (app) return redirect("/auth/setup");
      if (!setupId || setupId !== url.searchParams.get("state"))
        throw new HttpError(403, "Owner setup expired.");
      const stateResponse = await store(env, setupId, "POST", undefined, true);
      if (!stateResponse.ok) throw new HttpError(403, "Owner setup expired.");
      const state = (await stateResponse.json()) as StoredValue;
      if (
        !isOwnerSetupState(state) ||
        state.expiresAt <= Date.now()
      )
        throw new HttpError(403, "Owner setup expired.");
      const { owner: appOwner, ...next } = await convertManifest(
        url.searchParams.get("code") ?? "",
        fetcher,
      );
      if (owner && appOwner.toLowerCase() !== owner.toLowerCase())
        return redirect(
          `/auth/setup?${new URLSearchParams({ refused: appOwner, slug: next.slug })}`,
          [setCookie(url, "setup", "", 0)],
        );
      await writeConfiguredApp(env, next);
      // Straight on to installing the App, which also signs the owner in.
      return redirect(owner ? "/auth/install" : "/auth/setup", [setCookie(url, "setup", "", 0)]);
    }
    throw new HttpError(404, "Owner setup endpoint not found.");
  }

  if (path === "/mcp") {
    if (
      request.headers.has("Origin") &&
      request.headers.get("Origin") !== url.origin
    )
      throw new HttpError(403, "Invalid request origin.");
    const connection = await authenticateAgent(request, env, fetcher);
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    // A write carries a whole file (up to AGENT_TEXT_LIMIT), escaped as JSON.
    const body = await requestJson(request, 3 * 1024 * 1024);
    // The first request of a connection marks it used; an MCP client names
    // itself in `initialize`.
    await markGrantUsed(
      env,
      connection.id,
      connection.grant,
      connection.hub,
      body?.method === "initialize" ? body.params?.clientInfo?.name : undefined,
    ).catch((error) => {
      // The hub still lists it unused, so the next request tries again.
      console.error("agent connection's first use not recorded:", error instanceof Error ? error.message : error);
    });
    // Loaded on first use: the MCP server and its schema library are most of
    // the bundle, and most isolates never serve /mcp.
    const { handleMcp } = await import("./mcp");
    return handleMcp(request, connection, env, body, ctx);
  }
  if (path === "/api/agent/relay") {
    // Cheap refusals happen before even the sign-in DO is read.
    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      throw new HttpError(400, "Use a WebSocket upgrade.");
    if (request.headers.get("Origin") !== url.origin)
      throw new HttpError(403, "Invalid request origin.");
    const branch = url.searchParams.get("branch");
    if (["repo", "branch", "tabId", "generation"].some(key => url.searchParams.getAll(key).length !== 1) || !validAgentBranch(branch))
      throw new HttpError(400, "Choose a repository and branch.");
    const user = await session(request, env);
    if (!user) throw new SignedOutError(401, "Connect GitHub to use agent context.");
    const repo = await sessionGitHub(user, env, fetcher).authorizeRepository(user.login, url.searchParams.get("repo") ?? "");
    const scope = AgentRelay.readScope({ workspace: { account: user.login, repoId: repo.id, branch }, tabId: url.searchParams.get("tabId"), generation: Number(url.searchParams.get("generation")) });
    if (!scope) throw new HttpError(400, "Choose an editor tab and owner generation.");
    // Build fresh headers: no client-supplied trusted identity, cookies or bearer
    // credentials cross into the workspace relay.
    return env.SESSIONS.get(env.SESSIONS.idFromName(await relayObjectName(scope.workspace))).fetch(
      new Request("https://session.internal/relay/connect", { headers: { Upgrade: "websocket", [AgentRelay.identityHeader]: JSON.stringify(scope) } }),
    );
  }
  if (path === "/api/live/room") {
    if (request.method !== "GET") throw new HttpError(405, "Use GET.");
    const branch = url.searchParams.get("branch"), file = url.searchParams.get("file"), rejoin = url.searchParams.get("rejoin");
    if (["repo", "branch", "file"].some(key => url.searchParams.getAll(key).length !== 1) || url.searchParams.getAll("rejoin").length > 1 ||
      !validAgentBranch(branch) || !liveRoomFile(file) || (rejoin !== null && !/^[a-f\d]{32}$/.test(rejoin)))
      throw new HttpError(400, "Choose a repository, branch and file.");
    const { repoId, access, agent } = await liveRoomAccess(request, env, url, fetcher, url.searchParams.get("repo") ?? "", branch);
    // Allowed in: a plain request learns only that (426), apart from the final 400, 401 and 403 above.
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") throw new HttpError(426, "Use a WebSocket upgrade.");
    // Fresh headers: no cookie or bearer credential crosses into the room.
    const identity = { room: await liveRoomTag(file), access, ...(rejoin === null ? {} : { rejoin }), ...(agent ? { agent } : {}) };
    return env.SESSIONS.get(env.SESSIONS.idFromName(await liveRoomObjectName(repoId, branch))).fetch(
      new Request("https://session.internal/live/join", { headers: { Upgrade: "websocket", [LiveRooms.identityHeader]: JSON.stringify(identity) } }),
    );
  }
  // A synced session (slice 30). The signed-in share call (POST) mints the session: a token whose tag only this Worker
  // can make, and the sharing tab's own proof, bound to its sign-in and repository and never in the link. The sharing
  // tab holds the room open with both; a guest joins with the link's token alone. A made-up token is refused here,
  // before any relay instance wakes. Each session has its own instance and room, named from the token, so a link never
  // reaches a site's file rooms. The room key stays after `#` in the link: neither route sees it.
  if (path === "/api/live/preview" || path === "/api/live/preview/off" || path === "/api/live/visit") return previewRoute(request, env, url, fetcher);
  if (path === "/api/live/share" || path === "/api/live/guest") {
    const sharing = path === "/api/live/share";
    const keys = await liveSessionKeys(env);
    if (sharing && request.method === "POST") {
      if (request.headers.get("Origin") !== url.origin) throw new HttpError(403, "Invalid request origin.");
      const user = await session(request, env);
      if (!user) throw new SignedOutError(401, "Connect GitHub to share this site.");
      const data = await requestJson(request, 4096);
      if (!validAgentBranch(data?.branch)) throw new HttpError(400, "Choose a repository and branch.");
      const repo = await sessionGitHub(user, env, fetcher).authorizeRepository(user.login, String(data?.repo ?? ""));
      if (!keys) throw new HttpError(503, "This editor is not set up yet.");
      const nonce = hexOf(crypto.getRandomValues(new Uint8Array(16)));
      return json({ session: nonce + await keys.guest(nonce), host: await keys.host(nonce, user.login, repo.id) });
    }
    if (request.method !== "GET") throw new HttpError(405, "Use GET.");
    const token = url.searchParams.get("session") ?? "", rejoin = url.searchParams.get("rejoin");
    if (url.searchParams.getAll("session").length !== 1 || !LIVE_SESSION_TOKEN.test(token) || url.searchParams.getAll("rejoin").length > 1 ||
      (rejoin !== null && !/^[a-f\d]{32}$/.test(rejoin)) || !keys || !sameHex(token.slice(32), await keys.guest(token.slice(0, 32))))
      throw new HttpError(400, "This edit link is not valid.");
    // Only a socket carries the room's traffic: another site's page learns a status, nothing more.
    if (request.headers.has("Upgrade") && request.headers.get("Origin") !== url.origin) throw new HttpError(403, "Invalid request origin.");
    if (sharing) {
      const branch = url.searchParams.get("branch"), host = url.searchParams.get("host") ?? "";
      if (["repo", "branch", "host"].some(key => url.searchParams.getAll(key).length !== 1) || !validAgentBranch(branch) || !LIVE_SESSION_HOST.test(host))
        throw new HttpError(400, "Choose a repository and branch.");
      const user = await session(request, env);
      if (!user) throw new SignedOutError(401, "Connect GitHub to share this site.");
      const repo = await sessionGitHub(user, env, fetcher).authorizeRepository(user.login, url.searchParams.get("repo") ?? "");
      // Only the tab that started the session holds it: another sign-in with the link stays a guest at most.
      if (!sameHex(host, await keys.host(token.slice(0, 32), user.login, repo.id))) throw new HttpError(403, "This session is someone else's.");
    }
    const access: LiveAccess = sharing ? "editor" : "guest";
    const identity = { room: await liveSessionRoomTag(), access, ...(rejoin === null ? {} : { rejoin }) };
    const store = env.SESSIONS.get(env.SESSIONS.idFromName(await liveSessionObjectName(token)));
    const headers = { [LiveRooms.identityHeader]: JSON.stringify(identity) };
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      // A guest's plain request learns whether the session is still open: its link refuses once it ended.
      if (!sharing && (await store.fetch(new Request("https://session.internal/live/admits", { headers }))).status !== 204)
        throw new HttpError(410, "This edit link has ended.");
      throw new HttpError(426, "Use a WebSocket upgrade.");
    }
    // Fresh headers: no cookie crosses into the room. A guest is refused there (409) once no sharing tab holds it.
    return store.fetch(new Request("https://session.internal/live/join", { headers: { Upgrade: "websocket", ...headers } }));
  }
  if (path.startsWith("/api/agent/")) {
    const user = await session(request, env);
    if (!user) throw new SignedOutError(401, "Connect GitHub to use agent context.");
    const sessionId = cookie(request, "session")!;
    if (
      request.method === "POST" &&
      request.headers.get("Origin") !== url.origin
    )
      throw new HttpError(403, "Invalid request origin.");
    if ((path === "/api/agent/connect" || path === "/api/agent/rebind") && request.method === "POST") {
      const data = await requestJson(request, 4096);
      if (!validAgentBranch(data?.branch)) throw new HttpError(400, "Choose a valid branch.");
      const previous = path === "/api/agent/rebind" ? await getGrant(env, String(data?.id ?? "")) : undefined;
      if (previous && (previous.sessionId !== sessionId || previous.login !== user.login))
        throw new HttpError(403, "This connection belongs to another editor session.");
      const repo = await sessionGitHub(user, env, fetcher).authorizeRepository(
        user.login,
        data?.repo ?? "",
      );
      if (repo.id !== data.repoId)
        throw new HttpError(403, "Repository changed. Reload and try again.");
      if (previous) {
        const grant = await rebindGrant(env, data.id, previous, { repoId: repo.id, repo: repo.full_name, branch: data.branch });
        return json({ ok: true, generation: grant.generation });
      }
      const { id, token, expiresAt } = await createGrant(env, {
        sessionId,
        login: user.login,
        repoId: repo.id,
        repo: repo.full_name,
        branch: data.branch,
        expiresAt: user.expiresAt,
        via: "token",
      });
      return json({
        id,
        token,
        endpoint: `${url.origin}/mcp`,
        expiresAt,
      });
    }
    // Explicit connection checks only; old bundles' polling uses the obsolete /hub route.
    if (path === "/api/agent/connections" && request.method === "GET") {
      const hub = await getHub(env, sessionId);
      // A permission past its 8 hours is gone even while the sign-in lasts: the tab forgets its site.
      const grants = (hub?.grants ?? []).filter(grant => grant.createdAt + AGENT_PERMISSION_LIFETIME > Date.now());
      return json({ grants, controls: { watch: agentControls(env).watch } });
    }
    if (path === "/api/agent/revoke" && request.method === "POST") {
      const data = await requestJson(request, 4096);
      const ids: string[] = data?.all
        ? ((await getHub(env, sessionId))?.grants ?? [])
            .filter((grant) => (data.repoId === undefined || grant.repoId === data.repoId) && (data.branch === undefined || grant.branch === data.branch))
            .map((grant) => grant.id)
        : [String(data?.id ?? "")];
      for (const id of ids) {
        const grant = await getGrant(env, id).catch(() => undefined);
        if (grant && (grant.sessionId !== sessionId || grant.login !== user.login))
          throw new HttpError(403, "This connection belongs to another editor session.");
        if (grant || /^[a-f0-9]{64}$/.test(id)) await revokeGrant(env, id, sessionId);
        // Its agents leave their live room now; sign-out, rebinding and the 8 hours are caught by the room's own check.
        if (grant) await env.SESSIONS.get(env.SESSIONS.idFromName(await liveRoomObjectName(grant.repoId, grant.branch))).fetch(
          new Request("https://session.internal/live/end-agent", { method: "POST", headers: { [LiveRooms.identityHeader]: JSON.stringify({ agent: { id } }) } }),
        ).catch(() => undefined);
      }
      return json({ ok: true, revoked: ids.length });
    }
    throw new HttpError(404, "Agent endpoint not found.");
  }
  if (path === "/auth/login") {
    const app = await config(env);
    if (!app)
      throw new HttpError(
        503,
        "GitHub connection is not configured. Use the owner setup link for this editor.",
      );
    const id = randomId();
    const returnTo = url.searchParams.get("return") ?? "";
    await store(env, id, "PUT", {
      kind: "oauth",
      expiresAt: Date.now() + 600_000,
      ...(returnTo.startsWith("/auth/mcp/authorize?") && returnTo.length < 4096
        ? { returnTo }
        : {}),
      // A sign-in the stateless install return hands on to: it ends the install trip.
      ...(url.searchParams.get("from") === "install" ? { fromInstall: true } : {}),
    });
    const target = new URL("https://github.com/login/oauth/authorize");
    target.searchParams.set("client_id", app.clientId);
    target.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
    target.searchParams.set("state", id);
    // Adding an account asks GitHub to show its account picker; signing an
    // expired account back in names it.
    const account = url.searchParams.get("login") ?? "";
    if (/^[A-Za-z0-9-]{1,39}$/.test(account)) target.searchParams.set("login", account);
    if (url.searchParams.has("add")) target.searchParams.set("prompt", "select_account");
    // A fresh sign-in forgets an install trip left unfinished (cancelled on
    // GitHub): without the pending cookie it can start the trip again.
    return redirect(target.href, [setCookie(url, "oauth", id, 600), setCookie(url, "install", "", 0)]);
  }
  // One trip to GitHub for a new user: the App's installation page, which
  // (with "Request user authorization during installation" on) signs the user
  // in on the way back. The state goes in the install URL in case GitHub
  // passes it back; an "install pending" cookie covers the case it does not.
  if (path === "/auth/install") {
    const app = await config(env);
    if (!app)
      throw new HttpError(
        503,
        "GitHub connection is not configured. Use the owner setup link for this editor.",
      );
    const state = randomId();
    const nonce = randomId();
    await store(env, state, "PUT", { kind: "oauth", expiresAt: Date.now() + 600_000, fromInstall: true });
    await store(env, nonce, "PUT", { kind: "install", expiresAt: Date.now() + 600_000 });
    const target = new URL(`https://github.com/apps/${encodeURIComponent(app.slug)}/installations/new`);
    target.searchParams.set("state", state);
    return redirect(target.href, [setCookie(url, "oauth", state, 600), setCookie(url, "install", nonce, 600)]);
  }
  if (path === "/auth/callback") {
    // GitHub sends a sign-in made while installing to the App's first callback
    // URL, which may be an alias (EDITOR_ALIASES). Without a sign-in started
    // here (no oauth cookie on this address), hand it on to the editor's own
    // address, where the browser's cookies are.
    const canonical = editorOrigin(env, url.origin);
    if (canonical !== url.origin && !cookie(request, "oauth"))
      return redirect(`${canonical}${url.pathname}${url.search}`);
    // A code is only ever exchanged with a state that is the one this browser
    // holds (as for /auth/login), so a code cannot be planted on a browser by
    // sending it here. GitHub may not send the state back after an install
    // (with "Request user authorization during installation" on). A hit
    // without it, from a browser that visited /auth/install a moment ago (an
    // unused, unexpired install pending cookie), is not signed in: its code is
    // discarded and the browser goes to /auth/login, a fresh flow with its own
    // state, which GitHub completes without a prompt for a user who just
    // authorized. Anything else is refused. Which case happened is logged,
    // never the code or a token.
    const returnedState = url.searchParams.get("state");
    const oauthCookie = cookie(request, "oauth");
    const installCookie = cookie(request, "install");
    const seen = `installation_id=${url.searchParams.has("installation_id")}`;
    let state: StoredSession;
    if (returnedState !== null && returnedState !== "") {
      if (!oauthCookie || oauthCookie !== returnedState) {
        console.log(`auth callback refused: state does not match the browser (${seen})`);
        throw new HttpError(400, "GitHub sign-in expired or could not be verified. Connect again.");
      }
      const stateResponse = await store(env, oauthCookie, "POST", undefined, true);
      if (!stateResponse.ok) throw new HttpError(400, "GitHub sign-in expired. Connect again.");
      state = (await stateResponse.json()) as StoredSession;
      if (state.kind !== "oauth" || state.expiresAt <= Date.now())
        throw new HttpError(400, "GitHub sign-in expired. Connect again.");
      // An install started this sign-in: its pending cookie is spent too.
      if (installCookie) await store(env, installCookie, "DELETE");
    } else {
      if (!installCookie) {
        console.log(`auth callback refused: no state and no install pending cookie (${seen})`);
        throw new HttpError(400, "GitHub sign-in expired or could not be verified. Connect again.");
      }
      const pendingResponse = await store(env, installCookie, "POST", undefined, true);
      const pending = pendingResponse.ok ? ((await pendingResponse.json()) as StoredSession) : undefined;
      if (!pending || pending.kind !== "install" || pending.expiresAt <= Date.now()) {
        console.log(`auth callback refused: install pending cookie expired or already used (${seen})`);
        throw new HttpError(400, "GitHub sign-in expired. Connect again.");
      }
      if (oauthCookie) await store(env, oauthCookie, "DELETE");
      console.log(`auth callback: stateless install return, code discarded, fresh login (${seen})`);
      return redirect("/auth/login?from=install", [setCookie(url, "oauth", "", 0), setCookie(url, "install", "", 0)]);
    }
    console.log(`auth callback accepted: via=state (${seen})`);
    const code = url.searchParams.get("code");
    const app = await config(env);
    if (!code || code.length > 512 || !app)
      throw new HttpError(
        400,
        "GitHub access was not granted. Connect again when ready.",
      );
    const exchange = await fetcher(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: app.clientId,
          client_secret: app.clientSecret,
          code,
          redirect_uri: `${url.origin}/auth/callback`,
        }),
      },
    );
    if (!exchange.ok)
      throw new HttpError(502, "GitHub sign-in failed. Try again.");
    const token = (await exchange.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!token.access_token)
      throw new HttpError(401, "GitHub sign-in was not completed. Try again.");
    const user = await new GitHub(token.access_token, fetcher).get<{
      login: string;
      avatar_url: string;
    }>("/user");
    const id = randomId();
    const duration = Math.max(
      1,
      Math.min(token.expires_in ?? 28800, 28800) - 60,
    );
    await store(env, id, "PUT", {
      kind: "user",
      token: token.access_token,
      login: user.login,
      avatar_url: user.avatar_url,
      expiresAt: Date.now() + duration * 1000,
    });
    // Keep the other accounts signed in on this browser; a new sign-in to
    // an account already here replaces its old session.
    const kept: string[] = [];
    for (const other of accountIds(request)) {
      const existing = await loadSession(env, other);
      if (!existing) continue;
      if (
        existing.login.toLowerCase() === user.login.toLowerCase() ||
        kept.length >= maxAccounts - 1
      )
        await store(env, other, "DELETE");
      else kept.push(other);
    }
    // Where a new sign-in goes (the worker decides, so the browser never
    // shows a screen that only forwards): an account without the App installed
    // goes straight on to GitHub's install page, unless this sign-in already
    // ended an install trip (a user who cancelled it is not sent again: the
    // editor's Connect GitHub step offers the retry: /api/session's onboarding).
    let next = state.kind === "oauth" ? state.returnTo ?? "/" : "/";
    const fromInstall = Boolean(installCookie) || (state.kind === "oauth" && state.fromInstall === true);
    if (next === "/" && !fromInstall) {
      // A collaborator on someone else's site reaches its installation: they go straight in, not to install the App.
      const owners = await new GitHub(token.access_token, fetcher).reachableInstallations(user.login).catch(() => undefined);
      if (owners && owners.length === 0) next = "/auth/install";
    }
    return redirect(next, [
      setCookie(url, "session", id, duration),
      setCookie(url, "accounts", [id, ...kept].join("."), accountsLifetime),
      setCookie(url, "oauth", "", 0),
      setCookie(url, "install", "", 0),
    ]);
  }
  if (path === "/api/session") {
    const [user, app] = await Promise.all([
      session(request, env),
      timed(request, "config", config(env)),
    ]);
    const current = cookie(request, "session");
    const accounts = user ? await Promise.all(accountIds(request).map(async (id) => {
      const account = id === current ? user : await loadSession(env, id);
      return account ? { login: account.login, avatar_url: account.avatar_url, current: id === current } : null;
    })).then((list) => list.filter((account) => account !== null)) : undefined;
    return Response.json({
      configured: Boolean(app),
      user: user ? { login: user.login, avatar_url: user.avatar_url } : null,
      installUrl: app
        ? `https://github.com/apps/${encodeURIComponent(app.slug)}/installations/new`
        : null,
      ownerSetupUrl: !app && hasOwnerSetup(env) ? "/auth/setup" : null,
      // Setup without a private link (OWNER_GITHUB): the UI goes straight there.
      ownerSetupOpen: !app && Boolean(ownerLogin(env)),
      // Share preview shows only when a preview Worker is set up (slice 35).
      ...(previewOrigin(env) ? { previewLinks: true } : {}),
      ...(user ? { accounts } : {}),
    }, { headers: request.method === "GET" ? await bootSessionHeaders(user) : undefined });
  }
  if (path === "/api/publish") {
    if (request.method !== "POST")
      throw new HttpError(405, "Use POST to publish.");
    if (request.headers.get("Origin") !== url.origin)
      throw new HttpError(403, "Invalid request origin.");
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      throw new HttpError(415, "Send a JSON publish request.");
    const user = await session(request, env);
    if (!user)
      throw new HttpError(401, "Connect GitHub to publish your changes.");
    const data = await requestJson(request, MAX_PUBLISH_REQUEST_BYTES);
    const github = sessionGitHub(user, env, fetcher);
    const repo = await github.authorizeRepository(
      user.login,
      url.searchParams.get("repo") ?? "",
    );
    return json(await publish(github, repo, data));
  }
  if (path.startsWith("/api/publish/")) {
    // Publish to a host (worker/hosts.ts): Pages, Cloudflare and Spacefast pipelines.
    if (request.method === "POST" && request.headers.get("Origin") !== url.origin)
      throw new HttpError(403, "Invalid request origin.");
    const user = await session(request, env);
    if (!user) throw new HttpError(401, "Connect GitHub to publish your site.");
    return json(
      await publishHosts(request, url, sessionGitHub(user, env, fetcher), user.login, fetcher, readAuthorizationMaxAge),
    );
  }
  if (path === "/api/blob" && request.method !== "GET" && request.method !== "HEAD") {
    // An uploaded file's bytes, made a blob for the publish that follows.
    if (request.headers.get("Origin") !== url.origin)
      throw new HttpError(403, "Invalid request origin.");
    if (request.headers.get("Content-Type") !== "application/octet-stream")
      throw new HttpError(415, "Send the file's bytes.");
    const user = await session(request, env);
    if (!user)
      throw new HttpError(401, "Connect GitHub to publish your changes.");
    const github = sessionGitHub(user, env, fetcher);
    const repo = await github.authorizeRepository(
      user.login,
      url.searchParams.get("repo") ?? "",
    );
    const bytes = await requestBytes(request);
    return json(await uploadBlob(github, repo, bytes, url.searchParams.get("sha") ?? undefined));
  }
  if (path === "/api/restore") {
    if (request.method !== "POST")
      throw new HttpError(405, "Use POST to restore.");
    if (request.headers.get("Origin") !== url.origin)
      throw new HttpError(403, "Invalid request origin.");
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      throw new HttpError(415, "Send a JSON restore request.");
    const user = await session(request, env);
    if (!user) throw new HttpError(401, "Connect GitHub to restore this file.");
    const data = await requestJson(request, 4096);
    const github = sessionGitHub(user, env, fetcher);
    const repo = await github.authorizeRepository(
      user.login,
      url.searchParams.get("repo") ?? "",
    );
    return json(await restore(github, repo, data));
  }
  if (path.startsWith("/api/")) {
    const user = await session(request, env);
    if (!user)
      throw new HttpError(401, "Connect GitHub to browse your repositories.");
    const github = sessionGitHub(user, env, fetcher);
    // Get started: a new, empty repository on the signed-in account.
    if (path === "/api/repositories" && request.method === "POST") {
      if (request.headers.get("Origin") !== url.origin)
        throw new HttpError(403, "Invalid request origin.");
      const data = await requestJson(request, 4096);
      const point = data?.startingPoint === "starter" || data?.startingPoint === "blank" ? data.startingPoint : undefined;
      if (data?.startingPoint !== undefined && !point) throw new HttpError(400, "Choose the Starter site or a blank page.");
      const repository = await github.createRepository(user.login, {
        name: typeof data?.name === "string" ? data.name.trim() : "",
        owner: typeof data?.owner === "string" && data.owner ? data.owner.slice(0, 100) : undefined,
        private: data?.private === true,
        description: typeof data?.description === "string" ? data.description : undefined,
      });
      if (!point) return json(repository, 201);
      // Create site: the repository is made and the starting point is its
      // first commit. If committing fails the repository still exists, and
      // the editor falls back to Start your site (drafts) for it.
      let built: string[] = [];
      try {
        const files = await startingPointFiles(point, startingSiteName(data?.siteName, repository.name), starterProvider(env, fetcher));
        built = files.map((file) => file.path);
        const commit = await commitStartingPoint(
          github,
          repository,
          files,
          `Start the site from ${point === "starter" ? "the Starter site" : "a blank page"} with Native Site Editor`,
        );
        return json({ ...repository, commit }, 201);
      } catch (error) {
        console.error(`starting point for a new repository failed:`, error instanceof Error ? error.message : error);
        return json(
          {
            ...repository,
            // What GitHub has already got, so the editor can finish the rest without overwriting it.
            committed: error instanceof StartingPointError ? error.committed : [],
            missing: error instanceof StartingPointError ? error.missing : built,
            startingPointError:
              error instanceof HttpError ? error.message : "The starting point could not be added. The editor will start the site from the repository instead.",
          },
          201,
        );
      }
    }
    if (path === "/api/repositories") {
      const repositories = await github.repositories(user.login, url.searchParams.get("refresh") === "1" ? 0 : readAuthorizationMaxAge);
      const headers = request.method === "GET" ? await bootSessionHeaders(user) : new Headers();
      headers.set("X-Repository-Onboarding", github.repositoryOnboarding());
      return Response.json(repositories, { headers });
    }
    // Create a site's owner choices: the user and organisations with an installation.
    if (path === "/api/owners") return json(await github.ownerInstallations(user.login));
    // Start your site: the Starter site's files, named for the site.
    if (path === "/api/starter") {
      const name = (url.searchParams.get("name") ?? "").trim().slice(0, 100);
      return json({ files: await starterProvider(env, fetcher)(name || "My site") });
    }
    if (
      ![
        "/api/branches",
        "/api/snapshot",
        "/api/head",
        "/api/tree",
        "/api/file",
        "/api/files",
        "/api/blob",
        "/api/history",
        "/api/file-at",
        "/api/commit",
        "/api/change-status",
      ].includes(path)
    )
      throw new HttpError(404, "Endpoint not found.");
    const repo = await timed(request, "auth", github.authorizeRepository(
      user.login,
      url.searchParams.get("repo") ?? "",
      readAuthorizationMaxAge,
    ));
    if (path === "/api/branches") return json(await github.branches(repo));
    // `commit`: the head the tab already saw, so a lagging read is not a step back.
    // Snapshot and batch reads carry the boot tag too: a warm boot asks for
    // them before its session is known (src/boot-memory.ts).
    if (path === "/api/snapshot")
      return Response.json(
        await github.snapshot(repo, url.searchParams.get("branch") ?? "", url.searchParams.get("commit") ?? undefined),
        { headers: await bootSessionHeaders(user) },
      );
    if (path === "/api/head")
      return json({
        commit: (await github.head(repo, url.searchParams.get("branch") ?? "", url.searchParams.get("commit") ?? undefined)).sha,
      });
    if (path === "/api/history")
      return json(
        await history(github, repo, {
          branch: url.searchParams.get("branch") ?? "",
          path: url.searchParams.get("path") ?? "",
          head: url.searchParams.get("head") ?? undefined,
          page: url.searchParams.get("page") ?? undefined,
        }),
      );
    if (path === "/api/commit")
      return json(await commitFiles(github, repo, { sha: url.searchParams.get("sha") ?? undefined }));
    if (path === "/api/file-at")
      return json(
        await fileAtRevision(github, repo, {
          commit: url.searchParams.get("commit") ?? undefined,
          path: url.searchParams.get("path") ?? "",
        }),
      );
    if (path === "/api/tree")
      return json(
        url.searchParams.get("recursive") === "1"
          ? await github.subtree(repo, url.searchParams.get("sha") ?? "")
          : await github.directory(repo, url.searchParams.get("sha") ?? ""),
      );
    if (path === "/api/change-status")
      return json(await changeStatus(github, repo, url.searchParams.get("sha") ?? ""));
    if (path === "/api/blob") {
      const known = blobType(url.searchParams.get("type"));
      return blobResponse(await github.bytes(repo, url.searchParams.get("sha") ?? ""), known);
    }
    if (path === "/api/files")
      return Response.json({
        files: await github.files(
          repo,
          (url.searchParams.get("shas") ?? "").split(",").filter(Boolean),
        ),
      }, { headers: await bootSessionHeaders(user) });
    return json({
      content: await github.file(repo, url.searchParams.get("sha") ?? ""),
    });
  }
  if (path.startsWith("/auth/"))
    throw new HttpError(404, "Unknown sign-in action.");
  return env.ASSETS.fetch(request);
}
