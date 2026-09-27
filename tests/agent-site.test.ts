import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildAgentContext, linkedStylesheets } from "../src/agent-site.ts";
import type { SavedDraft } from "../src/drafts.ts";
import { textHash } from "../shared/agent.ts";

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
