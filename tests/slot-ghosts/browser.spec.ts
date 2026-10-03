import { expect, test } from "@playwright/test";

test("native slot reports preserve authored content without an Empty slots canvas rail", async ({ page, baseURL }) => {
  await page.goto(baseURL ?? "http://127.0.0.1:5616/");
  await page.evaluate(async () => {
    document.body.replaceChildren();
    const host = document.createElement("main"); host.style.cssText = "height:800px;width:1000px"; document.body.append(host);
    const modulePath = "/src/components/native-preview.ts";
    const { createNativePreview } = await import(modulePath);
    const state = window as any;
    state.fills = []; state.reports = [];
    window.addEventListener("message", e => { if (e.data?.type === "slot-ghosts") state.reports.push(e.data.report); });
    state.preview = createNativePreview(host, { onSlotGhostFill: (target: unknown) => state.fills.push(target) });
    state.sources = {
      "index.html": '<html><body><test-card><span slot="title">Assigned</span></test-card><test-card></test-card></body></html>',
      "components/test-card.html": '<style>:host{display:block;width:400px;height:150px}</style><h2><slot name="title">Fallback title</slot></h2><div data-if="image"><slot name="image"></slot><slot name="image"></slot></div><slot name="empty"></slot>',
    };
    state.preview.activate({ routes: { "/": "index.html" }, components: { "test-card": "components/test-card.html" } });
    state.preview.update({ sources: state.sources });
  });
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("test-card")).toHaveCount(2);
  const before = await frame.locator("#page").innerHTML();
  await page.evaluate(() => (window as any).preview.selectNode({ path: "index.html", node: [0] }));
  await expect.poll(() => page.evaluate(() => (window as any).reports.filter(Boolean).at(-1)?.hostNode)).toEqual([0]);
  const report = await page.evaluate(() => (window as any).reports.filter(Boolean).at(-1));
  expect(report.entries.find((entry: any) => entry.name === "title").assigned).toBe(true);
  expect(report.entries.filter((entry: any) => entry.name === "image").map((entry: any) => entry.occurrence)).toEqual([0, 1]);
  expect(report.entries.find((entry: any) => entry.name === "empty").assigned).toBe(false);
  await expect(page.getByRole("group", { name: "Empty slots" })).toHaveCount(0);
  await expect(page.locator(".slot-ghosts")).toHaveCount(0);
  expect(await frame.locator("#page").innerHTML()).toBe(before);
  expect(await frame.locator("test-card").first().evaluate(el => el.shadowRoot!.querySelectorAll('slot').length)).toBe(4);
  expect(await page.evaluate(() => (window as any).fills)).toEqual([]);
  await page.evaluate(() => (window as any).preview.destroy());
  await expect(page.locator(".slot-ghosts")).toHaveCount(0);
});
