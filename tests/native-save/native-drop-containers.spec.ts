import { expect, test, type Page } from "@playwright/test";
import type { NativePreview } from "../../src/components/native-preview";
import type { DropReport } from "../../src/page-builder/drop-report";
import { parseDropReport } from "../../src/page-builder/drop-report";
import { dropLabel, dropTarget } from "../../src/page-builder/drop-target";
import { sectionSnap } from "../../src/page-builder/section-snap";

// Default native-save group, native-cards fixture (#repo=540).
async function probe(page: Page, selector: string, moving?: number[], point?: { x: number; y: number }, bands?: boolean) {
  const frame = page.frameLocator(".native-preview-frame");
  await frame.locator(selector).first().scrollIntoViewIfNeeded();
  const at = point ?? await frame.locator(selector).first().evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const raw = await page.evaluate(({ at, moving, bands }) => new Promise<unknown>(resolve => {
    const frame = document.querySelector<HTMLIFrameElement>(".native-preview-frame")!;
    const id = Date.now();
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data?.type !== "drop-containers" || event.data.id !== id) return;
      window.removeEventListener("message", listener);
      resolve(event.data);
    };
    window.addEventListener("message", listener);
    frame.contentWindow!.postMessage({ source: "astro-native-preview-host", type: "drop-probe", id, ...at, moving, bands }, "*");
  }), { at, moving, bands });
  return parseDropReport(raw, "index.html")!;
}

test("probes report nested grid containers and stop at a card's named slot", async ({ page, baseURL }) => {
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("#work .cards card-project").first()).toBeVisible();
  // Wait for the stylesheet's observable multi-column layout.
  await expect.poll(() => frame.locator("#work .cards").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBeGreaterThan(1);
  const title = await probe(page, "#work card-project h3[slot=title]");
  expect(title.containers.map(c => c.kind)).toEqual(["slot", "div", "section", "main"]);
  expect(title.containers[0].slot).toBe("title");
  expect(title.containers[0].tag).toBe("card-project");
  expect(title.containers[1]).toMatchObject({ cls: "cards", axis: "row",
    children: [{ index: 0, tag: "card-project" }, { index: 1, tag: "card-project" }] });
  expect(title.containers[1].count).toBe(title.containers[1].children.length);
  const paragraph = { kind: "new", block: "paragraph" } as const;
  expect(dropLabel(dropTarget(title.containers, title, paragraph)!, paragraph)).toMatch(/^The “title” slot is filled by editing its text/);
  // In the grid's gap, just before the second card.
  const gap = await frame.locator("#work .cards card-project").nth(1).evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.left - 2, y: r.top + r.height / 2 };
  });
  const card = await probe(page, "#work .cards", undefined, gap);
  expect(card.containers.map(c => c.kind)).toEqual(["div", "section", "main"]);
  expect(dropLabel(dropTarget(card.containers, card, paragraph)!, paragraph)).toBe("Into Div (grid) › after Card project");
  expect(title.containers[2]).toMatchObject({ kind: "section", axis: "column" });
  const section = await probe(page, "#work > h2");
  expect(section.containers.map(c => c.kind)).toEqual(["section", "main"]);
  const moving = await probe(page, "#work card-project h3[slot=title]", title.containers[1].path);
  expect(moving.containers.map(c => c.kind)).toEqual(["section", "main"]);
  // Section probes keep all bands even over the page's header/footer and while moving one.
  for (const selector of ["site-header", "site-footer"]) {
    const report = await probe(page, selector, [...section.containers[1].path, 0], undefined, true);
    expect(report.containers.map(c => c.kind)).toEqual(["main"]);
    const main = report.containers[0];
    expect(main.path).toEqual(section.containers[1].path);
    expect(main.children.map(c => c.index)).toEqual([0, 1, 2]);
    expect(sectionSnap(main, report.y).index).toBe(selector === "site-header" ? 0 : main.count);
  }
});

type Harness = {
  preview: NativePreview;
  held: unknown[];
  hold: boolean;
  results: Record<string, DropReport | undefined>;
  start: (key: string) => void;
  send: (raw: unknown) => void;
};

async function setup(page: Page) {
  await page.goto("/tests/fixtures/native-elements-compat.html");
  await page.evaluate(async () => {
    const { createNativePreview } = await import("/src/components/native-preview.ts");
    const { resolveNativeProject } = await import("/shared/native-project.ts");
    const sources = { "index.html": '<html><body><main><section style="padding:20px"><div id="target" style="height:100px">Probe</div></section></main></body></html>' };
    const site = resolveNativeProject(Object.keys(sources));
    if (!site.ok) throw new Error(site.error);
    const held: unknown[] = [];
    const results: Record<string, DropReport | undefined> = {};
    const state: Harness = {
      preview: undefined!, held, results, hold: false,
      start(key) { void state.preview.probeDrop({ x: 40, y: 40 }).then(report => { results[key] = report; }); },
      send(raw) {
        const frame = document.querySelector<HTMLIFrameElement>(".native-preview-frame")!;
        state.hold = false;
        window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow!, data: raw }));
      },
    };
    // Hold real frame replies before the preview sees them, then release in a chosen order.
    window.addEventListener("message", event => {
      if (state.hold && event.data?.type === "drop-containers") {
        held.push(event.data);
        event.stopImmediatePropagation();
      }
    });
    state.preview = createNativePreview(document.querySelector<HTMLElement>("#preview")!);
    Object.assign(window, { dropTest: state });
    state.preview.activate(site.site);
    state.preview.update({ sources });
  });
  await expect(page.frameLocator(".native-preview-frame").locator("#target")).toBeVisible();
  await expect.poll(() => page.evaluate(async () => Boolean(await (window as unknown as { dropTest: Harness }).dropTest.preview.probeDrop({ x: 40, y: 40 })))).toBe(true);
}

test("probe promises settle on replacement, timeout, stale replies, History, re-render and destruction", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const h = (window as unknown as { dropTest: Harness }).dropTest;
    h.hold = true;
    h.start("old");
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { dropTest: Harness }).dropTest.held.length)).toBe(1);
  await page.evaluate(() => (window as unknown as { dropTest: Harness }).dropTest.start("new"));
  await expect.poll(() => page.evaluate(() => (window as unknown as { dropTest: Harness }).dropTest.held.length)).toBe(2);
  expect(await page.evaluate(() => Object.hasOwn((window as unknown as { dropTest: Harness }).dropTest.results, "old"))).toBe(true);
  await page.evaluate(() => {
    const h = (window as unknown as { dropTest: Harness }).dropTest;
    h.send(h.held[0]);
    h.send(h.held[1]);
  });
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { dropTest: Harness }).dropTest.results.new))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { dropTest: Harness }).dropTest.results.old)).toBeUndefined();

  for (const mode of ["context", "route", "timeout", "render", "history", "destroy"] as const) {
    await page.evaluate(mode => {
      const h = (window as unknown as { dropTest: Harness }).dropTest;
      h.held.length = 0;
      h.hold = true;
      h.start(mode);
    }, mode);
    await expect.poll(() => page.evaluate(() => (window as unknown as { dropTest: Harness }).dropTest.held.length)).toBe(1);
    await page.evaluate(mode => {
      const h = (window as unknown as { dropTest: Harness }).dropTest;
      const raw = h.held[0] as Record<string, unknown>;
      if (mode === "context") h.send({ ...raw, context: "stale" });
      if (mode === "route") h.send({ ...raw, path: "other.html" });
      if (mode === "render") h.preview.update({});
      if (mode === "history") h.preview.setViewing(document.createElement("div"));
      if (mode === "destroy") h.preview.destroy();
    }, mode);
    await expect.poll(() => page.evaluate(mode => Object.hasOwn((window as unknown as { dropTest: Harness }).dropTest.results, mode), mode)).toBe(true);
    expect(await page.evaluate(mode => (window as unknown as { dropTest: Harness }).dropTest.results[mode], mode)).toBeUndefined();
    if (mode !== "destroy") {
      await page.evaluate(mode => {
        const h = (window as unknown as { dropTest: Harness }).dropTest;
        h.send(h.held[0]);
        if (mode === "history") h.preview.setViewing(undefined);
      }, mode);
      await expect.poll(() => page.evaluate(async () => Boolean(await (window as unknown as { dropTest: Harness }).dropTest.preview.probeDrop({ x: 40, y: 40 })))).toBe(true);
    }
  }
});

test("items slots alone open the seal, including empty areas and zero-size wrappers", async ({ page }) => {
  await setup(page);
  const frame = page.frameLocator(".native-preview-frame");
  await frame.locator("section").evaluate(section => {
    section.innerHTML = '<block-list style="display:block"><style data-native-css></style><div slot="cards" id="assigned" style="height:60px"><article style="display:contents"><div id="inner" style="height:60px">Item</div></article></div></block-list>';
    const host = section.querySelector("block-list")!;
    host.attachShadow({ mode: "open" }).innerHTML = '<div style="min-height:100px;display:grid;grid-template-columns:1fr 1fr"><slot name="cards"><card-example></card-example></slot></div>';
  });
  // The instance and the article both have no box of their own.
  await frame.locator("block-list").evaluate(host => { (host as HTMLElement).style.display = "contents"; });
  const items = await probe(page, "#inner");
  expect(items.containers.map(c => c.kind)).toEqual(["div", "div", "items", "section", "main"]);
  expect(items.containers[2]).toMatchObject({ path: [0, 0, 0], slot: "cards", axis: "row", empty: false, children: [{ index: 0 }] });
  const moved = await probe(page, "#inner", items.containers[1].path);
  expect(moved.containers.map(c => c.kind)).toEqual(["items", "section", "main"]);
  // A slot parent without a box of its own: the items slot covers its items.
  await frame.locator("block-list").evaluate(host => { host.shadowRoot!.querySelector("div")!.style.display = "contents"; });
  const boxless = await probe(page, "#inner");
  expect(boxless.containers.map(c => c.kind)).toEqual(["div", "div", "items", "section", "main"]);
  expect(boxless.containers[2].rect.height).toBeGreaterThanOrEqual(60);
  await frame.locator("block-list").evaluate(host => { host.shadowRoot!.querySelector("div")!.style.display = "grid"; });
  await frame.locator("block-list").evaluate(host => {
    host.querySelector("#assigned")!.remove();
    host.shadowRoot!.querySelector("slot")!.innerHTML = "";
    host.shadowRoot!.querySelector("slot")!.removeAttribute("name");
    host.shadowRoot!.querySelector("div")!.id = "empty-items";
  });
  const empty = await probe(page, "#empty-items");
  expect(empty.containers[0]).toMatchObject({ kind: "items", slot: "", empty: true, axis: "row", children: [] });
  expect(empty.containers[0].rect.height).toBeGreaterThanOrEqual(100);
  await frame.locator("block-list").evaluate(host => {
    host.innerHTML = '<div slot="body" id="ordinary" style="height:60px"><div id="sealed-inner" style="height:60px">Text</div></div>';
    // The fallback is another instance (holding a card, which does not count): an ordinary slot.
    host.shadowRoot!.innerHTML = '<div><slot name="body"><block-other><card-x></card-x></block-other></slot></div>';
  });
  const named = await probe(page, "#sealed-inner");
  expect(named.containers.map(c => c.kind)).toEqual(["slot", "section", "main"]);
  expect(named.containers[0].slot).toBe("body");
  await frame.locator("block-list").evaluate(host => {
    host.innerHTML = "";
    host.shadowRoot!.innerHTML = '<div><slot name="body" id="fallback">Fallback text</slot></div>';
  });
  const at = await frame.locator("#fallback").evaluate(slot => {
    const range = document.createRange();
    range.selectNodeContents(slot);
    const r = range.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const fallback = await probe(page, "#fallback", undefined, at);
  expect(fallback.containers[0]).toMatchObject({ kind: "slot", slot: "body" });
  expect(fallback.containers[0].rect.width).toBeGreaterThan(0);
  await page.evaluate(() => (window as unknown as { dropTest: Harness }).dropTest.preview.destroy());
});
