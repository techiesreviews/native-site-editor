import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { startCountedWorker } from "./fakes/counted-agent";
import { editorTab, origin, signIn } from "./mcp-harness";
import { forEachAwait } from "./support/await-race";
import type { RepositoryCache } from "../worker/github";

const repo = { id: 1, name: "site", full_name: "lex/site", private: true, default_branch: "main", size: 488_282, owner: { login: "lex", type: "User" }, installation_id: 1 };

test("session Durable Object loads TTL listings lazily, conditional pages, and invalidation generations", async () => {
  const { outputFiles } = await build({ entryPoints: ["worker/index.ts"], bundle: true, write: false, format: "esm", platform: "browser", external: ["cloudflare:workers"], target: "es2022" });
  const calls: { path: string; etag: string | null }[] = [];
  let allowed = true;
  const worker = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: outputFiles[0].text, compatibilityDate: "2026-09-17",
    durableObjects: { SESSIONS: { className: "SessionStore", useSQLite: true } },
    bindings: { GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test", GITHUB_APP_SLUG: "test" },
    outboundService: async (request) => {
      const path = new URL(request.url).pathname;
      const etag = request.headers.get("if-none-match");
      calls.push({ path, etag });
      if (path === "/user/installations") {
        if (etag === '"owners"') return new Response(null, { status: 304 });
        return Response.json({ installations: [{ id: 1, account: { login: "lex", type: "User" } }] }, { headers: { ETag: '"owners"' } });
      }
      if (path === "/user/installations/1/repositories") {
        if (allowed && etag === '"repos"') return new Response(null, { status: 304 });
        return Response.json({ repositories: allowed ? [repo] : [] }, { headers: { ETag: allowed ? '"repos"' : '"empty"' } });
      }
      if (path === "/repos/lex/site/branches") return Response.json([{ name: "main", commit: { sha: "a".repeat(40) } }]);
      throw new Error(`Unexpected ${path}`);
    },
  }));
  try {
    const sessions = await worker.getDurableObjectNamespace("SESSIONS");
    const stub = sessions.get(sessions.idFromName("a".repeat(64)));
    const stored = { kind: "user", token: "token", login: "lex", avatar_url: "", expiresAt: Date.now() + 3600000 };
    await stub.fetch("https://session.internal/", { method: "PUT", body: JSON.stringify(stored) });
    const origin = "https://editor.example";
    const headers = { Cookie: `__Host-ase_session=${"a".repeat(64)}` };
    const session = await worker.dispatchFetch(`${origin}/api/session`, { headers });
    const info = await session.json();
    assert.equal(info.user.login, "lex");
    assert.equal("repositories" in info, false);
    assert.equal("onboarding" in info, false);
    assert.equal(calls.length, 0);
    const list = () => worker.dispatchFetch(`${origin}/api/repositories`, { headers });
    assert.deepEqual(await (await list()).json(), [repo]);
    assert.equal(calls.length, 2);
    assert.deepEqual(await (await list()).json(), [repo]);
    assert.equal(calls.length, 2);
    const fallback = async () => (await stub.fetch("https://session.internal/repository-cache")).json();
    const saved = { repositoryCache: (await fallback()).value };
    assert.equal(saved.repositoryCache.pages["/user/installations?per_page=100&page=1"].etag, '"owners"');
    const branches = await worker.dispatchFetch(`${origin}/api/branches?repo=lex/site`, { headers });
    assert.equal(branches.status, 200);
    assert.equal(calls.filter((call) => call.path === "/user/installations").length, 1, "authorization uses the persisted listing");
    saved.repositoryCache.fetchedAt = Date.now() - 60001;
    await stub.fetch("https://session.internal/repository-cache", { method: "DELETE" });
    await stub.fetch("https://session.internal/repository-cache", { method: "PUT", body: JSON.stringify({ token: "token", generation: 2, value: saved.repositoryCache }) });
    assert.deepEqual(await (await list()).json(), [repo]);
    assert.deepEqual(calls.slice(-2).map((call) => call.etag), ['"owners"', '"repos"']);
    allowed = false;
    assert.equal((await worker.dispatchFetch(`${origin}/api/branches?repo=lex/site`, { headers })).status, 200, "reads accept removed access only within the TTL");
    const revoked = { repositoryCache: (await fallback()).value };
    revoked.repositoryCache.fetchedAt = Date.now() - 60001;
    await stub.fetch("https://session.internal/repository-cache", { method: "DELETE" });
    await stub.fetch("https://session.internal/repository-cache", { method: "PUT", body: JSON.stringify({ token: "token", generation: 3, value: revoked.repositoryCache }) });
    assert.equal((await worker.dispatchFetch(`${origin}/api/branches?repo=lex/site`, { headers })).status, 403, "removed access expires within 60 seconds");
    const fresh = await worker.dispatchFetch(`${origin}/api/repositories?refresh=1`, { headers });
    assert.deepEqual(await fresh.json(), []);
    assert.equal((await worker.dispatchFetch(`${origin}/api/branches?repo=lex/site`, { headers })).status, 403);
    await stub.fetch("https://session.internal/repository-cache", { method: "DELETE" });
    await stub.fetch("https://session.internal/repository-cache", { method: "PUT", body: JSON.stringify({ token: "token", generation: 1, value: saved.repositoryCache }) });
    const invalidated = await (await stub.fetch("https://session.internal/")).json();
    assert.equal(invalidated.repositoryCache, undefined, "an in-flight listing cannot refill an invalidated generation");
    assert.equal(invalidated.repositoryCacheGeneration, 4);
    assert.equal((await fallback()).value, null);
    const largeCache = { ...saved.repositoryCache, fetchedAt: Date.now(), repositories: Array.from({ length: 900 }, (_, index) => ({ ...repo, id: index + 1, name: `site-${index}`, full_name: `lex/site-${index}` })) };
    assert.ok(Buffer.byteLength(JSON.stringify(largeCache)) > 128 * 1024);
    assert.ok(Buffer.byteLength(JSON.stringify(largeCache)) <= 262144);
    await stub.fetch("https://session.internal/repository-cache", { method: "PUT", body: JSON.stringify({ token: "token", generation: 4, value: largeCache }) });
    const beforeLarge = calls.length;
    assert.equal((await (await list()).json()).length, 900);
    assert.equal(calls.length, beforeLarge, "large persisted listings remain cache hits");
    const secondId = "b".repeat(64);
    const second = sessions.get(sessions.idFromName(secondId));
    await second.fetch("https://session.internal/", { method: "PUT", body: JSON.stringify({ ...stored, login: "other", token: "other-token" }) });
    await second.fetch("https://session.internal/repository-cache", { method: "PUT", body: JSON.stringify({ token: "other-token", generation: 1, value: saved.repositoryCache }) });
    await stub.fetch("https://session.internal/repository-cache", { method: "PUT", body: JSON.stringify({ token: "token", generation: 2, value: saved.repositoryCache }) });
    const switched = await worker.dispatchFetch(`${origin}/api/accounts/switch`, {
      method: "POST", headers: { Cookie: `${headers.Cookie}; __Host-ase_accounts=${"a".repeat(64)}.${secondId}`, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ login: "other" }),
    });
    assert.equal(switched.status, 204);
    assert.equal((await fallback()).value, null);
    assert.equal((await (await second.fetch("https://session.internal/repository-cache")).json()).value, null);
    const signout = await worker.dispatchFetch(`${origin}/auth/logout`, { method: "POST", headers: { ...headers, Origin: origin } });
    assert.equal(signout.status, 204);
    assert.equal((await list()).status, 401);
    assert.equal((await stub.fetch("https://session.internal/repository-cache", { method: "PUT", body: JSON.stringify({ token: "token", generation: 2, value: saved.repositoryCache }) })).status, 401);
  } finally { await worker.dispose(); }
});

test("a fresh GitHub client authorizes reads from persisted cache but writes revalidate", async () => {
  const { GitHub } = await import("../worker/github");
  const cache = { fetchedAt: Date.now(), repositories: [repo], installations: [{ id: 1, login: "lex", type: "User" as const }], pages: {} };
  let calls = 0;
  const fetcher: typeof fetch = async (input) => {
    calls++;
    return Response.json(String(input).includes("/repositories") ? { repositories: [] } : { installations: [{ id: 1, account: { login: "lex", type: "User" } }] });
  };
  const github = new GitHub("token", fetcher, { value: cache, save: async () => {} });
  assert.deepEqual(await github.authorizeRepository("lex", "lex/site", 60000), repo);
  assert.equal(calls, 0);
  await assert.rejects(github.authorizeRepository("lex", "lex/site", 0), (error: any) => error.status === 403);
  assert.equal(calls, 2);
});

test("concurrent session reads share only the in-flight GitHub listing", async () => {
  const { GitHub } = await import("../worker/github");
  let calls = 0;
  const fetcher: typeof fetch = async (input) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json(String(input).includes("/repositories") ? { repositories: [repo] } : { installations: [{ id: 1, account: { login: "lex", type: "User" } }] });
  };
  const firstStore = { key: "session-1", save: async () => {} };
  const secondStore = { key: "session-1", save: async () => {} };
  const first = new GitHub("token", fetcher, firstStore);
  const second = new GitHub("token", fetcher, secondStore);
  assert.deepEqual(await Promise.all([first.repositories("lex", 60000), second.repositories("lex", 60000)]), [[repo], [repo]]);
  assert.equal(calls, 2);
  assert.equal(second.repositoryOnboarding(), "none");
  await new GitHub("token", fetcher, { key: "session-1", save: async () => {} }).repositories("lex", 60000);
  assert.equal(calls, 4, "a completed in-flight request does not become another TTL cache");
});

const isCacheKey = (key: string) => key === "repositoryCache" || key.startsWith("repositoryCache:");
function cacheWithBytes(bytes: number): RepositoryCache {
  const value: RepositoryCache = { fetchedAt: Date.now(), repositories: [repo], installations: [{ id: 1, login: "lex", type: "User" }], pages: { padding: { data: "é" } } };
  value.pages.padding.data += "x".repeat(bytes - Buffer.byteLength(JSON.stringify(value)));
  assert.equal(Buffer.byteLength(JSON.stringify(value)), bytes);
  return value;
}
async function countedSession() {
  const h = await startCountedWorker();
  const { cookie } = await signIn(h.worker);
  const id = cookie.split("=")[1];
  const stub = h.namespace.get(id);
  const fallback = async () => {
    const response = await stub.fetch(new Request("https://session.internal/repository-cache"));
    assert.equal(response.status, 200);
    return await response.json() as { generation: number; value: RepositoryCache | null };
  };
  const putCache = (value: RepositoryCache, generation = 1) => stub.fetch(new Request("https://session.internal/repository-cache", {
    method: "PUT", body: JSON.stringify({ token: "github-private-token", generation, value }),
  }));
  const list = () => h.worker.dispatchFetch(`${origin}/api/repositories`, { headers: { Cookie: cookie } });
  return { ...h, cookie, id, stub, fallback, putCache, list };
}

test("MCP tools/list and editor authentication read zero listing keys with a large durable cache", async () => {
  const h = await countedSession();
  try {
    const tab = editorTab(h.worker, h.cookie);
    // The grant checks repository membership freshly before this test measures authentication.
    const connection = await tab.post("/api/agent/connect", { repo: "lex/starter", repoId: 1, branch: "main" });
    assert.equal(connection.status, 200);
    const { token } = await connection.json() as { token: string };
    await h.putCache(cacheWithBytes(262144));
    assert.ok((await h.storage(h.id).list({ prefix: "repositoryCache:" })).size > 1);
    const rpc = (method: string, params?: object) => h.worker.dispatchFetch(`${origin}/mcp`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    assert.equal((await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "cache-test", version: "1" } })).status, 200);
    h.counters.reset();
    const tools = await rpc("tools/list");
    assert.equal(tools.status, 200);
    assert.match(await tools.text(), /"tools"/);
    assert.equal(h.counters.byCategory.auth.calls, 3);
    assert.equal(h.counters.byCategory.data.calls, 0);
    assert.equal(h.counters.readKeys.filter(isCacheKey).length, 0);
    assert.ok(h.counters.readKeys.includes("repositoryCacheGeneration"), "generation is authentication metadata");
    h.counters.reset();
    assert.equal((await h.worker.dispatchFetch(`${origin}/api/session`, { headers: { Cookie: h.cookie } })).status, 200);
    assert.equal(h.counters.readKeys.filter(isCacheKey).length, 0);
    assert.equal(h.counters.byCategory.auth.keysRead, 2);
    h.counters.reset();
    const consumed = await h.stub.fetch(new Request("https://session.internal/consume", { method: "POST" }));
    assert.equal(consumed.status, 200);
    assert.equal((await consumed.json() as { repositoryCache?: unknown }).repositoryCache, undefined);
    assert.equal(h.counters.readKeys.filter(isCacheKey).length, 0);
  } finally { await h.worker.dispose(); }
});

test("durable fallback stores exactly 262144 UTF-8 bytes and clears an older copy at 262145", async () => {
  const h = await countedSession();
  try {
    const alarm = await h.storage(h.id).getAlarm();
    const exact = cacheWithBytes(262144);
    assert.equal((await h.putCache(exact)).status, 204);
    assert.deepEqual((await h.fallback()).value, exact);
    const chunks = await h.storage(h.id).list({ prefix: "repositoryCache:" });
    assert.equal(Buffer.byteLength([...chunks.values()].join("")), 262144);
    h.counters.reset();
    assert.deepEqual(await (await h.list()).json(), [repo]);
    assert.ok(h.counters.readKeys.filter(isCacheKey).length > 1, "first listing loads durable chunks");
    h.counters.reset();
    assert.deepEqual(await (await h.list()).json(), [repo]);
    assert.equal(h.counters.readKeys.filter(isCacheKey).length, 0, "memory hit reads no durable listing");
    assert.equal(h.counters.byCategory.data.calls, 0);
    assert.equal((await h.putCache(cacheWithBytes(262145))).status, 204);
    assert.equal((await h.fallback()).value, null);
    assert.equal((await h.storage(h.id).list({ prefix: "repositoryCache:" })).size, 0);
    assert.equal(await h.storage(h.id).getAlarm(), alarm, "cache retention never extends sign-in");
  } finally { await h.worker.dispose(); }
});

test("oversized GitHub listings remain in memory; a fresh isolate fetches normally", async () => {
  const { outputFiles } = await build({ entryPoints: ["worker/index.ts"], bundle: true, write: false, format: "esm", platform: "browser", external: ["cloudflare:workers"], target: "es2022" });
  let calls = 0;
  const largeRepo = { ...repo, name: "x".repeat(140000) };
  const createWorker = () => new Miniflare(convertV4MiniflareOptions({
    modules: true, script: outputFiles[0].text, compatibilityDate: "2026-09-17",
    durableObjects: { SESSIONS: { className: "SessionStore", useSQLite: true } },
    bindings: { GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test", GITHUB_APP_SLUG: "test" },
    outboundService: (request) => {
      calls++;
      return Response.json(new URL(request.url).pathname.endsWith("/repositories") ? { repositories: [largeRepo] } : { installations: [{ id: 1, account: { login: "lex", type: "User" } }] });
    },
  }));
  const first = createWorker(), fresh = createWorker();
  try {
    const id = "d".repeat(64);
    const user = { kind: "user", token: "oversized-token", login: "lex", avatar_url: "", expiresAt: Date.now() + 3600000 };
    for (const worker of [first, fresh]) {
      const namespace = await worker.getDurableObjectNamespace("SESSIONS");
      const stub = namespace.get(namespace.idFromName(id));
      await stub.fetch("https://session.internal/", { method: "PUT", body: JSON.stringify(user) });
      const list = () => worker.dispatchFetch(`${origin}/api/repositories`, { headers: { Cookie: `__Host-ase_session=${id}` } });
      const before = calls;
      assert.deepEqual(await (await list()).json(), [largeRepo]);
      assert.equal(calls - before, 2, "each fresh isolate fetches GitHub");
      assert.equal((await (await stub.fetch("https://session.internal/repository-cache")).json()).value, null);
      assert.deepEqual(await (await list()).json(), [largeRepo]);
      assert.equal(calls - before, 2, "same isolate keeps an oversized listing in memory");
    }
  } finally { await Promise.all([first.dispose(), fresh.dispose()]); }
});

test("invalidation and session replacement fence memory, durable fallback and old refills", async () => {
  const h = await countedSession();
  try {
    assert.equal((await (await h.list()).json() as unknown[]).length, 1);
    const old = await h.fallback();
    await h.stub.fetch(new Request("https://session.internal/repository-cache", { method: "DELETE" }));
    assert.equal((await h.fallback()).generation, 2);
    assert.equal((await h.fallback()).value, null);
    assert.equal((await h.putCache(old.value!, 1)).headers.has("X-Repository-Cache-Generation"), false);
    h.github.allowed = false;
    h.github.requests.length = 0;
    assert.deepEqual(await (await h.list()).json(), []);
    assert.equal(h.github.requests.length, 2, "generation bump cannot use old memory");
    const session = await h.storage(h.id).get("session");
    await h.stub.fetch(new Request("https://session.internal/", { method: "PUT", body: JSON.stringify(session) }));
    assert.equal((await h.fallback()).generation, 3);
    assert.equal((await h.fallback()).value, null);
    await h.putCache(old.value!, 2);
    assert.equal((await h.fallback()).value, null);
    h.github.allowed = true;
    assert.equal((await (await h.list()).json() as unknown[]).length, 1);
  } finally { await h.worker.dispose(); }
});

test("sign-out deletes durable fallback and isolate memory and refuses a subsequent PUT", async () => {
  const h = await countedSession();
  try {
    await h.list();
    const saved = await h.fallback();
    const session = await h.storage(h.id).get("session");
    assert.equal((await h.worker.dispatchFetch(`${origin}/auth/logout`, { method: "POST", headers: { Cookie: h.cookie, Origin: origin } })).status, 204);
    assert.equal((await h.storage(h.id).list({ prefix: "repositoryCache" })).size, 0);
    assert.equal((await h.putCache(saved.value!)).status, 401);
    assert.equal((await h.list()).status, 401);
    // Reuse the identity and generation deliberately to prove memory was dropped.
    await h.stub.fetch(new Request("https://session.internal/", { method: "PUT", body: JSON.stringify(session) }));
    h.github.allowed = false;
    h.github.requests.length = 0;
    assert.deepEqual(await (await h.list()).json(), []);
    assert.equal(h.github.requests.length, 2);
  } finally { await h.worker.dispose(); }
});

test("expiry hides fallback before physical cleanup; the session alarm deletes it", async (t) => {
  const h = await countedSession();
  try {
    await h.putCache(cacheWithBytes(262144));
    await h.list();
    const session = await h.storage(h.id).get<{ expiresAt: number }>("session");
    t.mock.method(Date, "now", () => session!.expiresAt);
    h.counters.reset();
    assert.equal((await h.stub.fetch(new Request("https://session.internal/repository-cache"))).status, 404);
    assert.equal(h.counters.readKeys.filter(isCacheKey).length, 0);
    assert.equal((await h.list()).status, 401);
    assert.equal((await h.putCache(cacheWithBytes(262144))).status, 401);
    assert.ok((await h.storage(h.id).list({ prefix: "repositoryCache:" })).size > 0);
    await h.alarm(h.id);
    assert.equal((await h.storage(h.id).list({ prefix: "repositoryCache" })).size, 0);
    assert.equal((await h.stub.fetch(new Request("https://session.internal/repository-cache"))).status, 404);
  } finally { t.mock.restoreAll(); await h.worker.dispose(); }
});

for (const action of ["invalidate", "signout"] as const) {
  test(`${action} at each await prevents an in-flight listing from refilling usable cache`, async () => {
    const { handle } = await import("../worker/app");
    const h = await startCountedWorker();
    let sequence = action === "signout" ? 100 : 0;
    const session = { kind: "user", token: "race-token", login: "lex", avatar_url: "", expiresAt: Date.now() + 3600000 };
    const baseEnv = { SESSIONS: h.namespace, ASSETS: { fetch: async () => new Response(null, { status: 404 }) }, GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test", GITHUB_APP_SLUG: "test" };
    const github: typeof fetch = async (input) => Response.json(String(input).includes("/repositories") ? { repositories: [repo] } : { installations: [{ id: 1, account: { login: "lex", type: "User" } }] });
    try {
      const points = await forEachAwait((race) => {
        const id = (++sequence).toString(16).padStart(64, "0");
        const headers = { Cookie: `__Host-ase_session=${id}; __Host-ase_accounts=${id}`, Origin: origin, "Content-Type": "application/json" };
        const stub = h.namespace.get(id);
        const env = { ...baseEnv, SESSIONS: { idFromName: h.namespace.idFromName, get: (name: string) => ({ fetch: race.port("durable", (request: Request) => h.namespace.get(name).fetch(request)) }) } };
        const done = (async () => {
          await stub.fetch(new Request("https://session.internal/", { method: "PUT", body: JSON.stringify(session) }));
          const response = await handle(new Request(`${origin}/api/repositories`, { headers }), env, race.port("github", github));
          assert.ok(response.status === 200 || response.status === 401);
        })();
        return { id, headers, stub, done };
      }, async ({ headers }) => {
        const response = await handle(new Request(`${origin}${action === "signout" ? "/auth/logout" : "/api/accounts/switch"}`, {
          method: "POST", headers, ...(action === "invalidate" ? { body: JSON.stringify({ login: "lex" }) } : {}),
        }), baseEnv, github);
        assert.equal(response.status, 204);
      }, async ({ id, headers, stub }) => {
        assert.equal((await h.storage(id).list({ prefix: "repositoryCache:" })).size, 0);
        if (action === "signout")
          await stub.fetch(new Request("https://session.internal/", { method: "PUT", body: JSON.stringify(session) }));
        const denied: typeof fetch = async (input) => Response.json(String(input).includes("/repositories") ? { repositories: [] } : { installations: [{ id: 1, account: { login: "lex", type: "User" } }] });
        const response = await handle(new Request(`${origin}/api/repositories`, { headers }), baseEnv, denied);
        assert.deepEqual(await response.json(), [], "late responses cannot restore usable isolate memory");
      });
      assert.ok(points >= 5, "session read, fallback read, two GitHub reads, and cache PUT are disturbed");
    } finally { await h.worker.dispose(); }
  });
}

test("repository storage loads once on demand, including standalone listing pages", async () => {
  const { GitHub } = await import("../worker/github");
  let loads = 0;
  const fetcher: typeof fetch = async (input) => Response.json(String(input).includes("/user/installations") ? { installations: [] } : {});
  const github = new GitHub("lazy-token", fetcher, { load: async () => { loads++; return undefined; }, save: async () => {} });
  await github.get("/user");
  assert.equal(loads, 0);
  await github.ownerInstallations("lex");
  assert.equal(loads, 1);
  await github.repositories("lex", 60000);
  assert.equal(loads, 1);
});

test("isolate memory evicts the oldest of more than 256 sign-in entries", async () => {
  const h = await startCountedWorker();
  try {
    const user = { kind: "user", token: "lru-token", login: "lex", avatar_url: "", expiresAt: Date.now() + 3600000 };
    const list = (id: string) => h.worker.dispatchFetch(`${origin}/api/repositories`, { headers: { Cookie: `__Host-ase_session=${id}` } });
    const ids = Array.from({ length: 257 }, (_, index) => (index + 1000).toString(16).padStart(64, "0"));
    for (const id of ids) {
      await h.namespace.get(id).fetch(new Request("https://session.internal/", { method: "PUT", body: JSON.stringify(user) }));
      assert.equal((await list(id)).status, 200);
    }
    h.counters.reset();
    assert.equal((await list(ids.at(-1)!)).status, 200);
    assert.equal(h.counters.byCategory.data.calls, 0, "newest entry stays in memory");
    h.counters.reset();
    assert.equal((await list(ids[0])).status, 200);
    assert.equal(h.counters.byCategory.data.calls, 1, "oldest entry falls back to durable storage");
    assert.ok(h.counters.readKeys.filter(isCacheKey).length > 0);
  } finally { await h.worker.dispose(); }
});

test("a slow fallback read cannot restore a listing that repository creation replaced", async () => {
  const { handle } = await import("../worker/app.ts");
  const { repositoryCacheRequest } = await import("./session-cache-fake.ts");
  const origin = "https://editor.example";
  const id = "d".repeat(64);
  const created = { ...repo, id: 2, name: "new-site", full_name: "lex/new-site" };
  const records = new Map<string, any>([[id, {
    kind: "user", token: "slow-token", login: "lex", avatar_url: "", expiresAt: Date.now() + 60_000, repositoryCacheGeneration: 1,
    repositoryCache: { fetchedAt: Date.now(), repositories: [repo], installations: [{ id: 1, login: "lex", type: "User" }], pages: {} },
  }]]);
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let fallbackReads = 0;
  const env: any = {
    GITHUB_CLIENT_ID: "c", GITHUB_CLIENT_SECRET: "s", GITHUB_APP_SLUG: "test-editor",
    ASSETS: { fetch: async () => new Response("UI") },
    SESSIONS: {
      idFromName: (name: string) => name,
      get: (key: string) => ({
        fetch: async (request: Request) => {
          if (new URL(request.url).pathname === "/repository-cache" && request.method === "GET") {
            // Request A takes the old snapshot now and answers only after B has finished.
            const answer = await repositoryCacheRequest(request, records, key);
            if (++fallbackReads === 1) await held;
            return answer!;
          }
          const cache = await repositoryCacheRequest(request, records, key);
          if (cache) return cache;
          const { repositoryCache: _, ...session } = records.get(key) ?? {};
          return records.has(key) ? Response.json(session) : new Response(null, { status: 404 });
        },
      }),
    },
  };
  let repositories = [repo];
  const github: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === "/user/installations") return Response.json({ installations: [{ id: 1, account: { login: "lex", type: "User" } }] });
    if (path === "/user/installations/1/repositories") return Response.json({ repositories });
    if (path === "/user/repos" && init?.method === "POST") {
      repositories = [repo, created];
      return Response.json({ ...created, private: false }, { status: 201 });
    }
    throw new Error(`Unexpected ${init?.method ?? "GET"} ${path}`);
  };
  const cookie = `__Host-ase_session=${id}`;
  const list = () => handle(new Request(`${origin}/api/repositories`, { headers: { Cookie: cookie } }), env, github);
  const a = list();
  while (fallbackReads === 0) await new Promise((resolve) => setTimeout(resolve, 1));
  const b = await handle(new Request(`${origin}/api/repositories`, {
    method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "new-site", private: false }),
  }), env, github);
  assert.equal(b.status, 201, await b.clone().text());
  release();
  await (await a).arrayBuffer();
  const after = await (await list()).json() as { full_name: string }[];
  assert.ok(after.some((entry) => entry.full_name === "lex/new-site"), "the listing after creation includes the new repository");
});
