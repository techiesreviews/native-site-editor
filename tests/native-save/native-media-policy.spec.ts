import { expect, test } from "@playwright/test";

// Default fixture group: the editor's CSP is inherited by its canvas frame.
test("the canvas plays a blob MP4 without a media-src violation", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });

  const recording = await frame.locator("body").evaluate(async () => {
    const mimeType = ["video/mp4;codecs=vp9", "video/mp4;codecs=avc1", "video/mp4;codecs=av01"]
      .find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("This Chromium cannot record an MP4 with VP9, H.264 or AV1");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.addEventListener("dataavailable", (event) => chunks.push(event.data));
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.addEventListener("error", () => reject(new Error("MP4 recording failed")), { once: true });
    });
    let animation = 0;
    const start = performance.now();
    const draw = (now: number) => {
      context.fillStyle = now - start < 500 ? "red" : "blue";
      context.fillRect(0, 0, 64, 64);
      // Generate one second of actual frames, rather than waiting for page readiness.
      if (now - start >= 1000) recorder.stop();
      else animation = requestAnimationFrame(draw);
    };
    recorder.start();
    animation = requestAnimationFrame(draw);
    try {
      await stopped;
    } finally {
      cancelAnimationFrame(animation);
      for (const track of stream.getTracks()) track.stop();
    }
    const blob = new Blob(chunks, { type: mimeType });
    const video = document.createElement("video");
    video.id = "media-policy-video";
    video.muted = true;
    video.playsInline = true;
    video.dataset.mediaViolations = "0";
    document.addEventListener("securitypolicyviolation", (event) => {
      if (event.effectiveDirective === "media-src") {
        video.dataset.mediaViolations = String(Number(video.dataset.mediaViolations) + 1);
      }
    });
    document.body.append(video);
    // Both Blob and object URL belong to the canvas frame's realm.
    video.src = URL.createObjectURL(blob);
    let playError: string | null = null;
    try {
      await video.play();
    } catch (error) {
      playError = String(error);
    }
    return { mimeType: blob.type, size: blob.size, playError };
  });

  const video = frame.locator("#media-policy-video");
  try {
    expect(recording.mimeType).toMatch(/^video\/mp4/);
    expect(recording.size).toBeGreaterThan(0);
    expect(await video.getAttribute("data-media-violations")).toBe("0");
    expect(recording.playError).toBeNull();
    const initialTime = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(initialTime + 0.2);
    await expect(video).toHaveAttribute("data-media-violations", "0");
  } finally {
    await video.evaluate((element: HTMLVideoElement) => {
      element.pause();
      URL.revokeObjectURL(element.src);
      element.remove();
    });
  }
});
