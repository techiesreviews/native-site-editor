import { test } from "node:test";
import assert from "node:assert/strict";
import { createPagesController, type PagesPorts, type PagesOperation } from "../src/controllers/pages-controller.ts";
import type { SavedDraft } from "../src/drafts.ts";

const target = { file: "about/index.html", route: "/about/", label: "About", home: false, subpages: 0, isNew: false };
function fixture(overrides: Partial<PagesPorts> = {}) {
  const sources = new Map<string, string>([
    ["index.html", '<head><title>Home</title></head><body><a href="/about/">About</a></body>'],
    ["about/index.html", '<head><title>About</title></head><body><h1>About</h1></body>'],
  ]);
  let epoch = 1;
  const drafts: SavedDraft[] = [];
  const operations: PagesOperation[] = [], errors: string[] = [], announcements: string[] = [];
  const site = { routes: { "/": "index.html", "/about/": "about/index.html" }, components: {} };
  const ports: PagesPorts = {
    site: () => site, routeForPath: (path) => Object.entries(site.routes).find(([, file]) => file === path)?.[0],
    source: (path) => sources.get(path), files: () => [...sources.keys()], baseFiles: () => [...sources.keys()],
    drafts: () => drafts, hasDraftScope: () => true, scope: () => "lex/site/main", generation: () => epoch, indexScope: () => "commit-a",
    exists: (path) => sources.has(path), routeInfo: () => ({ title: "About" }), pageLabel: () => "About", titles: () => ({}), address: () => undefined,
    writeMeta: async () => undefined, commitPage: async () => undefined,
    operation: async (operation) => { operations.push(operation); return undefined; }, ensureIndex: async () => undefined,
    readRedirects: async () => undefined, withMovedPageUrls: () => {}, pageLinks: () => undefined, cardsLinkingTo: () => undefined,
    confirmation: () => ({ ask: async () => true, choose: async () => ({ value: "move", option: false }) }),
    picker: () => ({ pick: async () => "/news/" }), refreshMeta: () => {}, refreshPages: () => {}, refreshLabel: () => {},
    announce: (message) => announcements.push(message), error: (error) => errors.push(error.message), ...overrides,
  };
  return { ports, controller: createPagesController(ports), sources, drafts, operations, errors, announcements, navigate: () => { epoch++; } };
}

test("URL planning preserves unchanged and occupied refusals plus the complete link summary", () => {
  const f = fixture();
  assert.deepEqual(f.controller.urlPlan(target.file, target.route), { ok: false, error: "", unchanged: true });
  assert.equal(f.controller.urlPlan(target.file, "/").ok, false);
  const plan = f.controller.urlPlan(target.file, "/news/");
  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.match(plan.message, /updates 1 link in 1 file/);
    assert.equal(plan.redirect?.checked, true);
  }
  assert.match(f.controller.dropProblem(target, "/about/sub/" )!, /itself/);
});

test("a normal confirmed move passes exact source proof to the host transaction", async () => {
  const f = fixture();
  await f.controller.confirmMove(target, "/news/");
  assert.equal(f.errors.length, 0);
  assert.equal(f.operations.length, 1);
  const operation = f.operations[0];
  assert.equal(operation.expectedSources?.get("index.html"), f.sources.get("index.html"));
  assert.equal(operation.expectedSources?.has("_redirects"), true);
  assert.equal(operation.current?.(), true);
  assert.deepEqual(operation.moves, [{ from: "about/index.html", to: "news/about/index.html" }]);
  f.navigate();
  assert.equal(operation.current?.(), false);
});

test("navigation while indexing refuses a move before displaying confirmation", async () => {
  const f = fixture();
  let confirms = 0;
  f.ports.ensureIndex = async () => { f.navigate(); return undefined; };
  f.ports.confirmation = () => ({ ask: async () => true, choose: async () => { confirms++; return { value: "move", option: false }; } });
  await f.controller.confirmMove(target, "/news/");
  assert.equal(confirms, 0);
  assert.equal(f.operations.length, 0);
  assert.match(f.errors[0], /changed meanwhile/);
});

test("source edits during confirmation cannot adopt a stale move plan", async () => {
  const f = fixture();
  f.ports.confirmation = () => ({ ask: async () => true, choose: async () => {
    f.sources.set("index.html", "agent changed the links");
    return { value: "move", option: false };
  } });
  await f.controller.confirmMove(target, "/news/");
  assert.equal(f.operations.length, 0);
  assert.match(f.errors[0], /changed meanwhile/);
});

test("picker navigation and index refusal stop before any move transaction", async () => {
  const f = fixture();
  f.ports.picker = () => ({ pick: async () => { f.navigate(); return "/news/"; } });
  await f.controller.moveTo(target);
  assert.equal(f.operations.length, 0);
  assert.match(f.errors[0], /changed meanwhile/);
  const refused = fixture({ ensureIndex: async () => "The site index could not be read." });
  await refused.controller.confirmMove(target, "/news/");
  assert.deepEqual(refused.errors, ["The site index could not be read."]);
  assert.equal(refused.operations.length, 0);
});

test("URL changes reject source drift while redirects are read", async () => {
  const f = fixture();
  f.ports.readRedirects = async () => { f.sources.set(target.file, "edited while reading"); return undefined; };
  assert.match((await f.controller.changeUrl(target.file, "/news/", true))!, /changed while preparing/);
  assert.equal(f.operations.length, 0);
});

test("delete refuses draft mutation during indexing even before that target's source is loaded", async () => {
  const f = fixture();
  f.ports.source = () => undefined;
  f.ports.ensureIndex = async () => {
    f.drafts.push({ account: "lex", repoId: 1, repo: "lex/site", branch: "main", version: 1, path: target.file, baseSha: "sha", original: "", content: "changed", updatedAt: 1 });
    return undefined;
  };
  await f.controller.remove(target);
  assert.equal(f.operations.length, 0);
  assert.match(f.errors[0], /changed meanwhile/);
});

test("delete carries opening sources to the host so dialog-time edits are refused", async () => {
  const f = fixture();
  const original = f.sources.get(target.file);
  f.ports.confirmation = () => ({ ask: async () => { f.sources.set(target.file, "agent edit"); return true; }, choose: async () => ({ value: "confirm", option: false }) });
  f.ports.operation = async (operation) => {
    assert.equal(operation.expectedSources?.get(target.file), original);
    return [...operation.expectedSources!].some(([path, source]) => f.sources.get(path) !== source) ? "The source changed." : undefined;
  };
  await f.controller.remove(target);
  assert.deepEqual(f.errors, ["The source changed."]);
  assert.equal(f.sources.get(target.file), "agent edit");
});

test("duplicate uses the edited source and a free copy URL; failed retitle does not refresh", async () => {
  let copied: Parameters<PagesPorts["commitPage"]>[0] | undefined;
  const f = fixture({ commitPage: async (page) => { copied = page; return undefined; } });
  await f.controller.duplicate(target.file);
  assert.equal(copied?.file, "about-copy/index.html");
  assert.match(copied!.content, /<title>About \(copy\)<\/title>/);
  let refreshed = false;
  f.ports.writeMeta = async () => "The source changed.";
  f.ports.refreshMeta = () => { refreshed = true; };
  assert.equal(await f.controller.retitle(target.file, "New"), "The source changed.");
  assert.equal(refreshed, false);
});

test("index hydration is allowed, then newly known source edits during the picker are refused", async () => {
  for (const changeDuringPicker of [false, true]) {
    const f = fixture();
    let hydrated = false;
    f.ports.source = (path) => path === target.file && !hydrated ? undefined : f.sources.get(path);
    f.ports.ensureIndex = async () => { hydrated = true; return undefined; };
    f.ports.picker = () => ({ pick: async () => {
      if (changeDuringPicker) f.sources.set(target.file, "changed after hydration");
      return "/news/";
    } });
    await f.controller.moveTo(target);
    assert.equal(f.operations.length, changeDuringPicker ? 0 : 1);
    if (changeDuringPicker) assert.match(f.errors[0], /changed meanwhile/);
    else assert.deepEqual(f.errors, []);
  }
});

test("retitle accepts its own metadata write rebuilding site identity and refreshes all three views", async () => {
  const f = fixture();
  let site = f.ports.site()!;
  f.ports.site = () => site;
  f.ports.routeForPath = file => Object.entries(site.routes).find(([, path]) => path === file)?.[0];
  const refreshes: string[] = [];
  f.ports.refreshMeta = () => { refreshes.push("meta"); };
  f.ports.refreshPages = () => { refreshes.push("pages"); };
  f.ports.refreshLabel = () => { refreshes.push("label"); };
  f.ports.writeMeta = async () => {
    f.sources.set(target.file, '<head><title>New title</title></head><body><h1>About</h1></body>');
    site = { ...site, routes: { ...site.routes } };
    return undefined;
  };
  assert.equal(await f.controller.retitle(target.file, "New title"), undefined);
  assert.deepEqual(refreshes, ["meta", "pages", "label"]);
});

test("retitle refuses generation, scope or target-route drift after metadata writing", async () => {
  for (const change of ["generation", "scope", "route", "missing-route"]) {
    const f = fixture();
    const refreshes: string[] = [];
    f.ports.refreshMeta = () => { refreshes.push("meta"); };
    f.ports.refreshPages = () => { refreshes.push("pages"); };
    f.ports.refreshLabel = () => { refreshes.push("label"); };
    f.ports.writeMeta = async () => {
      if (change === "generation") f.navigate();
      else if (change === "scope") f.ports.scope = () => "other/site/main";
      else f.ports.routeForPath = () => change === "route" ? "/moved/" : undefined;
      return undefined;
    };
    assert.match((await f.controller.retitle(target.file, "New title"))!, /repository changed meanwhile/);
    assert.deepEqual(refreshes, []);
  }
});
