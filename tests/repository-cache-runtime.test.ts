import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const repo = { id: 1, name: "site", full_name: "lex/site", private: true, default_branch: "main", owner: { login: "lex", type: "User" }, installation_id: 1 };

test("session Durable Object persists TTL listings, conditional pages, and invalidation generations", async () => {
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
    const saved = await (await stub.fetch("https://session.internal/")).json();
    assert.equal(saved.repositoryCache.pages["/user/installations?per_page=100&page=1"].etag, '"owners"');
    const branches = await worker.dispatchFetch(`${origin}/api/branches?repo=lex/site`, { headers });
    assert.equal(branches.status, 200);
    assert.equal(calls.filter((call) => call.path === "/user/installations").length, 1, "authorization uses the persisted listing");
    saved.repositoryCache.fetchedAt = Date.now() - 60001;
    await stub.fetch("https://session.internal/repository-cache", { method: "PUT", body: JSON.stringify({ token: "token", generation: 1, value: saved.repositoryCache }) });
    assert.deepEqual(await (await list()).json(), [repo]);
    assert.deepEqual(calls.slice(-2).map((call) => call.etag), ['"owners"', '"repos"']);
    allowed = false;
    assert.equal((await worker.dispatchFetch(`${origin}/api/branches?repo=lex/site`, { headers })).status, 200, "reads accept removed access only within the TTL");
    const revoked = await (await stub.fetch("https://session.internal/")).json();
    revoked.repositoryCache.fetchedAt = Date.now() - 60001;
    await stub.fetch("https://session.internal/repository-cache", { method: "PUT", body: JSON.stringify({ token: "token", generation: 1, value: revoked.repositoryCache }) });
    assert.equal((await worker.dispatchFetch(`${origin}/api/branches?repo=lex/site`, { headers })).status, 403, "removed access expires within 60 seconds");
    const fresh = await worker.dispatchFetch(`${origin}/api/repositories?refresh=1`, { headers });
    assert.deepEqual(await fresh.json(), []);
    assert.equal((await worker.dispatchFetch(`${origin}/api/branches?repo=lex/site`, { headers })).status, 403);
    await stub.fetch("https://session.internal/repository-cache", { method: "DELETE" });
    await stub.fetch("https://session.internal/repository-cache", { method: "PUT", body: JSON.stringify({ token: "token", generation: 1, value: saved.repositoryCache }) });
    const invalidated = await (await stub.fetch("https://session.internal/")).json();
    assert.equal(invalidated.repositoryCache, undefined, "an in-flight listing cannot refill an invalidated generation");
    assert.equal(invalidated.repositoryCacheGeneration, 2);
    const largeCache = { ...saved.repositoryCache, fetchedAt: Date.now(), repositories: Array.from({ length: 2000 }, (_, index) => ({ ...repo, id: index + 1, name: `site-${index}`, full_name: `lex/site-${index}` })) };
    assert.ok(JSON.stringify(largeCache).length > 128 * 1024);
    await stub.fetch("https://session.internal/repository-cache", { method: "PUT", body: JSON.stringify({ token: "token", generation: 2, value: largeCache }) });
    const beforeLarge = calls.length;
    assert.equal((await (await list()).json()).length, 2000);
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
    assert.equal((await (await stub.fetch("https://session.internal/")).json()).repositoryCache, undefined);
    assert.equal((await (await second.fetch("https://session.internal/")).json()).repositoryCache, undefined);
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
