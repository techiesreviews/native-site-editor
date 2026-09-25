import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Creating files, folders and pages from the file tree (src/native-create.ts,
// src/components/create-dialog.ts). A new file is a browser draft with no
// base blob; saving commits it through the real worker publish path to the
// fake GitHub (server.ts). The routing tests use `native-routing` (id 530),
// whose pages are routed by their folders; the manifest and conflict tests use
// the starter repository (id 501), which `/__demo/external-edit` writes to.
const indexPath = "src/pages/index.html";
const manifestPath = ".astro-editor/native.json";
const routingRepo = "native-demo-user/native-routing";
const starterRepo = "native-demo-user/native-demo";
const routingHome = readFileSync(resolve("fixtures/native-routing/src/pages/index.html"), "utf8");
const pageErrors: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const explorer = (page: Page) => page.locator("#explorer");
const row = (page: Page, name: string) => explorer(page).getByRole("button", { name, exact: true });
const saveTrigger = (page: Page) => page.getByRole("button", { name: "Save to GitHub", exact: true });

async function open(page: Page, baseURL: string | undefined, repo: number, file = indexPath) {
  await page.goto(`${baseURL}/#repo=${repo}&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveText(file, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

async function openExplorer(page: Page) {
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(explorer(page)).toBeVisible();
}

// Opens the folders along `path` in the tree.
async function expand(page: Page, path: string) {
  await openExplorer(page);
  for (const part of path.split("/")) {
    const item = row(page, part).first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    if ((await item.getAttribute("aria-expanded")) === "false") await item.click();
    await expect(item).toHaveAttribute("aria-expanded", "true");
  }
}

// A file on the fake GitHub branch, read through the worker's API.
async function branchFile(page: Page, repo: string, path: string): Promise<string | undefined> {
  const snapshot = await (await page.request.get(`/api/snapshot?${new URLSearchParams({ repo, branch: "main" })}`)).json();
  const entry = (snapshot.tree as { path: string; sha: string }[]).find((item) => item.path === path);
  if (!entry) return undefined;
  const file = await (await page.request.get(`/api/file?${new URLSearchParams({ repo, sha: entry.sha })}`)).json();
  return file.content;
}

async function saveAll(page: Page) {
  await saveTrigger(page).click();
  const panel = page.locator("#publish-files");
  await expect(panel).toBeVisible();
  for (const box of await panel.locator(".publish-menu__file input").all()) await box.check();
  await page.getByRole("button", { name: "Save selected files", exact: true }).click();
}

test("New page creates src/pages/videos/intro.html from the home page, routes it at once, and saves it with its title", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await openExplorer(page);
  const newPage = explorer(page).getByRole("button", { name: "New page", exact: true });
  await newPage.click();
  const dialog = page.getByRole("dialog", { name: "New page" });
  await expect(dialog).toBeVisible();
  const url = dialog.getByRole("textbox", { name: "Page URL" });
  await expect(url).toBeFocused();
  await expect(url).toHaveValue("/");
  // A route that is already a page is refused; the file shows live as the URL is typed.
  await url.fill("/work/");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("The URL /work/ already has a page, src/pages/work/index.html.");
  await expect(url).toHaveAttribute("aria-invalid", "true");
  await url.fill("/videos/intro/");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("Creates src/pages/videos/intro.html at /videos/intro/.");
  await dialog.getByRole("textbox", { name: "Title (optional)" }).fill("Intro videos");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("Creates src/pages/videos/intro.html at /videos/intro/, with its title in native.json.");
  await page.keyboard.press("Enter");

  await expect(dialog).toBeHidden();
  await expect(page.locator("#current-page")).toHaveText("src/pages/videos/intro.html");
  await expect(page.locator("#status")).toHaveText("Created the page src/pages/videos/intro.html at /videos/intro/.");
  await expect(frame(page).locator("h1")).toHaveText("Intro videos");
  await expect(page.getByRole("group", { name: "Page" }).getByLabel("Title")).toHaveValue("Intro videos");
  await expect(page.locator("#content .view-lines")).toContainText('<h1 data-key="title">Intro videos</h1>');

  // The tree shows the new folder and file in place, marked new.
  await expand(page, "src/pages");
  await row(page, "videos New").click();
  await expect(row(page, "intro.html New")).toBeVisible();
  await page.keyboard.press("Escape");

  // The route is a page of the site: a link can point to it and follow it.
  await openExplorer(page);
  await row(page, "index.html").click();
  await expect(frame(page).locator("h1")).toHaveText("Routed by folders");
  await frame(page).getByRole("link", { name: "Our work", exact: true }).click();
  await page.getByRole("button", { name: "Address" }).click();
  await page.locator(".edit-bar__popover").getByRole("option", { name: "Intro videos (#/videos/intro/)" }).click();
  await frame(page).getByRole("link", { name: "Our work", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator("h1")).toHaveText("Intro videos");

  // Saving commits the new page, the manifest's title and the link together.
  await saveAll(page);
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  const created = await branchFile(page, routingRepo, "src/pages/videos/intro.html");
  expect(created).toBe('<main class="page" data-key="main">\n  <h1 data-key="title">Intro videos</h1>\n</main>\n');
  expect(JSON.parse((await branchFile(page, routingRepo, manifestPath))!).routes["/videos/intro/"]).toEqual({ title: "Intro videos" });
  expect(await branchFile(page, routingRepo, indexPath)).toBe(routingHome.replace('href="#/work/"', 'href="#/videos/intro/"'));
  await page.keyboard.press("Escape");

  // Saved, the files are no longer new.
  await openExplorer(page);
  await expect(row(page, "videos")).toBeVisible();
  await expect(row(page, "intro.html")).toBeVisible();
});

test("New folder under src/pages starts it with its index page; the + of that folder offers New page", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await expand(page, "src/pages");
  const add = explorer(page).getByRole("button", { name: "New in src/pages", exact: true });
  await add.click();
  const dialog = page.getByRole("dialog", { name: "New file, folder or page in src/pages" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: "Folder" }).check();
  const name = dialog.getByRole("textbox", { name: "Folder name" });
  await name.fill("work");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("src/pages/work already exists.");
  await name.fill("videos");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("Creates the page src/pages/videos/index.html at /videos/.");
  await name.press("Enter");
  await expect(page.locator("#current-page")).toHaveText("src/pages/videos/index.html");
  await expect(frame(page).locator("h1")).toHaveText("Videos");

  // In the new folder, a page's URL starts from the folder's; the folder
  // exists now, so a page named after it would be its index.
  await expand(page, "src/pages");
  await row(page, "videos New").click();
  await explorer(page).getByRole("button", { name: "New in src/pages/videos", exact: true }).click();
  const second = page.getByRole("dialog", { name: "New file, folder or page in src/pages/videos" });
  await expect(second.getByRole("radio", { name: "Page" })).toBeChecked();
  const url = second.getByRole("textbox", { name: "Page URL" });
  await expect(url).toHaveValue("/videos/");
  await expect(second.locator(".create-dialog__result")).toHaveText("Enter a page url.");
  await url.press("End");
  await url.pressSequentially("intro");
  await expect(second.locator(".create-dialog__result")).toHaveText("Creates src/pages/videos/intro.html at /videos/intro/.");
  // Escape closes the dialog only: the explorer stays, focus back on the +.
  await page.keyboard.press("Escape");
  await expect(second).toBeHidden();
  await expect(explorer(page)).toBeVisible();
  await expect(explorer(page).getByRole("button", { name: "New in src/pages/videos", exact: true })).toBeFocused();
});

test("a new stylesheet registers in native.json; a new folder elsewhere holds a .gitkeep; discarding a new file removes it from the tree", async ({ page, baseURL }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await open(page, baseURL, 501);
  await expand(page, "src/styles");
  await explorer(page).getByRole("button", { name: "New in src/styles", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New file or folder in src/styles" });
  await expect(dialog.getByRole("radio", { name: "Page" })).toBeHidden();
  const name = dialog.getByRole("textbox", { name: "File name" });
  await name.fill("../x.css");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("A name cannot be . or ..");
  await name.fill("site.css");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("src/styles/site.css already exists.");
  await name.fill("print.css");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("Creates the empty file src/styles/print.css and adds it to the site's styles in native.json.");
  await name.press("Enter");
  await expect(page.locator("#current-page")).toHaveText("src/styles/print.css");
  await expect(page.locator("#status")).toHaveText("Created src/styles/print.css.");

  // The save list has the new file and the manifest's new line.
  await saveTrigger(page).click();
  const panel = page.locator("#publish-files");
  await expect(panel.getByRole("button", { name: "New file, 1 lines. Show changes in src/styles/print.css" })).toBeVisible();
  await panel.getByRole("button", { name: `Show changes in ${manifestPath}` }).click();
  const diff = page.getByRole("dialog", { name: manifestPath });
  await expect(diff.locator(".publish-diff__code.is-add")).toContainText(['  "styles": ["src/styles/site.css", "src/styles/print.css"]']);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // A folder outside src/pages: git keeps no empty folders, so it holds a .gitkeep.
  await openExplorer(page);
  await explorer(page).getByRole("button", { name: "New file or folder", exact: true }).click();
  const root = page.getByRole("dialog", { name: "New file or folder" });
  await root.getByRole("radio", { name: "Folder" }).check();
  await root.getByRole("textbox", { name: "Folder name" }).fill("notes/drafts");
  await expect(root.locator(".create-dialog__result")).toContainText("Creates notes/drafts/.gitkeep");
  await page.keyboard.press("Enter");
  await expect(root).toBeHidden();
  await expect(page.locator("#status")).toHaveText("Created the folder notes/drafts.");
  await expect(row(page, "drafts New")).toBeFocused();
  await expect(row(page, ".gitkeep New")).toBeVisible();

  // Discarding the new stylesheet takes it out of the tree.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Discard changes" }).click();
  await openExplorer(page);
  await expect(row(page, "styles")).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "site.css")).toBeVisible();
  await expect(row(page, "print.css New")).toHaveCount(0);
});

test("a new file whose path appeared on GitHub meanwhile is refused on save and kept as a draft", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await openExplorer(page);
  await explorer(page).getByRole("button", { name: "New file or folder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New file or folder" });
  await dialog.getByRole("textbox", { name: "File name" }).fill("docs/notes.md");
  await page.keyboard.press("Enter");
  await expect(page.locator("#current-page")).toHaveText("docs/notes.md");
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.type("# My notes");

  // Someone else commits the same path.
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "docs/notes.md", content: "# Their notes\n" } });
  await saveTrigger(page).click();
  await page.getByRole("button", { name: "Save selected files", exact: true }).click();
  await expect(page.locator(".publish-menu__message")).toContainText("GitHub changed these files: docs/notes.md", { timeout: 30_000 });
  expect(await branchFile(page, starterRepo, "docs/notes.md")).toBe("# Their notes\n");
  await page.keyboard.press("Escape");

  // Reopened, the file is GitHub's and the draft shows the conflict bar.
  await page.reload();
  await expect(page.locator("#current-page")).toHaveText("docs/notes.md", { timeout: 30_000 });
  await expect(page.locator("#content .code-editor__conflict")).toContainText("GitHub changed since this draft started.");
  await expect(page.locator("#content .view-lines")).toContainText("# My notes");
});
