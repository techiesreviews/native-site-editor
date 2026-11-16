// The Worker's route table (TOOLS-267). Every address the Worker answers itself is listed here once, with what a
// request must carry before its handler runs: the methods it takes, where a browser request may come from, who must
// be signed in, and how big its body may be. `guard` checks a request against the table before any handler, and an
// address in the Worker's own spaces that the table does not list is refused, so a new route cannot ship without
// its checks. Sign-in is checked right after the guard, in worker/app.ts `signIn`, from the same rule.
import { HttpError } from "../shared/http-error";
import { MAX_FILE_BYTES } from "./github";

export type Method = "GET" | "POST" | "OPTIONS";

/** Where a browser request may come from. */
export type From =
  /** The editor's own pages: the Origin header is the editor's address. */
  | "editor"
  /** A socket for the editor's own pages: an upgrade's Origin is the editor's address; a plain request learns a status. */
  | "editor-socket"
  /** A socket for preview visitors: the preview Worker's forwarded upgrade (no Origin) or a page on its address. */
  | "preview-socket"
  /** An agent, never a browser page: an Origin, when sent, is the editor's address. */
  | "agent"
  /** The consent page's form: its Origin is the editor's address, or none on a same-origin post. */
  | "consent-form"
  /** Reads, sign-in trips, OAuth metadata and other services' deliveries: no browser origin to check. */
  | "anywhere";

/** Who must be signed in before the handler runs. */
export type SignIn =
  /** The editor's sign-in (its session cookie), checked at the door. */
  | "editor"
  /** An agent connection (its bearer token), checked at the door. */
  | "agent"
  /** An agent connection when the request carries one (and then the agent's Origin rule), else the editor's sign-in. */
  | "editor-or-agent"
  /** Proven by the handler itself: a link's token, a signature, a setup token or an OAuth state. */
  | "own"
  /** Nobody: the answer is the same for everyone, or reads the account cookies itself. */
  | "none";

export interface Rule {
  from: From;
  signIn: SignIn;
  /** What a signed-out request is told (the editor's sign-in only). */
  signedOut?: string;
  /** The largest body this request may carry, in bytes; a rule without one reads no body. */
  body?: number;
  /** Only a WebSocket upgrade: a plain request is refused before sign-in is read. */
  upgradeOnly?: true;
}

export interface Route {
  path: string;
  methods: Partial<Record<Method, Rule>>;
  /** Answered only on the editor's own address (EDITOR_ORIGIN), never an alias. */
  editorAddress?: true;
}

const KB = 1024, MB = 1024 * KB;
const signedOut = {
  browse: "Connect GitHub to browse your repositories.",
  agents: "Connect GitHub to use agent context.",
  publish: "Connect GitHub to publish your changes.",
  hosts: "Connect GitHub to publish your site.",
  share: "Connect GitHub to share this site.",
  preview: "Connect GitHub to share a preview.",
};
/** A read of the signed-in editor. */
const read = (message = signedOut.browse): Rule => ({ from: "anywhere", signIn: "editor", signedOut: message });
/** A change the signed-in editor's own page asks for. */
const change = (body: number, message: string): Rule => ({ from: "editor", signIn: "editor", signedOut: message, body });
/** A page or answer anyone may load. */
const open: Rule = { from: "anywhere", signIn: "none" };

/** Kept equal to OBSOLETE_ROUTES in scripts/agents/durable-report.mjs (tests check it): 410 editor-updated, zero DO work. */
export const OBSOLETE_AGENT_ROUTES: readonly string[] = [
  "/api/agent/hub", "/api/agent/context", "/api/agent/drafts", "/api/agent/claim",
  "/api/agent/ack", "/api/agent/pause", "/api/agent/ask", "/api/agent/answer", "/api/agent/dismiss",
];

export const ROUTES: readonly Route[] = [
  // Maintenance and GitHub's deliveries: other services, each proving itself with its own secret.
  { path: "/__maintenance/inventory", methods: { POST: { from: "anywhere", signIn: "own", body: 4 * KB } } },
  { path: "/__maintenance/cleanup", methods: { POST: { from: "anywhere", signIn: "own", body: 4 * KB } } },
  // GitHub caps a delivery's payload at 25 MB.
  { path: "/api/github/webhook", methods: { POST: { from: "anywhere", signIn: "own", body: 25 * MB } } },

  // Agents' OAuth (worker/oauth.ts): metadata and sign-in for MCP clients on other addresses.
  { path: "/.well-known/oauth-protected-resource", methods: { GET: open, OPTIONS: open } },
  { path: "/.well-known/oauth-protected-resource/mcp", methods: { GET: open, OPTIONS: open } },
  { path: "/.well-known/oauth-authorization-server", methods: { GET: open, OPTIONS: open } },
  { path: "/.well-known/oauth-authorization-server/mcp", methods: { GET: open, OPTIONS: open } },
  { path: "/auth/mcp/register", methods: { POST: { from: "anywhere", signIn: "none", body: 16 * KB }, OPTIONS: open } },
  { path: "/auth/mcp/token", methods: { POST: { from: "anywhere", signIn: "own", body: 8 * KB }, OPTIONS: open } },
  { path: "/auth/mcp/consent.js", methods: { GET: open, OPTIONS: open } },
  // The consent page shows its own sign-in; its form's request nonce is bound to the session that saw it.
  { path: "/auth/mcp/authorize", methods: { GET: open, POST: { from: "consent-form", signIn: "own", body: 4 * KB } } },

  // The editor's sign-in.
  { path: "/auth/login", methods: { GET: open } },
  { path: "/auth/install", methods: { GET: open } },
  { path: "/auth/callback", methods: { GET: { from: "anywhere", signIn: "own" } } },
  { path: "/auth/logout", methods: { POST: { from: "editor", signIn: "none" } } },
  { path: "/api/accounts/switch", methods: { POST: { from: "editor", signIn: "none", body: 1 * KB } } },
  { path: "/api/session", methods: { GET: open } },

  // Owner setup (worker/owner-setup.ts), on the editor's own address only.
  { path: "/auth/setup", methods: { GET: open }, editorAddress: true },
  { path: "/auth/setup.js", methods: { GET: open }, editorAddress: true },
  { path: "/auth/setup/status", methods: { GET: open }, editorAddress: true },
  { path: "/auth/setup/manifest", methods: { GET: open }, editorAddress: true },
  { path: "/auth/setup/unlock", methods: { POST: { from: "editor", signIn: "own", body: 1 * KB } }, editorAddress: true },
  { path: "/auth/setup/callback", methods: { GET: { from: "anywhere", signIn: "own" } }, editorAddress: true },

  // Agents.
  { path: "/mcp", methods: { POST: { from: "agent", signIn: "agent", body: 3 * MB } } },
  { path: "/api/agent/relay", methods: { GET: { from: "editor-socket", signIn: "editor", signedOut: signedOut.agents, upgradeOnly: true } } },
  { path: "/api/agent/connect", methods: { POST: change(4 * KB, signedOut.agents) } },
  { path: "/api/agent/rebind", methods: { POST: change(4 * KB, signedOut.agents) } },
  { path: "/api/agent/connections", methods: { GET: read(signedOut.agents) } },
  { path: "/api/agent/revoke", methods: { POST: change(4 * KB, signedOut.agents) } },
  ...OBSOLETE_AGENT_ROUTES.map((path): Route => ({ path, methods: {} })),

  // Live rooms, synced sessions and preview links.
  { path: "/api/live/room", methods: { GET: { from: "editor-socket", signIn: "editor-or-agent", signedOut: "Connect GitHub to join a live room." } } },
  { path: "/api/live/share", methods: {
    POST: change(4 * KB, signedOut.share),
    GET: { from: "editor-socket", signIn: "editor", signedOut: signedOut.share },
  } },
  { path: "/api/live/guest", methods: { GET: { from: "editor-socket", signIn: "own" } } },
  { path: "/api/live/preview", methods: {
    POST: change(4 * KB, signedOut.preview),
    GET: { from: "editor-socket", signIn: "editor", signedOut: signedOut.preview },
  } },
  { path: "/api/live/preview/off", methods: { POST: change(4 * KB, signedOut.preview) } },
  { path: "/api/live/visit", methods: { GET: { from: "preview-socket", signIn: "own" } } },

  // Publishing (worker/publish.ts, worker/blobs.ts) and publishing to a host (worker/hosts.ts).
  { path: "/api/publish", methods: { POST: change(32 * MB, signedOut.publish) } },
  { path: "/api/blob", methods: { GET: read(), POST: change(MAX_FILE_BYTES, signedOut.publish) } },
  { path: "/api/restore", methods: { POST: change(4 * KB, "Connect GitHub to restore this file.") } },
  { path: "/api/publish/status", methods: { GET: read(signedOut.hosts) } },
  { path: "/api/publish/pipeline", methods: { GET: read(signedOut.hosts) } },
  { path: "/api/publish/pages/domain/health", methods: { GET: read(signedOut.hosts) } },
  { path: "/api/publish/pages", methods: { POST: change(8 * KB, signedOut.hosts) } },
  { path: "/api/publish/pages/domain", methods: { POST: change(8 * KB, signedOut.hosts) } },
  { path: "/api/publish/secrets", methods: { POST: change(8 * KB, signedOut.hosts) } },
  { path: "/api/publish/cloudflare/verify", methods: { POST: change(8 * KB, signedOut.hosts) } },
  { path: "/api/publish/cloudflare/secrets", methods: { POST: change(8 * KB, signedOut.hosts) } },
  { path: "/api/publish/spacefast/secrets", methods: { POST: change(8 * KB, signedOut.hosts) } },

  // Repositories and their files (worker/github.ts, worker/history.ts).
  { path: "/api/repositories", methods: { GET: read(), POST: change(4 * KB, signedOut.browse) } },
  ...["/api/owners", "/api/starter", "/api/branches", "/api/snapshot", "/api/head", "/api/tree", "/api/file", "/api/files",
    "/api/history", "/api/file-at", "/api/commit", "/api/change-status"].map((path): Route => ({ path, methods: { GET: read() } })),
];

const byPath = new Map(ROUTES.map(route => [route.path, route]));
const obsolete = new Set(OBSOLETE_AGENT_ROUTES);

/** The addresses the Worker answers itself; anything else is the editor's static files. */
function serverPath(path: string) {
  return path.startsWith("/api/") || path.startsWith("/auth/") || path === "/mcp" ||
    path.startsWith("/__maintenance/") || path.startsWith("/.well-known/oauth-");
}

/** A tab from before an update asks for a route that is gone: it learns to reload, and nothing more runs. */
export class EditorUpdatedError extends HttpError {
  readonly code = "editor-updated";
}
/** A method the route does not take; `allow` names the ones it does (the message leaves out a CORS preflight). */
export class MethodNotAllowedError extends HttpError {
  constructor(readonly allow: string) {
    super(405, `Use ${allow.split(", ").filter(method => method !== "OPTIONS").join(" or ")}.`);
  }
}

function upgrade(request: Request) {
  return request.headers.has("Upgrade");
}
/** Whether `request` comes from where `from` allows. */
function fromAllowed(request: Request, url: URL, from: From, preview: () => string | undefined) {
  const origin = request.headers.get("Origin");
  switch (from) {
    case "editor": return origin === url.origin;
    case "editor-socket": return !upgrade(request) || origin === url.origin;
    case "preview-socket": return !upgrade(request) || origin === null || origin === preview();
    case "agent": return origin === null || origin === url.origin;
    case "consent-form": return origin === url.origin || (origin === null && request.headers.get("Sec-Fetch-Site") === "same-origin");
    case "anywhere": return true;
  }
}

interface Admitted {
  route: Route;
  rule: Rule;
}

/**
 * Checks `request` against the table, before any handler runs and before anything is read: the address is listed
 * (404), it is not a route from before an update (410), the method is one it takes (405), it is on the editor's own
 * address where it must be (403), it comes from where its rule allows (403), and it is an upgrade where only one is
 * taken (400). Undefined for an address outside the
 * Worker's own spaces (the editor's static files). `addresses.editor`: the editor's own address (EDITOR_ORIGIN);
 * `addresses.preview`: the preview Worker's, when one is set up; each is read only by the routes that need it.
 */
export function guard(request: Request, url: URL, addresses: { editor: () => string; preview: () => string | undefined }): Admitted | undefined {
  const path = url.pathname;
  if (!serverPath(path)) return undefined;
  const route = byPath.get(path);
  if (!route) throw new HttpError(404, "Endpoint not found.");
  if (obsolete.has(path)) throw new EditorUpdatedError(410, "This editor was updated. Reload this tab to keep using agents.");
  const rule = Object.hasOwn(route.methods, request.method) ? route.methods[request.method as Method] : undefined;
  if (!rule) throw new MethodNotAllowedError(Object.keys(route.methods).join(", "));
  if (route.editorAddress && url.origin !== addresses.editor())
    throw new HttpError(403, "Owner setup uses the editor's own address (EDITOR_ORIGIN).");
  const from = rule.signIn === "editor-or-agent" && request.headers.has("Authorization") ? "agent" : rule.from;
  if (!fromAllowed(request, url, from, addresses.preview)) throw new HttpError(403, "Invalid request origin.");
  if (rule.upgradeOnly && request.headers.get("Upgrade")?.toLowerCase() !== "websocket") throw new HttpError(400, "Use a WebSocket upgrade.");
  return { route, rule };
}

/** The largest body `request`'s route takes: every handler reads its body with this limit, so the table is the one place it is set. */
export function bodyLimit(request: Request): number {
  const limit = byPath.get(new URL(request.url).pathname)?.methods[request.method as Method]?.body;
  if (limit === undefined) throw new Error(`${request.method} ${new URL(request.url).pathname} reads no body (worker/routes.ts).`);
  return limit;
}
