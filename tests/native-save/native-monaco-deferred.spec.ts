import { test, expect } from '@playwright/test';

// Monaco waits for the preview (lean-fast-editor ticket 03): no request for
// the code editor or Monaco goes out before the preview's first paint, and
// the code pane still mounts on its own once the browser is idle.
const hash = '#repo=501&branch=main&file=index.html';
const monaco = /monaco-editor|\/code-editor[.-]|\/monaco[.-]|editor\.api|editor\.main/;

test('no Monaco chunk is requested before the preview first paints', async ({ page, baseURL }) => {
  // Each preview frame records its first contentful paint (epoch ms).
  await page.addInitScript(() => {
    if (window.top === window) return;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (entry.name === 'first-contentful-paint') (window as unknown as { __fcp?: number }).__fcp ??= performance.timeOrigin + entry.startTime;
    }).observe({ type: 'paint', buffered: true });
  });
  const requests: { url: string; at: number }[] = [];
  page.on('request', (request) => { if (monaco.test(new URL(request.url()).pathname)) requests.push({ url: request.url(), at: Date.now() }); });
  await page.goto(`${baseURL}/${hash}`);
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
  // The page structure is usable without Monaco.
  await expect(page.locator('[role=tree][aria-label="Page structure"] [role=treeitem]').first()).toBeVisible();
  // Monaco arrives by itself, without any click.
  await expect(page.locator('#content .monaco-editor .view-lines')).toContainText('<', { timeout: 20_000 });
  let paint = 0;
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const fcp = await frame.evaluate(() => (window as unknown as { __fcp?: number }).__fcp).catch(() => undefined);
    if (fcp) paint = paint ? Math.min(paint, fcp) : fcp;
  }
  expect(paint, 'the preview frame reported its first paint').toBeGreaterThan(0);
  expect(requests.length, 'Monaco was requested').toBeGreaterThan(0);
  const early = requests.filter((request) => request.at < paint);
  expect(early, 'Monaco requests before the preview painted').toEqual([]);
});

test('opening the code pane before the idle load fetches Monaco at once', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${hash}`);
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
  await page.locator('#content').click();
  await expect(page.locator('#content .monaco-editor .view-lines')).toContainText('<');
});
