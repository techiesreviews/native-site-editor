import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
import { publishButton } from "./publish";

// Rename and Replace everywhere in File details (media build slice 54; ticket 15).
const fixture = "fixtures/native-starter";
const home = readFileSync(resolve(fixture, "index.html"), "utf8");
const about = readFileSync(resolve(fixture, "about/index.html"), "utf8");

/** A PNG of one colour, or a smooth `gradient` (which WebP stores far smaller, so preparing makes it a WebP). */
function png(width: number, height: number, [r, g, b]: [number, number, number], gradient = false) {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4), crc = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]);
    length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const pixel = (x: number, y: number) => gradient ? [Math.round(x * 255 / width), Math.round(y * 255 / height), 128] : [r, g, b];
  const rows = Array.from({ length: height }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, (_, x) => pixel(x, y)).flat())]));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
/** The "new version" mark slice 53 puts on each mention: the first 8 hex of the Git blob SHA. */
const mark = (bytes: Buffer) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex").slice(0, 8);
/** The replacement in Media: prepared again as at adding, it becomes a WebP with a 480 px copy. */
const next = png(600, 400, [0, 0, 0], true);

/** Home and About show images/tram.webp (40 × 30); About also shows images/old.png; images/next.png and
 * images/lisbon.webp are other pictures in Media. */
async function seed(page: Page, baseURL: string | undefined, extra: Record<string, { content?: string; base64?: string }> = {}) {
  await page.goto(baseURL!);
  const webp = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(40, 30), context = canvas.getContext("2d")!;
    context.fillStyle = "#c33"; context.fillRect(0, 0, 40, 30);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/webp" })).arrayBuffer());
    return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
  });
  const files: Record<string, { content?: string; base64?: string }> = {
    "images/tram.webp": { base64: webp },
    "images/lisbon.webp": { base64: webp },
    "images/old.png": { base64: png(8, 6, [200, 40, 40]).toString("base64") },
    "images/next.png": { base64: next.toString("base64") },
    "index.html": { content: home.replace('src="/images/placeholder.svg"', 'src="/images/tram.webp"') },
    "about/index.html": { content: about.replace('<section class="prose"',
      '<img class="about-image" src="/images/tram.webp" alt="Tram">\n  <img class="old-image" src="/images/old.png" alt="">\n  <section class="prose"') },
    ...extra,
  };
  for (const [path, data] of Object.entries(files))
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, ...data } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  await expect(pane(page)).toBeVisible();
}
const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
const picker = (page: Page) => page.getByRole("dialog", { name: "Choose image", exact: true });
const hero = (page: Page) => page.frameLocator(".native-preview-frame").locator(".hero-image");
const shownWidth = (page: Page) => hero(page).evaluate(image => (image as HTMLImageElement).complete ? (image as HTMLImageElement).naturalWidth : 0);
const pageText = (page: Page, path: string) => page.evaluate(async file => (await import("/src/components/code-editor.ts")).getMountedSource(file) as string | undefined, path);
const text = async (page: Page, path: string) => (await storedDraft(page, path))?.content;
const marked = /src="\/images\/tram\.webp\?v=([0-9a-f]{8})"/;

/** Replace images/tram.webp everywhere with images/next.png, chosen in the picker. */
async function replaceWithNext(page: Page) {
  const media = pane(page);
  await media.getByRole("button", { name: "Details for images/tram.webp", exact: true }).click();
  await media.getByRole("button", { name: "Replace everywhere…", exact: true }).click();
  await picker(page).getByRole("button", { name: "Choose images/next.png", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await media.getByRole("button", { name: "Replace everywhere", exact: true }).click();
  await expect(media.getByLabel("File name", { exact: true })).toHaveValue("tram.webp");
}

test("rename a used image in File details: the page still shows it, and the old address forwards when ticked", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const media = pane(page), name = media.getByLabel("File name", { exact: true });
  await media.getByRole("button", { name: "Details for images/tram.webp", exact: true }).click();
  await name.fill("Lisbon Tram");
  // Before saving: the tidied name, and the tick box (unticked: the file is not Always keep).
  await expect(media.getByText("Saved as lisbon-tram.webp", { exact: true })).toBeVisible();
  const forward = media.getByRole("checkbox", { name: "Keep the old address working", exact: true });
  await expect(forward).not.toBeChecked();
  await forward.check();
  await media.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(name).toHaveValue("lisbon-tram.webp");
  await expect(page.locator(".editor-toast__text")).toContainText("Its old address forwards to the new one.");
  await expect.poll(() => text(page, "_redirects")).toBe("/images/tram.webp /images/lisbon-tram.webp 301\n");
  await expect.poll(async () => (await text(page, "about/index.html")) ?? "").toContain('src="/images/lisbon-tram.webp"');
  await expect.poll(() => pageText(page, "index.html")).toContain('src="/images/lisbon-tram.webp"');
  await expect.poll(() => shownWidth(page)).toBe(40);
});

test("a taken name is said before saving, with the next numbered name to use", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const media = pane(page), name = media.getByLabel("File name", { exact: true });
  await media.getByRole("button", { name: "Details for images/tram.webp", exact: true }).click();
  await name.fill("lisbon");
  await expect(media.getByText("lisbon.webp is taken.", { exact: true })).toBeVisible();
  // A ⚠ glyph says it too, so the message is not colour only (slice 108).
  expect(await media.getByText("lisbon.webp is taken.", { exact: true }).evaluate(note => getComputedStyle(note, "::before").content)).toContain("⚠");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(media.getByRole("checkbox", { name: "Keep the old address working", exact: true })).toBeHidden();
  // Save while taken changes nothing and stays on the field.
  await media.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(name).toBeFocused();
  expect(await storedDraft(page, "index.html")).toBeUndefined();
  await media.getByRole("button", { name: "Use lisbon-2.webp", exact: true }).click();
  await expect(name).toHaveValue("lisbon-2.webp");
  await expect(media.getByText("lisbon.webp is taken.", { exact: true })).toBeHidden();
  await media.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(name).toHaveValue("lisbon-2.webp");
  await expect.poll(async () => (await text(page, "index.html")) ?? "").toContain('src="/images/lisbon-2.webp"');
  // No forwarding was asked for.
  expect(await storedDraft(page, "_redirects")).toBeUndefined();
});

test("Always keep ticks Keep the old address working, until it is changed by hand", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const media = pane(page);
  await media.getByRole("button", { name: "Details for images/tram.webp", exact: true }).click();
  await media.getByLabel("File name", { exact: true }).fill("old-tram");
  const forward = media.getByRole("checkbox", { name: "Keep the old address working", exact: true });
  const keep = media.getByRole("checkbox", { name: "Always keep", exact: true });
  await keep.check();
  await expect(forward).toBeChecked();
  await keep.uncheck();
  await expect(forward).not.toBeChecked();
  await forward.check(); await keep.check(); await keep.uncheck();
  await expect(forward).toBeChecked();
});

test("Replace everywhere with a picture in Media changes it on two pages with the version mark, in one Undo", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const media = pane(page);
  await expect.poll(() => shownWidth(page)).toBe(40);
  await media.getByRole("button", { name: "Details for images/tram.webp", exact: true }).click();
  await media.getByRole("button", { name: "Replace everywhere…", exact: true }).click();
  await expect(picker(page).getByText("Replace everywhere · tram.webp")).toBeVisible();
  // The picture being replaced cannot be its own replacement; SVGs are not offered.
  await picker(page).getByRole("button", { name: "Choose images/tram.webp", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker(page).locator(".media-library__message")).toContainText("That is the picture being replaced. Choose a different one.");
  await expect(picker(page).getByRole("button", { name: "Choose images/studio-desk.svg", exact: true })).toHaveCount(0);
  // Escape closes only the picker; the Media pane stays open on the file's details.
  await page.keyboard.press("Escape");
  await expect(picker(page)).toBeHidden();
  await expect(media.getByRole("button", { name: "Replace everywhere…", exact: true })).toBeVisible();
  await media.getByRole("button", { name: "Replace everywhere…", exact: true }).click();
  await picker(page).getByRole("button", { name: "Choose images/next.png", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker(page)).toBeHidden();
  // What will happen, then confirm.
  await expect(media.getByRole("heading", { name: "Replace tram.webp everywhere?", exact: true })).toBeFocused();
  // Slice 113: the box names the pages as links, then the address line, focus points and where the old picture goes.
  await expect(media.locator(".media-replace__shows")).toHaveText("Shows on: Home, About this project");
  await expect(media.locator(".media-replace__shows").getByRole("button")).toHaveCount(2);
  await expect(media.locator(".media-replace__line")).toHaveText([
    "Same name and address, so links from other sites show it too.",
    "Focus points go back to the middle.",
    "The old picture goes to Recently removed for 30 days.",
  ]);
  await expect(media.getByText("next.png also stays in Media as it is.", { exact: true })).toHaveCount(0);
  await expect(media.getByRole("checkbox", { name: "Keep the old address working", exact: true })).toHaveCount(0);
  // Cancel goes back to details; nothing changed.
  await media.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(media.getByRole("button", { name: "Replace everywhere…", exact: true })).toBeVisible();
  expect(await storedDraft(page, "index.html")).toBeUndefined();
  await media.getByRole("button", { name: "Back", exact: true }).click();
  await replaceWithNext(page);
  await expect(page.locator(".editor-toast__text")).toHaveText("tram.webp now shows the next picture on Home and About this project.");
  await expect(page.locator(".editor-toast").getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  // The same mark on both pages; the prepared picture brought its own 480 px copy.
  await expect.poll(async () => marked.exec((await text(page, "index.html")) ?? "")?.[1]).toBeTruthy();
  const version = marked.exec((await text(page, "index.html"))!)![1];
  expect(marked.exec((await text(page, "about/index.html")) ?? "")?.[1]).toBe(version);
  expect(await storedDraft(page, "images/tram-480.webp")).toBeDefined();
  await expect.poll(() => shownWidth(page)).toBe(600);
  // next.png stays in Media as it is.
  await media.getByRole("button", { name: "Back", exact: true }).click();
  await expect(media.getByRole("button", { name: "Details for images/next.png", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Pages", exact: true }).click(); await page.keyboard.press("Escape");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => pageText(page, "index.html")).toContain('src="/images/tram.webp"');
  await expect.poll(() => shownWidth(page)).toBe(40);
});

test("after Replace everywhere the canvas shows the new picture, and Publish puts its bytes at the old path on GitHub", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await expect.poll(() => shownWidth(page)).toBe(40);
  await replaceWithNext(page);
  await expect.poll(() => shownWidth(page)).toBe(600);
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  const published = await page.request.get(`${baseURL}/__demo/file?path=images/tram.webp`);
  expect(published.ok()).toBe(true);
  const bytes = Buffer.from(await published.body());
  // The new bytes at the old path, and every page's mark names exactly them.
  for (const path of ["index.html", "about/index.html"])
    expect(marked.exec(await (await page.request.get(`${baseURL}/__demo/file?path=${path}`)).text())?.[1]).toBe(mark(bytes));
  expect(await page.evaluate(async base64 => (await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))]))).width, bytes.toString("base64"))).toBe(600);
  expect((await page.request.get(`${baseURL}/__demo/file?path=images/tram-480.webp`)).ok()).toBe(true);
  // Published: no draft is left for it.
  expect(await storedDraft(page, "images/tram.webp")).toBeUndefined();
});

test("with Keep original on, a picture from Media keeps its own original when it replaces another, and stays as it is", async ({ page, baseURL }) => {
  await seed(page, baseURL, { ".editor/media.json": { content: '{"version":2,"collections":[],"files":{},"adding":{"keepOriginal":true}}' } });
  await replaceWithNext(page);
  await expect.poll(async () => Boolean(await storedDraft(page, "media/originals/tram.png"))).toBe(true);
  expect(await storedDraft(page, "images/next.png")).toBeUndefined();
});

test("replacing a picture an art-directed <picture> shows says it is now used on all screens", async ({ page, baseURL }) => {
  await seed(page, baseURL, { "about/index.html": { content: about.replace('<section class="prose"',
    '<picture><source media="(max-width: 600px)" srcset="/images/lisbon.webp"><img src="/images/tram.webp" alt="Tram"></picture>\n  <section class="prose"') } });
  await replaceWithNext(page);
  await expect(page.locator(".editor-toast__text")).toContainText("The new picture is now used on all screens.");
  await expect.poll(async () => (await text(page, "about/index.html")) ?? "").not.toContain("<picture");
});

test("Replace everywhere with a picture added in the picker: prepared, a new format forwarding when ticked, never added on its own", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const media = pane(page);
  await media.getByRole("button", { name: "Details for images/old.png", exact: true }).click();
  await media.getByRole("button", { name: "Replace everywhere…", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Photo.png", mimeType: "image/png", buffer: png(300, 200, [0, 0, 0], true) });
  const use = picker(page).getByRole("button", { name: "Use image", exact: true });
  await expect(use).toBeEnabled({ timeout: 30_000 });
  await use.click();
  await expect(media.getByRole("heading", { name: "Replace old.png everywhere?", exact: true })).toBeVisible();
  await expect(media.locator(".media-replace__line").first()).toHaveText("It's a WebP, so its address becomes /images/old.webp. Every mention is updated.");
  const forward = media.getByRole("checkbox", { name: "Keep the old address working", exact: true });
  await expect(forward).not.toBeChecked();
  await forward.check();
  await media.getByRole("button", { name: "Replace everywhere", exact: true }).click();
  await expect(media.getByLabel("File name", { exact: true })).toHaveValue("old.webp");
  await expect.poll(async () => (await text(page, "about/index.html")) ?? "").toMatch(/src="\/images\/old\.webp\?v=[0-9a-f]{8}"/);
  await expect.poll(() => text(page, "_redirects")).toBe("/images/old.png /images/old.webp 301\n");
  // The picked file became old.webp; it was not also added as photo.webp.
  await media.getByRole("button", { name: "Back", exact: true }).click();
  await expect(media.locator('.media-library__card[data-path="images/photo.webp"]')).toHaveCount(0);
  await expect(media.locator('.media-library__card[data-path="images/old.png"]')).toHaveCount(0);
});

test("the toast's Undo takes Replace everywhere back, and a page named in the confirm opens it", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const media = pane(page);
  await replaceWithNext(page);
  await expect.poll(async () => (await text(page, "index.html")) ?? "").toMatch(/src="\/images\/tram\.webp\?v=/);
  await page.locator(".editor-toast").getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => pageText(page, "index.html")).toContain('src="/images/tram.webp"');
  await expect.poll(async () => marked.test((await text(page, "about/index.html")) ?? "")).toBe(false);
  // The confirm's page names are links: About this project opens that page and closes the explorer.
  await media.getByRole("button", { name: "Back", exact: true }).click().catch(() => undefined);
  await media.getByRole("button", { name: "Details for images/tram.webp", exact: true }).click();
  await media.getByRole("button", { name: "Replace everywhere…", exact: true }).click();
  await picker(page).getByRole("button", { name: "Choose images/next.png", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await media.locator(".media-replace__shows").getByRole("button", { name: "About this project", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
  expect(await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))).toBe(false);
});

test("a new format with Keep the old address working off writes no forwarding, and the focus line shows", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const media = pane(page);
  await media.getByRole("button", { name: "Details for images/old.png", exact: true }).click();
  await media.getByRole("button", { name: "Replace everywhere…", exact: true }).click();
  await picker(page).getByRole("button", { name: "Choose images/next.png", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(media.getByRole("heading", { name: "Replace old.png everywhere?", exact: true })).toBeVisible();
  await expect(media.locator(".media-replace__line").first()).toHaveText("It's a WebP, so its address becomes /images/old.webp. Every mention is updated.");
  await expect(media.getByText("Focus points go back to the middle.", { exact: true })).toBeVisible();
  await expect(media.getByRole("checkbox", { name: "Keep the old address working", exact: true })).not.toBeChecked();
  await media.getByRole("button", { name: "Replace everywhere", exact: true }).click();
  await expect(media.getByLabel("File name", { exact: true })).toHaveValue("old.webp");
  await expect.poll(async () => (await text(page, "about/index.html")) ?? "").toMatch(/src="\/images\/old\.webp\?v=[0-9a-f]{8}"/);
  expect(await storedDraft(page, "_redirects")).toBeUndefined();
});

test("a page that shows only a Trimmed copy is named in the confirm and the toast, with the focus line", async ({ page, baseURL }) => {
  const record = { version: 2, collections: [], files: { "images/tram-crop.png": { trimmedFrom: { source: "images/tram.webp", trim: { x: 0, y: 0, width: 1, height: 1 } } } } };
  await seed(page, baseURL, {
    "images/tram-crop.png": { base64: png(20, 15, [200, 40, 40]).toString("base64") },
    "about/index.html": { content: about.replace('<section class="prose"', '<img class="about-image" src="/images/tram-crop.png" alt="Tram">\n  <section class="prose"') },
    ".editor/media.json": { content: JSON.stringify(record) },
  });
  const media = pane(page);
  await media.getByRole("button", { name: "Details for images/tram.webp", exact: true }).click();
  await media.getByRole("button", { name: "Replace everywhere…", exact: true }).click();
  await picker(page).getByRole("button", { name: "Choose images/next.png", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await expect(media.locator(".media-replace__shows")).toHaveText("Shows on: Home, About this project");
  await expect(media.getByText("Focus points go back to the middle.", { exact: true })).toBeVisible();
  await expect(media.getByText("1 trimmed copy of it is replaced by the new picture in the same shape.", { exact: true })).toBeVisible();
  await media.getByRole("button", { name: "Replace everywhere", exact: true }).click();
  await expect(page.locator(".editor-toast__text")).toHaveText("tram.webp now shows the next picture on Home and About this project.", { timeout: 30_000 });
});
