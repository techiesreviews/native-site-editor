import { expect, test } from "@playwright/test";

test("real native preview reports optional slots and guards canvas callbacks", async ({ page }) => {
  await page.goto("http://127.0.0.1:5446/");
  await page.evaluate(async () => {
    document.body.replaceChildren();
    document.body.style.margin = "0";
    const host = document.createElement("main"); host.style.cssText = "height:800px;width:1000px"; document.body.append(host);
    const { createNativePreview } = await import("/src/components/native-preview.ts");
    const state = window as any;
    state.fills = []; state.reports = [];
    window.addEventListener("message", e => { if (e.data?.type === "slot-ghosts") state.reports.push(e.data.report); });
    state.preview = createNativePreview(host, { onSlotGhostFill: (target: unknown) => state.fills.push(target) });
    state.sources = {
      "index.html": '<html><body><test-card><span slot="title">Assigned</span>  </test-card><test-card></test-card><div style="height:2000px">Tail</div></body></html>',
      "components/test-card.html": '<style>:host{display:block;width:400px;height:150px;margin:40px} .hidden{display:none}</style><h2><slot name="title">Fallback title</slot></h2><div class="hidden"><slot name="image"></slot><slot name="image"></slot></div><slot name="zero"></slot><slot name="fallback">Fallback</slot>',
    };
    state.preview.activate({ routes: { "/": "index.html" }, components: { "test-card": "components/test-card.html" } });
    state.preview.update({ sources: state.sources });
  });
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("test-card").first()).toBeVisible();
  const before = await frame.locator("#page").innerHTML();
  await page.evaluate(() => (window as any).preview.selectNode({ path: "index.html", node: [0] }));
  const image = page.getByRole("button", { name: "Add Image · 2 outlets", exact: true });
  await expect(image).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Title", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Zero", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Fallback", exact: true })).toBeVisible();
  await image.click();
  const report = await page.evaluate(() => (window as any).reports.filter(Boolean).at(-1));
  expect(report.hostNode).toEqual([0]);
  expect(report.entries.filter((e: any) => e.name === "image").map((e: any) => [e.occurrence, e.hidden, e.rect])).toEqual([[0, true, undefined], [1, true, undefined]]);
  expect(await page.evaluate(() => (window as any).fills.at(-1))).toEqual({ context: report.context, pagePath: "index.html", tag: "test-card", templatePath: "components/test-card.html", hostNode: [0], name: "image" });
  expect(await frame.locator("#page").innerHTML()).toBe(before);
  await frame.locator("test-card").first().locator("h2").click();
  await image.click();
  expect(await page.evaluate(() => (window as any).fills.at(-1).hostNode)).toEqual([0]);
  // Frame scaling and resizing keep hit targets inside both clipping viewports.
  await page.locator(".native-preview-frame").evaluate(el => { (el as HTMLElement).style.transform = "scale(.75)"; (el as HTMLElement).style.transformOrigin = "top left"; });
  await page.setViewportSize({ width: 1100, height: 850 });
  await image.click();
  const buttonBox = await image.boundingBox(), frameBox = await page.locator(".native-preview-frame").boundingBox();
  expect(buttonBox!.x).toBeGreaterThanOrEqual(frameBox!.x); expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(frameBox!.x + frameBox!.width);
  // Pane scaling, scrolling, and host visibility never leave stale targets.
  await page.locator(".native-preview-pane").evaluate(el => { (el as HTMLElement).style.transform = "scale(.9)"; (el as HTMLElement).style.transformOrigin = "top left"; });
  await page.setViewportSize({ width: 1090, height: 845 });
  await image.click();
  await frame.locator("test-card").first().evaluate(el => { el.setAttribute("style", "opacity:0"); });
  await expect(image).toHaveCount(0);
  await frame.locator("test-card").first().evaluate(el => { el.removeAttribute("style"); });
  await expect(image).toBeVisible();
  await frame.locator("test-card").first().evaluate(() => window.scrollTo(0, 600));
  await expect(image).toHaveCount(0);
  await frame.locator("test-card").first().evaluate(() => window.scrollTo(0, 0));
  await expect(image).toBeVisible();
  const fillsBeforeStale = await page.evaluate(() => {
    const state = window as any;
    state.oldButton = document.querySelector(".slot-ghosts button");
    const count = state.fills.length;
    state.preview.refresh();
    state.oldButton.click();
    return count;
  });
  expect(await page.evaluate(() => (window as any).fills.length)).toBe(fillsBeforeStale);
  await expect(image).toBeVisible();
  const currentReport = await page.evaluate(() => (window as any).reports.filter(Boolean).at(-1));
  // A malformed report clears controls and never produces an action.
  await frame.locator("test-card").first().evaluate((_, bad) => parent.postMessage({ source: "astro-native-preview", type: "slot-ghosts", context: bad.context, report: { ...bad, templatePath: "wrong.html" } }, "*"), currentReport);
  await expect(image).toHaveCount(0);
  await page.evaluate(() => (window as any).preview.selectNode({ path: "index.html", node: [1] }));
  await expect(page.getByRole("button", { name: "Add Title", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add Title", exact: true }).click();
  expect(await page.evaluate(() => (window as any).fills.at(-1).hostNode)).toEqual([1]);
  const beforeWrongHost = await page.evaluate(() => (window as any).fills.length);
  await frame.locator("test-card").nth(1).evaluate((_, old) => parent.postMessage({ source: "astro-native-preview", type: "slot-ghosts", context: old.context, report: old }, "*"), currentReport);
  await image.click();
  expect(await page.evaluate(() => (window as any).fills.length)).toBe(beforeWrongHost);
  await page.evaluate(() => (window as any).preview.refresh());
  await expect(page.getByRole("button", { name: "Add Title", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add Title", exact: true }).focus(); await page.keyboard.press("Escape");
  await expect(image).toHaveCount(0);
  await page.evaluate(() => (window as any).preview.refresh());
  await expect(image).toBeVisible();
  await frame.locator("test-card").nth(1).evaluate(el => el.remove());
  await page.setViewportSize({ width: 1080, height: 840 });
  await expect(image).toHaveCount(0);
  await page.evaluate(() => (window as any).preview.destroy());
  await expect(page.locator(".slot-ghosts")).toHaveCount(0);
});
