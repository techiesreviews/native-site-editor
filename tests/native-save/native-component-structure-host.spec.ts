import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const source = (page: Page, path = "index.html") => page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure", exact: true });
const firstCard = (page: Page) => tree(page).getByRole("treeitem", { name: /^Project card Reusable cards/ }).first();

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await tree(page).getByRole("treeitem", { name: "Section", exact: true }).locator(".page-structure__toggle").click();
  await firstCard(page).locator(".page-structure__toggle").click();
});

test("Structure edits the page's slotted text in one Undo and keeps shared templates untouched", async ({ page }) => {
  const before = await source(page);
  const templatePath = "components/project-card/project-card.html";
  const templateBefore = await (await page.request.get(`/__demo/file?${new URLSearchParams({ path: templatePath })}`)).text();
  const templateDraftBefore = await storedDraft(page, templatePath);
  await firstCard(page).click();
  await expect(page.getByRole("region", { name: "Component properties" })).toHaveCount(0);
  const title = tree(page).getByRole("textbox", { name: "Title: Text", exact: true }).first();
  await title.fill("A page-specific card title");
  await title.press("Enter");
  await expect(frame(page).locator("project-card").first().locator('[slot="title"]')).toHaveText("A page-specific card title");
  expect(await source(page)).toContain('<span slot="title">A page-specific card title</span>');
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
  await expect.poll(() => source(page)).toBe(before);
  await expect(frame(page).locator("project-card").first().locator('[slot="title"]')).toHaveText("Reusable cards");
  expect(await storedDraft(page, templatePath)).toEqual(templateDraftBefore);
  expect(await (await page.request.get(`/__demo/file?${new URLSearchParams({ path: templatePath })}`)).text()).toBe(templateBefore);
});

test("clicking a nested shared fallback selects the real page instance with its own styles", async ({ page }) => {
  const before = await source(page);
  const fallback = frame(page).locator("project-card").first().locator("card-note p");
  const sharedBefore = await storedDraft(page, "components/card-note/card-note.html");
  await fallback.dblclick({ position: { x: 5, y: 5 } });
  await fallback.press("x");
  await expect(fallback).not.toHaveAttribute("contenteditable", /.+/);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(firstCard(page)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText("Project card");
  const styleGrip = page.getByRole("separator", { name: "Resize Style panel", exact: true });
  if (await styleGrip.getAttribute("aria-valuenow") === "0") { await styleGrip.focus(); await styleGrip.press("Enter"); }
  await expect(page.locator(".style-panel__hint").filter({ hasText: "Add a class to style this element" })).toBeVisible();
  await expect(page.locator(".style-panel__target")).not.toContainText("card-note");
  expect(await source(page)).toBe(before);
  expect(await storedDraft(page, "components/card-note/card-note.html")).toEqual(sharedBefore);
});

test("explicit Edit permits the outer template while nested clicks stay in that scope", async ({ page }) => {
  await firstCard(page).getByRole("button", { name: "Edit component", exact: true }).click();
  const path = "components/project-card/project-card.html";
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  const before = await source(page, path);
  await frame(page).locator("project-card").first().locator("card-note p").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText("Card note");
  expect(await source(page, path)).toBe(before);
  const authored = 'class="project-card"';
  const replacement = 'class="project-card reviewed"';
  await page.evaluate(async ({ path, before, authored, replacement }) => {
    const editor = await import("/src/components/code-editor.ts");
    const at = before!.indexOf(authored);
    if (at < 0) throw new Error("The outer template class was not found");
    editor.replaceActiveRange({ path, start: at, end: at + authored.length, expected: authored, text: replacement });
  }, { path, before, authored, replacement });
  await expect.poll(() => source(page, path)).toBe(before!.replace(authored, replacement));
  await expect(frame(page).locator("project-card").first().locator("article")).toHaveClass(/reviewed/);
  expect(await page.evaluate(async path => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", path), path)).toBe(true);
  await expect.poll(() => source(page, path)).toBe(before);
  await expect(frame(page).locator("project-card").first().locator("article")).not.toHaveClass(/reviewed/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(frame(page).locator("project-card").first().locator("article")).not.toHaveClass(/reviewed/);
});


test("a component selected while CSS is primary routes to its real page before a field opens", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=styles/site.css`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "styles/site.css");
  await expect(frame(page).locator("project-card").first()).toBeVisible();
  await frame(page).locator("project-card").first().locator("card-note p").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  const card = firstCard(page);
  await expect(card).toHaveAttribute("aria-selected", "true");
  if (await card.getAttribute("aria-expanded") === "false") await card.locator(".page-structure__toggle").click();
  const title = tree(page).getByRole("textbox", { name: "Title: Text", exact: true }).first();
  await title.fill("CSS-to-page instance edit"); await title.press("Enter");
  await expect(frame(page).locator("project-card").first().locator('[slot="title"]')).toHaveText("CSS-to-page instance edit");
  expect(await source(page)).toContain("CSS-to-page instance edit");
});


test("explicit Edit permits native typing in an outer template fallback and Undo restores it", async ({ page }) => {
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const match = /<p slot="body">[\s\S]*?<\/p>/.exec(before);
    if (!match) throw new Error("The page body assignment was not found");
    editor.replaceActiveRange({ path: "index.html", start: match.index, end: match.index + match[0].length, expected: match[0], text: "" });
  });
  await firstCard(page).getByRole("button", { name: "Edit component", exact: true }).click();
  const path = "components/project-card/project-card.html";
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  const before = await source(page, path);
  const body = frame(page).locator("project-card").first().locator(".project-card__body");
  await expect(body).toHaveText("No description yet.");
  await body.click({ position: { x: 5, y: 5 } });
  await expect(body).toHaveAttribute("contenteditable", "plaintext-only");
  await body.fill("Explicit shared inline edit"); await body.press("Enter");
  await expect.poll(() => source(page, path)).toBe(before!.replace("No description yet.", "Explicit shared inline edit"));
  expect(await page.evaluate(async path => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", path), path)).toBe(true);
  await expect.poll(() => source(page, path)).toBe(before);
  await expect(body).toHaveText("No description yet.");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
});
