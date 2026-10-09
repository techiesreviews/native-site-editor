import { expect, test, type Locator, type Page } from "@playwright/test";
import { effectiveSource, storedDraft } from "./drafts";

// Make component creates at once (build slice 22): no dialog; the name comes
// from the element's first heading (else section-1, section-2…), the default
// slots, card component and page CSS are written as one undo step, and Edit
// component mode opens on the new instance.
// Default native-starter fixture group. The card grid and the plan's notes in
// the mode's bar: native-cards.spec.ts; refusals: native-components.spec.ts.
const indexPath = "index.html";
const tag = "section-a-native-browser";
const templatePath = `components/${tag}/${tag}.html`;
const cssPath = `components/${tag}/${tag}.css`;
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const canvasBar = (page: Page) => page.locator(".canvas-bar");
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const row = (page: Page, name: string | RegExp) => tree(page).getByRole("treeitem", { name, exact: typeof name === "string" }).first();
const done = (page: Page) => page.getByRole("button", { name: "Done editing component", exact: true });

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${indexPath}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
}

/** Selects a Structure row and makes it a component, which opens Edit component mode on it. */
async function makeFrom(page: Page, rowName: string | RegExp | Locator, kind: string, made: string) {
  await (typeof rowName === "object" && !(rowName instanceof RegExp) ? rowName : row(page, rowName)).locator(".page-structure__label").first().click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText(kind);
  await bar(page).getByRole("button", { name: "Make component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", `components/${made}/${made}.html`);
  await expect(canvasBar(page).locator(".edit-mode__title")).toHaveText(`Editing<${made}>`);
}

test("Make component makes a section a component at once, named from its heading, and opens Edit component mode; one undo takes it all back", { tag: "@smoke" }, async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, baseURL);
  const before = await effectiveSource(page, baseURL, indexPath);
  await makeFrom(page, "Section A native browser preview", "Section", tag);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#status")).toContainText(`Made the component <${tag}>`);

  // The page holds the instance with whole-element slots; the template and its CSS are drafted.
  await expect.poll(() => effectiveSource(page, baseURL, indexPath)).toContain(`<${tag}>
    <h1 slot="title" data-key="hero-title">A native browser preview</h1>
    <p slot="text" class="lead" data-key="hero-lead">`);
  await expect.poll(async () => (await storedDraft(page, templatePath))?.content).toContain(`<slot name="title"><h1 data-key="hero-title">A native browser preview</h1></slot>`);
  await expect.poll(async () => (await storedDraft(page, cssPath))?.content).toContain(":host");
  // The mode frames the new instance, its placeholders showing.
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
  await expect(canvasBar(page).getByRole("button", { name: "Show placeholders", exact: true })).toHaveAttribute("aria-pressed", "true");
  // No notes for this plan.
  await expect(canvasBar(page).locator(".edit-mode__note")).toHaveCount(0);

  await done(page).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(frame(page).locator(tag)).toHaveCount(0);
  await expect.poll(() => effectiveSource(page, baseURL, indexPath)).toBe(before);
  for (const path of [templatePath, cssPath]) await expect.poll(() => storedDraft(page, path)).toBeUndefined();
  // Redo makes them again.
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(frame(page).locator(tag)).toHaveCount(1);
  await expect.poll(async () => (await storedDraft(page, cssPath))?.content).toContain(":host");
  await expect.poll(async () => (await storedDraft(page, templatePath))?.content).toContain(`<slot name="title">`);
  expect(errors).toEqual([]);
});

test("Make component names a div block-…, a card card-…, and sections with no heading section-1, section-2", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const response = await page.request.get(`${baseURL}/__demo/file?path=${indexPath}`);
  const source = (await response.text()).replace(`<section class="filler" data-key="filler">`,
    `<div class="note" data-key="note"><h3>A <em>small</em> note on its own</h3><p>Text.</p></div>
  <article class="offer" data-key="offer"><h2>An offer</h2><p>Card body</p><a href="/about.html">Read more</a></article>
  <section class="quiet" data-key="quiet-1"><p>No heading here.</p></section>
  <section class="quiet" data-key="quiet-2"><p>Nor here.</p></section>
  <section class="filler" data-key="filler">`);
  const edited = await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: indexPath, content: source } });
  expect(edited.ok()).toBeTruthy();
  await page.reload();
  await expect(frame(page).locator("div.note")).toBeVisible({ timeout: 30_000 });

  await makeFrom(page, /^Block A small note/, "Block", "block-a-small-note");
  await done(page).click();
  await expect(frame(page).locator("block-a-small-note p[slot]")).toHaveText("Text.");

  await makeFrom(page, /^Article An offer/, "Article", "card-an-offer");
  await done(page).click();
  await expect(frame(page).locator("card-an-offer h2[slot=title]")).toHaveText("An offer");

  // The rows of sections with no heading are named "Section": the starter's cards section, then these two.
  await makeFrom(page, tree(page).getByRole("treeitem", { name: "Section", exact: true }).nth(1), "Section", "section-1");
  await done(page).click();
  await makeFrom(page, tree(page).getByRole("treeitem", { name: "Section", exact: true }).nth(1), "Section", "section-2");
  await done(page).click();
  const written = await effectiveSource(page, baseURL, indexPath);
  for (const made of ["block-a-small-note", "card-an-offer", "section-1", "section-2"]) {
    expect(written).toContain(`<${made}`);
    expect(await storedDraft(page, `components/${made}/${made}.html`)).toBeDefined();
  }
});
