import { test, expect, type Page } from "@playwright/test";
import { imageResult } from "../../src/page-builder/image-sizes";
import { readFrameMessage } from "../../src/components/preview-protocol";
import { HOST_SOURCE, FRAME_SOURCE } from "../../src/components/preview-wire";

async function measure(page: Page, request: { path: string; node: number[] }) {
  // fixed-wait: Timeout bounds a missing protocol reply; the test resolves on the observable message, with no sleep.
  const raw = await page.evaluate(({ host, frame, request }) => new Promise<unknown>((resolve, reject) => {
    const preview = document.querySelector<HTMLIFrameElement>(".native-preview-frame");
    if (!preview?.contentWindow) { reject(new Error("Missing preview")); return; }
    const id = 10000000;
    const timeout = setTimeout(() => { window.removeEventListener("message", receive); reject(new Error("Image measurement did not answer")); }, 8000);
    function receive(event: MessageEvent) {
      if (event.source !== preview?.contentWindow || event.data?.source !== frame || event.data?.type !== "image-measured" || event.data?.id !== id) return;
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      resolve(event.data);
    }
    window.addEventListener("message", receive);
    preview.contentWindow.postMessage({ source: host, type: "measure-image", id, request }, "*");
  }), { host: HOST_SOURCE, frame: FRAME_SOURCE, request });
  const reply = readFrameMessage(raw);
  expect(reply?.type).toBe("image-measured");
  if (reply?.type !== "image-measured") throw new Error(JSON.stringify(reply));
  return reply.report;

}

// Default fixture group: native-starter. Untagged measurement coverage runs nightly.
test("preview measures a responsive starter hero without resizing the visible frame", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const preview = page.frameLocator(".native-preview-frame");
  const hero = preview.locator("img.hero-image");
  await expect(hero).toBeVisible();
  await expect.poll(() => hero.evaluate((image) => image instanceof HTMLImageElement && image.naturalWidth)).toBeGreaterThan(0);
  // Starter's placeholder has a fixed 160px width. Give this draft a
  // responsive layout and a nested site breakpoint; leave the fixture intact.
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const text = editor.getMountedSource("index.html");
    if (text === undefined) throw new Error("Missing page model");
    editor.replaceActiveRange({ path: "index.html", start: text.indexOf("</body>"), end: text.indexOf("</body>"), expected: "", text: "\n<style>#page .hero-image{width:100%;height:auto}@supports(display:grid){@media(min-width:900px){#page .hero-image{width:80%}}}</style>" });
  });
  await expect.poll(() => hero.evaluate((image) => parseFloat(getComputedStyle(image).width))).toBeGreaterThan(160);
  const before = await hero.evaluate(() => ({ width: innerWidth, height: innerHeight, x: scrollX, y: scrollY }));
  const report = await measure(page, { path: "index.html", node: [1, 0, 2] });
  if ("error" in report) throw new Error(report.error);
  const result = imageResult(report.facts);
  expect(result.widths.map(({ viewport }) => viewport)).toEqual(expect.arrayContaining([390, 768, 899, 900, 1280]));
  const width = (viewport: number) => result.widths.find((item) => item.viewport === viewport)?.width ?? 0;
  expect(width(390)).toBeGreaterThan(300);
  expect(width(768)).toBeGreaterThan(width(390));
  expect(width(1280)).toBeGreaterThan(width(768));
  expect(width(899)).toBeGreaterThan(width(900));
  expect(result.sizes).toMatch(/^(?:\(max-width: \d+(?:\.\d+)?px\) [1-9]\d*(?:px|vw), )*[1-9]\d*(?:px|vw)$/);
  expect(result.firstScreen).toBe(true);
  expect(await hero.evaluate(() => ({ width: innerWidth, height: innerHeight, x: scrollX, y: scrollY }))).toEqual(before);
  await expect(preview.locator("iframe")).toHaveCount(0);
});


test("preview measures a cover content box and reports a missing image without hanging", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const preview = page.frameLocator(".native-preview-frame");
  const hero = preview.locator("img.hero-image");
  await expect(hero).toBeVisible();
  await expect.poll(() => hero.evaluate((image) => image instanceof HTMLImageElement && image.naturalWidth)).toBeGreaterThan(0);
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const text = editor.getMountedSource("index.html");
    if (text === undefined) throw new Error("Missing page model");
    const at = text.indexOf("</body>");
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: "<style>#page .hero-image{box-sizing:border-box;width:340px;height:440px;padding:10px;border:10px solid;object-fit:cover}</style>" });
  });
  await expect.poll(() => hero.evaluate((image) => getComputedStyle(image).objectFit)).toBe("cover");
  const report = await measure(page, { path: "index.html", node: [1, 0, 2] });
  if ("error" in report) throw new Error(report.error);
  expect(report.facts.every((fact) => fact.width === 300 && fact.height === 400)).toBe(true);
  const result = imageResult(report.facts);
  expect(result.sizes).toBe("712px");
  expect(result.widths.every(({ width }) => Math.abs(width - 320 * 400 / 180) < 0.01)).toBe(true);
  expect(await measure(page, { path: "index.html", node: [99] })).toEqual({ error: "No image at the requested node." });
  await expect(preview.locator("iframe")).toHaveCount(0);
});
