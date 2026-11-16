// The Worker's route table (TOOLS-267, worker/routes.ts): every route listed once with its methods, where a browser
// request may come from, who must be signed in and its body limit, checked by one guard before any handler. These
// tests walk the table itself, so a route added to it is tested with the rest, and a route the code names without an
// entry fails here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { handle, type Env, type StoredSession } from "../worker/app.ts";
import { ROUTES, OBSOLETE_AGENT_ROUTES, type Method, type Rule } from "../worker/routes.ts";
import { AGENTS_PAUSED } from "../worker/agent-controls.ts";

const origin = "https://editor.example";
const evil = "https://evil.example";
const session = "c".repeat(64);
const cookie = `__Host-ase_session=${session}`;

/** An environment whose session store counts its reads; `signedIn` keeps one live editor session. */
function environment(signedIn = false) {
  const records = new Map<string, StoredSession>();
  if (signedIn) records.set(session, { kind: "user", token: "gho_test", login: "lex", avatar_url: "", expiresAt: Date.now() + 3_600_000 });
  let reads = 0;
  const env: Env = {
    GITHUB_CLIENT_ID: "app-client",
    GITHUB_CLIENT_SECRET: "app-secret",
    GITHUB_APP_SLUG: "test-editor",
    PREVIEW_ORIGIN: "https://previews.example",
    ASSETS: { fetch: async () => new Response("UI") },
    SESSIONS: {
      idFromName: (name) => name,
      idFromString: (id) => id,
      get: (id) => ({
        fetch: async (request) => {
          reads++;
          if (request.method === "PUT") { records.set(id, await request.json() as StoredSession); return new Response(null, { status: 204 }); }
          if (request.method === "DELETE") { records.delete(id); return new Response(null, { status: 204 }); }
          if (new URL(request.url).pathname !== "/") return new Response(null, { status: 404 });
          const value = records.get(id);
          return value ? Response.json(value) : new Response(null, { status: 404 });
        },
      }),
    },
  };
  return { env, reads: () => reads };
}
const github: typeof fetch = async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });

function send(path: string, method: string, headers: Record<string, string> = {}, env = environment().env) {
  return handle(new Request(origin + path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(method === "GET" || method === "HEAD" ? {} : { body: "{}" }),
  }), env, github);
}

const listed = ROUTES.filter(route => !OBSOLETE_AGENT_ROUTES.includes(route.path));
const rules = listed.flatMap(route => (Object.entries(route.methods) as [Method, Rule][]).map(([method, rule]) => ({ path: route.path, method, rule })));

test("every address the Worker's code and the editor's pages name has an entry in the table", () => {
  const paths = new Set(ROUTES.map(route => route.path));
  const files = [
    ...readdirSync(new URL("../worker/", import.meta.url)).filter(name => name.endsWith(".ts") && name !== "routes.ts").map(name => `worker/${name}`),
    ...readdirSync(new URL("../src/", import.meta.url), { recursive: true }).map(String).filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts")).map(name => `src/${name}`),
    ...readdirSync(new URL("../shared/", import.meta.url)).filter(name => name.endsWith(".ts")).map(name => `shared/${name}`),
  ];
  const missing: string[] = [];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    // A whole address in quotes, up to its query: "/api/blob", `/api/live/room?${…}`, "/auth/mcp/authorize?".
    for (const [, path] of source.matchAll(/["'`](\/(?:api|auth|__maintenance)\/[A-Za-z0-9_.\/-]*[A-Za-z0-9_.-]|\/mcp|\/\.well-known\/oauth-[A-Za-z0-9_.\/-]*[A-Za-z0-9_.-])(?=["'`?])/g))
      if (!paths.has(path)) missing.push(`${file}: ${path}`);
    // The editor's own fetch helpers name their address without its folder: src/github-reads.ts (api, apiResponse,
    // postApi) under /api/, src/components/agent-menu.ts (api) under /api/agent/.
    const folder = source.includes("fetch(`/api/agent/${action}`") ? "/api/agent/" : "/api/";
    for (const [, name] of source.matchAll(/\b(?:api|apiResponse|postApi)(?:<[^>()]*>)?\(\s*"([a-z/-]+)"/g))
      if (!paths.has(folder + name)) missing.push(`${file}: ${folder}${name}`);
  }
  assert.deepEqual(missing, []);
});

test("an address in the Worker's own spaces that the table does not list is refused before any work", async () => {
  for (const path of ["/api/not-a-route", "/auth/not-a-route", "/api/agent/not-a-route", "/api/publish/not-a-route", "/auth/setup/not-a-route",
    "/__maintenance/not-a-route", "/.well-known/oauth-not-a-route"])
    for (const method of ["GET", "POST"]) {
      const { env, reads } = environment(true);
      const response = await send(path, method, { Origin: origin, Cookie: cookie }, env);
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.equal(reads(), 0, `${method} ${path} read nothing`);
    }
  assert.equal(await (await send("/index.html", "GET")).text(), "UI", "the editor's own files are not routes");
});

test("every route refuses a method its entry does not list, before any work, and names the ones it takes", async () => {
  for (const route of listed)
    for (const method of ["PUT", "DELETE", "HEAD", ...(["GET", "POST"] as const).filter(method => !route.methods[method])]) {
      const { env, reads } = environment(true);
      const response = await send(route.path, method, { Origin: origin, Cookie: cookie }, env);
      // A refused step of the sign-in trip goes back to the editor with the error's code, as every refusal there does.
      if (["/auth/login", "/auth/install", "/auth/callback"].includes(route.path)) {
        assert.equal(response.status, 302, `${method} ${route.path}`);
        assert.match(response.headers.get("Location") ?? "", /^\/\?error=/, `${method} ${route.path}`);
      } else {
        assert.equal(response.status, 405, `${method} ${route.path}`);
        assert.equal(response.headers.get("Allow"), Object.keys(route.methods).join(", "), `${method} ${route.path}`);
      }
      assert.equal(reads(), 0, `${method} ${route.path} read nothing`);
    }
});

test("every change from the editor's pages refuses another site's request, or one with no Origin, before sign-in", async () => {
  const changes = rules.filter(entry => entry.rule.from === "editor");
  assert.ok(changes.length > 10);
  for (const { path, method } of changes)
    for (const from of [{ Origin: evil }, { Origin: "null" }, {}])
      for (const signedIn of [false, true]) {
        const { env, reads } = environment(signedIn);
        const response = await send(path, method, { ...from, Cookie: cookie }, env);
        assert.equal(response.status, 403, `${method} ${path} ${JSON.stringify(from)}`);
        assert.equal(reads(), 0, `${method} ${path} read nothing`);
      }
});

test("every socket of the editor's pages refuses an upgrade from another site, or with no Origin, before anything else", async () => {
  const sockets = rules.filter(entry => entry.rule.from === "editor-socket");
  assert.deepEqual(sockets.map(entry => entry.path).sort(), ["/api/agent/relay", "/api/live/guest", "/api/live/preview", "/api/live/room", "/api/live/share"]);
  for (const { path, method } of sockets)
    for (const from of [{ Origin: evil }, {}]) {
      const { env, reads } = environment(true);
      const response = await send(path, method, { ...from, Upgrade: "websocket", Cookie: cookie }, env);
      assert.equal(response.status, 403, `${path} ${JSON.stringify(from)}`);
      assert.equal(reads(), 0, `${path} read nothing`);
    }
});

test("preview visitors come through the preview Worker (no Origin) or a page on its address, never another site", async () => {
  const visit = (headers: Record<string, string>) => send("/api/live/visit", "GET", { Upgrade: "websocket", ...headers });
  assert.equal((await visit({ Origin: evil })).status, 403);
  assert.equal((await visit({ Origin: origin })).status, 403, "not the editor's page either");
  assert.notEqual((await visit({})).status, 403);
  assert.notEqual((await visit({ Origin: "https://previews.example" })).status, 403);
});

test("an agent's requests may carry no Origin, but never another site's", async () => {
  assert.equal((await send("/mcp", "POST", { Origin: evil, Authorization: "Bearer ase_x" })).status, 403);
  assert.equal((await send("/mcp", "POST", {})).status, 401);
  assert.equal((await send("/mcp", "POST", { Origin: origin })).status, 401);
});

test("the consent form posts from the consent page: its Origin, or none on a same-origin post", async () => {
  assert.equal((await send("/auth/mcp/authorize", "POST", { Origin: evil, "Sec-Fetch-Site": "same-origin" })).status, 403);
  assert.equal((await send("/auth/mcp/authorize", "POST", { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.notEqual((await send("/auth/mcp/authorize", "POST", { "Sec-Fetch-Site": "same-origin" })).status, 403);
});

test("every route that needs the editor's sign-in answers a signed-out request 401 with the signed-out code, before anything else", async () => {
  const signedIn = rules.filter(entry => entry.rule.signIn === "editor" || entry.rule.signIn === "editor-or-agent");
  assert.ok(signedIn.length > 10);
  for (const { path, method, rule } of signedIn) {
    const response = await send(path, method, { Origin: origin, ...(rule.upgradeOnly ? { Upgrade: "websocket" } : {}) });
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.deepEqual(await response.json(), { error: rule.signedOut, code: "signed-out" }, `${method} ${path}`);
  }
});

test("a live room takes an agent connection or the editor's sign-in; agents paused refuses the connection", async () => {
  assert.equal((await send("/api/live/room", "GET", { Authorization: "Bearer ase_x", Upgrade: "websocket" })).status, 401);
  assert.equal((await send("/api/live/room", "GET", { Authorization: "Bearer ase_x", Upgrade: "websocket", Origin: evil })).status, 403,
    "an agent's connection follows the agents' Origin rule, as on /mcp");
  const { env } = environment();
  env.AGENT_RELAY = "off";
  const paused = await send("/api/live/room", "GET", { Authorization: "Bearer ase_x" }, env);
  assert.equal(paused.status, 403);
  assert.equal((await paused.json() as { error: string }).error, AGENTS_PAUSED);
});

test("owner setup answers only on the editor's own address", async () => {
  const { env } = environment();
  env.EDITOR_ORIGIN = "https://main.example";
  env.OWNER_SETUP_TOKEN = "a".repeat(64);
  for (const route of ROUTES.filter(route => route.editorAddress))
    for (const method of Object.keys(route.methods)) {
      const response = await send(route.path, method, { Origin: origin }, env);
      assert.equal(response.status, 403, `${method} ${route.path}`);
    }
});

test("a change that may come from anywhere is one of the other services' deliveries, each proving itself", () => {
  const anywhere = rules.filter(entry => entry.method === "POST" && entry.rule.from === "anywhere");
  assert.deepEqual(anywhere.map(entry => `${entry.path} ${entry.rule.signIn}`).sort(), [
    "/__maintenance/cleanup own", "/__maintenance/inventory own", "/api/github/webhook own", "/auth/mcp/register none", "/auth/mcp/token own",
  ]);
});

test("every request that carries a body says how big it may be, and every handler reads it with the table's limit", () => {
  for (const { path, method, rule } of rules)
    if (method === "POST" && path !== "/auth/logout") assert.ok(rule.body, `${method} ${path} names its body limit`);
  const readers = /\b(requestJson|requestText|readBoundedBytes|requestBytes)\(([^()]*(?:\([^()]*\))?[^()]*)\)/g;
  const unbounded = /\brequest\.(json|text|arrayBuffer|formData|blob)\(\)/;
  const problems: string[] = [];
  for (const file of ["app.ts", "hosts.ts", "oauth.ts", "owner-setup.ts", "github-webhook.ts", "agent-maintenance.ts", "mcp.ts"]) {
    // The Durable Object's own requests come only from this Worker (agent-maintenance.ts's object handlers, after the routes).
    const source = readFileSync(new URL(`../worker/${file}`, import.meta.url), "utf8").split("export async function inventoryObject")[0];
    source.split("\n").forEach((line, index) => {
      if (/^\s*(export\s+)?(async\s+)?function\s/.test(line)) return;
      for (const [call, , args] of line.matchAll(readers))
        if (!args.includes("bodyLimit(request)")) problems.push(`worker/${file}:${index + 1}: ${call}`);
      if (unbounded.test(line)) problems.push(`worker/${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(problems, []);
});

test("every listed route reaches a handler", async () => {
  for (const { path, method, rule } of rules) {
    const headers: Record<string, string> = { Origin: rule.from === "preview-socket" ? "https://previews.example" : origin, Cookie: cookie,
      ...(rule.upgradeOnly ? { Upgrade: "websocket" } : {}) };
    const response = await send(path, method, headers, environment(true).env);
    const text = await response.text();
    assert.notEqual(response.status, 501, `${method} ${path}: ${text}`);
    assert.ok(!(response.status === 404 && text.includes("Endpoint not found.")), `${method} ${path}: ${text}`);
  }
});
