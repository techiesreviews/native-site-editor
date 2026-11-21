import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { createAppStore } from "../src/app-store";
import { createDraftStore } from "../src/draft-store";
import { createGuardedEdits } from "../src/guarded-edit";
import { createWorkspaceSession } from "../src/workspace-session";
import { createMemoryWorkspace } from "./fakes/memory-workspace";
import { shownSiteName, siteNameShownEdits } from "../src/page-builder/site-name-shown";
import { readHeadSettings } from "../src/page-builder/site-head";
import { NATIVE_STARTER_VERSION } from "../shared/native-starter-version";
import type { createSetupActions } from "../src/setup-actions";

// TOOLS-188 new-user test: Name your site in the Inbox saved the name in
// .editor/config.json, but the page still said "Larkspur Studio" in its title,
// its header and over its headline. The name now shows where the Starter shows it.

const starter = (path: string) => readFileSync(`public/native-static-starter/${NATIVE_STARTER_VERSION}/files/${path}.asset`, "utf8");
const pagePaths = ["index.html", "about/index.html", "404.html", "work/fern-and-kettle/index.html", "work/harbour-lane-pottery/index.html", "work/meadow-row-allotments/index.html"];
const templatePaths = ["components/site-header/site-header.html", "components/site-footer/site-footer.html", "components/section-hero/section-hero.html"];
const starterFiles = () => ({
  pages: new Map(pagePaths.map((path) => [path, starter(path)])),
  templates: new Map(templatePaths.map((path) => [path, starter(path)])),
});

test("the Starter shows Larkspur Studio as its name, set off by ' · ' in each title", () => {
  assert.deepEqual(shownSiteName(starterFiles().pages), { name: "Larkspur Studio", separator: " · " });
});

test("Name your site's name replaces the Starter's in titles, sharing tags, the header brand and the home eyebrow", () => {
  const edits = siteNameShownEdits(starterFiles(), "Bean & Leaf");
  const home = readHeadSettings(edits.get("index.html")!);
  assert.equal(home.title, "Small, editable websites for independent businesses · Bean & Leaf");
  assert.equal(home["og:title"], "Small, editable websites for independent businesses · Bean & Leaf");
  assert.equal(home["og:site_name"], "Bean & Leaf");
  assert.match(edits.get("index.html")!, /<p slot="eyebrow" class="eyebrow">Bean &amp; Leaf<\/p>/);
  assert.equal(readHeadSettings(edits.get("about/index.html")!).title, "About · Bean & Leaf");
  assert.equal(readHeadSettings(edits.get("work/fern-and-kettle/index.html")!).title, "Fern & Kettle · Bean & Leaf");
  assert.match(edits.get("components/site-header/site-header.html")!, /<a class="brand" href="\/">Bean &amp; Leaf<\/a>/);
  assert.match(edits.get("components/section-hero/section-hero.html")!, /<p class="eyebrow">Bean &amp; Leaf<\/p>/);
  // A sentence that mentions the old name is the owner's to rewrite.
  assert.ok(!edits.has("components/site-footer/site-footer.html"));
  for (const text of edits.values()) assert.doesNotMatch(text.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "").replace(/Larkspur Studio,|About Larkspur|Larkspur is|Larkspur Studio:/g, ""), /<title>[^<]*Larkspur|>Larkspur(?: Studio)?</);
});

test("a second name replaces the first, and the same name changes nothing", () => {
  const first = starterFiles();
  for (const [path, text] of siteNameShownEdits(first, "Acme")) (first.pages.has(path) ? first.pages : first.templates).set(path, text);
  assert.deepEqual(shownSiteName(first.pages), { name: "Acme", separator: " · " });
  const second = siteNameShownEdits(first, "Beta Works");
  assert.equal(readHeadSettings(second.get("about/index.html")!).title, "About · Beta Works");
  assert.match(second.get("components/site-header/site-header.html")!, />Beta Works<\/a>/);
  assert.equal(siteNameShownEdits(first, "Acme").size, 0);
  assert.equal(siteNameShownEdits(first, "  ").size, 0);
});

// The real writeSiteSettings, over the memory workspace (as tests/setup-actions.test.ts does).
const bundled = build({ entryPoints: ["src/setup-actions.ts"], bundle: true, write: false, format: "esm", platform: "node", loader: { ".css": "empty" },
  plugins: [{ name: "no-dialog", setup(plugin) {
    plugin.onResolve({ filter: /^\.\/components\/confirm-dialog$/ }, () => ({ path: "dialog", namespace: "test" }));
    plugin.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const createConfirmDialog = () => { throw new Error('Unused'); };" }));
  } }],
}).then((result) => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`));

test("saving the name from the Inbox drafts the config and the pages and header that show the name, as one step", async () => {
  const files = starterFiles();
  const branch: Record<string, string> = { ".editor/config.json": '{\n  "site": {\n    "name": "My site"\n  }\n}\n' };
  for (const [path, text] of [...files.pages, ...files.templates]) branch[path] = text;
  const routes = { "/": "index.html", "/about/": "about/index.html", "/404.html": "404.html", "/work/fern-and-kettle/": "work/fern-and-kettle/index.html",
    "/work/harbour-lane-pottery/": "work/harbour-lane-pottery/index.html", "/work/meadow-row-allotments/": "work/meadow-row-allotments/index.html" };
  const components = Object.fromEntries(templatePaths.map((path) => [path.split("/")[1], path]));
  const workspace = createMemoryWorkspace({ branch, site: { routes, components }, open: "index.html" });
  const appStore = createAppStore(createDraftStore()), session = createWorkspaceSession();
  appStore.repository.value = { id: 1, name: "my-site", full_name: "lex/my-site", private: true, default_branch: "main", owner: { login: "lex", type: "User" } };
  appStore.snapshot.value = { branch: "main", commit: "commit", entries: [] };
  let siteReads = 0;
  const ports = {
    begin: () => session.begin(), appStore, guardedEdits: createGuardedEdits(workspace.workspace), nativeBaseSources: new Map<string, string>(),
    branchText: async () => undefined, readSite: async () => { siteReads++; return undefined; },
  } satisfies Pick<Parameters<typeof createSetupActions>[0], "begin" | "appStore" | "guardedEdits" | "nativeBaseSources" | "branchText" | "readSite">;
  const module = await bundled;
  try {
    assert.equal(await module.createSetupActions(ports).writeSiteSettings({ name: "Bean & Leaf" }), undefined);
    assert.equal(workspace.announced.at(-1), "Site name set as a draft. Publish to keep it.");
    assert.equal(siteReads, 1, "every page and template is read before the step is planned");
    assert.equal(JSON.parse(workspace.source(".editor/config.json")!).site.name, "Bean & Leaf");
    assert.equal(readHeadSettings(workspace.source("index.html")!).title, "Small, editable websites for independent businesses · Bean & Leaf");
    assert.match(workspace.source("components/site-header/site-header.html")!, />Bean &amp; Leaf<\/a>/);
    assert.deepEqual(workspace.steps(), ["operation"]);
    assert.ok(workspace.undo());
    assert.equal(readHeadSettings(workspace.source("index.html")!).title, "Small, editable websites for independent businesses · Larkspur Studio");
    assert.equal(JSON.parse(workspace.source(".editor/config.json")!).site.name, "My site");
  } finally {
    appStore.dispose();
  }
});
