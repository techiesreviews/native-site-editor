import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// Linking a word in a paragraph from the edit bar: Link wraps the selected
// text in `<a href="">` and opens its Address at once; Remove link unwraps.
const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
});

async function editorText(page: Page) {
  const textbox = page.locator(`#content [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return text;
}

const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const linked = (href: string) => indexSource.replace("Edit plain HTML", `Edit <a href="${href}">plain</a> HTML`);

// Selects the paragraph and types in it (a click, then Enter), then selects
// the text offsets `start`..`end` of its text content.
async function selectInLead(page: Page, start: number, end: number) {
  const lead = page.frameLocator(".native-preview-frame").locator(".hero p.lead");
  await expect(lead).toBeVisible({ timeout: 30_000 });
  if ((await bar(page).locator(".edit-bar__kind").allTextContents())[0] !== "Paragraph" || await lead.getAttribute("contenteditable") === null) {
    await lead.click();
    await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
    await page.keyboard.press("Enter");
    await expect(lead).toHaveAttribute("contenteditable", /plaintext-only|true/);
  }
  const child = await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame();
  return child!.evaluate(([from, to]) => {
    const p = document.querySelector(".hero p.lead")!;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let seen = 0;
    const range = document.createRange();
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const length = text.textContent!.length;
      if (seen <= from && from < seen + length) range.setStart(text, from - seen);
      if (seen < to && to <= seen + length) { range.setEnd(text, to - seen); break; }
      seen += length;
    }
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  }, [start, end]);
}

async function pressInPreview(page: Page, key: string) {
  const child = await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame();
  await child!.evaluate((name) => document.dispatchEvent(new KeyboardEvent("keydown", { key: name, ctrlKey: true, bubbles: true, cancelable: true })), key);
}

test("Link wraps the selected word, its Address opens at once and applies as typed, one undo step", async ({ page }) => {
  const lead = page.frameLocator(".native-preview-frame").locator(".hero p.lead");
  expect(await selectInLead(page, 5, 10)).toBe("plain");
  // After B and I, a Link button with the link icon.
  await expect(bar(page).getByRole("button", { name: "Link", exact: true })).toBeVisible();
  const names = await bar(page).locator(":scope > .edit-bar__label > button, :scope > .edit-bar__controls > .edit-bar__group > button").evaluateAll((items) => items.map((item) => item.getAttribute("aria-label") ?? item.textContent));
  expect(names.slice(names.indexOf("Bold"), names.indexOf("Bold") + 3)).toEqual(["Bold", "Italic", "Link"]);
  await expect(bar(page).getByRole("button", { name: "Link", exact: true }).locator("svg")).toHaveCount(1);
  await bar(page).getByRole("button", { name: "Link", exact: true }).click();

  const popover = page.locator(".edit-bar__popover");
  const address = popover.getByRole("combobox", { name: "Address" });
  await expect(address).toBeFocused();
  await expect(address).toHaveValue("");
  await expect(popover.getByRole("listbox", { name: "Pages of this site" }).getByRole("option")).toHaveCount(2);
  await expect(lead.locator("a")).toHaveText("plain");
  await expect(page.locator("#status")).toHaveText("Link added");
  // The new link's text stays selected, so the bar is the link's: Address and Remove link.
  await expect(bar(page).getByRole("button", { name: "Link", exact: true })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Remove link" })).toBeVisible();

  await address.pressSequentially("/about/");
  await expect(address).toBeFocused();
  await expect(lead.locator("a")).toHaveAttribute("href", "/about/");
  await page.keyboard.press("Enter");
  await expect(popover).toBeHidden();
  await expect.poll(() => editorText(page)).toBe(linked("/about/"));

  // The wrap and the typed address are one undo step.
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => editorText(page)).toBe(indexSource);
  await expect(lead.locator("a")).toHaveCount(0);
});

test("Ctrl+K in the preview links the selection, and a picked page is its address; Remove link unwraps", async ({ page }) => {
  const lead = page.frameLocator(".native-preview-frame").locator(".hero p.lead");
  expect(await selectInLead(page, 5, 10)).toBe("plain");
  await expect(bar(page).getByRole("button", { name: "Link", exact: true })).toBeVisible();
  await pressInPreview(page, "k");
  const popover = page.locator(".edit-bar__popover");
  const address = popover.getByRole("combobox", { name: "Address" });
  await expect(address).toBeFocused();
  await popover.getByRole("option", { name: "/about/" }).click();
  await expect(popover).toBeHidden();
  await expect.poll(() => editorText(page)).toBe(linked("/about/"));
  await expect(lead.locator("a")).toHaveAttribute("href", "/about/");

  // With the linked word selected again, Remove link keeps the text and drops the tags.
  expect(await selectInLead(page, 5, 10)).toBe("plain");
  await expect(bar(page).getByRole("button", { name: "Address" })).toHaveAttribute("title", "Address: /about/");
  await bar(page).getByRole("button", { name: "Remove link" }).click();
  await expect.poll(() => editorText(page)).toBe(indexSource);
  await expect(lead.locator("a")).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Link removed");
  // The word is still selected and can be linked again.
  await expect(bar(page).getByRole("button", { name: "Link", exact: true })).toBeVisible();
  // Undo brings the link back in one step.
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => editorText(page)).toBe(linked("/about/"));
});

test("Escape with the address empty removes the new link; Ctrl+K works from the bar", async ({ page }) => {
  const lead = page.frameLocator(".native-preview-frame").locator(".hero p.lead");
  expect(await selectInLead(page, 5, 10)).toBe("plain");
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("Control+K");
  const address = page.locator(".edit-bar__popover").getByRole("combobox", { name: "Address" });
  await expect(address).toBeFocused();
  // (The source is read only once the field has closed: reading it moves the focus.)
  await expect(lead.locator("a")).toHaveAttribute("href", "");
  await page.keyboard.press("Escape");
  await expect.poll(() => editorText(page)).toBe(indexSource);
  await expect(lead.locator("a")).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Empty link removed");
  // Typed and emptied again counts as empty too.
  expect(await selectInLead(page, 5, 10)).toBe("plain");
  await bar(page).getByRole("button", { name: "Link", exact: true }).click();
  await expect(address).toBeFocused();
  await address.pressSequentially("/");
  await expect(lead.locator("a")).toHaveAttribute("href", "/");
  await address.fill("");
  await expect(lead.locator("a")).toHaveAttribute("href", "");
  await page.keyboard.press("Escape");
  await expect.poll(() => editorText(page)).toBe(indexSource);
});

test("a selected link inside a paragraph gets Address and Remove link", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  expect(await selectInLead(page, 5, 10)).toBe("plain");
  await bar(page).getByRole("button", { name: "Link", exact: true }).click();
  await page.locator(".edit-bar__popover").getByRole("option", { name: "Native Studio (/)", exact: true }).click();
  await expect.poll(() => editorText(page)).toBe(linked("/"));
  // While typing in the paragraph, a click puts the caret in the link: the
  // paragraph stays selected and the bar offers the link's Address and Remove link.
  await frame.locator(".hero p.lead a").click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect(bar(page).getByRole("button", { name: "Address" })).toHaveAttribute("title", "Address: /");
  await expect(bar(page).getByRole("button", { name: "Link", exact: true })).toHaveCount(0);
  await bar(page).getByRole("button", { name: "Remove link" }).click();
  await expect.poll(() => editorText(page)).toBe(indexSource);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect(bar(page).getByRole("button", { name: "Remove link" })).toHaveCount(0);
  // Undo, then select the link itself (from outside the paragraph): Remove link unwraps it too.
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => editorText(page)).toBe(linked("/"));
  // (The image, whose bar leaves the paragraph's first line uncovered.)
  await frame.locator(".hero img").click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Image");
  await frame.locator(".hero p.lead a").click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Link");
  await expect(bar(page).getByRole("button", { name: "Address" })).toBeVisible();
  await bar(page).getByRole("button", { name: "Remove link" }).click();
  await expect.poll(() => editorText(page)).toBe(indexSource);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  // Ordinary shared-template clicks select its page instance without editing it.
  await frame.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Site header");
  await expect(page.getByRole("treeitem", { name: "Site header", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await editorText(page)).toBe(indexSource);
  expect(await storedDraft(page, "components/site-header/site-header.html")).toBeUndefined();
  await bar(page).getByRole("button", { name: "Edit Site header component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/site-header/site-header.html");
  // Within the explicitly opened template, a nav link offers Address, no Remove link.
  await frame.getByRole("link", { name: "About", exact: true }).click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Link");
  await expect(bar(page).getByRole("button", { name: "Address" })).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Remove link" })).toHaveCount(0);
});

test("no Link button without selected text, or for a selection that cuts through a tag", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await frame.locator(".hero h1").click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(bar(page).getByRole("button", { name: "Bold" })).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Link", exact: true })).toHaveCount(0);
  await frame.locator(".hero p.lead").click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect(bar(page).getByRole("button", { name: "Link", exact: true })).toHaveCount(0);

  // "plain" in strong, then a selection from "it" into the strong.
  expect(await selectInLead(page, 5, 10)).toBe("plain");
  await bar(page).getByRole("button", { name: "Bold" }).click();
  await expect.poll(() => editorText(page)).toContain("Edit <strong>plain</strong> HTML");
  expect(await selectInLead(page, 2, 8)).toBe("it pla");
  await expect(bar(page).getByRole("button", { name: "Italic" })).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Link", exact: true })).toHaveCount(0);
  await pressInPreview(page, "k");
  await expect(page.locator("#status")).toHaveText("Select text within one element to link it.");
  await expect(page.locator(".edit-bar__popover")).toBeHidden();
  expect(await editorText(page)).toContain("Edit <strong>plain</strong> HTML");
});

test("the Address offers Open in new tab and a title, applied as changed, one undo step per opening", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const popover = page.locator(".edit-bar__popover");
  const link = frame.locator(".hero p.lead a");
  expect(await selectInLead(page, 5, 10)).toBe("plain");
  await bar(page).getByRole("button", { name: "Link", exact: true }).click();
  await popover.getByRole("option", { name: "Native Studio (/)", exact: true }).click();
  await expect(link).toHaveAttribute("href", "/");

  await bar(page).getByRole("button", { name: "Address" }).click();
  const newTab = popover.getByRole("checkbox", { name: "Open in new tab" });
  const title = popover.getByRole("textbox", { name: "Title (optional)" });
  await expect(newTab).not.toBeChecked();
  await expect(title).toHaveValue("");
  await newTab.check();
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener");
  await expect(page.locator("#status")).toHaveText("Link opens in a new tab");
  // The field stays open across the re-render, the box still ticked.
  await expect(newTab).toBeChecked();
  await title.fill("The home page");
  await expect(link).toHaveAttribute("title", "The home page");
  await title.press("Enter");
  await expect(popover).toBeHidden();
  const withBoth = linked("/").replace(`<a href="/">`, `<a href="/" target="_blank" rel="noopener" title="The home page">`);
  await expect.poll(() => editorText(page)).toBe(withBoth);

  // Opened again: both show as written; unticking takes target and rel away, an emptied title goes.
  await link.click();
  await bar(page).getByRole("button", { name: "Address" }).click();
  await expect(newTab).toBeChecked();
  await expect(title).toHaveValue("The home page");
  await newTab.uncheck();
  await expect(link).not.toHaveAttribute("target", /.*/);
  await expect(link).not.toHaveAttribute("rel", /.*/);
  await title.fill("");
  await expect(link).not.toHaveAttribute("title", /.*/);
  await title.press("Escape");
  await expect.poll(() => editorText(page)).toBe(linked("/"));

  // Each opening was one undo step.
  await bar(page).getByRole("button", { name: "Address" }).focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => editorText(page)).toBe(withBoth);
  await bar(page).getByRole("button", { name: "Address" }).focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => editorText(page)).toBe(linked("/"));
});
