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

/** A PNG of one colour, or a smooth `gradient` (which WebP stores far smaller, so adding makes it a WebP). */
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
const tram = png(8, 6, [200, 40, 40]), next = png(12, 9, [40, 80, 200]);
/** The "new version" mark slice 53 puts on each mention: the first 8 hex of the Git blob SHA. */
const mark = (bytes: Buffer) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex").slice(0, 8);

/** Home and About both show images/tram.png; images/next.png is another picture in Media. */
async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  const files: Record<string, { content?: string; base64?: string }> = {
    "images/tram.png": { base64: tram.toString("base64") },
    "images/next.png": { base64: next.toString("base64") },
    "index.html": { content: home.replace('src="/images/placeholder.svg"', 'src="/images/tram.png"') },
    "about/index.html": { content: about.replace('<section class="prose"', '<img class="about-image" src="/images/tram.png" alt="Tram">\n  <section class="prose"') },
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

test("rename a used image in File details: the page still shows it, and the old address forwards when ticked", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const media = pane(page), name = media.getByLabel("File name", { exact: true });
  await media.getByRole("button", { name: "Details for images/tram.png", exact: true }).click();
  await name.fill("Lisbon Tram");
  // Before saving: the tidied name, and the tick box (unticked: the file is not Always keep).
  await expect(media.getByText("Saved as lisbon-tram.png", { exact: true })).toBeVisible();
  const forward = media.getByRole("checkbox", { name: "Keep the old address working", exact: true });
  await expect(forward).not.toBeChecked();
  await forward.check();
  await media.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(name).toHaveValue("lisbon-tram.png");
  await expect(media.locator(".media-library__message")).toContainText("Its old address forwards to the new one.");
  await expect.poll(() => text(page, "_redirects")).toBe("/images/tram.png /images/lisbon-tram.png 301\n");
  await expect.poll(async () => (await text(page, "about/index.html")) ?? "").toContain('src="/images/lisbon-tram.png"');
  await expect.poll(() => pageText(page, "index.html")).toContain('src="/images/lisbon-tram.png"');
  await expect.poll(() => shownWidth(page)).toBe(8);
});

test("a taken name is said before saving, with the next numbered name to use", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const media = pane(page), name = media.getByLabel("File name", { exact: true });
  await media.getByRole("button", { name: "Details for images/tram.png", exact: true }).click();
  await name.fill("next");
  await expect(media.getByText("next.png is taken.", { exact: true })).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(media.getByRole("checkbox", { name: "Keep the old address working", exact: true })).toBeHidden();
  // Save while taken changes nothing and stays on the field.
  await media.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(name).toBeFocused();
  expect(await storedDraft(page, "index.html")).toBeUndefined();
  await media.getByRole("button", { name: "Use next-2.png", exact: true }).click();
  await expect(name).toHaveValue("next-2.png");
  await expect(media.getByText("next.png is taken.", { exact: true })).toBeHidden();
  await media.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(name).toHaveValue("next-2.png");
  await expect.poll(async () => (await text(page, "index.html")) ?? "").toContain('src="/images/next-2.png"');
  // No forwarding was asked for.
  expect(await storedDraft(page, "_redirects")).toBeUndefined();
});

test("Always keep ticks Keep the old address working, until it is changed by hand", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const media = pane(page);
  await media.getByRole("button", { name: "Details for images/tram.png", exact: true }).click();
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
  await expect.poll(() => shownWidth(page)).toBe(8);
  await media.getByRole("button", { name: "Details for images/tram.png", exact: true }).click();
  await media.getByRole("button", { name: "Replace everywhere…", exact: true }).click();
  await expect(picker(page).getByText("Replace everywhere · tram.png")).toBeVisible();
  // The picture being replaced cannot be its own replacement.
  await picker(page).getByRole("button", { name: "Choose images/tram.png", exact: true }).click();
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
  await expect(media.getByRole("heading", { name: "Replace tram.png everywhere?", exact: true })).toBeFocused();
  await expect(media.getByText(/^2 pages show tram\.png\. They will show the new picture instead/)).toBeVisible();
  await expect(media.getByText("It keeps the name and address /images/tram.png. Visitors' browsers fetch the new picture at once.", { exact: true })).toBeVisible();
  await expect(media.getByRole("checkbox", { name: "Keep the old address working", exact: true })).toHaveCount(0);
  // Cancel goes back to details; nothing changed.
  await media.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(media.getByRole("button", { name: "Replace everywhere…", exact: true })).toBeVisible();
  expect(await storedDraft(page, "index.html")).toBeUndefined();
  await media.getByRole("button", { name: "Replace everywhere…", exact: true }).click();
  await picker(page).getByRole("button", { name: "Choose images/next.png", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await media.getByRole("button", { name: "Replace everywhere", exact: true }).click();
  await expect(media.locator(".media-library__message")).toContainText("Replaced tram.png everywhere on 2 pages, as a draft. The old picture is in More → Recently removed.");
  await expect(media.getByLabel("File name", { exact: true })).toHaveValue("tram.png");
  const marked = `src="/images/tram.png?v=${mark(next)}"`;
  await expect.poll(async () => (await text(page, "index.html")) ?? "").toContain(marked);
  await expect.poll(async () => (await text(page, "about/index.html")) ?? "").toContain(marked);
  await expect.poll(() => shownWidth(page)).toBe(12);
  // next.png stays in Media as it is.
  await media.getByRole("button", { name: "Back", exact: true }).click();
  await expect(media.getByRole("button", { name: "Details for images/next.png", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Pages", exact: true }).click(); await page.keyboard.press("Escape");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => pageText(page, "index.html")).toContain('src="/images/tram.png"');
  await expect.poll(() => shownWidth(page)).toBe(8);
});

test("after Replace everywhere the canvas shows the new picture, and Publish puts its bytes at the old path on GitHub", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const media = pane(page);
  await expect.poll(() => shownWidth(page)).toBe(8);
  await media.getByRole("button", { name: "Details for images/tram.png", exact: true }).click();
  await media.getByRole("button", { name: "Replace everywhere…", exact: true }).click();
  await picker(page).getByRole("button", { name: "Choose images/next.png", exact: true }).click();
  await picker(page).getByRole("button", { name: "Use image", exact: true }).click();
  await media.getByRole("button", { name: "Replace everywhere", exact: true }).click();
  await expect(media.getByLabel("File name", { exact: true })).toHaveValue("tram.png");
  await expect.poll(() => shownWidth(page)).toBe(12);
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  const published = await page.request.get(`${baseURL}/__demo/file?path=images/tram.png`);
  expect(published.ok()).toBe(true);
  expect(Buffer.from(await published.body()).equals(next)).toBe(true);
  for (const path of ["index.html", "about/index.html"])
    expect((await (await page.request.get(`${baseURL}/__demo/file?path=${path}`)).text())).toContain(`src="/images/tram.png?v=${mark(next)}"`);
  // Published: no draft is left for it.
  expect(await storedDraft(page, "images/tram.png")).toBeUndefined();
});

test("Replace everywhere with a picture added in the picker: prepared, a new format forwarding when ticked, never added on its own", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const media = pane(page);
  await media.getByRole("button", { name: "Details for images/tram.png", exact: true }).click();
  await media.getByRole("button", { name: "Replace everywhere…", exact: true }).click();
  await picker(page).locator('input[name="media-upload"]').setInputFiles({ name: "Photo.png", mimeType: "image/png", buffer: png(300, 200, [0, 0, 0], true) });
  const use = picker(page).getByRole("button", { name: "Use image", exact: true });
  await expect(use).toBeEnabled({ timeout: 30_000 });
  await use.click();
  await expect(media.getByRole("heading", { name: "Replace tram.png everywhere?", exact: true })).toBeVisible();
  await expect(media.getByText("The new picture is WEBP, so the address becomes /images/tram.webp. Every mention on the site is updated.", { exact: true })).toBeVisible();
  const forward = media.getByRole("checkbox", { name: "Keep the old address working", exact: true });
  await expect(forward).not.toBeChecked();
  await forward.check();
  await media.getByRole("button", { name: "Replace everywhere", exact: true }).click();
  await expect(media.getByLabel("File name", { exact: true })).toHaveValue("tram.webp");
  await expect.poll(async () => (await text(page, "index.html")) ?? "").toMatch(/src="\/images\/tram\.webp\?v=[0-9a-f]{8}"/);
  await expect.poll(async () => (await text(page, "about/index.html")) ?? "").toMatch(/src="\/images\/tram\.webp\?v=[0-9a-f]{8}"/);
  await expect.poll(() => text(page, "_redirects")).toBe("/images/tram.png /images/tram.webp 301\n");
  await expect.poll(() => shownWidth(page)).toBe(300);
  // The picked file became tram.webp; it was not also added as photo.webp.
  await media.getByRole("button", { name: "Back", exact: true }).click();
  await expect(media.locator('.media-library__card[data-path="images/photo.webp"]')).toHaveCount(0);
  await expect(media.locator('.media-library__card[data-path="images/tram.png"]')).toHaveCount(0);
});
