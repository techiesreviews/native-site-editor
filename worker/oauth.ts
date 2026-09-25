// OAuth 2.1 for the MCP endpoint, as the MCP authorization spec asks, so the
// editor can be added to claude.ai, Claude Desktop or Claude Code by its URL:
//
// - protected resource metadata (RFC 9728) for `/mcp`, named by the
//   `WWW-Authenticate` header of its 401s;
// - authorization server metadata (RFC 8414) with this origin as the issuer;
// - dynamic client registration (RFC 7591) for public clients;
// - the authorization code grant with PKCE (S256 only).
//
// The authorize step is the editor's own GitHub sign-in: a signed-in session
// (or a sign-in that returns here) picks one repository on a consent page,
// and the token issued is the same kind of connection the Agent context
// menu copies: one repository, one editor session, stored only as a hash,
// revoked with the session or from the editor. There are no refresh tokens:
// a connection lasts as long as the editor session (up to eight hours), then
// the client asks the user to connect again. Everything is kept in the
// existing SessionStore Durable Object; nothing else is needed.
import { createGrant } from "./agent-context";
import type { Env, StoredSession } from "./app";
import { GitHub, HttpError } from "./github";
import { requestJson } from "./http";
import { escapeHtml } from "./owner-setup";

export const OAUTH_SCOPE = "site";
const CLIENT_LIFETIME = 180 * 24 * 60 * 60 * 1000;
const REQUEST_LIFETIME = 10 * 60 * 1000;
const CODE_LIFETIME = 5 * 60 * 1000;

export interface OAuthClient {
  kind: "oauth-client";
  clientId: string;
  name: string;
  redirectUris: string[];
  expiresAt: number;
}
interface OAuthRequest {
  kind: "oauth-request";
  sessionId: string;
  login: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  expiresAt: number;
}
interface OAuthCode {
  kind: "oauth-code";
  sessionId: string;
  login: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  repoId: number;
  repo: string;
  expiresAt: number;
}
export type OAuthRecord = OAuthClient | OAuthRequest | OAuthCode;

export interface OAuthDeps {
  /** The signed-in editor session, with its id. */
  session(request: Request): Promise<{ id: string; login: string; token: string; expiresAt: number } | null>;
  html(body: string, headers?: HeadersInit): Response;
  fetcher: typeof fetch;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { ...cors, "Cache-Control": "no-store", ...headers } });
const oauthError = (error: string, description: string, status = 400) =>
  json({ error, error_description: description }, status);

function randomHex(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function record(env: Env, name: string, method = "GET", value?: OAuthRecord, consume = false) {
  return env.SESSIONS.get(env.SESSIONS.idFromName(name)).fetch(
    new Request(`https://session.internal/${consume ? "consume" : ""}`, {
      method,
      body: value ? JSON.stringify(value) : undefined,
    }),
  );
}
async function load<T extends OAuthRecord>(env: Env, name: string, kind: T["kind"], consume = false): Promise<T | undefined> {
  const response = await record(env, name, consume ? "POST" : "GET", undefined, consume);
  if (!response.ok) return undefined;
  const value = (await response.json()) as OAuthRecord;
  return value.kind === kind && value.expiresAt > Date.now() ? (value as T) : undefined;
}

export const resourceUrl = (origin: string) => `${origin}/mcp`;
export const resourceMetadataUrl = (origin: string) =>
  `${origin}/.well-known/oauth-protected-resource/mcp`;
export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceUrl(origin),
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: [OAUTH_SCOPE],
    resource_name: "Native Site Editor",
    resource_documentation: `${origin}/`,
  };
}
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/auth/mcp/authorize`,
    token_endpoint: `${origin}/auth/mcp/token`,
    registration_endpoint: `${origin}/auth/mcp/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [OAUTH_SCOPE],
    authorization_response_iss_parameter_supported: true,
  };
}

/** A redirect URI a public client may register: HTTPS, or HTTP to this machine (a desktop client's loopback listener). */
export function redirectUriProblem(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "redirect_uris must be absolute URLs.";
  }
  if (url.hash) return "redirect_uris must not have a fragment.";
  if (url.username || url.password) return "redirect_uris must not carry credentials.";
  if (url.protocol === "https:") return undefined;
  if (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return undefined;
  return "redirect_uris must use https, or http to localhost.";
}

/** Whether `path` is one of the OAuth routes this module answers. */
export function isOAuthPath(path: string) {
  return (
    path.startsWith("/.well-known/oauth-protected-resource") ||
    path.startsWith("/.well-known/oauth-authorization-server") ||
    path.startsWith("/auth/mcp/")
  );
}

export async function handleOAuth(request: Request, env: Env, url: URL, deps: OAuthDeps): Promise<Response> {
  const path = url.pathname;
  const origin = url.origin;
  if (request.method === "OPTIONS" && !path.startsWith("/auth/mcp/authorize"))
    return new Response(null, { status: 204, headers: cors });
  if (path.startsWith("/.well-known/oauth-protected-resource")) {
    if (path !== "/.well-known/oauth-protected-resource" && path !== "/.well-known/oauth-protected-resource/mcp")
      return json({ error: "Not found." }, 404);
    return json(protectedResourceMetadata(origin), 200, { "Cache-Control": "public, max-age=3600" });
  }
  if (path.startsWith("/.well-known/oauth-authorization-server")) {
    if (path !== "/.well-known/oauth-authorization-server" && path !== "/.well-known/oauth-authorization-server/mcp")
      return json({ error: "Not found." }, 404);
    return json(authorizationServerMetadata(origin), 200, { "Cache-Control": "public, max-age=3600" });
  }
  if (path === "/auth/mcp/register") {
    if (request.method !== "POST") return oauthError("invalid_request", "Use POST.", 405);
    return register(request, env);
  }
  if (path === "/auth/mcp/token") {
    if (request.method !== "POST") return oauthError("invalid_request", "Use POST.", 405);
    return token(request, env);
  }
  if (path === "/auth/mcp/consent.js")
    return new Response(consentScript, {
      headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
    });
  if (path === "/auth/mcp/authorize") {
    if (request.method === "GET") return authorize(request, env, url, deps);
    if (request.method === "POST") return consent(request, env, url, deps);
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  }
  return json({ error: "Not found." }, 404);
}

async function register(request: Request, env: Env) {
  let body: any;
  try {
    body = await requestJson(request, 16 * 1024);
  } catch (error) {
    return oauthError("invalid_client_metadata", error instanceof HttpError ? error.message : "Send JSON client metadata.");
  }
  const uris = body?.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10 || uris.some((uri) => typeof uri !== "string" || uri.length > 2000))
    return oauthError("invalid_redirect_uri", "Give one to ten redirect_uris.");
  for (const uri of uris) {
    const problem = redirectUriProblem(uri);
    if (problem) return oauthError("invalid_redirect_uri", problem);
  }
  const grants = body.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || !grants.includes("authorization_code")))
    return oauthError("invalid_client_metadata", "This server issues authorization_code grants only.");
  const responses = body.response_types;
  if (responses !== undefined && (!Array.isArray(responses) || !responses.includes("code")))
    return oauthError("invalid_client_metadata", "This server supports response_type code only.");
  const name = typeof body.client_name === "string" && body.client_name.trim()
    ? body.client_name.trim().replace(/[\u0000-\u001f]/g, "").slice(0, 100)
    : "MCP client";
  const client: OAuthClient = {
    kind: "oauth-client",
    clientId: `mcp_${randomHex(16)}`,
    name,
    redirectUris: uris,
    expiresAt: Date.now() + CLIENT_LIFETIME,
  };
  await record(env, `oauth-client:${client.clientId}`, "PUT", client);
  return json(
    {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: OAUTH_SCOPE,
    },
    201,
  );
}

function errorPage(deps: OAuthDeps, title: string, message: string, status = 400) {
  const response = deps.html(page(title, `<p>${escapeHtml(message)}</p><p><a href="/">Open the editor</a></p>`));
  return new Response(response.body, { status, headers: response.headers });
}
function back(redirectUri: string, params: Record<string, string | undefined>, origin: string) {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) target.searchParams.set(key, value);
  target.searchParams.set("iss", origin);
  return new Response(null, { status: 302, headers: { Location: target.href } });
}

async function authorize(request: Request, env: Env, url: URL, deps: OAuthDeps) {
  const params = url.searchParams;
  const clientId = params.get("client_id") ?? "";
  const client = /^mcp_[a-f0-9]{32}$/.test(clientId)
    ? await load<OAuthClient>(env, `oauth-client:${clientId}`, "oauth-client")
    : undefined;
  if (!client)
    return errorPage(deps, "Unknown app", "This app is not registered with the editor, or its registration expired. Remove the connector and add it again.");
  const asked = params.get("redirect_uri");
  const redirectUri = asked ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (!client.redirectUris.includes(redirectUri))
    return errorPage(deps, "Wrong return address", "The app asked to return to an address it did not register.");
  const state = params.get("state") ?? undefined;
  const fail = (error: string, description: string) =>
    back(redirectUri, { error, error_description: description, state }, url.origin);
  if (params.get("response_type") !== "code") return fail("unsupported_response_type", "Use response_type=code.");
  const challenge = params.get("code_challenge") ?? "";
  if (params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge))
    return fail("invalid_request", "PKCE with code_challenge_method S256 is required.");
  const resource = params.get("resource");
  if (resource && resource.replace(/\/$/, "") !== resourceUrl(url.origin) && resource.replace(/\/$/, "") !== url.origin)
    return fail("invalid_target", `This server's resource is ${resourceUrl(url.origin)}.`);
  const scope = params.get("scope");
  if (scope && !scope.split(" ").every((item) => item === OAUTH_SCOPE || item === ""))
    return fail("invalid_scope", `The only scope is ${OAUTH_SCOPE}.`);
  const user = await deps.session(request);
  if (!user) {
    const login = new URL("/auth/login", url.origin);
    login.searchParams.set("return", `${url.pathname}${url.search}`);
    return new Response(null, { status: 302, headers: { Location: login.pathname + login.search } });
  }
  let repositories: { id: number; full_name: string; private: boolean }[];
  try {
    repositories = await new GitHub(user.token, deps.fetcher).repositories(user.login);
  } catch (error) {
    return errorPage(deps, "Repositories unavailable", error instanceof HttpError ? error.message : "Your repositories could not be listed. Try again.", 502);
  }
  const nonce = randomHex();
  const pending: OAuthRequest = {
    kind: "oauth-request",
    sessionId: user.id,
    login: user.login,
    clientId,
    clientName: client.name,
    redirectUri,
    codeChallenge: challenge,
    ...(state !== undefined ? { state: state.slice(0, 1000) } : {}),
    expiresAt: Date.now() + REQUEST_LIFETIME,
  };
  await record(env, `oauth-request:${nonce}`, "PUT", pending);
  const choices = repositories
    .slice(0, 200)
    .map(
      (repo) =>
        `<label class="repo"><input type="radio" name="repo" value="${escapeHtml(repo.full_name)}" required${repositories.length === 1 ? " checked" : ""}> ${escapeHtml(repo.full_name)}${repo.private ? ' <span class="muted">private</span>' : ""}</label>`,
    )
    .join("\n");
  const where = new URL(redirectUri);
  const body = `
<h1>Connect ${escapeHtml(client.name)} to your site</h1>
<p><strong>${escapeHtml(client.name)}</strong> (returning to <code>${escapeHtml(where.host)}</code>) asks to work on one of your sites as <strong>${escapeHtml(user.login)}</strong>.</p>
<form method="post" action="/auth/mcp/authorize" class="panel" id="consent">
  <input type="hidden" name="request" value="${nonce}">
  ${repositories.length ? `<fieldset><legend>Repository</legend>${choices}</fieldset>` : `<p>The editor's GitHub App is not installed on any repository you can use. Install it first, then connect again.</p>`}
  <p class="muted">It can read this repository's files and your unsaved changes in the editor, and make changes that appear in your open editor tab as unsaved drafts. It cannot save to GitHub or publish; you review and save. The connection lasts until you sign out of the editor (at most eight hours) or revoke it under Agent context.</p>
  <p class="actions">
    ${repositories.length ? `<button name="decision" value="allow" class="primary">Allow</button>` : ""}
    <button name="decision" value="deny" formnovalidate>Cancel</button>
  </p>
</form>`;
  return deps.html(page(`Connect ${client.name}`, body, true), {
    "Content-Security-Policy": `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action 'self' ${where.origin}; base-uri 'none'; frame-ancestors 'none'`,
  });
}

async function consent(request: Request, env: Env, url: URL, deps: OAuthDeps) {
  // The consent form posts from this origin (its page sends the Origin
  // header under a same-origin referrer policy); the request nonce, bound to
  // the signed-in session, is checked below as well.
  const origin = request.headers.get("Origin");
  if (origin !== url.origin && !(origin === null && request.headers.get("Sec-Fetch-Site") === "same-origin"))
    return errorPage(deps, "Request refused", "This request did not come from the editor's consent page.", 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/x-www-form-urlencoded"))
    return errorPage(deps, "Request refused", "Send the consent form.", 415);
  const text = await request.text();
  if (text.length > 4096) return errorPage(deps, "Request refused", "The form is too large.", 413);
  const form = new URLSearchParams(text);
  const nonce = form.get("request") ?? "";
  const user = await deps.session(request);
  const pending = /^[a-f0-9]{64}$/.test(nonce)
    ? await load<OAuthRequest>(env, `oauth-request:${nonce}`, "oauth-request", true)
    : undefined;
  if (!pending || !user || pending.sessionId !== user.id || pending.login !== user.login)
    return errorPage(deps, "Consent expired", "This consent page expired or belongs to another sign-in. Start connecting again from the app.", 403);
  if (form.get("decision") !== "allow")
    return back(pending.redirectUri, { error: "access_denied", error_description: "The user cancelled.", state: pending.state }, url.origin);
  let repo;
  try {
    repo = await new GitHub(user.token, deps.fetcher).authorizeRepository(user.login, form.get("repo") ?? "");
  } catch (error) {
    return errorPage(deps, "Repository unavailable", error instanceof HttpError ? error.message : "That repository could not be used.", 403);
  }
  const code = randomHex();
  const grant: OAuthCode = {
    kind: "oauth-code",
    sessionId: pending.sessionId,
    login: pending.login,
    clientId: pending.clientId,
    clientName: pending.clientName,
    redirectUri: pending.redirectUri,
    codeChallenge: pending.codeChallenge,
    repoId: repo.id,
    repo: repo.full_name,
    expiresAt: Date.now() + CODE_LIFETIME,
  };
  await record(env, `oauth-code:${hex(await sha256(code))}`, "PUT", grant);
  return back(pending.redirectUri, { code, state: pending.state }, url.origin);
}

async function token(request: Request, env: Env) {
  const type = request.headers.get("Content-Type") ?? "";
  let form: URLSearchParams;
  if (type.startsWith("application/x-www-form-urlencoded")) {
    const text = await request.text();
    if (text.length > 8192) return oauthError("invalid_request", "The request is too large.");
    form = new URLSearchParams(text);
  } else if (type.startsWith("application/json")) {
    const body = await requestJson(request, 8192).catch(() => undefined);
    if (!body || typeof body !== "object") return oauthError("invalid_request", "Send the token request as a form.");
    form = new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)]));
  } else return oauthError("invalid_request", "Send the token request as application/x-www-form-urlencoded.");
  if (form.get("grant_type") !== "authorization_code")
    return oauthError("unsupported_grant_type", "Only authorization_code is supported. Connect again when the connection expires.");
  const code = form.get("code") ?? "";
  const verifier = form.get("code_verifier") ?? "";
  if (!/^[a-f0-9]{64}$/.test(code)) return oauthError("invalid_grant", "The authorization code is invalid.");
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return oauthError("invalid_grant", "A PKCE code_verifier is required.");
  const grant = await load<OAuthCode>(env, `oauth-code:${hex(await sha256(code))}`, "oauth-code", true);
  if (!grant) return oauthError("invalid_grant", "The authorization code expired or was already used.");
  if (form.get("client_id") !== grant.clientId) return oauthError("invalid_grant", "The code was issued to another client.");
  if ((form.get("redirect_uri") ?? grant.redirectUri) !== grant.redirectUri)
    return oauthError("invalid_grant", "redirect_uri does not match the authorization request.");
  if (base64url(await sha256(verifier)) !== grant.codeChallenge)
    return oauthError("invalid_grant", "The PKCE code_verifier does not match.");
  const sessionResponse = await env.SESSIONS.get(env.SESSIONS.idFromName(grant.sessionId)).fetch(
    new Request("https://session.internal/"),
  );
  const session = sessionResponse.ok ? ((await sessionResponse.json()) as StoredSession) : undefined;
  if (session?.kind !== "user" || session.login !== grant.login || session.expiresAt <= Date.now())
    return oauthError("invalid_grant", "The editor session ended. Sign in to the editor and connect again.");
  const issued = await createGrant(env, {
    sessionId: grant.sessionId,
    login: grant.login,
    repoId: grant.repoId,
    repo: grant.repo,
    expiresAt: session.expiresAt,
    via: "oauth",
    client: grant.clientName,
  });
  return json(
    {
      access_token: issued.token,
      token_type: "Bearer",
      expires_in: Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000)),
      scope: OAUTH_SCOPE,
    },
    200,
    { Pragma: "no-cache" },
  );
}

// Tells an open editor tab in this browser that a connection is coming, so
// it starts sharing its context without waiting for its next check.
const consentScript = `document.getElementById("consent")?.addEventListener("submit", function (event) {
  var submitter = event.submitter;
  if (submitter && submitter.value === "allow") {
    try { localStorage.setItem("native-site-editor:agent-connected", String(Date.now())); } catch (error) {}
  }
});
`;

function page(title: string, body: string, script = false) {
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="same-origin">
<title>${escapeHtml(title)} · Native Site Editor</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f7f4ee;color:#1d1b18}
main{max-width:620px;margin:8vh auto;padding:24px}
.panel{background:white;border:1px solid #ded8ce;border-radius:8px;padding:20px;margin-top:18px}
fieldset{border:0;padding:0;margin:0 0 12px}
legend{font-weight:700;margin-bottom:8px}
.repo{display:block;padding:6px 0}
.muted{color:#625d55;font-size:14px}
.actions{display:flex;gap:12px}
button{border:1px solid #cfc8bc;border-radius:8px;background:white;padding:10px 16px;font:inherit;font-weight:600;cursor:pointer}
button.primary{background:#1f6feb;border-color:#1f6feb;color:white}
code{font-size:14px}
</style>
<main>${body}</main>${script ? '\n<script src="/auth/mcp/consent.js"></script>' : ""}
`;
}
