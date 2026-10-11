import { expect, test, type Page } from "@playwright/test";

// Actual starter group; small pages isolate route changes and page history around a framed instance.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
const TEMPLATE = "components/section-mode/section-mode.html";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const title = (page: Page) => page.locator(".edit-mode__title");
const source = (page: Page, path: string) => page.evaluate(async path =>
  (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const home = '<!doctype html><html><head><title>Mode home</title><link rel="stylesheet" href="/styles/site.css"></head><body><main><section-mode></section-mode><section id="after"><h2>After heading</h2><p>After text</p></section><section id="last"><h2>Last heading</h2><p>Last text</p></section></main></body></html>';
const destination = '<!doctype html><html><head><title>Destination</title><link rel="stylesheet" href="/styles/site.css"></head><body><main><section id="first"><h2>Destination heading</h2><p>First paragraph</p></section><section id="second"><div class="flow"><p>Second paragraph</p></div></section></main></body></html>';

async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  for (const [path, content] of [
    [TEMPLATE, '<section><h2>Shared heading</h2><a href="/destination.html">Show destination</a></section>'],
    ["components/section-mode/section-mode.css", ':host { display: block; } section { padding: 40px; }'],
    ["index.html", home], ["destination.html", destination],
  ]) expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).getByText("Shared heading", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => source(page, "index.html")).toBe(home);
}

const row = (page: Page, name: RegExp) => page.getByRole("treeitem", { name }).first();
async function insertAbove(page: Page) {
  const at = home.indexOf("<section-mode>");
  await page.evaluate(async ({ at }) => {
    (await import("/src/components/code-editor.ts")).replaceActiveRange({ path: "index.html", start: at, end: at, text: "<p>Before instance</p>", expected: "" });
  }, { at });
  await expect(frame(page).getByText("Before instance", { exact: true })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: /^Paragraph Before instance/ })).toBeVisible();
}

async function enter(page: Page) {
  const row = page.getByRole("treeitem", { name: /^Section mode/ }).first();
  await row.locator(".page-structure__label").click();
  await page.getByRole("toolbar", { name: "Edit bar", exact: true })
    .getByRole("button", { name: "Edit Section mode component", exact: true }).click();
  await expect(title(page)).toHaveText("Editing<section-mode>");
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
}

async function point(page: Page, selector: string, fx = 0.5, fy = 0.5) {
  const target = frame(page).locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 10, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(page.locator(".pb-drag-ghost")).toBeVisible();
  await expect(page.locator(".pb-drag-ghost")).not.toHaveClass(/is-refused/);
}

test("Ctrl-click leaves component mode; rail and canvas drags work on the page shown", { tag: "@actual" }, async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await enter(page);
  await frame(page).getByRole("link", { name: "Show destination" }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).getByText("Destination heading", { exact: true })).toBeVisible();
  await expect(title(page)).toHaveCount(0);
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']:visible, [data-native-selection-box='edit-shade']:visible")).toHaveCount(0);
  await expect(page.getByRole("treeitem", { name: /^Section Destination heading/ })).toBeVisible();
  await expect(page.locator("[data-template-path]")).toHaveCount(0);

  const to = await point(page, "#second .flow p", 0.5, 0.9);
  const button = page.getByRole("navigation", { name: "Blocks" }).getByRole("button", { name: "Paragraph", exact: true });
  const box = (await button.boundingBox())!;
  await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, to);
  await page.mouse.up();
  await expect(frame(page).locator("#second .flow > p")).toHaveCount(2);
  await expect.poll(() => source(page, "destination.html")).toContain("<p>Text</p>");

  await drag(page, await point(page, "#first h2", 0.2), await point(page, "#second .flow > p", 0.5, 0.9));
  await page.mouse.up();
  await expect(frame(page).locator("#second .flow > h2")).toHaveText("Destination heading");
  await expect(frame(page).locator("#first h2")).toHaveCount(0);
  await expect.poll(() => source(page, "destination.html")).toMatch(/<div class="flow">[\s\S]*<h2>Destination heading<\/h2>[\s\S]*<\/div>/);
});

test("Undo before mode entry moves the instance and clears the mode bar and frame", { tag: "@actual" }, async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await insertAbove(page);
  await enter(page);
  await expect(row(page, /^Section mode/)).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(frame(page).getByText("Before instance", { exact: true })).toHaveCount(0);
  await expect(title(page)).toHaveCount(0);
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']:visible, [data-native-selection-box='edit-shade']:visible")).toHaveCount(0);
  await expect(page.locator("[data-template-path]")).toHaveCount(0);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  // The tree follows the instance, not the row index it had: the section now in its old place stays folded.
  await expect(row(page, /^Section mode/)).toHaveAttribute("aria-selected", "true");
  await expect(row(page, /^Section After heading/)).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#structure [role=treeitem][aria-selected=true]")).toHaveCount(1);
  // Reopen only after proving Undo alone cleared the mode, then verify the restored page bytes.
  await page.getByRole("treeitem", { name: /^Section mode/ }).first().locator(".page-structure__label").click();
  await expect.poll(() => source(page, "index.html")).toBe(home);
});

test("Undo and Redo of a row above keep the unfolded, selected row on its element", { tag: "@actual" }, async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await insertAbove(page);
  const after = row(page, /^Section After heading/), last = row(page, /^Section Last heading/);
  await after.locator(".page-structure__label").click();
  await expect(after).toHaveAttribute("aria-selected", "true");
  if (await after.getAttribute("aria-expanded") === "false") await after.locator(".page-structure__toggle").click();
  await expect(after).toHaveAttribute("aria-expanded", "true");
  for (const step of ["Undo", "Redo"]) {
    await page.getByRole("button", { name: step, exact: true }).click();
    await expect(frame(page).getByText("Before instance", { exact: true })).toHaveCount(step === "Undo" ? 0 : 1);
    await expect(page.getByRole("treeitem", { name: /^Paragraph Before instance/ })).toHaveCount(step === "Undo" ? 0 : 1);
    await expect(after).toHaveAttribute("aria-expanded", "true");
    await expect(after).toHaveAttribute("aria-selected", "true");
    await expect(last).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#structure [role=treeitem][aria-selected=true]")).toHaveCount(1);
  }
});
