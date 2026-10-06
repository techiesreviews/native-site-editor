import { test, expect, type Page } from '@playwright/test';
import { storedDraft } from './drafts';

// Monaco waits for the preview (lean-fast-editor ticket 03): no request for
// the code editor or Monaco goes out before the preview's first paint, and
// the code pane still mounts on its own once the browser is idle.
const hash = '#repo=501&branch=main&file=index.html';
const monaco = /monaco-editor|\/code-editor[.-]|\/monaco[.-]|editor\.api|editor\.main/;

test('no Monaco chunk is requested before the preview first paints', async ({ page, baseURL }) => {
  // Every preview document reports its first contentful paint, and the
  // editor its Monaco requests, on the browser's own clock (epoch ms).
  const paints: number[] = [];
  const requests: { url: string; at: number }[] = [];
  await page.exposeBinding('__asePaint', (_source, at: number) => { paints.push(at); });
  await page.exposeBinding('__aseRequest', (_source, url: string, at: number) => { requests.push({ url, at }); });
  await page.addInitScript((pattern) => {
    const report = window as unknown as { __asePaint(at: number): void; __aseRequest(url: string, at: number): void };
    if (window.top !== window) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint') report.__asePaint(performance.timeOrigin + entry.startTime);
      }).observe({ type: 'paint', buffered: true });
      return;
    }
    const monaco = new RegExp(pattern);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (monaco.test(new URL(entry.name).pathname)) report.__aseRequest(entry.name, performance.timeOrigin + entry.startTime);
    }).observe({ type: 'resource', buffered: true });
  }, monaco.source);
  await page.goto(`${baseURL}/${hash}`);
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
  // The page structure is usable without Monaco.
  await expect(page.locator('[role=tree][aria-label="Page structure"] [role=treeitem]').first()).toBeVisible();
  // Monaco arrives by itself, without any click.
  await expect(page.locator('#content .monaco-editor .view-lines')).toContainText('<', { timeout: 20_000 });
  await expect.poll(() => requests.length, { message: 'Monaco was requested' }).toBeGreaterThan(0);
  expect(paints.length, 'the preview frame reported its first paint').toBeGreaterThan(0);
  const paint = Math.min(...paints);
  const early = requests.filter((request) => request.at < paint);
  expect(early, 'Monaco requests before the preview painted').toEqual([]);
});

test('opening the code pane before the idle load fetches Monaco at once', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${hash}`);
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
  await page.locator('#content').click();
  await expect(page.locator('#content .monaco-editor .view-lines')).toContainText('<');
});

// Text committed in the preview while the code editor is still on its way.
async function holdEditor(page: Page) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/src\/components\/code-editor\.ts/, async (route) => { await held; await route.continue(); });
  return release;
}
async function typeHeading(page: Page, text: string, replace = true) {
  const heading = page.frameLocator('.native-preview-frame').locator('.hero h1');
  await heading.click();
  await expect(heading).toHaveAttribute('contenteditable', /plaintext-only|true/);
  await page.keyboard.press(replace ? 'ControlOrMeta+A' : 'End');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('two quick text edits made before Monaco arrives land in order', async ({ page, baseURL }) => {
  const release = await holdEditor(page);
  await page.goto(`${baseURL}/${hash}`);
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
  await typeHeading(page, 'AB');
  await typeHeading(page, 'C', false);
  release();
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content, { timeout: 20_000 }).toContain('<h1 data-key="hero-title">ABC</h1>');
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toHaveText('ABC');
});

test('a text edit made before Monaco arrives survives switching pages', async ({ page, baseURL }) => {
  const release = await holdEditor(page);
  await page.goto(`${baseURL}/${hash}`);
  const heading = page.frameLocator('.native-preview-frame').locator('.hero h1');
  await expect(heading).toBeVisible();
  await typeHeading(page, 'Kept while loading');
  const pages = async (name: RegExp) => {
    if (!(await page.locator('#explorer').isVisible())) await page.locator('#explorer-toggle').click();
    await page.getByRole('tab', { name: 'Pages', exact: true }).click();
    await page.locator('#explorer').getByRole('treeitem', { name }).first().click();
  };
  await pages(/^About/);
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'about/index.html');
  release();
  // Written into the home page's draft once the editor is here.
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content, { timeout: 20_000 }).toContain('<h1 data-key="hero-title">Kept while loading</h1>');
  await pages(/^Home/);
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'index.html');
  await expect(heading).toHaveText('Kept while loading');
});
