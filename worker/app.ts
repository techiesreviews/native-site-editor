import { requestJson } from "./http";
import {
  agentRecord,
  tokenId,
  getGrant,
  authenticateAgent,
  operateGrant,
  validateContext,
  type AgentGrant,
} from "./agent-context";
import { handleMcp } from "./mcp";
import { publish } from "./publish";
import { history, restore } from "./history";
import { detectEditorIntegration, updateEditorIntegration } from "./integration";
import { GitHub, HttpError } from "./github";
import {
  createDraftPreview,
  draftPreviewAvailability,
} from "./draft-preview";

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
}
export type StoredSession = Session | OAuthState | AgentGrant;

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SESSIONS: {
    idFromName(name: string): any;
    get(id: any): { fetch(request: Request): Promise<Response> };
  };
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_APP_SLUG?: string;
}

function configured(env: Env) {
  return Boolean(
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.GITHUB_APP_SLUG,
  );
}
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
async function store(
  env: Env,
  id: string,
  method = "GET",
  value?: StoredSession,
  consume = false,
) {
  return env.SESSIONS.get(env.SESSIONS.idFromName(id)).fetch(
    new Request(`https://session.internal/${consume ? "consume" : ""}`, {
      method,
      body: value ? JSON.stringify(value) : undefined,
    }),
  );
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
    secured.headers.set("WWW-Authenticate", 'Bearer realm="astro-site-editor"');
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
        path === "/api/editor-integration/update" ||
        path === "/api/draft-preview" ||
        path.startsWith("/api/agent/")) &&
      request.method === "POST"
    )
  )
    throw new HttpError(405, "Method not allowed.");

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
      const token = `ase_${randomId()}`;
      const id = await tokenId(token);
      await agentRecord(env, id, "PUT", {
        kind: "agent",
        sessionId,
        login: user.login,
        repoId: repo.id,
        repo: repo.full_name,
        expiresAt: user.expiresAt,
      });
      return json({
        id,
        token,
        endpoint: `${url.origin}/mcp`,
        expiresAt: user.expiresAt,
      });
    }
    const id = url.searchParams.get("id") ?? "";
    const grant = await getGrant(env, id);
    if (grant.sessionId !== sessionId || grant.login !== user.login)
      throw new HttpError(
        403,
        "This connection belongs to another editor session.",
      );
    if (path === "/api/agent/connection" && request.method === "GET")
      return json({
        repoId: grant.repoId,
        expiresAt: grant.expiresAt,
        updatedAt: grant.updatedAt,
        commands: grant.commands ?? [],
      });
    if (path === "/api/agent/revoke" && request.method === "POST") {
      await agentRecord(env, id, "DELETE");
      return json({ ok: true });
    }
    if (path === "/api/agent/pause" && request.method === "POST")
      return json(await operateGrant(env, id, { type: "pause" }));
    if (path === "/api/agent/context" && request.method === "POST") {
      const context = validateContext(await requestJson(request));
      if (
        context.repository.id !== grant.repoId ||
        context.repository.fullName !== grant.repo
      )
        throw new HttpError(
          403,
          "This connection is scoped to a different repository.",
        );
      return json(await operateGrant(env, id, { type: "context", context }));
    }
    if (path === "/api/agent/ack" && request.method === "POST") {
      const data = await requestJson(request, 4096);
      return json(
        await operateGrant(env, id, {
          type: "ack",
          id: data.id,
          state: data.state,
          message: data.message,
        }),
      );
    }
    throw new HttpError(404, "Agent endpoint not found.");
  }
  if (path === "/auth/login") {
    if (!configured(env))
      throw new HttpError(
        503,
        "GitHub connection is not configured. Run npm run setup in the editor project.",
      );
    const id = randomId();
    await store(env, id, "PUT", {
      kind: "oauth",
      expiresAt: Date.now() + 600_000,
    });
    const target = new URL("https://github.com/login/oauth/authorize");
    target.searchParams.set("client_id", env.GITHUB_CLIENT_ID!);
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
    if (!code || code.length > 512 || !configured(env))
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
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
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
    return redirect("/", [
      setCookie(url, "session", id, duration),
      setCookie(url, "oauth", "", 0),
    ]);
  }
  if (path === "/api/session") {
    const user = await session(request, env);
    return json({
      configured: configured(env),
      user: user ? { login: user.login, avatar_url: user.avatar_url } : null,
      installUrl: env.GITHUB_APP_SLUG
        ? `https://github.com/apps/${encodeURIComponent(env.GITHUB_APP_SLUG)}/installations/new`
        : null,
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
  if (path === "/api/editor-integration/update") {
    if (request.method !== "POST")
      throw new HttpError(405, "Use POST to update integration.");
    if (request.headers.get("Origin") !== url.origin)
      throw new HttpError(403, "Invalid request origin.");
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      throw new HttpError(415, "Send a JSON integration update request.");
    const user = await session(request, env);
    if (!user)
      throw new HttpError(401, "Connect GitHub to update integration.");
    const data = await requestJson(request, 4096);
    const github = new GitHub(user.token, fetcher);
    const repo = await github.authorizeRepository(
      user.login,
      url.searchParams.get("repo") ?? "",
    );
    return json(await updateEditorIntegration(github, repo, data));
  }
  if (path === "/api/draft-preview") {
    if (!["GET", "POST"].includes(request.method))
      throw new HttpError(405, "Method not allowed.");
    const user = await session(request, env);
    if (!user)
      throw new HttpError(401, "Connect GitHub to preview draft changes.");
    const github = new GitHub(user.token, fetcher);
    const repo = await github.authorizeRepository(
      user.login,
      url.searchParams.get("repo") ?? "",
    );
    if (request.method === "GET")
      return json(
        await draftPreviewAvailability(
          github,
          repo,
          url.searchParams.get("branch") ?? "",
          url.searchParams.get("baseCommit") ?? "",
        ),
      );
    if (request.headers.get("Origin") !== url.origin)
      throw new HttpError(403, "Invalid request origin.");
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      throw new HttpError(415, "Send a JSON draft preview request.");
    const data = await requestJson(request, 2 * 1024 * 1024);
    return json(await createDraftPreview(github, repo, data), 202);
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
        "/api/history",
        "/api/editor-integration",
      ].includes(path)
    )
      throw new HttpError(404, "Endpoint not found.");
    const repo = await github.authorizeRepository(
      user.login,
      url.searchParams.get("repo") ?? "",
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
    if (path === "/api/editor-integration")
      return json(
        await detectEditorIntegration(
          github,
          repo,
          url.searchParams.get("branch") ?? "",
        ),
      );
    if (path === "/api/tree")
      return json(
        await github.directory(repo, url.searchParams.get("sha") ?? ""),
      );
    return json({
      content: await github.file(repo, url.searchParams.get("sha") ?? ""),
    });
  }
  if (path.startsWith("/auth/"))
    throw new HttpError(404, "Unknown sign-in action.");
  return env.ASSETS.fetch(request);
}
