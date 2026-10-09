import { strict as assert } from "node:assert";
import { test } from "node:test";
import { applySiteCommand, buildAgentContext, linkedStylesheets, type AgentSiteActions } from "../src/agent-site.ts";
import type { SavedDraft } from "../src/drafts.ts";
import { textHash, type AgentCommand } from "../shared/agent.ts";

test("the agent context lists the stylesheets the pages link, home page first, each with what it imports", () => {
  const sources: Record<string, string> = {
    "index.html": '<head><link rel="stylesheet" href="/styles/site.css"></head><body></body>',
    "about/index.html": '<head><link rel="stylesheet" href="../styles/site.css"><link rel="stylesheet" href="/styles/about.css"></head><body></body>',
    "print.html": '<head><link rel="stylesheet" href="/styles/missing.css"></head><body><link rel="stylesheet" href="/styles/body.css"></body>',
    "styles/site.css": '@import url("tokens.css");\n@import "parts/layout.css";\nbody { margin: 0; }\n',
    "styles/parts/layout.css": '@import "../tokens.css";\n.page { gap: 1rem; }\n',
    "styles/tokens.css": ":root { --accent: green; }\n",
    "styles/about.css": "h1 { color: red; }\n",
  };
  const site = { routes: { "/": "index.html", "/about/": "about/index.html", "/print.html": "print.html" }, components: {} };
  assert.deepEqual(linkedStylesheets(site, (path) => sources[path]), [
    { file: "styles/site.css", imports: ["styles/tokens.css", "styles/parts/layout.css"] },
    { file: "styles/about.css", imports: [] },
    { file: "styles/missing.css", imports: [] },
  ]);
});

test("the agent context lists every draft by hash and hands over each text up to 1 MB, however many; a larger or binary one says why", async () => {
  const scope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
  const draft = (path: string, content: string, extra: Partial<SavedDraft> = {}): SavedDraft => ({ ...scope, version: 1, path, baseSha: null, original: "", content, updatedAt: 1, ...extra });
  const drafts = Array.from({ length: 150 }, (_, index) => draft(`styles/d${index}.css`, `.d${index} { color: red; }\n`.repeat(250)));
  drafts.push(draft("styles/huge.css", "a".repeat(1024 * 1024 + 1)), draft("images/logo.png", "", { opaque: true }));
  const { context, texts } = await buildAgentContext({
    repository: { id: 1, fullName: "lex/site" }, branch: "main", commit: "c".repeat(40), file: null, drafts,
    mountedSource: (path) => (path === "styles/d3.css" ? "/* typed */" : undefined),
  });
  assert.equal(context.drafts.length, 152);
  assert.ok(JSON.stringify(context).length < 64 * 1024, "the context holds no texts");
  for (const entry of context.drafts.slice(0, 150)) {
    assert.equal(entry.content, undefined);
    const text = entry.path === "styles/d3.css" ? "/* typed */" : drafts.find((item) => item.path === entry.path)!.content;
    assert.equal(entry.hash, await textHash(text), "the hash the tab checks writes against");
    assert.equal(texts.get(entry.hash!), text);
  }
  assert.deepEqual(context.drafts.find((entry) => entry.path === "styles/huge.css"), { path: "styles/huge.css", baseSha: null, updatedAt: 1, size: 1024 * 1024 + 1 });
  assert.deepEqual(context.drafts.find((entry) => entry.path === "images/logo.png"), { path: "images/logo.png", baseSha: null, updatedAt: 1, binary: true });
  assert.equal(texts.size, 150);
});

test("make_component opens the guarded page, forwards its request and reports flat results", async () => {
  let source = "<html><head></head><body><main><section><h2>Title</h2></section></main></body></html>";
  const hash = await textHash(source);
  const command: AgentCommand = {
    id: "make-1", operation: "make_component", path: "index.html", branch: "dev", commit: "c",
    content: "", expectedHash: hash, args: { element: "0.0", tag: "section-intro", fixed: ["title"] },
    state: "pending", createdAt: 1,
  };
  // Only the ports this operation may use are present; any other call fails.
  const actions = {
    open: async (path: string) => { assert.equal(path, command.path); return true; },
    isMounted: () => true,
    text: async () => source,
    makeComponent: async (request: unknown) => {
      assert.deepEqual(request, { path: "index.html", source, node: [0, 0], tag: "section-intro", fixed: ["title"] });
      source = "<body><main><section-intro></section-intro></main></body>";
      return { tag: "section-intro", files: ["components/section-intro/section-intro.html", "components/section-intro/section-intro.css"],
        slots: ["", "text"], cards: ["card-intro"], notes: ["A plan note."] };
    },
  } as AgentSiteActions;
  const outcome = await applySiteCommand(actions, command);
  assert.match(outcome.message!, /Made <section-intro>.*unsaved/);
  assert.deepEqual(outcome.result, {
    tag: "section-intro", files: "components/section-intro/section-intro.html, components/section-intro/section-intro.css",
    slots: "(unnamed), text", cards: "card-intro", notes: "A plan note.", hash: await textHash(source),
  });
});

test("make_component reports refusals as conflicts and never calls the action for missing elements or stale pages", async () => {
  const source = "<body><main><section></section></main></body>";
  const command: AgentCommand = {
    id: "make-1", operation: "make_component", path: "index.html", branch: "dev", commit: "c",
    content: "", expectedHash: await textHash(source), args: { element: "0.0", tag: "section-intro" },
    state: "pending", createdAt: 1,
  };
  let calls = 0;
  const actions = {
    open: async () => true, isMounted: () => true, text: async () => source,
    makeComponent: async (request: Parameters<AgentSiteActions["makeComponent"]>[0]) => {
      calls++;
      if (request.node[0] === 9) return "That element is not on the page any more. Read the page again.";
      return "Unknown fixed slot: missing. Slots in this plan: title.";
    },
  } as AgentSiteActions;
  await assert.rejects(applySiteCommand(actions, command), (error: Error) => {
    assert.equal(error.constructor.name, "Conflict");
    assert.match(error.message, /Unknown fixed slot/);
    return true;
  });
  assert.equal(calls, 1);
  await assert.rejects(applySiteCommand(actions, { ...command, args: { ...command.args, element: "9.9" } }), /not on the page/);
  assert.equal(calls, 2);
  await assert.rejects(applySiteCommand(actions, { ...command, args: { ...command.args, element: "bad.id" } }), /not on the page/);
  await assert.rejects(applySiteCommand(actions, { ...command, expectedHash: "stale" }), /changed in the editor/);
  assert.equal(calls, 2);
});
