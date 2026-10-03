import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
import { mkdir } from "node:fs/promises";

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const pageBlock = (page: Page) => page.getByRole("group", { name: "Page", exact: true });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
async function open(page: Page, baseURL: string | undefined, repo = 501, file = "index.html") {
  await page.goto(`${baseURL}/#repo=${repo}&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(pageBlock(page).getByRole("button", { name: "Page settings", exact: true })).toBeVisible();
}
async function openSite(page: Page) {
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  await expect(dialog(page, "Site settings")).toBeVisible();
}

test("page settings edit SEO, linked social details and a live share card, with draft undo", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await pageBlock(page).getByRole("button", { name: "Page settings", exact: true }).click();
  const panel = dialog(page, "Page settings");
  await panel.getByLabel("Title", { exact: true }).fill("A garden studio");
  await panel.getByLabel("Description", { exact: true }).fill("Independent gardens, thoughtfully designed.");
  await expect(panel.getByLabel("Social title", { exact: true })).toHaveValue("A garden studio");
  await expect(panel.locator(".site-settings__card strong")).toHaveText("A garden studio");
  await panel.getByLabel("Use page title", { exact: true }).uncheck();
  await panel.getByLabel("Social title", { exact: true }).fill("Share our gardens");
  await panel.getByLabel("Title", { exact: true }).fill("Garden studio");
  await expect(panel.getByLabel("Social title", { exact: true })).toHaveValue("Share our gardens");
  await panel.getByLabel("Social image", { exact: true }).fill("/images/placeholder.svg");
  await panel.getByLabel("Canonical URL", { exact: true }).fill("https://garden.example/");
  await panel.getByLabel("Hide from search engines", { exact: true }).check();
  await panel.getByLabel("Theme colour", { exact: true }).fill("#2f6d3a");
  await mkdir(".scratch/site", { recursive: true });
  await page.screenshot({ path: ".scratch/site/page-settings-light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: ".scratch/site/page-settings-dark.png" });
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel).not.toBeVisible();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('<meta property="og:title" content="Share our gardens">');
  const source = (await storedDraft(page, "index.html"))!.content;
  expect(source).toContain('<title>Garden studio</title>');
  expect(source).toContain('href="https://garden.example/"');
  expect(source).toContain('name="robots" content="noindex"');
  expect(source).toContain('name="theme-color" content="#2f6d3a"');
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").not.toContain("Garden studio");
});

test("site settings list pages, apply favicon and defaults together, and open 404", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openSite(page);
  const panel = dialog(page, "Site settings");
  await expect(panel.locator(".site-settings__affected li")).toHaveCount(2);
  await panel.getByLabel("Site name", { exact: true }).fill("Garden Studio");
  await panel.getByLabel("Favicon", { exact: true }).fill("/images/placeholder.svg");
  await panel.getByLabel("Default social image", { exact: true }).fill("https://garden.example/card.png");
  await page.screenshot({ path: ".scratch/site/site-settings-light.png" });
  await panel.getByRole("button", { name: "Apply site settings" }).click();
  await expect(panel).not.toBeVisible();
  for (const path of ["index.html", "about/index.html"]) {
    await expect.poll(async () => (await storedDraft(page, path))?.content).toContain('rel="icon" href="/images/placeholder.svg"');
    expect((await storedDraft(page, path))!.content).toContain('property="og:site_name" content="Garden Studio"');
  }
  expect((await storedDraft(page, ".editor/config.json"))?.content).toContain('"socialImage": "https://garden.example/card.png"');
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, "about/index.html"))?.content ?? "").not.toContain("Garden Studio");
  await openSite(page);
  await dialog(page, "Site settings").getByRole("button", { name: "Create and open 404 page" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "404.html");
});

test("navigation renames, reorders, adds pages and external links in the shared template", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await pageBlock(page).getByRole("button", { name: "Navigation", exact: true }).click();
  const panel = dialog(page, "Navigation");
  await expect(panel).toContainText("Shared component");
  await panel.getByLabel("Link 1 label", { exact: true }).fill("Our work");
  await panel.getByRole("button", { name: "Move About up", exact: true }).click();
  await expect(panel.getByLabel("Link 1 label", { exact: true })).toHaveValue("About");
  await panel.getByLabel("Page to add", { exact: true }).selectOption("/about/");
  await panel.getByRole("button", { name: "Add page", exact: true }).click();
  await panel.getByRole("button", { name: "Add external link", exact: true }).click();
  await panel.getByLabel("Link 4 label", { exact: true }).fill("Partner");
  await panel.getByLabel("Link 4 URL", { exact: true }).fill("https://partner.example/");
  await page.screenshot({ path: ".scratch/site/navigation-light.png" });
  await panel.getByRole("button", { name: "Apply navigation" }).click();
  const path = "components/site-header/site-header.html";
  await expect.poll(async () => (await storedDraft(page, path))?.content).toContain('href="https://partner.example/">Partner</a>');
  await expect(frame(page).locator("site-header nav a")).toHaveText(["About", "Our work", "About this project", "Partner"]);
});

test("new top-level page can join navigation; one undo removes both drafts", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "+ New page", exact: true }).click();
  await page.getByRole("textbox", { name: "New page title", exact: true }).fill("Services");
  await page.getByLabel("Add to navigation", { exact: true }).check();
  await page.getByRole("textbox", { name: "New page title", exact: true }).press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "services/index.html");
  await expect.poll(async () => (await storedDraft(page, "components/site-header/site-header.html"))?.content).toContain('href="/services/">Services</a>');
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "services/index.html")).toBeUndefined();
  await expect.poll(() => storedDraft(page, "components/site-header/site-header.html")).toBeUndefined();
});

test("effects create CSS once, link every page, toggle classes and leave reduced-motion content visible", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await frame(page).locator(".hero h1").click();
  await expect(page.getByRole("toolbar", { name: "Edit bar" })).toBeVisible();
  await page.getByRole("button", { name: "Effects", exact: true }).click();
  await page.getByRole("menuitem", { name: "Fade in on scroll", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, "styles/effects.css"))?.content).toContain("animation-timeline: view()");
  await expect.poll(async () => (await storedDraft(page, "about/index.html"))?.content).toContain('href="/styles/effects.css"');
  await expect(frame(page).locator(".reveal-fade")).toBeVisible();
  await expect(frame(page).locator(".reveal-fade")).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Effects", exact: true }).click();
  await page.getByRole("menuitem", { name: "Fade in on scroll", exact: true }).click();
  await expect(frame(page).locator(".reveal-fade")).toHaveCount(0);
  expect(((await storedDraft(page, "styles/effects.css"))!.content.match(/Effect: reveal-fade/g) ?? [])).toHaveLength(1);
});
