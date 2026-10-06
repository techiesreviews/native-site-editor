import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { handle, type Env, type StoredValue } from "../worker/app.ts";
import { ObjectCache } from "../worker/blob-cache.ts";
import { configuredApp } from "../worker/owner-setup.ts";
import { Timing, requestFetch } from "../worker/timing.ts";

const origin = "https://editor.example";
const sessionId = "b".repeat(64);
const app = { clientId: "Iv1.app", clientSecret: "secret", slug: "owner-editor" };

/** An owner-setup editor (no App secrets): the App config lives in the store. */
function environment() {
  const records = new Map<string, StoredValue>();
  let config: unknown;
  const reads = { config: 0, session: 0 };
  const env: Env = {
    OWNER_SETUP_TOKEN: "a".repeat(64),
    ASSETS: { fetch: async () => new Response("UI") },
    SESSIONS: {
      idFromName: (name) => name,
      get: (id) => ({
        fetch: async (request) => {
          if (new URL(request.url).pathname === "/config") {
            reads.config++;
            return config ? Response.json(config) : new Response(null, { status: 404 });
          }
          reads.session++;
          const value = records.get(id);
          return value ? Response.json(value) : new Response(null, { status: 404 });
        },
      }),
    },
  };
  records.set(sessionId, {
    kind: "user",
    token: "user-token",
    login: "lex",
    avatar_url: "",
    expiresAt: Date.now() + 3_600_000,
  });
  return { env, reads, setConfig: (value: unknown) => (config = value) };
}
const signedIn = (path: string) =>
  new Request(origin + path, { headers: { Cookie: `__Host-ase_session=${sessionId}` } });
const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function spans(response: Response) {
  const header = response.headers.get("server-timing") ?? "";
  return new Map(
    header.split(", ").filter(Boolean).map((part) => {
      const [name, dur] = part.split(";dur=");
      return [name, dur === undefined ? true : Number(dur)] as const;
    }),
  );
}

// Runs first: the isolate's (this process's) first request is the cold one.
test("Server-Timing marks the isolate's first request cold and times session, config and total", async () => {
  const { env } = environment();
  const fake: typeof fetch = async () => Response.json({ installations: [] });
  const first = spans(await handle(signedIn("/api/session"), env, fake));
  assert.equal(first.get("cold"), true);
  for (const name of ["session", "config", "total"]) assert.equal(typeof first.get(name), "number", name);
  const second = spans(await handle(signedIn("/api/session"), env, fake));
  assert.equal(second.has("cold"), false);
  assert.ok((second.get("total") as number) >= 0);
  // Only /api/* responses carry it.
  const page = await handle(new Request(`${origin}/auth/setup.js`), env, fake);
  assert.equal(page.headers.get("server-timing"), null);
});

test("Server-Timing times authorization and GitHub subrequests on a repository read", async () => {
  const { env } = environment();
  const github: typeof fetch = async (input) => {
    await later(5);
    const path = new URL(String(input)).pathname;
    if (path === "/user/installations")
      return Response.json({ installations: [{ id: 1, account: { login: "lex", type: "User" } }] });
    if (path === "/user/installations/1/repositories")
      return Response.json({
        repositories: [
          { id: 7, name: "site", full_name: "lex/site", private: false, default_branch: "main", owner: { login: "lex", type: "User" } },
        ],
      });
    if (path === "/repos/lex/site/branches") return Response.json([{ name: "main" }]);
    throw new Error(`unexpected ${path}`);
  };
  const response = await handle(signedIn("/api/branches?repo=lex/site"), env, github);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), ["main"]);
  const timing = spans(response);
  // Two serial listing calls, then the branches: each waits at least 5 ms.
  assert.ok((timing.get("auth") as number) >= 8, `auth ${timing.get("auth")}`);
  assert.ok((timing.get("github") as number) >= 12, `github ${timing.get("github")}`);
  assert.ok((timing.get("total") as number) >= (timing.get("github") as number));
});

test("parallel calls of one span count their wall time once", async () => {
  const timing = new Timing();
  await Promise.all([1, 2, 3, 4].map(() => timing.time("github", later(20))));
  const github = Number(/github;dur=([\d.]+)/.exec(timing.header())![1]);
  assert.ok(github >= 15 && github < 60, `github ${github}`);
  assert.doesNotMatch(timing.header(), /cold/);
});

test("the stored GitHub App config is read once per isolate, and a missing one is asked again", async () => {
  const { env, reads, setConfig } = environment();
  assert.equal(await configuredApp(env), null);
  assert.equal(await configuredApp(env), null);
  assert.equal(reads.config, 2, "no config yet: every call asks, so a fresh setup shows at once");
  setConfig(app);
  assert.deepEqual(await configuredApp(env), app);
  const session = await handle(new Request(`${origin}/api/session`), env, fetch);
  assert.equal(((await session.json()) as { configured: boolean }).configured, true);
  assert.deepEqual(await configuredApp(env), app);
  assert.equal(reads.config, 3, "found once, then kept");
  // Another editor's store (another test environment) is not shared.
  const other = environment();
  assert.equal(await configuredApp(other.env), null);
  assert.equal(other.reads.config, 1);
});

test("blob cache writes go to waitUntil, and the colo cache is opened once", async () => {
  let opens = 0;
  const written: string[] = [];
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => (release = resolve));
  const cache = {
    match: async () => undefined,
    put: async (url: string) => {
      await blocked;
      written.push(url);
    },
  };
  (globalThis as { caches?: unknown }).caches = {
    open: async () => {
      opens++;
      return cache;
    },
  };
  try {
    const deferred: Promise<unknown>[] = [];
    const fetcher = requestFetch(globalThis.fetch, undefined, (promise) => deferred.push(promise));
    const objects = new ObjectCache(fetcher);
    // put returns while the Cache API write is still blocked.
    await objects.put("repo/blob-1", '"one"');
    assert.equal(deferred.length, 1);
    assert.deepEqual(written, []);
    // Kept in memory at once, for any request of this isolate.
    assert.equal(new ObjectCache(requestFetch(globalThis.fetch)).held("repo/blob-1"), '"one"');
    release();
    await Promise.all(deferred);
    assert.deepEqual(written, ["https://github-objects.cache/repo/blob-1"]);
    // Without a waitUntil (tests, scripts) the write is awaited.
    await new ObjectCache(globalThis.fetch).put("repo/blob-2", '"two"');
    assert.equal(written.length, 2);
    await new ObjectCache(requestFetch(globalThis.fetch)).get("repo/missing");
    assert.equal(opens, 1);
  } finally {
    delete (globalThis as { caches?: unknown }).caches;
  }
});

// /mcp through the lazily loaded module runs in tests/mcp-runtime.test.ts.
test("Workers runtime: Server-Timing and the cold marker on the bundle, MCP evaluated only on /mcp", async () => {
  const { outputFiles } = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    external: ["cloudflare:workers"],
    target: "es2022",
  });
  const script = outputFiles[0].text;
  // The MCP server module is bundled but evaluated on first use.
  assert.match(script, /await Promise\.resolve\(\)\.then\(\(\) => \(init_mcp\(\), mcp_exports\)\)/);
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: "2026-09-17",
      durableObjects: { SESSIONS: { className: "SessionStore", useSQLite: true } },
      bindings: { GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test", GITHUB_APP_SLUG: "test" },
      outboundService: async () => new Response(null, { status: 404 }),
    }),
  );
  try {
    const first = await worker.dispatchFetch(`${origin}/api/session`);
    assert.equal(first.status, 200);
    assert.match(first.headers.get("server-timing") ?? "", /^config;dur=[\d.]+, total;dur=[\d.]+, cold$/);
    const second = await worker.dispatchFetch(`${origin}/api/session`);
    assert.match(second.headers.get("server-timing") ?? "", /^config;dur=[\d.]+, total;dur=[\d.]+$/);
  } finally {
    await worker.dispose();
  }
});
