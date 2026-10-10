import { test } from "node:test";
import assert from "node:assert/strict";
import { withoutCardMoves } from "../src/controllers/cards-controller.ts";
import { cardsFixture } from "./fakes/cards-fixture.ts";
import { createCards } from "../src/page-builder/cards.ts";
import type { NativeSite } from "../shared/native-project.ts";
import type { NativePreviewSelection } from "../src/components/native-preview.ts";

const page = "<!doctype html><html><head><title>Home</title></head><body><main><section><h2>Work</h2><div class=\"cards\">"
  + ["One", "Two", "Three"].map((name) => `<article class="card"><h3>${name}</h3><p>About ${name}.</p></article>`).join("")
  + "</div></section></main></body></html>";

const plain: NativeSite = { routes: { "/": "index.html" }, components: {} };
const fixture = (site: NativeSite | undefined = plain) => cardsFixture({ "index.html": page }, site, false);

const selection = (node: number[]): NativePreviewSelection => ({ path: "index.html", tag: "article", text: "", reason: "click", selectors: [], node });

test("before mounting, card adapters refuse or offer nothing", async () => {
  const controller = fixture().controller;
  assert.equal(controller.mounted(), false);
  assert.equal(controller.preview.createPage({ path: "index.html", node: [] }, { title: "Oak", parent: "/" }), undefined);
  assert.equal(controller.preview.describe({} as never), undefined);
  assert.deepEqual(controller.controls(selection([1, 0, 0, 1, 0]), page), []);
  assert.equal(controller.cardOffer("/"), undefined);
  assert.equal(controller.cardsLinkingTo("/", new Set()), undefined);
  assert.equal(controller.createWithCard({ parent: "/", title: "x", slug: "x" }), undefined);
});

test("mounting creates the card operations once the workspace mounts", () => {
  const { controller } = cardsFixture({ "index.html": page }, undefined, false);
  controller.mount();
  assert.equal(controller.mounted(), true);
  assert.deepEqual(controller.controls(selection([1, 0, 0, 1, 1]), page), []);
  assert.equal(controller.cardOffer("/"), undefined);
});

test("a card's edit bar keeps its actions but leaves out every move arrow", () => {
  const controls = ["up", "down", "left", "right", "duplicate", "remove", "add"].map((icon) => ({ kind: "button", icon }));
  assert.deepEqual(withoutCardMoves([...controls, { kind: "link", icon: "up" }]).map(({ kind, icon }) => `${kind}:${icon}`),
    ["button:duplicate", "button:remove", "button:add", "link:up"]);
});

// Card source locations use the browser's HTML parser. Bundle the real memory
// workspace and controller into Chromium, without a preview server or proof ports.
declare global {
  var cardsFixture: typeof import("./fakes/cards-fixture.ts").cardsFixture;
  var cardsCreate: typeof createCards;
}

test("guarded card actions on the memory workspace with the browser parser", async t => {
  const { build } = await import("esbuild");
  const { chromium } = await import("@playwright/test");
  const bundle = await build({
    stdin: { contents: `
      import { cardsFixture } from './tests/fakes/cards-fixture';
      import { createCards } from './src/page-builder/cards';
      globalThis.cardsCreate = createCards;
      globalThis.cardsFixture = cardsFixture;
    `, resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser",
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const browserPage = await browser.newPage();
    await browserPage.addScriptTag({ content: bundle.outputFiles[0].text });
    const plainSite = { routes: { "/": "index.html" }, components: {} };
    const componentSite = {
      routes: { "/": "index.html", "/work/": "work/index.html", "/work/oak/": "work/oak/index.html" },
      components: { "card-project": "_components/card-project.html", "card-quote": "_components/card-quote.html" },
    };
    const project = '<article><slot name="title"><h3>Untitled project</h3></slot><slot name="body"><p>No description yet.</p></slot><slot name="link"></slot></article>';
    const quote = '<article><slot name="title"><h3>Untitled quote</h3></slot><slot name="body"><blockquote>No quote yet.</blockquote></slot></article>';
    const oak = '<!doctype html><html><head><title>Oak</title><meta name="description" content="Oak description"></head><body><main><h1>Oak</h1><p>Oak body</p></main></body></html>';
    const cardPage = '<!doctype html><html><head><title>Home</title></head><body><main><section><h2>Work</h2><div class="cards"><card-quote><h3 slot="title">Blank</h3></card-quote><card-quote><h3 slot="title"><a href="/work/oak/">Oak</a></h3></card-quote></div></section></main></body></html>';
    const branch = { "index.html": cardPage, "work/index.html": oak, "work/oak/index.html": oak, "_components/card-project.html": project, "_components/card-quote.html": quote };
    const data = { branch, site: componentSite, card: { path: "index.html", node: [0, 0, 1, 0] } };

    await t.test("add on a plain grid is one range step, undone to the original page", async () => {
      const result = await browserPage.evaluate(async ({ page, site }) => {
        const { controller, m } = cardsFixture({ "index.html": page }, site);
        const card = await controller.preview.addCard({ path: "index.html", parent: [0, 0, 1], index: -1, row: false });
        const after = m.source("index.html"), steps = m.steps(), selected = m.selected;
        const undone = m.undo();
        return { card, after, steps, selected, undone, restored: m.source("index.html") };
      }, { page, site: plainSite });
      assert.deepEqual(result.card, { path: "index.html", node: [0, 0, 1, 3] });
      assert.equal((result.after!.match(/<article/g) ?? []).length, 4);
      assert.deepEqual(result.steps, ["range"]);
      assert.equal(result.undone, true);
      assert.equal(result.restored, page);
      assert.deepEqual(result.selected[0], result.card);
    });

    await t.test("fill and missing host CSS are one operation; undo removes both changes", async () => {
      const result = await browserPage.evaluate(async ({ branch, site, card }) => {
        const { controller, m } = cardsFixture(branch, site);
        const fill = await controller.preview.fillCard(card, "/work/oak/");
        const after = m.source(card.path), css = m.draft("_components/card-quote.css")?.content, steps = m.steps();
        const undone = m.undo();
        return { fill, after, css, steps, undone, restored: m.source(card.path), files: m.files(), selected: m.selected };
      }, data);
      assert.deepEqual(result.fill, { title: "Oak", route: "/work/oak/" });
      assert.match(result.after!, /<h3 slot="title"><a href="\/work\/oak\/">Oak<\/a><\/h3>/);
      assert.match(result.css!, /:host\s*\{\s*position: relative;/);
      assert.deepEqual(result.steps, ["operation"]);
      assert.equal(result.undone, true);
      assert.equal(result.restored, cardPage);
      assert.equal(result.files.includes("_components/card-quote.css"), false);
      assert.deepEqual(result.selected.at(-1), data.card);
    });

    await t.test("a component with a link slot fills without creating CSS", async () => {
      const result = await browserPage.evaluate(async ({ branch, site, card }) => {
        branch[card.path] = branch[card.path].replaceAll("card-quote", "card-project");
        const { controller, m } = cardsFixture(branch, site);
        await controller.preview.fillCard(card, "/work/oak/");
        return { after: m.source(card.path), steps: m.steps(), files: m.files() };
      }, data);
      assert.match(result.after!, /<a slot="link" href="\/work\/oak\/">Read about Oak<\/a>/);
      assert.deepEqual(result.steps, ["range"]);
      assert.equal(result.files.includes("_components/card-project.css"), false);
    });

    await t.test("editing the look template during card-swap import refuses without a step", async () => {
      const result = await browserPage.evaluate(async ({ branch, site, card }) => {
        const { controller, m } = cardsFixture(branch, site);
        const pending = controller.preview.swapCard(card, { tag: "card-project", label: "card-project" }, { variants: [] });
        m.typeInto("_components/card-project.html");
        return { swap: await pending, after: m.source(card.path), steps: m.steps(), said: m.announced, files: m.files() };
      }, data);
      assert.equal(result.swap, undefined);
      assert.equal(result.after, cardPage);
      assert.deepEqual(result.steps, []);
      assert.deepEqual(result.said, ["The page changed meanwhile; choose the look again."]);
      assert.equal(result.files.includes("_components/card-project.css"), false);
    });

    await t.test("creating CSS during card-link-css import refuses and preserves that draft", async () => {
      const result = await browserPage.evaluate(async ({ branch, site, card }) => {
        const { controller, m } = cardsFixture(branch, site);
        const pending = controller.preview.fillCard(card, "/work/oak/");
        m.writeDraft("_components/card-quote.css", ":host { color: red; }");
        return { fill: await pending, after: m.source(card.path), css: m.draft("_components/card-quote.css")?.content, steps: m.steps(), said: m.announced };
      }, data);
      assert.equal(result.fill, undefined);
      assert.equal(result.after, cardPage);
      assert.equal(result.css, ":host { color: red; }");
      assert.deepEqual(result.steps, []);
      assert.deepEqual(result.said, ["The page changed meanwhile; choose the page again."]);
    });

    await t.test("create page, fill and host CSS undo together", async () => {
      const result = await browserPage.evaluate(async ({ branch, site, card }) => {
        const { controller, m } = cardsFixture(branch, site);
        const fill = await controller.preview.createPage(card, { parent: "/work/", title: "Birch" });
        const created = m.draft("work/birch/index.html")?.content, after = m.source(card.path), steps = m.steps();
        const css = m.draft("_components/card-quote.css")?.content;
        const undone = m.undo();
        const restored = m.source(card.path), files = m.files();
        const redone = m.redo();
        return { fill, created, css, after, steps, undone, restored, files, redone, again: m.source(card.path), filesAgain: m.files() };
      }, data);
      assert.deepEqual(result.fill, { title: "Birch", route: "/work/birch/" });
      assert.match(result.created!, /Birch/);
      assert.match(result.css!, /:host\s*\{\s*position: relative;/);
      assert.equal(result.redone, true);
      assert.equal(result.again, result.after);
      assert.ok(result.filesAgain.includes("work/birch/index.html") && result.filesAgain.includes("_components/card-quote.css"));
      assert.match(result.after!, /href="\/work\/birch\/"/);
      assert.deepEqual(result.steps, ["operation"]);
      assert.equal(result.undone, true);
      assert.equal(result.restored, cardPage);
      assert.equal(result.files.includes("work/birch/index.html"), false);
      assert.equal(result.files.includes("_components/card-quote.css"), false);
    });

    const collectionPage = cardPage.replace("Blank</h3>", '<a href="/work/pine/">Pine</a></h3>');
    const collectionData = { branch: { ...branch, "index.html": collectionPage, "work/pine/index.html": oak.replaceAll("Oak", "Pine") }, site: { ...componentSite, routes: { ...componentSite.routes, "/work/pine/": "work/pine/index.html" } } };
    await t.test("Pages tab creates the page and collection card in one step", async () => {
      const result = await browserPage.evaluate(async ({ branch, site }) => {
        const { controller, m } = cardsFixture(branch, site);
        const offer = controller.cardOffer("/work/");
        const error = await controller.createWithCard({ parent: "/work/", title: "Birch", slug: "birch" });
        const created = m.draft("work/birch/index.html")?.content, after = m.source("index.html"), steps = m.steps(), opened = m.opened;
        const undone = m.undo();
        return { offer, error, created, after, steps, opened, undone, restored: m.source("index.html"), files: m.files() };
      }, collectionData);
      assert.ok(result.offer);
      assert.equal(result.error, undefined);
      assert.match(result.created!, /Birch/);
      assert.match(result.after!, /href="\/work\/birch\/"/);
      assert.deepEqual(result.steps, ["operation"]);
      assert.deepEqual(result.opened, ["work/birch/index.html"]);
      assert.equal(result.undone, true);
      assert.equal(result.restored, collectionPage);
      assert.equal(result.files.includes("work/birch/index.html"), false);
    });

    await t.test("Pages tab refuses a grid page edited meanwhile", async () => {
      const result = await browserPage.evaluate(async ({ branch, site }) => {
        const { controller, m } = cardsFixture(branch, site);
        const pending = controller.createWithCard({ parent: "/work/", title: "Birch", slug: "birch" });
        m.typeInto("index.html");
        return { error: await pending, after: m.source("index.html"), steps: m.steps(), files: m.files() };
      }, collectionData);
      assert.equal(result.error, "The page changed meanwhile. Try again.");
      assert.equal(result.after, `${collectionPage}<!-- typed -->`);
      assert.deepEqual(result.steps, []);
      assert.equal(result.files.includes("work/birch/index.html"), false);
    });

    for (const action of ["Duplicate", "Remove"] as const) {
      await t.test(`${action} uses now: one step and undo`, async () => {
        const result = await browserPage.evaluate(({ page, site, action }) => {
          const { controller, m } = cardsFixture({ "index.html": page }, site);
          const controls = controller.controls({ path: "index.html", node: [0, 0, 1, 0], tag: "article", text: "", reason: "click", selectors: [] }, page);
          const button = controls.find(control => control.kind === "button" && control.label === action);
          if (button?.kind === "button") button.onPress();
          const after = m.source("index.html"), steps = m.steps(), undone = m.undo();
          return { after, steps, undone, restored: m.source("index.html") };
        }, { page, site: plainSite, action });
        assert.equal((result.after!.match(/<article/g) ?? []).length, action === "Duplicate" ? 4 : 2);
        assert.deepEqual(result.steps, ["range"]);
        assert.equal(result.undone, true);
        assert.equal(result.restored, page);
      });
      for (const mode of ["stale", "closed"] as const) {
        await t.test(`${action} refuses ${mode} painted controls`, async () => {
          const result = await browserPage.evaluate(({ page, site, action, mode }) => {
            const { controller, m } = cardsFixture({ "index.html": page }, site);
            const controls = controller.controls({ path: "index.html", node: [0, 0, 1, 0], tag: "article", text: "", reason: "click", selectors: [] }, page);
            if (mode === "stale") m.typeInto("index.html"); else m.close();
            const button = controls.find(control => control.kind === "button" && control.label === action);
            if (button?.kind === "button") button.onPress();
            return { steps: m.steps(), after: m.source("index.html"), said: m.announced };
          }, { page, site: plainSite, action, mode });
          assert.deepEqual(result.steps, []);
          assert.equal(result.after, mode === "stale" ? `${page}<!-- typed -->` : page);
          assert.deepEqual(result.said, mode === "stale" ? ["The source changed. Select the element again and try again."] : []);
        });
      }
    }

    await t.test("Duplicate refuses when a template read for the grid changed since the bar was painted", async () => {
      const result = await browserPage.evaluate(({ branch, site, card }) => {
        const { controller, m } = cardsFixture(branch, site);
        const source = m.source(card.path)!;
        const controls = controller.controls({ ...card, tag: "card-quote", text: "", reason: "click", selectors: [] }, source);
        m.writeDraft("_components/card-quote.html", "<section><slot></slot></section>");
        const button = controls.find(control => control.kind === "button" && control.label === "Duplicate");
        if (button?.kind === "button") button.onPress();
        return { found: Boolean(button), steps: m.steps(), after: m.source(card.path), said: m.announced };
      }, data);
      assert.equal(result.found, true);
      assert.deepEqual(result.steps, []);
      assert.equal(result.after, cardPage);
      assert.deepEqual(result.said, ["The source changed. Select the element again and try again."]);
    });

    await t.test("move uses now, preserves selection and undoes", async () => {
      const result = await browserPage.evaluate(({ page, site }) => {
        const { ports, m } = cardsFixture({ "index.html": page }, site);
        const cards = cardsCreate(ports);
        const moved = cards.move({ path: "index.html", node: [0, 0, 1, 0] }, "down");
        const after = m.source("index.html"), steps = m.steps(), selected = m.selected;
        const undone = m.undo();
        m.close();
        const closed = cards.move({ path: "index.html", node: [0, 0, 1, 0] }, "down");
        return { moved, after, steps, selected, undone, restored: m.source("index.html"), closed };
      }, { page, site: plainSite });
      assert.equal(result.moved, true);
      assert.ok(result.after!.indexOf("Two") < result.after!.indexOf("One"));
      assert.deepEqual(result.steps, ["range"]);
      assert.deepEqual(result.selected[0], { path: "index.html", node: [0, 0, 1, 1] });
      assert.equal(result.undone, true);
      assert.equal(result.restored, page);
      assert.equal(result.closed, false);
    });
    await t.test("an unchanged fill and swap still return their results without another step", async () => {
      const result = await browserPage.evaluate(async ({ branch, site, card }) => {
        const { controller, m } = cardsFixture(branch, site);
        await controller.preview.fillCard(card, "/work/oak/");
        const fill = await controller.preview.fillCard(card, "/work/oak/");
        const swap = await controller.preview.swapCard(card, { tag: "card-quote", label: "card-quote" }, { variants: [] });
        return { fill, swap, steps: m.steps() };
      }, data);
      assert.deepEqual(result.fill, { title: "Oak", route: "/work/oak/" });
      assert.ok(result.swap);
      assert.deepEqual(result.steps, ["operation"]);
    });

    await t.test("a successful look swap edits existing host CSS in the card's undo step", async () => {
      const result = await browserPage.evaluate(async ({ branch, site, card }) => {
        branch[card.path] = branch[card.path].replaceAll("card-quote", "card-project").replace('<h3 slot="title"><a href="/work/oak/">Oak</a></h3>', '<h3 slot="title">Oak</h3><a slot="link" href="/work/oak/">Read about Oak</a>');
        branch["_components/card-quote.css"] = ":host { color: red; }";
        const { controller, m } = cardsFixture(branch, site);
        const linked = { ...card, node: [0, 0, 1, 1] };
        const swap = await controller.preview.swapCard(linked, { tag: "card-quote", label: "card-quote" }, { variants: [] });
        const after = m.source(card.path), css = m.draft("_components/card-quote.css")?.content, steps = m.steps();
        const undone = m.undo();
        return { original: branch[card.path], swap, after, css, steps, undone, restored: m.source(card.path), cssRestored: m.source("_components/card-quote.css"), said: m.announced };
      }, data);
      assert.ok(result.swap);
      assert.match(result.css!, /position: relative/);
      assert.match(result.after!, /<card-quote>/);
      assert.deepEqual(result.steps, ["operation"]);
      assert.equal(result.undone, true);
      assert.equal(result.restored, result.original);
      assert.equal(result.cssRestored, ":host { color: red; }");
      assert.equal(result.said.at(-1), "Undid changing the card's look.");
    });

    await t.test("Add card refuses source changes across the site read and surfaces a read problem", async () => {
      const result = await browserPage.evaluate(async ({ page, site }) => {
        const { ports, m } = cardsFixture({ "index.html": page }, site);
        const cards = cardsCreate(ports);
        const pending = cards.addCard({ path: "index.html", parent: [0, 0, 1], index: -1, row: false });
        m.typeInto("index.html");
        const card = await pending;
        // An anonymous function: a named one gets tsx's `__name` helper, which the page lacks.
        const broken = cardsCreate({ ...ports, siteRead: [async () => "The site could not be read."][0]! });
        const failed = await broken.addCard({ path: "index.html", parent: [0, 0, 1], index: -1, row: false });
        return { card, failed, steps: m.steps(), after: m.source("index.html"), said: m.announced };
      }, { page, site: plainSite });
      assert.equal(result.card, undefined);
      assert.equal(result.failed, undefined);
      assert.deepEqual(result.steps, []);
      assert.equal(result.after, `${page}<!-- typed -->`);
      assert.deepEqual(result.said, ["The page changed meanwhile; try adding the card again.", "The site could not be read."]);
    });

    await t.test("create page refuses changed sibling, home, config, template or target inputs", async () => {
      const result = await browserPage.evaluate(async ({ branch, site, card }) => {
        const outputs = [];
        // Keep the anchor distinct from Home so its read is proved independently.
        const anchor = "work/list/index.html";
        const inputs: Record<string, string> = { ...branch, [anchor]: branch[card.path] };
        inputs[".editor/config.json"] = '{"site":{"url":"https://example.test"}}';
        const anchoredSite = { ...site, routes: { ...site.routes, "/work/list/": anchor } };
        for (const path of ["work/oak/index.html", "index.html", ".editor/config.json", "_components/card-quote.html", "work/birch/index.html"]) {
          const { controller, m } = cardsFixture(inputs, anchoredSite);
          await m.workspace.open(anchor);
          const pending = controller.preview.createPage({ ...card, path: anchor }, { parent: "/work/", title: "Birch" });
          m.writeDraft(path, `${inputs[path] ?? ""}<!-- changed -->`);
          const fill = await pending;
          outputs.push({ fill, steps: m.steps(), after: m.source(anchor), files: m.files(), said: m.announced });
        }
        return outputs;
      }, data);
      for (const output of result) {
        assert.equal(output.fill, undefined);
        assert.deepEqual(output.steps, []);
        assert.equal(output.after, cardPage);
        assert.equal(output.files.includes("_components/card-quote.css"), false);
        assert.deepEqual(output.said, ["The page changed meanwhile; try again."]);
      }
    });

    await t.test("a written create with a failed refresh reports the message but returns success", async () => {
      const result = await browserPage.evaluate(async ({ branch, site, card }) => {
        const { controller, m } = cardsFixture(branch, site);
        m.failRefresh();
        const fill = await controller.preview.createPage(card, { parent: "/work/", title: "Birch" });
        return { fill, steps: m.steps(), created: m.draft("work/birch/index.html")?.content, said: m.announced };
      }, data);
      assert.deepEqual(result.fill, { title: "Birch", route: "/work/birch/" });
      assert.deepEqual(result.steps, ["operation"]);
      assert.match(result.created!, /Birch/);
      assert.match(result.said.at(-1)!, /The files changed, but the editor changed while opening them/);
    });

    await t.test("Pages tab returns a failed refresh's message with the step written", async () => {
      const result = await browserPage.evaluate(async ({ branch, site }) => {
        const { controller, m } = cardsFixture(branch, site);
        m.failRefresh();
        const error = await controller.createWithCard({ parent: "/work/", title: "Birch", slug: "birch" });
        return { error, steps: m.steps(), created: m.draft("work/birch/index.html")?.content, said: m.announced };
      }, collectionData);
      assert.match(result.error!, /The files changed, but the editor changed while opening them/);
      assert.deepEqual(result.steps, ["operation"]);
      assert.match(result.created!, /Birch/);
    });

    await t.test("painted move controls refuse a changed source", async () => {
      const result = await browserPage.evaluate(({ page, site }) => {
        const { ports, m } = cardsFixture({ "index.html": page }, site);
        const controls = cardsCreate(ports).controls({ path: "index.html", node: [0, 0, 1, 0], tag: "article", text: "", reason: "click", selectors: [] }, page);
        m.typeInto("index.html");
        const down = controls.find(control => control.kind === "button" && control.label === "Move down");
        if (down?.kind === "button") down.onPress();
        return { steps: m.steps(), after: m.source("index.html"), said: m.announced };
      }, { page, site: plainSite });
      assert.deepEqual(result.steps, []);
      assert.equal(result.after, `${page}<!-- typed -->`);
      assert.deepEqual(result.said, ["The source changed. Select the element again and try again."]);
    });
  } finally {
    await browser.close();
  }
});
