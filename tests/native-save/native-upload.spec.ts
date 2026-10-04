import { expect, test, type Page } from "@playwright/test";
import { publishButton, showPublish } from "./publish";

// Uploading images and other binary files (src/uploads.ts): the image
// chooser's Upload images… and drop, the Files tab's Upload files… and drop
// on a folder. An upload is an A draft whose bytes this browser keeps in
// IndexedDB; the preview shows it at once; Save sends the bytes as a GitHub
// blob (worker/blobs.ts) and commits it, byte for byte, to the fake GitHub
// (server.ts); Discard drops it and its bytes.
const indexPath = "index.html";
const pageErrors: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

// A real 1×1 PNG, then every byte value (ignored after IEND): not UTF-8.
const png = Buffer.concat([
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
]);
const pngUrl = `data:image/png;base64,${png.toString("base64")}`;

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const chooser = (page: Page) => page.getByRole("dialog", { name: "Choose image", exact: true });
const explorer = (page: Page) => page.locator("#explorer");
const row = (page: Page, name: string) => explorer(page).getByRole("button", { name, exact: true });
const status = (page: Page) => page.locator("#status");
const saveTrigger = publishButton;
const panel = (page: Page) => page.locator("#publish-files");

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(status(page)).toContainText("Up to date with main", { timeout: 30_000 });
}

async function editorText(page: Page) {
  const textbox = page.locator(`#content [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return text;
}

async function openChooser(page: Page) {
  await frame(page).locator(".hero img").click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Image");
  await bar(page).getByRole("button", { name: "Choose image…", exact: true }).click();
  await expect(chooser(page)).toBeVisible();
  await expect(chooser(page).getByRole("button", { name: "Details for images/placeholder.svg", exact: true })).toBeVisible();
  await expect(chooser(page)).not.toHaveAttribute("aria-busy", "true");
}

async function addOriginalAndUse(page: Page, path: string) {
  // Byte-exact uploads explicitly retain the original instead of re-encoding it.
  await chooser(page).getByRole("checkbox", { name: "Keep original", exact: true }).check();
  await chooser(page).getByRole("button", { name: "Preview optimisation", exact: true }).click();
  await expect(chooser(page).getByRole("button", { name: "Add to library", exact: true })).toBeEnabled();
  await chooser(page).getByRole("button", { name: "Add to library", exact: true }).click();
  await expect(chooser(page)).not.toHaveAttribute("aria-busy", "true");
  await chooser(page).getByRole("button", { name: `Details for ${path}`, exact: true }).click();
  await chooser(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(chooser(page)).toBeHidden();
}

// Files dropped from the desktop onto `selector`, as the browser delivers them.
// `size` instead of `base64`: that many zero bytes, made in the page.
async function dropFiles(page: Page, selector: string, files: { name: string; type: string; base64?: string; size?: number }[]) {
  await page.locator(selector).first().evaluate((element, files) => {
    const transfer = new DataTransfer();
    for (const file of files)
      transfer.items.add(new File([file.base64 === undefined ? new Uint8Array(file.size ?? 0) : Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))], file.name, { type: file.type }));
    for (const type of ["dragenter", "dragover", "drop"])
      element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, files);
}

// The bytes this browser keeps for uploads (IndexedDB).
async function storedUploads(page: Page) {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("native-site-editor-uploads", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("bytes");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const keys = request.result.transaction("bytes").objectStore("bytes").getAllKeys();
      keys.onsuccess = () => { resolve(keys.result.length); request.result.close(); };
    };
  }));
}

async function committed(page: Page, path: string) {
  const response = await page.request.get(`/__demo/file?${new URLSearchParams({ path })}`);
  return response.ok() ? Buffer.from(await response.body()) : undefined;
}

test("Upload images… in the image chooser uploads to images/, shows it at once, survives a reload and saves byte for byte", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openChooser(page);
  const upload = page.waitForEvent("filechooser");
  await chooser(page).getByRole("button", { name: "Upload images…", exact: true }).click();
  await (await upload).setFiles({ name: "Team Photo.PNG", mimeType: "image/png", buffer: png });
  await addOriginalAndUse(page, "images/team-photo.png");

  // The image points at the new file, its alt follows the name, and the preview shows the bytes.
  await expect.poll(() => editorText(page)).toContain(`<img alt="team photo" width="1" height="1" loading="lazy" decoding="async" class="hero-image" src="/images/team-photo.png" data-key="hero-image">`);
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", pngUrl);
  await expect(chooser(page)).toBeHidden();

  // It is an A change, uploaded, with the page's edit beside it.
  await showPublish(page);
  await expect(panel(page)).toBeVisible();
  const files = panel(page).locator(".publish-menu__file");
  await expect(files).toHaveText([/images\/team-photo\.png/, /index\.html/]);
  await expect(files.first().locator(".publish-menu__status [aria-hidden]")).toHaveText("A");
  await expect(panel(page).locator(".publish-menu__note").first()).toHaveText("Uploaded, 326 B");
  await page.keyboard.press("Escape");
  expect(await storedUploads(page)).toBe(1);

  // A reload keeps the draft, its bytes and the preview.
  await page.reload();
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", pngUrl, { timeout: 30_000 });
  // The chooser now lists the draft image beside the repository's images.
  await openChooser(page);
  await chooser(page).getByRole("button", { name: "Details for images/team-photo.png", exact: true }).click();
  await expect(chooser(page).getByRole("textbox", { name: "Alt text for insertion", exact: true })).toHaveValue("team photo");
  await page.keyboard.press("Escape");

  // Saved: the bytes on GitHub are the file's, and the browser lets its copy go.
  await showPublish(page);
  for (const box of await panel(page).locator(".publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect((await committed(page, "images/team-photo.png"))?.equals(png)).toBe(true);
  expect((await committed(page, indexPath))?.toString()).toContain(`src="/images/team-photo.png"`);
  await expect.poll(() => storedUploads(page)).toBe(0);
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", pngUrl);
  await expect(saveTrigger(page)).toBeDisabled();
});

test("a file dropped on the image chooser uploads it; Discard in the Save panel removes it and its bytes", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openChooser(page);
  await dropFiles(page, "dialog.media-library", [{ name: "placeholder.svg", type: "image/png", base64: png.toString("base64") }]);
  await addOriginalAndUse(page, "images/placeholder-2.svg");
  // The name is taken on the branch: a suffix, never an overwrite.
  await expect.poll(() => editorText(page)).toContain(`src="/images/placeholder-2.svg"`);
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
  await expect(status(page)).toHaveText("Image replaced");

  await showPublish(page);
  await expect(panel(page).locator(".publish-menu__file")).toHaveCount(2);
  await panel(page).getByRole("button", { name: "Discard images/placeholder-2.svg" }).click();
  await expect(panel(page).locator(".publish-menu__file")).toHaveText([/index\.html/]);
  await page.keyboard.press("Escape");
  // The page still names it, but nothing is there to show.
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", "/images/placeholder-2.svg");
  await expect.poll(() => storedUploads(page)).toBe(0);
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await showPublish(page);
  await expect(panel(page).locator(".publish-menu__file")).toHaveText([/index\.html/]);
});

test("Upload files… in a folder's menu and files dropped on a folder upload there; too large files are refused", async ({ page, baseURL }) => {
  await open(page, baseURL);
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await explorer(page).getByRole("tab", { name: "Files" }).click();
  for (const part of ["images"]) {
    const folder = row(page, part).first();
    if ((await folder.getAttribute("aria-expanded")) === "false") await folder.click();
    await expect(folder).toHaveAttribute("aria-expanded", "true");
  }

  await explorer(page).getByRole("button", { name: "Actions for images", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Upload files…" }).click();
  await (await chooser).setFiles([
    { name: "Logo.PNG", mimeType: "image/png", buffer: png },
    { name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nÿþ") },
  ]);
  await expect(status(page)).toHaveText("Uploaded images/logo.png, images/notes.pdf.");
  const logo = explorer(page).locator(".file-row[data-path='images/logo.png']");
  await expect(logo).toHaveAttribute("aria-description", "added, not saved to GitHub yet");

  // Opened, an uploaded image shows itself, with Discard.
  await logo.click();
  await expect(page.locator(".upload-summary__image")).toHaveAttribute("src", pngUrl);
  await expect(page.getByRole("button", { name: "Discard images/logo.png" })).toBeVisible();

  // Dropped from the desktop on a folder row: uploaded into that folder.
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await dropFiles(page, "#explorer .file-row[data-path='about']", [{ name: "Photo.png", type: "image/png", base64: png.toString("base64") }]);
  await expect(status(page)).toHaveText("Uploaded about/photo.png.");

  // Over 20 MB: refused, with nothing added.
  await dropFiles(page, "#explorer .file-row[data-path='images']", [{ name: "huge.png", type: "image/png", size: 20 * 1024 * 1024 + 1 }]);
  await expect(page.locator("#notice")).toContainText("huge.png is 20 MB; uploads are limited to 20 MB per file.");
  await expect(explorer(page).locator(".file-row[data-path='images/huge.png']")).toHaveCount(0);

  // Saving commits all three, byte for byte.
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`);
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await showPublish(page);
  await expect(panel(page).locator(".publish-menu__file")).toHaveCount(3);
  for (const box of await panel(page).locator(".publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect((await committed(page, "images/logo.png"))?.equals(png)).toBe(true);
  expect((await committed(page, "about/photo.png"))?.equals(png)).toBe(true);
  expect((await committed(page, "images/notes.pdf"))?.equals(Buffer.from("%PDF-1.4\nÿþ"))).toBe(true);
});
