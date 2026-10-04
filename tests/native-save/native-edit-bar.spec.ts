import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { storedDrafts } from "./drafts";

// The edit bar over the native preview: anchored to the selection, with
// heading level, text size, Bold, Italic and the link Address editing the source.
const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
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

const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });

test("the bar anchors to the selected heading and changes its level in source and preview", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const heading = frame.locator(".hero h1");
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await heading.click();

  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
  const headingBox = (await heading.boundingBox())!;
  const barBox = (await bar(page).boundingBox())!;
  expect(barBox.x).toBeGreaterThanOrEqual(frameBox.x + 8 - 1);
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(frameBox.x + frameBox.width - 8 + 1);
  const side = await bar(page).getAttribute("data-side");
  if (side === "above") expect(Math.abs(headingBox.y - (barBox.y + barBox.height) - 8)).toBeLessThanOrEqual(1.5);
  else if (side === "below") expect(Math.abs(barBox.y - (headingBox.y + headingBox.height) - 8)).toBeLessThanOrEqual(1.5);
  else expect(side).toBe("pinned");

  const level = bar(page).getByRole("combobox", { name: "Heading level" });
  await expect(level).toHaveValue("h1");
  await level.selectOption("h3");
  await expect(frame.locator(".hero h3")).toHaveText("A native browser preview");
  await expect(frame.locator(".hero h1")).toHaveCount(0);
  await expect.poll(() => editorText(page, "#content")).toContain('<h3 data-key="hero-title">A native browser preview</h3>');
  // The renamed element is selected again, so the bar keeps its controls.
  await expect(bar(page).getByRole("combobox", { name: "Heading level" })).toHaveValue("h3");
  await expect(page.locator("#status")).toHaveText("Heading level H3");

  // Ctrl+Z with focus in the bar runs the shared history.
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame.locator(".hero h1")).toHaveText("A native browser preview");
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
  await expect(bar(page).getByRole("combobox", { name: "Heading level" })).toHaveValue("h1");
});

test("text size, Bold and Italic edit the element's source and reflect its state", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const lead = frame.locator(".hero p.lead");
  await expect(lead).toBeVisible({ timeout: 30_000 });
  await lead.click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect(bar(page).getByRole("combobox", { name: "Heading level" })).toHaveCount(0);

  const size = bar(page).getByRole("combobox", { name: "Text size" });
  await expect(size).toHaveValue("default");
  await size.selectOption("l");
  await expect(lead).toHaveCSS("font-size", "20px");
  await expect.poll(() => editorText(page, "#content")).toContain('<p class="lead" data-key="hero-lead" style="font-size: 1.25rem">');
  await expect(bar(page).getByRole("combobox", { name: "Text size" })).toHaveValue("l");
  await expect(page.locator("#status")).toHaveText("Text size L");

  const bold = bar(page).getByRole("button", { name: "Bold" });
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await bold.click();
  await expect(lead.locator("strong")).toHaveCount(1);
  await expect.poll(() => editorText(page, "#content")).toContain('style="font-size: 1.25rem"><strong>Edit plain HTML');
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  const italic = bar(page).getByRole("button", { name: "Italic" });
  await italic.click();
  await expect(lead.locator("em > strong")).toHaveCount(1);
  await expect(bar(page).getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");
  // Bold stays reported while the whole content is wrapped, one level down.
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");
  await bar(page).getByRole("button", { name: "Italic" }).click();
  await expect(lead.locator("em")).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await bar(page).getByRole("button", { name: "Bold" }).click();
  await expect(lead.locator("strong")).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Bold off");

  // Back to the default size removes the whole style attribute.
  await bar(page).getByRole("combobox", { name: "Text size" }).selectOption("default");
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
  await expect(bar(page).getByRole("combobox", { name: "Text size" })).toHaveValue("default");
});

test("B and Ctrl+I wrap only the selected word in strong and em, and B unwraps it again", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const lead = frame.locator(".hero p.lead");
  await expect(lead).toBeVisible({ timeout: 30_000 });
  await lead.click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  const handle = await page.locator(".native-preview-frame").elementHandle();
  const child = await handle!.contentFrame();
  // Select the word "plain" (text offsets 5..10 of "Edit plain HTML…").
  const selectWord = () => child!.evaluate(() => {
    const p = document.querySelector(".hero p.lead")!;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let seen = 0;
    const range = document.createRange();
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const length = text.textContent!.length;
      if (seen <= 5 && 5 < seen + length) range.setStart(text, 5 - seen);
      if (seen < 10 && 10 <= seen + length) { range.setEnd(text, 10 - seen); break; }
      seen += length;
    }
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  expect(await selectWord()).toBe("plain");
  const bold = bar(page).getByRole("button", { name: "Bold" });
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await bold.click();
  await expect(lead.locator("strong")).toHaveText("plain");
  await expect.poll(() => editorText(page, "#content")).toContain("Edit <strong>plain</strong> HTML, CSS");
  // The word stays selected, now inside strong, so B reads as pressed.
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#status")).toHaveText("Bold on");

  // Ctrl+I inside the preview wraps the same word in em.
  await child!.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "i", ctrlKey: true, bubbles: true, cancelable: true })));
  await expect(lead.locator("strong > em")).toHaveText("plain");
  await expect.poll(() => editorText(page, "#content")).toContain("Edit <strong><em>plain</em></strong> HTML");
  await expect(bar(page).getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");

  // B on the wrapped word removes the strong around it and leaves the em.
  await bar(page).getByRole("button", { name: "Bold" }).click();
  await expect(lead.locator("strong")).toHaveCount(0);
  await expect(lead.locator("em")).toHaveText("plain");
  await expect.poll(() => editorText(page, "#content")).toContain("Edit <em>plain</em> HTML");
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");

  // Ctrl+B with focus in the bar toggles too; then the selection spanning a tag boundary is refused.
  await bar(page).getByRole("button", { name: "Italic" }).focus();
  await page.keyboard.press("Control+B");
  await expect.poll(() => editorText(page, "#content")).toContain("Edit <em><strong>plain</strong></em> HTML");
  await child!.evaluate(() => {
    const p = document.querySelector(".hero p.lead")!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 2);
    range.setEnd(p.querySelector("strong")!.firstChild!, 3);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await expect(bar(page).getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "false");
  await bar(page).getByRole("button", { name: "Italic" }).click();
  await expect(page.locator("#status")).toHaveText("Select text within one element to make it italic.");
  await expect.poll(() => editorText(page, "#content")).toContain("Edit <em><strong>plain</strong></em> HTML");
});

test("a selected link takes an address as typed with page suggestions, and the bar hides when scrolled away or another file opens", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  await frame.locator(".hero h1").click();
  await expect(bar(page)).toBeVisible();
  const handle = await page.locator(".native-preview-frame").elementHandle();
  const child = await handle!.contentFrame();
  await child!.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(bar(page)).toBeHidden();
  await child!.evaluate(() => window.scrollTo(0, 0));
  await expect(bar(page)).toBeVisible();

  // Heading controls include arrangement; roving focus skips the disabled first move.
  await expect(bar(page).getByRole("button", { name: "Remove" })).toHaveCount(0);
  expect(await bar(page).locator("button, select").evaluateAll(controls => controls.map(control => ({
    name: control.getAttribute("aria-label") ?? control.textContent?.trim(), disabled: (control as HTMLButtonElement | HTMLSelectElement).disabled,
  })))).toEqual([
    { name: "Heading level", disabled: false }, { name: "Text size", disabled: false },
    { name: "Bold", disabled: false }, { name: "Italic", disabled: false },
    { name: "Move up", disabled: true }, { name: "Move down", disabled: false }, { name: "Move to", disabled: false },
  ]);
  // Tab walks every enabled control; native selects retain their own arrow keys.
  await bar(page).getByRole("combobox", { name: "Heading level" }).focus();
  for (const control of [
    bar(page).getByRole("combobox", { name: "Text size", exact: true }),
    bar(page).getByRole("button", { name: "Bold", exact: true }),
    bar(page).getByRole("button", { name: "Italic", exact: true }),
    bar(page).getByRole("button", { name: "Move down", exact: true }),
    bar(page).getByRole("button", { name: "Move to", exact: true }),
  ]) {
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
  }
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  for (const name of ["Italic", "Move down", "Move to"]) {
    await page.keyboard.press("ArrowRight");
    await expect(bar(page).getByRole("button", { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press("ArrowRight");
  await expect(bar(page).getByRole("combobox", { name: "Heading level" })).toBeFocused();
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(bar(page).getByRole("combobox", { name: "Text size" })).toBeFocused();
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("Home");
  await expect(bar(page).getByRole("combobox", { name: "Heading level" })).toBeFocused();
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("End");
  await expect(bar(page).getByRole("button", { name: "Move to", exact: true })).toBeFocused();

  // A section gets a bar without text controls; the page's main container none at all.
  await child!.evaluate(() => (document.querySelector("section.hero") as HTMLElement).click());
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(bar(page).getByRole("combobox", { name: "Text size" })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveCount(0);
  // Selecting the page's main container shows no bar.
  await child!.evaluate(() => (document.querySelector("main") as HTMLElement).click());
  await expect(page.locator("#content .code-editor__element")).toHaveCount(1);
  await expect(bar(page)).toBeHidden();

  // A link's Address applies as typed: pages of the site are suggested, and
  // any other text is the address itself. No Page menu, no Follow link, no Apply.
  await frame.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Site header");
  await expect(page.getByRole("treeitem", { name: "Site header", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await editorText(page, "#content")).toBe(indexSource);
  expect(await storedDrafts(page)).toEqual([]);
  // Enter the shared template explicitly before editing its nav link.
  await bar(page).getByRole("button", { name: "Edit Site header component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/site-header/site-header.html");
  await frame.getByRole("link", { name: "About", exact: true }).click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Link");
  await expect(bar(page).getByRole("button", { name: "Follow link" })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Page" })).toHaveCount(0);
  await bar(page).getByRole("button", { name: "Address" }).click();
  const popover = page.locator(".edit-bar__popover");
  const address = popover.getByRole("combobox", { name: "Address" });
  await expect(address).toHaveValue("/about/");
  await expect(popover.getByRole("button", { name: "Apply" })).toHaveCount(0);
  const pages = popover.getByRole("listbox", { name: "Pages of this site" });
  await expect(pages.getByRole("option")).toHaveCount(2);
  await expect(pages.getByRole("option", { name: "/about/" })).toHaveAttribute("aria-selected", "true");
  await address.fill("https://example.test/");
  // No page matches a web address; the field stays open and focused while the
  // bar re-renders from the changed source (its button title shows the new href).
  await expect(pages).toBeHidden();
  await expect(bar(page).getByRole("button", { name: "Address" })).toHaveAttribute("title", "Address: https://example.test/");
  await expect(bar(page).getByRole("button", { name: "Address" })).toHaveAttribute("aria-expanded", "true");
  await expect(address).toBeFocused();
  await expect(frame.getByRole("link", { name: "About", exact: true })).toHaveAttribute("href", "https://example.test/");
  await address.fill("ab");
  await expect(pages.getByRole("option")).toHaveCount(1);
  await expect(pages.getByRole("option", { name: "/about/" })).toBeVisible();
  // Enter takes the one page left.
  await page.keyboard.press("Enter");
  await expect(popover).toBeHidden();
  await expect.poll(() => editorText(page, "#content")).toContain(`<a href="/about/" data-key="nav-about">About</a>`);
  expect(await editorText(page, "#content")).not.toContain("https://example.test/");
  // Or a page is picked from the list.
  await bar(page).getByRole("button", { name: "Address" }).click();
  await pages.getByRole("option", { name: "Native Studio (/)", exact: true }).click();
  await expect(popover).toBeHidden();
  await expect.poll(() => editorText(page, "#content")).toContain(`<a href="/" data-key="nav-about">About</a>`);
  await expect(page.locator("#status")).toHaveText("Link changed");
  // One undo step per opening of the field.
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => editorText(page, "#content")).toContain(`<a href="/about/" data-key="nav-about">About</a>`);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Link");
  // Ctrl/⌘+click still follows a page link.
  await frame.getByRole("link", { name: "About", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame.getByRole("heading", { name: "About this project" })).toBeVisible();
  await expect(bar(page)).toBeHidden();

  await frame.locator(".hero h1").click();
  await expect(bar(page)).toBeVisible();
  // Opening another file over the selected page hides the bar.
  await page.locator("#explorer-toggle").click();
  // The file tree is the explorer's Files tab; a native site opens on Pages.
  await page.getByRole("tab", { name: "Files" }).click();
  await page.locator("#files").getByRole("button", { name: "styles", exact: true }).click();
  await page.locator("#files").getByRole("button", { name: "site.css", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "styles/site.css");
  await expect(bar(page)).toBeHidden();
});
