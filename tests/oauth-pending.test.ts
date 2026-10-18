import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { accountPending, PENDING_KEY, PENDING_ROUTE, type PendingAction } from "../worker/oauth-pending";
import { CountedStorage, UsageCounters, startCountedWorker } from "./fakes/counted-agent";
import { editorTab, origin, repo, signIn, siteContext, startWorker, type WorkerDispatch } from "./mcp-harness";

type Ledger = Record<string, { bytes: number; expiresAt: number }>;
const requestId = (n: number) => `oauth-request:${n.toString(16).padStart(64, "0")}`;
const codeId = (n: number) => `oauth-code:${n.toString(16).padStart(64, "0")}`;
const reserve = (n: number, bytes = 100, expiresAt = 1000): PendingAction => ({ action: "reserve", id: requestId(n), bytes, expiresAt });
async function memory() {
  const counters = new UsageCounters();
  const storage = new CountedStorage(counters);
  await storage.put("session", { kind: "user", expiresAt: 10000 });
  return {
    storage, counters,
    run: (action: PendingAction, now = 0) => storage.transaction(tx => accountPending(tx, action, now)),
    ledger: async () => (await storage.get<Ledger>(PENDING_KEY)) ?? {},
  };
}

test("request-to-code transition checks net occupancy; retries preserve bytes and deadlines", async () => {
  const h = await memory();
  for (let n = 0; n < 20; n++) assert.equal((await h.run(reserve(n))).allowed, true);
  const transition: PendingAction = { action: "transition", fromId: requestId(0), id: codeId(0), bytes: 200, expiresAt: 500 };
  assert.equal((await h.run(transition)).allowed, true);
  const expected = await h.ledger();
  assert.equal(Object.keys(expected).length, 20);
  assert.equal(expected[requestId(0)], undefined);
  assert.deepEqual(expected[codeId(0)], { bytes: 200, expiresAt: 500 });
  h.counters.reset();
  assert.equal((await h.run({ ...transition, bytes: 300, expiresAt: 900 })).allowed, true);
  assert.equal((await h.run(reserve(1, 300, 900))).allowed, true);
  assert.deepEqual(await h.ledger(), expected);
  assert.equal(h.counters.byCategory.data.keysWritten + h.counters.byCategory.data.keysDeleted, 0);
  await h.run({ action: "release", id: codeId(0) });
  const after = await h.ledger();
  h.counters.reset();
  await h.run({ action: "release", id: codeId(0) });
  assert.deepEqual(await h.ledger(), after, "duplicate consumption cannot free another slot");
  assert.equal(h.counters.byCategory.data.keysWritten + h.counters.byCategory.data.keysDeleted, 0);
});

test("a delayed transition retry after the code was consumed recreates nothing", async () => {
  const h = await memory();
  const transition: PendingAction = { action: "transition", fromId: requestId(0), id: codeId(0), bytes: 200, expiresAt: 500 };
  await h.run(reserve(0));
  assert.equal((await h.run(transition)).allowed, true);
  await h.run({ action: "release", id: codeId(0) });
  assert.equal(await h.storage.get(PENDING_KEY), undefined);
  assert.equal((await h.run(transition)).allowed, true);
  assert.equal((await h.run(transition)).allowed, true);
  assert.equal(await h.storage.get(PENDING_KEY), undefined, "no phantom code reservation");
  for (let n = 1; n <= 20; n++) assert.equal((await h.run(reserve(n))).allowed, true);
});

test("count capacity refuses the 21st without evicting or extending existing entries", async () => {
  const h = await memory();
  for (let n = 0; n < 20; n++) await h.run(reserve(n, 100, 1000 + n));
  const before = await h.ledger();
  assert.equal((await h.run(reserve(20))).allowed, false);
  assert.deepEqual(await h.ledger(), before);
  assert.equal((await h.run({ action: "transition", fromId: requestId(99), id: codeId(99), bytes: 100, expiresAt: 1000 })).allowed, true);
  assert.deepEqual(await h.ledger(), before, "an unowned transition adds nothing");
});

test("64 KiB fits exactly; byte refusal preserves entries and transition uses net bytes", async () => {
  const h = await memory();
  assert.equal((await h.run(reserve(0, 65535))).allowed, true);
  assert.equal((await h.run(reserve(1, 1))).allowed, true);
  const before = await h.ledger();
  assert.equal((await h.run(reserve(2, 1))).allowed, false);
  assert.deepEqual(await h.ledger(), before);
  const transition: PendingAction = { action: "transition", fromId: requestId(0), id: codeId(0), bytes: 65535, expiresAt: 500 };
  assert.equal((await h.run(transition)).allowed, true);
  assert.equal((await h.run({ ...transition, fromId: requestId(1), id: codeId(1), bytes: 2 })).allowed, false);
  assert.deepEqual(await h.ledger(), { [codeId(0)]: { bytes: 65535, expiresAt: 500 } }, "a consumed request is released on transition refusal");
});

test("legacy transition passes uncounted; expiry frees capacity at the exact deadline", async () => {
  const h = await memory();
  const legacy: PendingAction = { action: "transition", fromId: requestId(7), id: codeId(7), bytes: 100, expiresAt: 500 };
  assert.equal((await h.run(legacy)).allowed, true);
  assert.equal(await h.storage.get(PENDING_KEY), undefined);
  assert.equal((await h.run(reserve(0, 65536, 400))).allowed, true);
  const transition: PendingAction = { action: "transition", fromId: requestId(0), id: codeId(0), bytes: 65536, expiresAt: 500 };
  assert.equal((await h.run(transition)).allowed, true);
  assert.equal((await h.run(reserve(1), 499)).allowed, false);
  assert.equal((await h.run(reserve(1), 500)).allowed, true);
  assert.deepEqual(await h.ledger(), { [requestId(1)]: { bytes: 100, expiresAt: 1000 } });
  await h.run({ action: "release", id: requestId(99) }, 1000);
  assert.equal(await h.storage.get(PENDING_KEY), undefined);
});

test("reserve and transition require a live user session; storage failures roll back", async () => {
  const h = await memory();
  for (const session of [undefined, { kind: "oauth-request", expiresAt: 10000 }, { kind: "user", expiresAt: 0 }]) {
    if (session) await h.storage.put("session", session);
    else await h.storage.delete("session");
    assert.equal((await h.run(reserve(0))).allowed, false);
    assert.deepEqual(await h.ledger(), {});
  }
  await h.storage.put("session", { kind: "user", expiresAt: 10000 });
  await h.run(reserve(0));
  const before = await h.ledger();
  h.storage.failNextWrite();
  await assert.rejects(h.run({ action: "transition", fromId: requestId(0), id: codeId(0), bytes: 200, expiresAt: 500 }), /Injected/);
  assert.deepEqual(await h.ledger(), before);
});

const callback = "https://client.example/cb";
const verifier = "v".repeat(43);
const challenge = createHash("sha256").update(verifier).digest("base64url");
async function oauth(worker: WorkerDispatch) {
  const { cookie } = await signIn(worker);
  const registration = await worker.dispatchFetch(`${origin}/auth/mcp/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Pending é", redirect_uris: [callback] }),
  });
  assert.equal(registration.status, 201);
  const { client_id: clientId } = await registration.json() as { client_id: string };
  const query = new URLSearchParams({ client_id: clientId, response_type: "code", code_challenge: challenge, code_challenge_method: "S256" });
  const authorize = () => worker.dispatchFetch(`${origin}/auth/mcp/authorize?${query}`, { headers: { Cookie: cookie }, redirect: "manual" });
  const consent = (nonce: string, decision = "allow", otherCookie = cookie, repository = repo.full_name) => worker.dispatchFetch(`${origin}/auth/mcp/authorize`, {
    method: "POST", headers: { Origin: origin, Cookie: otherCookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ request: nonce, decision, repo: repository }).toString(), redirect: "manual",
  });
  const token = (code: string) => worker.dispatchFetch(`${origin}/auth/mcp/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: callback, code_verifier: verifier }).toString(),
  });
  const nonce = async () => {
    const response = await authorize();
    assert.equal(response.status, 200);
    return (await response.text()).match(/name="request" value="([a-f0-9]{64})"/)![1];
  };
  return { cookie, sessionId: cookie.split("=")[1], authorize, consent, token, nonce };
}

test("real Worker refuses authorize 21; consent and token free all occupancy", async () => {
  const { worker } = await startWorker();
  try {
    const h = await oauth(worker);
    const pending = await Promise.all(Array.from({ length: 20 }, () => h.nonce()));
    const refused = await h.authorize();
    assert.equal(refused.status, 429);
    assert.match(await refused.text(), /Too many unfinished connection requests.*wait up to ten minutes/);
    for (const nonce of pending) assert.equal((await h.consent(nonce, "deny")).status, 302);
    const approved = await h.consent(await h.nonce());
    assert.equal(approved.status, 302);
    const code = new URL(approved.headers.get("location")!).searchParams.get("code")!;
    assert.equal((await h.token(code)).status, 200);
    assert.equal((await h.token(code)).status, 400);
    // All twenty slots are available after the completed flow and duplicate use.
    const next = await Promise.all(Array.from({ length: 20 }, () => h.nonce()));
    for (const nonce of next) await h.consent(nonce, "deny");
  } finally { await worker.dispose(); }
});

test("consumed consent paths release the original sign-in ledger exactly once", async () => {
  const h = await startCountedWorker();
  try {
    const flow = await oauth(h.worker);
    const other = await signIn(h.worker);
    for (const outcome of ["deny", "repository", "other-sign-in", "signed-out"] as const) {
      const nonce = await flow.nonce();
      h.counters.reset();
      const response = await flow.consent(nonce, outcome === "deny" ? "deny" : "allow",
        outcome === "other-sign-in" ? other.cookie : outcome === "signed-out" ? "" : flow.cookie,
        outcome === "repository" ? "invalid" : repo.full_name);
      assert.equal(response.status, outcome === "deny" ? 302 : 403);
      assert.deepEqual(h.counters.log.filter(row => row.path === PENDING_ROUTE).map(row => row.name), [flow.sessionId]);
      assert.equal(await h.storage(flow.sessionId).get(PENDING_KEY), undefined);
    }
  } finally { await h.worker.dispose(); }
});

test("code consumption releases once; serialized UTF-8 accounting and session PUT preserve the ledger", async () => {
  const h = await startCountedWorker();
  try {
    const flow = await oauth(h.worker);
    const nonce = await flow.nonce();
    const storage = h.storage(flow.sessionId);
    const before = await storage.get<Ledger>(PENDING_KEY);
    const pending = await h.storage(`oauth-request:${nonce}`).get<{ expiresAt: number }>("session");
    assert.deepEqual(before?.[`oauth-request:${nonce}`], { bytes: Buffer.byteLength(JSON.stringify(pending)), expiresAt: pending!.expiresAt });
    const session = await storage.get("session");
    await h.namespace.get(flow.sessionId).fetch(new Request("https://session.internal/", { method: "PUT", body: JSON.stringify(session) }));
    assert.deepEqual(await storage.get(PENDING_KEY), before);
    const approved = await flow.consent(nonce);
    const code = new URL(approved.headers.get("location")!).searchParams.get("code")!;
    const id = `oauth-code:${createHash("sha256").update(code).digest("hex")}`;
    const grant = await h.storage(id).get<{ expiresAt: number }>("session");
    assert.deepEqual(await storage.get(PENDING_KEY), { [id]: { bytes: Buffer.byteLength(JSON.stringify(grant)), expiresAt: grant!.expiresAt } });
    assert.equal((await flow.token(code)).status, 200);
    assert.equal(await storage.get(PENDING_KEY), undefined);
    h.counters.reset();
    assert.equal((await flow.token(code)).status, 400);
    assert.equal(h.counters.log.filter(row => row.path === PENDING_ROUTE).length, 0);
  } finally { await h.worker.dispose(); }
});

test("failed request and code allocation release only after a definitive 404", async () => {
  for (const kind of ["request", "code"] as const) {
    for (const mode of ["missing", "stored", "unreadable"] as const) {
      const h = await startCountedWorker();
      try {
        const flow = await oauth(h.worker);
        const nonce = kind === "code" ? await flow.nonce() : undefined;
        const get = h.namespace.get;
        h.namespace.get = name => {
          const stub = get(name);
          return { async fetch(request: Request) {
            if (name.startsWith(`oauth-${kind}:`)) {
              if (request.method === "PUT") {
                if (mode === "stored") await stub.fetch(request);
                if (mode === "missing") return new Response(null, { status: 503 });
                throw new Error("Allocation unavailable");
              }
              if (request.method === "GET" && mode === "unreadable") return new Response(null, { status: 503 });
            }
            return stub.fetch(request);
          } };
        };
        assert.equal((await (nonce ? flow.consent(nonce) : flow.authorize())).status, 503);
        const ledger = (await h.storage(flow.sessionId).get<Ledger>(PENDING_KEY)) ?? {};
        assert.equal(Object.keys(ledger).length, mode === "missing" ? 0 : 1);
        if (mode !== "missing") {
          const [id, entry] = Object.entries(ledger)[0];
          assert.ok(id.startsWith(`oauth-${kind}:`));
          await h.storage(flow.sessionId).transaction(tx => accountPending(tx, { action: "release", id: requestId(99) }, entry.expiresAt));
          assert.equal(await h.storage(flow.sessionId).get(PENDING_KEY), undefined);
        }
      } finally { await h.worker.dispose(); }
    }
  }
});

test("unreachable ledger allocates nothing; sign-out and the session alarm clear it", async () => {
  const h = await startCountedWorker();
  try {
    const flow = await oauth(h.worker);
    const get = h.namespace.get;
    h.namespace.get = name => {
      const stub = get(name);
      return { fetch: request => new URL(request.url).pathname === PENDING_ROUTE
        ? Promise.resolve(new Response(null, { status: 503 })) : stub.fetch(request) };
    };
    h.counters.reset();
    assert.equal((await flow.authorize()).status, 503);
    assert.equal(h.counters.log.filter(row => row.name.startsWith("oauth-request:")).length, 0);
    h.namespace.get = get;
    await flow.nonce();
    const logout = await h.worker.dispatchFetch(`${origin}/auth/logout`, { method: "POST", headers: { Origin: origin, Cookie: flow.cookie }, redirect: "manual" });
    assert.equal(logout.status, 204);
    assert.equal(await h.storage(flow.sessionId).get(PENDING_KEY), undefined);
    const session = h.namespace.get(flow.sessionId);
    const reserveResponse = await session.fetch(new Request(`https://session.internal${PENDING_ROUTE}`, { method: "POST", body: JSON.stringify({ ...reserve(1), expiresAt: Date.now() + 1000 }) }));
    assert.equal((await reserveResponse.json()).allowed, false, "late admission cannot recreate a signed-out ledger");
    const next = await oauth(h.worker);
    await next.nonce();
    await h.alarm(next.sessionId);
    assert.equal(await h.storage(next.sessionId).get(PENDING_KEY), undefined);
  } finally { await h.worker.dispose(); }
});

test("consent fails closed if its ledger is unreachable or sign-out wins the transition", async () => {
  for (const mode of ["unreachable", "signed-out"] as const) {
    const h = await startCountedWorker();
    try {
      const flow = await oauth(h.worker);
      const nonce = await flow.nonce();
      const get = h.namespace.get;
      h.namespace.get = name => {
        const stub = get(name);
        return { async fetch(request: Request) {
          if (new URL(request.url).pathname === PENDING_ROUTE) {
            if (mode === "unreachable") return new Response(null, { status: 503 });
            await stub.fetch(new Request("https://session.internal/", { method: "DELETE" }));
          }
          return stub.fetch(request);
        } };
      };
      h.counters.reset();
      assert.equal((await flow.consent(nonce)).status, mode === "unreachable" ? 503 : 429);
      assert.equal(h.counters.log.filter(row => row.name.startsWith("oauth-code:")).length, 0);
      const ledger = await h.storage(flow.sessionId).get<Ledger>(PENDING_KEY);
      if (mode === "signed-out") assert.equal(ledger, undefined);
      else assert.deepEqual(Object.keys(ledger!), [`oauth-request:${nonce}`], "ambiguous transition keeps its bounded reservation");
    } finally { await h.worker.dispose(); }
  }
});

test("ordinary MCP reads add zero ledger calls, reads or writes", async () => {
  const h = await startCountedWorker();
  try {
    const flow = await oauth(h.worker);
    const approved = await flow.consent(await flow.nonce());
    const code = new URL(approved.headers.get("location")!).searchParams.get("code")!;
    const { access_token: token } = await (await flow.token(code)).json() as { access_token: string };
    assert.equal((await editorTab(h.worker, flow.cookie).share(await siteContext())).status, 200);
    // Keep a pending entry so an accidental ledger load would be observable.
    await flow.nonce();
    const storage = h.storage(flow.sessionId);
    const read = storage.get.bind(storage);
    async function guardedRead<T>(keys: string): Promise<T | undefined>;
    async function guardedRead<T>(keys: string[]): Promise<Map<string, T>>;
    async function guardedRead<T>(keys: string | string[]): Promise<T | undefined | Map<string, T>> {
      assert.ok(!(typeof keys === "string" ? [keys] : keys).includes(PENDING_KEY), "session GET never loads the ledger");
      return typeof keys === "string" ? read<T>(keys) : read<T>(keys);
    }
    storage.get = guardedRead;
    const rpc = (method: string, params?: object) => h.worker.dispatchFetch(`${origin}/mcp`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: method === "initialize"
        ? { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "pending-test", version: "1" } } : params }),
    });
    await (await rpc("initialize")).text();
    h.counters.reset();
    const response = await rpc("tools/list");
    assert.equal(response.status, 200);
    await response.text();
    assert.equal(h.counters.byCategory.auth.calls, 3);
    assert.equal(h.counters.log.filter(row => row.path === PENDING_ROUTE).length, 0);
    assert.equal(Object.values(h.counters.byCategory).reduce((n, counts) => n + counts.keysWritten, 0), 0);
    h.counters.reset();
    const files = await rpc("tools/call", { name: "list_files", arguments: {} });
    assert.equal(files.status, 200);
    assert.match(await files.text(), /index.html/);
    assert.equal(h.counters.byCategory.auth.calls, 3);
    assert.equal(h.counters.byCategory.data.calls, 1);
    assert.equal(h.counters.log.filter(row => row.path === PENDING_ROUTE).length, 0);
    assert.equal(Object.values(h.counters.byCategory).reduce((n, counts) => n + counts.keysWritten + counts.keysDeleted, 0), 0);
  } finally { await h.worker.dispose(); }
});
