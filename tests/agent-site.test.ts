import { strict as assert } from "node:assert";
import { test } from "node:test";
import { linkedStylesheets } from "../src/agent-site.ts";

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
