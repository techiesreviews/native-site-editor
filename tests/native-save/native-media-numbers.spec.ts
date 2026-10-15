// Default fixture group. Real playable bytes, deliberately stale recorded lengths.
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
const wav = () => {
  const samples = Math.round(41.9 * 8000), buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
};
const length = (seconds: number) => {
  const value = Math.floor(seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
};

// Slice 114: More's Improve images count is the screen's rows, and Length is the player's time.
test("Improve images' count and the details' lengths agree with what the screen and player show", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const picture = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 4000; canvas.height = 3000;
    canvas.getContext("2d")!.fillRect(0, 0, 4000, 3000);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const seed = async (data: { path: string; content?: string; base64?: string }) => {
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data })).ok()).toBe(true);
  };
  await seed({ path: "images/wide.png", base64: picture });
  await seed({ path: "index.html", content: '<!doctype html><html><head><title>Numbers</title></head><body><h1>Numbers</h1><img src="/images/wide.png" width="10" height="10" loading="lazy"></body></html>' });
  await seed({ path: "media/clip.mp4", base64: readFileSync("tests/native-save/clip.mp4").toString("base64") });
  await seed({ path: "media/song.wav", base64: wav().toString("base64") });
  await seed({ path: ".editor/media.json", content: JSON.stringify({ version: 2, collections: [], files: {
    "media/clip.mp4": { duration: 3 }, "media/song.wav": { duration: 42 },
  } }) });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  const improve = page.getByRole("menuitem", { name: "Improve images (1)", exact: true });
  await expect(improve).toBeVisible();
  await improve.click();
  await expect(pane(page).locator(".media-improve__row")).toHaveCount(1);
  await expect(pane(page).locator(".media-cleanup__sum")).toHaveText("1 to improve");
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();
  for (const path of ["media/clip.mp4", "media/song.wav"]) {
    const card = pane(page).locator(`[data-path="${path}"]`);
    await card.getByRole("button", { name: /^Details for/ }).click();
    const player = pane(page).locator(".media-detail__preview video, .media-detail__preview audio");
    await expect.poll(() => player.evaluate((element: HTMLMediaElement) => element.duration)).toBeGreaterThan(0);
    const duration = await player.evaluate((element: HTMLMediaElement) => element.duration);
    const value = length(duration);
    if (path.endsWith("wav")) expect(duration).toBeCloseTo(41.9, 1);
    await expect(pane(page).locator(".media-detail__facts div", { hasText: "Length" }).locator("dd")).toHaveText(value);
    await pane(page).getByRole("button", { name: "Back", exact: true }).click();
    await expect(card.locator(".media-library__fact")).toHaveText(value);
  }
});
