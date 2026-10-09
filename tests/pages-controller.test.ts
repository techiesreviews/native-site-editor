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
    exists: (path) => sources.has(path), routeInfo: () => ({ title: "About" }), titles: () => ({}), siteUrl: () => undefined,
    writeMeta: async () => undefined, commitPage: async () => undefined,
    operation: async (operation) => { operations.push(operation); return undefined; }, ensureIndex: async () => undefined,
    readRedirects: async () => undefined, withMovedPageUrls: () => {}, pageLinks: () => undefined, cardsLinkingTo: () => undefined,
    confirmation: () => ({ ask: async () => true, choose: async () => ({ value: "move", option: false }) }),
    picker: () => ({ pick: async () => "/news/" }), refreshMeta: () => {}, refreshLabel: () => {},
    tree: () => undefined, pagesHidden: () => false, openFile: () => undefined, clearPendingTitles: () => {},
    tabsMounted: () => true, paintTabs: () => {}, resetExplorer: () => {}, showImages: () => {},
    siteReadForCreate: async () => undefined, createWithCard: () => undefined, navigationTarget: () => undefined, restoreDeleted: () => {},
    announce: (message) => announcements.push(message), refuse: (message) => announcements.push(message), error: (error) => errors.push(error.message), ...overrides,
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
  f.ports.tree = () => ({ render: () => { refreshes.push("pages"); } });
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
    f.ports.tree = () => ({ render: () => { refreshes.push("pages"); } });
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

test("reading a previously unread link source during confirmation adopts its current contents", async () => {
  const f = fixture();
  const path = "unread.html";
  const content = '<head><title>Unread</title></head><body><a href="/about/">About</a></body>';
  f.sources.set(path, content);
  let loaded = false;
  f.ports.source = file => file === path && !loaded ? undefined : f.sources.get(file);
  f.ports.confirmation = () => ({ ask: async () => true, choose: async () => {
    loaded = true;
    return { value: "move", option: false };
  } });
  await f.controller.confirmMove(target, "/news/");
  assert.deepEqual(f.errors, []);
  assert.equal(f.operations.length, 1);
  assert.equal(f.operations[0].expectedSources?.get(path), content);
  assert.match(f.operations[0].edits?.get(path) ?? "", /href="\/news\/about\/"/);
});

test("explorer tabs keep the chosen tab for native sites, reset to Pages and show only files otherwise", () => {
  const f = fixture();
  const painted: [string, boolean][] = [];
  let resets = 0, images = 0, renders = 0;
  f.ports.paintTabs = (tab, native) => { painted.push([tab, native]); };
  f.ports.resetExplorer = () => { resets++; };
  f.ports.showImages = () => { images++; };
  f.ports.tree = () => ({ render: () => { renders++; } });
  assert.equal(f.controller.explorerTab(), "pages");
  f.controller.selectTab("images");
  assert.equal(f.controller.explorerTab(), "images");
  assert.deepEqual(painted.at(-1), ["images", true]);
  assert.equal(images, 1);
  assert.equal(renders, 0);
  f.controller.selectTab("pages");
  assert.equal(renders, 1);
  f.controller.selectTab("files");
  f.controller.updateTabs(true);
  assert.deepEqual(painted.at(-1), ["pages", true]);
  assert.equal(resets, 0);
  f.ports.site = () => undefined;
  f.controller.selectTab("images");
  assert.deepEqual(painted.at(-1), ["files", false]);
  assert.equal(f.controller.explorerTab(), "images");
  assert.equal(resets, 1);
  f.ports.tabsMounted = () => false;
  const count = painted.length;
  f.controller.updateTabs(true);
  assert.equal(painted.length, count);
  assert.equal(f.controller.explorerTab(), "images");
});

test("the Pages tree renders live routes, new drafts and the open file, and consumes pending titles", () => {
  const f = fixture();
  const rendered: { tree: unknown; open: string | undefined; focus: unknown }[] = [];
  let cleared = 0;
  f.ports.clearPendingTitles = () => { cleared++; };
  f.ports.tree = () => ({ render: (tree, open, focus) => { rendered.push({ tree, open, focus }); } });
  f.ports.openFile = () => "about/index.html";
  f.drafts.push({ account: "lex", repoId: 1, owner: "lex", repo: "site", branch: "main", version: 1, path: "about/index.html", baseSha: null, original: "", content: "", updatedAt: 1 } as SavedDraft);
  f.controller.renderTree({ route: "/about/" });
  assert.equal(cleared, 1);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].open, "about/index.html");
  assert.deepEqual(rendered[0].focus, { route: "/about/" });
  const about = JSON.stringify(rendered[0].tree);
  assert.match(about, /"route":"\/about\/"[^}]*"isNew":true|"isNew":true[^}]*"route":"\/about\/"/);
  f.ports.pagesHidden = () => true;
  f.controller.renderTree();
  f.ports.pagesHidden = () => false;
  f.ports.site = () => undefined;
  f.controller.renderTree();
  assert.equal(rendered.length, 1);
  assert.equal(cleared, 1);
});

test("new-page planning checks the target only while typing and needs the home page to create", () => {
  const f = fixture();
  assert.deepEqual(f.controller.planNew({ parent: "/", title: " ", slug: "x" }), { ok: false, error: "Enter the page's title." });
  assert.match((f.controller.planNew({ parent: "/", title: "News", slug: " " }) as { error: string }).error, /title gives no URL/);
  assert.equal(f.controller.planNew({ parent: "/", title: "About", slug: "about" }).ok, false);
  const typing = f.controller.planNew({ parent: "/", title: " News ", slug: "news" });
  assert.deepEqual(typing, { ok: true, value: { ...(typing.ok ? typing.value : {}), title: "News", content: "" } });
  assert.equal(typing.ok && typing.value.file, "news/index.html");
  f.ports.siteUrl = () => "https://example.com";
  f.sources.set("index.html", '<head><title>Home</title><link rel="canonical" href="https://example.com/"></head><body></body>');
  const created = f.controller.planNew({ parent: "/", title: "News", slug: "news" }, true);
  assert.equal(created.ok, true);
  if (created.ok) {
    assert.match(created.value.content, /<title>News/);
    assert.match(created.value.content, /https:\/\/example\.com\/news\//);
  }
  f.ports.source = () => undefined;
  assert.deepEqual(f.controller.planNew({ parent: "/", title: "News", slug: "news" }, true), { ok: false, error: "The home page is not read yet. Try again in a moment." });
  f.ports.hasDraftScope = () => false;
  assert.deepEqual(f.controller.planNew({ parent: "/", title: "News", slug: "news" }), { ok: false, error: "Open a native site first." });
});

test("page labels and addresses read the live site and config", () => {
  const f = fixture();
  assert.equal(f.controller.pageLabel("about/index.html"), "About");
  assert.equal(f.controller.pageLabel("missing.html"), "missing.html");
  assert.equal(f.controller.address("/about/"), undefined);
  f.ports.siteUrl = () => "https://example.com/";
  assert.equal(f.controller.address("/about/"), "https://example.com/about/");
});

test("creating a page reads the site first and commits it with the planned file and route", async () => {
  const f = fixture();
  const commits: { file: string; route: string; title: string }[] = [];
  f.ports.commitPage = async (page) => { commits.push(page); return undefined; };
  f.ports.siteReadForCreate = async () => "The repository changed meanwhile. Try again.";
  assert.equal(await f.controller.createNew({ parent: "/", title: "News", slug: "news" }), "The repository changed meanwhile. Try again.");
  assert.equal(commits.length, 0);
  f.ports.siteReadForCreate = async () => undefined;
  assert.equal(await f.controller.createNew({ parent: "/", title: "News", slug: "news" }), undefined);
  assert.deepEqual(commits.map(({ file, route, title }) => ({ file, route, title })), [{ file: "news/index.html", route: "/news/", title: "News" }]);
  let carded = 0;
  f.ports.createWithCard = async () => { carded++; return "card"; };
  assert.equal(await f.controller.createNew({ parent: "/", title: "Blog", slug: "blog", addCard: true }), "card");
  assert.equal(carded, 1);
  assert.equal(commits.length, 1);
});

test("add to navigation refuses drift during indexing and otherwise sends one guarded operation", async () => {
  const nav = '<head><title>Home</title></head><body><nav><ul><li><a href="/about/">About</a></li></ul></nav></body>';
  for (const drift of ["generation", "scope", "source", "none"]) {
    const f = fixture();
    f.sources.set("index.html", nav);
    f.ports.ensureIndex = async () => {
      if (drift === "generation") f.navigate();
      else if (drift === "scope") f.ports.scope = () => "other/site/main";
      else if (drift === "source") f.sources.set("about/index.html", "changed");
      return undefined;
    };
    f.ports.navigationTarget = (path) => {
      const source = path ? f.sources.get(path) : undefined;
      return source ? { path: path!, source, list: { links: [{ href: "/about/", label: "About" }] } as never, shared: false } : undefined;
    };
    const result = await f.controller.createNew({ parent: "/", title: "News", slug: "news", addToNavigation: true });
    if (drift !== "none") {
      assert.equal(result, "The page template or repository changed. Create the page again.");
      assert.equal(f.operations.length, 0);
      continue;
    }
    assert.equal(f.operations.length, 1);
    const operation = f.operations[0];
    assert.equal(operation.open, "news/index.html");
    assert.equal(operation.creates?.[0].path, "news/index.html");
    assert.equal(operation.expectedSources?.get("index.html"), nav);
    assert.equal(operation.edits?.has("index.html"), true);
    assert.match(operation.done, /added it to navigation/);
  }
});

test("a folder URL's Create page restores a deleted draft, refuses an occupied URL, else commits", async () => {
  const f = fixture();
  const commits: string[] = [], restored: string[] = [];
  f.ports.commitPage = async (page) => { commits.push(page.file); return undefined; };
  f.ports.restoreDeleted = (file) => { restored.push(file); };
  await f.controller.createFolderPage("/about/");
  assert.match(f.errors[0], /has a page already/);
  f.drafts.push({ account: "lex", repoId: 1, owner: "lex", repo: "site", branch: "main", version: 1, path: "news/index.html", baseSha: "a", original: "", content: "", updatedAt: 1, deleted: true } as SavedDraft);
  await f.controller.createFolderPage("/news/");
  assert.deepEqual(restored, ["news/index.html"]);
  await f.controller.createFolderPage("/blog/");
  assert.deepEqual(commits, ["blog/index.html"]);
  f.ports.siteReadForCreate = async () => "unread";
  await f.controller.createFolderPage("/docs/");
  assert.equal(f.errors.at(-1), "unread");
  assert.deepEqual(commits, ["blog/index.html"]);
});

test("Add card without card grids falls through to the plain page commit", async () => {
  const f = fixture();
  const commits: string[] = [];
  f.ports.commitPage = async (page) => { commits.push(page.file); return undefined; };
  f.ports.createWithCard = () => undefined;
  assert.equal(await f.controller.createNew({ parent: "/", title: "News", slug: "news", addCard: true }), undefined);
  assert.deepEqual(commits, ["news/index.html"]);
});

test("a folder page is not created when the site or draft scope goes while the site is read", async () => {
  for (const loss of ["site", "scope"]) {
    const f = fixture();
    const commits: string[] = [];
    f.ports.commitPage = async (page) => { commits.push(page.file); return undefined; };
    f.ports.siteReadForCreate = async () => {
      if (loss === "site") f.ports.site = () => undefined;
      else f.ports.hasDraftScope = () => false;
      return undefined;
    };
    await f.controller.createFolderPage("/blog/");
    assert.deepEqual(commits, []);
    assert.deepEqual(f.errors, []);
  }
});
