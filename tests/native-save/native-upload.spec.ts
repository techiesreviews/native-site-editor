import { expect, test, type Page } from "@playwright/test";
import { publishButton, showPublish } from "./publish";

// Uploading images and other binary files (src/uploads.ts): the Media
// picker's Add new file and drop, the Files tab's Upload files… and drop
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
// The picker adds files on the drop-to-add path, which keeps an SVG's bytes as they are.
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#c03"/></svg>\n');

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
  await expect(chooser(page).getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  await expect(chooser(page)).not.toHaveAttribute("aria-busy", "true");
}

/** The added file is chosen, not placed: the page is unchanged until Use. */
async function addedThenUse(page: Page, path: string) {
  await expect(chooser(page).locator(".media-library__adding-status")).toHaveText("Added 1 file");
  await expect(chooser(page).getByRole("button", { name: `Choose ${path}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(chooser(page).locator(".media-library__chosen-text")).toHaveText(path.split("/").pop()!);
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"))).not.toContain(path);
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

test("Add new file in the Media picker adds to images/ and chooses it; Use places it; it survives a reload and saves byte for byte", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openChooser(page);
  const upload = page.waitForEvent("filechooser");
  await chooser(page).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Add new file", exact: true }).click();
  await (await upload).setFiles({ name: "Team Photo.svg", mimeType: "image/svg+xml", buffer: svg });
  await addedThenUse(page, "images/team-photo.svg");

  // The image points at the new file, its alt follows the name, and the preview shows the bytes.
  await expect.poll(() => editorText(page)).toContain(`<img alt="team photo" width="1" height="1" loading="lazy" decoding="async" class="hero-image" src="/images/team-photo.svg" data-key="hero-image">`);
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", `data:image/svg+xml;base64,${svg.toString("base64")}`);

  // It is an A change, uploaded, with the page's edit beside it.
  await showPublish(page);
  await expect(panel(page)).toBeVisible();
  const files = panel(page).locator(".publish-menu__file");
  await expect(files).toHaveText([/images\/team-photo\.svg/, /index\.html/]);
  await expect(files.first().locator(".publish-menu__status [aria-hidden]")).toHaveText("A");
  await expect(panel(page).locator(".publish-menu__note").first()).toHaveText(`Uploaded, ${svg.length} B`);
  await page.keyboard.press("Escape");
  expect(await storedUploads(page)).toBe(1);

  // A reload keeps the draft, its bytes and the preview.
  await page.reload();
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/, { timeout: 30_000 });
  // The picker now lists the draft image beside the repository's images.
  await openChooser(page);
  await chooser(page).getByRole("button", { name: "Choose images/team-photo.svg", exact: true }).click();
  await expect(chooser(page).locator(".media-library__chosen-text")).toHaveText("team-photo.svg");
  await chooser(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(chooser(page)).toBeHidden();

  // Saved: the bytes on GitHub are the file's, and the browser lets its copy go.
  await showPublish(page);
  for (const box of await panel(page).locator(".publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect((await committed(page, "images/team-photo.svg"))?.equals(svg)).toBe(true);
  expect((await committed(page, indexPath))?.toString()).toContain(`src="/images/team-photo.svg"`);
  await expect.poll(() => storedUploads(page)).toBe(0);
  await expect(saveTrigger(page)).toBeDisabled();
});

test("a file dropped on the Media picker is added and chosen; Discard in the Save panel removes it and its bytes", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openChooser(page);
  await dropFiles(page, "dialog.media-library", [{ name: "placeholder.svg", type: "image/svg+xml", base64: svg.toString("base64") }]);
  await addedThenUse(page, "images/placeholder-2.svg");
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
