import { test, expect, type Page } from '@playwright/test';
import { editorMounted, storedDraft, storedDrafts } from './drafts';
import { publishButton } from './publish';

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
  // The draft store has them while Monaco is still held.
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content).toContain('<h1 data-key="hero-title">ABC</h1>');
  await expect(page.locator('.monaco-editor')).toHaveCount(0);
  release();
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content, { timeout: 20_000 }).toContain('<h1 data-key="hero-title">ABC</h1>');
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toHaveText('ABC');
});

const pages = async (page: Page, name: RegExp) => {
  if (!(await page.locator('#explorer').isVisible())) await page.locator('#explorer-toggle').click();
  await page.getByRole('tab', { name: 'Pages', exact: true }).click();
  await page.locator('#explorer').getByRole('treeitem', { name }).first().click();
};

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

test('a text edit made before Monaco arrives survives Home, About and back Home before it loads', async ({ page, baseURL }) => {
  const release = await holdEditor(page);
  await page.goto(`${baseURL}/${hash}`);
  const heading = page.frameLocator('.native-preview-frame').locator('.hero h1');
  await expect(heading).toBeVisible();
  await typeHeading(page, 'Kept on return');
  await pages(page, /^About/);
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'about/index.html');
  // The edit has left its polling and is waiting for the editor to draft it.
  await page.waitForTimeout(400);
  await pages(page, /^Home/);
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'index.html');
  release();
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content, { timeout: 20_000 }).toContain('<h1 data-key="hero-title">Kept on return</h1>');
  await expect(heading).toHaveText('Kept on return');
});

test('a file rename asked for before Monaco arrives never lands on the branch opened meanwhile', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${hash}`);
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();
  const home = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  await page.request.post(`${baseURL}/__demo/branch`, { data: { name: 'feature', path: 'index.html', content: home.replace('A native browser preview', 'Feature branch preview') } });
  const release = await holdEditor(page);
  await page.reload();
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toHaveText('A native browser preview');
  // Rename styles/sections.css in the Files tab: it applies on main at once, without Monaco.
  const explorer = page.locator('#explorer');
  if (!(await explorer.isVisible())) await page.locator('#explorer-toggle').click();
  await explorer.getByRole('tab', { name: 'Files' }).click();
  const folder = explorer.getByRole('button', { name: 'styles', exact: true }).first();
  if ((await folder.getAttribute('aria-expanded')) === 'false') await folder.click();
  await explorer.getByRole('button', { name: 'sections.css', exact: true }).focus();
  await page.keyboard.press('F2');
  const input = explorer.getByRole('textbox', { name: 'New name for styles/sections.css' });
  await input.fill('renamed.css');
  await page.keyboard.press('Enter');
  // Switch to the feature branch before the editor arrives.
  await page.locator('.repository-menu__trigger').click();
  const row = page.locator('.repository-menu__repo[aria-current="true"]');
  await row.hover();
  await page.getByRole('menu', { name: 'Branches' }).getByRole('menuitemradio', { name: 'feature' }).click();
  await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toHaveText('Feature branch preview', { timeout: 30_000 });
  release();
  // The editor arrives; the rename stays on main, never applied here.
  await editorMounted(page);
  await page.waitForTimeout(1000);
  expect((await storedDrafts(page)).filter((draft) => draft.branch === 'feature')).toEqual([]);
});

// Drafts, Undo and Save work from the draft store (lean-fast-editor ticket 03,
// point 4): none of them waits for Monaco.
const homeText = '<h1 data-key="hero-title">A native browser preview</h1>';
test('an inline edit before Monaco loads is a draft at once, and Undo reverts it without Monaco', async ({ page, baseURL }) => {
  const release = await holdEditor(page);
  await page.goto(`${baseURL}/${hash}`);
  const heading = page.frameLocator('.native-preview-frame').locator('.hero h1');
  await expect(heading).toBeVisible();
  await typeHeading(page, 'Drafted before Monaco');
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content).toContain('<h1 data-key="hero-title">Drafted before Monaco</h1>');
  const undo = page.locator('#editor-toolbar-host .code-editor__undo');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(heading).toHaveText('A native browser preview');
  // Back to GitHub's text: no draft is left.
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content ?? homeText).toContain(homeText);
  await page.locator('#editor-toolbar-host .code-editor__redo').click();
  await expect(heading).toHaveText('Drafted before Monaco');
  await expect(page.locator('.monaco-editor')).toHaveCount(0);
  release();
});

test('Save before Monaco loads commits the draft to GitHub', async ({ page, baseURL }) => {
  const release = await holdEditor(page);
  await page.goto(`${baseURL}/${hash}`);
  const heading = page.frameLocator('.native-preview-frame').locator('.hero h1');
  await expect(heading).toBeVisible();
  await typeHeading(page, 'Saved before Monaco');
  await expect(publishButton(page)).toBeEnabled();
  await publishButton(page).click();
  await expect(page.locator('.publish-menu__message')).toContainText('Saved to GitHub', { timeout: 30_000 });
  await expect.poll(async () => (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text()).toContain('<h1 data-key="hero-title">Saved before Monaco</h1>');
  await expect.poll(async () => (await storedDraft(page, 'index.html'))?.content).toBeUndefined();
  await expect(page.locator('.monaco-editor')).toHaveCount(0);
  release();
});
