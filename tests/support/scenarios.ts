import { expect, type Page } from "@playwright/test";
import { openPickerOn } from "../native-save/open-picker";

/** The common editor-loaded wait, shared by named shots and browser specs. */
export async function openEditor(page: Page, baseURL = "", file = "index.html") {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${file}`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator("body")).toBeVisible();
}

/** Switch the open editor to another branch while Media work (an upload, unsaved details) is still in flight. */
export async function switchSiteMidUpload(page: Page, baseURL: string | undefined, { branch = "feature", file = "index.html" } = {}) {
  await page.request.post(`${baseURL}/__demo/branch`, { data: { name: branch } });
  await page.evaluate(({ branch, file }) => { location.hash = `repo=501&branch=${branch}&file=${file}`; }, { branch, file });
  await expect(page.locator("#status")).toContainText(`Up to date with ${branch}`, { timeout: 30_000 });
}

async function explorerTab(page: Page, name: string) {
  const explorer = page.locator("#explorer");
  if (!await explorer.isVisible()) await page.locator("#explorer-toggle").click();
  await explorer.getByRole("tab", { name, exact: true }).click();
  await expect(explorer).toBeVisible();
}

/** Open Media from an already loaded editor, including its phone sheet. */
export async function openMedia(page: Page) {
  await explorerTab(page, "Media");
  const media = page.getByRole("region", { name: "Media", exact: true });
  await expect(media).toBeVisible();
  await expect(media.locator(".media-library__card").first()).toBeVisible();
  return media;
}

export async function openFileDetails(page: Page, path?: string) {
  const media = await openMedia(page);
  const details = path ? media.getByRole("button", { name: `Details for ${path}`, exact: true }) : media.getByRole("button", { name: /^Details for / }).first();
  await details.click();
  // File details is rendered inside Media, rather than a separate dialog.
  await expect(media.getByLabel("File name", { exact: true })).toBeVisible();
  await expect(media.getByLabel("Description", { exact: true })).toBeVisible();
  return media;
}

/** Select a real picture from the editing preview; the starter can change its filename. */
export async function pickPicture(page: Page, selector = "img") {
  const picture = page.frameLocator(".native-preview-frame").locator(selector).first();
  await expect(picture).toBeVisible({ timeout: 30_000 });
  await picture.click();
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__media")).toBeVisible();
  return picture;
}

export async function openImagePicker(page: Page, selector = "img") {
  const picture = await pickPicture(page, selector);
  // Picture slots allow video too; plain images only allow an image.
  const slot = await picture.getAttribute("slot");
  return openPickerOn(page, picture, slot ? "Choose image or video" : "Choose image");
}

export async function openFiles(page: Page) {
  await explorerTab(page, "Files");
  await expect(page.locator('#explorer .file-row[data-path="index.html"]')).toBeVisible();
  return page.locator("#explorer");
}

export async function openPages(page: Page) {
  await explorerTab(page, "Pages");
  await expect(page.locator("#explorer-pages")).toBeVisible();
  return page.locator("#explorer");
}

export async function openStructure(page: Page) {
  const handle = page.getByRole("button", { name: "Page structure and code", exact: true });
  if (await handle.isVisible() && await handle.getAttribute("aria-expanded") !== "true") {
    await handle.click();
    await expect(handle).toHaveAttribute("aria-expanded", "true");
  }
  const structure = page.getByRole("complementary", { name: "Page structure", exact: true });
  await expect(structure).toBeVisible();
  return structure;
}
