import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { publishButton } from "./publish";
import { storedDraft } from "./drafts";

// Default fixture group: native-starter. Nightly only; slice 63 adds placement smoke coverage.
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
async function open(page: Page, baseURL: string | undefined, video: boolean | string = true) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const body = typeof video === "string" ? video : video ? VIDEO : "<p>Section words</p>";
  const source = `<!doctype html>\n<html lang="en">\n<head><title>Video page</title></head>\n<body>\n  <section id="scene">\n    <h1>Video page</h1>\n    ${body}\n  </section>\n</body>\n</html>`;
  for (const [path, content] of Object.entries({ "index.html": source, ".editor/media.json": JSON.stringify({ version: 2, collections: [], files: { "media/clip.mp4": { still: "images/placeholder.svg" } } }) })) {
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
test("selected video loops silently, saves with player, then returns to play with sound on tap", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const video = frame(page).locator("#scene > video");
  await expect(video).not.toHaveAttribute("controls");
  await video.click();
  const loop = bar(page).getByRole("checkbox", { name: "Looping video", exact: true });
  await expect(loop).not.toBeChecked();
  const before = await mounted(page);
  await loop.check();
  await expect.poll(() => mounted(page)).toContain("muted loop");
  // One Undo restores the page and removes every newly created player file.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(before);
  for (const path of ["scripts/media-player.js", "scripts/media-online.js", "styles/media-player.css"]) expect(await storedDraft(page, path)).toBeUndefined();
  await video.click();
  await bar(page).getByRole("checkbox", { name: "Looping video", exact: true }).check();
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
  await bar(page).getByRole("checkbox", { name: "Looping video", exact: true }).uncheck();
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
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.locator(".media-library__place")).toContainText("Background video");
  await picker.getByRole("button", { name: "Choose media/clip.mp4", exact: true }).click();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
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
});
