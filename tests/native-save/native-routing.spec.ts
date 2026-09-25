import { expect, test, type Page } from "@playwright/test";

// File-based routing (shared/native-routes.ts) over `fixtures/native-routing`,
// served as the `native-routing` repository (id 530): its manifest lists no
// page, so every route comes from where the page file is under src/pages/,
// and "/work/fern-and-kettle/" has a metadata-only entry (a title, no file);
// src/pages/work/notes.html is a heading-only page, with no section.
const indexPath = "src/pages/index.html";
const manifestPath = ".astro-editor/native.json";
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
const block = (page: Page) => page.getByRole("group", { name: "Page" });
const title = (page: Page) => block(page).getByLabel("Title");
const follow = (page: Page, name: string) =>
  frame(page).getByRole("link", { name, exact: true }).click({ modifiers: ["ControlOrMeta"] });

async function open(page: Page, baseURL: string | undefined, file = indexPath) {
  await page.goto(`${baseURL}/${hash(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
}

test("nested pages are routed by their folders and #/ links follow to them", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(heading(page)).toHaveText("Routed by folders");
  await expect(page.locator(".native-preview-warning")).toBeHidden();

  // src/pages/work/index.html is /work/.
  await follow(page, "Our work");
  await expect(heading(page)).toHaveText("Work");
  await expect(title(page)).toHaveValue("");

  // src/pages/work/fern-and-kettle.html is /work/fern-and-kettle/, titled by
  // its metadata-only manifest entry.
  await follow(page, "Fern and Kettle");
  await expect(heading(page)).toHaveText("Fern and Kettle");
  await expect(title(page)).toHaveValue("Fern & Kettle");

  // The link Address suggests the derived routes; a page under _parts/ is not one.
  await frame(page).getByRole("link", { name: "All work", exact: true }).click();
  await page.getByRole("button", { name: "Address" }).click();
  const options = page.getByRole("listbox").getByRole("option");
  await expect(options).toHaveText(["#/", "#/work/", "Fern & Kettle (#/work/fern-and-kettle/)", "#/work/notes/"]);
  await page.keyboard.press("Escape");

  await follow(page, "All work");
  await expect(heading(page)).toHaveText("Work");
  await follow(page, "Home");
  await expect(heading(page)).toHaveText("Routed by folders");
});

test("opening a nested page file shows its route, and titling it adds a metadata-only entry", async ({ page, baseURL }) => {
  await open(page, baseURL, "src/pages/work/index.html");
  await expect(heading(page)).toHaveText("Work");
  await title(page).fill("Our work");
  await expect(page.locator("#status")).toHaveText("Title updated");

  await page.getByRole("button", { name: "Save to GitHub", exact: true }).click();
  await page.locator("#publish-files").getByRole("button", { name: `Show changes in ${manifestPath}` }).click();
  const dialog = page.getByRole("dialog", { name: manifestPath });
  await expect(dialog.locator(".publish-diff__code.is-del")).toContainText(['    "/work/fern-and-kettle/": { "title": "Fern & Kettle" }']);
  await expect(dialog.locator(".publish-diff__code.is-add")).toContainText([
    '    "/work/fern-and-kettle/": { "title": "Fern & Kettle" },',
    '    "/work/": { "title": "Our work" }',
  ]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Emptying the title removes the entry again: nothing left to save.
  await title(page).fill("");
  await expect(page.locator("#status")).toHaveText("Title removed");
  await expect(page.getByRole("button", { name: "Save to GitHub", exact: true })).toBeDisabled();
});

test("without the whole-commit tree, src/pages is listed in one recursive request", async ({ page, baseURL }) => {
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
  expect(recursive).toHaveLength(1);
});

test("two files on one route show a warning above the page, which still renders", async ({ page, baseURL }) => {
  // A `work.html` beside `work/index.html`, added to the branch listing.
  await page.route("**/api/snapshot?**", async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    const index = snapshot.tree.find((entry: { path: string }) => entry.path === "src/pages/work/index.html");
    snapshot.tree.push({ ...index, path: "src/pages/work.html" });
    await route.fulfill({ response, json: snapshot });
  });
  await open(page, baseURL);
  await expect(page.locator(".native-preview-warning")).toHaveText(
    'src/pages/work.html and src/pages/work/index.html both give the route /work/; src/pages/work/index.html is used. Rename one, or map "/work/" to a file in native.json.',
  );
  await expect(page.locator(".native-preview-warning")).toHaveAttribute("role", "status");
  await follow(page, "Our work");
  await expect(heading(page)).toHaveText("Work");
});
