import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// A real two-second VP9 clip in MP4 (Playwright's Chromium has no H.264). Fixed bytes rather than a
// recording made during the test, which depended on frame timing and flaked under load.
const CLIP = readFileSync("tests/native-save/clip.mp4").toString("base64");

// Default fixture group: the editor's CSP is inherited by its canvas frame.
test("the canvas plays a blob MP4 without a media-src violation", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });

  const started = await frame.locator("body").evaluate(async (body, clip) => {
    const video = document.createElement("video");
    video.id = "media-policy-video";
    video.muted = true;
    video.playsInline = true;
    // Looping, so a slow check never finds it ended.
    video.loop = true;
    video.dataset.mediaViolations = "0";
    document.addEventListener("securitypolicyviolation", (event) => {
      if (event.effectiveDirective === "media-src") video.dataset.mediaViolations = String(Number(video.dataset.mediaViolations) + 1);
    });
    body.append(video);
    // Both Blob and object URL belong to the canvas frame's realm.
    video.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(clip), (c) => c.charCodeAt(0))], { type: "video/mp4" }));
    try {
      await video.play();
      return null;
    } catch (error) {
      return String(error);
    }
  }, CLIP);

  const video = frame.locator("#media-policy-video");
  try {
    expect(started).toBeNull();
    // Seconds actually played: counts however late the check runs.
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) =>
      Array.from({ length: el.played.length }, (_, i) => el.played.end(i) - el.played.start(i)).reduce((sum, part) => sum + part, 0))).toBeGreaterThan(0.2);
    await expect(video).toHaveAttribute("data-media-violations", "0");
  } finally {
    await video.evaluate((element: HTMLVideoElement) => {
      element.pause();
      URL.revokeObjectURL(element.src);
      element.remove();
    });
  }
});
