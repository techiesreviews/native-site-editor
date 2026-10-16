import { test } from "node:test";
import assert from "node:assert/strict";
import type { Env } from "../worker/app.ts";
import { createGrant, getGrant, getHub, markGrantUsed, type AgentGrant, type AgentHub } from "../worker/agent-context.ts";
import { hubOperation, type HubStorage } from "../worker/agent-store.ts";
import { fakeHubRoute } from "./native-save/fake-hub.ts";

function memoryStorage(): HubStorage {
  const stored = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => {
      const value = structuredClone(stored.get(key)) as T | undefined;
      // Capture the read before yielding, so overlapping operations see the same snapshot.
      await new Promise((resolve) => setTimeout(resolve, 0));
      return value;
    },
    put: async (entries) => {
      for (const [key, value] of Object.entries(entries)) stored.set(key, structuredClone(value));
    },
    delete: async (keys) => { for (const key of keys) stored.delete(key); },
  };
}

const sessionId = "editor-session";
const hub = { login: "lex", expiresAt: Date.now() + 3_600_000 };
const addGrant = (id: string) => ({
  type: "add-grant",
  hub,
  grant: { id, repoId: 7, repo: "lex/site", via: "token", createdAt: 1 },
});
const operationRequest = (action: unknown) => new Request("https://session.internal/agent-operation", {
  method: "POST", body: JSON.stringify(action),
});

test("a failed first-use hub update leaves the grant retryable on the next request", async () => {
  const records = new Map<string, AgentGrant>();
  const storage = memoryStorage();
  let failUse = false;
  const env: Env = {
    ASSETS: { fetch: async () => new Response("UI") },
    SESSIONS: {
      idFromName: (name) => name,
      get: (id: string) => ({
        fetch: async (request) => {
          if (id === `agent-hub:${sessionId}`) {
            if (new URL(request.url).pathname === "/agent-operation") {
              const action = await request.json() as { type: string };
              if (action.type === "use-grant" && failUse) {
                failUse = false;
                return Response.json({ error: "use-grant unavailable" }, { status: 500 });
              }
              return hubOperation(storage, action, async () => undefined);
            }
            const value = await storage.get<AgentHub>("session");
            return value ? Response.json(value) : new Response(null, { status: 404 });
          }
          assert.ok(id.startsWith("agent:"));
          if (request.method === "PUT") {
            records.set(id, await request.json() as AgentGrant);
            return new Response(null, { status: 204 });
          }
          if (request.method === "DELETE") {
            records.delete(id);
            return new Response(null, { status: 204 });
          }
          const value = records.get(id);
          return value && value.expiresAt > Date.now() ? Response.json(value) : new Response(null, { status: 404 });
        },
      }),
    },
  };
  const { id } = await createGrant(env, { ...hub, sessionId, repoId: 7, repo: "lex/site", via: "token" });
  failUse = true;
  await assert.rejects(markGrantUsed(env, id, await getGrant(env, id), " Agent\u0000 "), /use-grant unavailable/);
  failUse = false;
  const retry = await getGrant(env, id);
  assert.equal(retry.usedAt, undefined);
  assert.equal((await getHub(env, sessionId))?.grants[0].usedAt, undefined);
  await markGrantUsed(env, id, retry, " Agent\u0000 ");
  const record = await getGrant(env, id);
  const connected = (await getHub(env, sessionId))!.grants[0];
  assert.equal(typeof connected.usedAt, "number");
  assert.equal(record.usedAt, connected.usedAt);
  assert.equal(record.client, "Agent");
  assert.equal(connected.client, "Agent");
  // Even a stale request cannot move the hub's first use or replace its client.
  await markGrantUsed(env, id, retry, "Other agent");
  assert.deepEqual((await getHub(env, sessionId))!.grants[0], connected);
});

test("concurrent fake hub operations keep both grants", async () => {
  const storage = memoryStorage();
  await storage.put({ session: { kind: "agent-hub", ...hub, grants: [] } });
  const responses = await Promise.all(["first", "second"].map((id) =>
    fakeHubRoute("concurrent-hub", storage, operationRequest(addGrant(id))),
  ));
  for (const response of responses) assert.equal(response?.status, 200);
  assert.deepEqual((await storage.get<AgentHub>("session"))!.grants.map((grant) => grant.id), ["first", "second"]);
});

test("a throwing fake hub operation does not block the next queued operation", async () => {
  const storage = memoryStorage();
  let fail = true;
  const unreliable: HubStorage = {
    ...storage,
    get: async <T>(key: string) => {
      if (fail) { fail = false; throw new Error("storage unavailable"); }
      return storage.get<T>(key);
    },
  };
  const results = await Promise.allSettled(["failed", "kept"].map((id) =>
    fakeHubRoute("recovering-hub", unreliable, operationRequest(addGrant(id))),
  ));
  assert.equal(results[0].status, "rejected");
  assert.equal(results[1].status, "fulfilled");
  assert.deepEqual((await storage.get<AgentHub>("session"))!.grants.map((grant) => grant.id), ["kept"]);
});
