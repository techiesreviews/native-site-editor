// Default fixture group. Slice 115: placed video, audio and download cards in the editor canvas.
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
// Chooses an element of the (collapsed) section in Page structure.
const choose = async (page: Page, name: RegExp) => {
  const tree = page.getByRole("tree", { name: "Page structure" });
  const section = tree.getByRole("treeitem", { name: "Section", exact: true });
  if (await section.getAttribute("aria-expanded") !== "true") { await section.focus(); await page.keyboard.press("ArrowRight"); }
  await tree.getByRole("treeitem", { name }).click();
};
const wav = (seconds: number) => {
  const samples = Math.round(seconds * 8000), buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
};
const PAGE = `<!doctype html><html lang="en"><head><title>Placed</title>
<link rel="stylesheet" href="/styles/placed.css">
</head><body><header>Site</header><main><h1>Placed media</h1><p style="height:1200px">Words.</p>
<section class="flow">
<video src="/media/clip.mp4" controls preload="none" playsinline width="640" height="360" title="Clip"></video>
<audio src="/media/tour.wav" controls preload="none" data-duration="42" aria-label="Tour"></audio>
<a class="download-card" href="/media/list.pdf"><span class="download-card-name">Price list</span><span class="download-card-meta">PDF · 1 KB</span><span class="download-card-action">Open</span></a>
</section><p style="height:1200px">More words.</p></main></body></html>`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const seed = async (data: { path: string; content?: string; base64?: string }) => {
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data })).ok()).toBe(true);
  };
  await seed({ path: "media/clip.mp4", base64: readFileSync("tests/native-save/clip.mp4").toString("base64") });
  await seed({ path: "media/tour.wav", base64: wav(41.9).toString("base64") });
  await seed({ path: "media/list.pdf", content: "%PDF-1.1\n%%EOF\n" });
  await seed({ path: "styles/placed.css", content: "body{margin:0} header{position:sticky;top:0;height:56px;background:#eee} main{padding:0 24px} video{display:block;width:640px;height:360px;background:#335}" });
  await seed({ path: "index.html", content: PAGE });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await expect(frame(page).locator("audio")).toBeAttached();
});

test("the canvas audio shows its real length, and Play then Stop keeps it", async ({ page }) => {
  const audio = frame(page).locator("audio");
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.duration || 0), { timeout: 15_000 }).toBeCloseTo(41.9, 1);
  await expect(audio).toHaveAttribute("preload", "metadata");
  await expect(audio).toHaveAttribute("src", /^blob:/);
  // Still: nothing plays until the edit bar's Play.
  expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await choose(page, /^Audio/);
  await bar(page).getByRole("button", { name: "Play", exact: true }).click();
  await expect(bar(page).getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await bar(page).getByRole("button", { name: "Stop", exact: true }).click();
  await expect(bar(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(audio).toHaveAttribute("preload", "metadata");
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.duration || 0)).toBeCloseTo(41.9, 1);
});

test("the video's edit bar names its fields in plain words", async ({ page }) => {
  await choose(page, /^Video/);
  for (const name of ["Video file", "Still picture", "Title"]) await expect(bar(page).getByRole("button", { name, exact: true })).toBeVisible();
  for (const name of ["Video URL", "Poster URL"]) await expect(bar(page).getByRole("button", { name, exact: true })).toHaveCount(0);
});

test("the hover tag over any part of a download card says Download", async ({ page }) => {
  const meta = frame(page).locator(".download-card-meta");
  await meta.scrollIntoViewIfNeeded();
  await meta.hover();
  await expect(frame(page).locator('[data-native-selection-box="label"]')).toHaveText("Download");
  await frame(page).locator(".download-card").hover({ position: { x: 2, y: 2 } });
  await expect(frame(page).locator('[data-native-selection-box="label"]')).toHaveText("Download");
});

test("at 1280 a video chosen in Page structure shows with the edit bar above it, and its hover outline is its box", async ({ page }) => {
  const video = frame(page).locator("video");
  await video.scrollIntoViewIfNeeded();
  await video.hover({ position: { x: 30, y: 200 } });
  const hover = frame(page).locator('[data-native-selection-box="hover"]');
  await expect.poll(async () => {
    const [a, b] = [await hover.boundingBox(), await video.boundingBox()];
    return a && b ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) : Infinity;
  }).toBeLessThan(1.5);
  // Out of view, then chosen in Page structure: it is brought in with room above it for the bar.
  await frame(page).locator("h1").scrollIntoViewIfNeeded();
  await page.mouse.move(2, 790);
  await choose(page, /^Video/);
  await expect(bar(page)).toBeVisible();
  await expect(bar(page)).toHaveAttribute("data-side", "above");
  const [barBox, videoBox] = [await bar(page).boundingBox(), await video.boundingBox()];
  expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(videoBox!.y);
});
