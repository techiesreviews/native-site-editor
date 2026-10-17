import { test } from "node:test";
import assert from "node:assert/strict";
import type { Env } from "../worker/app.ts";
import { handleOAuth, type OAuthClient, type OAuthDeps } from "../worker/oauth.ts";
import {
  admitRegistration, finalizeRegistration, pruneRegistration, releaseRegistration,
  REGISTRATION_BUDGET, REGISTRATION_ROUTE, type BudgetStorage,
} from "../worker/oauth-registration.ts";
import { origin, startWorker } from "./mcp-harness.ts";
import { startCountedWorker } from "./fakes/counted-agent.ts";

const KEY = REGISTRATION_BUDGET;
const HOUR = 3600000;
const DAY = 24 * HOUR;
interface State {
  retained: number;
  legacy: "uninventoried";
  pending: Record<string, { createdAt: number; expiresAt: number }>;
  hour: { start: number; count: number };
  day: { start: number; count: number };
}

// Deserialized values, transactional rollback, and one serial queue mirror the
// limiter's storage and blockConcurrencyWhile, including interleaved awaits.
function memory() {
  let values = new Map<string, unknown>();
  let blocked = Promise.resolve<unknown>(undefined);
  let failure: { operation: "put" | "delete"; key: string } | undefined;
  const lists: number[] = [];
  let scheduledAt: number | undefined;
  const check = (operation: "put" | "delete", key: string) => {
    if (failure?.operation === operation && failure.key === key) {
      failure = undefined;
      throw new Error("Injected storage failure");
    }
  };
  const handle = (map: Map<string, unknown>): BudgetStorage => ({
    async get<T>(key: string) { return structuredClone(map.get(key)) as T | undefined; },
    async put(key, value) { check("put", key); map.set(key, structuredClone(value)); },
    async delete(key) { check("delete", key); return map.delete(key); },
    async list<T>({ prefix, end, limit }) {
      lists.push(limit);
      return new Map([...map.keys()].filter(key => key.startsWith(prefix) && key < end).sort().slice(0, limit)
        .map(key => [key, structuredClone(map.get(key)) as T]));
    },
  });
  const storage: BudgetStorage = {
    async get<T>(key: string) { return handle(values).get<T>(key); },
    async put(key, value) { await handle(values).put(key, value); },
    async delete(key) { return handle(values).delete(key); },
    async getAlarm() { return scheduledAt ?? null; },
    async deleteAlarm() { scheduledAt = undefined; },
    async transaction(callback) {
      const draft = structuredClone(values);
      const result = await callback(handle(draft));
      values = draft;
      return result;
    },
  };
  const run = <T>(fn: () => Promise<T>) => {
    const result = blocked.then(fn);
    blocked = result.catch(() => undefined);
    return result;
  };
  return {
    storage, run, lists,
    alarmAt: () => scheduledAt,
    state: async () => (await storage.get<State>(KEY))!,
    keys: () => [...values.keys()],
    fail: (operation: "put" | "delete", key: string) => { failure = { operation, key }; },
    reserve: (id: string, now = 0, expiresAt = 180 * DAY) =>
      run(() => admitRegistration(storage, `ip-${id}`, now, at => { scheduledAt = at; }, { clientId: id, expiresAt })),
    finalize: (id: string) => run(() => finalizeRegistration(storage, id)),
    release: (id: string) => run(() => releaseRegistration(storage, id)),
    alarm: (now: number) => run(() => pruneRegistration(storage, now, at => { scheduledAt = at; })),
  };
}

test("parallel reserves, finalizes and releases retain exact occupancy", async () => {
  const m = memory();
  await Promise.all(Array.from({ length: 90 }, async (_, index) => {
    const id = `client-${index}`;
    assert.equal((await m.reserve(id)).allowed, true);
    await Promise.all([m.reserve(id), m.finalize(id), m.finalize(id)]);
    if (index % 3 === 0) await Promise.all([m.release(id), m.release(id)]);
  }));
  const state = await m.state();
  assert.equal(state.retained, 60);
  assert.equal(state.day.count, 90, "reserve retries consume no extra rate budget");
  assert.deepEqual(state.pending, {});
  assert.equal(m.keys().filter(key => key.startsWith("registration:")).length, 60);
  await m.alarm(180 * DAY);
  await m.alarm(180 * DAY);
  assert.equal((await m.state()).retained, 0);
});

test("pending reservations count toward capacity before rates; failed reservations allocate nothing", async () => {
  const m = memory();
  m.fail("put", KEY);
  await assert.rejects(m.reserve("failed"), /Injected/);
  assert.equal(await m.storage.get(KEY), undefined);
  await m.reserve("pending");
  const state = await m.state();
  await m.storage.put(KEY, { ...state, retained: 10000, hour: { start: 0, count: 100 } });
  const before = await m.storage.get(KEY);
  assert.deepEqual(await m.reserve("blocked"), { allowed: false, retryAfter: 0, reason: "capacity" });
  assert.deepEqual(await m.storage.get(KEY), before);
  assert.equal((await m.reserve("pending")).allowed, true, "retries succeed even at capacity and exhausted rates");
});

test("ongoing reserves and capacity denials never postpone an existing cleanup alarm", async () => {
  const m = memory();
  await m.reserve("one");
  assert.equal(m.alarmAt(), 600000);
  await m.reserve("two", 599999);
  assert.equal(m.alarmAt(), 600000);
  const state = await m.state();
  await m.storage.put(KEY, { ...state, retained: 10000 });
  assert.equal((await m.reserve("blocked", 599999)).reason, "capacity");
  assert.equal(m.alarmAt(), 600000);
  await m.alarm(600000);
  assert.equal((await m.state()).pending.one, undefined);
  assert.ok((await m.state()).pending.two);
});

test("reserve and finalize retries are no-ops before and after finalization", async () => {
  const m = memory();
  await m.reserve("one");
  await m.reserve("one");
  await m.finalize("one");
  await m.finalize("one");
  await m.finalize("unknown");
  await m.reserve("one", HOUR, 200 * DAY);
  assert.equal((await m.state()).retained, 1);
  assert.equal((await m.state()).day.count, 1);
  assert.equal(m.keys().filter(key => key.startsWith("registration:")).length, 1);
  await m.alarm(180 * DAY);
  assert.equal((await m.state()).retained, 0, "retry never extends the original expiry");
  assert.equal(m.alarmAt(), undefined, "idle accounting stops alarms while preserving the legacy marker");
});

test("failed deletion and failed count update roll back; release retries decrement only once", async () => {
  for (const operation of ["delete", "put"] as const) {
    const m = memory();
    await m.reserve("one");
    await m.finalize("one");
    const expiry = m.keys().find(key => key.startsWith("registration:"))!;
    m.fail(operation, operation === "delete" ? "registration-client:one" : KEY);
    await assert.rejects(m.release("one"), /Injected/);
    assert.equal((await m.state()).retained, 1);
    assert.ok(m.keys().includes(expiry), "expiry deletion rolls back with the count");
    await m.release("one");
    await m.release("one");
    await m.release("unknown");
    await m.alarm(180 * DAY);
    await m.alarm(180 * DAY);
    assert.equal((await m.state()).retained, 0);
  }
});

test("failed finalization stays pending, then alarm promotes unknown outcomes without freeing capacity", async () => {
  const m = memory();
  await m.reserve("one");
  m.fail("put", KEY);
  await assert.rejects(m.finalize("one"), /Injected/);
  assert.equal((await m.state()).retained, 1);
  assert.ok((await m.state()).pending.one);
  assert.equal(m.keys().filter(key => key.startsWith("registration:")).length, 0);
  await m.alarm(599999);
  assert.ok((await m.state()).pending.one, "fresh pending reservations remain pending");
  await m.alarm(600000);
  assert.deepEqual((await m.state()).pending, {});
  assert.equal((await m.state()).retained, 1);
  assert.equal(m.keys().filter(key => key.startsWith("registration:")).length, 1);
  assert.ok(m.alarmAt()! > 600000, "counted registrations retain an alarm after rate windows expire");
});

test("expiry batches include the exact deadline, survive failures, and never decrement twice", async () => {
  const m = memory();
  for (let index = 0; index < 260; index++) {
    await m.reserve(`client-${index}`, Math.floor(index / 100) * HOUR, 3 * HOUR);
    await m.finalize(`client-${index}`);
  }
  await m.reserve("later", 2 * HOUR, 4 * HOUR);
  await m.finalize("later");
  await m.alarm(3 * HOUR - 1);
  assert.equal((await m.state()).retained, 261);
  m.fail("delete", "registration-client:client-0");
  await assert.rejects(m.alarm(3 * HOUR), /Injected/);
  assert.equal((await m.state()).retained, 261);
  assert.equal(m.keys().filter(key => key.startsWith("registration:")).length, 261, "failed expiry restores the deleted index key");
  await Promise.all([m.alarm(3 * HOUR), m.release("client-0"), m.alarm(3 * HOUR)]);
  assert.equal((await m.state()).retained, 1);
  assert.ok(m.lists.every(limit => limit === 128));
  await m.release("later");
  await m.alarm(4 * HOUR);
  assert.equal((await m.state()).retained, 0);
  assert.equal((await m.state()).legacy, "uninventoried", "empty new occupancy does not imply known legacy occupancy");
});

function allocation(mode: "missing" | "stored" | "unreadable" | "finalize-fails" | "release-fails" | "write-status" | "read-status" | "finalize-status") {
  const m = memory();
  let client: OAuthClient | undefined;
  let id = "";
  const env = {
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    SESSIONS: {
      idFromName: (name: string) => name,
      get: (name: string) => ({ fetch: async (request: Request) => {
        if (name === REGISTRATION_BUDGET) {
          const body = await request.json() as { action?: string; clientId: string; expiresAt: number; ipHash: string };
          id = body.clientId;
          if (body.action === "finalize") {
            if (mode === "finalize-fails") throw new Error("Finalize unavailable");
            if (mode === "finalize-status") return new Response(null, { status: 503 });
            await m.finalize(id);
            return new Response(null, { status: 204 });
          }
          if (body.action === "release") {
            if (mode === "release-fails") throw new Error("Release unavailable");
            await m.release(id);
            return new Response(null, { status: 204 });
          }
          return Response.json(await m.run(() => admitRegistration(m.storage, body.ipHash, 0, () => {}, body)));
        }
        if (request.method === "PUT") {
          if (mode === "stored" || mode === "finalize-fails" || mode === "finalize-status") client = await request.json() as OAuthClient;
          if (mode === "finalize-fails" || mode === "finalize-status") return new Response(null, { status: 204 });
          if (mode === "write-status") return new Response(null, { status: 503 });
          throw new Error("Write unavailable");
        }
        if (mode === "unreadable") throw new Error("Read unavailable");
        if (mode === "read-status") return new Response(null, { status: 503 });
        return client ? Response.json(client) : new Response(null, { status: 404 });
      } }),
    },
  } satisfies Env;
  const deps = { session: async () => null, html: body => new Response(body), fetcher: (...args: Parameters<typeof fetch>) => fetch(...args) } satisfies OAuthDeps;
  const request = new Request(`${origin}/auth/mcp/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://client.example/cb"] }) });
  return { m, id: () => id, client: () => client, response: () => handleOAuth(request, env, new URL(request.url), deps) };
}

test("failed client allocation releases only after a definitive missing record", async () => {
  for (const mode of ["missing", "write-status"] as const) {
    const h = allocation(mode);
    const response = await h.response();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal((await response.json()).error, "temporarily_unavailable");
    assert.equal((await h.m.state()).retained, 0);
    assert.equal((await h.m.state()).day.count, 1, "an admitted failed allocation still consumes its rate budget");
  }
});

test("ambiguous client allocation stays counted through promotion and fixed expiry", async () => {
  for (const mode of ["stored", "unreadable", "read-status", "release-fails"] as const) {
    const h = allocation(mode);
    assert.equal((await h.response()).status, 503);
    assert.equal((await h.m.state()).retained, 1);
    await h.m.alarm(600000);
    assert.equal((await h.m.state()).retained, 1);
    assert.deepEqual((await h.m.state()).pending, {});
    const expiresAt = h.client()?.expiresAt ?? Date.now() + 180 * DAY;
    await h.m.alarm(expiresAt);
    assert.equal((await h.m.state()).retained, 0);
  }
});

test("successful allocation returns 201 even when finalize fails", async () => {
  for (const mode of ["finalize-fails", "finalize-status"] as const) {
    const h = allocation(mode);
    const response = await h.response();
    assert.equal(response.status, 201);
    assert.equal((await response.json()).client_id, h.client()?.clientId);
    assert.equal((await h.m.state()).retained, 1);
    await h.m.alarm(600000);
    assert.deepEqual((await h.m.state()).pending, {});
    assert.equal((await h.m.state()).retained, 1);
  }
});

test("real Worker serializes concurrent retried reserves, finalizes and releases", async () => {
  const { worker } = await startWorker();
  try {
    const sessions = await worker.getDurableObjectNamespace("SESSIONS");
    const limiter = sessions.get(sessions.idFromName(REGISTRATION_BUDGET));
    const id = `mcp_${"a".repeat(32)}`;
    const call = (body: unknown) => limiter.fetch(`https://session.internal${REGISTRATION_ROUTE}`, { method: "POST", body: JSON.stringify(body) });
    const reserve = { clientId: id, ipHash: "no-cf-ip", expiresAt: Date.now() + 180 * DAY };
    const responses = await Promise.all(Array.from({ length: 20 }, () => call(reserve)));
    for (const response of responses) assert.equal((await response.json()).allowed, true);
    const completed = await Promise.all(Array.from({ length: 20 }, () => call({ action: "finalize", clientId: id })));
    assert.ok(completed.every(response => response.status === 204));
    const released = await Promise.all(Array.from({ length: 20 }, () => call({ action: "release", clientId: id })));
    assert.ok(released.every(response => response.status === 204));
    const rest = await Promise.all(Array.from({ length: 10 }, (_, i) => call({ ...reserve, clientId: `mcp_${(i + 1).toString(16).padStart(32, "0")}` })));
    const decisions = await Promise.all(rest.map(response => response.json()));
    assert.equal(decisions.filter(body => body.allowed).length, 9, "retries consumed exactly one rate slot");
  } finally { await worker.dispose(); }
});

test("client alarms physically delete only expired registrations", async () => {
  const h = await startCountedWorker();
  try {
    const name = `oauth-client:mcp_${"b".repeat(32)}`;
    const storage = h.storage(name);
    const client = { kind: "oauth-client", clientId: name.slice("oauth-client:".length), name: "Test", redirectUris: ["https://client.example/cb"], expiresAt: Date.now() + DAY } satisfies OAuthClient;
    await storage.put("session", client);
    await storage.put("repositoryCacheGeneration", 1);
    await h.alarm(name);
    assert.deepEqual(await storage.get("session"), client);
    assert.equal(await storage.getAlarm(), client.expiresAt);
    await storage.put("session", { ...client, expiresAt: Date.now() - 1 });
    await h.alarm(name);
    await h.alarm(name);
    assert.equal(await storage.get("session"), undefined);
    assert.equal(await storage.get("repositoryCacheGeneration"), undefined);
  } finally { await h.worker.dispose(); }
});
