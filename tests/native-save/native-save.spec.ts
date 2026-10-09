import { publishButton, showPublish } from "./publish";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// End-to-end tests for native Explicit Save to GitHub. The save request goes
// through the REAL worker `handle` and its optimistic commit path; only the
// GitHub network and the session are faked (see server.ts). No real token.

const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const cssPath = "styles/site.css";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const cssSource = readFileSync(resolve(fixture, cssPath), "utf8");

const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
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
  // The file tree is the explorer's Files tab; a native site opens on Pages.
  const files = page.getByRole("tab", { name: "Files" });
  if (await files.isVisible()) await files.click();
}

async function openFile(page: Page, path: string, contains: string) {
  await openExplorer(page);
  const parts = path.split("/");
  for (let index = 1; index <= parts.length; index++) {
    const item = page.locator(`#explorer .file-row[data-path='${parts.slice(0, index).join("/")}']`);
    await expect(item).toBeVisible({ timeout: 20_000 });
    const expanded = await item.getAttribute("aria-expanded");
    if (index === parts.length || expanded === "false") await item.click();
  }
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  await expect(page.locator("#content [role=\"textbox\"]").first()).toBeAttached({ timeout: 20_000 });
  if (contains)
    await expect(page.locator("#content .view-lines")).toContainText(contains, { timeout: 20_000 });
}

const saveTrigger = publishButton;
const saveSubmit = publishButton;

async function openSaveMenu(page: Page) {
  await showPublish(page);
  await expect(page.locator("#publish-files")).toBeVisible();
}

const showChangesButton = (page: Page, path: string) =>
  page.locator("#publish-files").getByRole("button", { name: `Show changes in ${path}` });

async function showChanges(page: Page, path: string) {
  await showChangesButton(page, path).click();
  const dialog = page.getByRole("dialog", { name: path });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("the Save panel lists counts only; the button opens a side-by-side comparison dialog that closes back to the panel", { tag: "@smoke" }, async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  // Two separate edits, far apart, so the unchanged run between them collapses.
  const edited = indexSource.replace("A native browser preview", "Compared heading").replace("</main>", "  <p>Added at the end</p>\n</main>");
  expect(edited).not.toBe(indexSource);
  await pasteSource(page, "<site-header", edited);
  await expect(frame.getByRole("heading", { name: "Compared heading" })).toBeVisible();

  await openSaveMenu(page);
  const panel = page.locator("#publish-files");
  // Only the counts show under the file, with Discard; no inline lines.
  await expect(panel.locator(".publish-menu__changes > *")).toHaveText(["2 added, 1 removed", "Discard"]);
  await expect(panel.locator(".publish-menu__changes")).not.toContainText("Compared heading");
  await expect(panel.locator(".publish-menu__diff-line:visible")).toHaveCount(0);
  const opener = showChangesButton(page, indexPath);
  await expect(opener).toHaveAccessibleName(`2 added, 1 removed. Show changes in ${indexPath}`);

  const dialog = await showChanges(page, indexPath);
  await expect(dialog.locator("h2")).toHaveText(indexPath);
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  // Both columns: GitHub on the left, the draft on the right, numbered on both sides.
  await expect(dialog.getByRole("columnheader")).toHaveText(["GitHub", "Draft"]);
  const changed = dialog.locator(".publish-diff__row.is-change").first();
  await expect(changed.locator("td").nth(1)).toHaveClass(/is-del/);
  await expect(changed.locator("td").nth(1)).toContainText("A native browser preview");
  await expect(changed.locator("td").nth(3)).toHaveClass(/is-add/);
  await expect(changed.locator("td").nth(3)).toContainText("Compared heading");
  const leftNumber = Number(await changed.locator("td").nth(0).textContent());
  const rightNumber = Number(await changed.locator("td").nth(2).textContent());
  expect(leftNumber).toBeGreaterThan(0);
  expect(rightNumber).toBe(leftNumber);
  await expect(dialog.locator(".publish-diff__code.is-add").last()).toContainText("Added at the end");
  await expect(dialog.locator(".publish-diff__gap").first()).toHaveText(/^\d+ unchanged lines?$/);
  // The panel stays open behind the modal.
  await expect(panel).toBeVisible();

  // Escape closes the dialog only; focus goes back to the button, the panel stays.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(panel).toBeVisible();

  // A click on the backdrop closes it too.
  await showChanges(page, indexPath);
  await page.mouse.click(4, 4);
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(panel).toBeVisible();

  // Narrow viewports get the one-column view inside the same dialog.
  await page.setViewportSize({ width: 600, height: 800 });
  await showChanges(page, indexPath);
  await expect(dialog.locator(".publish-diff__split")).toBeHidden();
  await expect(dialog.locator(".publish-menu__diff-line.is-add").first()).toContainText("Compared heading");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(panel).toBeVisible();
});

test("edits patch the preview and the native Save UI commits to GitHub", { tag: "@smoke" }, async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });

  await pasteSource(page, "<site-header", indexSource.replace("A native browser preview", "Saved to GitHub heading"));
  await expect(frame.getByRole("heading", { name: "Saved to GitHub heading" })).toBeVisible();

  // The native save menu commits to GitHub; the Change status shows on the button (native-change-status.spec.ts).
  await openSaveMenu(page);
  // Hovering shows no heading, idle text or second button: Publish itself commits.
  await expect(page.locator("#publish-files strong, #publish-files button.primary")).toHaveCount(0);
  await expect(page.locator("#publish-files .publish-menu__message")).toBeHidden();
  // The change the commit would make is listed before it is made.
  const changes = page.locator("#publish-files .publish-menu__changes > :first-child");
  await expect(changes).toHaveText("1 added, 1 removed");
  const dialog = await showChanges(page, indexPath);
  await expect(dialog.locator(".publish-diff__code.is-del")).toContainText("A native browser preview");
  await expect(dialog.locator(".publish-diff__code.is-add")).toContainText("Saved to GitHub heading");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await saveSubmit(page).click();

  const message = page.locator(".publish-menu__message");
  await expect(message).toContainText("Saved to GitHub", { timeout: 30_000 });
  await expect(message.getByRole("link", { name: /commit/ })).toHaveAttribute("href", /\/commit\//);
  await expect(message).not.toContainText(/build|live|publish/i);
});

test("multi-file save keeps every committed file's content (no revert to stale base)", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });

  // Draft one page and one stylesheet, then commit both together.
  await pasteSource(page, "<site-header", indexSource.replace("A native browser preview", "Multi save heading"));
  await openFile(page, cssPath, "--accent");
  await pasteSource(page, "--accent", cssSource.replace("--muted: #5c665a;", "--muted: rgb(190, 20, 40);"));

  await openSaveMenu(page);
  // Both drafts appear, already selected, under their grand total; Publish counts them.
  const panel = page.locator("#publish-files");
  await expect(panel).toContainText(indexPath);
  await expect(panel).toContainText(cssPath);
  await expect(saveTrigger(page).locator(".publish-menu__count")).toHaveText("2");
  await expect(saveTrigger(page)).toHaveAttribute("title", "Publish 2 changes to main");
  for (const box of await panel.locator("input[type=checkbox]").all()) await expect(box).toBeChecked();
  const summary = panel.locator(".publish-menu__total-summary");
  await expect(summary).toHaveText("All 2 changes · 2 added, 2 removed");
  await expect(panel.locator(".publish-menu__changes > :first-child")).toHaveText(["1 added, 1 removed", "1 added, 1 removed"]);
  // Folded, the total hides the list.
  await summary.click();
  await expect(panel.locator(".publish-menu__file")).toHaveCount(2);
  await expect(panel.locator(".publish-menu__file").first()).toBeHidden();
  await summary.click();
  // Unticking one updates the total and what Publish commits.
  await panel.locator(".publish-menu__file", { hasText: cssPath }).getByRole("checkbox").uncheck();
  await expect(summary).toHaveText("1 change of 2 · 1 added, 1 removed");
  await expect(saveTrigger(page)).toHaveAttribute("title", "Publish 1 change to main");
  await panel.locator(".publish-menu__file", { hasText: cssPath }).getByRole("checkbox").check();
  await expect(summary).toHaveText("All 2 changes · 2 added, 2 removed");
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

  await pasteSource(page, "<site-header", indexSource.replace("A native browser preview", "First save"));
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

  await pasteSource(page, "<site-header", indexSource.replace("A native browser preview", "My conflicting draft"));
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

  await pasteSource(page, "<site-header", indexSource.replace("A native browser preview", "In-flight base"));
  await openSaveMenu(page);
  await saveSubmit(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saving to GitHub", { timeout: 5_000 });
  // The disabled button names the progress, then that it saved.
  await expect(page.locator(".publish-menu__trigger")).toContainText("Saving…");
  await expect(page.locator(".publish-menu__trigger")).toBeDisabled();
  await expect(page.locator("#publish-files").getByRole("button", { name: "Discard changes", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "More publish actions", exact: true })).toBeEnabled();

  // Type more while the request is still pending.
  await pasteSource(page, "", indexSource.replace("A native browser preview", "Typed during save"));
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  // The edit typed meanwhile waits: the button offers to publish it.
  await expect(page.locator(".publish-menu__trigger")).toContainText("Publish1");

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

  await pasteSource(page, "<site-header", indexSource.replace("A native browser preview", "Reload survivor"));
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

  const componentPath = "components/card-note/card-note.html";
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

  await pasteSource(page, "<site-header", indexSource.replace("A native browser preview", "Saved while switching"));
  await openSaveMenu(page);
  const publish = page.waitForResponse((response) =>
    response.url().includes("/api/publish") && response.request().method() === "POST",
  );
  await saveSubmit(page).click();
  await openFile(page, "about/index.html", "<site-header");
  const response = await publish;
  expect(response.ok()).toBeTruthy();

  await openFile(page, indexPath, "");
  await expect(frame.getByRole("heading", { name: "Saved while switching" })).toBeVisible();
  await expect(saveTrigger(page)).toBeDisabled();
});

test("unsaved local drafts recover after reload", { tag: "@smoke" }, async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await pasteSource(page, "<site-header", indexSource.replace("A native browser preview", "Recovered local draft"));
  await expect(frame.getByRole("heading", { name: "Recovered local draft" })).toBeVisible();

  await page.reload();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").getByRole("heading", { name: "Recovered local draft" })).toBeVisible({ timeout: 30_000 });
  await expect(saveTrigger(page)).toBeEnabled();
});

test("Undo and Redo keep native preview and save state in sync", { tag: "@smoke" }, async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await pasteSource(page, "<site-header", indexSource.replace("A native browser preview", "Undo Redo heading"));
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
