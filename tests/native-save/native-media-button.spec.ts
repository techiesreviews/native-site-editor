// Default fixture group: native-starter. Slice 119: one Media button for every media spot, opening
// one popup shaped by what the spot holds (in slice 109's frame); Replace for a picture spot's video.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
const CLIP = readFileSync("tests/native-save/clip.mp4").toString("base64");
const BODY = `
    <video class="clip" src="/media/clip.mp4" poster="/images/placeholder.svg" controls preload="none" playsinline width="400" height="240" aria-label="Clip"></video>
    <audio src="/media/song.mp3" controls preload="none" aria-label="Song"></audio>
    <a class="download-card" href="/media/list.pdf"><span class="download-card-name">Price list</span><span class="download-card-meta">PDF · 1 KB</span><span class="download-card-action">Open</span></a>
    <a class="online-video" href="https://vimeo.com/76979871"><img src="/images/placeholder.svg" alt="Talk" width="400" height="225"></a>
    <video slot="photo" class="spot" style="aspect-ratio:1/1;object-fit:cover" src="/media/clip.mp4" poster="/images/placeholder.svg" controls muted loop playsinline width="300" height="300" aria-label="Harbour"></video>
    <img slot="hero" class="pic" src="/images/placeholder.svg" alt="Desk" width="320" height="200">
    <img slot="empty" class="empty" src="" alt="" width="200" height="120" style="background:#ccc">`;

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const source = `<!doctype html>\n<html lang="en">\n<head><title>Media page</title></head>\n<body>\n<main>\n  <section id="scene">\n    <h1>Media page</h1>${BODY}\n  </section>\n</main>\n</body>\n</html>`;
  const records = { version: 2, collections: [], files: { "media/clip.mp4": { still: "images/placeholder.svg" } },
    onlineVideos: [{ service: "vimeo", id: "76979871", title: "Talk", still: "images/placeholder.svg" }] };
  for (const data of [{ path: "index.html", content: source }, { path: ".editor/media.json", content: JSON.stringify(records) },
    { path: "media/clip.mp4", base64: CLIP }, { path: "media/other.mp4", base64: CLIP }, { path: "media/song.mp3", content: "seeded audio bytes" },
    { path: "media/list.pdf", content: "%PDF-1.4 seeded" }])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator("#scene")).toBeVisible();
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached();
}
/** Selects a spot by its Page structure row (its kind, then its slot) and presses its Media button; the popup it opens. */
async function media(page: Page, row: RegExp, title: string, nth = 0) {
  await select(page, row, nth);
  const button = bar(page).locator(".edit-bar__media");
  await expect(button).toHaveText(/^Media/);
  await button.click();
  const popup = page.getByRole("dialog", { name: title, exact: true });
  await expect(popup).toBeVisible();
  return popup;
}
async function select(page: Page, row: RegExp, nth = 0) {
  const tree = page.getByRole("tree", { name: "Page structure" }), section = tree.getByRole("treeitem", { name: /^Section/ }).first();
  if (await section.getAttribute("aria-expanded") !== "true") { await section.focus(); await page.keyboard.press("ArrowRight"); }
  // Rows of the scene in order: Video (clip), Audio, Price list, Video (online), Video (spot), Image (hero), Image (empty).
  await tree.getByRole("treeitem", { name: row }).nth(nth).click();
  await expect(bar(page)).toBeVisible();
}
async function choose(page: Page, title: string, file: string, use: string) {
  const picker = page.getByRole("dialog", { name: title, exact: true });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: `Choose ${file}`, exact: true }).click();
  await picker.getByRole("button", { name: use, exact: true }).click();
  await expect(picker).toHaveCount(0);
}

test.beforeEach(async ({ page, baseURL }) => { await open(page, baseURL); });

test("Media on a picture opens the Image popup; on an empty picture spot it adds media", async ({ page }) => {
  const popup = await media(page, /^Image/, "Image");
  await expect(popup.getByRole("button", { name: "Replace", exact: true })).toBeVisible();
  // The bar's plain name tab is not repeated above the Media button.
  await expect(bar(page).locator(".edit-bar__label")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await select(page, /^Image/, 1);
  await bar(page).locator(".edit-bar__media").click();
  await choose(page, "Choose image or video", "images/placeholder.svg", "Use image");
  await expect.poll(() => mounted(page)).toMatch(/<img [^>]*src="\/images\/placeholder\.svg"[^>]*slot="empty" class="empty"|<img [^>]*slot="empty" class="empty"[^>]*src="\/images\/placeholder\.svg"/);
});

test("a looping video in a picture spot: Replace with another video, then with a picture, keeps the spot", async ({ page }) => {
  const popup = await media(page, /^Video/, "Video", 2);
  await expect(popup.getByRole("switch", { name: "Loop silently", exact: true })).toBeDisabled();
  await expect(popup.getByText("A video in a picture spot always loops silently.")).toBeVisible();
  await popup.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await choose(page, "Choose image or video", "media/other.mp4", "Use video");
  await expect.poll(() => mounted(page)).toContain('<video src="/media/other.mp4" controls muted loop playsinline slot="photo" class="spot" style="aspect-ratio:1/1;object-fit:cover" width="300" height="300" aria-label="Harbour"></video>');
  const again = await media(page, /^Video/, "Video", 2);
  await again.getByRole("button", { name: "Replace", exact: true }).click();
  await choose(page, "Choose image or video", "images/placeholder.svg", "Use image");
  await expect.poll(() => mounted(page)).toMatch(/<img [^>]*slot="photo"/);
  const source = await mounted(page), img = /<img [^>]*slot="photo"[^>]*>/.exec(source)?.[0] ?? "";
  for (const kept of ['class="spot"', 'style="aspect-ratio:1/1;object-fit:cover"', 'alt="Harbour"', 'src="/images/placeholder.svg"']) expect(img).toContain(kept);
  expect(source).not.toContain("/media/other.mp4");
  // One Undo takes the picture back to the video.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toContain('<video src="/media/other.mp4"');
});

test("a video's Media popup: Loop silently, Title, Use this moment and Subtitles; the bar has no address fields", async ({ page }) => {
  await select(page, /^Video/);
  for (const name of ["Video file", "Still picture", "Title"]) await expect(bar(page).getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(bar(page).getByRole("checkbox", { name: "Looping video", exact: true })).toHaveCount(0);
  const popup = await media(page, /^Video/, "Video");
  await popup.getByRole("switch", { name: "Loop silently", exact: true }).check();
  await expect.poll(() => mounted(page)).toMatch(/<video class="clip"[^>]*muted loop/);
  await expect(popup).toBeVisible();
  const title = popup.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("Studio clip");
  await title.press("Enter");
  await expect.poll(() => mounted(page)).toContain('aria-label="Studio clip"');
  // Use this moment: the paused frame becomes the still, everywhere the video is used.
  const player = popup.locator("video");
  await expect.poll(() => player.evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  await popup.getByRole("button", { name: "Use this moment", exact: true }).click();
  await expect.poll(() => mounted(page), { timeout: 15_000 }).toContain('poster="/media/clip.webp"');
  await popup.locator('input[type="file"]').setInputFiles({ name: "clip.vtt", mimeType: "text/vtt", buffer: Buffer.from("WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n") });
  await expect.poll(() => mounted(page)).toContain('<track kind="subtitles" src="/media/clip.vtt"');
  await expect(popup.getByRole("button", { name: "Remove subtitles", exact: true })).toBeVisible();
  await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(popup).toHaveCount(0);
});

test("audio, a download and an Online video: Title, the card's name, Vimeo's own bar and Replace", async ({ page }) => {
  const audio = await media(page, /^Audio/, "Audio");
  const title = audio.getByRole("textbox", { name: "Title", exact: true });
  await expect(title).toHaveValue("Song");
  await title.fill("Opening song");
  await title.press("Enter");
  await expect.poll(() => mounted(page)).toContain('<audio src="/media/song.mp3" controls preload="none" aria-label="Opening song"></audio>');
  await page.keyboard.press("Escape");

  const card = await media(page, /Price list/, "Download");
  const name = card.getByRole("textbox", { name: "Title", exact: true });
  await expect(name).toHaveValue("Price list");
  await name.fill("Prices 2026");
  await name.press("Enter");
  await expect.poll(() => mounted(page)).toContain('<span class="download-card-name">Prices 2026</span>');
  await page.keyboard.press("Escape");

  const online = await media(page, /^Video/, "Online video", 1);
  await online.getByRole("switch", { name: "Show Vimeo's own bar", exact: true }).check();
  await expect.poll(() => mounted(page)).toContain('<a class="online-video" href="https://vimeo.com/76979871" data-controls="service">');
  await page.keyboard.press("Escape");

  // Replace on audio: any media takes its place, as one Undo step.
  const again = await media(page, /^Audio/, "Audio");
  await again.getByRole("button", { name: "Replace", exact: true }).click();
  await choose(page, "Choose media", "media/list.pdf", "Use file");
  await expect.poll(() => mounted(page)).not.toContain("<audio");
  expect(await mounted(page)).toMatch(/<a class="download-card" href="\/media\/list\.pdf">[\s\S]*<a class="download-card" href="\/media\/list\.pdf">/);
});
