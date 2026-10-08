import { expect, test } from "@playwright/test";
import { storedDrafts } from "./drafts";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`moving the edit bar updates its avoidance label without scheduling unrelated geometry (${reducedMotion})`, async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
    const frame = page.frameLocator(".native-preview-frame");
    await expect(frame.locator(".hero h1")).toBeVisible();
    const branch = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
    await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content: branch.replace('<p class="lead"', '<a class="avoidance-link" href="/about/" style="display:block;margin-top:150px">Address probe</a><p class="lead"') } });
    await page.reload();
    await frame.locator(".avoidance-link").click();
    const bar = page.getByRole("toolbar", { name: "Edit bar" });
    await expect(bar).toBeVisible();
    await frame.locator(".hero p.lead").hover();
    const label = frame.locator('[data-native-selection-box="label"]');
    await expect(label).toBeVisible();
    const source = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
    const before = await source(), drafts = await storedDrafts(page), barBefore = (await bar.boundingBox())!;
    // Attribute work to this exact runtime handler, independently of ordinary wheel work.
    const runtimeUrl = await frame.locator("script[src]").first().getAttribute("src");
    const runtimeFile = new URL(runtimeUrl!, baseURL).pathname.split("/").pop()!;
    const runtime = await (await page.request.get(new URL(runtimeUrl!, baseURL).href)).text();
    const lines = runtime.split("\n"), start = lines.findIndex(line => line.includes('msg.type === "canvas-avoid"'));
    const callLine = lines.findIndex((line, index) => index > start && index < start + 7 && /(?:updateBoxes|canvasPaintLabel)\(\);/.test(line)) + 1;
    expect(callLine).toBeGreaterThan(0);
    await frame.locator("html").evaluate((_, [handlerLine, runtimeFile]) => {
      const originalRAF = window.requestAnimationFrame, originalRect = Element.prototype.getBoundingClientRect;
      const probe = { messages: 0, schedules: 0, rectReads: 0, labelReads: 0 };
      const fromAvoidance = () => (new Error().stack ?? "").includes(`${runtimeFile}:${handlerLine}:`);
      window.requestAnimationFrame = function (callback) { if (fromAvoidance()) probe.schedules++; return originalRAF.call(window, callback); };
      Element.prototype.getBoundingClientRect = function () {
        if (fromAvoidance()) { probe.rectReads++; if ((new Error().stack ?? "").includes("canvasDrawLabel")) probe.labelReads++; }
        return originalRect.call(this);
      };
      const receive = (event: MessageEvent) => { if (event.source === parent && event.data?.source === "astro-native-preview-host" && event.data.type === "canvas-avoid") probe.messages++; };
      window.addEventListener("message", receive);
      (window as any).avoidanceProbe = { probe, stop: () => { window.requestAnimationFrame = originalRAF; Element.prototype.getBoundingClientRect = originalRect; window.removeEventListener("message", receive); return probe; } };
    }, [callLine, runtimeFile] as const);
    for (let index = 0; index < 6; index++) { await page.mouse.wheel(0, 10); await page.waitForTimeout(60); }
    await expect.poll(async () => (await bar.boundingBox())!.y).toBeLessThan(barBefore.y - 30);
    await expect.poll(() => frame.locator("html").evaluate(() => (window as any).avoidanceProbe.probe.messages)).toBeGreaterThan(0);
    await expect(label).toBeVisible();
    await expect.poll(async () => {
      const a = (await label.boundingBox())!, b = (await bar.boundingBox())!;
      return a.x + a.width <= b.x || a.x >= b.x + b.width || a.y + a.height <= b.y || a.y >= b.y + b.height;
    }).toBe(true);
    const counts = await frame.locator("html").evaluate(() => (window as any).avoidanceProbe.stop());
    console.log("CANVAS_AVOIDANCE", JSON.stringify({ reducedMotion, counts, barBefore, barAfter: await bar.boundingBox() }));
    expect(counts.labelReads).toBe(counts.messages);
    expect(counts.schedules).toBe(0);
    expect(counts.rectReads).toBe(counts.labelReads);
    expect(await source()).toBe(before);
    expect(await storedDrafts(page)).toEqual(drafts);
  });
}
