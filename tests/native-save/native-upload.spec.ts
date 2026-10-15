import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
import { openPickerOn } from "./open-picker";
import { publishButton, showPublish } from "./publish";
import { onePagePdf } from "./pdf-fixture";

const require = createRequire(import.meta.url);

// Uploading images and other binary files (src/uploads.ts): the Media
// picker's + (Add files) and drop, the Files tab's Upload files… and drop
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
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP476AAAAOhAWAv9IBkAAAAAElFTkSuQmCC", "base64"),
  Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
]);
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
  await openPickerOn(page, frame(page).locator(".hero img"));
  await expect(chooser(page)).toBeVisible();
  await expect(chooser(page).getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  await expect(chooser(page)).not.toHaveAttribute("aria-busy", "true");
}

/** The added file is held and chosen, not saved or placed: nothing changes until Use, which saves and places it. */
async function addedThenUse(page: Page, name: string, path: string) {
  await expect(chooser(page).getByRole("button", { name: `Choose ${name}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(chooser(page).locator(".media-library__chosen-text")).toHaveText(name);
  const code = page.locator(".code-editor .monaco-editor .view-lines").first();
  await expect(code).toContainText("src=");
  await expect(code).not.toContainText(path);
  expect(await storedUploads(page)).toBe(0);
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

test("+ in the Media picker adds to media/images/ and chooses it; Use places it; it survives a reload and saves the cleaned SVG", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openChooser(page);
  const upload = page.waitForEvent("filechooser");
  await chooser(page).getByRole("button", { name: "Add files", exact: true }).click();
  // SVGs are minified on the way in: the square becomes the same square drawn as a path.
  const cleaned = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path fill="#c03" d="M0 0h1v1H0z"/></svg>');
  await (await upload).setFiles({ name: "Team Photo.svg", mimeType: "image/svg+xml", buffer: svg });
  await addedThenUse(page, "Team Photo.svg", "media/images/team-photo.svg");

  // The image points at the new file, its alt stays empty until described, and the preview shows the cleaned bytes.
  await expect.poll(() => editorText(page)).toContain(`<img alt="" width="1" height="1" decoding="async" class="hero-image" src="/media/images/team-photo.svg" data-key="hero-image">`);
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", `data:image/svg+xml;base64,${cleaned.toString("base64")}`);

  // It is an A change, uploaded, with the page's edit and its date in the media records (slice 103) beside it.
  await showPublish(page);
  await expect(panel(page)).toBeVisible();
  const files = panel(page).locator(".publish-menu__file");
  await expect(files).toHaveText([/\.editor\/media\.json/, /index\.html/, /media\/images\/team-photo\.svg/]);
  await expect(files.last().locator(".publish-menu__status [aria-hidden]")).toHaveText("A");
  await expect(panel(page).locator(".publish-menu__note").first()).toHaveText(`Uploaded, ${cleaned.length} B`);
  await page.keyboard.press("Escape");
  expect(await storedUploads(page)).toBe(1);

  // A reload keeps the draft, its bytes and the preview.
  await page.reload();
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/, { timeout: 30_000 });
  // The picker now lists the draft image beside the repository's images.
  await openChooser(page);
  await chooser(page).getByRole("button", { name: "Choose media/images/team-photo.svg", exact: true }).click();
  await expect(chooser(page).locator(".media-library__chosen-text")).toHaveText("team-photo.svg");
  await chooser(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(chooser(page)).toBeHidden();

  // Saved: the bytes on GitHub are the cleaned file's, and the browser lets its copy go.
  await showPublish(page);
  for (const box of await panel(page).locator(".publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect((await committed(page, "media/images/team-photo.svg"))?.equals(cleaned)).toBe(true);
  expect((await committed(page, indexPath))?.toString()).toContain(`src="/media/images/team-photo.svg"`);
  await expect.poll(() => storedUploads(page)).toBe(0);
  await expect(saveTrigger(page)).toBeDisabled();
});

test("a file dropped on the Media picker is added and chosen; Discard in the Save panel removes it and its bytes", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openChooser(page);
  await dropFiles(page, "dialog.media-library", [{ name: "placeholder.svg", type: "image/svg+xml", base64: svg.toString("base64") }]);
  await addedThenUse(page, "placeholder.svg", "media/images/placeholder.svg");
  // The existing image stays in images/; this addition uses the new media folder.
  await expect.poll(() => editorText(page)).toContain(`src="/media/images/placeholder.svg"`);
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
  await expect(status(page)).toHaveText("Image replaced");

  await showPublish(page);
  // The page, the file and its date; discarding the only upload removes its records draft too.
  await expect(panel(page).locator(".publish-menu__file")).toHaveCount(3);
  await panel(page).getByRole("button", { name: "Discard media/images/placeholder.svg" }).click();
  await expect.poll(() => storedDraft(page, ".editor/media.json")).toBeUndefined();
  await expect(panel(page).locator(".publish-menu__file")).toHaveText([/index\.html/]);
  await page.keyboard.press("Escape");
  // The page still names it, but nothing is there to show.
  await expect(frame(page).locator(".hero img")).toHaveAttribute("src", "/media/images/placeholder.svg");
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
  await expect(status(page)).toHaveText("Added images/logo.png, images/notes.pdf. notes.pdf was added without a preview picture.");
  const logo = explorer(page).locator(".file-row[data-path='images/logo.png']");
  await expect(logo).toHaveAttribute("aria-description", "added, not saved to GitHub yet");

  // One Undo removes the whole folder addition, one Redo restores it.
  await page.locator(".code-editor__undo").first().click();
  await expect(explorer(page).locator(".file-row[data-path='images/logo.png']")).toHaveCount(0);
  await expect(explorer(page).locator(".file-row[data-path='images/notes.pdf']")).toHaveCount(0);
  await page.locator(".code-editor__redo").first().click();
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(logo).toBeVisible();

  // Opened, an uploaded image shows itself, with Discard.
  await logo.click();
  await expect(page.locator(".upload-summary__image")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page.getByRole("button", { name: "Discard images/logo.png" })).toBeVisible();

  // Dropped from the desktop on a folder row: uploaded into that folder.
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await dropFiles(page, "#explorer .file-row[data-path='about']", [{ name: "Photo.png", type: "image/png", base64: png.toString("base64") }]);
  await expect(status(page)).toHaveText("Added about/photo.png.");

  // Over 20 MB: refused, with nothing added.
  await dropFiles(page, "#explorer .file-row[data-path='images']", [{ name: "huge.pdf", type: "application/pdf", size: 20 * 1024 * 1024 + 1 }]);
  // The reason stays in the Files adding summary.
  const adding = explorer(page).getByRole("region", { name: "Files being added" });
  await expect(adding.getByRole("status")).toHaveText("1 file couldn't be added");
  await expect(adding).toContainText("huge.pdf is 20 MB; uploads are limited to 20 MB per file.");
  await expect(explorer(page).locator(".file-row[data-path='images/huge.pdf']")).toHaveCount(0);

  // Saving commits prepared images and the byte-for-byte as-is PDF.
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`);
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await showPublish(page);
  await expect(panel(page).locator(".publish-menu__file")).toHaveCount(4);
  for (const box of await panel(page).locator(".publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  // A tiny flat PNG stays the smaller lossless PNG (never larger than needed, slice 25).
  expect((await committed(page, "images/logo.png"))?.subarray(1, 4).toString()).toBe("PNG");
  expect((await committed(page, "about/photo.png"))?.subarray(1, 4).toString()).toBe("PNG");
  expect((await committed(page, "images/notes.pdf"))?.equals(Buffer.from("%PDF-1.4\nÿþ"))).toBe(true);
});

// Nightly default fixture: real pdf.js and Mediabunny, outside the smoke group.
async function addInMedia(page: Page, name: string, mimeType: string, buffer: Buffer) {
  if (!await explorer(page).isVisible()) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  const media = page.getByRole("region", { name: "Media", exact: true });
  await expect(media.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
  await media.locator('input[name="media-upload"]').setInputFiles({ name, mimeType, buffer });
  await expect(media.getByRole("region", { name: "Files being added", exact: true }).getByRole("status")).toHaveText("Added 1 file");
}
async function saveAll(page: Page) {
  await showPublish(page);
  for (const box of await panel(page).locator(".publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
}

test("a valid one-page PDF keeps its bytes and commits a matching WebP first-page preview", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const pdf = onePagePdf();
  await addInMedia(page, "Report.PDF", "application/pdf", pdf);
  await showPublish(page);
  await expect(panel(page).locator(".publish-menu__file")).toHaveText([
    /\.editor\/media.json/, /media\/downloads\/report.pdf/, /media\/downloads\/report.webp/,
  ]);
  await page.keyboard.press("Escape");
  await saveAll(page);
  expect((await committed(page, "media/downloads/report.pdf"))?.equals(pdf)).toBe(true);
  const preview = await committed(page, "media/downloads/report.webp");
  expect(preview?.subarray(0, 4).toString()).toBe("RIFF");
  expect(preview?.subarray(8, 12).toString()).toBe("WEBP");
  const records = JSON.parse((await committed(page, ".editor/media.json"))!.toString());
  expect(records.files["media/downloads/report.pdf"].still).toBe("media/downloads/report.webp");
  // pdf.js's decoding data is served beside the editor (scans, CJK text, unembedded fonts, colour profiles).
  const version = JSON.parse(readFileSync(require.resolve("pdfjs-dist/package.json"), "utf8")).version;
  for (const file of ["wasm/openjpeg.wasm", "cmaps/Adobe-Japan1-UCS2.bcmap", "standard_fonts/LiberationSans-Regular.ttf", "iccs/CGATS001Compat-v2-micro.icc"]) {
    const response = await page.request.get(`${baseURL}/assets/pdfjs-${version}/${file}`);
    expect(response.status(), file).toBe(200);
  }
});

test("a small 128 kbps MP3 is committed unchanged in media/audio", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // MPEG-1 Layer III, 128 kbps, 44.1 kHz, stereo: 417-byte frames with zero side info and silent data.
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  const mp3 = Buffer.concat(Array.from({ length: 12 }, () => frame));
  await addInMedia(page, "Small Track.MP3", "audio/mpeg", mp3);
  await saveAll(page);
  expect((await committed(page, "media/audio/small-track.mp3"))?.equals(mp3)).toBe(true);
});
