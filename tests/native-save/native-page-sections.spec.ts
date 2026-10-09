import { openPageSettingsFromPages } from "./settings-entry";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// A new page made in the Pages tab is the home page's document with its
// title and an empty <main> (src/native-create.ts); a page whose <main>
// holds no section offers one place at the end of <main> (the preview
// runtime's insert points, src/native-insert.ts). The top bar names an open
// page by its title, as the Pages tab labels it, and any other file by its
// path. A section is added as ordinary HTML, with the shared section
// stylesheet linked from <head>. The starter repository (id 501) has a section component;
// `native-routing` (id 530) has the heading-only page work/notes.html.
const indexPath = "index.html";
const starterHome = readFileSync(resolve("fixtures/native-starter/index.html"), "utf8");
const pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const explorer = (page: Page) => page.locator("#explorer");
const label = (page: Page) => page.locator("#current-page");
const plus = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const shown = (page: Page) => page.locator(".insert-point.is-near .insert-point__plus");
const picker = (page: Page) => page.getByRole("dialog", { name: "Add to the page" });
const item = (page: Page, name: string) => explorer(page).getByRole("treeitem", { name, exact: true });

async function open(page: Page, baseURL: string | undefined, repo: number, file = indexPath) {
  await page.goto(`${baseURL}/#repo=${repo}&branch=main&file=${encodeURIComponent(file)}`);
  await expect(label(page)).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

async function openPages(page: Page) {
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(explorer(page)).toBeVisible();
  await explorer(page).getByRole("tab", { name: "Pages" }).click();
}

async function editorText(page: Page) {
  const textbox = page.locator(`#content [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return text;
}

test("a new page starts with an empty <main>, and a native page section goes in it", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await expect(label(page)).toHaveText("Home");
  await openPages(page);
  await explorer(page).getByRole("button", { name: "+ New page" }).click();
  await explorer(page).getByRole("textbox", { name: "New page title" }).fill("Services");
  await page.keyboard.press("Enter");
  await expect(label(page)).toHaveAttribute("data-path", "services/index.html");
  await expect(label(page)).toHaveText("Services");
  await expect(page.locator("#explorer-toggle")).toHaveAttribute("title", "Pages & files — services/index.html");
  await expect(frame(page).locator("main")).toBeEmpty();
  await expect(frame(page).locator("site-header .site-header")).toBeVisible();

  // The home page's document: the new title, no description, <main> emptied.
  const shell = (inner: string) => starterHome
    .replace(/<title>[^<]*<\/title>/, "<title>Services</title>")
    .replace(/(<meta (?:name="description"|property="og:description") content=")[^"]*"/g, '$1"')
    .replace(/(<meta property="og:title" content=")[^"]*"/, "$1Services\"")
    .replace(/(<main[^>]*>)[\s\S]*<\/main>/, `$1\n${inner}</main>`);
  await expect.poll(() => editorText(page)).toBe(shell(""));

  // One place, at the end of <main>: the empty page's "Start with a section"
  // stands there instead of its plus, and suggests native page sections.
  await expect(page.locator(".insert-point__plus")).toHaveCount(1);
  await expect(page.locator(".insert-point__plus")).toBeHidden();
  const empty = page.getByRole("region", { name: "Empty page" });
  await expect(empty).toContainText("Start with a section");
  for (const name of ["Intro", "Features", "Split", "Contact"]) await expect(empty.getByRole("button", { name: `Add ${name}`, exact: true })).toHaveCount(0);
  await empty.getByRole("button", { name: "Add Feature block", exact: true }).click();
  await expect(frame(page).locator("main > *")).toHaveCount(1);
  await expect(frame(page).locator("main > feature-block")).toHaveCount(1);
  await expect(frame(page).locator("main > feature-block h2")).toHaveText("A feature worth sharing");
  await expect(empty).toBeHidden();
  expect(await editorText(page)).not.toContain("styles/sections.css");
  // One Undo restores the empty page exactly.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => editorText(page)).toBe(shell(""));
  await expect(frame(page).locator("main")).toBeEmpty();
  await expect(empty).toBeVisible();
});

test("the top bar shows the open page's title, follows the applied Page settings title, and a stylesheet's path", async ({ page, baseURL }) => {
  await open(page, baseURL, 501, "about/index.html");
  // The page's <title>.
  await expect(label(page)).toHaveText("About this project");
  await expect(page.locator("#explorer-toggle")).toHaveAttribute("title", "Pages & files — about/index.html");
  await writeSetting(page, "Title", "Our story");
  await expect(page.locator("#status")).toHaveText("Page settings applied as a draft. Save to GitHub to keep them.");
  await expect(label(page)).toHaveText("Our story");
  // An empty title: the first heading.
  await writeSetting(page, "Title", "");
  await expect(label(page)).toHaveText("About this project");
  await writeSetting(page, "Title", "Our story");
  await expect(label(page)).toHaveText("Our story");

  // Switching pages in the Pages tab follows.
  await openPages(page);
  await item(page, "Home").click();
  await expect(label(page)).toHaveText("Home");
  await expect(label(page)).toHaveAttribute("data-path", indexPath);
  await openPages(page);
  await item(page, "Our story").click();
  await expect(label(page)).toHaveText("Our story");

  // Any other file shows its path.
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Files" }).click();
  await page.locator("#files").getByRole("button", { name: "styles", exact: true }).click();
  await page.locator("#files").getByRole("button", { name: "site.css", exact: true }).click();
  await expect(label(page)).toHaveText("styles/site.css");
  await expect(label(page)).toHaveAttribute("data-path", "styles/site.css");
});

test("a page whose <main> holds no section offers one place at the end of <main>", async ({ page, baseURL }) => {
  await open(page, baseURL, 530, "work/notes.html");
  await expect(label(page)).toHaveText("Notes");
  await expect(frame(page).locator("main > h1")).toHaveText("Notes");
  const end = plus(page, "Add a section at the end");
  await expect(page.locator(".insert-point__plus")).toHaveCount(1);
  await expect(end).toHaveCount(1);
  // Shown while the pointer is anywhere in <main>, just below its last child
  // (not over it, so the heading can still be clicked).
  await frame(page).locator("main > h1").hover();
  await expect(shown(page)).toHaveCount(1);
  await expect(shown(page)).toHaveAccessibleName("Add a section at the end");
  await expect.poll(async () => {
    const heading = (await frame(page).locator("main > h1").boundingBox())!;
    const box = (await end.boundingBox())!;
    const bottom = heading.y + heading.height;
    return box.y >= bottom - 1 && box.y <= bottom + 4;
  }).toBe(true);
  await frame(page).locator("main > h1").click();
  await expect(page.getByRole("toolbar", { name: "Edit bar" })).toBeVisible();
  await end.click();
  await expect(picker(page).locator(".pb-add-panel__position")).toBeHidden();
  // With no authored components, Add explains the empty catalogue.
  await expect(picker(page).getByRole("option")).toHaveCount(0);
  await expect(picker(page).locator(".pb-add-panel__message")).toBeVisible();
  await picker(page).getByRole("button", { name: "Close", exact: true }).click();
  const notes = readFileSync(resolve("fixtures/native-routing/work/notes.html"), "utf8");
  await expect.poll(() => editorText(page)).toBe(notes);
  await expect(frame(page).locator("main > *")).toHaveCount(1);

  // A page with sections keeps its gaps between them only.
  await open(page, baseURL, 530);
  await expect(page.locator(".insert-point__plus")).toHaveCount(2);
});

const settingsDialog = (page: Page) => page.getByRole("dialog", { name: "Page settings", exact: true });
async function openSettings(page: Page) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.locator("#explorer").getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
  await expect(settingsDialog(page)).toBeVisible();
}
async function writeSetting(page: Page, label: string, value: string) {
  await openSettings(page);
  await settingsDialog(page).getByLabel(label, { exact: true }).fill(value);
  await settingsDialog(page).getByRole("button", { name: "Apply page settings", exact: true }).click();
  await expect(settingsDialog(page)).toBeHidden();
}
