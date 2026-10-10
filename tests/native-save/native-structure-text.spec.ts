import { expect, test, type Page } from "@playwright/test";
import { effectiveSource } from "./drafts";

// Slice 102: any text element's row in Page Structure edits its text in the
// panel, as a component's slot text row does. A double-click (or Enter on the
// focused row) turns the row's text into the field; typing follows on the
// page at once; Enter or leaving keeps it as one undo step, Escape takes it
// back. Formatting inside (a link) stays where the text around it changes.
// Edit component mode does the same for the template's own text parts.
const TEMPLATE = "components/section-promo/section-promo.html";
const template = `<section class="promo">
  <h2>Made by hand</h2>
  <slot name="body"><p>Say what it is.</p></slot>
</section>
`;
const intro = `<section class="intro" data-key="intro">
    <h2 data-key="intro-title">Plain words</h2>
    <p data-key="intro-text">Read <a href="/about/">about us</a> today.</p>
    <button type="button" data-key="intro-button">Sign up</button>
  </section>
  <section-promo>
    <p slot="body">Home's own words.</p>
  </section-promo>
  `;
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure", exact: true });
const mounted = (page: Page, path = "index.html") => page.evaluate(async (file) => (await import("/src/components/code-editor.ts")).getMountedSource(file), path);
const undo = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"));
// A row by its kind (the icon's title) and its text.
const row = (page: Page, kind: string, text: string) => tree(page).locator("[role=treeitem]")
  .filter({ has: page.locator(`:scope > .page-structure__label > .page-structure__kind[title='${kind}']`) }).filter({ hasText: text }).first();

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const source = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  const before = `<section class="cards" data-key="cards">`;
  expect(source).toContain(before);
  for (const [path, content] of [[TEMPLATE, template], ["index.html", source.replace(before, `${intro}${before}`)]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
  await expect(frame(page).locator(".intro h2")).toHaveText("Plain words", { timeout: 30_000 });
  const section = tree(page).getByRole("treeitem", { name: /^Section Plain words/ }).first();
  if (await section.getAttribute("aria-expanded") === "false") await section.locator(".page-structure__toggle").click();
  await expect(row(page, "Heading", "Plain words")).toBeVisible();
});

test("a heading's row edits its text in the panel: the page follows, Enter keeps one undo step, Escape takes it back", async ({ page }) => {
  const heading = frame(page).locator(".intro h2");
  // The row keeps its id while its text is a field.
  const headingRow = tree(page).locator(`[role=treeitem][data-node='${await row(page, "Heading", "Plain words").getAttribute("data-node")}']`);
  const original = await mounted(page);

  // A single click still only selects.
  await headingRow.locator(".page-structure__text").click();
  await expect(headingRow).toHaveAttribute("aria-selected", "true");
  await expect(headingRow).not.toHaveClass(/is-editing/);

  // A double-click: the row's text becomes its field, all of it selected; nothing types on the page.
  await headingRow.locator(".page-structure__text").dblclick();
  const field = tree(page).getByRole("textbox", { name: "Heading: Text", exact: true });
  await expect(field).toBeFocused();
  expect(await field.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd, el.value])).toEqual([0, 11, "Plain words"]);
  await expect(heading).not.toHaveAttribute("contenteditable", /.+/);
  await expect(headingRow).toHaveClass(/is-editing/);

  // Typing shows on the page at once; Enter keeps it, in the source and the code pane.
  await page.keyboard.type("Fresh words");
  await expect(heading).toHaveText("Fresh words");
  await field.press("Enter");
  await expect(headingRow).not.toHaveClass(/is-editing/);
  await expect(headingRow).toBeFocused();
  await expect.poll(() => mounted(page)).toBe(original!.replace(">Plain words</h2>", ">Fresh words</h2>"));
  await expect(page.locator("#content")).toContainText("Fresh words");
  await expect(heading).toHaveText("Fresh words");

  // The whole edit is one undo step.
  expect(await undo(page)).toBe(true);
  await expect.poll(() => mounted(page)).toBe(original);
  await expect(heading).toHaveText("Plain words");

  // Enter on the focused row opens it again; Escape takes the typing back, page and source.
  await headingRow.focus();
  await headingRow.press("Enter");
  await expect(field).toBeFocused();
  await page.keyboard.type("Gone");
  await expect(heading).toHaveText("Gone");
  await field.press("Escape");
  await expect(headingRow).toBeFocused();
  await expect(headingRow).not.toHaveClass(/is-editing/);
  await expect(heading).toHaveText("Plain words");
  await expect.poll(() => mounted(page)).toBe(original);
});

test("a paragraph with a link keeps its link; a button's label edits", async ({ page }) => {
  const paragraphRow = row(page, "Paragraph", "Read about us today.");
  await paragraphRow.locator(".page-structure__text").dblclick();
  const field = tree(page).getByRole("textbox", { name: "Paragraph: Text", exact: true });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Read about us today.");
  await field.press("End");
  for (let i = 0; i < "today.".length; i++) await field.press("Backspace");
  await page.keyboard.type("now.");
  await field.press("Enter");
  await expect.poll(() => mounted(page)).toContain(`<p data-key="intro-text">Read <a href="/about/">about us</a> now.</p>`);
  await expect(frame(page).locator(".intro p a")).toHaveText("about us");
  await expect(frame(page).locator(".intro p")).toHaveText("Read about us now.");

  const buttonRow = row(page, "Button", "Sign up");
  await buttonRow.locator(".page-structure__text").dblclick();
  const label = tree(page).getByRole("textbox", { name: "Button: Text", exact: true });
  await expect(label).toBeFocused();
  await page.keyboard.type("Join us");
  await expect(frame(page).locator(".intro button")).toHaveText("Join us");
  // Leaving the field (a click on another row) keeps it.
  await row(page, "Heading", "Plain words").locator(".page-structure__text").click();
  await expect(label).toHaveCount(0);
  await expect.poll(() => mounted(page)).toContain(`<button type="button" data-key="intro-button">Join us</button>`);
});

test("Edit component mode: the template's own heading edits from its row, in the template", async ({ page, baseURL }) => {
  const promo = frame(page).locator("section-promo");
  await tree(page).getByRole("treeitem", { name: /^Section promo/ }).first().locator(".page-structure__label").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Edit Section promo component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  const found = row(page, "Heading", "Made by hand");
  await expect(found).toHaveAttribute("data-template-path", TEMPLATE);
  // The row keeps its id while its text is a field.
  const headingRow = tree(page).locator(`[role=treeitem][data-node='${await found.getAttribute("data-node")}']`);
  await headingRow.locator(".page-structure__text").dblclick();
  const field = tree(page).getByRole("textbox", { name: "Heading: Text", exact: true });
  await expect(field).toBeFocused();
  await page.keyboard.type("Made with care");
  await expect(promo.locator("h2")).toHaveText("Made with care");
  await field.press("Enter");
  await expect.poll(() => mounted(page, TEMPLATE)).toBe(template.replace("Made by hand", "Made with care"));
  await expect.poll(() => effectiveSource(page, baseURL, TEMPLATE)).toBe(template.replace("Made by hand", "Made with care"));
  // The page's own source did not change.
  expect(await effectiveSource(page, baseURL, "index.html")).toContain(`<section-promo>\n    <p slot="body">Home's own words.</p>`);
});

