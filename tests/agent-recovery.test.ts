import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentFailureError, classifyAgentFailure, isDailyQuotaError, nextUtcMidnight, parseRetryAfter } from "../shared/agent-failure.ts";
import { createAgentRecovery } from "../src/agent-recovery.ts";
import { handle, type Env } from "../worker/app.ts";

const now = Date.UTC(2026, 9, 17, 12);
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const transient = () => { throw new AgentFailureError({ kind: "transient" }); };

function fixture() {
  let clock = now, sequence = 0;
  const values = new Map<string, string>();
  const timers = new Map<number, { at: number; callback: () => void }>();
  const channels = new Map<string, () => void>();
  const calls: { tab: string; at: number }[] = [];
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } } satisfies Pick<Storage, "getItem" | "setItem">;
  function tab(tabId: string, reconnect: () => Promise<void> = async () => transient(), repoId = 1) {
    return createAgentRecovery({
      workspace: { account: "lex", repoId }, tabId, storage,
      channel: {
        subscribe(listener) { channels.set(tabId, listener); return () => { channels.delete(tabId); }; },
        post() { queueMicrotask(() => { for (const [id, listener] of channels) if (id !== tabId) listener(); }); },
      },
      now: () => clock, random: () => 0.5,
      setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { at: clock + delay, callback }); return id; },
      clearTimeout(id) { timers.delete(id); },
      async reconnect() { calls.push({ tab: tabId, at: clock }); await reconnect(); },
    });
  }
  async function tick(ms: number) {
    const end = clock + ms;
    await settle();
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      clock = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
      await settle();
    }
    clock = end;
    await settle();
  }
  return { tab, tick, calls, timers, values, storage, now: () => clock };
}

test("classification uses only the documented quota signals", () => {
  const classify = (input: Omit<Parameters<typeof classifyAgentFailure>[0], "now">) => classifyAgentFailure({ ...input, now });
  assert.deepEqual(classify({ status: 503, body: { error: "Allowance used", code: "daily-quota", resetAt: now + 100 } }), { kind: "quota", resetAt: now + 100, retryAt: undefined });
  for (const text of ["<p>Error 1027</p>", "error code: 1027"]) assert.equal(classify({ status: 503, text }).kind, "quota");
  assert.equal(classify({ status: 500, body: { error: "Error 1027" } }).kind, "transient");
  for (const status of [408, 429, 500, 502, 503, 504]) assert.equal(classify({ status }).kind, "transient");
  assert.equal(classify({ status: 503, body: { error: "Durable Object is overloaded" } }).kind, "transient");
  assert.equal(classify({ networkError: true }).kind, "transient");
  assert.equal(classify({ status: 401 }).kind, "auth");
  assert.equal(classify({ status: 403, body: { error: "This connection belongs to another editor session." } }).kind, "auth");
  for (const status of [400, 409, 403]) assert.equal(classify({ status, body: { error: "Invalid request origin." } }).kind, "other");
  assert.equal(classify({ body: { code: "daily-quota", resetAt: Infinity } }).kind, "quota");
  for (const dimension of ["volume of requests", "duration", "rows written", "rows read"])
    assert.equal(isDailyQuotaError(new Error(`Exceeded allowed ${dimension} in Durable Objects free tier. More text`)), true);
  for (const message of ["Durable Object is overloaded", "Your account is generating too much load", "Network error", "429", "Exceeded allowed requests"])
    assert.equal(isDailyQuotaError(new Error(message)), false);
  assert.equal(isDailyQuotaError("Exceeded allowed duration in Durable Objects free tier"), false);
});

test("Retry-After and midnight use absolute times without inventing a cooldown", () => {
  assert.equal(parseRetryAfter("60", now), now + 60_000);
  assert.equal(parseRetryAfter(new Date(now + 60_000).toUTCString(), now), now + 60_000);
  for (const value of [null, "", "-1", "nonsense", new Date(now - 1000).toUTCString()]) assert.equal(parseRetryAfter(value, now), undefined);
  assert.equal(parseRetryAfter("999999", now), now + 86_400_000);
  assert.equal(nextUtcMidnight(now), Date.UTC(2026, 9, 18));
  assert.equal(nextUtcMidnight(Date.UTC(2026, 11, 31)), Date.UTC(2027, 0, 1));
});

test("handle preserves quota metadata, generic failures and login redirects", async () => {
  for (const quota of [true, false]) {
    const env = {
      ASSETS: { fetch: async () => new Response("UI") },
      SESSIONS: { idFromName: (name: string) => name, get: () => ({ fetch: async () => { throw new Error(quota ? "Exceeded allowed volume of requests in Durable Objects free tier" : "Other failure"); } }) },
    } satisfies Env;
    const response = await handle(new Request("https://editor.example/api/agent/hub", { headers: { Cookie: `__Host-ase_session=${"b".repeat(64)}` } }), env);
    const body = await response.json();
    assert.equal(response.status, quota ? 503 : 500);
    assert.equal(body.code, quota ? "daily-quota" : undefined);
    if (quota) assert.equal(body.resetAt, nextUtcMidnight(Date.now()));
    assert.equal(response.headers.get("Retry-After"), null);
    const login = await handle(new Request("https://editor.example/auth/login"), env);
    assert.equal(login.status, 302);
  }
});

test("two tabs share five read attempts with exponential delays, then remain paused", async () => {
  const f = fixture(), a = f.tab("a"), b = f.tab("b");
  a.report({ kind: "transient" }); b.report({ kind: "transient" });
  await f.tick(60_000);
  assert.equal(f.calls.length, 5);
  assert.deepEqual(f.calls.map(call => call.at - now), [1000, 3000, 7000, 15_000, 31_000]);
  assert.equal(new Set(f.calls.map(call => call.tab)).size, 1);
  assert.equal(a.state().mode, "paused"); assert.equal(b.state().mode, "paused");
  await f.tick(600_000);
  assert.equal(f.calls.length, 5);
  a.dispose(); b.dispose(); assert.equal(f.timers.size, 0);
});

test("Retry-After delays automatic and manual reads; an excessive cooldown pauses", async () => {
  const f = fixture(), a = f.tab("a");
  a.report({ kind: "transient", retryAt: now + 20_000 });
  assert.deepEqual(await a.retry(), { retryAt: now + 20_000 });
  await f.tick(19_999); assert.equal(f.calls.length, 0);
  await f.tick(1); assert.equal(f.calls.length, 1);
  a.report({ kind: "transient", retryAt: f.now() + 86_400_000 });
  await f.tick(600_000);
  assert.equal(a.state().mode, "paused"); assert.equal(f.calls.length, 1);
  a.dispose();
});

test("quota pauses both tabs indefinitely; manual Retry is single-flight and clears both", async () => {
  const f = fixture();
  let finish!: () => void;
  const held = new Promise<void>(resolve => { finish = resolve; });
  const a = f.tab("a", () => held), b = f.tab("b", async () => {});
  a.report({ kind: "quota", resetAt: nextUtcMidnight(now) });
  await f.tick(172_800_000);
  assert.equal(a.allowAutomatic(), false); assert.equal(b.allowAutomatic(), false); assert.equal(f.calls.length, 0);
  const first = a.retry(), second = a.retry();
  assert.equal(first, second);
  await b.retry(); assert.equal(f.calls.length, 1);
  await f.tick(30_000); // The lease renews during a slow read.
  await b.retry(); assert.equal(f.calls.length, 1);
  finish(); await first; await settle();
  assert.equal(a.allowAutomatic(), true); assert.equal(b.allowAutomatic(), true);
  a.dispose(); b.dispose();
});

test("a failed manual quota read stays paused; quota Retry-After never triggers an automatic read", async () => {
  const f = fixture(), a = f.tab("a", async () => { throw new AgentFailureError({ kind: "quota", resetAt: now + 100 }); });
  a.report({ kind: "quota", retryAt: now + 10_000 });
  assert.deepEqual(await a.retry(), { retryAt: now + 10_000 });
  await f.tick(10_000); assert.equal(f.calls.length, 0);
  await a.retry(); assert.equal(a.state().resetAt, now + 100);
  await f.tick(86_400_000); assert.equal(f.calls.length, 1);
  a.dispose();
});

test("only reconnect is called after a mutation failure; authentication schedules nothing", async () => {
  const f = fixture(), a = f.tab("a");
  let mutations = 0;
  const mutation = () => { mutations++; transient(); };
  try { mutation(); } catch (error) { assert.ok(error instanceof AgentFailureError); a.report(error.failure); }
  await f.tick(60_000);
  assert.equal(mutations, 1); assert.equal(f.calls.length, 5);
  a.report({ kind: "auth" }); await f.tick(600_000); assert.equal(f.calls.length, 5);
  const b = f.tab("b", async () => {}, 2);
  assert.equal(b.report({ kind: "auth" }), "auth"); await f.tick(60_000); assert.equal(f.calls.length, 5);
  a.dispose(); b.dispose();
});

test("lease takeover and disposal fence an unfinished read", async () => {
  const f = fixture();
  let finish!: () => void;
  const a = f.tab("a", () => new Promise<void>(resolve => { finish = resolve; })), b = f.tab("b", async () => {});
  a.report({ kind: "transient" }); await f.tick(1000);
  a.dispose(); await settle(); await f.tick(2000);
  assert.equal(f.calls.length, 2); assert.equal(f.calls[1].tab, "b");
  b.report({ kind: "quota" }); finish(); await settle();
  assert.equal(b.state().mode, "quota"); b.dispose();
});
