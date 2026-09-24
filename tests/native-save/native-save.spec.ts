import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// End-to-end tests for native Explicit Save to GitHub. The save request goes
// through the REAL worker `handle` and its optimistic commit path; only the
// GitHub network and the session are faked (see server.ts). No real token.

const fixture = "fixtures/native-starter";
const indexPath = "src/pages/index.html";
const cssPath = "src/styles/site.css";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const cssSource = readFileSync(resolve(fixture, cssPath), "utf8");

const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveText(indexPath, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});

async function focusEditor(page: Page) {
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
}

async function pasteSource(page: Page, contains: string, source: string) {
  await expect(page.locator("#content [role=\"textbox\"]").first()).toBeAttached({ timeout: 20_000 });
  if (contains)
    await expect(page.locator("#content .view-lines")).toContainText(contains, { timeout: 20_000 });
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

async function openExplorer(page: Page) {
  if (!(await page.locator("#explorer").isVisible())) await page.locator("#explorer-toggle").click();
  await expect(page.locator("#explorer")).toBeVisible();
}

async function openFile(page: Page, path: string, contains: string) {
  await openExplorer(page);
  for (const [index, part] of path.split("/").entries()) {
    const item = page.locator("#explorer").getByRole("button", { name: part, exact: true }).first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    const expanded = await item.getAttribute("aria-expanded");
    if (index === path.split("/").length - 1 || expanded === "false") await item.click();
  }
  await expect(page.locator("#current-page")).toHaveText(path);
  await expect(page.locator("#content [role=\"textbox\"]").first()).toBeAttached({ timeout: 20_000 });
  if (contains)
    await expect(page.locator("#content .view-lines")).toContainText(contains, { timeout: 20_000 });
}

const saveTrigger = (page: Page) => page.getByRole("button", { name: "Save to GitHub", exact: true });
const saveSubmit = (page: Page) => page.getByRole("button", { name: "Save selected files", exact: true });

async function openSaveMenu(page: Page) {
  await saveTrigger(page).click();
  await expect(page.locator("#publish-files")).toBeVisible();
}

test("edits patch the preview and the native Save UI commits to GitHub", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });

  await pasteSource(page, "A native browser preview", indexSource.replace("A native browser preview", "Saved to GitHub heading"));
  await expect(frame.getByRole("heading", { name: "Saved to GitHub heading" })).toBeVisible();

  // The native save menu commits to GitHub but does not track deployment status.
  await openSaveMenu(page);
  await expect(page.locator("#publish-files")).toContainText("A connected host may deploy this commit automatically");
  // The change the commit would make is listed before it is made.
  const changes = page.locator("#publish-files .publish-menu__changes");
  await expect(changes).toContainText("1 added, 1 removed");
  await expect(changes.locator(".publish-menu__diff-line.is-del")).toContainText("A native browser preview");
  await expect(changes.locator(".publish-menu__diff-line.is-add")).toContainText("Saved to GitHub heading");
  await saveSubmit(page).click();

  const message = page.locator(".publish-menu__message");
  await expect(message).toContainText("Saved to GitHub", { timeout: 30_000 });
  await expect(message.getByRole("link", { name: /View commit/ })).toHaveAttribute("href", /\/commit\//);
  await expect(message).toContainText("Deployment status is not tracked by this editor");
  await expect(message).not.toContainText(/build|live|publish/i);
});

test("multi-file save keeps every committed file's content (no revert to stale base)", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });

  // Draft one page and one stylesheet, then commit both together.
  await pasteSource(page, "A native browser preview", indexSource.replace("A native browser preview", "Multi save heading"));
  await openFile(page, cssPath, "--accent");
  await pasteSource(page, "--accent", cssSource.replace("--muted: #5c665a;", "--muted: rgb(190, 20, 40);"));

  await openSaveMenu(page);
  // Both drafts appear; select all and save.
  await expect(page.locator("#publish-files")).toContainText(indexPath);
  await expect(page.locator("#publish-files")).toContainText(cssPath);
  for (const box of await page.locator("#publish-files input[type=checkbox]").all())
    if (!(await box.isChecked())) await box.check();
  await saveSubmit(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });

  // The page (not the open file after the CSS switch) must not revert to the old
  // baseline; the committed content becomes the new base.
  await expect(frame.getByRole("heading", { name: "Multi save heading" })).toBeVisible();
  await expect
    .poll(() => frame.locator(".lead").evaluate((el) => getComputedStyle(el).color))
    .toBe("rgb(190, 20, 40)");
});

test("a post-save edit becomes a fresh draft and re-enables saving", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });

  await pasteSource(page, "A native browser preview", indexSource.replace("A native browser preview", "First save"));
  await openSaveMenu(page);
  await saveSubmit(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });

  // Edit again after the save: the preview follows and the file is re-saveable.
  await pasteSource(page, "", indexSource.replace("A native browser preview", "Second edit after save"));
  await expect(frame.getByRole("heading", { name: "Second edit after save" })).toBeVisible();
  await expect(saveTrigger(page)).toBeEnabled();

  await openSaveMenu(page);
  await saveSubmit(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.reload();
  await expect(page.frameLocator(".native-preview-frame").getByRole("heading", { name: "Second edit after save" })).toBeVisible({ timeout: 30_000 });
});

test("a conflicting save keeps the draft and the preview", async ({ page, baseURL }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });

  await pasteSource(page, "A native browser preview", indexSource.replace("A native browser preview", "My conflicting draft"));
  await expect(frame.getByRole("heading", { name: "My conflicting draft" })).toBeVisible();

  // An external commit advances index.html on the branch, so our baseSha is stale.
  await page.request.post(`${baseURL}/__demo/external-edit`, {
    data: { path: indexPath, content: indexSource.replace("A native browser preview", "Someone else edited") },
  });

  await openSaveMenu(page);
  await saveSubmit(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText(/GitHub changed these files|drafts are kept/i, { timeout: 30_000 });

  // The draft is retained: the preview still shows our unsaved text.
  await expect(frame.getByRole("heading", { name: "My conflicting draft" })).toBeVisible();
  await expect(saveTrigger(page)).toBeEnabled();
});

test("typing while a slow save is in flight keeps the newer draft", async ({ page, baseURL }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  await page.request.post(`${baseURL}/__demo/slow?ms=1500`);

  await pasteSource(page, "A native browser preview", indexSource.replace("A native browser preview", "In-flight base"));
  await openSaveMenu(page);
  await saveSubmit(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saving to GitHub", { timeout: 5_000 });

  // Type more while the request is still pending.
  await pasteSource(page, "", indexSource.replace("A native browser preview", "Typed during save"));
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });

  // The in-flight edit survives as a new draft on top of the committed content.
  await expect(frame.getByRole("heading", { name: "Typed during save" })).toBeVisible();
});

test("preview route, iframe and scroll persist through save completion", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });

  // Navigate the preview to About, scroll, then edit the still-open index page.
  await frame.getByRole("link", { name: "About", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame.getByRole("heading", { name: "About this project" })).toBeVisible();
  const handle = await page.locator(".native-preview-frame").elementHandle();
  const win = (await handle!.contentFrame())!;
  const before = await win.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.id = "test-scroll-spacer";
    spacer.style.height = "2000px";
    document.body.append(spacer);
    (window as unknown as { __id?: string }).__id = "id-" + Math.random();
    window.scrollTo(0, 120);
    return { id: (window as unknown as { __id: string }).__id, scroll: (document.scrollingElement as Element).scrollTop };
  });

  await pasteSource(page, "A native browser preview", indexSource.replace("A native browser preview", "Reload survivor"));
  // The preview stays on About (route preserved) and never reloaded (same window, scroll kept).
  await expect(frame.getByRole("heading", { name: "About this project" })).toBeVisible();
  const after = await win.evaluate(() => ({
    id: (window as unknown as { __id?: string }).__id,
    scroll: (document.scrollingElement as Element).scrollTop,
  }));
  expect(after.id).toBe(before.id);
  expect(before.scroll).toBe(120);
  expect(after.scroll).toBe(120);

  // Commit: snapshot refresh must not snap the preview route, replace the frame,
  // or lose scroll after the save response completes.
  await openSaveMenu(page);
  await saveSubmit(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await expect(frame.getByRole("heading", { name: "About this project" })).toBeVisible();
  const postSave = await win.evaluate(() => ({
    id: (window as unknown as { __id?: string }).__id,
    scroll: (document.scrollingElement as Element).scrollTop,
  }));
  expect(postSave.id).toBe(before.id);
  expect(postSave.scroll).toBe(120);

  // Reload the whole app: committed content is fetched fresh.
  await page.reload();
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").getByRole("heading", { name: "Reload survivor" })).toBeVisible({ timeout: 30_000 });
});

test("shared component edits update every instance and survive save", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByText("Shared across cards")).toHaveCount(3, { timeout: 30_000 });

  const componentPath = "src/components/card-note/card-note.html";
  await openFile(page, componentPath, "Shared note");
  await pasteSource(page, "Shared note", '<p class="card-note" data-key="card-note">Saved component note <slot>Shared note</slot></p>\n');
  await expect(frame.getByText("Saved component note")).toHaveCount(3);

  await openSaveMenu(page);
  await saveSubmit(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await expect(frame.getByText("Saved component note")).toHaveCount(3);
});

test("switching files during a slow save still adopts the saved native baseline", async ({ page, baseURL }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  await page.request.post(`${baseURL}/__demo/slow?ms=1000`);

  await pasteSource(page, "A native browser preview", indexSource.replace("A native browser preview", "Saved while switching"));
  await openSaveMenu(page);
  const publish = page.waitForResponse((response) =>
    response.url().includes("/api/publish") && response.request().method() === "POST",
  );
  await saveSubmit(page).click();
  await openFile(page, "src/pages/about.html", "About this project");
  const response = await publish;
  expect(response.ok()).toBeTruthy();

  await openFile(page, indexPath, "");
  await expect(frame.getByRole("heading", { name: "Saved while switching" })).toBeVisible();
  await expect(saveTrigger(page)).toBeDisabled();
});

test("unsaved local drafts recover after reload", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await pasteSource(page, "A native browser preview", indexSource.replace("A native browser preview", "Recovered local draft"));
  await expect(frame.getByRole("heading", { name: "Recovered local draft" })).toBeVisible();

  await page.reload();
  await expect(page.locator("#current-page")).toHaveText(indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").getByRole("heading", { name: "Recovered local draft" })).toBeVisible({ timeout: 30_000 });
  await expect(saveTrigger(page)).toBeEnabled();
});

test("Undo and Redo keep native preview and save state in sync", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await pasteSource(page, "A native browser preview", indexSource.replace("A native browser preview", "Undo Redo heading"));
  await expect(frame.getByRole("heading", { name: "Undo Redo heading" })).toBeVisible();

  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible();
  await expect(saveTrigger(page)).toBeDisabled();

  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await expect(frame.getByRole("heading", { name: "Undo Redo heading" })).toBeVisible();
  await expect(saveTrigger(page)).toBeEnabled();
});
