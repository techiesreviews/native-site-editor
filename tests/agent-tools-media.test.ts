import assert from "node:assert/strict";
import { test } from "node:test";
import { textHash, MEDIA_PREVIEW_LIMIT, type AgentCommand } from "../shared/agent";
import { payloadIdentity, type JsonValue } from "../shared/agent-command";
import { mediaChanges, mediaTools, type AgentMedia, type MediaTool } from "../shared/agent-media";
import type { AgentReadResult } from "../shared/agent-read";
import type { Snapshot } from "../shared/types";
import { createAgentMediaTools } from "../src/agent-tools-media";
import type { AgentRecords } from "../src/agent-records";
import { createAgentEditTools } from "../src/agent-tools-edit";
import { applySiteCommand, type AgentSiteActions } from "../src/agent-site";
import type { AgentReadPorts } from "../src/agent-tools-read";
import { createMediaController, type MediaControllerPorts } from "../src/controllers/media-controller";
import { applyAgentMedia } from "../src/agent-media-actions";
import { listWorkspaceMedia, isAgentMediaPath } from "../src/agent-media";
import { readSource } from "../src/page-builder/source-tree";
import { uploadKey } from "../src/uploads";
import { MEDIA_RECORDS_PATH } from "../shared/media-records";
import { relayObjectName, type RelaySocket } from "../worker/agent-relay";
import { startCountedWorker } from "./fakes/counted-agent";
import { deferred } from "./fakes/memory-workspace";
import { agentMediaStorage } from "./support/agent-media-workspace";
import { forEachAwait, type AwaitRace } from "./support/await-race";
import { commit, editorTab, origin, payload, repo, signIn, siteContext } from "./mcp-harness";

const workspace = { account: "lex", repoId: repo.id, branch: "main" };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;
const request = (tool: MediaTool, args: AgentCommand["args"] = {}, id = "media-1", path = ""): AgentMedia =>
  ({ operation: "media", tool, args: args!, path, id, grantId: "grant", createdAt: Date.now() });
function body(result: AgentReadResult) {
  assert.ok(result.ok, JSON.stringify(result));
  return payload({ content: [{ text: JSON.stringify(result.value) }] });
}
async function fixture(race?: AwaitRace) {
  const text = new Map([["index.html", '<!doctype html><html><head><title>Media</title></head><body><main><section><img src="/images/photo.svg" alt=""><video src="/media/film.mp4" controls></video></section></main></body></html>'],
    [MEDIA_RECORDS_PATH, JSON.stringify({ version: 2, collections: [], files: { "images/photo.svg": { description: { text: "Draft description", byAgent: true } } } })]]);
  const paths = [...text.keys(), "images/photo.svg", "media/film.mp4", "files/menu.pdf", "styles/media-player.css", "scripts/media-player.js", "scripts/media-online.js"];
  const bytes = new Map([["images/photo.svg", new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20"></svg>'], { type: "image/svg+xml" })],
    ["media/film.mp4", new Blob(["video"])]]);
  const storage = agentMediaStorage({ ...workspace, repo: repo.full_name });
  await storage.ready;
  let valid = true, runs = 0, hold: Promise<void> | undefined;
  const history: (() => void)[] = [];
  const snapshot: Snapshot = { branch: "main", commit, entries: [] };
  const context = await siteContext();
  const toolsPorts = { stamp: () => ({ holds: () => valid, changed: () => undefined }),
    context: async () => ({ context, texts: new Map<string, string>() }),
    files: () => ({ repo, snapshot, api: async <T>() => ({ entries: [] }) as T, read: async () => "", batch: async () => ({}), has: () => false }),
  } satisfies AgentReadPorts;
  const ports = {
    workspace: () => ({ repo: repo.full_name, scope: { ...workspace, repo: repo.full_name }, identity: "site", site: { routes: { "/": "index.html" }, components: {} }, nativePaths: paths, drafts: storage.store }),
    identity: () => "site", stamp: toolsPorts.stamp, generation: () => 1,
    source: path => text.get(path), listPaths: async () => [...paths],
    entry: path => paths.includes(path) ? { sha: path } : undefined,
    findEntry: async path => paths.includes(path) ? { sha: path } : undefined,
    readText: async (_repo, sha) => text.get(sha) ?? "", rememberSource: (path, source) => { text.set(path, source); },
    uploadedBlob: (scope, sha) => storage.uploads.get(uploadKey(scope, sha)), readBlob: async (_repo, _sha, path) => bytes.get(path)!,
    applyBatch: async (_scope, _stamp, batch) => {
      const ctx = await controller.workspaceContext(isAgentMediaPath);
      await storage.apply(ctx, batch, { text, bytes, paths: () => paths, setPaths: value => { paths.splice(0, paths.length, ...value); }, version: path => ctx.assetVersion(path), history });
    },
    openPage: async () => {}, load: async () => { throw new Error("No picker in tool tests"); }, openFile: () => "index.html", viewingVersion: () => false,
    restoreFile: async () => {}, change: () => { throw new Error("A media write escaped staging"); },
    locateElement: (source, node) => { const tree = readSource(source, { page: true }), element = tree.at(node); return element && tree.range(element); },
    galleryHost: () => { throw new Error("No gallery"); }, galleryVisible: () => false, mediaSelected: () => false, gallerySignature: () => "",
    refreshDescriptions() {}, announce() {}, error(error) { throw error; },
  } satisfies MediaControllerPorts;
  const controller = createMediaController(ports, () => import("../src/controllers/media-actions"));
  const rawContext = controller.workspaceContext.bind(controller);
  controller.workspaceContext = async (...args) => storage.context(await rawContext(...args));
  let committed = false;
  const records: AgentRecords = race ? { ...storage.records, receipt: (...args) => committed ? storage.records.receipt(...args) : race.port("receipt", (...args: Parameters<typeof storage.records.receipt>) => storage.records.receipt(...args))(...args),
    commit: async command => { const result = await storage.records.commit(command); committed = true; return result; },
    workspace: race.port("workspace", (...args) => storage.records.workspace(...args)) } : storage.records;
  const run = async (command: AgentCommand): Promise<void | { message?: string; result?: AgentCommand["result"] }> => {
    runs++;
    if (hold) await hold;
    const ctx = await controller.workspaceContext(isAgentMediaPath);
    ctx.agentRecords = records;
    if (race) { const read = ctx.read.bind(ctx); ctx.read = race.port("read", path => read(path)); }
    if (command.operation === "list_media") return { result: { report: await listWorkspaceMedia(ctx, { ...command.args, offset: command.args?.offset ?? 0, limit: command.args?.limit ?? 100 }) } };
    if (command.operation === "preview_media") return { result: { data: "UklGRg==", mimeType: "image/webp", width: 30, height: 20, originalWidth: 30, originalHeight: 20 } };
    return applyAgentMedia(ctx, command, () => { throw new Error("Unstaged placement"); },
      target => controller.prepareFrame(target), undefined, undefined, undefined, undefined, ports);
  };
  const tools = createAgentMediaTools({ workspace, ports: toolsPorts, records, run });
  const status = createAgentEditTools({ workspace, ports: toolsPorts, records, run });
  return { tools, status, text, paths, bytes, storage, records, snapshot, controller, ports, history,
    run: (input: AgentMedia) => tools.run(input, 0, () => valid), hold: (value: Promise<void>) => { hold = value; },
    stale: () => { valid = false; snapshot.commit = "changed"; }, counts: () => ({ runs, history: history.length }) };
}

test("registry covers every media tool; read forms return browser draft reports without receipts", async () => {
  const f = await fixture();
  assert.equal(mediaTools.length, 15);
  const reads = [request("list_media", { offset: 0, limit: 1 }), request("preview_media", {}, "preview", "images/photo.svg"),
    request("restore_media"), request("adding_settings"), request("frame_image", { element: "0.0.0" }, "frame", "index.html"),
    request("loop_video", { element: "0.0.1" }, "loop", "index.html")];
  for (const read of reads) {
    assert.equal(mediaChanges(read.tool, read.args), false);
    const result = body(await f.run(read));
    assert.equal(result.state, "applied");
    if (read.tool === "list_media") {
      const report = JSON.parse(result.result.report);
      assert.equal(report.count, 1); assert.equal(report.nextOffset, 1); assert.equal(report.total, 3);
    }
    if (read.tool === "preview_media") { assert.equal(result.result.width, 30); assert.ok(result.result.data.length <= MEDIA_PREVIEW_LIMIT); }
    if (read.tool === "frame_image") assert.equal(JSON.parse(result.result.report).file, "images/photo.svg");
    if (read.tool === "loop_video") assert.equal(JSON.parse(result.result.report).looping, false);
  }
  assert.equal(f.storage.fake.stores.get("receipts")?.size ?? 0, 0);
  assert.equal(f.storage.store.list({ ...workspace, repo: repo.full_name }).length, 0);
  assert.equal((await f.tools.run({ ...reads[0], tool: "absent" as MediaTool }, 0, () => true)).ok, false);
});

test("read-only looping never navigates; Recently removed reads never sweep browser copies", async () => {
  const f = await fixture();
  const actions = {
    text: async () => '<video src="media/film.mp4"></video>',
    open: async () => { assert.fail("A read must not navigate"); },
    media: async () => ({ message: "Looping video read.", result: { report: '{"looping":false}' } }),
  } satisfies Pick<AgentSiteActions, "text" | "open" | "media">;
  const partial = <T>(value: Partial<T>): T => value as T;
  await applySiteCommand(partial<AgentSiteActions>(actions), { id: "read", operation: "loop_video", args: { element: "0" }, path: "other.html",
    branch: "main", commit, content: "", state: "pending", createdAt: Date.now() });
  const context = await f.controller.workspaceContext();
  let copyWrites = 0, sweeps = 0;
  context.removedCopies = { get: async () => undefined, put: async () => { copyWrites++; },
    delete: async () => { copyWrites++; }, keys: async () => { sweeps++; return []; } };
  await applyAgentMedia(context, { id: "removed", operation: "restore_media", args: {}, path: "", branch: "main", commit,
    content: "", state: "pending", createdAt: Date.now() }, () => { throw new Error("No placement"); });
  assert.equal(copyWrites, 0); assert.equal(sweeps, 0);
});

test("media duplicate joins one run, returns the receipt before preparation, and refuses id/authorization reuse", async () => {
  const f = await fixture(), hold = deferred<void>();
  f.hold(hold.promise);
  const input = request("adding_settings", { image: "smaller" });
  const first = f.run(input), duplicate = f.run(input);
  hold.resolve();
  const a = await first;
  assert.equal(body(a).state, "applied"); assert.deepEqual(await duplicate, a);
  assert.deepEqual(f.counts(), { runs: 1, history: 1 });
  assert.deepEqual(await f.run(input), a); assert.equal(f.counts().runs, 1);
  const receipt = await f.records.receipt(workspace, input.id, input.grantId);
  assert.equal(receipt?.payloadIdentity, await textHash(payloadIdentity(json({ tool: input.tool, args: { path: "", ...input.args }, branch: "main" }))));
  assert.match(JSON.stringify(await f.run({ ...input, args: { image: "smallest" } })), /different work/);
  assert.match(JSON.stringify(await f.run({ ...input, grantId: "another-grant" })), /authorization|another|different/);
  assert.deepEqual(await f.status.run({ operation: "status", id: input.id, grantId: input.grantId }, 0, () => true), a);
  assert.equal(f.storage.fake.stores.get("receipts")!.size, 1);
});

for (const [tool, args] of [["frame_image", { element: "0.0.0", shape: "square" }], ["loop_video", { element: "0.0.1", looping: true }],
  ["place_media", { element: "0.0", file: "media/film.mp4" }]] as const) test(`${tool} commits the page and one receipt, once`, async () => {
  const f = await fixture(), before = f.text.get("index.html");
  const input = request(tool, args, tool, "index.html");
  const first = await f.run(input);
  assert.equal(body(first).state, "applied", JSON.stringify(first)); assert.notEqual(f.text.get("index.html"), before);
  assert.equal(f.storage.fake.stores.get("receipts")!.size, 1); assert.equal(f.history.length, 1);
  assert.deepEqual(await f.run(input), first); assert.equal(f.history.length, 1);
  assert.ok((await f.records.snapshot(workspace)).drafts.some(([, draft]) => draft.path === "index.html"));
});

test("deadline and cancellation before commit leave drafts unchanged", async t => {
  for (const cause of ["deadline", "cancel", "disconnect"] as const) {
    const f = await fixture(), hold = deferred<void>(); f.hold(hold.promise);
    const input = request("adding_settings", { image: "smaller" });
    // The deadline counts from arrival in the tab; the Worker's createdAt clock is ignored.
    input.createdAt -= 60_000;
    const pending = f.run(input);
    if (cause === "deadline") { const start = Date.now(); t.mock.method(Date, "now", () => start + 10_001); }
    if (cause === "cancel") await f.records.cancel(workspace, input.id, input.grantId);
    if (cause === "disconnect") f.stale();
    hold.resolve();
    assert.notEqual(body(await pending).state, "applied");
    assert.equal(f.storage.store.list({ ...workspace, repo: repo.full_name }).length, 0); assert.equal(f.history.length, 0);
    assert.equal(await f.records.receipt(workspace, input.id, input.grantId), undefined);
  }
});

test("in-flight reuse with different work or another grant is refused before preparation", async () => {
  const f = await fixture(), hold = deferred<void>(); f.hold(hold.promise);
  const input = request("adding_settings", { image: "smaller" });
  const pending = f.run(input);
  // Observing entry into the executor proves the first flight reserved its identity.
  while (!f.counts().runs) await new Promise<void>(resolve => setImmediate(resolve));
  for (const other of [{ ...input, args: { image: "smallest" as const } }, { ...input, grantId: "another-grant" }])
    assert.match(JSON.stringify(await f.run(other)), /different work or authorization/);
  hold.resolve(); assert.equal(body(await pending).state, "applied"); assert.equal(f.counts().runs, 1);
});

test("oversized media reads give a clear error and never write a receipt", async () => {
  const f = await fixture();
  const tools = createAgentMediaTools({ workspace, ports: { stamp: f.ports.stamp, context: async () => undefined,
    files: () => ({ repo, snapshot: f.snapshot, api: async <T>() => ({}) as T, read: async () => "", batch: async () => ({}), has: () => false }) },
    records: f.records, run: async () => ({ result: { report: "x".repeat(8 * 1024 * 1024) } }) });
  const result = await tools.run(request("list_media"), 0, () => true);
  assert.equal(result.ok, false); assert.match(JSON.stringify(result), /too large.*offset\/limit/);
  assert.equal(f.storage.fake.stores.get("receipts")?.size ?? 0, 0);
});

test("trim stages bytes before the page and receipt transaction; duplicate never encodes twice", async t => {
  const f = await fixture();
  let encodes = 0, commits = 0;
  class Worker {
    onmessage?: (event: { data: { result: import("../src/page-builder/media-optimise").MediaOptimiseResult } }) => void;
    postMessage() {
      encodes++;
      queueMicrotask(() => this.onmessage?.({ data: { result: { before: 100, after: 20,
        outputs: [{ blob: new Blob(["trimmed"], { type: "image/webp" }), extension: "webp", width: 30, height: 20 }] } } }));
    }
    terminate() {}
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: Worker });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "Worker", descriptor); else Reflect.deleteProperty(globalThis, "Worker"); });
  const commit = f.records.commit;
  f.records.commit = async command => {
    commits++;
    const upload = command.drafts.find(([, draft]) => draft?.upload)?.[1];
    assert.ok(upload?.sourceSha);
    assert.ok(await f.storage.uploads.get(uploadKey({ ...workspace, repo: repo.full_name }, upload.sourceSha)), "bytes must be durable before records commit");
    assert.equal(f.text.get("index.html")?.includes("photo-crop.webp"), false);
    return commit(command);
  };
  const input = request("frame_image", { element: "0.0.0", trim: { zoom: 2 } }, "trim", "index.html");
  const result = await f.run(input);
  assert.equal(body(result).state, "applied", JSON.stringify(result));
  assert.match(f.text.get("index.html")!, /photo-crop.webp/);
  assert.deepEqual(await f.run(input), result); assert.equal(encodes, 1); assert.equal(commits, 1); assert.equal(f.history.length, 1);
});

test("revision changes at every preparation await never commit", async () => {
  const points = await forEachAwait(race => {
    const state = { disturb: () => {}, history: () => 0, done: Promise.resolve() };
    state.done = (async () => {
      const f = await fixture(race); state.disturb = f.stale; state.history = () => f.history.length;
      await f.run(request("adding_settings", { image: "smaller" }));
    })();
    return state;
  }, state => state.disturb(), state => assert.equal(state.history(), 0));
  assert.ok(points >= 3);
});

async function connected() {
  const h = await startCountedWorker(), { cookie } = await signIn(h.worker), tab = editorTab(h.worker, cookie);
  const { token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" })).json() as { token: string };
  const rpc = async (name: string, args: object, method = "tools/call") => {
    const response = await h.worker.dispatchFetch(origin + "/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}`,
      "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: method === "tools/call" ? { name, arguments: args } : args }) });
    const source = await response.text();
    const value = JSON.parse(source.startsWith("event:") ? source.split("data: ")[1].split("\n")[0] : source) as { result: unknown; error?: unknown };
    assert.equal(value.error, undefined); return value.result;
  };
  await rpc("", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "media-test", version: "1" } }, "initialize");
  return { ...h, tab, rpc };
}

test("real media relay: 3 authentication + 1 dispatch, zero result polls or server draft fetches; preview contract", async t => {
  const h = await connected(), browser = await fixture();
  const scope = { workspace, tabId: "media-tab", generation: 1 }, name = await relayObjectName(workspace);
  await browser.records.setGeneration(workspace, 0, 1);
  let attachment: unknown = { ...scope, role: "editor", owner: { tabId: scope.tabId, generation: 1 } };
  const socket = { readyState: 1, close() {}, serializeAttachment(value: unknown) { attachment = value; }, deserializeAttachment: () => attachment,
    send(message: string) {
      const value = JSON.parse(message);
      if (value.type !== "command") return;
      const work = value.command.operation === "status" ? browser.status : browser.tools;
      void work.run(value.command, 1, () => true).then(result => h.message(name, socket, JSON.stringify({ type: "result", id: value.id, ...scope, result })));
    },
  } satisfies RelaySocket;
  try {
    h.attach(name, socket, JSON.stringify({ type: "handshake", ...scope, owner: true }));
    for (const [tool, args] of [["list_media", { limit: 1 }], ["preview_media", { path: "images/photo.svg" }],
      ["adding_settings", { image: "smaller", requestId: "one" }], ["adding_settings", { image: "smaller", requestId: "one" }],
      ["get_command_status", { requestId: "one" }]] as const) {
      h.counters.reset(); h.github.requests.length = 0;
      const result = await h.rpc(tool, args);
      if (tool === "preview_media") {
        assert.partialDeepStrictEqual(result, { content: [{ type: "image", data: "UklGRg==", mimeType: "image/webp" },
          { type: "text", text: JSON.stringify({ path: "images/photo.svg", width: 30, height: 20, originalWidth: 30, originalHeight: 20, bytes: 4 }) }] });
      } else if (tool === "list_media") assert.equal(payload(result).count, 1);
      else assert.equal(payload(result).state, "applied", JSON.stringify(result));
      assert.equal(h.counters.log.length, 4); assert.equal(h.counters.byCategory.auth.calls, 3);
      assert.equal(h.counters.byCategory.control.calls, 1); assert.equal(h.counters.byCategory.data.calls, 0);
      assert.equal(h.counters.waitedMs, 0); assert.equal(h.counters.readKeys.some(key => key.startsWith("draft:")), false); assert.equal(h.github.requests.length, 0);
    }
    assert.equal(browser.history.length, 1);
    t.diagnostic("call counts: auth=3 dispatch=1 resultPolls=0 serverDraftFetches=0");
  } finally { await h.worker.dispose(); }
});

test("a committed edit whose reply arrives after the deadline stays unknown on the Worker; status finds applied", async t => {
  const h = await connected(), browser = await fixture();
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const commit = browser.records.commit;
  browser.records.commit = async input => { const result = await commit(input); now += 10_001; return result; };
  const scope = { workspace, tabId: "late-tab", generation: 1 }, name = await relayObjectName(workspace);
  await browser.records.setGeneration(workspace, 0, 1);
  let attachment: unknown = { ...scope, role: "editor", owner: { tabId: scope.tabId, generation: 1 } };
  const socket = { readyState: 1, close() {}, serializeAttachment(value: unknown) { attachment = value; }, deserializeAttachment: () => attachment,
    send(message: string) {
      const value = JSON.parse(message); if (value.type !== "command") return;
      const work = value.command.operation === "status" ? browser.status : browser.tools;
      void work.run(value.command, 1, () => true).then(result => h.message(name, socket, JSON.stringify({ type: "result", id: value.id, ...scope, result })));
    },
  } satisfies RelaySocket;
  try {
    h.attach(name, socket, JSON.stringify({ type: "handshake", ...scope, owner: true }));
    const result = payload(await h.rpc("adding_settings", { image: "smaller", requestId: "late", waitSeconds: 25 }));
    assert.equal(result.state, "unknown"); assert.match(result.message, /get_command_status.*do not replay/);
    const status = payload(await h.rpc("get_command_status", { requestId: "late" }));
    assert.equal(status.state, "applied"); assert.equal(status.result.image, "smaller"); assert.equal(browser.history.length, 1);
    const duplicate = payload(await h.rpc("adding_settings", { image: "smaller", requestId: "late" }));
    assert.deepEqual(duplicate, status); assert.equal(browser.history.length, 1);
  } finally { await h.worker.dispose(); }
});

test("media relay failures never retry; only editor-unavailable with matching legacy context queues", async () => {
  const h = await connected(), get = h.namespace.get;
  try {
    h.counters.reset(); assert.match(String(payload(await h.rpc("adding_settings", {}))), /not sharing/i);
    assert.equal(h.counters.log.length, 4); assert.equal(h.counters.waitedMs, 0);
    const context = await siteContext(); context.branch = "other"; await h.tab.share(context);
    assert.match(String(payload(await h.rpc("adding_settings", {}))), /branch other/i);
    context.branch = "main"; await h.tab.share(context);
    assert.equal(payload(await h.rpc("adding_settings", { image: "smaller", waitSeconds: 0 })).state, "pending");
    for (const code of ["timeout", "unknown-outcome", "too-large", "lost", "busy"]) {
      let dispatches = 0;
      h.namespace.get = name => String(name).startsWith("agent-relay:") ? { fetch: async () => {
        dispatches++; if (code === "lost") throw new Error("lost"); return Response.json({ ok: false, code, ...(code === "busy" ? { outcome: "not-sent" } : {}) });
      } } : get(name);
      const result = payload(await h.rpc("adding_settings", { image: "smaller", waitSeconds: 25 }));
      if (code === "too-large") assert.match(String(result), /too large.*fewer files/i);
      else { assert.equal(result.state, code === "busy" ? "failed" : "unknown"); if (code !== "busy") assert.match(result.message, /get_command_status.*do not replay/); }
      assert.equal(dispatches, 1);
      const read = await h.rpc("adding_settings", {});
      assert.match(String(payload(read)), /read failed|too large/); assert.equal(dispatches, 2);
    }
  } finally { h.namespace.get = get; await h.worker.dispose(); }
});
