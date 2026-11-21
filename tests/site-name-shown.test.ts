import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { createAppStore } from "../src/app-store";
import { createDraftStore } from "../src/draft-store";
import { createGuardedEdits } from "../src/guarded-edit";
import { createWorkspaceSession } from "../src/workspace-session";
import { createMemoryWorkspace } from "./fakes/memory-workspace";
import { forEachAwait } from "./support/await-race";
import { shownSiteName, siteNameShownEdits } from "../src/page-builder/site-name-shown";
import { readHeadSettings } from "../src/page-builder/site-head";
import { NATIVE_STARTER_VERSION } from "../shared/native-starter-version";
import { blankSiteFiles } from "../shared/starting-point";
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
  for (const text of edits.values()) assert.doesNotMatch(text.replace(/Larkspur Studio,|About Larkspur|Larkspur is|Larkspur Studio:/g, ""), /<title>[^<]*Larkspur|>Larkspur(?: Studio)?<|"name": "Larkspur/);
});

test("the search engines' copy of the name (the home page's structured data) says the new name too, safely inside its script", () => {
  const home = siteNameShownEdits(starterFiles(), "Bean </script> & \"Leaf\"").get("index.html")!;
  const data = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
  assert.deepEqual(data["@graph"].map((node: { name: string }) => node.name), ["Bean </script> & \"Leaf\"", "Bean </script> & \"Leaf\""]);
  // Its descriptions mention the name in a sentence: the owner's to rewrite.
  assert.match(data["@graph"][0].description, /^Larkspur is a two-person/);
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

test("the Blank page's title and sharing title, which are only its name, become the new name", () => {
  const blank = new Map(blankSiteFiles("My site", "").filter((file) => file.path.endsWith(".html")).map((file) => [file.path, file.content] as const));
  const home = readHeadSettings(siteNameShownEdits({ pages: blank, templates: new Map() }, "Blank Studio").get("index.html")!);
  assert.deepEqual([home.title, home["og:title"], home["og:site_name"]], ["Blank Studio", "Blank Studio", "Blank Studio"]);
});

test("a name with a separator in it (Bean - Leaf) is replaced whole by the next name", () => {
  const files = starterFiles();
  for (const [path, text] of siteNameShownEdits(files, "Bean - Leaf")) (files.pages.has(path) ? files.pages : files.templates).set(path, text);
  assert.deepEqual(shownSiteName(files.pages), { name: "Bean - Leaf", separator: " · " });
  const second = siteNameShownEdits(files, "Beta Works");
  assert.equal(readHeadSettings(second.get("about/index.html")!).title, "About · Beta Works");
  assert.match(second.get("components/site-header/site-header.html")!, />Beta Works<\/a>/);
});

test("a first name with < in it is still replaced in the structured data by the next name", () => {
  const files = starterFiles();
  for (const [path, text] of siteNameShownEdits(files, "Bean <b> Leaf")) (files.pages.has(path) ? files.pages : files.templates).set(path, text);
  const home = siteNameShownEdits(files, "Second").get("index.html")!;
  const data = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
  assert.deepEqual(data["@graph"].map((node: { name: string }) => node.name), ["Second", "Second"]);
});

// The real writeSiteSettings, over the memory workspace (as tests/setup-actions.test.ts does).
const bundled = build({ entryPoints: ["src/setup-actions.ts"], bundle: true, write: false, format: "esm", platform: "node", loader: { ".css": "empty" },
  plugins: [{ name: "no-dialog", setup(plugin) {
    plugin.onResolve({ filter: /^\.\/components\/confirm-dialog$/ }, () => ({ path: "dialog", namespace: "test" }));
    plugin.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const createConfirmDialog = () => { throw new Error('Unused'); };" }));
  } }],
}).then((result) => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`));

type SetupPorts = Parameters<typeof createSetupActions>[0];

/** The Starter's pages and templates in the memory workspace, with Save name's ports; `config` is the branch's .editor/config.json, if any. */
function nameScenario(config: string | undefined, wrap: { branchText?: SetupPorts["branchText"]; readSite?: SetupPorts["readSite"] } = {}) {
  const files = starterFiles();
  const branch: Record<string, string> = config === undefined ? {} : { ".editor/config.json": config };
  for (const [path, text] of [...files.pages, ...files.templates]) branch[path] = text;
  const routes = { "/": "index.html", "/about/": "about/index.html", "/404.html": "404.html", "/work/fern-and-kettle/": "work/fern-and-kettle/index.html",
    "/work/harbour-lane-pottery/": "work/harbour-lane-pottery/index.html", "/work/meadow-row-allotments/": "work/meadow-row-allotments/index.html" };
  const components = Object.fromEntries(templatePaths.map((path) => [path.split("/")[1], path]));
  const workspace = createMemoryWorkspace({ branch, site: { routes, components }, open: "index.html" });
  const appStore = createAppStore(createDraftStore()), session = createWorkspaceSession();
  appStore.repository.value = { id: 1, name: "my-site", full_name: "lex/my-site", private: true, default_branch: "main", owner: { login: "lex", type: "User" } };
  appStore.snapshot.value = { branch: "main", commit: "commit", entries: [] };
  const counts = { siteReads: 0 };
  const ports = {
    begin: () => session.begin(), appStore, guardedEdits: createGuardedEdits(workspace.workspace), nativeBaseSources: new Map<string, string>(),
    branchText: wrap.branchText ?? (async () => undefined), readSite: wrap.readSite ?? (async () => { counts.siteReads++; return undefined; }),
  } satisfies Pick<SetupPorts, "begin" | "appStore" | "guardedEdits" | "nativeBaseSources" | "branchText" | "readSite">;
  return { workspace, appStore, ports, counts };
}

test("saving the name from the Inbox drafts the config and the pages and header that show the name, as one step", async () => {
  const { workspace, appStore, ports, counts } = nameScenario('{\n  "site": {\n    "name": "My site"\n  }\n}\n');
  const siteReads = () => counts.siteReads;
  const module = await bundled;
  try {
    assert.equal(await module.createSetupActions(ports).writeSiteSettings({ name: "Bean & Leaf" }), undefined);
    assert.equal(workspace.announced.at(-1), "Site name set as a draft. Publish to keep it.");
    assert.equal(siteReads(), 1, "every page and template is read before the step is planned");
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

test("a switch to another site while Save name reads the config or the pages writes no draft and says the repository changed", async () => {
  const module = await bundled;
  const awaits = await forEachAwait(race => {
    const scenario = nameScenario(undefined, {
      branchText: race.port("branchText", async () => undefined),
      readSite: race.port("readSite", async () => undefined),
    });
    const outcome = { message: undefined as string | undefined };
    const done = module.createSetupActions(scenario.ports).writeSiteSettings({ name: "Bean & Leaf" })
      .then((message: string | undefined) => { outcome.message = message; })
      .finally(() => scenario.appStore.dispose());
    return { ...scenario, outcome, done };
  }, run => {
    run.workspace.setScope("lex/other@main");
  }, run => {
    assert.equal(run.outcome.message, "The repository changed meanwhile. Try again.");
    assert.equal(run.workspace.source(".editor/config.json"), undefined);
    for (const path of [...pagePaths, ...templatePaths]) assert.equal(run.workspace.draft(path), undefined, path);
    assert.deepEqual(run.workspace.steps(), []);
  });
  assert.equal(awaits, 2);
});

test("when the pages could not be read, Save name sets nothing and says so, and a try once they can be read sets the name everywhere", async () => {
  const header = "components/site-header/site-header.html";
  const reads = { fail: true };
  const { workspace, appStore, ports } = nameScenario('{\n  "site": {\n    "name": "My site"\n  }\n}\n', {
    readSite: async () => { if (reads.fail) throw new Error("GitHub said no"); },
  });
  const module = await bundled;
  try {
    const actions = module.createSetupActions(ports);
    assert.equal(await actions.writeSiteSettings({ name: "Bean & Leaf" }), "The site's pages could not be read, so the name was not set. Try again.");
    assert.equal(JSON.parse(workspace.source(".editor/config.json")!).site.name, "My site");
    for (const path of [...pagePaths, ...templatePaths]) assert.equal(workspace.draft(path), undefined, path);
    assert.deepEqual(workspace.steps(), []);
    reads.fail = false;
    assert.equal(await actions.writeSiteSettings({ name: "Bean & Leaf" }), undefined);
    assert.equal(JSON.parse(workspace.source(".editor/config.json")!).site.name, "Bean & Leaf");
    assert.match(workspace.source(header)!, />Bean &amp; Leaf<\/a>/);
  } finally {
    appStore.dispose();
  }
});
