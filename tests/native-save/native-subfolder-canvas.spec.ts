import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// Default fixture group: native-subfolder (532).
const frame = (page: Page) => page.frameLocator(".native-preview-frame");

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=532&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator("h1")).toHaveText("Found where they are");
}

// `links`: the address moves the site's links too, after a question (slice 80).
async function setAddress(page: Page, address: string, links?: string) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Site settings", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Site address", { exact: true }).fill(address);
  await dialog.getByRole("button", { name: "Apply site settings", exact: true }).click();
  if (links) await dialog.getByRole("group", { name: `This updates ${links} to the new address. Undo is available.`, exact: true }).getByRole("button", { name: "Update links", exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("a sub-folder site previews its styles, images and components and follows both link forms", async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page, baseURL);
  await expect(page.locator(".native-preview-error")).toBeHidden();
  await expect(frame(page).locator("h1")).toHaveCSS("text-decoration-line", "underline");
  await expect(frame(page).locator("body")).toHaveCSS("background-color", "rgb(246, 247, 243)");
  await expect(frame(page).locator("h1")).toHaveCSS("color", "rgb(47, 109, 58)");
  const image = frame(page).getByRole("img", { name: "Green square" });
  await expect(image).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect.poll(() => image.evaluate(el => el instanceof HTMLImageElement && el.complete && el.naturalWidth)).toBe(24);
  await expect(frame(page).locator("site-header .brand")).toHaveText("Conventions");
  await expect(frame(page).locator("promo-card .promo-card")).toHaveCSS("border-top-left-radius", "12px");
  await expect(frame(page).locator("site-header .brand")).toHaveAttribute("aria-current", "page");
  await frame(page).getByRole("link", { name: "First note", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator("h1")).toHaveText("First note");
  await expect(frame(page).locator("site-header nav a")).toHaveAttribute("aria-current", "page");
  await frame(page).getByRole("link", { name: "Home", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator("h1")).toHaveText("Found where they are");
  expect(errors).toEqual([]);
});

test("changing the Site address moves the links and the canvas follows without reloading", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(frame(page).locator("h1")).toHaveCSS("text-decoration-line", "underline");
  await setAddress(page, "https://user.github.io/", "6 links in 4 files");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('<img src="/media/picture.svg"');
  await expect(frame(page).locator("h1")).toHaveCSS("text-decoration-line", "underline");
  await expect(frame(page).getByRole("img", { name: "Green square" })).toHaveAttribute("src", /^data:image\/svg\+xml/);
  // Back into the folder: every link, the component loader too, gains it.
  await setAddress(page, "https://user.github.io/my-site/", "10 links in 4 files");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('<script type="module" src="/my-site/components/components.js">');
  await expect(frame(page).locator("h1")).toHaveCSS("text-decoration-line", "underline");
  await expect(frame(page).getByRole("img", { name: "Green square" })).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(page.locator(".native-preview-error")).toBeHidden();
});

test("Text size offers the size variables a prefixed import defines", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // The imported layer file has loaded.
  await expect(frame(page).locator("h1")).toHaveCSS("color", "rgb(47, 109, 58)");
  await frame(page).locator("p[data-key=lead]").click();
  const bar = page.getByRole("toolbar", { name: "Edit bar" });
  await expect(bar.locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect.poll(() => bar.getByRole("combobox", { name: "Text size" }).locator("option").allTextContents()).toEqual(["Default", "S", "M", "L"]);
});

// Slice 78: what the editor writes on a sub-folder site carries the prefix.
test("a new page joins the navigation with the site's sub-folder in its link", async ({ page, baseURL }) => {
  await open(page, baseURL);
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "+ New page", exact: true }).click();
  await page.getByRole("textbox", { name: "New page title", exact: true }).fill("Videos");
  await page.getByLabel("Add to navigation", { exact: true }).check();
  await page.getByRole("textbox", { name: "New page title", exact: true }).press("Enter");
  await expect(page.locator("#status")).toHaveText("Created Videos and added it to navigation as drafts.");
  const header = "components/site-header/site-header.html";
  await expect.poll(async () => (await storedDraft(page, header))?.content).toContain('href="/my-site/videos/"');
  const nav = (await storedDraft(page, header))!.content.match(/<nav[\s\S]*<\/nav>/)![0];
  expect(nav.match(/href="[^"]*"/g)).toEqual(['href="/my-site/notes/first-note/"', 'href="/my-site/videos/"']);
  await expect(frame(page).locator("site-header nav a")).toHaveText(["Notes", "Videos"]);
});
