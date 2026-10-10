import { test } from "node:test";
import assert from "node:assert/strict";
import { createPagesController, type PagesPorts } from "../src/controllers/pages-controller";
import { createGuardedEdits } from "../src/guarded-edit";
import { createMemoryWorkspace } from "./fakes/memory-workspace";
import { nativePageHead, nativePageWithDetail, resolveNativeProject } from "../shared/native-project";
import { readNavigation } from "../src/page-builder/site-navigation";
import type { NativeSiteTree } from "../src/native-pages";

const target = { file: "about/index.html", route: "/about/", label: "About", home: false, subpages: 0, isNew: false };
const home = '<html><head><title>Home</title></head><body><header><nav><ul><li><a href="/about/">About</a></li></ul></nav></header><main><h1>Home</h1></main></body></html>';
function fixture() {
  const branch = { "index.html": home, "about/index.html": '<html><head><title>About</title></head><body><h1>About</h1></body></html>' };
  const parsed = resolveNativeProject(Object.keys(branch)); assert.ok(parsed.ok);
  const memory = createMemoryWorkspace({ branch, site: parsed.site, open: "index.html" });
  const edits = createGuardedEdits(memory.workspace), errors: string[] = [], refused: string[] = [], refreshes: string[] = [];
  const ports: PagesPorts = {
    edits, site: () => edits.peek.site(), routeForPath: file => Object.entries(edits.peek.site()?.routes ?? {}).find(([, path]) => path === file)?.[0],
    source: path => edits.peek.source(path), files: () => memory.files(), baseFiles: () => Object.keys(branch), drafts: () => memory.files().flatMap(path => { const draft = memory.draft(path); return draft ? [draft] : []; }),
    hasDraftScope: () => true, routeInfo: (route, site) => nativePageHead(edits.peek.source(site.routes[route]) ?? ""), titles: () => ({}), siteUrl: () => undefined,
    writeMeta: async () => undefined, ensureIndex: async () => undefined, readRedirects: async () => undefined, withMovedPageUrls: () => {}, pageLinks: () => undefined, cardsLinkingTo: () => undefined,
    confirmation: () => ({ ask: async () => true, choose: async () => ({ value: "move", option: false }) }), picker: () => ({ pick: async () => "/news/" }),
    refreshMeta: () => { refreshes.push("meta"); }, refreshLabel: () => { refreshes.push("label"); }, tree: () => undefined, pagesHidden: () => false, openFile: () => memory.openFile(), clearPendingTitles: () => {},
    tabsMounted: () => true, paintTabs: () => {}, resetExplorer: () => {}, showImages: () => {}, siteReadForCreate: async () => undefined, createWithCard: () => undefined,
    navigationTarget: (path, r) => { const source = path && r.source(path), list = source ? readNavigation(source) : undefined; return path && source && list ? { path, source, list, shared: false } : undefined; },
    restoreDeleted: () => {}, announce: message => memory.announced.push(message), refuse: message => refused.push(message), error: error => errors.push(error.message),
  } satisfies PagesPorts;
  return { ports, memory, edits, errors, refused, refreshes, controller: createPagesController(ports) };
}

test("URL planning preserves unchanged, occupied and link summary messages", () => {
  const h = fixture();
  assert.deepEqual(h.controller.urlPlan(target.file, target.route), { ok: false, error: "", unchanged: true });
  assert.equal(h.controller.urlPlan(target.file, "/").ok, false);
  const plan = h.controller.urlPlan(target.file, "/news/"); assert.ok(plan.ok); assert.match(plan.message, /updates 1 link in 1 file/);
  assert.equal(plan.redirect?.checked, true); assert.match(h.controller.dropProblem(target, "/about/sub/")!, /itself/);
});

for (const action of ["move", "url", "delete", "create", "folder", "duplicate"] as const) {
  test(`Pages ${action} records one module step with undo`, async () => {
    const h = fixture();
    if (action === "move") await h.controller.confirmMove(target, "/news/");
    else if (action === "url") assert.equal(await h.controller.changeUrl(target.file, "/news/", true), undefined);
    else if (action === "delete") await h.controller.remove(target);
    else if (action === "create") assert.equal(await h.controller.createNew({ parent: "/", title: "News", slug: "news" }), undefined);
    else if (action === "folder") await h.controller.createFolderPage("/news/");
    else await h.controller.duplicate(target.file);
    assert.deepEqual(h.errors, []); assert.deepEqual(h.memory.steps(), ["operation"]);
    if (action === "url") assert.match(h.memory.workspace.source("_redirects")!, /\/about\/\s+\/news\//);
    if (action === "duplicate") assert.match(h.memory.workspace.source("about-copy/index.html")!, /<title>About \(copy\)<\/title>/);
    assert.equal(h.memory.undo(), true); assert.equal(h.memory.workspace.source(target.file), '<html><head><title>About</title></head><body><h1>About</h1></body></html>');
  });
}

for (const action of ["move", "delete"] as const) {
  test(`Pages ${action} refuses a source edit while confirming`, async () => {
    const h = fixture();
    h.ports.confirmation = () => ({ ask: async () => { h.memory.writeDraft(target.file, "changed"); return true; }, choose: async () => { h.memory.writeDraft(target.file, "changed"); return { value: "move", option: false }; } });
    if (action === "move") await h.controller.confirmMove(target, "/news/"); else await h.controller.remove(target);
    assert.match(h.errors[0], /changed meanwhile/); assert.deepEqual(h.memory.steps(), []); assert.equal(h.memory.workspace.source(target.file), "changed");
  });
  test(`Pages cancelled ${action} wins over staleness`, async () => {
    const h = fixture();
    h.ports.confirmation = () => ({ ask: async () => { h.memory.bumpGeneration(); return false; }, choose: async () => { h.memory.bumpGeneration(); return { option: false }; } });
    if (action === "move") await h.controller.confirmMove(target, "/news/"); else await h.controller.remove(target);
    assert.deepEqual(h.errors, []); assert.deepEqual(h.memory.steps(), []); assert.match(h.memory.announced.at(-1)!, /Cancelled/);
  });
}

test("Pages delete refuses a file added to its listed folder", async () => {
  const h = fixture();
  h.ports.confirmation = () => ({ ask: async () => { h.memory.writeDraft("about/new.txt", "new"); return true; }, choose: async () => ({ value: "all", option: false }) });
  await h.controller.remove(target); assert.match(h.errors[0], /changed meanwhile/); assert.deepEqual(h.memory.steps(), []);
});

test("Pages delete reads card edits before its dialog", async () => {
  const h = fixture();
  h.ports.cardsLinkingTo = () => ({ label: "Remove its card", edits: new Map([["index.html", h.edits.peek.source("index.html")!.replace('<a href="/about/">About</a>', "")]]) });
  h.ports.confirmation = () => ({ ask: async () => true, choose: async () => { h.memory.typeInto("index.html"); return { value: "confirm", option: true }; } });
  await h.controller.remove(target); assert.deepEqual(h.memory.steps(), []); assert.match(h.errors[0], /changed meanwhile/);
});

test("URL change refuses drift while reading redirects", async () => {
  const h = fixture(); h.ports.readRedirects = async () => { h.memory.writeDraft(target.file, "changed"); return undefined; };
  assert.match((await h.controller.changeUrl(target.file, "/news/", true))!, /changed while preparing/); assert.deepEqual(h.memory.steps(), []);
});

test("URL settings compare their shown baseline inside the plan", async () => {
  const h = fixture(), since = h.edits.stamp(), baseline = new Map([[target.file, h.edits.peek.source(target.file)]]);
  h.memory.writeDraft(target.file, "changed");
  assert.equal(await h.controller.changeUrl(target.file, "/news/", true, since, baseline), "The repository or source changed meanwhile. Reopen settings and try again.");
  assert.deepEqual(h.memory.steps(), []);
});

for (const action of ["move", "url", "delete", "create", "folder"] as const) {
  test(`Pages ${action} holds its stamp from before loading`, async () => {
    const h = fixture();
    const switched = async () => { h.memory.setScope("other@branch"); return undefined; };
    h.ports.ensureIndex = switched; h.ports.siteReadForCreate = switched;
    if (action === "move") await h.controller.confirmMove(target, "/news/");
    else if (action === "url") assert.match((await h.controller.changeUrl(target.file, "/news/", false))!, /changed while preparing/);
    else if (action === "delete") await h.controller.remove(target);
    else if (action === "create") assert.match((await h.controller.createNew({ parent: "/", title: "News", slug: "news" }))!, /repository changed/);
    else await h.controller.createFolderPage("/news/");
    assert.deepEqual(h.memory.steps(), []);
    if (action !== "url" && action !== "create") assert.match(h.errors[0], /changed meanwhile/);
  });
}

for (const action of ["delete", "move"] as const) {
  test(`Pages ${action} refuses a target edit while the index loads, before any dialog opens`, async () => {
    const h = fixture();
    let shown = 0;
    h.ports.ensureIndex = async () => { h.memory.writeDraft(target.file, "newer"); return undefined; };
    h.ports.confirmation = () => ({ ask: async () => { shown++; return true; }, choose: async () => { shown++; return { value: "move", option: false }; } });
    h.ports.picker = () => ({ pick: async () => { shown++; return "/news/"; } });
    if (action === "move") await h.controller.moveTo(target); else await h.controller.remove(target);
    assert.equal(shown, 0); assert.deepEqual(h.memory.steps(), []); assert.match(h.errors[0], /changed meanwhile/);
  });
}

test("Move to holds the stamp across its picker", async () => {
  const h = fixture(); h.ports.picker = () => ({ pick: async () => { h.memory.bumpGeneration(); return "/news/"; } });
  await h.controller.moveTo(target); assert.deepEqual(h.memory.steps(), []); assert.match(h.errors[0], /changed meanwhile/);
});

test("new page with navigation writes both files as one step", async () => {
  const h = fixture();
  assert.equal(await h.controller.createNew({ parent: "/", title: "News", slug: "news", addToNavigation: true }), undefined);
  assert.deepEqual(h.memory.steps(), ["operation"]);
  assert.match(h.memory.workspace.source("index.html")!, /href="\/news\/"/);
  assert.match(h.memory.workspace.source("news/index.html")!, /href="\/news\/"/);
  assert.equal(h.memory.undo(), true); assert.equal(h.memory.workspace.source("index.html"), home);
});

test("new page with navigation refuses a stale home template", async () => {
  const h = fixture(); h.ports.ensureIndex = async () => { h.memory.typeInto("index.html"); return undefined; };
  assert.equal(await h.controller.createNew({ parent: "/", title: "News", slug: "news", addToNavigation: true }), "The page template or repository changed. Create the page again.");
  assert.deepEqual(h.memory.steps(), []);
});

test("card creation keeps its existing port", async () => {
  const h = fixture(); h.ports.createWithCard = async () => "card result";
  assert.equal(await h.controller.createNew({ parent: "/", title: "News", slug: "news", addCard: true }), "card result"); assert.deepEqual(h.memory.steps(), []);
});

test("retitle accepts a rebuilt site but refuses workspace or route drift", async () => {
  for (const drift of ["none", "scope", "route", "generation"]) {
    const h = fixture();
    h.ports.writeMeta = async () => {
      const site = h.edits.peek.site()!;
      h.memory.setSite({ ...site, routes: { ...site.routes, ...drift === "route" ? { "/about/": "other.html" } : {} } });
      if (drift === "scope") h.memory.setScope("other@main");
      if (drift === "generation") h.memory.bumpGeneration();
      return undefined;
    };
    const error = await h.controller.retitle(target.file, "New");
    if (drift === "none") { assert.equal(error, undefined); assert.deepEqual(h.refreshes, ["meta", "label"]); }
    else { assert.match(error!, /repository changed meanwhile/); assert.deepEqual(h.refreshes, []); }
  }
});

test("page meta now groups keystrokes into one undo step", () => {
  const h = fixture();
  for (const value of ["N", "Ne", "New"]) {
    assert.ok(h.edits.now(r => {
      const source = r.source("index.html")!;
      return { edits: new Map([["index.html", nativePageWithDetail(source, "title", value)]]), done: "Title updated", undone: "Undid title" };
    }, { group: "page-meta:index.html:title" }).ok);
  }
  assert.deepEqual(h.memory.steps(), ["range"]); assert.equal(h.memory.undo(), true); assert.equal(h.memory.workspace.source("index.html"), home);
});

test("tabs and tree continue reading live state", () => {
  const h = fixture(), painted: string[] = [], rendered: NativeSiteTree[] = [];
  h.ports.paintTabs = tab => { painted.push(tab); }; h.ports.tree = () => ({ render: tree => { rendered.push(tree); } });
  h.controller.selectTab("files"); h.controller.updateTabs(true); assert.deepEqual(painted, ["files", "pages"]);
  h.controller.renderTree(); assert.equal(rendered.length, 1);
  h.memory.setSite(undefined); h.controller.updateTabs(); assert.equal(painted.at(-1), "files");
});

test("new-page planning validates title, URL and unread template", () => {
  const h = fixture();
  assert.deepEqual(h.controller.planNew({ parent: "/", title: " ", slug: "x" }), { ok: false, error: "Enter the page's title." });
  assert.equal(h.controller.planNew({ parent: "/", title: "About", slug: "about" }).ok, false);
  assert.equal(h.controller.planNew({ parent: "/", title: "News", slug: "news" }, true).ok, true);
  h.memory.unmount("index.html"); h.memory.deleteFile("index.html");
  assert.deepEqual(h.controller.planNew({ parent: "/", title: "News", slug: "news" }, true), { ok: false, error: "The home page is not read yet. Try again in a moment." });
});


test("Move to refuses a page edit while its picker is open", async () => {
  const h = fixture();
  h.ports.picker = () => ({ pick: async () => { h.memory.writeDraft(target.file, "changed in picker"); return "/news/"; } });
  await h.controller.moveTo(target);
  assert.deepEqual(h.memory.steps(), []); assert.match(h.errors[0], /changed meanwhile/);
});
