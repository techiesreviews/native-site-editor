import { expect, test, type Locator } from "@playwright/test";
import { storedDraft } from "./drafts";
import { requireActualFixture } from "./fixture-contract";

requireActualFixture();

const properties = ["margin-top", "font-size", "line-height", "max-width", "color"];
const looks = (locator: Locator) => locator.evaluate((element, names) =>
  names.map(name => getComputedStyle(element).getPropertyValue(name)), properties);

test("Make component on the About hero keeps its slotted heading and lead spacing", { tag: "@actual" }, async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=about/index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const frame = page.frameLocator(".native-preview-frame");
  const hero = frame.locator("section.hero");
  await expect(hero.locator("h1")).toHaveText("About Larkspur");
  const before = [await looks(hero.locator("h1")), await looks(hero.locator(".lead"))];
  expect(parseFloat(before[1][0])).toBeGreaterThan(0);

  await page.getByRole("tree", { name: "Page structure" }).getByRole("treeitem", { name: /^Section About Larkspur/ }).locator(".page-structure__label").first().click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Make component…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Make component" });
  await dialog.getByRole("textbox", { name: "Component name" }).fill("section-about-hero");
  await dialog.getByRole("button", { name: "Make component" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#status")).toContainText("Made the component <section-about-hero>");

  const cssPath = "components/section-about-hero/section-about-hero.css";
  await expect.poll(async () => (await storedDraft(page, cssPath))?.content ?? "").toMatch(/\.flow > \* \+ \*\s*\{\s*margin-top: var\(--space-s\);/);
  const made = frame.locator("section-about-hero");
  const title = made.locator(":scope > h1[slot]");
  const lead = made.locator(":scope > .lead[slot]");
  await expect(title).toHaveText("About Larkspur");
  await expect(lead).toHaveCount(1);
  await expect.poll(async () => (await looks(lead))[0]).toBe(before[1][0]);
  await expect.poll(async () => [await looks(title), await looks(lead)]).toEqual(before);
  expect(parseFloat((await looks(lead))[0])).toBeGreaterThan(0);
});
