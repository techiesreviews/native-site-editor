import assert from "node:assert/strict";
import { test } from "node:test";
import { textHash } from "../shared/agent";
import type { AgentRead, AgentReadResult } from "../shared/agent-read";
import { EMPTY_COMMIT, type Snapshot, type TreeEntry } from "../shared/types";
import { createAgentTools } from "../src/agent-tools";
import { createAgentReadTools, type AgentReadPorts } from "../src/agent-tools-read";
import { HttpError } from "../shared/http-error";
import { SiteFiles, type SiteFileReader } from "../shared/site-files";
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

test("reads answer with the tab's text now, as the preview shows it: the shared drafts' texts never answer", async () => {
  const f = await fixture();
  const old = f.tree.find(entry => entry.path === "index.html")!;
  f.context.drafts.push({ path: "index.html", baseSha: old.sha, deleted: true, updatedAt: 1 },
    { path: "upload.png", baseSha: null, binary: true, size: 8, updatedAt: 1 });
  const now: Record<string, string> = { "about/index.html": "<h1>Typed, unsaved</h1>", "styles/site.css": "body { color: red }",
    "styles/tokens.css": files["styles/tokens.css"], "index.html": "still held", "upload.png": "not text", "404.html": "x".repeat(1024 * 1024 + 1) };
  const tools = createAgentReadTools({ ...f.ports, source: path => now[path] });
  const run = async (name: AgentRead["tool"], args: AgentRead["args"] = {}) => {
    const result = await tools.run(name, args);
    assert.equal(result.ok, true, JSON.stringify(result));
    return payload({ content: [{ type: "text", text: JSON.stringify(result.ok ? result.value : null) }] });
  };
  const typed = await run("read_file", { path: "about/index.html" });
  assert.deepEqual([typed.content, typed.source, typed.hash], [now["about/index.html"], "draft", await textHash(now["about/index.html"])]);
  const page = await run("get_page", { page: "/about" });
  assert.deepEqual([page.html, page.hash, page.source], [typed.content, typed.hash, "draft"]);
  // A saved file is the tab's text when it holds one, without asking GitHub; it stays unmarked, as list_files lists it.
  const saved = await run("read_file", { path: "styles/site.css" });
  assert.deepEqual([saved.content, saved.source, saved.hash], [now["styles/site.css"], "github", await textHash(now["styles/site.css"])]);
  assert.deepEqual(f.counts(), { reads: 0, trees: 0 });
  assert.ok((await run("list_files")).files.includes("styles/site.css"));
  // A deletion and a binary draft stay what the drafts say; text past the agents' limit is refused, not swapped for GitHub's.
  const deleted = await tools.run("read_file", { path: "index.html" });
  assert.equal(deleted.ok, false);
  const binary = await tools.run("read_file", { path: "upload.png" });
  assert.ok(!binary.ok && /binary file/.test(binary.message));
  const large = await tools.run("read_file", { path: "404.html" });
  assert.ok(!large.ok && /KB in the editor, larger than the 1 MB/.test(large.message), JSON.stringify(large));
  const exported = await run("export_site");
  const byPath = (path: string) => exported.files.find((item: { path: string }) => item.path === path);
  assert.equal(byPath("about/index.html").content, now["about/index.html"]);
  assert.equal(byPath("styles/site.css").content, now["styles/site.css"]);
  assert.ok(exported.unreadable.some((item: { path: string }) => item.path === "404.html"));
  // Typing since the context was shared: the read is the tab's newer text, never the shared hash.
  const shared = f.context.drafts.find(draft => draft.path === "about/index.html")!.hash;
  now["about/index.html"] = "<h1>Typed on</h1>";
  const newer = await run("read_file", { path: "about/index.html" });
  assert.deepEqual([newer.content, newer.hash], [now["about/index.html"], await textHash(now["about/index.html"])]);
  assert.ok(shared && newer.hash !== shared);
  // A draft the tab gives no text for is refused, never answered from the texts it shared earlier.
  delete now["about/index.html"];
  const unshared = await tools.run("read_file", { path: "about/index.html" });
  assert.ok(!unshared.ok && /still sharing/.test(unshared.message), JSON.stringify(unshared));
});

test("texts take a saved file the tab holds from the tab, and ask GitHub only for the rest", async () => {
  const context = await siteContext();
  const tree: TreeEntry[] = ["styles/site.css", "styles/tokens.css"].map((path, index) =>
    ({ path, sha: String(index).repeat(40), type: "blob", mode: "100644", size: files[path].length }));
  const prefetched: string[][] = [];
  const reader: SiteFileReader = {
    commitTree: async () => tree,
    file: async (_repo, sha) => files[tree.find(entry => entry.sha === sha)!.path],
    prefetchTexts: async (_repo, shas) => { prefetched.push(shas); },
    hasText: () => true,
  };
  const now: Record<string, string> = { "styles/site.css": "body { color: red }" };
  const read = new SiteFiles(reader, repo, context, undefined, path => now[path]);
  const texts = await read.texts(["styles/site.css", "styles/tokens.css"]);
  assert.deepEqual(Object.fromEntries(texts), { "styles/site.css": now["styles/site.css"], "styles/tokens.css": files["styles/tokens.css"] });
  assert.deepEqual(prefetched, [[tree[1].sha]]);
  // A held text past the agents' limit is left out, and not asked of GitHub either.
  prefetched.length = 0;
  const large = new SiteFiles(reader, repo, context, undefined, path => path === "styles/site.css" ? "x".repeat(1024 * 1024 + 1) : undefined);
  assert.deepEqual([...(await large.texts(["styles/site.css", "styles/tokens.css"])).keys()], ["styles/tokens.css"]);
  assert.deepEqual(prefetched, [[tree[1].sha]]);
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
  const hub = await (await h.worker.dispatchFetch(origin + "/api/agent/connections", { headers: { Cookie: cookie } })).json();
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
    await h.settle(name);
    const storage = h.storage(h.sessionId);
    // Legacy hub requests arrive through the existing authentication GET, without another invocation, but over the
    // relay the receiving tab counts its own (ticket 18; the menu fills openRequests), so they do not count here.
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
      if (method === "tools/call" && params.name === "get_site") assert.equal(payload(answer).openRequests, 0);
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

test("no receiver refuses every read immediately, even with matching legacy content", async () => {
  const h = await connected();
  try {
    const context = await siteContext();
    for (const branch of ["other", "main"]) {
      await h.storage(h.sessionId).put("context", { ...context, branch });
      for (const [name, args] of [["get_site", {}], ["read_file", { path: "about/index.html" }]] as const) {
        h.counters.reset();
        const result = await h.rpc("tools/call", { name, arguments: args });
        assert.equal(Boolean(result.isError), name !== "get_site");
        assert.match(JSON.stringify(name === "get_site" ? payload(result).note : payload(result)), /The editor isn't open/);
        assert.equal(h.counters.byCategory.auth.calls, 3);
        assert.equal(h.counters.byCategory.control.calls, 1);
        assert.equal(h.counters.byCategory.data.calls, 0);
        assert.equal(h.counters.waitedMs, 0);
        assert.ok(!h.counters.readKeys.includes("context"));
      }
    }
  } finally { await h.worker.dispose(); }
});

test("relay failures are clear errors and never retry or fall back to a legacy snapshot", async () => {
  const h = await connected();
  const get = h.namespace.get;
  let dispatches = 0;
  try {
    await h.storage(h.counters.log.find(row => row.name.startsWith("agent-hub:"))!.name).put("context", await siteContext());
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

test("without a loaded tree, roots are walked through the tree API with prefixes; folders and submodules refuse; a held walk turns stale", async () => {
  const f = await fixture();
  const blob = (path: string, sha: string): TreeEntry => ({ path, sha, type: "blob", mode: "100644", size: 1 });
  const roots: TreeEntry[] = [blob("index.html", "1".repeat(40)), { path: "about", sha: "a".repeat(40), type: "tree", mode: "040000" },
    { path: ".github", sha: "b".repeat(40), type: "tree", mode: "040000" }, { path: "vendor", sha: "e".repeat(40), type: "commit", mode: "160000" }];
  const nested: Record<string, TreeEntry[]> = {
    ["a".repeat(40)]: [blob("index.html", "2".repeat(40))],
    ["b".repeat(40)]: [{ path: "workflows", sha: "3".repeat(40), type: "tree", mode: "040000" }, blob("workflows/ci.yml", "4".repeat(40))],
  };
  const texts: Record<string, string> = { ["1".repeat(40)]: "home", ["2".repeat(40)]: "about", ["4".repeat(40)]: "ci" };
  const calls: Record<string, string>[] = [];
  let hold: ReturnType<typeof deferred> | undefined, valid = true;
  const snapshot: Snapshot = { commit, branch: "main", entries: roots };
  f.context.drafts.length = 0;
  const tools = createAgentReadTools({ ...f.ports, stamp: () => ({ holds: () => valid, changed: () => undefined }), files: () => ({ repo, snapshot,
    api: async <T>(_path: string, params: Record<string, string>) => { calls.push(params); await hold?.promise; return { entries: nested[params.sha] ?? [] } as T; },
    read: async (_repo: string, sha: string) => texts[sha] ?? Promise.reject(new HttpError(404, "File cannot be read.")),
    batch: async (_repo: string, shas: string[]) => Object.fromEntries(shas.filter(sha => texts[sha]).map(sha => [sha, texts[sha]])),
    has: () => false,
  }) });
  const listed = await tools.run("list_files", {});
  assert.equal(listed.ok, true);
  if (listed.ok) assert.deepEqual((listed.value as { files: string[] }).files, [".github/workflows/ci.yml", "about/index.html", "index.html", "vendor"]);
  assert.deepEqual(calls.map(call => [call.sha, call.recursive]).sort(), [["a".repeat(40), "1"], ["b".repeat(40), "1"]]);
  const exported = await tools.run("export_site", {});
  assert.equal(exported.ok, true);
  // As on the Worker: .yml is not a text path, so it is listed by blob; the submodule too.
  if (exported.ok) {
    const value = exported.value as { files: { path: string; content: string }[]; binaries: { path: string }[] };
    assert.deepEqual(value.files.map(file => [file.path, file.content]), [["about/index.html", "about"], ["index.html", "home"]]);
    assert.deepEqual(value.binaries.map(file => file.path), [".github/workflows/ci.yml", "vendor"]);
  }
  for (const [path, message] of [["about", /about is a folder, not a file/], [".github/workflows", /is a folder/], ["vendor", /vendor is a submodule, not a file/]] as const) {
    const result = await tools.run("read_file", { path });
    assert.equal(result.ok, false, path);
    if (!result.ok) assert.match(result.message, message);
  }
  hold = deferred();
  const pending = tools.run("list_files", {});
  await new Promise(resolve => setImmediate(resolve));
  valid = false;
  hold.resolve();
  const stale = await pending;
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.match(stale.message, /changed branch or revision/);
});
