import { expect, test, type Page } from "@playwright/test";
import { blankComponentFiles } from "../../src/page-builder/blank-component";
import { effectiveSource, storedDraft } from "./drafts";

// Default native-starter fixture group.
const templatePath = "components/section-services/section-services.html";
const cssPath = "components/section-services/section-services.css";
const panel = (page: Page) => page.getByRole("dialog", { name: "Add to the page" });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  await panel(page).getByRole("button", { name: "+ New component", exact: true }).click();
}

test("New component drafts files, places a section, opens its template and undoes as one step", { tag: "@smoke" }, async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page, baseURL);
  const before = await effectiveSource(page, baseURL, "index.html");
  const name = panel(page).getByRole("textbox", { name: "Component name" });
  await expect(name).toBeFocused();
  // Typing replaces the selected default rather than appending to it.
  await name.pressSequentially("services");
  await expect(name).toHaveValue("services");
  await expect(panel(page).locator(".pb-add-new__tag")).toHaveText("<section-services>");
  await panel(page).getByRole("button", { name: "Create", exact: true }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", templatePath);
  await expect(page.locator(".code-pane__title--component")).toBeVisible();
  await expect(page.locator(".code-pane__title--component")).toContainText(templatePath);
  for (const file of blankComponentFiles("section-services")) {
    await expect.poll(async () => (await storedDraft(page, file.path))?.content).toBe(file.content);
    await expect.poll(async () => (await storedDraft(page, file.path))?.baseSha).toBe(null);
  }
  await expect(frame(page).locator("main > section.filler + section-services")).toHaveCount(1);
  await expect(frame(page).locator('section-services h2[slot="title"]')).toHaveText("New section");
  await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toContain('<section-services>\n    <h2 slot="title">New section</h2>\n  </section-services>');
  await expect(page.locator("#status")).toContainText("Made the component <section-services>");

  await page.getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(frame(page).locator("section-services")).toHaveCount(0);
  await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(before);
  for (const path of [templatePath, cssPath]) await expect.poll(() => storedDraft(page, path)).toBeUndefined();

  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(frame(page).locator("section-services")).toHaveCount(1);
  for (const file of blankComponentFiles("section-services")) await expect.poll(async () => (await storedDraft(page, file.path))?.content).toBe(file.content);
  expect(errors).toEqual([]);
});

test("New component normalises typing, validates names and cancels without closing Add", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const name = panel(page).getByRole("textbox", { name: "Component name" });
  await name.fill("My_Thing!");
  await expect(name).toHaveValue("my-thing");
  await expect(panel(page).locator(".pb-add-new__tag")).toHaveText("<my-thing>");
  for (const [value, error] of [["", "Type a name"], ["feature-block", "already"], ["font-face", "reserved"]]) {
    await name.fill(value);
    await panel(page).getByRole("button", { name: "Create", exact: true }).click();
    await expect(panel(page).getByRole("alert")).toContainText(error);
    await expect(name).toHaveAttribute("aria-invalid", "true");
  }
  await name.press("Escape");
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "+ New component", exact: true })).toBeFocused();
  await panel(page).getByRole("button", { name: "+ New component", exact: true }).click();
  await panel(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("textbox", { name: "Component name" })).toHaveCount(0);
  await expect.poll(() => storedDraft(page, templatePath)).toBeUndefined();
});

test("New component uses the gap when Add opens between sections", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await panel(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await panel(page).getByRole("button", { name: "Close", exact: true }).click();
  await frame(page).locator("section.hero").hover();
  await page.getByRole("button", { name: "Add a section before “A native browser preview”", exact: true }).click();
  await panel(page).getByRole("button", { name: "+ New component", exact: true }).click();
  await panel(page).getByRole("textbox", { name: "Component name" }).fill("services");
  await panel(page).getByRole("button", { name: "Create", exact: true }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", templatePath);
  await expect(frame(page).locator("main > section-services:first-child + section.hero")).toHaveCount(1);
});

test("Redo of New component refuses whole when a file is at its path again; plain Redo still works", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await effectiveSource(page, baseURL, "index.html");
  await panel(page).getByRole("textbox", { name: "Component name" }).fill("services");
  await panel(page).getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", templatePath);
  await page.getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(frame(page).locator("section-services")).toHaveCount(0);
  for (const path of [templatePath, cssPath]) await expect.poll(() => storedDraft(page, path)).toBeUndefined();

  // Another writer (a second tab, an agent) puts a file where the template went.
  const store = (action: "save" | "remove") => page.evaluate(async ({ action, path }) => {
    const drafts = (await import("/src/drafts.ts")).draftStore();
    const scope = { account: "native-demo-user", repoId: 501, repo: "native-demo-user/native-demo", branch: "main" };
    if (action === "save") drafts.save({ ...scope, version: 1, path, baseSha: null, original: "", content: "<p>Theirs</p>", updatedAt: Date.now() });
    else drafts.remove(scope, path);
  }, { action, path: templatePath });
  await store("save");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator("#status")).toContainText(`${templatePath} already exists.`);
  // Nothing half-applied: no instance, the page as it was, their file kept, no CSS drafted.
  await expect(frame(page).locator("section-services")).toHaveCount(0);
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(before);
  expect((await storedDraft(page, templatePath))?.content).toBe("<p>Theirs</p>");
  expect(await storedDraft(page, cssPath)).toBeUndefined();

  await store("remove");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(frame(page).locator("section-services")).toHaveCount(1);
  for (const file of blankComponentFiles("section-services")) await expect.poll(async () => (await storedDraft(page, file.path))?.content).toBe(file.content);
});
