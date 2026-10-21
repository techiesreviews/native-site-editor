import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { openEditor, openMedia } from "../support/scenarios";
import { publishButton } from "./publish";
import { storedDraft } from "./drafts";
import { openPickerOn } from "./open-picker";

// Default fixture group: native-starter. Add → Media placement is @smoke; the rest nightly.
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
const saved = async (page: Page, baseURL: string | undefined, path = "index.html") => {
  const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
  expect(response.ok()).toBe(true); return response.text();
};
const VIDEO = '<video src="/media/clip.mp4" poster="/images/placeholder.svg" controls preload="none" playsinline width="400" height="240" aria-label="Clip"><track kind="subtitles" src="/media/clip.vtt" srclang="en"></video>';
// A real two-second VP9 clip in MP4 (Playwright's Chromium has no H.264), shared with native-media-policy.spec.ts.
const CLIP = readFileSync("tests/native-save/clip.mp4").toString("base64");
async function open(page: Page, baseURL: string | undefined, video: boolean | string = true, extra: Record<string, string> = {}, files: Record<string, object> = {}) {
  await openEditor(page, baseURL);
  const body = typeof video === "string" ? video : video ? VIDEO : "<p>Section words</p>";
  const source = `<!doctype html>\n<html lang="en">\n<head><title>Video page</title></head>\n<body>\n<main>\n  <section id="scene">\n    <h1>Video page</h1>\n    ${body}\n  </section>\n</main>\n</body>\n</html>`;
  for (const [path, content] of Object.entries({ "index.html": source, ...extra, ".editor/media.json": JSON.stringify({ version: 2, collections: [], files: { "media/clip.mp4": { still: "images/placeholder.svg" }, ...files } }) })) {
    const response = await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
    expect(response.ok()).toBe(true);
  }
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "media/clip.mp4", base64: CLIP } })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator("#scene")).toBeVisible();
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached();
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
}
async function save(page: Page) {
  await expect(publishButton(page)).toBeEnabled();
  await publishButton(page).click();
  await expect(page.locator("#status")).toHaveText(/Up to date with main|Selected files saved to GitHub\./, { timeout: 30_000 });
  await expect(publishButton(page)).toBeDisabled();
}
/** The selected video's Media popup (slice 119) and its Loop silently switch. */
async function loopSwitch(page: Page) {
  await bar(page).getByRole("button", { name: "Media", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Video", exact: true });
  await expect(popup).toBeVisible();
  return popup.getByRole("switch", { name: "Loop silently", exact: true });
}
/** The Media block starts as a placeholder; Replace offers every media kind. */
async function replaceNewMedia(page: Page) {
  await page.getByRole("navigation", { name: "Blocks" }).getByRole("button", { name: "Media", exact: true }).click();
  const image = frame(page).locator('#scene > img[src$="placeholder.svg"], #scene > img[src^="data:image/svg+xml"]');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("dialog", { name: "Choose media", exact: true })).toHaveCount(0);
  const before = await mounted(page);
  await bar(page).locator(".edit-bar__media").click();
  await page.getByRole("dialog", { name: "Image", exact: true }).getByRole("button", { name: "Replace", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Choose media", exact: true })).toBeVisible();
  return before;
}
/** Replace the new Media block after the section's words. */
async function addMedia(page: Page, file: string, use: string) {
  await frame(page).locator("#scene p").click();
  const before = await replaceNewMedia(page);
  const picker = page.getByRole("dialog", { name: "Choose media", exact: true });
  await expect(picker.locator(".media-library__place")).toContainText("Replace media");
  await picker.getByRole("button", { name: `Choose ${file}`, exact: true }).click();
  await picker.getByRole("button", { name: use, exact: true }).click();
  await expect(picker).toHaveCount(0);
  return before;
}
test("Add → Media places a video with its still and the player; the canvas keeps it still; one Undo", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await open(page, baseURL, false);
  const before = await addMedia(page, "media/clip.mp4", "Use video");
  await expect.poll(() => mounted(page)).toContain('<video src="/media/clip.mp4" poster="/images/placeholder.svg" controls preload="none" playsinline width="320" height="180"></video>');
  const source = await mounted(page);
  expect(source).toContain('<script type="module" src="/scripts/media-player.js"></script>');
  expect(source).toContain('<link rel="stylesheet" href="/styles/media-player.css">');
  expect(await storedDraft(page, "scripts/media-player.js")).toBeDefined();
  // The canvas shows it still and selected: no controls, never playing.
  const video = frame(page).locator("#scene > video");
  await expect(video).toBeVisible();
  await expect(video).not.toHaveAttribute("controls");
  expect(await video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
  await expect(bar(page).getByRole("button", { name: "Media", exact: true })).toBeVisible();
  // One Undo restores the placeholder and takes back the head links and player files.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(before);
  for (const path of ["scripts/media-player.js", "scripts/media-online.js", "styles/media-player.css"]) expect(await storedDraft(page, path)).toBeUndefined();
});
test("Add → Media places an audio file with its length and a PDF card that opens; both stay still on the canvas", async ({ page, baseURL }) => {
  await open(page, baseURL, false, { "media/song.mp3": "seeded audio bytes", "media/price-list.pdf": "%PDF-1.4 seeded" },
    { "media/song.mp3": { duration: 75.4, description: { text: "Opening song" } }, "media/price-list.pdf": { still: "images/placeholder.svg" } });
  const beforeAudio = await addMedia(page, "media/song.mp3, 1:15", "Use audio");
  await expect.poll(() => mounted(page)).toContain('<audio src="/media/song.mp3" controls preload="none" data-duration="75" aria-label="Opening song"></audio>');
  const audio = frame(page).locator("#scene > audio");
  await expect(audio).toBeVisible();
  await audio.click();
  expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true);
  const withAudio = await mounted(page);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(beforeAudio);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(() => mounted(page)).toBe(withAudio);
  const beforeDownload = await addMedia(page, "media/price-list.pdf", "Use file");
  // The new card is selected, named for what it is.
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Download");
  await expect.poll(() => mounted(page)).toContain('<a class="download-card" href="/media/price-list.pdf"><img src="/images/placeholder.svg" alt="" width="320" height="180" loading="lazy" decoding="async"><span class="download-card-name">price-list</span><span class="download-card-meta">PDF · ');
  const source = await mounted(page);
  expect(source).toContain('<span class="download-card-action">Open</span></a>');
  expect(source).not.toMatch(/download-card"[^>]*\sdownload[\s>]/);
  expect(source.match(/src="\/scripts\/media-player.js"/g)).toHaveLength(1);
  expect(source.match(/href="\/styles\/media-player.css"/g)).toHaveLength(1);
  await expect(frame(page).locator("#scene .download-card")).toBeVisible();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(beforeDownload);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(() => mounted(page)).toBe(source);
  await save(page);
  expect(await saved(page, baseURL)).toContain('class="download-card"');
});
test("placeholder Replace accepts a picture; Cancel keeps the placeholder and one Undo restores it", async ({ page, baseURL }) => {
  await open(page, baseURL, false);
  await frame(page).locator("#scene p").click();
  const before = await replaceNewMedia(page);
  const picker = page.getByRole("dialog", { name: "Choose media", exact: true });
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toHaveCount(0);
  expect(await mounted(page)).toBe(before);
  await bar(page).locator(".edit-bar__media").click();
  await page.getByRole("dialog", { name: "Image", exact: true }).getByRole("button", { name: "Replace", exact: true }).click();
  await picker.getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect.poll(() => mounted(page)).toMatch(/<img[^>]*src="\/images\/studio-desk.svg"/);
  await expect(frame(page).locator("#scene > img")).toBeVisible();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(before);
});
for (const picture of ["existing", "uploaded"] as const) {
  test(`placeholder Replace keeps its class and Square shape for an ${picture} picture, one Undo`, async ({ page, baseURL }) => {
    await open(page, baseURL, '<img class="hero-image" src="/images/placeholder.svg" alt="Harbour at dawn" width="640" height="400" style="margin-left: 9px">');
    const image = frame(page).locator("#scene > img");
    await image.click();
    await bar(page).locator(".edit-bar__media").click();
    const popup = page.getByRole("dialog", { name: "Image", exact: true });
    await popup.getByRole("button", { name: /^Shape:/ }).click();
    await popup.getByRole("menuitemradio", { name: "Square", exact: true }).click();
    await popup.getByRole("button", { name: "Done", exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect.poll(() => mounted(page)).toContain("aspect-ratio: 1 / 1");
    await expect(image).toHaveCSS("aspect-ratio", "1 / 1");
    const before = await mounted(page);
    expect(before).toContain("aspect-ratio: 1 / 1");
    await bar(page).locator(".edit-bar__media").click();
    await popup.getByRole("button", { name: "Replace", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Choose media", exact: true });
    if (picture === "existing") {
      await picker.getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
    } else {
      await picker.locator("input[type=file]").setInputFiles({ name: "replacement.svg", mimeType: "image/svg+xml",
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="teal"/></svg>') });
      await expect(picker.locator(".media-library__chosen-name")).toHaveText("replacement.svg");
    }
    await picker.getByRole("button", { name: "Use image", exact: true }).click();
    await expect(picker).toHaveCount(0);
    await expect.poll(() => mounted(page)).toContain(picture === "existing" ? 'src="/images/studio-desk.svg"' : 'src="/media/images/replacement.svg"');
    await expect(image).toHaveClass("hero-image");
    await expect(image).toHaveAttribute("alt", "Harbour at dawn");
    await expect(image).toHaveCSS("aspect-ratio", "1 / 1");
    await expect(image).toHaveCSS("object-fit", "cover");
    await expect(image).toHaveCSS("margin-left", "9px");
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    if (picture === "uploaded") expect(await storedDraft(page, "media/images/replacement.svg")).toBeDefined();
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(() => mounted(page)).toBe(before);
    await expect(image).toHaveClass("hero-image");
    await expect(image).toHaveCSS("aspect-ratio", "1 / 1");
    if (picture === "uploaded") expect(await storedDraft(page, "media/images/replacement.svg")).toBeUndefined();
  });
}
test("a picture spot's picker offers videos too: a chosen video loops silently there, keeping the spot's slot and words", async ({ page, baseURL }) => {
  await open(page, baseURL, false);
  const at = (await mounted(page)).indexOf("<p>Section words</p>");
  await page.evaluate(async ({ at }) => (await import("/src/components/code-editor.ts")).replaceActiveRange({ path: "index.html", start: at, end: at, expected: "",
    text: '<img slot="photo" class="spot" src="/images/placeholder.svg" alt="Harbour at dawn" width="640" height="400">' }), { at });
  const spot = frame(page).locator("#scene img.spot");
  const picker = await openPickerOn(page, spot, "Choose image or video");
  await picker.getByRole("button", { name: "Choose media/clip.mp4", exact: true }).click();
  await expect(picker.locator(".media-library__chosen-name")).toHaveText("clip.mp4 · loops silently here");
  await picker.getByRole("button", { name: "Use video", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect.poll(() => mounted(page)).toContain('<video src="/media/clip.mp4" poster="/images/placeholder.svg" controls muted loop playsinline slot="photo" class="spot" width="640" height="400" aria-label="Harbour at dawn"></video>');
  expect(await mounted(page)).toContain('<script type="module" src="/scripts/media-player.js"></script>');
  // In a picture spot the video always loops silently.
  await frame(page).locator("#scene video").click();
  await expect(await loopSwitch(page)).toBeDisabled();
});
test("a placeholder in a picture spot keeps the spot's rule on Replace: a video loops silently there (as in the picture-spot test above); one Undo restores it", async ({ page, baseURL }) => {
  await open(page, baseURL, false);
  const at = (await mounted(page)).indexOf("<p>Section words</p>");
  await page.evaluate(async ({ at }) => (await import("/src/components/code-editor.ts")).replaceActiveRange({ path: "index.html", start: at, end: at, expected: "",
    text: '<img slot="photo" class="spot" src="/images/placeholder.svg" alt="Harbour at dawn" width="640" height="400">' }), { at });
  const before = await mounted(page);
  await frame(page).locator("#scene img.spot").click();
  await bar(page).locator(".edit-bar__media").click();
  await page.getByRole("dialog", { name: "Image", exact: true }).getByRole("button", { name: "Replace", exact: true }).click();
  // Not "Choose media": a picture spot takes a picture or a video (review P1, PR #108).
  const picker = page.getByRole("dialog", { name: "Choose image or video", exact: true });
  await picker.getByRole("button", { name: "Choose media/clip.mp4", exact: true }).click();
  await expect(picker.locator(".media-library__chosen-name")).toHaveText("clip.mp4 · loops silently here");
  await picker.getByRole("button", { name: "Use video", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect.poll(() => mounted(page)).toContain('<video src="/media/clip.mp4" poster="/images/placeholder.svg" controls muted loop playsinline slot="photo" class="spot" width="640" height="400" aria-label="Harbour at dawn"></video>');
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(before);
});
test("selected video loops silently, saves with player, then returns to play with sound on tap", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const video = frame(page).locator("#scene > video");
  await expect(video).not.toHaveAttribute("controls");
  await video.click();
  const loop = await loopSwitch(page);
  await expect(loop).not.toBeChecked();
  const before = await mounted(page);
  await loop.check();
  await expect.poll(() => mounted(page)).toContain("muted loop");
  // One Undo restores the page and removes every newly created player file.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(before);
  for (const path of ["scripts/media-player.js", "scripts/media-online.js", "styles/media-player.css"]) expect(await storedDraft(page, path)).toBeUndefined();
  await video.click();
  await (await loopSwitch(page)).check();
  await expect.poll(() => mounted(page)).toContain("muted loop");
  await save(page);
  const on = await saved(page, baseURL);
  expect(on).toMatch(/<video[^>]*playsinline[^>]*muted loop/);
  expect(on).not.toContain("autoplay");
  // The subtitles track stays, so switching looping off again loses nothing.
  expect(on).toContain('<track kind="subtitles" src="/media/clip.vtt" srclang="en">');
  expect(on).toContain('<script type="module" src="/scripts/media-player.js"></script>');
  expect(await saved(page, baseURL, "scripts/media-player.js")).toContain("Looping video");
  await video.click();
  await (await loopSwitch(page)).uncheck();
  await expect.poll(() => mounted(page)).toContain('preload="none"');
  await save(page);
  const off = await saved(page, baseURL);
  const tag = /<video[^>]*>/.exec(off)?.[0] ?? "";
  expect(tag).toContain('preload="none"');
  expect(tag).toContain("controls");
  expect(tag).toContain("playsinline");
  expect(tag).not.toMatch(/\b(?:muted|loop|autoplay)\b/);
  expect(off).toContain('<track kind="subtitles" src="/media/clip.vtt" srclang="en">');
  expect(off.match(/src="\/scripts\/media-player.js"/g)).toHaveLength(1);
});
test("section background picked from Media saves as first child with player; Remove removes it", async ({ page, baseURL }) => {
  await open(page, baseURL, false);
  // Escape from a selected text child selects its section parent.
  await frame(page).locator("#scene p").click();
  await page.keyboard.press("Escape");
  await bar(page).getByRole("button", { name: "Background video", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose video", exact: true });
  await expect(picker.locator(".media-library__place")).toContainText("Background video");
  await picker.getByRole("button", { name: "Choose media/clip.mp4", exact: true }).click();
  await picker.getByRole("button", { name: "Use video", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect.poll(() => mounted(page)).toContain('<video data-background src="/media/clip.mp4"');
  await save(page);
  const content = await saved(page, baseURL);
  expect(content).toMatch(/<section id="scene">\s*<video data-background src="\/media\/clip.mp4" poster="\/images\/placeholder.svg" muted loop playsinline preload="none"><\/video>/);
  expect(content).toContain('src="/scripts/media-player.js"');
  await expect(frame(page).locator("#scene > :first-child")).toHaveJSProperty("tagName", "VIDEO");
  await frame(page).locator("#scene p").click();
  await page.keyboard.press("Escape");
  await bar(page).getByRole("button", { name: "Remove background video", exact: true }).click();
  await expect.poll(() => mounted(page)).not.toContain("data-background");
  await save(page);
  expect(await saved(page, baseURL)).not.toContain("data-background");
});

// Seconds the browser has actually played, so a clip that already ended still counts.
const played = (media: Locator) => media.evaluate((el: HTMLMediaElement) =>
  Array.from({ length: el.played.length }, (_, i) => el.played.end(i) - el.played.start(i)).reduce((sum, part) => sum + part, 0));
test("Play in the edit bar plays the selected video on the canvas; Stop returns it to its still, writing nothing", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const video = frame(page).locator("#scene > video");
  const before = await mounted(page);
  await video.click();
  await bar(page).getByRole("button", { name: "Play", exact: true }).click();
  const stop = bar(page).getByRole("button", { name: "Stop", exact: true });
  await expect(stop).toBeVisible();
  await expect.poll(() => played(video)).toBeGreaterThan(0.2);
  await stop.click();
  await expect(bar(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
  // Back to its own address, still and paused; the page is unchanged.
  await expect(video).toHaveAttribute("src", "/media/clip.mp4");
  await expect(video).toHaveJSProperty("paused", true);
  expect(await mounted(page)).toBe(before);
  // Choosing something else stops it too.
  await bar(page).getByRole("button", { name: "Play", exact: true }).click();
  await expect(stop).toBeVisible();
  await frame(page).locator("#scene h1").click();
  await expect(video).toHaveAttribute("src", "/media/clip.mp4");
  await video.click();
  await expect(bar(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
});
test("Play on an Online video lays YouTube's own player over its place; Stop removes it", async ({ page, baseURL }) => {
  // YouTube is answered here; nothing reaches the service.
  await page.route("https://www.youtube-nocookie.com/**", route => route.fulfill({ contentType: "text/html", body: "<title>Stub player</title><p>Stub player</p>" }));
  await open(page, baseURL, '<a class="online-video" href="https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=1m30s"><img src="/images/placeholder.svg" alt="Big Buck Bunny" width="400" height="225"></a>');
  const link = frame(page).locator("#scene > a.online-video");
  await link.locator("img").click();
  await page.keyboard.press("Escape");
  await bar(page).getByRole("button", { name: "Play", exact: true }).click();
  const player = page.locator(".media-play-layer iframe");
  await expect(player).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ\?autoplay=1&.*start=90/);
  await expect(page.frameLocator(".media-play-layer iframe").getByText("Stub player")).toBeVisible();
  // It lies over the link's place on the canvas.
  const [shown, place] = [await player.boundingBox(), await link.boundingBox()];
  expect(Math.abs(shown!.x - place!.x)).toBeLessThan(2);
  expect(Math.abs(shown!.width - place!.width)).toBeLessThan(2);
  await bar(page).getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator(".media-play-layer")).toHaveCount(0);
  // Removed while it plays: its player goes with it, never left over another element.
  await bar(page).getByRole("button", { name: "Play", exact: true }).click();
  await expect(player).toBeVisible();
  await bar(page).getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(() => mounted(page)).not.toContain("online-video");
  await expect(page.locator(".media-play-layer")).toHaveCount(0);
});
// Video details (slice 66): a still from a moment or from Media, and subtitles, applied everywhere the video is used.
test("video details: a moment becomes the still, an .srt adds a track, a picture from Media replaces the still", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL, '<video src="/media/clip.mp4" poster="/images/placeholder.svg" controls preload="none" playsinline width="400" height="240" aria-label="Clip"></video>');
  await openMedia(page);
  const library = page.getByRole("region", { name: "Media", exact: true });
  await library.getByRole("button", { name: "Details for media/clip.mp4", exact: true }).click();
  const status = page.locator(".editor-toast__text");
  // A moment: the details player paused one second in.
  const player = library.locator(".media-detail__preview video");
  await player.evaluate(video => new Promise(resolve => {
    const element = video as HTMLVideoElement; element.addEventListener("seeked", resolve, { once: true }); element.currentTime = 1;
  }));
  await library.getByRole("button", { name: "Use this moment", exact: true }).click();
  await expect(status).toHaveText("Still picture changed everywhere the video is used.", { timeout: 20_000 });
  await expect.poll(() => mounted(page)).toContain('<video src="/media/clip.mp4" poster="/media/clip.webp" controls');
  await expect(library.locator(".media-detail__still")).toBeVisible();
  // An .srt: saved as WebVTT beside the video, with a track in the page's language.
  await library.locator('input[type="file"][accept=".vtt,.srt"]').setInputFiles({ name: "Clip.srt", mimeType: "application/x-subrip", buffer: Buffer.from("1\r\n00:00:00,100 --> 00:00:01,500\r\nHello there\r\n") });
  await expect(status).toHaveText("Subtitles added: the player shows a CC button.", { timeout: 20_000 });
  await expect.poll(() => mounted(page)).toContain('aria-label="Clip"><track kind="subtitles" src="/media/clip.vtt" srclang="en" label="English"></video>');
  await expect(library.getByRole("button", { name: "Replace subtitles clip.vtt", exact: true })).toBeVisible();
  // Any picture in Media can be the still instead.
  await library.getByRole("button", { name: "Choose picture…", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await picker.getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect.poll(() => mounted(page)).toContain('<video src="/media/clip.mp4" poster="/images/studio-desk.svg" controls');
  await expect(status).toHaveText("Still picture changed everywhere the video is used.");
  await save(page);
  const published = await saved(page, baseURL);
  expect(published).toContain('poster="/images/studio-desk.svg"');
  expect(published).toContain('<track kind="subtitles" src="/media/clip.vtt" srclang="en" label="English">');
  expect(await saved(page, baseURL, "media/clip.vtt")).toBe("WEBVTT\n\n1\n00:00:00.100 --> 00:00:01.500\nHello there\n");
  // The moment's still stays beside the video, in its family.
  const still = await page.request.get(`${baseURL}/__demo/file?path=media/clip.webp`);
  expect((await still.body()).subarray(8, 12).toString()).toBe("WEBP");
  expect(JSON.parse(await saved(page, baseURL, ".editor/media.json")).files["media/clip.mp4"]).toMatchObject({ still: "images/studio-desk.svg", subtitles: "media/clip.vtt" });
});
/** Add → Media's link field is behind a quiet text button in the One bar (slice 113); it opens with focus in the field. */
async function revealPaste(picker: Locator) {
  const reveal = picker.getByRole("button", { name: "Paste a YouTube or Vimeo link", exact: true });
  const address = picker.getByRole("textbox", { name: "YouTube or Vimeo link", exact: true });
  await expect(address).toBeHidden();
  await expect(reveal).toHaveAttribute("aria-expanded", "false");
  await reveal.click();
  await expect(reveal).toHaveAttribute("aria-expanded", "true");
  await expect(address).toBeFocused();
  await expect(picker.getByText("Works with YouTube and Vimeo", { exact: true })).toBeVisible();
  return address;
}
test("the paste field opens from its button and places a pasted Vimeo link; the footer says Use until a pick", async ({ page, baseURL }) => {
  await open(page, baseURL, false);
  // Vimeo answers nothing here: the video is placed without its picture.
  await page.route("https://vimeo.com/api/**", route => route.fulfill({ status: 404, body: "" }));
  await frame(page).locator("#scene p").click();
  await replaceNewMedia(page);
  const picker = page.getByRole("dialog", { name: "Choose media", exact: true });
  // No "Choose one file" line: an empty status and a disabled "Use".
  await expect(picker.locator(".media-library__chosen-text")).toHaveText("");
  await expect(picker.locator(".media-library__choice").getByRole("button", { name: "Use", exact: true })).toBeDisabled();
  const address = await revealPaste(picker);
  await address.fill("https://vimeo.com/76979871");
  await address.press("Enter");
  await expect(picker).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(() => mounted(page)).toContain('href="https://vimeo.com/76979871"');
});
// Online videos in the picker and Media (slice 68). YouTube's oEmbed and still are answered here.
test("Add → Media places a pasted YouTube address with its still and play button; Media lists it with the mark; placing again calls no service", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls: string[] = [];
  await open(page, baseURL, false);
  const still = await page.screenshot({ type: "jpeg", clip: { x: 0, y: 0, width: 640, height: 360 } });
  const cors = { "access-control-allow-origin": "*" };
  await page.route("https://www.youtube.com/oembed**", route => { calls.push(route.request().url()); return route.fulfill({ headers: cors, contentType: "application/json", body: JSON.stringify({ title: "Stub film" }) }); });
  await page.route("https://i.ytimg.com/**", route => { calls.push(route.request().url()); return route.fulfill({ headers: cors, contentType: "image/jpeg", body: still }); });
  await frame(page).locator("#scene p").click();
  const placeholder = await replaceNewMedia(page);
  const picker = page.getByRole("dialog", { name: "Choose media", exact: true });
  const address = await revealPaste(picker);
  const useLink = picker.locator(".media-library__online").getByRole("button", { name: "Use", exact: true });
  // An address of another site gets a short plain message inline, in place of the helper, and places nothing.
  await address.fill("https://example.com/watch?v=aqz-KE-bpKQ");
  await useLink.click();
  await expect(picker.locator(".media-library__online-note")).toHaveText("Only YouTube and Vimeo videos can be placed. Paste a YouTube or Vimeo address.");
  await expect(picker.getByText("Works with YouTube and Vimeo", { exact: true })).toBeHidden();
  await address.fill("https://youtu.be/aqz-KE-bpKQ");
  await useLink.click();
  await expect(picker).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(() => mounted(page)).toMatch(/<a class="online-video" href="https:\/\/www\.youtube\.com\/watch\?v=aqz-KE-bpKQ"><img src="\/media\/videos\/stub-film\.webp" alt="Stub film" width="640" height="360"><\/a>/);
  expect(await mounted(page)).toContain('<script type="module" src="/scripts/media-player.js"></script>');
  expect(await storedDraft(page, "scripts/media-online.js")).toBeDefined();
  // The canvas shows the copied still with the site's play button over it.
  const link = frame(page).locator("#scene a.online-video");
  await expect(link.locator("img")).toBeVisible();
  await expect.poll(() => link.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await link.evaluate(element => getComputedStyle(element, "::after").content)).not.toBe("none");
  // Selected as a Video, named by its still (no name prompt).
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Video");
  await expect(bar(page).getByText("Needs a name")).toHaveCount(0);
  const placed = await mounted(page);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(placeholder);
  expect(await storedDraft(page, "media/videos/stub-film.webp")).toBeUndefined();
  expect(await storedDraft(page, "scripts/media-online.js")).toBeUndefined();
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(() => mounted(page)).toBe(placed);
  // Media lists it under Video with the YouTube mark and the page that shows it.
  await openMedia(page);
  const library = page.getByRole("region", { name: "Media", exact: true });
  const tile = library.locator(".media-library__card.is-online");
  await expect(tile.locator(".media-library__service")).toHaveText("YouTube");
  await expect(tile.getByRole("button", { name: "Used on 1 page", exact: true })).toBeVisible();
  // The copied still belongs to the online tile under All and Video.
  const stillTile = library.locator('.media-library__card[data-path="media/videos/stub-film.webp"]');
  await library.getByRole("button", { name: /^Filter/ }).click();
  await page.getByRole("menuitemradio", { name: "All", exact: true }).click();
  await expect(tile).toBeVisible();
  await expect(stillTile).toHaveCount(0);
  await library.getByRole("button", { name: /^Filter/ }).click();
  await page.getByRole("menuitemradio", { name: "Video", exact: true }).click();
  await expect(tile).toBeVisible();
  await expect(stillTile).toHaveCount(0);
  await library.getByRole("button", { name: "Details for YouTube video Stub film", exact: true }).click();
  await expect(library.getByRole("heading", { name: "Video details", exact: true })).toBeVisible();
  await expect(library.getByRole("heading", { name: "Pages · 1", exact: true })).toBeVisible();
  await expect(library.getByRole("link", { name: "Open on YouTube", exact: true })).toHaveAttribute("href", "https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  await expect(library.getByRole("checkbox", { name: "Show Vimeo's own bar" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#explorer")).toBeHidden();
  // Placed again from the picker: no service call.
  const before = calls.length;
  await frame(page).locator("#scene p").click();
  await replaceNewMedia(page);
  await picker.getByRole("button", { name: "Choose YouTube video Stub film", exact: true }).click();
  await expect(picker.locator(".media-library__chosen-name")).toHaveText("Stub film · YouTube");
  await picker.getByRole("button", { name: "Use video", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect.poll(async () => (await mounted(page)).match(/class="online-video"/g)?.length).toBe(2);
  expect(calls.length).toBe(before);
  await save(page);
  expect(JSON.parse(await saved(page, baseURL, ".editor/media.json")).onlineVideos).toEqual([{ service: "youtube", id: "aqz-KE-bpKQ", title: "Stub film", still: "media/videos/stub-film.webp", stillCopied: true }]);
});
test("an online Vimeo video's details switch Vimeo's own bar on everywhere; Remove from Media leaves the page and the service alone", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls: string[] = [];
  await page.route(/vimeo/, route => { calls.push(route.request().url()); return route.abort(); });
  const link = '<a class="online-video" href="https://vimeo.com/76979871"><img src="/images/placeholder.svg" alt="Talk" width="400" height="225"></a>';
  await open(page, baseURL, link, {}, {});
  const records = { version: 2, collections: [], files: {}, onlineVideos: [{ service: "vimeo", id: "76979871", title: "Talk", still: "images/placeholder.svg" }] };
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: ".editor/media.json", content: JSON.stringify(records) } })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await openMedia(page);
  const library = page.getByRole("region", { name: "Media", exact: true });
  await expect(library.locator(".media-library__card.is-online .media-library__service")).toHaveText("Vimeo");
  await library.getByRole("button", { name: "Details for Vimeo video Talk", exact: true }).click();
  const bar = library.getByRole("checkbox", { name: "Show Vimeo's own bar", exact: true });
  await expect(bar).not.toBeChecked();
  await bar.check();
  await expect(page.locator(".editor-toast__text")).toHaveText("Vimeo's own bar shows everywhere the video is used.");
  await expect.poll(() => mounted(page)).toContain('<a class="online-video" href="https://vimeo.com/76979871" data-controls="service">');
  await expect(bar).toBeChecked();
  const before = await mounted(page);
  // Remove… is the ⋯ menu's last item, in red (slice 108).
  await library.getByRole("button", { name: "More for this file", exact: true }).click();
  const remove = page.getByRole("menuitem", { name: "Remove…", exact: true });
  await expect(remove).toHaveClass(/row-menu__danger/);
  await remove.click();
  await expect(library.getByText("Pages that show it keep it (1 page). Vimeo is not contacted, and the video stays there.")).toBeVisible();
  await library.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator(".editor-toast__text")).toHaveText("Talk was removed from Media.");
  await expect(library.locator(".media-library__card.is-online")).toHaveCount(0);
  expect(await mounted(page)).toBe(before);
  expect(calls).toEqual([]);
});
// The site's player files go in as text with a file added inside the picker (slice 68's fix): as uploads,
// the preview's stylesheet reader looped on the new media-player.css and the editor froze.
test("a video added inside Add → Media's picker is placed with the player as text files; the editor stays responsive; one Undo", async ({ page, baseURL }) => {
  await open(page, baseURL, false);
  await frame(page).locator("#scene p").click();
  const before = await replaceNewMedia(page);
  const picker = page.getByRole("dialog", { name: "Choose media", exact: true });
  await picker.locator(".media-library__upload-input").setInputFiles({ name: "walk.mp4", mimeType: "video/mp4", buffer: Buffer.from(CLIP, "base64") });
  // Playwright's Chromium cannot encode it again: it is added unchanged.
  await page.getByRole("button", { name: "Add unchanged", exact: true }).click({ timeout: 60_000 });
  const use = picker.getByRole("button", { name: "Use video", exact: true });
  await expect(use).toBeEnabled({ timeout: 60_000 });
  await use.click();
  await expect(picker).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => mounted(page)).toMatch(/<video src="\/media\/[^"]*walk[^"]*\.(?:mp4|webm)"/);
  expect(await mounted(page)).toContain('<link rel="stylesheet" href="/styles/media-player.css">');
  // Text drafts, so the canvas reads the stylesheet; the editor still answers.
  expect(await storedDraft(page, "styles/media-player.css")).toMatchObject({ content: expect.stringContaining(".online-video") });
  await expect(frame(page).locator("#scene video")).toBeVisible();
  await expect(page.locator("#status")).toBeVisible();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(before);
  for (const path of ["scripts/media-player.js", "scripts/media-online.js", "styles/media-player.css"]) expect(await storedDraft(page, path)).toBeUndefined();
});
test("a video added inside the background picker is placed with the player as text files; the editor stays responsive", async ({ page, baseURL }) => {
  await open(page, baseURL, false);
  await frame(page).locator("#scene p").click();
  await page.keyboard.press("Escape");
  await bar(page).getByRole("button", { name: "Background video", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose video", exact: true });
  await picker.locator(".media-library__upload-input").setInputFiles({ name: "walk.mp4", mimeType: "video/mp4", buffer: Buffer.from(CLIP, "base64") });
  await page.getByRole("button", { name: "Add unchanged", exact: true }).click({ timeout: 60_000 });
  const use = picker.getByRole("button", { name: "Use video", exact: true });
  await expect(use).toBeEnabled({ timeout: 60_000 });
  await use.click();
  await expect(picker).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => mounted(page)).toMatch(/<video data-background src="\/media\/[^"]*walk/);
  expect(await storedDraft(page, "styles/media-player.css")).toMatchObject({ content: expect.stringContaining(".online-video") });
  await expect(frame(page).locator("#scene > :first-child")).toHaveJSProperty("tagName", "VIDEO");
});
