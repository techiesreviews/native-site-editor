import { expect, test, type Page } from "@playwright/test";

// Add offers whole sections only: the native page sections (Intro, Features,
// Split, Contact) and the section components. No single elements (Heading,
// Text, Image, Grid) and no "Plain HTML sections" heading. A chosen section is
// written into the page as ordinary HTML, as one undo step.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
const add = (page: Page) => page.getByRole("dialog", { name: "Add to the page" });
const sectionClasses = (page: Page) => frame(page).locator("main > *").evaluateAll((els) => els.map((el) => `${el.localName}.${el.className}`));

// The page after an insert is the page before with one ordinary <section> added
// and, at most, one stylesheet link for the section's layout CSS in <head>;
// nothing else changed, no editor tags.
function insertedSection(before: string, after: string) {
  const head = after.indexOf("</head>");
  const links = [...after.slice(0, head).matchAll(/\n?[ \t]*<link rel="stylesheet" href="[^"]+">\n?/g)].filter((match) => !before.includes(match[0].trim()));
  expect(links.length).toBeLessThanOrEqual(1);
  for (const link of links) after = after.slice(0, link.index) + after.slice(link.index! + link[0].length);
  let start = 0;
  while (start < before.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  expect(before.slice(start, before.length - end)).toBe("");
  // A pure insertion can slide left over repeated text: line it up with its "<section".
  const length = after.length - end - start;
  while (start > 0 && after[start - 1] === after[start - 1 + length] && !after.slice(start, start + length).trimStart().startsWith("<section")) start--;
  const added = after.slice(start, start + length);
  expect(before).toBe(after.slice(0, start) + after.slice(start + length));
  const trimmed = added.trim();
  expect(trimmed.startsWith("<section")).toBe(true);
  expect(trimmed.endsWith("</section>")).toBe(true);
  expect(added).not.toContain("native:");
  expect(added).not.toMatch(/data-native-|data-editor/);
  return trimmed;
}

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
});

test("Add offers only sections, writes ordinary HTML after the selection's section, and Undo restores the page", async ({ page }) => {
  await frame(page).locator(".hero h1").click();
  const before = await source(page);
  const order = await sectionClasses(page);
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  // Native page sections and the section components, in their groups.
  await expect(add(page).getByRole("group", { name: "Page sections" }).getByRole("option")).toHaveText([/^Intro/, /^Features/, /^Split/, /^Contact/]);
  await expect(add(page).getByRole("group", { name: "More sections" }).getByRole("option")).toHaveText([/^Feature block/]);
  // No single elements, no plain-HTML heading.
  for (const name of [/^Heading/, /^Text/, /^Image/, /^Grid/, /^Link/, /^Button/]) await expect(add(page).getByRole("option", { name })).toHaveCount(0);
  await expect(add(page)).not.toContainText("Plain HTML sections");
  // Searching for an element finds nothing to add.
  await add(page).getByRole("searchbox").fill("Heading");
  await expect(add(page).getByRole("option")).toHaveCount(0);
  await add(page).getByRole("searchbox").fill("Intro");
  const intro = add(page).getByRole("option", { name: /^Intro/ });
  await intro.focus();
  await intro.press("Enter");
  // A new section right after the selection's section, at the page's top level.
  await expect.poll(async () => (await sectionClasses(page)).length).toBe(order.length + 1);
  const after = await sectionClasses(page);
  expect(after[0]).toBe(order[0]);
  expect(after.slice(2)).toEqual(order.slice(1));
  insertedSection(before!, (await source(page))!);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
});

test("with a section selected, Add inserts a sibling section, never inside it", async ({ page }) => {
  await frame(page).locator(".hero").evaluate((element) => (element as HTMLElement).click());
  const before = await source(page);
  const heroChildren = await frame(page).locator(".hero > *").count();
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  await add(page).getByRole("searchbox").fill("Contact");
  const contact = add(page).getByRole("option", { name: /^Contact/ });
  await contact.focus();
  await contact.press("Enter");
  await expect(frame(page).locator("main > section.hero + section")).toHaveCount(1);
  await expect(frame(page).locator(".hero > *")).toHaveCount(heroChildren);
  insertedSection(before!, (await source(page))!);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
});

test("dragging a section uses the actual canvas gap instead of the selection", async ({ page }) => {
  await frame(page).locator(".hero h1").click();
  const before = await source(page);
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  const option = add(page).getByRole("option", { name: /^Split/ });
  await option.scrollIntoViewIfNeeded();
  await frame(page).locator("section.filler h2").scrollIntoViewIfNeeded();
  const from = (await option.boundingBox())!, gap = (await frame(page).locator("section.filler").boundingBox())!;
  await page.mouse.move(from.x + 30, from.y + 15); await page.mouse.down();
  await page.mouse.move(from.x + 80, from.y + 45, { steps: 4 });
  await page.mouse.move(gap.x + gap.width / 2, gap.y + 4, { steps: 6 });
  await expect(page.locator(".insert-point.is-target")).toHaveCount(1);
  await page.mouse.up();
  // Between the cards and the filler, not next to the selected heading's section.
  await expect(frame(page).locator("section.cards + section + section.filler")).toHaveCount(1);
  await expect(frame(page).locator("section.hero + section.cards")).toHaveCount(1);
  insertedSection(before!, (await source(page))!);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
});

test("a section plus inserts at that explicit gap", async ({ page }) => {
  await frame(page).locator(".hero h1").click();
  const before = await source(page);
  await frame(page).locator("section.hero").hover();
  await page.getByRole("button", { name: "Add a section before “A native browser preview”", exact: true }).click();
  await add(page).getByRole("option", { name: /^Features/ }).click();
  await expect(add(page)).toBeHidden();
  await expect(frame(page).locator("main > section:first-child + section.hero")).toHaveCount(1);
  insertedSection(before!, (await source(page))!);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => source(page)).toBe(before);
});
