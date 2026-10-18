import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { accountMetadata, METADATA_KEY, METADATA_ROUTE, type MetadataAction, type MetadataResult } from "../worker/agent-metadata";
import { createGrant, getGrant, getHub, revokeGrant, type AgentGrant, type AgentHub } from "../worker/agent-context";
import type { Env } from "../worker/app";
import { relayObjectName } from "../worker/agent-relay";
import { workspaceKey } from "../shared/agent-command";
import { CountedStorage, UsageCounters, startCountedWorker } from "./fakes/counted-agent";
import { editorTab, origin, repo, signIn } from "./mcp-harness";

const workspace = { account: "lex", repoId: repo.id, branch: "main" };
const key = workspaceKey(workspace);
const grantId = (n: number) => n.toString(16).padStart(64, "0");
type Ledger = { workspace: string; entries: MetadataResult["entries"] };
const reserve = (n: number, bytes = 100, expiresAt = 1000): MetadataAction =>
  ({ action: "reserve", workspace: key, id: grantId(n), bytes, expiresAt });
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

// Every operation count comes from the shared usage harness, including pure rules.
test("ledger refuses the sixth connection without eviction; retries, finalize and release are idempotent", async () => {
  const counters = new UsageCounters(), storage = new CountedStorage(counters);
  for (let n = 1; n <= 5; n++) assert.equal((await accountMetadata(storage, reserve(n), 1)).allowed, true);
  const before = await storage.get(METADATA_KEY);
  counters.reset();
  assert.equal((await accountMetadata(storage, reserve(6), 1)).reason, "connections");
  assert.equal((await accountMetadata(storage, reserve(1, 900), 2)).allowed, true);
  assert.deepEqual(await storage.get(METADATA_KEY), before);
  assert.equal(counters.byCategory.data.keysWritten, 0);
  await accountMetadata(storage, { action: "finalize", workspace: key, id: grantId(1) }, 2);
  counters.reset();
  await accountMetadata(storage, { action: "finalize", workspace: key, id: grantId(1) }, 2);
  await accountMetadata(storage, { action: "finalize", workspace: key, id: grantId(99) }, 2);
  assert.equal(counters.byCategory.data.keysWritten, 0);
  await accountMetadata(storage, { action: "release", workspace: key, id: grantId(1) }, 2);
  counters.reset();
  await accountMetadata(storage, { action: "release", workspace: key, id: grantId(1) }, 2);
  assert.equal(counters.byCategory.data.keysWritten, 0);
  assert.equal((await storage.get<Ledger>(METADATA_KEY))!.entries.length, 4);
  assert.equal((await accountMetadata(storage, reserve(6), 2)).allowed, true);
});

test("ledger admits exactly 64 KiB including UTF-8 ledger bytes; one byte over is refused", async () => {
  const counters = new UsageCounters(), storage = new CountedStorage(counters);
  const workspace = '["é",1,"main"]';
  let bytes = 65000;
  const ledger = () => ({ workspace, entries: [{ id: grantId(1), state: "pending", bytes, expiresAt: 1000, at: 1 }] });
  // Find the fixed point because the decimal byte count is itself stored.
  for (let n = 0; n < 3; n++) bytes = 64 * 1024 - size(ledger());
  const caps = { connections: 5, bytes: 64 * 1024 };
  assert.equal((await accountMetadata(storage, { ...reserve(1, bytes + 1), workspace }, 1, caps)).reason, "bytes");
  assert.equal(counters.byCategory.data.keysWritten, 0);
  assert.equal((await accountMetadata(storage, { ...reserve(1, bytes), workspace }, 1, caps)).allowed, true);
  assert.equal(size(await storage.get(METADATA_KEY)) + bytes, caps.bytes);
  assert.equal(counters.byCategory.data.keysWritten, 1);
});

test("lazy expiry stops counting; empty ledgers preserve workspace ownership; stale release cannot remove a finalized entry", async () => {
  const counters = new UsageCounters(), storage = new CountedStorage(counters);
  const caps = { connections: 1, bytes: 4096 };
  const first = await accountMetadata(storage, reserve(1, 100, 2), 1, caps);
  await accountMetadata(storage, { action: "finalize", workspace: key, id: grantId(1) }, 1, caps);
  await accountMetadata(storage, { action: "release", workspace: key, id: grantId(1), expected: first.entries[0] }, 1, caps);
  assert.equal((await storage.get<Ledger>(METADATA_KEY))!.entries.length, 1);
  assert.equal((await accountMetadata(storage, reserve(2), 2, caps)).allowed, true);
  await accountMetadata(storage, { action: "release", workspace: key, id: grantId(2) }, 2, caps);
  const writes = counters.byCategory.data.keysWritten;
  assert.equal((await accountMetadata(storage, { ...reserve(3), workspace: "other" }, 3, caps)).reason, "workspace");
  assert.equal(counters.byCategory.data.keysWritten, writes);
  assert.equal((await storage.get<Ledger>(METADATA_KEY))!.workspace, key);
});

async function fixture() {
  const h = await startCountedWorker();
  const { cookie } = await signIn(h.worker);
  const sessionId = cookie.split("=")[1];
  const tab = editorTab(h.worker, cookie);
  const env: Env = { SESSIONS: h.namespace, ASSETS: { fetch: async () => new Response(null, { status: 404 }) } };
  const name = await relayObjectName(workspace);
  const input = { sessionId, login: "lex", repoId: repo.id, repo: repo.full_name,
    branch: "main", via: "token" as const, expiresAt: Date.now() + 3600000 };
  const connect = (branch = "main") => tab.post("/api/agent/connect", { repoId: repo.id, repo: repo.full_name, branch });
  const ledger = async (branch = "main") => h.storage(await relayObjectName({ ...workspace, branch })).get<Ledger>(METADATA_KEY);
  return { ...h, env, tab, sessionId, cookie, input, name, connect, ledger };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const connections = async (h: Fixture) => (await getHub(h.env, h.sessionId))!.grants;
async function connected(h: Fixture, branch = "main") {
  const response = await h.connect(branch);
  assert.equal(response.status, 200, await response.clone().text());
  return await response.json() as { id: string; token: string };
}
function intercept(h: Fixture, run: (name: string, request: Request, next: () => Promise<Response>) => Promise<Response>) {
  const get = h.namespace.get;
  h.namespace.get = name => ({ fetch: request => run(String(name), request, () => get(name).fetch(request)) });
  return () => { h.namespace.get = get; };
}
async function agePending(h: Fixture) {
  const ledger = (await h.ledger())!;
  for (const entry of ledger.entries) entry.at = Date.now() - 61000;
  await h.storage(h.name).put(METADATA_KEY, ledger);
}

test("eight concurrent Worker connects admit exactly five; other branches, repositories and accounts are independent", async () => {
  const h = await fixture();
  try {
    h.counters.reset();
    const responses = await Promise.all(Array.from({ length: 8 }, () => h.connect()));
    assert.equal(responses.filter(response => response.status === 200).length, 5);
    const refused = responses.filter(response => response.status === 409);
    assert.equal(refused.length, 3);
    for (const response of refused) assert.match(await response.text(), /already has 5 agent connections on this branch.*Disconnect one/);
    assert.equal((await h.ledger())!.entries.length, 5);
    assert.equal((await connections(h)).length, 5);
    assert.equal(h.counters.log.filter(row => row.name.startsWith("agent:") && row.path === "/").length, 5, "grant record call count excludes refused allocations");
    await connected(h, "preview");
    for (const change of [{ login: "other" }, { repoId: 987 }])
      await createGrant(h.env, { ...h.input, ...change });
    assert.equal((await h.ledger())!.entries.length, 5);
    assert.equal((await h.ledger("preview"))!.entries.length, 1);
    // The shared alarm must not delete either ledger entries or their binding.
    const before = await h.ledger();
    await h.alarm(h.name);
    assert.deepEqual(await h.ledger(), before);
  } finally { await h.worker.dispose(); }
});

for (const step of ["record PUT", "add-grant"] as const)
  test(`${step} failure deletes the record before releasing capacity`, async () => {
    const h = await fixture();
    let failedId = "";
    const restore = intercept(h, async (name, request, next) => {
      if (name.startsWith("agent:") && request.method === "PUT") failedId = name.slice(6);
      const action = request.url.endsWith("/agent-operation") ? await request.clone().json() as { type: string } : undefined;
      if (step === "record PUT" && name.startsWith("agent:") && request.method === "PUT" ||
          step === "add-grant" && action?.type === "add-grant") return Response.json({ error: "Connection storage unavailable." }, { status: 503 });
      return next();
    });
    try {
      assert.equal((await h.connect()).status, 503);
      assert.equal((await h.storage(`agent:${failedId}`).get("session")), undefined);
      assert.equal((await h.ledger())!.entries.length, 0);
      restore();
      await agePending(h);
      for (let n = 0; n < 5; n++) await connected(h);
      assert.equal((await h.ledger())!.entries.length, 5);
      assert.equal((await connections(h)).length, 5);
    } finally { restore(); await h.worker.dispose(); }
  });

test("finalize failure leaves a usable connection counted; reconciliation finalizes without evicting it", async () => {
  const h = await fixture();
  const restore = intercept(h, async (_name, request, next) => {
    if (new URL(request.url).pathname === METADATA_ROUTE && (await request.clone().json() as MetadataAction).action === "finalize")
      return new Response(null, { status: 503 });
    return next();
  });
  try {
    const first = await connected(h);
    assert.equal((await h.ledger())!.entries[0].state, "pending");
    restore();
    for (let n = 0; n < 4; n++) await connected(h);
    await agePending(h);
    assert.equal((await h.connect()).status, 409);
    assert.equal((await h.ledger())!.entries.find(entry => entry.id === first.id)!.state, "final");
    assert.equal((await connections(h)).length, 5);
  } finally { restore(); await h.worker.dispose(); }
});

for (const crash of ["before PUT", "after PUT", "session ended"] as const)
  test(`capacity reconciliation recovers a crash ${crash}, retaining young pending entries`, async () => {
    const h = await fixture();
    try {
      const id = grantId(900);
      const grant: AgentGrant = { kind: "agent", ...h.input, generation: 1, createdAt: Date.now() };
      await accountMetadata(h.storage(h.name), { ...reserve(900, 1000, grant.expiresAt) }, Date.now());
      if (crash !== "before PUT") await h.namespace.get(`agent:${id}`).fetch(new Request("https://session.internal/", { method: "PUT", body: JSON.stringify(grant) }));
      for (let n = 0; n < 4; n++) await connected(h);
      if (crash === "session ended") {
        const otherId = "f".repeat(64);
        grant.sessionId = otherId;
        await h.storage(`agent:${id}`).put("session", grant);
        await h.storage(`agent-hub:${otherId}`).put("session", { kind: "agent-hub", login: grant.login,
          expiresAt: grant.expiresAt, grants: [{ id, repoId: grant.repoId, repo: grant.repo, branch: grant.branch, generation: grant.generation }] });
      }
      assert.equal((await h.connect()).status, 409);
      assert.equal((await h.ledger())!.entries.length, 5);
      await agePending(h);
      await connected(h);
      assert.equal(await h.storage(`agent:${id}`).get("session"), undefined);
      assert.equal((await h.ledger())!.entries.length, 5);
      assert.equal((await connections(h)).length, 5);
      assert.ok(h.counters.log.some(row => row.path === METADATA_ROUTE));
    } finally { await h.worker.dispose(); }
  });

test("unknown creation and reconciliation outcomes stay counted; an unreachable ledger allocates nothing", async () => {
  const h = await fixture();
  let failedId = "";
  const restore = intercept(h, async (name, request, next) => {
    if (name.startsWith("agent:") && request.method === "PUT") {
      failedId = name.slice(6);
      await next();
      throw new Error("Lost PUT reply");
    }
    if (name === `agent:${failedId}`) throw new Error("Unknown outcome");
    return next();
  });
  try {
    assert.equal((await h.connect()).status, 500);
    restore();
    for (let n = 0; n < 4; n++) await connected(h);
    await agePending(h);
    const stop = intercept(h, async (name, _request, next) => name === `agent:${failedId}` ? new Response(null, { status: 503 }) : next());
    try {
      assert.equal((await h.connect()).status, 409);
      assert.equal((await h.ledger())!.entries.length, 5);
    } finally { stop(); }
    await connected(h);
    assert.equal(await h.storage(`agent:${failedId}`).get("session"), undefined);
    const stopLedger = intercept(h, async (_name, request, next) => new URL(request.url).pathname === METADATA_ROUTE ? new Response(null, { status: 503 }) : next());
    h.counters.reset();
    try { assert.equal((await h.connect("new")).status, 503); } finally { stopLedger(); }
    assert.equal(h.counters.log.some(row => row.name.startsWith("agent:")), false);
  } finally { restore(); await h.worker.dispose(); }
});

test("revoke twice, missing record, wrong session and revoke after logout preserve exact occupancy", async () => {
  const h = await fixture();
  try {
    const first = await connected(h), second = await connected(h);
    await assert.rejects(revokeGrant(h.env, first.id, "other-session"), { status: 403 });
    assert.equal((await h.ledger())!.entries.length, 2);
    await h.namespace.get(`agent:${first.id}`).fetch(new Request("https://session.internal/", { method: "DELETE" }));
    await revokeGrant(h.env, first.id, h.sessionId);
    await revokeGrant(h.env, first.id, h.sessionId);
    assert.deepEqual((await h.ledger())!.entries.map(entry => entry.id), [second.id]);
    assert.deepEqual((await connections(h)).map(entry => entry.id), [second.id]);
    assert.equal((await h.tab.post("/auth/logout", {})).status, 204);
    assert.equal((await h.ledger())!.entries.length, 0);
    await revokeGrant(h.env, second.id, h.sessionId);
    assert.equal((await h.ledger())!.entries.length, 0);
    await assert.rejects(getGrant(h.env, second.id), { status: 401 });
  } finally { await h.worker.dispose(); }
});

test("rebind reserves destination before fencing; capacity refusal changes neither record nor hub", async () => {
  const h = await fixture();
  try {
    const source = await connected(h);
    const target = [];
    for (let n = 0; n < 5; n++) target.push(await connected(h, "preview"));
    const previous = await getGrant(h.env, source.id);
    const before = await connections(h);
    const rebind = () => h.tab.post("/api/agent/rebind", { id: source.id, repoId: repo.id, repo: repo.full_name, branch: "preview" });
    assert.equal((await rebind()).status, 409);
    assert.deepEqual(await getGrant(h.env, source.id), previous);
    assert.deepEqual(await connections(h), before);
    assert.equal((await h.ledger())!.entries.length, 1);
    await revokeGrant(h.env, target[0].id, h.sessionId);
    assert.equal((await rebind()).status, 200);
    assert.equal((await h.ledger())!.entries.length, 0);
    assert.equal((await h.ledger("preview"))!.entries.length, 5);
    assert.equal((await getGrant(h.env, source.id)).branch, "preview");
    await revokeGrant(h.env, source.id, h.sessionId);
    assert.equal((await h.ledger("preview"))!.entries.length, 4);
  } finally { await h.worker.dispose(); }
});

test("used tool traffic measures 0 ledger calls, 0 accounting keys written, 3 authentication calls and 1 dispatch", async () => {
  const h = await fixture();
  try {
    const { token } = await connected(h);
    const rpc = (method: string, params: object) => h.worker.dispatchFetch(origin + "/mcp", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const initialized = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "metadata", version: "1" } });
    assert.equal(initialized.status, 200);
    await initialized.text();
    h.counters.reset();
    const response = await rpc("tools/call", { name: "write_file", arguments: { path: "test.txt", content: "hello" } });
    assert.equal(response.status, 200);
    await response.text();
    assert.equal(h.counters.log.filter(row => row.path === METADATA_ROUTE).length, 0);
    assert.equal(h.counters.byCategory.auth.calls, 3);
    assert.equal(h.counters.byCategory.control.calls, 1);
    assert.equal(Object.values(h.counters.byCategory).reduce((sum, row) => sum + row.keysWritten, 0), 0);
    const hub = await getHub(h.env, h.sessionId) as AgentHub;
    assert.equal(hub.grants[0].client, "metadata");
  } finally { await h.worker.dispose(); }
});


test("a PUT delayed beyond grace cannot publish a sixth usable grant after reconciliation", async () => {
  const h = await fixture();
  const now = Date.now;
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let delayed = true;
  let pending: Promise<Response> | undefined;
  try {
    // Only the fifth creation is held after its reservation.
    for (let n = 0; n < 4; n++) await connected(h);
    const stop = intercept(h, async (name, request, next) => {
      if (delayed && name.startsWith("agent:") && request.method === "PUT") {
        delayed = false; entered(); await held;
      }
      return next();
    });
    try {
      pending = h.connect();
      await started;
      const later = now() + 61000;
      Date.now = () => later;
      await connected(h);
      release();
      assert.equal((await pending).status, 503);
      assert.equal((await h.ledger())!.entries.length, 5);
      assert.equal((await connections(h)).length, 5);
    } finally { stop(); }
  } finally { release(); if (pending) await pending; Date.now = now; await h.worker.dispose(); }
});

test("OAuth token capacity and unavailable ledger return OAuth JSON with plain descriptions", async () => {
  const h = await fixture();
  try {
    for (let n = 0; n < 5; n++) await connected(h);
    const verifier = "v".repeat(43);
    const exchange = async (n: number, branch = "main") => {
      const code = grantId(n);
      const codeId = `oauth-code:${createHash("sha256").update(code).digest("hex")}`;
      await h.storage(codeId).put("session", { kind: "oauth-code", ...h.input, branch,
        clientId: "test-client", clientName: "Test OAuth", redirectUri: "https://client.example/cb", approval: grantId(99),
        codeChallenge: createHash("sha256").update(verifier).digest("base64url") });
      return h.worker.dispatchFetch(origin + "/auth/mcp/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, code_verifier: verifier, client_id: "test-client", grant_type: "authorization_code" }).toString(),
      });
    };
    const refused = await exchange(900);
    assert.equal(refused.status, 409);
    assert.deepEqual(await refused.json(), { error: "access_denied", error_description:
      "This site already has 5 agent connections on this branch. Disconnect one in the editor's agent menu first." });
    const stop = intercept(h, async (_name, request, next) => new URL(request.url).pathname === METADATA_ROUTE
      ? new Response(null, { status: 503 }) : next());
    try {
      const unavailable = await exchange(901, "preview");
      assert.equal(unavailable.status, 503);
      assert.deepEqual(await unavailable.json(), { error: "temporarily_unavailable", error_description:
        "Agent connection capacity could not be checked. Try again." });
      assert.equal(await h.ledger("preview"), undefined);
    } finally { stop(); }
    assert.equal((await h.ledger())!.entries.length, 5);
  } finally { await h.worker.dispose(); }
});

test("hub admission refuses a twenty-first grant and keeps every existing grant", async () => {
  const h = await fixture();
  try {
    for (let n = 0; n < 20; n++) await connected(h, `branch-${n}`);
    const before = await connections(h);
    assert.equal((await h.connect("another")).status, 409);
    assert.deepEqual(await connections(h), before);
    assert.equal((await h.ledger("another"))!.entries.length, 0);
  } finally { await h.worker.dispose(); }
});

test("sessions share the workspace cap while one session's revoke preserves the other's connection", async () => {
  const h = await fixture();
  try {
    const other = await signIn(h.worker);
    const tab = editorTab(h.worker, other.cookie);
    const connect = () => tab.post("/api/agent/connect", { repoId: repo.id, repo: repo.full_name, branch: "main" });
    const grants = [];
    for (let n = 0; n < 5; n++) grants.push(await connected(h));
    assert.equal((await connect()).status, 409);
    await revokeGrant(h.env, grants[0].id, h.sessionId);
    const response = await connect();
    assert.equal(response.status, 200);
    const otherGrant = await response.json() as { id: string };
    await revokeGrant(h.env, grants[1].id, h.sessionId);
    assert.equal((await h.ledger())!.entries.length, 4);
    assert.ok(await getGrant(h.env, otherGrant.id));
  } finally { await h.worker.dispose(); }
});

for (const failure of ["session read", "hub read", "record delete"] as const)
  test(`reconciliation keeps an orphan counted when its ${failure} outcome is unknown`, async () => {
    const h = await fixture();
    try {
      const id = grantId(900);
      await accountMetadata(h.storage(h.name), reserve(900, 1000, h.input.expiresAt), Date.now() - 61000);
      await h.storage(`agent:${id}`).put("session", { kind: "agent", ...h.input, generation: 1 });
      for (let n = 0; n < 4; n++) await connected(h);
      const stop = intercept(h, async (name, request, next) => {
        if (failure === "session read" && name === h.sessionId && request.method === "GET" ||
            failure === "hub read" && name === `agent-hub:${h.sessionId}` && request.method === "GET" ||
            failure === "record delete" && name === `agent:${id}` && request.method === "DELETE")
          return new Response(null, { status: 503 });
        return next();
      });
      try {
        // Call the creation helper so the injected session read affects only
        // reconciliation, not the browser route's initial sign-in check.
        await assert.rejects(createGrant(h.env, h.input), { status: 409 });
        assert.equal((await h.ledger())!.entries.length, 5);
        assert.ok(await h.storage(`agent:${id}`).get("session"));
      } finally { stop(); }
      await connected(h);
      assert.equal((await h.ledger())!.entries.length, 5);
      assert.equal(await h.storage(`agent:${id}`).get("session"), undefined);
    } finally { await h.worker.dispose(); }
  });

test("a delayed rebind record write cannot restore a revoked connection", async () => {
  const h = await fixture();
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let pending: Promise<Response> | undefined;
  try {
    const source = await connected(h);
    const stop = intercept(h, async (name, request, next) => {
      if (name === `agent:${source.id}` && request.method === "PUT") { entered(); await held; }
      return next();
    });
    try {
      pending = h.tab.post("/api/agent/rebind", { id: source.id, repoId: repo.id, repo: repo.full_name, branch: "preview" });
      await started;
      await revokeGrant(h.env, source.id, h.sessionId);
      release();
      assert.equal((await pending).status, 503);
      await assert.rejects(getGrant(h.env, source.id), { status: 401 });
      assert.equal((await connections(h)).length, 0);
    } finally { stop(); }
    for (let n = 0; n < 4; n++) await connected(h, "preview");
    const target = (await h.ledger("preview"))!;
    target.entries.find(entry => entry.state === "pending")!.at = Date.now() - 61000;
    await h.storage(await relayObjectName({ ...workspace, branch: "preview" })).put(METADATA_KEY, target);
    await connected(h, "preview");
    assert.equal((await h.ledger("preview"))!.entries.length, 5);
  } finally { release(); if (pending) await pending; await h.worker.dispose(); }
});

test("byte capacity refusal uses plain words and allocates no grant record", async () => {
  const h = await fixture();
  try {
    assert.equal((await accountMetadata(h.storage(h.name), reserve(900, 65000, h.input.expiresAt), Date.now())).allowed, true);
    h.counters.reset();
    const response = await h.connect();
    assert.equal(response.status, 409);
    assert.match(await response.text(), /64 KiB metadata limit on this branch.*Disconnect one/);
    assert.equal(h.counters.log.some(row => row.name.startsWith("agent:")), false);
    assert.equal((await h.ledger())!.entries.length, 1);
  } finally { await h.worker.dispose(); }
});
