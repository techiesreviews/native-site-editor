import { test } from "node:test";
import assert from "node:assert/strict";
import { admitRegistration, pruneRegistration, REGISTRATION_BUDGET, REGISTRATION_BYTES, REGISTRATION_CAP, type BudgetStorage } from "../worker/oauth-registration.ts";
import { origin, startWorker } from "./mcp-harness.ts";
import { startCountedWorker } from "./fakes/counted-agent.ts";
import type { OAuthClient } from "../worker/oauth.ts";

const HOUR = 60 * 60 * 1000;

// A pure in-memory store, so expiry can be driven by an injected clock.
function memoryStorage() {
  const map = new Map<string, unknown>();
  const storage: BudgetStorage = {
    async get<T>(key: string) {
      // Return a deep copy, as a real Durable Object would deserialize afresh.
      const value = map.get(key);
      return value === undefined ? undefined : (structuredClone(value) as T);
    },
    async put<T>(key: string, value: T) {
      map.set(key, structuredClone(value));
    },
    async delete(key: string) {
      return map.delete(key);
    },
  };
  return { storage, map };
}
const admit = (storage: BudgetStorage, ip: string, now: number) => admitRegistration(storage, ip, now, () => {});

test("a single IP is capped at 10 accepted registrations per hour, then resets", async () => {
  const { storage } = memoryStorage();
  for (let i = 0; i < 10; i++) assert.equal((await admit(storage, "ip-a", 0)).allowed, true, `registration ${i} allowed`);
  const denied = await admit(storage, "ip-a", 0);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfter > 0 && denied.retryAfter <= 3600);
  // Another IP is unaffected within the same hour.
  assert.equal((await admit(storage, "ip-b", 0)).allowed, true);
  // The window rolls after an hour.
  assert.equal((await admit(storage, "ip-a", HOUR)).allowed, true);
});

test("the global hourly budget is 100 accepted registrations across all IPs", async () => {
  const { storage } = memoryStorage();
  for (let i = 0; i < 100; i++) assert.equal((await admit(storage, `ip-${i}`, 0)).allowed, true);
  const denied = await admit(storage, "ip-new", 0);
  assert.equal(denied.allowed, false, "the 101st distinct IP is refused before any new per-IP state is allocated");
});

test("the global daily budget is 1000 accepted registrations", async () => {
  const { storage } = memoryStorage();
  for (let hour = 0; hour < 10; hour++)
    for (let i = 0; i < 100; i++) assert.equal((await admit(storage, `ip-${hour}-${i}`, hour * HOUR)).allowed, true);
  assert.equal((await admit(storage, "ip-final", 9 * HOUR)).allowed, false, "the 1001st within a day is refused");
});

test("the limiter reads state from storage, so it survives an isolate reload", async () => {
  // One backing map, a fresh storage handle each call, as a reload would give.
  const backing = new Map<string, unknown>();
  const handle = (): BudgetStorage => ({
    async get<T>(key: string) {
      const value = backing.get(key);
      return value === undefined ? undefined : (structuredClone(value) as T);
    },
    async put<T>(key: string, value: T) {
      backing.set(key, structuredClone(value));
    },
    async delete(key: string) {
      return backing.delete(key);
    },
  });
  for (let i = 0; i < 10; i++) assert.equal((await admit(handle(), "ip-a", 0)).allowed, true);
  assert.equal((await admit(handle(), "ip-a", 0)).allowed, false, "the count persists across handles");
});

test("alarm cleanup prunes stale per-IP state and clears an empty budget", async () => {
  const { storage, map } = memoryStorage();
  await admit(storage, "ip-a", 0);
  // A per-IP entry is pruned once its hour passes, even while the day window holds.
  await pruneRegistration(storage, 2 * HOUR, () => {});
  const held = await storage.get<{ ips: Record<string, unknown> }>("oauth-registration-budget");
  assert.deepEqual(Object.keys(held!.ips), [], "the stale per-IP entry is dropped");
  // Once the day window also expires, the whole budget is cleared.
  await pruneRegistration(storage, 25 * HOUR, () => {});
  assert.equal(map.has("oauth-registration-budget"), false, "fully expired state is deleted");
});

test("admitRegistration rejects (fails closed) when storage cannot persist", async () => {
  const storage: BudgetStorage = {
    async get() {
      return undefined;
    },
    async put() {
      throw new Error("storage down");
    },
    async delete() {
      return false;
    },
  };
  await assert.rejects(admitRegistration(storage, "no-cf-ip", 0, () => {}));
});

test("admitRegistration and pruneRegistration reject when the alarm cannot be set", async () => {
  const { storage } = memoryStorage();
  const failAlarm = () => Promise.reject(new Error("alarm down"));
  await assert.rejects(admitRegistration(storage, "no-cf-ip", 0, failAlarm));
  await admit(storage, "no-cf-ip", HOUR); // seed persisted state
  await assert.rejects(pruneRegistration(storage, HOUR, failAlarm));
});

test("registration over the per-IP limit returns 429 with Retry-After and CORS, and creates no client", async () => {
  const { worker } = await startWorker();
  try {
    const register = (headers: Record<string, string>) =>
      worker.dispatchFetch(`${origin}/auth/mcp/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ redirect_uris: ["https://client.example/cb"] }),
      });
    const ip = { "CF-Connecting-IP": "203.0.113.7" };
    for (let i = 0; i < 10; i++) {
      const ok = await register(ip);
      assert.equal(ok.status, 201, `registration ${i} accepted`);
      assert.match((await ok.json()).client_id, /^mcp_[a-f0-9]{32}$/);
    }
    const denied = await register(ip);
    assert.equal(denied.status, 429);
    assert.equal(denied.headers.get("access-control-allow-origin"), "*");
    assert.ok(Number(denied.headers.get("retry-after")) > 0);
    const body = await denied.json();
    assert.equal(body.error, "too_many_requests");
    assert.equal(body.client_id, undefined, "a denied registration returns no client");
  } finally {
    await worker.dispose();
  }
});

test("concurrent registrations from one IP accept exactly the limit", async () => {
  const { worker } = await startWorker();
  try {
    const ip = { "CF-Connecting-IP": "198.51.100.42", "Content-Type": "application/json" };
    const responses = await Promise.all(
      Array.from({ length: 15 }, () =>
        worker.dispatchFetch(`${origin}/auth/mcp/register`, {
          method: "POST",
          headers: ip,
          body: JSON.stringify({ redirect_uris: ["https://client.example/cb"] }),
        }),
      ),
    );
    const statuses = responses.map((response) => response.status);
    assert.equal(statuses.filter((status) => status === 201).length, 10, "exactly 10 accepted");
    assert.equal(statuses.filter((status) => status === 429).length, 5, "the rest denied");
  } finally {
    await worker.dispose();
  }
});

test("a spoofed X-Forwarded-For does not dodge the limit; requests without CF-Connecting-IP share one bucket", async () => {
  const { worker } = await startWorker();
  try {
    const register = (i: number) =>
      worker.dispatchFetch(`${origin}/auth/mcp/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.0.0.${i}` },
        body: JSON.stringify({ redirect_uris: ["https://client.example/cb"] }),
      });
    for (let i = 0; i < 10; i++) assert.equal((await register(i)).status, 201);
    assert.equal((await register(99)).status, 429, "spoofing X-Forwarded-For does not create a new bucket");
  } finally {
    await worker.dispose();
  }
});

test("retained capacity refuses new apps clearly without spending rates or touching existing clients", async () => {
  const h = await startCountedWorker();
  try {
    const now = Date.now();
    const storage = h.storage(REGISTRATION_BUDGET);
    const existingId = `mcp_${"c".repeat(32)}`;
    const existing = { kind: "oauth-client", clientId: existingId, name: "Existing", redirectUris: ["https://client.example/cb"], expiresAt: now + 3600000 } satisfies OAuthClient;
    await h.storage(`oauth-client:${existingId}`).put("session", existing);
    // Only post-change occupancy is seeded; legacy occupancy remains unknown.
    await storage.put(REGISTRATION_BUDGET, {
      retained: REGISTRATION_CAP - 1, legacy: "uninventoried", pending: {},
      hour: { start: now, count: 0 }, day: { start: now, count: 0 }, ips: {},
    });
    const register = () => h.worker.dispatchFetch(`${origin}/auth/mcp/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["https://client.example/cb"] }),
    });
    const admitted = await register();
    assert.equal(admitted.status, 201);
    const { client_id: clientId } = await admitted.json() as { client_id: string };
    const before = await storage.get(REGISTRATION_BUDGET);
    const storedClient = await h.storage(`oauth-client:${clientId}`).get<OAuthClient>("session");
    for (let index = 0; index < 2; index++) {
      const refused = await register();
      assert.equal(refused.status, 503);
      assert.equal(refused.headers.get("access-control-allow-origin"), "*");
      const body = await refused.json() as { error: string; error_description: string; client_id?: string };
      assert.equal(body.error, "temporarily_unavailable");
      assert.match(body.error_description, /limit of new app registrations.*Existing connections keep working/);
      assert.equal(body.client_id, undefined);
    }
    assert.deepEqual(await storage.get(REGISTRATION_BUDGET), before, "capacity refusals consume no rate or retention budget");
    assert.deepEqual(await h.storage(`oauth-client:${existingId}`).get("session"), existing);
    assert.deepEqual(await h.storage(`oauth-client:${clientId}`).get("session"), storedClient);
    assert.equal((await storage.get<{ retained: number }>(REGISTRATION_BUDGET))!.retained, REGISTRATION_CAP);
  } finally { await h.worker.dispose(); }
});

test("serialized UTF-8 client records fit 16 KiB exactly; oversized records reserve nothing", async () => {
  const h = await startCountedWorker();
  try {
    const metadata = (bytes: number) => {
      const redirectUris = Array.from({ length: 9 }, () => `https://client.example/${"a".repeat(1700)}`);
      const client = { kind: "oauth-client", clientId: `mcp_${"a".repeat(32)}`, name: "é".repeat(100), redirectUris, expiresAt: Date.now() + 180 * 24 * HOUR } satisfies OAuthClient;
      let padding = bytes - new TextEncoder().encode(JSON.stringify(client)).byteLength;
      assert.ok(padding > 0);
      for (let index = 0; index < redirectUris.length && padding > 0; index++) {
        const added = Math.min(padding, 2000 - redirectUris[index].length);
        redirectUris[index] += "a".repeat(added);
        padding -= added;
      }
      assert.equal(padding, 0);
      const body = JSON.stringify({ client_name: client.name, redirect_uris: redirectUris });
      assert.ok(new TextEncoder().encode(body).byteLength < REGISTRATION_BYTES, "wire JSON fits; the stored record determines admission");
      return body;
    };
    const register = (body: string) => h.worker.dispatchFetch(`${origin}/auth/mcp/register`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    });
    const calls = h.counters.log.length;
    const oversized = await register(metadata(REGISTRATION_BYTES + 1));
    assert.equal(oversized.status, 400);
    assert.equal((await oversized.json()).error, "invalid_client_metadata");
    assert.equal(oversized.headers.get("access-control-allow-origin"), "*");
    assert.equal(h.counters.log.length, calls, "oversized metadata makes no Durable Object calls");
    const accepted = await register(metadata(REGISTRATION_BYTES));
    assert.equal(accepted.status, 201);
    const { client_id: clientId } = await accepted.json() as { client_id: string };
    const client = await h.storage(`oauth-client:${clientId}`).get<OAuthClient>("session");
    assert.equal(new TextEncoder().encode(JSON.stringify(client)).byteLength, REGISTRATION_BYTES);
    assert.ok(client!.expiresAt >= Date.now() + 180 * 24 * HOUR - 1000, "fixed 180-day lifetime is preserved");
    // Ten individually valid redirect URIs can also overflow the request cap.
    const tooManyBytes = await register(JSON.stringify({ redirect_uris: Array(10).fill(`https://client.example/${"b".repeat(1970)}`) }));
    assert.equal(tooManyBytes.status, 400);
    assert.equal((await tooManyBytes.json()).error, "invalid_client_metadata");
  } finally { await h.worker.dispose(); }
});
