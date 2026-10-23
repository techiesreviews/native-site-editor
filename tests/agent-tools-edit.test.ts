import assert from "node:assert/strict";
import { test } from "node:test";
import { textHash, type AgentCommand } from "../shared/agent";
import { payloadIdentity, type JsonValue } from "../shared/agent-command";
import type { AgentEdit, AgentEditArgsMap, AgentEditTool } from "../shared/agent-edit";
import { prepareAgentEdit } from "../shared/agent-edit";
import type { AgentReadResult } from "../shared/agent-read";
import { SiteFiles } from "../shared/site-files";
import type { Snapshot, TreeEntry } from "../shared/types";
import { createAgentEditTools } from "../src/agent-tools-edit";
import { agentCommandFiles } from "../src/agent-tools";
import { agentFileReader, type AgentReadPorts } from "../src/agent-tools-read";
import { AgentRecordsError, indexedDbAgentRecords } from "../src/agent-records";
import { applySiteCommand, atomicAgentCommand, prepareAgentText, type AgentSiteActions } from "../src/agent-site";
import { createGuardedEdits, type EditorWorkspace } from "../src/guarded-edit";
import type { AgentTextCommit } from "../src/editor-workspace";
import { DraftStore, draftDatabaseName, indexedDbDrafts, draftKey } from "../src/drafts";
import { relayObjectName, type RelaySocket } from "../worker/agent-relay";
import { countedSocket, startCountedWorker } from "./fakes/counted-agent";
import { createMemoryWorkspace, deferred } from "./fakes/memory-workspace";
import { forEachAwait } from "./support/await-race";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb";
import { commit, editorTab, files, origin, payload, repo, signIn, siteContext } from "./mcp-harness";

const workspace = { account: "lex", repoId: repo.id, branch: "main" };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;
const request = <K extends AgentEditTool>(tool: K, args: AgentEditArgsMap[K], id = "edit-1"): AgentEdit =>
  ({ operation: "edit", tool, args, id, grantId: "grant", generation: 1, createdAt: Date.now() }) as AgentEdit;
function body(result: AgentReadResult) {
  assert.equal(result.ok, true, JSON.stringify(result));
  return payload({ content: [{ text: JSON.stringify(result.ok ? result.value : null) }] });
}
async function fixture() {
  const context = await siteContext(), texts = new Map<string, string>();
  const contents = new Map<string, string>();
  const tree: TreeEntry[] = Object.entries(files).map(([path, content], i) => {
    const sha = String(i).padStart(40, "0"); contents.set(sha, content);
    return { path, sha, type: "blob", mode: "100644", size: content.length };
  });
  const snapshot: Snapshot = { branch: "main", commit, entries: tree, tree };
  let valid = true, contexts = 0, history = 0, reads = 0;
  const ports = {
    stamp: () => ({ holds: () => valid, changed: () => undefined }),
    context: async () => { contexts++; return { context, texts }; },
    files: () => ({ repo, snapshot, api: async <T>() => ({ entries: tree }) as T,
      read: async (_repo: string, sha: string) => { reads++; return contents.get(sha)!; },
      batch: async () => Object.fromEntries(contents), has: () => true }),
  } satisfies AgentReadPorts;
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords("edit-tools", fake.factory);
  const scope = { ...workspace, repo: repo.full_name };
  const commands: AgentCommand[] = [];
  let hold: Promise<void> | undefined;
  const tools = createAgentEditTools({ workspace, records, ports, run: async command => {
    commands.push(command);
    if (hold) await hold;
    const state = await records.workspace(workspace);
    const outcome = { message: "Applied once.", result: { path: command.path, hash: await textHash(command.content) } };
    const draft = { ...scope, version: 1 as const, path: command.path, baseSha: null, content: command.content, original: "", updatedAt: Date.now() };
    const key = draftKey(scope, command.path);
    const result = await records.commit({ workspace, fence: command.ownerGeneration!, expectedRevision: state.revision,
      expectedDrafts: [[key, null]], drafts: [[key, draft]], receipt: { operationId: command.id, authorizationId: command.grantId!,
        payloadIdentity: command.requestIdentity!, outcome, createdAt: Date.now(), issuedAt: command.createdAt } });
    if (!result.duplicate) {
      history++;
      context.drafts.push({ path: command.path, baseSha: null, content: command.content, hash: await textHash(command.content), updatedAt: Date.now() });
    }
    return result.receipt.outcome as typeof outcome;
  } });
  const local = () => new SiteFiles(agentFileReader(ports.files(), context), repo, context, async hash => texts.get(hash));
  return { context, texts, snapshot, ports, records, fake, tools, commands, local, stale: () => { valid = false; },
    hold: (pending: Promise<void>) => { hold = pending; }, counts: () => ({ contexts, history, reads }),
    run: (input: AgentEdit) => tools.run(input, 0, () => true) };
}

test("every migrated tool prepares the existing command shape from the browser's drafts", async () => {
  const f = await fixture(), hash = f.context.site!.outlines[0].hash;
  const cases: [AgentEdit, object][] = [
    [request("edit_file", { path: "index.html", expectedHash: hash, edits: [{ oldText: "Welcome", newText: "Hello" }] }), { operation: "write_file", input: { path: "index.html", expectedHash: hash } }],
    [request("write_file", { path: "fresh.txt", content: "fresh" }), { operation: "write_file", input: { path: "fresh.txt", content: "fresh", expectedHash: null } }],
    [request("move_file", { path: "about", to: "company", keepOldUrl: false }), { operation: "move_file", input: { path: "about", args: { to: "company", keepOldUrl: false } } }],
    [request("delete_file", { path: "about" }), { operation: "delete_file", input: { path: "about" } }],
    [request("create_page", { title: "Work", parent: "about", slug: "work" }), { operation: "create_page", input: { path: "about", args: { parent: "/about/", title: "Work", slug: "work" } } }],
    [request("set_page_details", { page: "/about/", title: "Studio", description: "" }), { operation: "set_page_details", input: { path: "about/index.html", args: { title: "Studio", description: "" } } }],
    [request("open_page", { page: "/about/" }), { operation: "open_page", input: { path: "about/index.html" } }],
    [request("inspect_preview", { selector: "h1", limit: 2 }), { operation: "inspect_preview", input: { path: "index.html", args: { selector: "h1", limit: 2 } } }],
    [request("make_component", { page: "/", element: "1.0", tag: "hero-block", fixed: ["title"], expectedHash: hash }), { operation: "make_component", input: { path: "index.html", expectedHash: hash, args: { element: "1.0", tag: "hero-block", fixed: ["title"] } } }],
    [request("add_section", { page: "/", component: "feature-block", after: "1.0", expectedHash: hash }), { operation: "add_section", input: { path: "index.html", expectedHash: hash, args: { component: "feature-block", container: "1", index: 1 } } }],
    [request("move_section", { page: "/", section: "1.0", after: "1.1", expectedHash: hash }), { operation: "move_section", input: { path: "index.html", expectedHash: hash, args: { section: "1.0", tag: "section", container: "1", index: 2 } } }],
    [request("remove_section", { page: "/", section: "1.0", expectedHash: hash }), { operation: "remove_section", input: { path: "index.html", expectedHash: hash, args: { section: "1.0", tag: "section" } } }],
  ];
  for (const [input, expected] of cases) {
    const prepared = await prepareAgentEdit(input, f.context, f.local());
    assert.partialDeepStrictEqual(prepared, expected, input.tool);
  }
  const draft = f.context.drafts[0];
  const prepared = await prepareAgentEdit(request("edit_file", { path: draft.path, expectedHash: draft.hash!, edits: [{ oldText: "About the studio", newText: "Browser draft" }] }), f.context, f.local());
  assert.ok("operation" in prepared && prepared.input.content?.includes("Browser draft"));
});

test("hash, unchanged, protected paths, content, folders and parent files retain their contracts", async () => {
  const f = await fixture(), hash = f.context.site!.outlines[0].hash;
  const prepare = (input: AgentEdit) => prepareAgentEdit(input, f.context, f.local());
  for (const input of [request("edit_file", { path: "index.html", expectedHash: "0".repeat(64), edits: [{ oldText: "Welcome", newText: "Hello" }] }),
    request("write_file", { path: "index.html", content: "text", expectedHash: "0".repeat(64) })])
    await assert.rejects(prepare(input), /changed since you read it/);
  assert.partialDeepStrictEqual(await prepare(request("edit_file", { path: "index.html", expectedHash: hash, edits: [{ oldText: "Welcome", newText: "Welcome" }] })), { unchanged: { state: "unchanged", message: "The edits change nothing." } });
  assert.partialDeepStrictEqual(await prepare(request("write_file", { path: "index.html", content: files["index.html"], expectedHash: hash })), { unchanged: { message: "The file already has this text." } });
  for (const path of [".github/workflows/ci.yml", ".editor/media.json", "../secret"])
    for (const tool of ["write_file", "edit_file", "move_file", "delete_file"] as const) {
      const input = tool === "write_file" ? request(tool, { path, content: "x" }) : tool === "edit_file" ? request(tool, { path, expectedHash: hash, edits: [{ oldText: "x", newText: "y" }] })
        : tool === "move_file" ? request(tool, { path, to: "ok.txt" }) : request(tool, { path });
      await assert.rejects(prepare(input), /GitHub|media|path|repository/i);
    }
  await assert.rejects(prepare(request("write_file", { path: "media/x.png", content: "x" })), /media|upload/i);
  await assert.rejects(prepare(request("write_file", { path: "fresh.txt", content: "\0" })), /text files/);
  await assert.rejects(prepare(request("write_file", { path: "index.html/child.txt", content: "x" })), /index.html is a file/);
  f.snapshot.tree!.push({ path: "folder", type: "tree", mode: "040000", sha: "f".repeat(40) });
  await assert.rejects(prepare(request("write_file", { path: "folder", content: "x" })), /folder/);
  await assert.rejects(prepare(request("write_file", { path: "index.html", content: "x" })), /exists.*expectedHash/);
  await assert.rejects(prepare(request("write_file", { path: "missing.txt", content: "x", expectedHash: hash })), /does not exist/);
  await assert.rejects(prepare(request("edit_file", { path: "missing.txt", expectedHash: hash, edits: [{ oldText: "x", newText: "y" }] })), /does not exist/);
  await assert.rejects(prepare(request("edit_file", { path: "index.html", expectedHash: hash, edits: [{ oldText: "absent", newText: "y" }] })), /not found|does not appear/i);
});

test("page, section, component and placement refusals keep their messages", async () => {
  const f = await fixture(), hash = f.context.site!.outlines[0].hash;
  const prepare = (input: AgentEdit) => prepareAgentEdit(input, f.context, f.local());
  const cases: [AgentEdit, RegExp][] = [
    [request("set_page_details", { page: "/absent", title: "x" }), /No page/],
    [request("create_page", { title: "x", parent: "/absent/" }), /No page/],
    [request("set_page_details", { page: "/" }), /Give a title/],
    [request("make_component", { page: "/", element: "1.0", tag: "feature-block", expectedHash: hash }), /already/],
    [request("make_component", { page: "/", element: "1", tag: "new-block", expectedHash: hash }), /main.*cannot/],
    [request("make_component", { page: "/", element: "1.1", tag: "new-block", expectedHash: hash }), /component already/],
    [request("add_section", { page: "/", component: "absent-block", expectedHash: hash }), /No component/],
    [request("add_section", { page: "/", component: "site-header", expectedHash: hash }), /not a section/],
    [request("add_section", { page: "/", component: "feature-block", before: "1.0", after: "1.1", expectedHash: hash }), /not both/],
    [request("add_section", { page: "/", component: "feature-block", before: "8.0", expectedHash: hash }), /No section/],
    [request("move_section", { page: "/", section: "1.0", expectedHash: hash }), /Say before or after/],
    [request("move_section", { page: "/", section: "1.9", before: "1.0", expectedHash: hash }), /No section/],
    [request("remove_section", { page: "/", section: "1.9", expectedHash: hash }), /No section/],
    [request("remove_section", { page: "/", section: "1.0", expectedHash: "0".repeat(64) }), /changed since/],
  ];
  for (const [input, message] of cases) await assert.rejects(prepare(input), message, input.tool);
  f.context.site!.outlines[0].sections.push({ id: "2.0", tag: "section" });
  await assert.rejects(prepare(request("move_section", { page: "/", section: "2.0", before: "1.0", expectedHash: hash })), /siblings only/);
  f.context.site!.outlines[0].containers.push({ id: "2", tag: "main", children: 1 });
  await assert.rejects(prepare(request("add_section", { page: "/", component: "feature-block", expectedHash: hash })), /several places/);
  f.context.site!.outlines[0].containers = [];
  await assert.rejects(prepare(request("add_section", { page: "/", component: "feature-block", expectedHash: hash })), /no place for sections/);
});

test("duplicate edit_file joins in flight and returns the receipt before re-reading a changed hash", async () => {
  const f = await fixture(), hold = deferred<void>();
  f.hold(hold.promise);
  const input = request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Hello" }] });
  const first = f.run(input), second = f.run(input);
  hold.resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(body(a).state, "applied"); assert.deepEqual(a, b);
  const counts = f.counts();
  assert.deepEqual(await f.run({ ...input, createdAt: Date.now() + 1 }), a);
  assert.deepEqual(f.counts(), counts, "receipt lookup must precede context and file reads");
  assert.equal(f.commands.length, 1); assert.equal(f.counts().history, 1);
  assert.equal(f.fake.stores.get("drafts")!.size, 1);
  const reuse = await f.run(request("write_file", { path: "index.html", content: "different" }, input.id));
  assert.equal(reuse.ok, false);
  assert.match(!reuse.ok ? reuse.message : "", /different work/);
  const receipt = await f.records.receipt(workspace, input.id, input.grantId);
  assert.equal(receipt?.payloadIdentity, await textHash(payloadIdentity(json({ tool: input.tool, args: input.args, branch: "main" }))));
  assert.ok(!JSON.stringify(receipt).includes("<!doctype"), "receipts never duplicate file contents");
  assert.deepEqual(await f.tools.run({ operation: "status", id: input.id, grantId: input.grantId }, 0, () => true), a);
  assert.equal(body(await f.tools.run({ operation: "status", id: "missing", grantId: input.grantId }, 0, () => true)).state, "unknown");
  await f.records.revoke(workspace, input.grantId);
  assert.match(body(await f.tools.run({ operation: "status", id: input.id, grantId: input.grantId }, 0, () => true)).message, /revoked/);
});

test("unchanged edits record a fenced receipt that reserves their id; stale preparation and unknown persistence never run again", async () => {
  const f = await fixture();
  const input = request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Welcome" }] });
  const first = await f.run(input);
  assert.equal(body(first).state, "unchanged");
  assert.deepEqual(await f.run(input), first);
  assert.equal(f.commands.length, 0);
  assert.ok(await f.records.receipt(workspace, input.id, input.grantId));
  assert.equal(f.fake.stores.get("drafts")?.size ?? 0, 0);
  // The id stays reserved: different work, another grant, or a new tools instance over the same records is refused.
  const reuse = request("delete_file", { path: "index.html" }, input.id);
  assert.match(String(JSON.stringify(await f.run(reuse))), /already used for different work/);
  assert.match(String(JSON.stringify(await f.run({ ...input, grantId: "other-grant" }))), /authorization differs/i);
  const again = createAgentEditTools({ workspace, ports: f.ports, records: f.records, run: async () => assert.fail("must not run") });
  assert.match(String(JSON.stringify(await again.run(reuse, 0, () => true))), /already used for different work/);
  assert.deepEqual(await again.run(input, 0, () => true), first);
  assert.equal(f.commands.length, 0);
  // The revision proof comes from before preparation: an agent commit landing meanwhile refuses the unchanged receipt.
  const g = await fixture();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const inContext = new Promise<void>(resolve => { entered = resolve; });
  const held = createAgentEditTools({ workspace, records: g.records, run: async () => assert.fail("must not run"),
    ports: { ...g.ports, context: async () => { entered(); await gate; return g.ports.context(); } } });
  const pending = held.run(request("edit_file", input.args, "held-unchanged"), 0, () => true);
  // Preparation has read its revision proof and waits in context(): the agent commit lands after the proof.
  await inContext;
  assert.equal(body(await g.run(request("write_file", { path: "meanwhile.txt", content: "agent" }, "meanwhile"))).state, "applied");
  release();
  assert.notEqual(body(await pending).state, "unchanged");
  assert.equal(await g.records.receipt(workspace, "held-unchanged", "grant"), undefined);
  f.stale();
  assert.equal(body(await f.run(request("delete_file", { path: "index.html" }, "stale"))).state, "conflict");
  const fresh = await fixture();
  const unknown = createAgentEditTools({ workspace, ports: fresh.ports,
    records: { ...fresh.records, receipt: async () => { throw new AgentRecordsError("unknown", "The outcome is unknown."); } }, run: async () => assert.fail("must not run") });
  const result = body(await unknown.run(input, 0, () => true));
  assert.equal(result.state, "unknown"); assert.match(result.message, /get_command_status/);
});

async function connected() {
  const h = await startCountedWorker(), { cookie } = await signIn(h.worker), tab = editorTab(h.worker, cookie);
  const { token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" })).json() as { token: string };
  const rpc = async (name: string, args: object, method = "tools/call") => {
    const response = await h.worker.dispatchFetch(origin + "/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}`,
      "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: method === "tools/call" ? { name, arguments: args } : args }) });
    const responseText = await response.text();
    const value = JSON.parse(responseText.startsWith("event:") ? responseText.split("data: ")[1].split("\n")[0] : responseText) as { result: unknown; error?: unknown };
    assert.equal(value.error, undefined); return value.result;
  };
  // Mark the grant used so the measured edit has only the three retained authentication calls.
  await rpc("", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "edit-test", version: "1" } }, "initialize");
  return { ...h, tab, rpc };
}

test("already-authorized edit and duplicate: 3 auth + 1 real relay dispatch, 0 result polls, 0 server draft fetches", async t => {
  const h = await connected(), browser = await fixture();
  await browser.records.setFence(workspace, 0, 1);
  const scope = { workspace, tabId: "owner-tab", generation: 1 }, name = await relayObjectName(workspace);
  const traffic = countedSocket();
  let attachment: unknown = { ...scope, role: "editor", owner: { tabId: scope.tabId, generation: 1 } };
  const editor = {
    readyState: 1, close() {}, serializeAttachment(value: unknown) { attachment = value; }, deserializeAttachment: () => attachment,
    send(message: string) {
      traffic.send(message);
      const value = JSON.parse(message);
      if (value.type !== "command") return;
      void browser.tools.run(value.command, 1, () => true).then(result => {
        const reply = JSON.stringify({ type: "result", id: value.id, ...scope, result });
        traffic.receive(reply); h.message(name, editor, reply);
      });
    },
  } satisfies RelaySocket;
  try {
    h.attach(name, editor, JSON.stringify({ type: "handshake", ...scope, owner: true }));
    await h.settle(name);
    const args = { path: "index.html", expectedHash: browser.context.site!.outlines[0].hash,
      edits: [{ oldText: "Welcome", newText: "Hello over relay" }], requestId: "measured-edit", waitSeconds: 0 };
    let first: unknown;
    for (const [tool, argsForTool] of [["edit_file", args], ["edit_file", args], ["get_command_status", { requestId: args.requestId }]] as const) {
      h.counters.reset(); h.github.requests.length = 0;
      const result = await h.rpc(tool, argsForTool);
      assert.equal(body({ ok: true, value: json(payload(result)) }).state, "applied", JSON.stringify(result));
      if (!first) first = result; else assert.deepEqual(result, first);
      assert.equal(h.counters.byCategory.auth.calls, 3);
      assert.equal(h.counters.byCategory.control.calls, 1);
      assert.equal(h.counters.byCategory.data.calls, 0);
      assert.equal(h.counters.log.length, 4);
      assert.equal(h.counters.waitedMs, 0);
      assert.equal(h.counters.readKeys.some(key => key.startsWith("draft:")), false);
      assert.equal(h.github.requests.length, 0);
    }
    assert.equal(browser.commands.length, 1); assert.equal(browser.counts().history, 1);
    assert.equal(browser.fake.stores.get("drafts")!.size, 1);
    t.diagnostic("call counts: auth=3 dispatch=1 resultPolls=0 serverDraftFetches=0; duplicates: draft=1 history=1");
  } finally { await h.worker.dispose(); }
});

test("no legacy edit fallback, even with matching context; timeout/lost never retries", async () => {
  const h = await connected(), get = h.namespace.get;
  try {
    h.counters.reset();
    assert.match(JSON.stringify(payload(await h.rpc("write_file", { path: "new.txt", content: "x" }))), /The editor isn't open/);
    assert.equal(h.counters.log.length, 4); assert.equal(h.counters.waitedMs, 0);
    const context = await siteContext();
    context.branch = "other";
    await h.storage(h.counters.log.find(row => row.name.startsWith("agent-hub:"))!.name).put("context", context);
    h.counters.reset();
    assert.match(JSON.stringify(payload(await h.rpc("write_file", { path: "new.txt", content: "x" }))), /The editor isn't open/);
    assert.equal(h.counters.log.length, 4); assert.equal(h.counters.waitedMs, 0);
    context.branch = "main";
    await h.storage(h.counters.log.find(row => row.name.startsWith("agent-hub:"))!.name).put("context", context);
    const legacy = payload(await h.rpc("write_file", { path: "new.txt", content: "x", waitSeconds: 0 }));
    assert.match(JSON.stringify(legacy), /The editor isn't open/);
    assert.match(JSON.stringify(payload(await h.rpc("get_command_status", { requestId: "legacy" }))), /The editor isn't open/);
    let dispatches = 0;
    for (const code of ["timeout", "unknown-outcome", "busy", "too-large", "cancelled", "lost"]) {
      h.namespace.get = name => String(name).startsWith("agent-relay:") ? { fetch: async () => {
        dispatches++; if (code === "lost") throw new Error("lost socket");
        return Response.json({ ok: false, code });
      } } : get(name);
      h.counters.reset();
      const before = dispatches;
      const result = payload(await h.rpc("write_file", { path: "new.txt", content: "x", requestId: "unknown" }));
      assert.equal(result.state, "unknown"); assert.match(result.message, /get_command_status.*do not replay/);
      assert.equal(dispatches - before, 1); assert.equal(h.counters.byCategory.data.calls, 0); assert.equal(h.counters.waitedMs, 0);
    }
    // A command the relay proves it never sent (busy, too large, expired before delivery) is no unknown outcome.
    for (const code of ["busy", "too-large", "timeout"]) {
      h.namespace.get = name => String(name).startsWith("agent-relay:") ? { fetch: async () => {
        dispatches++; return Response.json({ ok: false, code, outcome: "not-sent" });
      } } : get(name);
      const before = dispatches;
      const result = payload(await h.rpc("write_file", { path: "new.txt", content: "x", requestId: "unsent" }));
      assert.equal(result.state, "failed"); assert.match(result.message, /did not receive.*Nothing was changed/);
      assert.equal(dispatches - before, 1);
    }
  } finally { h.namespace.get = get; await h.worker.dispose(); }
});

for (const operation of ["update_active_draft", "create_file_draft"] as const) test(`${operation} commits drafts and receipt together; duplicates never add an Undo step`, async t => {
  const fake = fakeIndexedDB();
  for (const [name, value] of Object.entries({ indexedDB: fake.factory, IDBKeyRange: { bound: (lower: string, upper: string) => ({ lower, upper }) } })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  }
  const scope = { account: operation, repoId: 1, repo: "lex/site", branch: "main" };
  const store = new DraftStore({ getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 }, indexedDbDrafts(draftDatabaseName, fake.factory));
  await store.load(scope.account);
  const memory = createMemoryWorkspace({ branch: { "index.html": "before" }, open: "index.html" });
  const source = (path: string) => store.get(scope, path)?.content ?? memory.workspace.source(path);
  let context: AgentTextCommit | undefined;
  const workspace: EditorWorkspace = { ...memory.workspace, store, draftScope: () => scope, source,
    mountedSource: source, agentText: () => context, agentActing: () => true,
    branchText: async path => path === "index.html" ? { text: "before", sha: "a".repeat(40) } : undefined };
  const edits = createGuardedEdits(workspace);
  const command: AgentCommand = { id: "alias", operation, path: operation === "update_active_draft" ? "index.html" : "fresh.txt",
    content: "after", expectedHash: operation === "update_active_draft" ? await textHash("before") : null,
    branch: "main", commit, grantId: "grant", state: "pending", createdAt: Date.now() };
  assert.equal(atomicAgentCommand(command), true);
  const run = async () => {
    const prepared = await prepareAgentText(command, scope, store, () => true, () => {});
    if (prepared.duplicate) return prepared.duplicate;
    context = prepared.context;
    // Only the text ports are used: legacy() must never receive these aliases.
    const actions = { text: async (path: string) => source(path), isMounted: (path: string) => path === "index.html",
      atomicText: () => true, legacy: async () => assert.fail("receiptless legacy path"),
      writeDraft: async (path: string, content: string, create: boolean) => {
        const result = await edits.run(r => { r.source(path); return create ? { creates: [{ path, content }], done: "Created", undone: "Undid" }
          : { edits: new Map([[path, content]]), done: "Changed", undone: "Undid", select: { historyOnly: true } }; });
        return result.ok ? undefined : result.message;
      },
    } satisfies Pick<AgentSiteActions, "text" | "isMounted" | "atomicText" | "legacy" | "writeDraft">;
    await applySiteCommand(actions as AgentSiteActions, command);
    await prepared.finish!(() => true);
    return prepared.outcome;
  };
  const first = await run();
  assert.deepEqual(await run(), first);
  assert.equal(source(command.path), "after");
  assert.equal(fake.stores.get("drafts")!.size, 1); assert.equal(fake.stores.get("receipts")!.size, 1);
  assert.equal(memory.steps().length, 1); assert.equal(memory.undo(), true); assert.equal(memory.undo(), false);
  t.after(() => store.flush());
});

test("in-flight identity includes authorization and refuses different work before preparation", async () => {
  const f = await fixture(), hold = deferred<void>(), entered = deferred<void>();
  f.hold(hold.promise);
  const context = f.ports.context;
  f.ports.context = async () => { const result = await context(); entered.resolve(); return result; };
  const input = request("write_file", { path: "fresh.txt", content: "first" });
  const first = f.run(input);
  await entered.promise;
  for (const different of [request("write_file", { path: "fresh.txt", content: "other" }), { ...input, grantId: "other-grant" }]) {
    const response = await f.run(different);
    assert.equal(response.ok, false); assert.match(!response.ok ? response.message : "", /different work or authorization/);
  }
  hold.resolve();
  assert.equal(body(await first).state, "applied"); assert.equal(f.counts().history, 1);
});

test("a changed revision at every preparation await never reaches the guarded executor", async () => {
  const points = await forEachAwait(race => {
    const state = { disturb: () => {}, writes: 0, done: Promise.resolve() };
    state.done = (async () => {
      const f = await fixture();
      state.disturb = () => { f.snapshot.commit = "different revision"; };
      const source = f.ports.files();
      const ports: AgentReadPorts = { ...f.ports, context: race.port("context", () => f.ports.context()),
        files: () => ({ ...source, read: race.port("file", (repo, sha) => source.read(repo, sha)) }) };
      const tools = createAgentEditTools({ workspace, ports,
        records: { ...f.records, receipt: race.port("receipt", (...args) => f.records.receipt(...args)) },
        run: async () => { state.writes++; return { message: "Applied." }; } });
      await tools.run(request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Hello" }] }), 0, () => true);
    })();
    return state;
  }, state => state.disturb(), state => assert.equal(state.writes, 0));
  assert.ok(points >= 3);
});

// The tools trust the guarded edit's repository stamp for the repository and branch (src/workspace-session.ts):
// a real one stops holding on a branch switch even when the commit stays the same.
test("a branch switch while an agent edit prepares stops the real repository stamp; nothing runs or is kept", async () => {
  const f = await fixture(), memory = createMemoryWorkspace({ branch: { "index.html": "before" } }), edits = createGuardedEdits(memory.workspace);
  const opened = deferred<void>(), gate = deferred<void>();
  const ports: AgentReadPorts = { ...f.ports, stamp: () => edits.stamp("repository"), context: async () => { opened.resolve(); await gate.promise; return f.ports.context(); } };
  let writes = 0;
  const tools = createAgentEditTools({ workspace, ports, records: f.records, run: async () => { writes++; return { message: "Applied." }; } });
  const input = request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Hello" }] });
  const reply = tools.run(input, 0, () => true);
  await opened.promise;
  memory.setScope("lex/site@dev");
  gate.resolve();
  assert.deepEqual(await reply, { ok: true, value: { requestId: input.id, state: "conflict", message: "The editor changed branch or revision. Read the site again." } });
  assert.equal(f.snapshot.commit, commit, "the commit stayed the same");
  assert.equal(writes, 0);
  assert.equal(await f.records.receipt(workspace, input.id, input.grantId), undefined);
});

// Ticket 23: with the host's pin (src/agent-site-host.ts), a switch while the edit prepares stops
// nothing: it is prepared from the workspace it arrived in and handed to the editor with those files.
test("a branch switch while a pinned agent edit prepares finishes it on the branch it arrived on", async () => {
  const f = await fixture(), memory = createMemoryWorkspace({ branch: { "index.html": "before" } }), edits = createGuardedEdits(memory.workspace);
  const opened = deferred<void>(), gate = deferred<void>(), shownContext = { ...f.context, branch: "dev" };
  let shown = f.context;
  const ports: AgentReadPorts = { ...f.ports, stamp: () => edits.stamp("repository"),
    // As the host's (src/agent-site-host.ts): the context shown, or none once a switch interrupted it.
    context: async () => { const at = edits.stamp("repository"); opened.resolve(); await gate.promise; return at.holds() ? { context: shown, texts: f.texts } : undefined; },
    pin: () => {
      const at = edits.stamp("repository"), own = f.context, away = () => at.changed() === "scope";
      return { away, context: async () => (away() ? undefined : await ports.context()) ?? (away() ? { context: own, texts: f.texts } : undefined) };
    } };
  const ran: AgentCommand[] = [];
  const tools = createAgentEditTools({ workspace, ports, records: f.records, run: async command => { ran.push(command); return { message: "Applied there." }; } });
  const input = request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Hello" }] });
  const reply = tools.run(input, 0, () => true);
  await opened.promise;
  memory.setScope("lex/site@dev"); shown = shownContext;
  gate.resolve();
  assert.equal(body(await reply).state, "applied");
  assert.equal(ran.length, 1);
  assert.equal(ran[0].branch, "main", "the branch it arrived on, not the one shown");
  assert.equal(agentCommandFiles.get(ran[0])?.snapshot, f.snapshot, "with the files it was read from");
});

test("a pinned agent edit whose branch is shown again (away and back) before it runs still applies", async () => {
  const f = await fixture(), memory = createMemoryWorkspace({ branch: { "index.html": "before" } }), edits = createGuardedEdits(memory.workspace);
  const opened = deferred<void>(), gate = deferred<void>();
  const ports: AgentReadPorts = { ...f.ports, stamp: () => edits.stamp("repository"),
    context: async () => { const at = edits.stamp("repository"); opened.resolve(); await gate.promise; return at.holds() ? { context: f.context, texts: f.texts } : undefined; },
    // As the host's (src/agent-site-host.ts): the one shown, read again when it was left and shown again.
    pin: () => {
      const at = edits.stamp("repository"), away = () => at.changed() === "scope";
      return { away, context: async () => (away() ? undefined : await ports.context()) ?? (away() ? { context: f.context, texts: f.texts } : ports.context()) };
    } };
  const ran: AgentCommand[] = [];
  const tools = createAgentEditTools({ workspace, ports, records: f.records, run: async command => { ran.push(command); return { message: "Applied here." }; } });
  const input = request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Hello" }] });
  // The current() src/components/agent-menu.ts hands over: a new load of its branch is no move; its revision holds.
  const arrived = edits.stamp("repository"), commit = f.ports.files().snapshot.commit;
  const reply = tools.run(input, 0, () => arrived.changed() === "scope" || f.ports.files().snapshot.commit === commit);
  await opened.promise;
  memory.setScope("lex/site@dev"); memory.setScope("lex/site@main"); memory.bumpGeneration();
  gate.resolve();
  assert.equal(body(await reply).state, "applied");
  assert.equal(ran.length, 1);
  assert.equal(ran[0].branch, "main");
});

// No pin could be taken as it arrived (nothing open then): it cannot finish elsewhere, so the stamp
// it arrived with must hold, even on a branch at the same commit (a branch just made from main).
test("an agent edit with no pin switched to a branch at the same commit while it prepares refuses", async () => {
  const f = await fixture(), memory = createMemoryWorkspace({ branch: { "index.html": "before" } }), edits = createGuardedEdits(memory.workspace);
  const opened = deferred<void>(), gate = deferred<void>();
  const ports: AgentReadPorts = { ...f.ports, stamp: () => edits.stamp("repository"), pin: () => undefined,
    context: async () => { opened.resolve(); await gate.promise; return { context: f.context, texts: f.texts }; } };
  let writes = 0;
  const tools = createAgentEditTools({ workspace, ports, records: f.records, run: async () => { writes++; return { message: "Applied." }; } });
  const input = request("edit_file", { path: "index.html", expectedHash: f.context.site!.outlines[0].hash, edits: [{ oldText: "Welcome", newText: "Hello" }] });
  const reply = tools.run(input, 0, () => true);
  await opened.promise;
  memory.setScope("lex/site@dev");
  gate.resolve();
  assert.deepEqual(await reply, { ok: true, value: { requestId: input.id, state: "conflict", message: "The editor changed branch or revision. Read the site again." } });
  assert.equal(f.snapshot.commit, commit, "the same commit");
  assert.equal(writes, 0);
});

test("a revision change after the executor committed still reports applied, never conflict", async () => {
  const f = await fixture();
  let live = true;
  const tools = createAgentEditTools({ workspace, ports: f.ports, records: f.records, run: async command => {
    const outcome = { message: "Applied once.", result: { path: command.path } };
    // The commit landed; the editor then moves to another revision (or the socket drops) before the reply.
    f.stale(); live = false;
    return outcome;
  } });
  const result = body(await tools.run(request("delete_file", { path: "index.html" }, "post-commit"), 0, () => live));
  assert.equal(result.state, "applied"); assert.equal(result.message, "Applied once.");
});

test("get_command_status never turns an undelivered lookup into a failed change", async () => {
  const h = await connected(), get = h.namespace.get;
  try {
    for (const outcome of ["not-sent", "unknown"]) {
      h.namespace.get = name => String(name).startsWith("agent-relay:")
        ? { fetch: async () => Response.json({ ok: false, code: "busy", outcome }) } : get(name);
      const result = payload(await h.rpc("get_command_status", { requestId: "lost-reply" }));
      assert.equal(result.state, "unknown"); assert.match(result.message, /do not replay/);
    }
  } finally { h.namespace.get = get; await h.worker.dispose(); }
});
