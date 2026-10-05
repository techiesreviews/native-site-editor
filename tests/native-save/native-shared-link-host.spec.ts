import { expect, test, type Page } from "@playwright/test";
import { fixtureKind } from "./fixture-contract";
import { storedDraft } from "./drafts";

// Linked page copies outside a master, and the restored field warnings, on the real host.
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

test.skip(process.env.STATIC_SECTIONS_FIXTURE !== "native", "Requires the native static starter.");
if (process.env.STATIC_SECTIONS_FIXTURE === "native") fixtureKind();
const PAGE = "about/index.html";
const MASTER = ".editor/sections/about-hero.html";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const structure = (page: Page) => page.getByRole("complementary", { name: "Page structure" });
const row = (page: Page, name: RegExp) => structure(page).getByRole("treeitem", { name }).first();
const effective = async (page: Page, baseURL: string | undefined, path: string) => {
  const draft = await storedDraft(page, path);
  if (draft) return draft.content;
  const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
  return response.ok() ? response.text() : undefined;
};
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(PAGE)}`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await expect(frame(page).locator("header.site-header")).toBeVisible();
}
async function replaceCode(page: Page, text: string) {
  await page.locator("#content [role='textbox']").first().focus();
  await page.evaluate(value => navigator.clipboard.writeText(value), text);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

test("a child of a linked page copy shows its shared item's context; the chip selects the copy, the child has no Edit, and its text edits stay on the page", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await row(page, /^Section About Larkspur/).hover();
  await row(page, /^Section About Larkspur/).getByRole("button", { name: "Save shared" }).click();
  const form = structure(page).getByRole("form", { name: "Share section" });
  await form.getByRole("textbox", { name: "Name" }).fill("Shared hero");
  await form.getByRole("textbox", { name: "ID" }).fill("about-hero");
  await form.getByRole("button", { name: "Save shared" }).click();
  await expect(row(page, /Shared hero/).getByRole("button", { name: "Edit component" })).toBeAttached();
  const master = await effective(page, baseURL, MASTER);
  // The heading inside the linked copy: "Shared hero › Heading", with no Edit of its own.
  await frame(page).locator("section.hero h1").click();
  const chip = bar(page).getByRole("button", { name: /Shared hero/ });
  await expect(chip).toBeVisible();
  await expect(bar(page).getByRole("button", { name: /^Edit .* component$/ })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("linked-child-context.png") });
  // A text edit of the page copy changes only the page.
  const source = (await effective(page, baseURL, PAGE))!;
  await replaceCode(page, source.replace("About Larkspur</h1>", "About us</h1>"));
  await expect.poll(() => effective(page, baseURL, PAGE)).toContain("About us</h1>");
  expect(await effective(page, baseURL, MASTER)).toBe(master);
  // The edited copy is customised now, so it no longer counts as a linked copy at its old bytes;
  // put the text back and select the heading again to use the chip.
  await replaceCode(page, source);
  await expect.poll(() => effective(page, baseURL, PAGE)).toBe(source);
  await frame(page).locator("section.hero h1").click();
  await bar(page).getByRole("button", { name: /Shared hero/ }).click();
  await expect(row(page, /Shared hero/)).toHaveAttribute("aria-selected", "true");
  await expect(bar(page).getByRole("button", { name: "Edit Shared hero component", exact: true })).toBeVisible();
  // A plain section's child has no shared context.
  await frame(page).locator("section.contact h2").click();
  await expect(bar(page).getByRole("button", { name: /Shared hero/ })).toHaveCount(0);
});

test("an unnamed button and an image with no file show their warnings; a named button does not", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const source = (await effective(page, baseURL, PAGE))!;
  await replaceCode(page, source.replace('<section class="contact flow" id="contact">', '<section class="contact flow" id="contact"><button class="unnamed" style="width:40px;height:24px"></button><button class="named" aria-label="Open menu" style="width:40px;height:24px"></button><img class="nofile" src="" alt="" width="40" height="40">'));
  await expect(frame(page).locator("button.unnamed")).toBeVisible();
  await frame(page).locator("button.unnamed").click();
  await expect(bar(page)).toContainText("Needs a name");
  await frame(page).locator("button.named").click();
  await expect(bar(page)).not.toContainText("Needs a name");
  await frame(page).locator("img.nofile").click({ force: true });
  await expect(bar(page)).toContainText("No image");
  await expect(bar(page)).not.toContainText("Alt text missing");
});
