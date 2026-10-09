import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Typing into a text element in the native preview: a click selects it, a
// double-click (or Enter) puts the caret in it, and Enter, Escape, blur or a
// click elsewhere writes only the changed text into the source as one undo step.
const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
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

test("double-clicking a heading puts the caret in it, and typed text lands in the source", { tag: "@smoke" }, async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const heading = frame.locator(".hero h1");
  await heading.dblclick();
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

test("a small edit keeps the formatting around it; Escape and a click elsewhere commit", { tag: "@smoke" }, async ({ page }) => {
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
  await lead.dblclick();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Try it.");
  // Escape leaves typing with what was typed kept, the paragraph still selected.
  await page.keyboard.press("Escape");
  await expect(lead).not.toHaveAttribute("contenteditable", /.+/);
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect.poll(() => editorText(page, "#content")).toContain(
    "Edit <strong>plain</strong> HTML, CSS, and shared component templates and watch the preview update in place — no build, no iframe reload. Try it.</p>",
  );

  await lead.dblclick();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Again.");
  // Clicking another element commits the typing.
  await frame.locator(".hero h1").click();
  await expect.poll(() => editorText(page, "#content")).toContain(
    "Edit <strong>plain</strong> HTML, CSS, and shared component templates and watch the preview update in place — no build, no iframe reload. Try it. Again.</p>",
  );
  await expect(lead.locator("strong")).toHaveText("plain");
  await expect(frame.locator(".hero h1")).not.toHaveAttribute("contenteditable", /.+/);
});

test("text inside a component template is typed into that template", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const footerPath = "components/site-footer/site-footer.html";
  const footerSource = readFileSync(resolve(fixture, footerPath), "utf8");
  const mounted = (path: string) => page.evaluate(async (file) => (await import("/src/components/code-editor.ts")).getMountedSource(file), path);
  const footer = frame.locator(".site-footer p");
  // A click selects this page's footer instance; the page stays open.
  await footer.click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  // The instance's root in Structure, then Edit, opens the shared template.
  await page.getByRole("treeitem", { name: /^Site footer/ }).locator(".page-structure__label").first().click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Edit Site footer component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", footerPath);
  await expect.poll(async () => typeof (await mounted(footerPath))).toBe("string");
  expect(await mounted(footerPath)).toBe(footerSource);
  await footer.dblclick();
  await expect(footer).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.press("Home");
  await page.keyboard.type("New: ");
  await page.keyboard.press("Enter");
  await expect(footer).toContainText("New: ");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", footerPath);
  await expect.poll(() => mounted(footerPath)).toBe(footerSource.replace(`<p data-key="footer-note">`, `<p data-key="footer-note">New: `));
  await expect.poll(() => editorText(page, "#content")).toMatch(/<p[^>]*>New: /);
});

// A real click (or double-click) on the text an element shows, as a user
// makes it: text is no event target, so the press lands on whatever shows it
// (a slot, for text a page gives a component).
async function clickText(page: Page, selector: string, nth = 0, double = false) {
  const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
  const at = await page.frameLocator(".native-preview-frame").locator(selector).nth(nth).evaluate((el) => {
    el.scrollIntoView({ block: "center" });
    const range = document.createRange();
    range.selectNodeContents(el);
    const box = range.getBoundingClientRect();
    return { x: box.left + 12, y: box.top + box.height / 2 };
  });
  await (double ? page.mouse.dblclick(frameBox.x + at.x, frameBox.y + at.y) : page.mouse.click(frameBox.x + at.x, frameBox.y + at.y));
}

async function pasteInto(page: Page, host: string, source: string) {
  const textbox = page.locator(`${host} [role="textbox"]`).first();
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

test("text a page gives a component's default slot is the page's: a click selects the instance and a double-click types into the page", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const withNote = indexSource.replace(
    `<h2 data-key="filler-title">Scroll to verify</h2>`,
    `<h2 data-key="filler-title">Scroll to verify</h2>\n    <card-note data-key="page-note">Cafe · Identity and site · 2025</card-note>`,
  );
  await pasteInto(page, "#content", withNote);
  const note = frame.locator("card-note[data-key='page-note']");
  await expect.poll(() => note.evaluate((el) => el.textContent)).toBe("Cafe · Identity and site · 2025");

  await clickText(page, "card-note[data-key='page-note']");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind")).toHaveText("Card note");
  await expect(note).not.toHaveAttribute("contenteditable", /.+/);
  await clickText(page, "card-note[data-key='page-note']", 0, true);
  await expect(note).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.press("End");
  await page.keyboard.type(" · Visit");
  await page.keyboard.press("Enter");
  await expect.poll(() => editorText(page, "#content")).toContain(
    `<card-note data-key="page-note">Cafe · Identity and site · 2025 · Visit</card-note>`,
  );
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);

  const edited = withNote.replace(`Cafe · Identity and site · 2025</card-note>`, `Cafe · Identity and site · 2025 · Visit</card-note>`);
  await expect.poll(() => editorText(page, "#content")).toBe(edited);

  // A click on a card's own note selects that page instance; the page stays open, unchanged.
  await clickText(page, "project-card >> card-note", 1);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect.poll(() => editorText(page, "#content")).toBe(edited);
  // The card's root in Structure, then Edit, opens the shared template, where the note is typed.
  const cardPath = "components/project-card/project-card.html";
  await page.getByRole("treeitem", { name: /^Project card/ }).nth(1).locator(".page-structure__label").first().click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Edit Project card component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", cardPath);
  await clickText(page, "project-card >> card-note", 1, true);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", cardPath);
  await expect(frame.locator("project-card").nth(1).locator("card-note")).toHaveAttribute("contenteditable", /plaintext-only|true/);
});

test("a click on an image selects it; a double-click opens Choose image", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const chooser = page.getByRole("dialog", { name: "Choose image", exact: true });
  const image = frame.locator(".hero img");
  await image.click();
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind")).toHaveText("Image");
  await expect(chooser).toBeHidden();
  await image.dblclick();
  await expect(chooser).toBeVisible();
  await expect(chooser.getByRole("button", { name: "Details for images/placeholder.svg", exact: true })).toBeVisible();
});

test("a link is selected by a click and typed into on a double-click; Enter types into selected text", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await pasteInto(page, "#content", indexSource.replace(
    `<h2 data-key="filler-title">Scroll to verify</h2>`,
    `<h2 data-key="filler-title">Scroll to verify</h2>\n    <a href="/about.html" data-key="more">Read more</a>`,
  ));
  const link = frame.locator("a[data-key='more']");
  const label = "Read more";
  await expect(link).toHaveText(label);
  await link.click();
  const kind = page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind");
  await expect(kind).toHaveText("Link");
  await expect(link).not.toHaveAttribute("contenteditable", /.+/);
  // The click neither followed the link nor put a caret in it.
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await link.dblclick();
  await expect(link).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await expect(link).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(link).not.toHaveAttribute("contenteditable", /.+/);
  await expect(link).toHaveText(label);
  // Enter on the selected link types at its end; Enter again finishes, still selected.
  await page.keyboard.press("Enter");
  await expect(link).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.type("!");
  await page.keyboard.press("Enter");
  await expect(link).not.toHaveAttribute("contenteditable", /.+/);
  await expect(link).toHaveText(`${label}!`);
  await expect.poll(() => editorText(page, "#content")).toContain(`data-key="more">${label}!</a>`);
  // Escape, not typing, selects the parent.
  await page.keyboard.press("Escape");
  await expect(kind).toHaveText("Section");
});

test("a click on a Structure row selects; a double-click types into its text on the page", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const heading = frame.locator(".hero h1");
  const row = page.getByRole("treeitem", { name: /A native browser preview/ }).first();
  await row.locator(".page-structure__label").click();
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(heading).not.toHaveAttribute("contenteditable", /.+/);
  await row.locator(".page-structure__label").dblclick();
  await expect(heading).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await expect(heading).toBeFocused();
  // The caret is at the end.
  await page.keyboard.type(" today");
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText("A native browser preview today");
  await expect.poll(() => editorText(page, "#content")).toContain(">A native browser preview today</h1>");
});
