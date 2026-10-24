// Default fixture group. Slice 115: placed video, audio and download cards in the editor canvas.
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

test.use({ viewport: { width: 1280, height: 800 } });

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
// Chooses an element in Page structure, opening the (collapsed) rows on its way.
const choose = async (page: Page, name: RegExp, open = ["Section"]) => {
  const tree = page.getByRole("tree", { name: "Page structure" });
  for (const row of open) {
    const item = tree.getByRole("treeitem", { name: row, exact: true });
    if (await item.getAttribute("aria-expanded") !== "true") { await item.focus(); await page.keyboard.press("ArrowRight"); }
  }
  await tree.getByRole("treeitem", { name }).first().click();
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
<audio controls preload="none" aria-label="Talk"><source src="/media/talk.wav" type="audio/wav"></audio>
<a class="download-card" href="/media/list.pdf"><span class="download-card-name">Price list</span><span class="download-card-meta">PDF · 1 KB</span><span class="download-card-action">Open</span></a>
<div class="scroller"><p class="spacer">Inside.</p><video src="/media/clip.mp4" width="320" height="180" title="Inner"></video><div class="sideways"><p class="wide">Wide.</p><video src="/media/clip.mp4" width="320" height="180" title="Side"></video></div></div>
</section><p style="height:1200px">More words.</p></main></body></html>`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const seed = async (data: { path: string; content?: string; base64?: string }) => {
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data })).ok()).toBe(true);
  };
  await seed({ path: "media/clip.mp4", base64: readFileSync("tests/native-save/clip.mp4").toString("base64") });
  await seed({ path: "media/tour.wav", base64: wav(41.9).toString("base64") });
  await seed({ path: "media/talk.wav", base64: wav(12.5).toString("base64") });
  await seed({ path: "media/list.pdf", content: "%PDF-1.1\n%%EOF\n" });
  await seed({ path: "styles/placed.css", content: "body{margin:0} header{position:sticky;top:0;height:56px;background:#eee} main{padding:0 24px} video{display:block;width:640px;height:360px;background:#335} .scroller{height:300px;overflow:auto} .spacer{height:800px} .scroller video{width:320px;height:180px} .sideways{display:flex;overflow-x:auto;width:400px} .wide{flex:0 0 900px} .sideways video{flex:0 0 320px}" });
  await seed({ path: "index.html", content: PAGE });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await expect(frame(page).locator("audio").first()).toBeAttached();
});

test("the canvas audio shows its real length, and Play then Stop keeps it", async ({ page }) => {
  const audio = frame(page).locator('audio[aria-label="Tour"]');
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

test("the video's edit bar leads with Media; its file, still and title live in the Media popup", async ({ page }) => {
  await choose(page, /^Video/);
  await expect(bar(page).locator(".edit-bar__media")).toHaveText("Media");
  // Media leads the controls: nothing but the drag grip stands before it.
  expect(await bar(page).locator(".edit-bar__button:not(.edit-bar__handle)").first().textContent()).toBe("Media");
  for (const name of ["Video file", "Still picture", "Title", "Video URL", "Poster URL"]) await expect(bar(page).getByRole("button", { name, exact: true })).toHaveCount(0);
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
  const video = frame(page).locator('video[title="Clip"]');
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

test("an audio written with a <source> shows its real length too", async ({ page }) => {
  const talk = frame(page).locator('audio[aria-label="Talk"]');
  await expect.poll(() => talk.evaluate((el: HTMLAudioElement) => el.duration || 0), { timeout: 15_000 }).toBeCloseTo(12.5, 1);
  await expect(talk).toHaveAttribute("preload", "metadata");
  await expect(talk.locator("source")).toHaveAttribute("src", /^blob:/);
});

test("an audio whose file arrives while it plays keeps its real length after Stop", async ({ page, baseURL }) => {
  // The canvas's read of the file is held back until the edit bar's Play has started.
  const size = wav(41.9).length;
  let held = false, release!: () => void;
  const playing = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/blob?*", async route => {
    const response = await route.fetch();
    const body = await response.body();
    if (body.length === size && !held) { held = true; await playing; }
    await route.fulfill({ response, body });
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main");
  // The code editor's late arrival renders the page again, which stops a play under way.
  await editorMounted(page);
  const audio = frame(page).locator('audio[aria-label="Tour"]');
  await choose(page, /^Audio/);
  await bar(page).getByRole("button", { name: "Play", exact: true }).click();
  await expect(bar(page).getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => !el.paused || el.muted)).toBe(true);
  release();
  await expect.poll(() => held).toBe(true);
  await expect(audio).toHaveAttribute("preload", "auto");
  // fixed-wait: the file reaching the canvas while Play's own address is on the audio shows nothing to wait on.
  await page.waitForTimeout(1000);
  await bar(page).getByRole("button", { name: "Stop", exact: true }).click();
  await expect(audio).toHaveAttribute("preload", "metadata");
  await expect(audio).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.duration || 0), { timeout: 15_000 }).toBeCloseTo(41.9, 1);
});

// A render during Play (here the code editor arriving late) keeps the audio playing, and the bar on Stop.
test("a render while the audio plays keeps it playing, the bar saying Stop", async ({ page, baseURL }) => {
  let release!: () => void;
  const editorHeld = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => /monaco/.test(url.href), async route => { await editorHeld; await route.continue(); });
  // In the canvas, ahead of the preview runtime's own listener: the renders it is sent.
  await page.addInitScript(() => {
    const w = window as Window & { renders?: number };
    w.renders = 0;
    w.addEventListener("message", (e) => { if ((e.data as { type?: string } | null)?.type === "update") w.renders! += 1; });
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const audio = frame(page).locator('audio[aria-label="Tour"]');
  const renders = () => audio.evaluate(() => (window as Window & { renders?: number }).renders!);
  await choose(page, /^Audio/);
  await bar(page).getByRole("button", { name: "Play", exact: true }).click();
  await expect(bar(page).getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => !el.paused)).toBe(true);
  const before = await renders();
  release();
  await editorMounted(page);
  await expect.poll(renders).toBeGreaterThan(before);
  // Rendered again: still playing from Play's own address, and the bar offers Stop.
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(false);
  await expect(audio).toHaveAttribute("preload", "auto");
  await expect(bar(page).getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await bar(page).getByRole("button", { name: "Stop", exact: true }).click();
  await expect(bar(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await expect(audio).toHaveAttribute("preload", "metadata");
});

test("a video inside a scrolling box, chosen in Page structure, is scrolled into view in that box", async ({ page }) => {
  const inner = frame(page).locator('video[title="Inner"]');
  const scroller = frame(page).locator(".scroller");
  await frame(page).locator("h1").scrollIntoViewIfNeeded();
  await choose(page, /^Video/, ["Section", "Block"]);
  // The second Video row is the one in the box.
  await page.getByRole("tree", { name: "Page structure" }).getByRole("treeitem", { name: /^Video/ }).nth(1).click();
  await expect.poll(async () => {
    const [a, b] = [await inner.boundingBox(), await scroller.boundingBox()];
    return Boolean(a && b && a.y >= b.y - 1 && a.y + a.height <= b.y + b.height + 1);
  }).toBe(true);
  await expect(inner).toBeInViewport({ ratio: 0.9 });
});

test("a video clipped sideways in a scrolling box, chosen in Page structure, is scrolled into view", async ({ page }) => {
  const side = frame(page).locator('video[title="Side"]');
  const box = frame(page).locator(".sideways");
  const tree = page.getByRole("tree", { name: "Page structure" });
  await choose(page, /^Video/, ["Section", "Block"]);
  const sideways = tree.getByRole("treeitem", { name: "Block", exact: true }).nth(1);
  if (await sideways.getAttribute("aria-expanded") !== "true") { await sideways.focus(); await page.keyboard.press("ArrowRight"); }
  await tree.getByRole("treeitem", { name: /^Video/ }).nth(2).click();
  await expect.poll(async () => {
    const [a, b] = [await side.boundingBox(), await box.boundingBox()];
    return Boolean(a && b && a.x >= b.x - 1 && a.x + a.width <= b.x + b.width + 1);
  }).toBe(true);
  await expect(side).toBeInViewport({ ratio: 0.9 });
});

test("an audio whose <source> changes to a file already read loads that file's length", async ({ page }) => {
  const talk = frame(page).locator('audio[aria-label="Talk"]');
  await expect.poll(() => talk.evaluate((el: HTMLAudioElement) => el.duration || 0), { timeout: 15_000 }).toBeCloseTo(12.5, 1);
  await expect.poll(() => frame(page).locator('audio[aria-label="Tour"]').evaluate((el: HTMLAudioElement) => el.duration || 0), { timeout: 15_000 }).toBeCloseTo(41.9, 1);
  const before = await talk.evaluate((el: HTMLAudioElement) => el.currentSrc);
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: before.replace("/media/talk.wav", "/media/tour.wav") });
  });
  await expect.poll(() => talk.evaluate((el: HTMLAudioElement) => el.currentSrc)).not.toBe(before);
  await expect.poll(() => talk.evaluate((el: HTMLAudioElement) => el.duration || 0), { timeout: 15_000 }).toBeCloseTo(41.9, 1);
});
