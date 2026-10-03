import { expect, test, type Page } from "@playwright/test";
import { publishButton, showPublish } from "./publish";
import { storedDraft } from "./drafts";

// The repository is the site (shared/native-routes.ts) over
// `fixtures/native-routing`, served as the `native-routing` repository (id
// 530): index.html is /, work/index.html is /work/,
// work/fern-and-kettle/index.html is /work/fern-and-kettle/,
// work/notes.html is /work/notes.html (a heading-only page, with no
// section), and _parts/note.html is not a page. Each page's title is its
// <title>.
const indexPath = "index.html";
const hash = (file: string) => `#repo=530&branch=main&file=${encodeURIComponent(file)}`;
const pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const heading = (page: Page) => frame(page).locator("h1");

const follow = (page: Page, name: string) =>
  frame(page).getByRole("link", { name, exact: true }).click({ modifiers: ["ControlOrMeta"] });

async function open(page: Page, baseURL: string | undefined, file = indexPath) {
  await page.goto(`${baseURL}/${hash(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
}

test("pages are routed by their paths, and root and relative links follow to them", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(heading(page)).toHaveText("Routed by folders");
  await expect(page.locator(".native-preview-warning")).toBeHidden();
  await readSetting(page, "Title", "Routed by folders");

  // work/index.html is /work/.
  await follow(page, "Our work");
  await expect(heading(page)).toHaveText("Work");
  await readSetting(page, "Title", "Work");

  // work/fern-and-kettle/index.html is /work/fern-and-kettle/, titled by its <title>.
  await follow(page, "Fern and Kettle");
  await expect(heading(page)).toHaveText("Fern and Kettle");
  await readSetting(page, "Title", "Fern & Kettle");

  // The link Address suggests the site's pages by title; a page under _parts/ is not one.
  await frame(page).getByRole("link", { name: "All work", exact: true }).click();
  await page.getByRole("button", { name: "Address" }).click();
  const options = page.getByRole("listbox").getByRole("option");
  await expect(options).toHaveText(["Routed by folders (/)", "Work (/work/)", "Fern & Kettle (/work/fern-and-kettle/)", "Notes (/work/notes.html)"]);
  await page.keyboard.press("Escape");

  // A relative link (../), resolved against the page's URL.
  await follow(page, "All work");
  await expect(heading(page)).toHaveText("Work");
  await follow(page, "Notes");
  await expect(heading(page)).toHaveText("Notes");
  await open(page, baseURL, "work/index.html");
  await follow(page, "Home");
  await expect(heading(page)).toHaveText("Routed by folders");
});

test("opening a nested page file shows its route, and titling it writes its <title>", async ({ page, baseURL }) => {
  await open(page, baseURL, "work/index.html");
  await expect(heading(page)).toHaveText("Work");
  await writeSetting(page, "Title", "Our work");
  await expect(page.locator("#status")).toHaveText("Page settings applied as a draft. Save to GitHub to keep them.");
  // The <head> is collapsed in the code editor: the draft holds the title.
  await expect.poll(async () => (await storedDraft(page, "work/index.html"))?.content).toContain("<title>Our work</title>");

  // The only change is the page.
  await showPublish(page);
  await expect(page.locator("#publish-files .publish-menu__file")).toHaveCount(1);
  await expect(page.locator("#publish-files .publish-menu__file")).toContainText("work/index.html");
  await page.keyboard.press("Escape");

  // The title as it was: nothing left to save.
  await writeSetting(page, "Title", "Work");
  await expect(page.locator("#status")).toHaveText("Page settings applied as a draft. Save to GitHub to keep them.");
  await expect(publishButton(page)).toBeDisabled();
});

test("without the whole-commit tree, the repository is listed with one recursive request per top-level folder", async ({ page, baseURL }) => {
  const recursive: string[] = [];
  await page.route("**/api/snapshot?**", async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    delete snapshot.tree;
    await route.fulfill({ response, json: snapshot });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/tree" && url.searchParams.get("recursive") === "1") recursive.push(url.search);
  });
  await open(page, baseURL);
  await expect(heading(page)).toHaveText("Routed by folders");
  await follow(page, "Our work");
  await follow(page, "Fern and Kettle");
  await expect(heading(page)).toHaveText("Fern and Kettle");
  // _parts, styles and work.
  expect(recursive).toHaveLength(3);
});

test("two files for one component show a warning above the page, which still renders", async ({ page, baseURL }) => {
  // components/site-note.html beside components/site-note/site-note.html, added to the branch listing.
  await page.route("**/api/snapshot?**", async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    const note = snapshot.tree.find((entry: { path: string }) => entry.path === "_parts/note.html");
    snapshot.tree.push({ ...note, path: "components/site-note.html" }, { ...note, path: "components/site-note/site-note.html" });
    await route.fulfill({ response, json: snapshot });
  });
  await open(page, baseURL);
  await expect(page.locator(".native-preview-warning")).toContainText(
    "components/site-note.html and components/site-note/site-note.html both give the component <site-note>; components/site-note/site-note.html is used. Remove or rename one.",
  );
  await expect(page.locator(".native-preview-warning")).toHaveAttribute("role", "status");
  await follow(page, "Our work");
  await expect(heading(page)).toHaveText("Work");
});

const settingsDialog = (page: Page) => page.getByRole("dialog", { name: "Page settings", exact: true });
async function openSettings(page: Page) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.locator("#explorer").getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#page-settings-toggle").click();
  await expect(settingsDialog(page)).toBeVisible();
}
async function readSetting(page: Page, label: string, value: string) {
  await openSettings(page);
  await expect(settingsDialog(page).getByLabel(label, { exact: true })).toHaveValue(value);
  await settingsDialog(page).locator(".site-settings__footer").getByRole("button", { name: "Cancel", exact: true }).click();
}
async function writeSetting(page: Page, label: string, value: string) {
  await openSettings(page);
  await settingsDialog(page).getByLabel(label, { exact: true }).fill(value);
  await settingsDialog(page).getByRole("button", { name: "Apply page settings", exact: true }).click();
  await expect(settingsDialog(page)).toBeHidden();
}
