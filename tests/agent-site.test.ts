import { strict as assert } from "node:assert";
import { test } from "node:test";
import { agentWorking, applySiteCommand, buildAgentContext, changesWork, linkedStylesheets, type AgentSiteActions } from "../src/agent-site.ts";
import { createGuardedEdits } from "../src/guarded-edit.ts";
import { createBlockMoves } from "../src/page-builder/block-move.ts";
import { createMemoryWorkspace } from "./fakes/memory-workspace.ts";
import { installOutlineDocument } from "./support/outline-document.ts";
import type { SavedDraft } from "../src/drafts.ts";
import { textHash, WORKING_NOTE, type AgentCommand } from "../shared/agent.ts";

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

test("the agent context marks a new page new, and a moved page not", async () => {
  const scope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
  const draft = (path: string, extra: Partial<SavedDraft> = {}): SavedDraft => ({ ...scope, version: 1, path, baseSha: null, original: "", content: "<h1>Page</h1>", updatedAt: 1, ...extra });
  const site = { routes: { "/": "index.html", "/contact/": "contact/index.html", "/news/": "news/index.html" }, components: {} };
  const { context } = await buildAgentContext({
    repository: { id: 1, fullName: "lex/site" }, branch: "main", commit: "c".repeat(40), file: null,
    drafts: [draft("contact/index.html"), draft("news/index.html", { movedFrom: "blog/index.html" })],
    mountedSource: () => undefined,
    native: { site, routeInfo: () => ({}), source: () => undefined, exists: () => true },
  });
  assert.deepEqual(context.pages?.map(({ file, isNew }) => ({ file, isNew })), [
    { file: "index.html", isNew: undefined },
    { file: "contact/index.html", isNew: true },
    { file: "news/index.html", isNew: undefined },
  ]);
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
  let calls = 0, opened = 0;
  const actions = {
    open: async () => { opened++; return true; }, isMounted: () => true, text: async () => source,
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
  // An element id the Worker would have refused: a malformed command, never handed to Make component, its page never opened.
  const before = opened;
  await assert.rejects(applySiteCommand(actions, { ...command, args: { ...command.args, element: "bad.id" } }), /is malformed/);
  assert.equal(calls, 2);
  assert.equal(opened, before);
  await assert.rejects(applySiteCommand(actions, { ...command, expectedHash: "stale" }), /changed in the editor/);
  assert.equal(calls, 2);
});

test("move_section reports the module's moved id and stayed reply; Undo reselects the original section", async t => {
  // Only pageOutline needs DOM here. This balanced fixture has no browser repairs,
  // headings or component slots; the source adapter supplies its element tree.
  installOutlineDocument(t);
  const path = "index.html";
  const source = "<main><section>A</section><section>B</section><section>C</section></main>";
  const site = { routes: { "/": path }, components: {} };
  const m = createMemoryWorkspace({ branch: { [path]: source }, open: path, site });
  const edits = createGuardedEdits(m.workspace);
  const moves = createBlockMoves({ edits, editing: () => undefined,
    mounted: file => m.openFile() === file && m.model(file) !== undefined,
    forgetOpening: () => () => {},
  });
  const actions = {
    open: async file => { assert.equal(file, path); return true; },
    isMounted: file => m.openFile() === file,
    text: async file => m.workspace.source(file),
    sectionTags: () => new Set<string>(),
    moveSection: (at, gap) => {
      assert.equal(at.painted, m.workspace.source(path));
      // Exercise the caller's pending settlement too.
      const outcome = moves.move(at, { gap, section: true }, { stale: "Read the page again." });
      assert.notEqual(outcome.status, "pending");
      return outcome.status === "pending" ? outcome : { status: "pending", settled: Promise.resolve(outcome) };
    },
  } satisfies Pick<AgentSiteActions, "open" | "isMounted" | "text" | "sectionTags" | "moveSection">;
  const command: AgentCommand = {
    id: "move-1", operation: "move_section", path, branch: "dev", commit: "c", content: "",
    expectedHash: await textHash(source), args: { section: "0.0", after: "0.2" },
    state: "pending", createdAt: 1,
  };
  // The returned id describes the moved node after the source sibling was removed.
  const outcome = await applySiteCommand(actions as AgentSiteActions, command);
  assert.equal(outcome.message, "Section moved to 0.2, unsaved.");
  assert.deepEqual(outcome.result, { section: "0.2", hash: await textHash(m.workspace.source(path)!) });
  assert.equal(m.workspace.source(path), "<main><section>B</section><section>C</section>\n<section>A</section></main>");
  const stayed = await applySiteCommand(actions as AgentSiteActions, { ...command,
    expectedHash: outcome.result!.hash, args: { section: "0.2", after: "0.2" },
  });
  assert.equal(stayed.message, "The section is already there.");
  assert.equal(stayed.result!.section, "0.2");
  assert.deepEqual(m.steps(), ["range"]);
  assert.ok(m.undo());
  assert.equal(m.workspace.source(path), source);
  assert.deepEqual(m.selected.at(-1), { path, node: [0, 0] });
  // Before a section: into its place, that section and the rest after it.
  const first = await applySiteCommand(actions as AgentSiteActions, { ...command, args: { section: "0.2", before: "0.0" } });
  assert.equal(first.result!.section, "0.0");
  assert.deepEqual([...m.workspace.source(path)!.matchAll(/<section>(\w)<\/section>/g)].map(match => match[1]), ["C", "A", "B"]);
  assert.ok(m.undo());
  // The id is the module's node, not one worked out from the gap.
  const elsewhere = await applySiteCommand({ ...actions, moveSection: () => ({ status: "moved", node: [0, 1] }) } as AgentSiteActions, command);
  assert.equal(elsewhere.message, "Section moved to 0.1, unsaved.");
  assert.equal(elsewhere.result!.section, "0.1");

  for (const [returned, errorType] of [
    [{ status: "stale", message: "Read the page again." }, "Conflict"],
    [{ status: "refused", message: "A section moves among its own siblings only." }, "Conflict"],
    [{ status: "refused", message: "The active file is read only.", failed: true }, "Error"],
  ] as const) {
    await assert.rejects(applySiteCommand({ ...actions, moveSection: () => returned } as AgentSiteActions, command), (error: Error) => {
      assert.equal(error.constructor.name, errorType);
      assert.equal(error.message, returned.message);
      return true;
    });
  }
});

test("inspect_preview with an element id the Worker would have refused is malformed; nothing is opened", async () => {
  let opened = 0;
  const actions = { open: async () => { opened++; return true; }, inspect: async () => assert.fail("must not inspect") } satisfies Pick<AgentSiteActions, "open" | "inspect">;
  const command: AgentCommand = { id: "inspect-1", operation: "inspect_preview", path: "index.html", branch: "dev", commit: "c", content: "",
    args: { element: "bad.id" }, state: "pending", createdAt: 1 };
  await assert.rejects(applySiteCommand(actions as AgentSiteActions, command), /is malformed/);
  assert.equal(opened, 0);
});

test("an agent's change waits only when it changes the part the user works in (ticket 52)", async () => {
  const source = '<!doctype html>\n<html>\n<head>\n  <title>Home</title>\n</head>\n<body>\n<main>\n  <section>\n    <h1>Welcome</h1>\n    <p>Text</p>\n  </section>\n  <section><h2>Next</h2></section>\n</main>\n</body>\n</html>\n';
  const command = (operation: AgentCommand["operation"], extra: Partial<AgentCommand> = {}): AgentCommand =>
    ({ id: "c", operation, path: "index.html", content: "", branch: "main", commit: "c", expectedHash: "h", state: "pending", createdAt: 1, ...extra });
  const write = (from: string, to: string) => command("write_file", { content: source.replace(from, to) });
  const heading = { path: "index.html", node: [0, 0, 0] };
  const cases: [string, Parameters<typeof changesWork>[0], AgentCommand, boolean][] = [
    ["its text", heading, write("Welcome", "Hello"), true],
    ["typed into", heading, write("Welcome<", "Welcome!<"), true],
    ["another element's text", heading, write("Text", "More"), false],
    ["text just before it", heading, write("<h1>", "<p>x</p><h1>"), false],
    ["the section holding it", heading, command("remove_section", { args: { section: "0.0" } }), true],
    ["another section", heading, command("move_section", { args: { section: "0.1", before: "0.0" } }), false],
    ["a section added", heading, command("add_section", { args: { component: "x", after: "0.0" } }), false],
    ["it made a component", heading, command("make_component", { args: { element: "0.0.0", tag: "x-y" } }), true],
    ["an element not there", heading, command("make_component", { args: { element: "9", tag: "x-y" } }), true],
    ["the page details", heading, command("set_page_details", { args: { title: "New" } }), false],
    ["its file moved", heading, command("move_file", { args: { to: "home.html" } }), true],
    ["its folder removed", { path: "about/index.html", node: [0] }, command("delete_file", { path: "about" }), true],
    ["a new file", heading, command("write_file", { expectedHash: null, content: "x" }), false],
    ["another file", heading, { ...write("Welcome", "Hello"), path: "about.html" }, false],
    ["read only", heading, command("inspect_preview"), false],
    ["the code pane's lines", { path: "index.html", lines: { start: 4, end: 4 } }, command("set_page_details", { args: { title: "New" } }), true],
    ["other lines", { path: "index.html", lines: { start: 10, end: 10 } }, write("Welcome", "Hello"), false],
    ["those lines", { path: "index.html", lines: { start: 9, end: 9 } }, write("Welcome", "Hello"), true],
    ["nobody typing", undefined, write("Welcome", "Hello"), false],
  ];
  for (const [name, part, change, waits] of cases) assert.equal(changesWork(part, change, source), waits, name);
  const site = { routes: { "/": "index.html" }, components: {} };
  assert.deepEqual(agentWorking(heading, site, source), { file: "index.html", route: "/", element: "0.0.0", tag: "h1", lines: { start: 9, end: 9 }, note: WORKING_NOTE });
  assert.deepEqual(agentWorking({ path: "styles/site.css", lines: { start: 2, end: 3 } }, site, "a\nb\nc\n"), { file: "styles/site.css", lines: { start: 2, end: 3 }, note: WORKING_NOTE });
});
