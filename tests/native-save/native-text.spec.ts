import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Typing into a text element in the native preview: a click puts the caret
// in it, and Enter, blur or a click elsewhere writes only the changed text
// into the source as one undo step.
const fixture = "fixtures/native-starter";
const indexPath = "src/pages/index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveText(indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
});

async function editorText(page: Page, host: string) {
  const textbox = page.locator(`${host} [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return text;
}

test("clicking a heading puts the caret in it, and typed text lands in the source", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const heading = frame.locator(".hero h1");
  await heading.click();
  await expect(heading).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await expect(heading).toBeFocused();

  // Replace the whole text; Enter finishes.
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Hello <world> & more");
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText("Hello <world> & more");
  await expect.poll(() => editorText(page, "#content")).toContain(
    '<h1 data-key="hero-title">Hello &lt;world&gt; &amp; more</h1>',
  );
  await expect(page.locator("#status")).toHaveText("Text changed");

  // One undo step brings the original back.
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(heading).toHaveText("A native browser preview");
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("a small edit keeps the formatting around it, Escape drops typing, a click elsewhere commits", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const lead = frame.locator(".hero p.lead");
  await lead.click();
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind")).toHaveText("Paragraph");
  // Bold one word through the edit bar's shortcut.
  await lead.evaluate((el) => {
    const text = el.firstChild!;
    const at = text.textContent!.indexOf("plain");
    const range = document.createRange();
    range.setStart(text, at);
    range.setEnd(text, at + "plain".length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await page.keyboard.press("ControlOrMeta+B");
  await expect(lead.locator("strong")).toHaveText("plain");

  // Type at the end of the paragraph.
  await lead.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Try it.");
  // Escape drops what was typed since the last commit.
  await page.keyboard.press("Escape");
  await expect(lead).not.toContainText("Try it.");

  await lead.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Try it.");
  // Clicking another element commits the typing.
  await frame.locator(".hero h1").click();
  await expect.poll(() => editorText(page, "#content")).toContain(
    "Edit <strong>plain</strong> HTML, CSS, and shared component templates and watch the preview update in place — no build, no iframe reload. Try it.</p>",
  );
  await expect(lead.locator("strong")).toHaveText("plain");
});

test("text inside a component template is typed into that template", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const footer = frame.locator(".site-footer p");
  await footer.click();
  await expect(page.locator("#current-page")).toHaveText("src/components/site-footer/site-footer.html");
  await page.keyboard.press("Home");
  await page.keyboard.type("New: ");
  await page.keyboard.press("Enter");
  await expect(footer).toContainText("New: ");
  await expect.poll(() => editorText(page, "#content")).toMatch(/<p[^>]*>New: /);
});
