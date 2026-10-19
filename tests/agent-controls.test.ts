import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { build } from "esbuild";
import { agentControls, AGENTS_PAUSED, WATCH_PAUSED, type AgentControlEnv } from "../worker/agent-controls";
import { handle, type Env } from "../worker/app";
import { createGrant, getGrant, getHub } from "../worker/agent-context";
import { DEADLINES_KEY, LIFECYCLE_KEY, DISCONNECT_GRACE } from "../worker/agent-lifecycle";
import { relayObjectName, type RelaySocket } from "../worker/agent-relay";
import { agentWatch, createRequestTools } from "../src/agent-watch";
import { startCountedWorker, CountedStorage, UsageCounters } from "./fakes/counted-agent";
import { fakeGitHub, origin, payload, repo, signIn } from "./mcp-harness";

const keys = ["AGENT_RELAY", "AGENT_WATCH", "AGENT_LIFECYCLE_CLEANUP", "AGENT_LEGACY_MAINTENANCE", "AGENT_MODERN_REGISTRATION"] as const;
const defaults = { relay: true, watch: true, lifecycleCleanup: true, legacyMaintenance: false, modernRegistration: false };
const workspace = { account: "lex", repoId: repo.id, branch: "main" };
const secret = "s".repeat(32);
const combinations = Array.from({ length: 32 }, (_, bits) => Object.fromEntries(keys.map((key, index) => [key, bits & (1 << index) ? "on" : "off"])) as AgentControlEnv);
const counts = (h: Awaited<ReturnType<typeof startCountedWorker>>) => Object.values(h.counters.byCategory).reduce((sum, row) => sum + row.calls, 0);
const zero = (h: Awaited<ReturnType<typeof startCountedWorker>>) => {
  for (const row of Object.values(h.counters.byCategory)) {
    assert.equal(row.calls + row.keysRead + row.keysWritten + row.keysDeleted, 0);
  }
};

test("controls: missing uses defaults; only on enables; modern registration always stays off", () => {
  assert.deepEqual(agentControls({}), defaults);
  for (const value of ["on", " ON ", "off", "", "true", "1", "enabled", " on junk "]) {
    const switches = Object.fromEntries(keys.map(key => [key, value]));
    const on = value.trim().toLowerCase() === "on";
    assert.deepEqual(agentControls(switches), { relay: on, watch: on, lifecycleCleanup: on, legacyMaintenance: on, modernRegistration: false });
  }
});

test("all three Wrangler configs explicitly keep agreed defaults", () => {
  for (const file of ["wrangler.jsonc", "wrangler.preview.jsonc", "wrangler.techies.jsonc"]) {
    const json = readFileSync(file, "utf8").replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_match, quoted) => quoted ?? "").replace(/,(\s*[}\]])/g, "$1");
    const vars = JSON.parse(json).vars;
    for (const [index, key] of keys.entries()) assert.equal(vars[key], index < 3 ? "on" : "off", `${file}: ${key}`);
    assert.deepEqual(agentControls(vars), defaults);
  }
});

test("all 32 combinations independently gate routes before DO work, retain grants and keep waits quiet when Watch is paused", async () => {
  const h = await startCountedWorker();
  const { cookie } = await signIn(h.worker);
  const sessionId = cookie.split("=")[1];
  const env: Env = { SESSIONS: { ...h.namespace, idFromString: id => id }, ASSETS: { fetch: async () => new Response("asset") },
    GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test", GITHUB_APP_SLUG: "test",
    MAINTENANCE_INVENTORY_TOKEN: secret, MAINTENANCE_CLEANUP_TOKEN: secret };
  const grant = await createGrant(env, { sessionId, login: "lex", repoId: repo.id, repo: repo.full_name, branch: "main", via: "token", expiresAt: Date.now() + 86_400_000 });
  const send = (path: string, method = "POST", body?: unknown, signed = true) => handle(new Request(origin + path, {
    method, headers: { Origin: origin, ...(signed ? { Cookie: cookie } : {}), Authorization: `Bearer ${grant.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
  }), env, (input, init) => fakeGitHub(new Request(input, init), h.github));
  const rpc = (method: string, params: object) => send("/mcp", "POST", { jsonrpc: "2.0", id: 1, method, params });
  const scope = { workspace, tabId: "owner", generation: 1 }, name = await relayObjectName(workspace);
  const values = new Map<string, string>();
  const watch = agentWatch(workspace, { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } }, () => Date.now());
  const tools = createRequestTools({ workspace, watch, now: () => Date.now(), list: async () => [], save: async () => true });
  const commands: { operation: string; waitMs?: number }[] = [];
  let attachment: unknown = { ...scope, role: "editor", owner: { tabId: scope.tabId, generation: scope.generation } };
  const socket = {
    readyState: 1, close() {}, serializeAttachment(value: unknown) { attachment = value; }, deserializeAttachment: () => attachment,
    send(message: string) {
      const value = JSON.parse(message);
      if (value.type !== "command") return;
      commands.push(value.command);
      void tools.run(value.command, () => true, Date.now() + value.remainingMs - 1000).then(result => {
        h.message(name, socket, JSON.stringify({ type: "result", ...scope, id: value.id, result }));
      });
    },
  } satisfies RelaySocket;
  try {
    await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "controls", version: "1" } });
    h.attach(name, socket, JSON.stringify({ type: "handshake", ...scope, owner: true }));
    await h.settle(name);
    h.clock.install();
    for (const switches of combinations) {
      Object.assign(env, switches);
      const control = agentControls(env);
      for (const [path, method] of [["/api/agent/relay", "GET"], ["/api/agent/connect", "POST"], ["/api/agent/rebind", "POST"], ["/api/agent/connections", "GET"], ["/auth/mcp/authorize", "GET"], ["/auth/mcp/authorize", "POST"], ["/auth/mcp/token", "POST"]]) {
        h.counters.reset();
        const response = await send(path, method, {}, false);
        if (!control.relay) {
          assert.equal(response.status, 403, path);
          assert.deepEqual(await response.json(), { code: "agents-paused", error: AGENTS_PAUSED });
          zero(h);
          if (path.startsWith("/auth/mcp/")) assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
        } else assert.notEqual((await response.text()).includes("agents-paused"), true, path);
      }
      h.counters.reset();
      const preflight = await send("/auth/mcp/token", "OPTIONS", {}, false);
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "*");
      zero(h);
      for (const route of ["inventory", "cleanup"]) {
        h.counters.reset();
        const response = await send(`/__maintenance/${route}`, "POST", { id: "a".repeat(64), expected: "b".repeat(64), allowance: 1 });
        // Valid secret is still mandatory when maintenance is enabled.
        assert.equal(response.status, control.legacyMaintenance ? 401 : 404);
        zero(h);
        h.counters.reset();
        const authorized = await handle(new Request(`${origin}/__maintenance/${route}`, { method: "POST", headers: { Authorization: `Bearer ${secret}` },
          body: JSON.stringify({ id: "a".repeat(64), expected: "b".repeat(64), allowance: 1 }) }), env);
        assert.equal(authorized.status, control.legacyMaintenance ? 200 : 404);
        if (control.legacyMaintenance) assert.equal(counts(h), 1); else zero(h);
      }
      for (const route of ["hub", "context", "drafts", "claim", "ack", "pause", "ask", "answer", "dismiss"]) {
        h.counters.reset();
        assert.equal((await send(`/api/agent/${route}`)).status, 410);
        zero(h);
      }
      h.counters.reset();
      const before = commands.length;
      watch.start();
      const response = await rpc("tools/call", { name: "wait_for_requests", arguments: {} });
      assert.equal(response.status, 200);
      const answer = await response.text();
      const body = JSON.parse(answer.startsWith("event:") ? answer.split("data: ")[1].split("\n")[0] : answer) as { result: { isError?: boolean; code?: string; content: { text: string }[] } };
      if (!control.relay) {
        assert.equal(body.result.isError, true);
        assert.equal(body.result.code, "agents-paused");
        assert.equal(body.result.content[0].text, AGENTS_PAUSED);
        zero(h);
        assert.equal(commands.length, before);
      } else {
        const result = payload(body.result);
        assert.deepEqual(result.requests, []);
        assert.equal(commands.length, before + 1);
        assert.equal(counts(h), 4, "three auth reads and one relay dispatch");
        if (!control.watch) {
          assert.equal(commands.at(-1)!.waitMs, 0);
          assert.equal(h.counters.waitedMs, 0);
          assert.equal(result.hint, WATCH_PAUSED);
          assert.equal(result.watch, undefined);
        } else {
          assert.equal(commands.at(-1)!.waitMs, 25_000);
          assert.equal(h.counters.waitedMs, 24_000);
          assert.match(result.hint, /may call wait_for_requests again now/);
        }
        const menu = await send("/api/agent/connections", "GET");
        assert.equal((await menu.json() as { controls: { watch: boolean } }).controls.watch, control.watch);
      }
      assert.ok(await getGrant(env, grant.id), "pausing never deletes existing grants");
      assert.ok(!(await h.storage(`agent-hub:${sessionId}`).list()).has("drafts"));
      assert.equal(commands.some(command => command.operation !== "requests"), false, "no mutation replay or mirror command");
    }
    // Access removal remains available while every feature is paused.
    Object.assign(env, combinations[0]);
    const other = await createGrant(env, { sessionId, login: "lex", repoId: repo.id, repo: repo.full_name, branch: "other", via: "token", expiresAt: Date.now() + 86_400_000 });
    const revoked = await send("/api/agent/revoke", "POST", { all: true, repoId: repo.id, branch: "main" });
    assert.equal(revoked.status, 200);
    await assert.rejects(() => getGrant(env, grant.id), /expired|revoked/);
    assert.ok(await getGrant(env, other.id), "Disconnect stays pinned to its branch");
    const second = await createGrant(env, { sessionId, login: "lex", repoId: repo.id, repo: repo.full_name, branch: "main", via: "token", expiresAt: Date.now() + 86_400_000 });
    assert.equal((await send("/auth/logout")).status, 204);
    await assert.rejects(() => getGrant(env, second.id), /expired|revoked/);
    await assert.rejects(() => getGrant(env, other.id), /expired|revoked/);
    assert.equal((await getHub(env, sessionId))?.grants.length ?? 0, 0);
  } finally { tools.notify(); await h.worker.dispose(); }
});

// Run the actual SessionStore alarm with a selectable Env and the usage harness's
// counted storage. The Cloudflare base class is the only runtime stub.
async function alarmClass() {
  const result = await build({ entryPoints: ["worker/index.ts"], bundle: true, write: false, format: "esm", platform: "browser", conditions: ["workerd"],
    banner: { js: "class WebSocketRequestResponsePair { constructor(request, response) { this.request = request; this.response = response; } }" },
    plugins: [{ name: "cloudflare", setup(builder) {
      builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "base", namespace: "cloudflare" }));
      builder.onLoad({ filter: /.*/, namespace: "cloudflare" }, () => ({ contents: "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }" }));
    } }] });
  const runtime: { SessionStore: new (ctx: unknown, env: Env) => { alarm(): Promise<void> } } = await import(`data:text/javascript;base64,${Buffer.from((result.outputFiles[0].text + "\n//# sourceURL=controls-alarm.js")).toString("base64")}`);
  return runtime.SessionStore;
}

test("all 32 combinations: lifecycle OFF postpones six hours without deletions or refiring; ON resumes cleanup", async () => {
  const Store = await alarmClass();
  const h = await startCountedWorker();
  const { cookie } = await signIn(h.worker), sessionId = cookie.split("=")[1];
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    for (const switches of combinations) {
      const env: Env = { ...switches, SESSIONS: h.namespace, ASSETS: { fetch: async () => new Response(null) } };
      const grant = await createGrant(env, { sessionId, login: "lex", repoId: repo.id, repo: repo.full_name, branch: "main", via: "token", expiresAt: now + 100 * 86_400_000 });
      const name = await relayObjectName(workspace);
      const source = h.storage(name);
      const counters = new UsageCounters(), storage = new CountedStorage(counters, "lifecycle");
      await storage.put(Object.fromEntries(await source.list()));
      now += DISCONNECT_GRACE + 1;
      await storage.put(DEADLINES_KEY, { "agent-cleanup": now });
      const ctx = { storage, setWebSocketAutoResponse() {}, getWebSockets: () => [], blockConcurrencyWhile: <T>(run: () => Promise<T>) => run() };
      const instance = new Store(ctx, env);
      counters.reset();
      await instance.alarm();
      if (!agentControls(env).lifecycleCleanup) {
        assert.equal(counters.byCategory.lifecycle.keysDeleted, 0);
        assert.ok(await getGrant(env, grant.id));
        assert.equal(await storage.getAlarm(), now + 6 * 3600_000);
        assert.deepEqual(await storage.get(DEADLINES_KEY), { "agent-cleanup": now + 6 * 3600_000 });
        const fenced = await storage.get(LIFECYCLE_KEY);
        counters.reset();
        await instance.alarm();
        assert.equal(counters.byCategory.lifecycle.keysDeleted, 0);
        assert.deepEqual(await storage.get(LIFECYCLE_KEY), fenced);
        assert.equal(await storage.getAlarm(), now + 6 * 3600_000);
        env.AGENT_LIFECYCLE_CLEANUP = "on";
        now += 6 * 3600_000;
        await instance.alarm();
      }
      await assert.rejects(() => getGrant(env, grant.id), /expired|revoked/);
      assert.equal(await storage.getAlarm(), null);
    }
  } finally { Date.now = realNow; await h.worker.dispose(); }
});
