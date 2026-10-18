import assert from "node:assert/strict";
import { test } from "node:test";
import { textHash } from "../shared/agent";
import type { AgentRead, AgentReadResult } from "../shared/agent-read";
import { EMPTY_COMMIT, type Snapshot, type TreeEntry } from "../shared/types";
import { createAgentTools } from "../src/agent-tools";
import { createAgentReadTools, type AgentReadPorts } from "../src/agent-tools-read";
import { HttpError } from "../shared/http-error";
import { relayObjectName, type RelaySocket } from "../worker/agent-relay";
import { startCountedWorker, countedSocket } from "./fakes/counted-agent";
import { commit, editorTab, files, origin, payload, repo, signIn, siteContext } from "./mcp-harness";
import { deferred } from "./fakes/memory-workspace";

async function fixture() {
  const context = await siteContext();
  const texts = new Map<string, string>();
  for (const draft of context.drafts) {
    if (draft.hash && draft.content !== undefined) texts.set(draft.hash, draft.content);
    delete draft.content;
  }
  const contents = new Map<string, string>();
  const tree: TreeEntry[] = Object.entries(files).map(([path, content], index) => {
    const sha = index.toString(16).padStart(40, "0");
    contents.set(sha, content);
    return { path, sha, type: "blob", mode: "100644", size: content.length };
  });
  const snapshot: Snapshot = { commit, branch: "main", entries: tree, tree };
  const cached = new Set<string>();
  let valid = true, reads = 0, trees = 0;
  const browserGitHub = { blobs: 0, batches: 0 };
  const ports = {
    stamp: () => ({ holds: () => valid, changed: () => undefined }),
    context: async () => ({ context, texts }),
    files: () => ({ repo, snapshot,
      api: async <T>() => { trees++; return { entries: tree } as T; },
      read: async (_repo: string, sha: string) => {
        reads++;
        if (!cached.has(sha)) browserGitHub.blobs++;
        const text = contents.get(sha);
        if (text === undefined) throw new HttpError(404, "File cannot be read.");
        cached.add(sha); return text;
      },
      batch: async (_repo: string, shas: string[]) => { if (shas.some(sha => !cached.has(sha))) browserGitHub.batches++; for (const sha of shas) cached.add(sha); return Object.fromEntries(shas.map(sha => [sha, contents.get(sha)!])); },
      has: (_repo: string, sha: string) => cached.has(sha),
    }),
  } satisfies AgentReadPorts;
  const tools = createAgentReadTools(ports);
  return { ports, tools, context, texts, tree, contents, snapshot, browserGitHub, stale: () => { valid = false; }, counts: () => ({ reads, trees }),
    async run(name: AgentRead["tool"], args: AgentRead["args"] = {}) {
      const result = await tools.run(name, args);
      assert.equal(result.ok, true, JSON.stringify(result));
      // Dynamic JSON result contracts are asserted below; payload is the MCP harness's decoder.
      return payload({ content: [{ type: "text", text: JSON.stringify(result.ok ? result.value : null) }] });
    },
  };
}

test("registry routes injected executors and refuses unknown/prototype names", async () => {
  const seen: AgentRead["args"][] = [];
  const run = async (args: AgentRead["args"]): Promise<AgentReadResult> => { seen.push(args); return { ok: true, value: "local" }; };
  const tools = createAgentTools({ get_site: run, list_files: run, read_file: run, export_site: run, get_page: run, get_selection: run });
  assert.deepEqual(await tools.run("read_file", { path: "local.txt" }), { ok: true, value: "local" });
  assert.deepEqual(seen, [{ path: "local.txt" }]);
  for (const name of ["unknown", "toString", "__proto__"]) assert.equal((await tools.run(name, {})).ok, false);
});

test("list/read apply modified, added, moved and deleted drafts and keep hash/source", async () => {
  const f = await fixture();
  const old = f.tree.find(entry => entry.path === "index.html")!;
  f.context.drafts.push({ path: "index.html", baseSha: old.sha, deleted: true, updatedAt: 1 },
    { path: "moved.html", baseSha: null, movedFrom: "index.html", hash: await textHash("moved"), updatedAt: 1 });
  f.texts.set(await textHash("moved"), "moved");
  const listed = await f.run("list_files");
  assert.ok(listed.files.includes("about/index.html (M)"));
  assert.ok(listed.files.includes("new/index.html (A)"));
  assert.ok(listed.files.includes("moved.html (R)"));
  assert.ok(!listed.files.includes("index.html"));
  assert.deepEqual((await f.run("list_files", { folder: "about/" })).files, ["about/index.html (M)"]);
  const draft = await f.run("read_file", { path: "about/index.html" });
  assert.match(draft.content, /About the studio/);
  assert.equal(draft.hash, await textHash(draft.content));
  assert.equal(draft.source, "draft");
  assert.equal((await f.run("read_file", { path: "moved.html" })).source, "draft");
  const saved = await f.run("read_file", { path: "styles/site.css" });
  assert.equal(saved.content, files["styles/site.css"]);
  assert.equal(saved.source, "github");
  assert.deepEqual(f.counts(), { reads: 1, trees: 0 });
  for (const [path, message] of [["index.html", /deleted in the user's unsaved changes/], ["missing.txt", /does not exist. list_files/]] as const) {
    const result = await f.tools.run("read_file", { path });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, message);
  }
});

test("get_page keeps aliases, matching outlines and source=false; stale outline never returned", async () => {
  const f = await fixture();
  const page = await f.run("get_page", { page: "/about", source: false });
  assert.equal(page.file, "about/index.html");
  assert.equal(page.sections[0].heading, "About the studio");
  assert.equal(page.html, undefined);
  f.context.site!.outlines[1].hash = "old";
  const changed = await f.run("get_page", { page: "about/index.html" });
  assert.match(changed.outline, /not reported an outline of this version/);
  assert.equal(changed.sections, undefined);
  assert.match(changed.html, /About the studio/);
  assert.deepEqual(await f.tools.run("get_page", { page: "/missing" }), { ok: false, message: "No page /missing. get_site lists the pages." });
  delete f.context.pages;
  const noHome = await f.tools.run("get_page", { page: "/" });
  assert.equal(noHome.ok, false);
  if (!noHome.ok) assert.match(noHome.message, /no index.html/);
});

test("get_site uses shared tree, not-found and variant lookup with draft styles", async () => {
  const f = await fixture();
  const css = "feature-block[data-layout=browser] {}";
  f.context.drafts.push({ path: "styles/site.css", baseSha: "saved", content: css, updatedAt: 1 });
  const summary = await f.run("get_site");
  assert.equal(summary.repository, repo.full_name);
  assert.equal(summary.stale, false);
  assert.equal(summary.pages.find((page: { route: string }) => page.route === "/about/").subpages[0].route, "/about/team/");
  assert.equal(summary.notFound.file, "404.html");
  assert.match(JSON.stringify(summary.components), /browser/);
  assert.equal(summary.pending, 0);
  assert.equal(summary.openRequests, 0);
});

test("get_selection returns current element or the established absent message", async () => {
  const f = await fixture();
  const selection = await f.run("get_selection");
  assert.deepEqual(selection.element, f.context.site!.selection);
  delete f.context.site!.selection;
  const result = await f.tools.run("get_selection", {});
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /Nothing is selected in the preview/);
});

test("export keeps binaries, unreadable and omitted, draft hashes and folder filtering", async () => {
  const f = await fixture();
  f.tree.push({ path: "photo.png", sha: "picture", type: "blob", mode: "100644", size: 123 },
    { path: "unreadable.txt", sha: "absent", type: "blob", mode: "100644", size: 1 });
  for (let index = 0; index < 5; index++) f.context.drafts.push({ path: `large-${index}.txt`, baseSha: null, content: "x".repeat(1024 * 1024), updatedAt: 1 });
  f.context.drafts.push({ path: "upload.png", baseSha: null, binary: true, size: 8, updatedAt: 1 });
  const result = await f.run("export_site");
  assert.equal(result.binaries.find((item: { path: string }) => item.path === "photo.png").sha, "picture");
  assert.equal(result.binaries.find((item: { path: string }) => item.path === "upload.png").sha, null);
  assert.ok(result.omitted.length > 0);
  assert.equal(result.unreadable[0].path, "unreadable.txt");
  assert.equal(result.files.find((item: { path: string }) => item.path === "about/index.html").draft, "M");
  const folder = await f.run("export_site", { folder: "/about/" });
  assert.deepEqual(folder.files.map((item: { path: string }) => item.path), ["about/index.html"]);
});

test("read refuses a branch/revision change during context or file reads", async () => {
  for (const phase of ["context", "context-commit", "blob", "commit"] as const) {
    const f = await fixture(), gate = deferred<void>(), admitted = deferred<void>();
    if (phase.startsWith("context")) {
      const original = f.ports.context;
      f.ports.context = async () => { admitted.resolve(); await gate.promise; return original(); };
    } else {
      const original = f.ports.files;
      f.ports.files = () => ({ ...original(), read: async () => { admitted.resolve(); await gate.promise; return "old revision"; } });
    }
    const result = f.tools.run("read_file", { path: "index.html" });
    await admitted.promise;
    if (phase.includes("commit")) f.snapshot.commit = f.context.commit = "next";
    else f.stale();
    gate.resolve();
    assert.deepEqual(await result, { ok: false, message: "The editor changed branch or revision. Read the site again." });
  }
});

test("browser export translates API file failures and keeps reading other files", async () => {
  const f = await fixture();
  const original = f.ports.files;
  f.ports.files = () => ({ ...original(),
    batch: async () => { throw new Error("Could not read this file."); },
    read: async (_repo, sha) => {
      if (sha === f.tree[0].sha) throw Object.assign(new Error("Not readable"), { status: 415 });
      return original().read(_repo, sha);
    },
  });
  const result = await f.run("export_site");
  assert.ok(result.files.length > 1);
  assert.deepEqual(result.unreadable, [{ path: f.tree[0].path, reason: "Not readable" }]);
});

test("empty repositories read only drafts; escaped Unicode payload fails clearly before 8 MiB", async () => {
  const f = await fixture();
  f.snapshot.commit = f.context.commit = EMPTY_COMMIT;
  f.context.drafts = [{ path: "new.txt", baseSha: null, content: "draft", updatedAt: 1 }];
  assert.deepEqual((await f.run("list_files")).files, ["new.txt (A)"]);
  assert.equal((await f.run("read_file", { path: "new.txt" })).content, "draft");
  f.context.drafts[0].content = "\u0000".repeat(2 * 1024 * 1024);
  const result = await f.tools.run("export_site", {});
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /too large.*Export a folder/);
});

async function connected() {
  const h = await startCountedWorker();
  const { cookie } = await signIn(h.worker);
  const tab = editorTab(h.worker, cookie);
  const response = await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" });
  const { token } = await response.json() as { token: string };
  const hub = await tab.hub();
  const sessionId = h.counters.log.find(row => row.name.startsWith("agent-hub:"))!.name;
  const rpc = async (method: string, params?: object) => {
    const response = await h.worker.dispatchFetch(origin + "/mcp", { method: "POST", headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    assert.equal(response.status, 200);
    const body = await response.text();
    const json = JSON.parse(body.startsWith("event:") ? body.split("data: ")[1].split("\n")[0] : body);
    assert.equal(json.error, undefined, body);
    return json.result;
  };
  await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "browser-read-test", version: "1" } });
  return { ...h, tab, rpc, sessionId, hub };
}

test("live read_file/get_site/resource/prompt: 3 auth + 1 real SessionStore dispatch, no server content fetches", async t => {
  const h = await connected(), browser = await fixture();
  const scope = { workspace: { account: "lex", repoId: repo.id, branch: "main" }, tabId: "owner-tab", generation: 1 };
  const name = await relayObjectName(scope.workspace);
  const traffic = countedSocket();
  let attachment: unknown = { ...scope, role: "editor", owner: { tabId: scope.tabId, generation: 1 } };
  const editor = {
    readyState: 1, close() {}, serializeAttachment(value: unknown) { attachment = value; }, deserializeAttachment: () => attachment,
    send(message: string) {
      traffic.send(message);
      const value = JSON.parse(message);
      if (value.type !== "command") return;
      void browser.tools.run(value.command.tool, value.command.args).then(result => {
        const reply = JSON.stringify({ type: "result", id: value.id, ...scope, result });
        traffic.receive(reply); h.message(name, editor, reply);
      });
    },
  } satisfies RelaySocket;
  try {
    h.attach(name, editor, JSON.stringify({ type: "handshake", ...scope, owner: true }));
    const storage = h.storage(h.sessionId);
    // Request summaries arrive through the existing authentication GET, without another invocation.
    await storage.put("requests", [{ id: "open", repoId: repo.id, branch: "main", state: "open", element: {} },
      { id: "other", repoId: repo.id, branch: "other", state: "open", element: {} }]);
    for (const [method, params] of [
      ["tools/call", { name: "read_file", arguments: { path: "about/index.html" } }],
      ["tools/call", { name: "get_site", arguments: {} }],
      ["resources/read", { uri: "native-site://site" }],
      ["prompts/get", { name: "edit_site", arguments: {} }],
    ] as const) {
      h.counters.reset(); h.github.requests.length = 0;
      const before = { ...traffic.counters }, githubBefore = { ...browser.browserGitHub };
      const answer = await h.rpc(method, params);
      assert.equal(answer.isError, undefined, JSON.stringify(answer));
      if (method === "tools/call" && params.name === "get_site") assert.equal(payload(answer).openRequests, 1);
      if (method === "tools/call" && params.name === "read_file") assert.match(payload(answer).content, /About the studio/);
      assert.equal(h.counters.byCategory.auth.calls, 3, JSON.stringify(h.counters.log));
      assert.equal(h.counters.byCategory.control.calls, 1, JSON.stringify(h.counters.log));
      assert.equal(h.counters.byCategory.data.calls, 0, JSON.stringify(h.counters.log));
      assert.equal(h.counters.log.length, 4);
      assert.equal(h.counters.readKeys.some(key => key.startsWith("draft:")), false);
      assert.equal(h.counters.log.some(row => /agent-draft|repository-cache/.test(row.path)), false);
      assert.equal(h.github.requests.length, 0, "no Worker GitHub fetches for the read");
      assert.equal(traffic.counters.sent - before.sent, 1);
      assert.equal(traffic.counters.received - before.received, 1);
      assert.equal(h.counters.waitedMs, 0);
      t.diagnostic(`${method} ${"name" in params ? params.name : "site"}: auth=3 dispatch=1 serverDrafts=0 messages=1 sent+1 received browserBlobs=${browser.browserGitHub.blobs - githubBefore.blobs} browserBatches=${browser.browserGitHub.batches - githubBefore.batches}`);
    }
    assert.ok(browser.counts().reads > 0, "browser GitHub/cache reads counted separately");
  } finally { await h.worker.dispose(); }
});

test("no receiver is immediate, get_site unavailable; only a matching legacy snapshot permits fallback", async () => {
  const h = await connected();
  try {
    h.clock.install(); h.counters.reset();
    const unavailable = payload(await h.rpc("tools/call", { name: "get_site", arguments: {} }));
    assert.equal(unavailable.available, false);
    assert.match(unavailable.note, /not sharing/);
    assert.equal(h.counters.waitedMs, 0);
    assert.equal(h.counters.log.length, 4);
    const noFile = await h.rpc("tools/call", { name: "read_file", arguments: { path: "index.html" } });
    assert.equal(noFile.isError, true);
    const context = await siteContext();
    await h.tab.share(context);
    h.counters.reset();
    const legacy = payload(await h.rpc("tools/call", { name: "read_file", arguments: { path: "about/index.html" } }));
    assert.match(legacy.content, /About the studio/);
    assert.equal(h.counters.byCategory.auth.calls, 3);
    assert.equal(h.counters.byCategory.control.calls, 1);
    assert.equal(h.counters.waitedMs, 0);
    context.branch = "other";
    await h.tab.share(context);
    const mismatch = payload(await h.rpc("tools/call", { name: "get_site", arguments: {} }));
    assert.equal(mismatch.available, false);
    assert.match(mismatch.note, /branch other/);
  } finally { await h.worker.dispose(); }
});


test("relay failures are clear errors and never retry or fall back to a legacy snapshot", async () => {
  const h = await connected();
  const get = h.namespace.get;
  let dispatches = 0;
  try {
    await h.tab.share(await siteContext());
    for (const code of ["busy", "too-large", "timeout", "cancelled", "unknown-outcome"]) {
      h.namespace.get = name => String(name).startsWith("agent-relay:") ? { fetch: async () => {
        dispatches++; return Response.json({ ok: false, code, outcome: "unknown" });
      } } : get(name);
      h.counters.reset();
      const before = dispatches;
      const result = await h.rpc("tools/call", { name: "get_site", arguments: {} });
      assert.equal(result.isError, true, code);
      assert.match(result.content[0].text, code === "too-large" ? /too large.*Export a folder/ : new RegExp(code));
      assert.equal(dispatches - before, 1);
      assert.equal(h.counters.byCategory.data.calls, 0);
      assert.equal(h.counters.waitedMs, 0);
    }
  } finally { h.namespace.get = get; await h.worker.dispose(); }
});
