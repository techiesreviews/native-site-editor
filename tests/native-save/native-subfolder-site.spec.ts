import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";

// Default fixture group: native-starter (501), a site at a domain root with no Site address.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const dialog = (page: Page) => page.getByRole("dialog", { name: "Site settings", exact: true });

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator("img.hero-image")).toHaveAttribute("src", /^data:image\/svg\+xml/);
}

async function applyAddress(page: Page, address: string) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByLabel("Site address", { exact: true }).fill(address);
  await dialog(page).getByRole("button", { name: "Apply site settings", exact: true }).click();
  const question = dialog(page).getByRole("group", { name: "This updates 9 links in 4 files to the new address. Undo is available.", exact: true });
  await expect(question).toBeVisible();
  return question;
}

test("a project-site address moves links, images and the component loader into its folder, with one Undo", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await open(page, baseURL);
  const question = await applyAddress(page, "https://user.github.io/my-site/");
  await expect(question.getByRole("button", { name: "Update links", exact: true })).toBeFocused();
  await question.getByRole("button", { name: "Update links", exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator("#status")).toContainText("Updated 9 links in 4 files to the new address.");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('<link rel="stylesheet" href="/my-site/styles/site.css">');
  const home = (await storedDraft(page, "index.html"))?.content ?? "";
  expect(home).toContain('<script type="module" src="/my-site/components/components.js"></script>');
  expect(home).toContain('src="/my-site/images/placeholder.svg"');
  expect((await storedDraft(page, "components/site-header/site-header.html"))?.content).toContain('<a href="/my-site/about/" data-key="nav-about">About</a>');
  expect((await storedDraft(page, ".editor/config.json"))?.content).toContain('"url": "https://user.github.io/my-site/"');
  // The canvas still shows the page: its image, its styles and its components.
  await expect(frame(page).locator("img.hero-image")).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(frame(page).locator("site-header .brand")).toHaveText("Native Studio");
  await expect(page.locator(".native-preview-error")).toBeHidden();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
  await expect(frame(page).locator("img.hero-image")).toHaveAttribute("src", /^data:image\/svg\+xml/);
});

test("Cancel keeps the old address and changes nothing", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const question = await applyAddress(page, "https://user.github.io/my-site/");
  await question.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(question).toBeHidden();
  await expect(dialog(page).locator(".site-settings__status")).toHaveText("Kept the old site address. Nothing was applied.");
  await expect(dialog(page).getByLabel("Site address", { exact: true })).toHaveValue("");
  await expect(dialog(page).getByRole("button", { name: "Apply site settings", exact: true })).toBeVisible();
  expect(await storedDrafts(page)).toEqual([]);
});
