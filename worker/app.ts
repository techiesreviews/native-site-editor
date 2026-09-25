import { requestJson } from "./http";
import {
  authenticateAgent,
  createGrant,
  getGrant,
  getHub,
  operateHub,
  revokeGrant,
  validateContext,
  type AgentGrant,
  type AgentHub,
} from "./agent-context";
import { handleMcp } from "./mcp";
import {
  handleOAuth,
  isOAuthPath,
  resourceMetadataUrl,
  type OAuthRecord,
} from "./oauth";
import { publish } from "./publish";
import { history, restore } from "./history";
import { GitHub, HttpError } from "./github";
import {
  configuredApp,
  convertManifest,
  githubAppManifest,
  canonicalOrigin,
  hasOwnerSetup,
  isOwnerSetupState,
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
}
interface OAuthState {
  kind: "oauth";
  expiresAt: number;
  /** An MCP authorization to continue after signing in (`/auth/mcp/authorize?...`). */
  returnTo?: string;
}
export type StoredSession = Session | OAuthState | AgentGrant | AgentHub | OAuthRecord;
export type StoredValue = StoredSession | OwnerSetupState;

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SESSIONS: {
    idFromName(name: string): any;
    get(id: any): { fetch(request: Request): Promise<Response> };
  };
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_APP_SLUG?: string;
  OWNER_SETUP_TOKEN?: string;
}

async function config(env: Env) {
  return configuredApp(env);
}
// Editor read endpoints accept a selected-repository listing up to this old,
// so the burst of reads after sign-in shares one membership check. Writes and
// agent requests always recheck.
const readAuthorizationMaxAge = 60_000;
function json(body: unknown, status = 200) {
  return Response.json(body, { status });
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
function setCookie(url: URL, kind: string, value: string, maxAge: number) {
  return `${cookieName(url, kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${url.protocol === "https:" ? "; Secure" : ""}`;
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
  if (!id) return null;
  const response = await store(env, id);
  if (!response.ok) return null;
  const value = (await response.json()) as StoredSession;
  return value.kind === "user" && value.expiresAt > Date.now() ? value : null;
}

export async function handle(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);
  let response: Response;
  try {
    response = await route(request, env, url, fetcher);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message =
      error instanceof HttpError
        ? error.message
        : "Something went wrong. Please try again.";
    response = ["/auth/login", "/auth/callback"].includes(url.pathname)
      ? redirect(`/?error=${encodeURIComponent(message)}`, [
          setCookie(url, "oauth", "", 0),
        ])
      : json(
          {
            error: message,
            ...(error instanceof HttpError && error.conflicts
              ? { conflicts: error.conflicts }
              : {}),
          },
          status,
        );
  }
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
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname === "/mcp"
  )
    secured.headers.set("Cache-Control", "no-store");
  return secured;
}

async function route(
  request: Request,
  env: Env,
  url: URL,
  fetcher: typeof fetch,
): Promise<Response> {
  const path = url.pathname;
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
    const id = cookie(request, "session");
    if (id) await store(env, id, "DELETE");
    return new Response(null, {
      status: 204,
      headers: { "Set-Cookie": setCookie(url, "session", "", 0) },
    });
  }
  if (
    (path.startsWith("/api/") || path.startsWith("/auth/")) &&
    request.method !== "GET" &&
    !(
      (path === "/api/publish" ||
        path === "/api/restore" ||
        path === "/auth/setup/unlock" ||
        path.startsWith("/api/agent/")) &&
      request.method === "POST"
    )
  )
    throw new HttpError(405, "Method not allowed.");

  if (path.startsWith("/auth/setup")) {
    if (url.origin !== canonicalOrigin)
      throw new HttpError(403, "Owner setup uses the canonical editor origin.");
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
        installUrl: app
          ? `https://github.com/apps/${encodeURIComponent(app.slug)}/installations/new`
          : null,
      });
    }
    const app = await config(env);
    const installUrl = app
      ? `https://github.com/apps/${encodeURIComponent(app.slug)}/installations/new`
      : undefined;
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
    if (path === "/auth/setup")
      return html(ownerSetupHtml(url.origin, { state: setupState, installUrl }));
    if (path === "/auth/setup/manifest") return json(githubAppManifest(url.origin));
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
      const next = await convertManifest(
        url.searchParams.get("code") ?? "",
        fetcher,
      );
      await writeConfiguredApp(env, next);
      return redirect("/auth/setup", [setCookie(url, "setup", "", 0)]);
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
    return handleMcp(request, connection, env, await requestJson(request));
  }
  if (path.startsWith("/api/agent/")) {
    const user = await session(request, env);
    if (!user) throw new HttpError(401, "Connect GitHub to use agent context.");
    const sessionId = cookie(request, "session")!;
    if (
      request.method === "POST" &&
      request.headers.get("Origin") !== url.origin
    )
      throw new HttpError(403, "Invalid request origin.");
    if (path === "/api/agent/connect" && request.method === "POST") {
      const data = await requestJson(request, 4096);
      const repo = await new GitHub(user.token, fetcher).authorizeRepository(
        user.login,
        data?.repo ?? "",
      );
      if (repo.id !== data.repoId)
        throw new HttpError(403, "Repository changed. Reload and try again.");
      const { id, token } = await createGrant(env, {
        sessionId,
        login: user.login,
        repoId: repo.id,
        repo: repo.full_name,
        expiresAt: user.expiresAt,
        via: "token",
      });
      return json({
        id,
        token,
        endpoint: `${url.origin}/mcp`,
        expiresAt: user.expiresAt,
      });
    }
    // The session's connections, the tab sharing its context, and the
    // changes waiting for it (src/components/agent-menu.ts polls this).
    if (path === "/api/agent/hub" && request.method === "GET") {
      const hub = await getHub(env, sessionId);
      return json({
        grants: hub?.grants ?? [],
        tabId: hub?.tabId ?? null,
        updatedAt: hub?.updatedAt ?? null,
        commands: (hub?.commands ?? []).filter(
          (command) => command.state === "pending",
        ),
      });
    }
    if (path === "/api/agent/revoke" && request.method === "POST") {
      const data = await requestJson(request, 4096);
      const ids: string[] = data?.all
        ? ((await getHub(env, sessionId))?.grants ?? [])
            .filter((grant) => data.repoId === undefined || grant.repoId === data.repoId)
            .map((grant) => grant.id)
        : [String(data?.id ?? "")];
      for (const id of ids) {
        const grant = await getGrant(env, id).catch(() => undefined);
        if (grant && (grant.sessionId !== sessionId || grant.login !== user.login))
          throw new HttpError(403, "This connection belongs to another editor session.");
        if (grant || /^[a-f0-9]{64}$/.test(id)) await revokeGrant(env, id, sessionId);
      }
      return json({ ok: true, revoked: ids.length });
    }
    if (path === "/api/agent/pause" && request.method === "POST") {
      const data = await requestJson(request, 4096);
      if (!(await getHub(env, sessionId))) return json({ ok: true });
      return json(await operateHub(env, sessionId, { type: "pause", tabId: data?.tabId }));
    }
    if (path === "/api/agent/context" && request.method === "POST") {
      const data = await requestJson(request, 1200 * 1024);
      const context = validateContext(data?.context);
      return json(
        await operateHub(env, sessionId, { type: "context", tabId: data?.tabId, context }),
      );
    }
    if (path === "/api/agent/claim" && request.method === "POST") {
      const data = await requestJson(request, 4096);
      const command = await operateHub(env, sessionId, {
        type: "claim",
        id: data?.id,
        grantId: data?.grantId,
        tabId: data?.tabId,
      });
      return json({ id: command.id, state: command.state });
    }
    if (path === "/api/agent/ack" && request.method === "POST") {
      const data = await requestJson(request, 8192);
      const command = await operateHub(env, sessionId, {
        type: "ack",
        id: data?.id,
        grantId: data?.grantId,
        tabId: data?.tabId,
        state: data?.state,
        message: data?.message,
        result: data?.result,
      });
      return json({ id: command.id, state: command.state });
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
    });
    const target = new URL("https://github.com/login/oauth/authorize");
    target.searchParams.set("client_id", app.clientId);
    target.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
    target.searchParams.set("state", id);
    return redirect(target.href, [setCookie(url, "oauth", id, 600)]);
  }
  if (path === "/auth/callback") {
    const expected = cookie(request, "oauth");
    if (!expected || expected !== url.searchParams.get("state"))
      throw new HttpError(
        400,
        "GitHub sign-in expired or could not be verified. Connect again.",
      );
    const stateResponse = await store(env, expected, "POST", undefined, true);
    if (!stateResponse.ok)
      throw new HttpError(400, "GitHub sign-in expired. Connect again.");
    const state = (await stateResponse.json()) as StoredSession;
    if (state.kind !== "oauth" || state.expiresAt <= Date.now())
      throw new HttpError(400, "GitHub sign-in expired. Connect again.");
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
    const previous = cookie(request, "session");
    if (previous) await store(env, previous, "DELETE");
    return redirect(state.returnTo ?? "/", [
      setCookie(url, "session", id, duration),
      setCookie(url, "oauth", "", 0),
    ]);
  }
  if (path === "/api/session") {
    const [user, app] = await Promise.all([
      session(request, env),
      config(env),
    ]);
    // A signed-in session also carries the selected repositories so the
    // workspace opens in one round trip. A listing failure is not a session
    // failure; the browser retries through /api/repositories and shows the error.
    const repositories = user
      ? await new GitHub(user.token, fetcher)
          .repositories(user.login)
          .catch(() => null)
      : undefined;
    return json({
      configured: Boolean(app),
      user: user ? { login: user.login, avatar_url: user.avatar_url } : null,
      installUrl: app
        ? `https://github.com/apps/${encodeURIComponent(app.slug)}/installations/new`
        : null,
      ownerSetupUrl: !app && hasOwnerSetup(env) ? "/auth/setup" : null,
      ...(user ? { repositories } : {}),
    });
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
    const data = await requestJson(request, 2 * 1024 * 1024);
    const github = new GitHub(user.token, fetcher);
    const repo = await github.authorizeRepository(
      user.login,
      url.searchParams.get("repo") ?? "",
    );
    return json(await publish(github, repo, data));
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
    const github = new GitHub(user.token, fetcher);
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
    const github = new GitHub(user.token, fetcher);
    if (path === "/api/repositories")
      return json(await github.repositories(user.login));
    if (
      ![
        "/api/branches",
        "/api/snapshot",
        "/api/tree",
        "/api/file",
        "/api/files",
        "/api/raw",
        "/api/history",
      ].includes(path)
    )
      throw new HttpError(404, "Endpoint not found.");
    const repo = await github.authorizeRepository(
      user.login,
      url.searchParams.get("repo") ?? "",
      readAuthorizationMaxAge,
    );
    if (path === "/api/branches") return json(await github.branches(repo));
    if (path === "/api/snapshot")
      return json(
        await github.snapshot(repo, url.searchParams.get("branch") ?? ""),
      );
    if (path === "/api/history")
      return json(
        await history(github, repo, {
          branch: url.searchParams.get("branch") ?? "",
          path: url.searchParams.get("path") ?? "",
          head: url.searchParams.get("head") ?? undefined,
          page: url.searchParams.get("page") ?? undefined,
        }),
      );
    if (path === "/api/tree")
      return json(
        url.searchParams.get("recursive") === "1"
          ? await github.subtree(repo, url.searchParams.get("sha") ?? "")
          : await github.directory(repo, url.searchParams.get("sha") ?? ""),
      );
    if (path === "/api/raw")
      return json(await github.raw(repo, url.searchParams.get("sha") ?? ""));
    if (path === "/api/files")
      return json({
        files: await github.files(
          repo,
          (url.searchParams.get("shas") ?? "").split(",").filter(Boolean),
        ),
      });
    return json({
      content: await github.file(repo, url.searchParams.get("sha") ?? ""),
    });
  }
  if (path.startsWith("/auth/"))
    throw new HttpError(404, "Unknown sign-in action.");
  return env.ASSETS.fetch(request);
}
