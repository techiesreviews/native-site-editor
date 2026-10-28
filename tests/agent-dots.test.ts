import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import type { setAgentDots } from "../src/components/agent-dots.ts";
import type { createPagesTree } from "../src/components/pages-tree.ts";
import type { buildNativePagesTree } from "../src/native-pages.ts";

// Ticket am-11: the agents' dots on a row (src/components/agent-dots.ts) and on Pages and files' rows
// (src/components/pages-tree.ts `agents`), in a browser page.
type Factories = { setAgentDots: typeof setAgentDots; createPagesTree: typeof createPagesTree; buildNativePagesTree: typeof buildNativePagesTree };
async function inBrowser(run: (page: import("@playwright/test").Page) => Promise<void>) {
  const bundle = await build({
    stdin: { contents: "import { setAgentDots } from './src/components/agent-dots'; import { createPagesTree } from './src/components/pages-tree'; " +
      "import { buildNativePagesTree } from './src/native-pages'; globalThis.dotsFactories = { setAgentDots, createPagesTree, buildNativePagesTree };", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    await run(page);
  } finally { await browser.close(); }
}

test("a row's dots: one per agent in its colour, in or beside their holder, drawn again only when changed, gone with the busy state", () => inBrowser(async page => {
  const seen = await page.evaluate(() => {
    const { setAgentDots } = (globalThis as typeof globalThis & { dotsFactories: Factories }).dotsFactories;
    const row = document.createElement("li"), label = document.createElement("span"), name = document.createElement("span");
    row.append(label, name);
    document.body.append(row);
    const agents = [{ key: "a", name: "Header writer", colour: 0 }, { key: "b", name: "Copy editor", colour: 1 }];
    setAgentDots(row, label, agents);
    const inLabel = label.lastElementChild as HTMLElement;
    const first = { holder: inLabel.parentElement === label, colours: [...inLabel.children].map(dot => (dot as HTMLElement).dataset.agentColour),
      title: inLabel.title, busy: row.getAttribute("aria-busy") };
    // The same agents again: the very same dots, not drawn again.
    const before = inLabel.firstElementChild;
    setAgentDots(row, label, agents);
    const kept = label.querySelectorAll(".agent-dots").length === 1 && inLabel.firstElementChild === before;
    // Beside a name that clips: a sibling after it, found again when the row changed meanwhile.
    setAgentDots(row, name, [agents[1]], true);
    const beside = name.nextElementSibling as HTMLElement;
    name.after(document.createElement("input"));
    setAgentDots(row, name, [agents[0]], true);
    const again = { siblings: row.querySelectorAll(":scope > .agent-dots").length, colours: [...beside.children].map(dot => (dot as HTMLElement).dataset.agentColour) };
    // None: dots and busy state go.
    setAgentDots(row, name, [], true);
    setAgentDots(row, label, []);
    return { first, kept, beside: beside.classList.contains("agent-dots"), again, left: row.querySelectorAll(".agent-dots").length, busy: row.getAttribute("aria-busy") };
  });
  assert.deepEqual(seen.first, { holder: true, colours: ["0", "1"], title: "Header writer, Copy editor at work here", busy: "true" });
  assert.equal(seen.kept, true);
  assert.equal(seen.beside, true);
  assert.deepEqual(seen.again, { siblings: 1, colours: ["0"] });
  assert.equal(seen.left, 0);
  assert.equal(seen.busy, null);
}));

test("Pages and files: another page's row wears its agents' dots, the page shown's none, kept across renders", () => inBrowser(async page => {
  const seen = await page.evaluate(() => {
    const { createPagesTree, buildNativePagesTree } = (globalThis as typeof globalThis & { dotsFactories: Factories }).dotsFactories;
    const tree = createPagesTree({ open() {}, plan: () => ({ ok: false, error: "no" }), create: async () => undefined, announce() {} });
    document.body.append(tree.root);
    const site = buildNativePagesTree({ routes: { "/": "index.html", "/about/": "about/index.html", "/contact/": "contact.html" } });
    const dots = () => Object.fromEntries([...tree.root.querySelectorAll<HTMLElement>("[role='treeitem']")].map(row => [row.dataset.file,
      { colours: [...row.querySelectorAll<HTMLElement>(".agent-dots__dot")].map(dot => dot.dataset.agentColour).join(","), busy: row.getAttribute("aria-busy") }]));
    tree.render(site, "index.html");
    const marks = [
      { key: "a", name: "Header writer", colour: 0, path: "index.html", node: [1, 0], asking: false },
      { key: "b", name: "Copy editor", colour: 1, path: "about/index.html", asking: false },
      { key: "c", name: "Link checker", colour: 3, path: "about/index.html", node: [1, 1], asking: true },
    ];
    tree.agents(marks);
    const shownHome = dots();
    // Another page shown: its own row loses the dots, Home's row gains its agent's.
    tree.render(site, "about/index.html");
    const shownAbout = dots();
    tree.agents([]);
    return { shownHome, shownAbout, none: dots() };
  });
  assert.deepEqual(seen.shownHome, {
    "index.html": { colours: "", busy: null }, "about/index.html": { colours: "1,3", busy: "true" }, "contact.html": { colours: "", busy: null } });
  assert.deepEqual(seen.shownAbout, {
    "index.html": { colours: "0", busy: "true" }, "about/index.html": { colours: "", busy: null }, "contact.html": { colours: "", busy: null } });
  assert.deepEqual(Object.values(seen.none).map(row => row.colours + (row.busy ?? "")), ["", "", ""]);
}));
