import { expect, test } from "@playwright/test";
import { editorMounted } from "./drafts";

// A page opens in the code editor with its <head>, sections and multi-line
// components collapsed; single-line elements have nothing to fold.

test("the head and every section open collapsed in the code editor", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  const lines = page.locator("#content .view-lines");
  await expect(lines).toContainText('<section class="hero"', { timeout: 30_000 });
  await expect(lines).toContainText("<head>");
  await expect(lines).toContainText("<site-header");
  await expect(lines).not.toContainText("<title>");
  await expect(lines).not.toContainText("A native browser preview");
  await expect(lines).not.toContainText("Reusable cards");

  // The gutter arrow opens a collapsed element.
  await page.locator("#content .codicon-folding-collapsed").first().click({ force: true });
  await expect(lines).toContainText("<title>");
});

// Folding ranges come from the HTML worker, which a slow machine may still be
// loading when a person picks an element. The default fold then must not
// hide the line the cursor is on: the selected element's section stays open
// and typing lands where the cursor was put.
test("a cursor placed before the folding ranges load stays put, and its section stays open", async ({ page, baseURL }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  // The worker's script and its language service, which it imports (the
  // worker may fetch its first script before the route reaches it).
  await page.route((url) => (/html\.worker/.test(url.pathname) && url.search !== "?worker") || url.pathname.includes("/vscode-html-languageservice/"), async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await editorMounted(page);
  const lines = page.locator("#content .view-lines");
  // Nothing is folded yet: the folding ranges wait on the held worker.
  await expect(lines).toContainText("<title>");
  await frame.locator(".hero h1").click();
  await expect(page.locator(".canvas-crumb[aria-current=true]")).toHaveText("h1");
  const position = () => page.evaluate(async () => {
    const { monaco } = await import("/src/components/monaco.ts");
    const editor = monaco.editor.getEditors().find((view) => view.getModel()?.uri.path.endsWith("/index.html"))!;
    const at = editor.getPosition()!;
    return { line: editor.getModel()!.getLineContent(at.lineNumber).trim(), column: at.column };
  });
  const placed = await position();
  expect(placed.line).toMatch(/^<h1 /);
  release();
  // The head folds once the ranges arrive; the hero, holding the cursor, does not.
  await expect(lines).not.toContainText("<title>");
  await expect(lines).not.toContainText("Reusable cards");
  await expect(lines).toContainText("A native browser preview");
  expect(await position()).toEqual(placed);
  await page.locator("#content [role=textbox]").first().focus();
  await page.keyboard.type("Updated ");
  await expect(frame.locator(".hero h1")).toHaveText("Updated A native browser preview");
});
