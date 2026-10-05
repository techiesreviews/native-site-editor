import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { requireActualFixture } from "./fixture-contract";
import { storedDrafts } from "./drafts";
import { publishButton } from "./publish";

requireActualFixture();

// Optional slots on the actual starter: Structure's eye and its inline fields
// fill, hide and edit slots; data-if conditions hide what the page leaves
// empty. Nothing of the editor (overlays, its runtime attributes, Structure
// state, the slot reports that drive canvas fill-ins) may reach the bytes
// that are drafted and published, or what the static site then serves with
// scripts on or off and no .editor folder. The preview's slot report (what a
// canvas fill-in reads) must agree with Structure after every step.
const PAGE = "index.html";
const CARD = "components/card-project/card-project.html";
const fixture = process.env.ASE_NATIVE_SAVE_FIXTURE ?? "fixtures/actual-starter";
const P0 = readFileSync(resolve(fixture, PAGE), "utf8");
const T0 = readFileSync(resolve(fixture, CARD), "utf8");
const RESIDUE = /data-native|contenteditable|spellcheck|shadowrootmode|slot-ghost|page-structure|aria-pressed|row-action|native-preview|astro-native|data-ase|data-empty/;

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure", exact: true });
const mounted = (page: Page, path = PAGE) => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const branchFile = async (page: Page, baseURL: string | undefined, path: string) => (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`)).text();
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const list: string[] = []; errors.set(page, list); page.on("pageerror", (error) => list.push(error.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

const TITLES = ["Fern & Kettle", "Harbour Lane Pottery", "Meadow Row Allotments"] as const;
const cardRow = (page: Page, card: number) => tree(page).locator(".page-structure__row[aria-level='4']").filter({ hasText: `Card project ${TITLES[card]}` });
const slotRow = (page: Page, card: number, badge: string) => cardRow(page, card).locator("+ [role='group'] > [role=treeitem]")
  .filter({ has: page.locator(".page-structure__slot-badge").filter({ hasText: new RegExp(`^${badge}$`) }) });
async function eye(page: Page, card: number, label: string): Promise<Locator> {
  const host = cardRow(page, card);
  if (await host.getAttribute("aria-expanded") === "false") await host.locator(".page-structure__toggle").first().click();
  await expect(host).toHaveAttribute("aria-expanded", "true");
  const row = slotRow(page, card, label);
  await row.hover();
  return row.getByRole("button", { name: `Show ${label}`, exact: true });
}
async function toggle(page: Page, card: number, label: string, to: boolean) {
  const button = await eye(page, card, label);
  await expect(button).toHaveAttribute("aria-pressed", String(!to));
  await button.click();
}
const history = (page: Page, direction: "undo" | "redo") => page.locator(direction === "undo" ? ".code-editor__undo" : ".code-editor__redo").first().click();

/** The latest slot report the preview sent for card `card` (what a canvas fill-in reads). */
const report = (page: Page, card: number) => page.evaluate((card) => {
  const reports = ((window as any).__slotReports as any[]).filter(Boolean).filter((r) => r.tag === "card-project");
  const host = reports.at(-1);
  return host && JSON.stringify(host.hostNode) === JSON.stringify((window as any).__cardNodes[card])
    ? Object.fromEntries(host.entries.filter((e: any) => e.occurrence === 0).map((e: any) => [e.name, { assigned: e.assigned, hidden: e.hidden }]))
    : undefined;
}, card);
const emptyAttr = (page: Page, card: number, selector: string) => frame(page).locator("card-project").nth(card)
  .evaluate((el, selector) => el.shadowRoot!.querySelector(selector)!.hasAttribute("data-native-empty"), selector);

/** Structure's eye, the canvas and the preview's slot report agree for one slot. */
async function agree(page: Page, card: number, label: string, slot: string, wrapper: string, filled: boolean) {
  await expect(await eye(page, card, label)).toHaveAttribute("aria-pressed", String(filled));
  await expect(slotRow(page, card, label)).toHaveClass(filled ? /^(?!.*page-structure__row--empty-slot)/ : /page-structure__row--empty-slot/);
  await expect.poll(() => emptyAttr(page, card, wrapper)).toBe(!filled);
  // A fill-in is offered exactly while Structure shows the slot as hidden.
  await expect.poll(async () => (await report(page, card))?.[slot]?.assigned).toBe(filled);
}

async function replaceCode(page: Page, text: string) {
  await page.locator("#content [role='textbox']").first().focus();
  await page.evaluate((value) => navigator.clipboard.writeText(value), text);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

async function servedSite(browser: Browser, page: Page, baseURL: string | undefined, javaScriptEnabled: boolean) {
  const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 1200, height: 900 } });
  const site = await context.newPage();
  const requested: string[] = [];
  await site.route("http://site.test/**", async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)).replace(/(^|\/)$/, "$1index.html");
    requested.push(path);
    // The site with its .editor folder deleted.
    if (path.startsWith(".editor/")) return route.fulfill({ status: 404, body: "" });
    const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
    if (!response.ok()) return route.fulfill({ status: 404, body: "" });
    const type = path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "text/javascript" : path.endsWith(".svg") ? "image/svg+xml" : "text/html";
    await route.fulfill({ body: await response.body(), contentType: type });
  });
  await site.goto("http://site.test/");
  return { context, site, requested };
}

/** Every attribute name in the document and its open shadow roots. */
const attributeNames = (site: Page) => site.evaluate(() => {
  const names = new Set<string>();
  const walk = (root: Document | ShadowRoot) => root.querySelectorAll("*").forEach((el) => {
    for (const name of el.getAttributeNames()) names.add(name);
    if (el.shadowRoot) walk(el.shadowRoot);
  });
  walk(document);
  return [...names].sort();
});

test("Structure fills, hides and edits optional slots, with data-if, and only authored bytes are drafted, published and served", async ({ page, baseURL, browser }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(CARD)}`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  // Conditions in the shared template: the actions paragraph follows the link,
  // and a new optional image figure follows an image the page may give.
  const T1 = T0.replace('<p class="actions">', '<p class="actions" data-if="link">')
    .replace('  <slot name="title">', '  <figure class="media" data-if="image"><slot name="image"></slot></figure>\n  <slot name="title">');
  expect(T1).not.toBe(T0);
  await expect.poll(() => mounted(page, CARD)).toBe(T0);
  await replaceCode(page, T1);
  await expect.poll(() => mounted(page, CARD)).toBe(T1);

  await page.goto(`${baseURL}/#repo=501&branch=main&file=${PAGE}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", PAGE, { timeout: 30_000 });
  await expect.poll(() => mounted(page)).toBe(P0);
  await page.evaluate(() => {
    (window as any).__slotReports = [];
    window.addEventListener("message", (event) => { if (event.data?.type === "slot-ghosts") (window as any).__slotReports.push(event.data.report); });
  });
  // The page's card hosts, by their element index paths (what the report names).
  await frame(page).locator("card-project").first().click({ position: { x: 4, y: 4 } });
  await expect(cardRow(page, 0)).toHaveAttribute("aria-selected", "true");
  const cardNodes: number[][] = [];
  for (const card of [0, 1, 2]) {
    await frame(page).locator("card-project").nth(card).click({ position: { x: 4, y: 4 } });
    await expect(cardRow(page, card)).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => page.evaluate((known) => {
      const node = ((window as any).__slotReports as any[]).filter(Boolean).at(-1)?.hostNode?.join(".");
      return node && !known.includes(node);
    }, cardNodes.map((n) => n.join(".")))).toBe(true);
    cardNodes.push(await page.evaluate(() => ((window as any).__slotReports as any[]).filter(Boolean).at(-1).hostNode));
  }
  await page.evaluate((nodes) => { (window as any).__cardNodes = nodes; }, cardNodes);
  expect(new Set(cardNodes.map((node) => node.join("."))).size).toBe(3);

  // Every card starts with its link and no image: the image figure is empty, so the canvas hides it
  // and a fill-in is offered for it.
  await frame(page).locator("card-project").nth(2).click({ position: { x: 4, y: 4 } });
  await agree(page, 2, "Link", "link", "p.actions", true);
  await agree(page, 2, "Image", "image", "figure.media", false);
  expect((await report(page, 2))!.image).toEqual({ assigned: false, hidden: true });

  // 1. Hide a link with the eye, Undo, Redo.
  const link0 = '          <a slot="link" href="/work/fern-and-kettle/">Read about Fern &amp; Kettle</a>\n';
  const P1 = P0.replace(link0, "");
  expect(P1).not.toBe(P0);
  await toggle(page, 0, "Link", false);
  await expect.poll(() => mounted(page)).toBe(P1);
  await agree(page, 0, "Link", "link", "p.actions", false);
  await history(page, "undo");
  await expect.poll(() => mounted(page)).toBe(P0);
  await agree(page, 0, "Link", "link", "p.actions", true);
  await history(page, "redo");
  await expect.poll(() => mounted(page)).toBe(P1);
  await agree(page, 0, "Link", "link", "p.actions", false);

  // 2. Show it again with the eye: the component's own empty link, then its inline fields.
  const P2 = P0.replace(link0, '          <a slot="link" href="">Link</a>\n');
  await toggle(page, 0, "Link", true);
  await expect.poll(() => mounted(page)).toBe(P2);
  await agree(page, 0, "Link", "link", "p.actions", true);
  await history(page, "undo");
  await expect.poll(() => mounted(page)).toBe(P1);
  await agree(page, 0, "Link", "link", "p.actions", false);
  await history(page, "redo");
  await expect.poll(() => mounted(page)).toBe(P2);
  await agree(page, 0, "Link", "link", "p.actions", true);
  await slotRow(page, 0, "Link").locator(".page-structure__slot-badge").click();
  const text = tree(page).getByRole("textbox", { name: "Link: Button text", exact: true });
  await text.fill("Visit Fern & Kettle");
  await text.press("Enter");
  const P3 = P2.replace('<a slot="link" href="">Link</a>', '<a slot="link" href="">Visit Fern &amp; Kettle</a>');
  await expect.poll(() => mounted(page)).toBe(P3);
  const href = tree(page).getByRole("combobox", { name: "Link: Link / URL", exact: true });
  await href.fill("/work/fern-and-kettle/");
  await href.press("Enter");
  const P4 = P3.replace('<a slot="link" href="">', '<a slot="link" href="/work/fern-and-kettle/">');
  await expect.poll(() => mounted(page)).toBe(P4);
  await expect(frame(page).locator("card-project").first().locator("a[slot=link]")).toHaveText("Visit Fern & Kettle");
  await history(page, "undo");
  await expect.poll(() => mounted(page)).toBe(P3);
  await history(page, "redo");
  await expect.poll(() => mounted(page)).toBe(P4);

  // 3. Hide the second card's link: its data-if paragraph is left empty.
  const link1 = '          <a slot="link" href="/work/harbour-lane-pottery/">Read about Harbour Lane Pottery</a>\n';
  const P5 = P4.replace(link1, "");
  await toggle(page, 1, "Link", false);
  await expect.poll(() => mounted(page)).toBe(P5);
  await agree(page, 1, "Link", "link", "p.actions", false);

  // 4. Show an image in the third card (an empty data-if slot), Undo, Redo, then hide it again
  // with the eye, with Undo and Redo of that too.
  const title2 = '<h3 slot="title">Meadow Row Allotments</h3>';
  const P6 = P5.replace(title2, `<img slot="image" src="" alt="">\n          ${title2}`);
  await toggle(page, 2, "Image", true);
  await expect.poll(() => mounted(page)).toBe(P6);
  await agree(page, 2, "Image", "image", "figure.media", true);
  await history(page, "undo");
  await expect.poll(() => mounted(page)).toBe(P5);
  await agree(page, 2, "Image", "image", "figure.media", false);
  await history(page, "redo");
  await expect.poll(() => mounted(page)).toBe(P6);
  await agree(page, 2, "Image", "image", "figure.media", true);
  await toggle(page, 2, "Image", false);
  await expect.poll(() => mounted(page)).toBe(P5);
  await agree(page, 2, "Image", "image", "figure.media", false);
  await history(page, "undo");
  await expect.poll(() => mounted(page)).toBe(P6);
  await agree(page, 2, "Image", "image", "figure.media", true);
  await history(page, "redo");
  await expect.poll(() => mounted(page)).toBe(P5);
  await agree(page, 2, "Image", "image", "figure.media", false);

  // 5. A section component without data-if: hiding a slot its instance otherwise fills leaves the
  // slot out, fallback and all (the section rule).
  const hero = tree(page).locator(".page-structure__row[aria-level='2']").filter({ hasText: "Section hero" });
  if (await hero.getAttribute("aria-expanded") === "false") await hero.locator(".page-structure__toggle").first().click();
  const secondaryRow = hero.locator("+ [role='group'] > [role=treeitem]").filter({ has: page.locator(".page-structure__slot-badge").filter({ hasText: /^Secondary$/ }) });
  const secondaryEye = async () => { await secondaryRow.hover(); return secondaryRow.getByRole("button", { name: "Show Secondary", exact: true }); };
  await expect(await secondaryEye()).toHaveAttribute("aria-pressed", "true");
  await (await secondaryEye()).click();
  const P7 = P5.replace('      <a slot="secondary" href="#work">See our work</a>\n', "");
  expect(P7).not.toBe(P5);
  await expect.poll(() => mounted(page)).toBe(P7);
  const heroSecondaryEmpty = () => frame(page).locator("section-hero").evaluate((el) => el.shadowRoot!.querySelector('slot[name="secondary"]')!.hasAttribute("data-native-empty"));
  await expect.poll(heroSecondaryEmpty).toBe(true);
  await expect(await secondaryEye()).toHaveAttribute("aria-pressed", "false");
  await history(page, "undo");
  await expect.poll(() => mounted(page)).toBe(P5);
  await expect.poll(heroSecondaryEmpty).toBe(false);
  await expect(await secondaryEye()).toHaveAttribute("aria-pressed", "true");
  await history(page, "redo");
  await expect.poll(() => mounted(page)).toBe(P7);
  await expect.poll(heroSecondaryEmpty).toBe(true);

  // While the canvas holds selections, the editor's own runtime attributes are on the preview's
  // DOM; none of them is in the source.
  await frame(page).locator("card-project").nth(1).click({ position: { x: 4, y: 4 } });
  expect(await mounted(page)).toBe(P7);
  expect(P7).not.toMatch(RESIDUE);
  expect(T1).not.toMatch(RESIDUE);

  // The drafts kept for publishing are exactly these two files' bytes.
  const drafts = await storedDrafts(page);
  expect(drafts.map((draft) => [draft.path, draft.content])).toEqual([[CARD, T1], [PAGE, P7]]);

  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  expect(await branchFile(page, baseURL, PAGE)).toBe(P7);
  expect(await branchFile(page, baseURL, CARD)).toBe(T1);

  // Served as plain files with no .editor folder and scripts off: the page as written, no slot
  // content for the hidden slots, no editor attributes.
  {
    const { context, site, requested } = await servedSite(browser, page, baseURL, false);
    await expect(site.locator("card-project")).toHaveCount(3);
    await expect(site.locator("card-project").nth(0).locator("a[slot=link]")).toHaveText("Visit Fern & Kettle");
    await expect(site.locator("card-project").nth(1).locator("[slot=link]")).toHaveCount(0);
    await expect(site.locator("card-project").nth(2).locator("[slot=image]")).toHaveCount(0);
    await expect(site.locator("section-hero [slot=secondary]")).toHaveCount(0);
    expect((await attributeNames(site)).filter((name) => RESIDUE.test(name) || name === "contenteditable")).toEqual([]);
    expect(await site.content()).not.toMatch(/data-native|contenteditable|slot-ghost|page-structure/);
    expect(requested.some((path) => path.startsWith(".editor/"))).toBe(false);
    await context.close();
  }
  // Scripts on: the site's own loader applies the same conditions. The emptied data-if paragraph
  // and the image figures render nothing; the editor's attributes are nowhere, light or shadow DOM.
  {
    const { context, site } = await servedSite(browser, page, baseURL, true);
    await expect.poll(() => site.evaluate(() => [...document.querySelectorAll("card-project")].every((el) => el.shadowRoot?.querySelector("article")))).toBe(true);
    const shown = (card: number, selector: string) => site.locator("card-project").nth(card)
      .evaluate((el, selector) => getComputedStyle(el.shadowRoot!.querySelector(selector)!).display, selector);
    await expect.poll(() => shown(0, "p.actions")).not.toBe("none");
    await expect.poll(() => shown(1, "p.actions")).toBe("none");
    await expect.poll(() => shown(2, "p.actions")).not.toBe("none");
    for (const card of [0, 1, 2]) await expect.poll(() => shown(card, "figure.media")).toBe("none");
    // The hero's hidden slot shows nothing, not even its fallback link.
    await expect(site.locator("section-hero a[slot=primary]")).toBeVisible();
    await expect(site.locator("section-hero a", { hasText: "See our work" })).toBeHidden();
    expect((await attributeNames(site)).filter((name) => /^data-native|^contenteditable$|^spellcheck$/.test(name))).toEqual([]);
    const box = await site.locator("card-project").nth(1).evaluate((el) => el.shadowRoot!.querySelector("p.actions")!.getBoundingClientRect().height);
    expect(box).toBe(0);
    await site.locator("#work").scrollIntoViewIfNeeded();
    await site.screenshot({ path: test.info().outputPath("published-cards-js-on.png") });
    await context.close();
  }
});
