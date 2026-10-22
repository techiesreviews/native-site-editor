import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentHub } from "../worker/agent-context";
import { relayObjectName, type RelaySocket } from "../worker/agent-relay";
import { startCountedWorker } from "./fakes/counted-agent";
import { editorTab, origin, payload, repo, signIn, siteContext } from "./mcp-harness";

const obsolete = ["hub", "context", "drafts", "claim", "ack", "pause", "ask", "answer", "dismiss"];
const removedTypes = ["context", "pause", "queue", "claim", "ack", "ask", "answer", "dismiss", "take-requests", "request", "reply", "unknown"];
const updated = { error: "This editor was updated. Reload this tab to keep using agents.", code: "editor-updated" };
type Harness = Awaited<ReturnType<typeof startCountedWorker>>;
function zeroWork(h: Harness) {
  for (const counts of Object.values(h.counters.byCategory)) {
    assert.equal(counts.calls, 0);
    assert.equal(counts.keysWritten, 0);
    assert.equal(counts.keysRead, 0);
    assert.equal(counts.keysDeleted, 0);
  }
}
async function connected() {
  const h = await startCountedWorker();
  const { cookie } = await signIn(h.worker);
  const tab = editorTab(h.worker, cookie);
  const response = await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" });
  assert.equal(response.status, 200);
  const { token } = await response.json() as { token: string };
  const hubName = h.counters.log.find(row => row.name.startsWith("agent-hub:"))!.name;
  const rpc = async (method: string, params?: object) => {
    const response = await h.dispatchFetch(origin + "/mcp", { method: "POST", headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    assert.equal(response.status, 200);
    const body = await response.text();
    const result = JSON.parse(body.startsWith("event:") ? body.split("data: ")[1].split("\n")[0] : body);
    assert.equal(result.error, undefined, body);
    return result.result;
  };
  await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "cutover", version: "1" } });
  return { ...h, cookie, tab, hubName, rpc };
}

test("every obsolete route rejects all methods before session, origin, account or DO work", async () => {
  const h = await startCountedWorker();
  try {
    const { cookie } = await signIn(h.worker);
    // Include the methods old bundles used, plus methods that must never bypass the guard.
    for (const name of obsolete) for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      for (const signed of [false, true]) {
        h.counters.reset();
        let workerRequests = 0;
        const dispatch = () => { workerRequests++; return h.dispatchFetch(`${origin}/api/agent/${name}`, {
          method, headers: { Origin: "https://stale.example", ...(signed ? { Cookie: cookie } : {}) },
          ...(method === "GET" ? {} : { body: "malformed obsolete content" }),
        }); };
        const response = await dispatch();
        assert.equal(response.status, 410, `${method} ${name}, signed=${signed}`);
        assert.deepEqual(await response.json(), updated);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(workerRequests, 1, "the stale request still reaches the Worker once");
        zeroWork(h);
      }
    }
  } finally { await h.worker.dispose(); }
});

test("DO refuses every removed operation and draft route, leaving existing legacy data untouched", async () => {
  const h = await connected();
  try {
    const storage = h.storage(h.hubName);
    await storage.put({ context: await siteContext(), drafts: { old: 3 }, "draft:old": "old", requests: [{ id: "req-old" }] });
    const before = await storage.list();
    for (const type of removedTypes) {
      h.counters.reset();
      const response = await h.namespace.get(h.hubName).fetch(new Request("https://session.internal/agent-operation", {
        method: "POST", body: JSON.stringify({ type, context: await siteContext(), command: { content: "new" }, request: { id: "req-new" } }),
      }));
      assert.equal(response.status, 400, type);
      assert.equal(Object.values(h.counters.byCategory).reduce((sum, count) => sum + count.keysWritten + count.keysDeleted, 0), 0);
      assert.equal(h.counters.readKeys.length, 0);
      assert.deepEqual(await storage.list(), before);
    }
    for (const path of ["agent-drafts", "agent-draft?hash=old"]) for (const method of ["GET", "POST", "PUT"]) {
      const response = await h.namespace.get(h.hubName).fetch(new Request(`https://session.internal/${path}`, {
        method, ...(method === "GET" ? {} : { body: JSON.stringify([{ hash: "new", content: "new" }]) }),
      }));
      assert.equal(response.status, 404);
      assert.deepEqual(await storage.list(), before);
    }
  } finally { await h.worker.dispose(); }
});

test("connections and MCP authentication read grant metadata without context, drafts or requests", async () => {
  const h = await connected();
  try {
    await h.storage(h.hubName).put({ context: await siteContext(), "draft:old": "secret", drafts: { old: 6 }, requests: [] });
    h.counters.reset();
    const response = await h.dispatchFetch(origin + "/api/agent/connections", { headers: { Cookie: h.cookie } });
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(await response.json()), ["grants", "controls"]);
    assert.ok(!h.counters.readKeys.some(key => /^(context|draft:|drafts|requests)/.test(key)));
    assert.equal(Object.values(h.counters.byCategory).reduce((sum, count) => sum + count.keysWritten, 0), 0);
    h.counters.reset();
    await h.rpc("tools/list");
    assert.equal(h.counters.byCategory.auth.calls, 3);
    assert.ok(!h.counters.readKeys.some(key => /^(context|draft:|drafts|requests)/.test(key)));
    assert.ok(h.counters.log.some(row => row.path === "/?context=0"));
    assert.equal((await h.dispatchFetch(origin + "/api/agent/connections")).status, 401);
    assert.equal((await h.dispatchFetch(origin + "/api/agent/connections", { method: "POST", headers: { Cookie: h.cookie, Origin: "https://evil.example" } })).status, 403);
  } finally { await h.worker.dispose(); }
});

test("mixed tabs: old polling/uploads/claim/ack/Ask cannot recreate mirrors; new relay reads and edits still cost 3 + 1", async () => {
  const h = await connected();
  const workspace = { account: "lex", repoId: repo.id, branch: "main" };
  const scope = { workspace, tabId: "new-tab", generation: 1 };
  const name = await relayObjectName(workspace);
  const drafts = new Map<string, string>([["index.html", "old text"]]);
  let attachment: unknown = { ...scope, role: "editor", owner: { tabId: scope.tabId, generation: 1 } };
  const socket = {
    readyState: 1, close() {}, deserializeAttachment: () => attachment, serializeAttachment(value: unknown) { attachment = value; },
    send(message: string) {
      const value = JSON.parse(message);
      if (value.type !== "command") return;
      const request = value.command;
      if (request.operation === "edit") drafts.set(request.args.path, request.args.content);
      const result = { ok: true, value: request.operation === "edit" ? { state: "applied", requestId: request.id }
        : { content: drafts.get(request.args.path), source: "draft" } };
      h.message(name, socket, JSON.stringify({ type: "result", id: value.id, ...scope, result }));
    },
  } satisfies RelaySocket;
  try {
    h.attach(name, socket, JSON.stringify({ type: "handshake", ...scope, owner: true }));
    await h.settle(name);
    const hub = (await h.storage(h.hubName).get<AgentHub>("session"))!;
    const commands = [{ id: "legacy-pending", state: "pending", claimedBy: "old-tab" }];
    await h.storage(h.hubName).put("session", { ...hub, commands });
    for (const route of obsolete) {
      h.counters.reset();
      const response = route === "hub" ? await h.dispatchFetch(origin + "/api/agent/hub", { headers: { Cookie: h.cookie } })
        : await h.tab.post(`/api/agent/${route}`, { context: await siteContext(), texts: [{ content: "stale" }], id: "legacy-pending" });
      assert.equal(response.status, 410);
      zeroWork(h);
      h.counters.reset();
      const result = await h.rpc("tools/call", { name: "read_file", arguments: { path: "index.html" } });
      assert.equal(result.isError, undefined);
      assert.equal(payload(result).content, drafts.get("index.html"));
      assert.equal(h.counters.byCategory.auth.calls, 3);
      assert.equal(h.counters.byCategory.control.calls, 1);
      assert.equal(h.counters.byCategory.data.calls, 0);
    }
    h.counters.reset();
    assert.equal(payload(await h.rpc("tools/call", { name: "write_file", arguments: { path: "index.html", content: "new tab's draft" } })).state, "applied");
    assert.equal(drafts.get("index.html"), "new tab's draft");
    assert.equal(h.counters.byCategory.auth.calls, 3);
    assert.equal(h.counters.byCategory.control.calls, 1);
    assert.equal(h.counters.byCategory.data.calls, 0);
    assert.equal(Object.values(h.counters.byCategory).reduce((sum, count) => sum + count.keysWritten, 0), 0);
    const stored = await h.storage(h.hubName).list();
    assert.deepEqual([...stored.keys()], ["alarm-deadlines", "session"]);
    assert.deepEqual((stored.get("session") as AgentHub).commands, commands);
  } finally { await h.worker.dispose(); }
});


test("matching legacy content never enables a fallback for any MCP tool family", async () => {
  const h = await connected();
  try {
    const storage = h.storage(h.hubName), hub = (await storage.get<AgentHub>("session"))!;
    await storage.put({ session: { ...hub, context: await siteContext(), updatedAt: Date.now(), commands: [{ id: "legacy", state: "applied" }] },
      context: await siteContext(), requests: [{ id: "req-legacy", state: "open", branch: "main", repoId: repo.id }] });
    for (const [name, args] of [
      ["get_site", {}], ["read_file", { path: "index.html" }], ["write_file", { path: "new.txt", content: "new" }],
      ["adding_settings", {}], ["get_command_status", { requestId: "legacy" }], ["wait_for_requests", {}],
      ["get_selection", { request: "req-legacy" }], ["reply_to_request", { request: "req-legacy", status: "done", message: "Done." }],
    ] as const) {
      h.counters.reset();
      const result = await h.rpc("tools/call", { name, arguments: args });
      // get_site and the quiet wait (ticket 18) answer without an error; the rest refuse.
      const quiet = name === "get_site" || name === "wait_for_requests";
      assert.equal(Boolean(result.isError), !quiet, name);
      if (name === "wait_for_requests") assert.deepEqual(payload(result).requests, []);
      assert.match(JSON.stringify(name === "get_site" ? payload(result).note : name === "wait_for_requests" ? payload(result).hint : payload(result)),
        name === "wait_for_requests" ? /The editor isn't open/ : /The editor isn't open/);
      assert.equal(h.counters.byCategory.auth.calls, 3);
      assert.equal(h.counters.byCategory.control.calls, 1);
      assert.equal(h.counters.byCategory.data.calls, 0);
      assert.equal(h.counters.waitedMs, 0);
      assert.ok(!h.counters.readKeys.some(key => /^(context|draft:|drafts|requests)/.test(key)));
      assert.equal(Object.values(h.counters.byCategory).reduce((sum, count) => sum + count.keysWritten + count.keysDeleted, 0), 0);
    }
  } finally { await h.worker.dispose(); }
});
