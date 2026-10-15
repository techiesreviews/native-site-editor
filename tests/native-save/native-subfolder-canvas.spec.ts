import { expect, test, type Page } from "@playwright/test";

// Default fixture group: native-subfolder (532).
const frame = (page: Page) => page.frameLocator(".native-preview-frame");

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=532&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator("h1")).toHaveText("Found where they are");
}

async function setAddress(page: Page, address: string) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Site settings", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Site address", { exact: true }).fill(address);
  await dialog.getByRole("button", { name: "Apply site settings", exact: true }).click();
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

test("changing the Site address updates the canvas without reloading", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(frame(page).locator("h1")).toHaveCSS("text-decoration-line", "underline");
  await setAddress(page, "https://user.github.io/");
  await expect(frame(page).locator("h1")).toHaveCSS("text-decoration-line", "none");
  await expect(frame(page).getByRole("img", { name: "Green square" })).toHaveAttribute("src", "/my-site/media/picture.svg");
  await setAddress(page, "https://user.github.io/my-site/");
  await expect(frame(page).locator("h1")).toHaveCSS("text-decoration-line", "underline");
  await expect(frame(page).getByRole("img", { name: "Green square" })).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(page.locator(".native-preview-error")).toBeHidden();
});
