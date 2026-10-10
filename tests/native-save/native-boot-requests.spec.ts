import { test, expect, type Page } from '@playwright/test';

// The first preview paint reads only the page on show (lean-fast-editor
// ticket 05, task 4g): its stylesheets and components, never the site's
// other pages, which the text index reads after the paint.

interface Read { shas: string[]; at: number; end: number }

// Every preview document reports its first contentful paint, and the editor
// each /api/file and /api/files read with its start, on the browser's clock.
async function watchReads(page: Page) {
  const paints: number[] = [];
  const reads: Read[] = [];
  await page.exposeBinding('__asePaint', (_source, at: number) => { paints.push(at); });
  await page.exposeBinding('__aseRead', (_source, url: string, at: number, end: number) => {
    const params = new URL(url).searchParams;
    reads.push({ shas: [...(params.get('shas')?.split(',') ?? []), ...(params.get('sha') ? [params.get('sha')!] : [])], at, end });
  });
  await page.addInitScript(() => {
    const report = window as unknown as { __asePaint(at: number): void; __aseRead(url: string, at: number, end: number): void };
    if (window.top !== window) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint') report.__asePaint(performance.timeOrigin + entry.startTime);
      }).observe({ type: 'paint', buffered: true });
      return;
    }
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (/^\/api\/files?$/.test(new URL(entry.name).pathname)) report.__aseRead(entry.name, performance.timeOrigin + entry.startTime, performance.timeOrigin + (entry as PerformanceResourceTiming).responseEnd);
    }).observe({ type: 'resource', buffered: true });
  });
  return { paints, reads };
}

// The blob SHA of each file on the branch, as the editor's snapshot lists them.
async function blobShas(page: Page, branch = 'main') {
  return page.evaluate(async (branch) => {
    const response = await fetch(`/api/snapshot?repo=native-demo-user%2Fnative-demo&branch=${branch}`, { credentials: 'same-origin' });
    const snapshot = await response.json() as { tree?: { path: string; sha: string; type: string }[] };
    return Object.fromEntries((snapshot.tree ?? []).filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry.sha]));
  }, branch);
}

const preview = (page: Page) => page.frameLocator('.native-preview-frame');

test('pages other than the open one are not read before the first paint', async ({ page, baseURL }) => {
  const { paints, reads } = await watchReads(page);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(preview(page).locator('.hero h1')).toBeVisible();
  await expect.poll(() => paints.length, { message: 'the preview reported its first paint' }).toBeGreaterThan(0);
  const shas = await blobShas(page);
  const about = shas['about/index.html'];
  expect(about).toBeTruthy();
  const paint = Math.min(...paints);
  const early = reads.filter((read) => read.at < paint);
  expect(early.some((read) => read.shas.includes(shas['index.html'])), 'the open page is read before paint').toBe(true);
  expect(early.filter((read) => read.shas.includes(about)), 'another page read before paint').toEqual([]);
  // The text index reads it once the page is on screen.
  await expect.poll(() => reads.some((read) => read.shas.includes(about)), { timeout: 15_000 }).toBe(true);
});

test('a page made before the text index has read the home page still copies its document', async ({ page, baseURL }) => {
  // The site's text index (which reads the home page when another page was
  // opened by its address) is held until the page is asked for.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let home = '';
  let heldReads = 0;
  await page.route(/\/api\/files?\?/, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const asked = [...(params.get('shas')?.split(',') ?? []), ...(params.get('sha') ? [params.get('sha')!] : [])];
    if (home && asked.includes(home)) { heldReads++; await held; }
    await route.continue();
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=about/index.html`);
  await expect(preview(page).locator('h1[data-key="about-title"]')).toHaveText('About this project');
  home = (await blobShas(page))['index.html'];
  const explorer = page.locator('#explorer');
  if (!(await explorer.isVisible())) await page.locator('#explorer-toggle').click();
  await explorer.getByRole('tab', { name: 'Pages' }).click();
  await explorer.getByRole('button', { name: '+ New page' }).click();
  await explorer.getByRole('textbox', { name: 'New page title' }).fill('Fresh');
  await page.keyboard.press('Enter');
  // Creating waits for the home page; nothing is made from an empty document meanwhile.
  await expect.poll(() => heldReads).toBeGreaterThan(0);
  await expect(page.locator('#status')).not.toHaveText(/Created the page Fresh/);
  release();
  await expect(page.locator('#status')).toHaveText('Created the page Fresh at /fresh/.');
  const draft = await page.evaluate(async () => (await import('/src/components/code-editor.ts')).getMountedSource('fresh/index.html'));
  expect(draft).toContain('<link rel="stylesheet" href="/styles/site.css">');
  expect(draft).toContain('<script type="module" src="/components/components.js"></script>');
  expect(draft).toContain('<site-header data-key="header"></site-header>');
  expect(draft).toContain('<site-footer data-key="footer"></site-footer>');
});

test('a page deep-linked by its address paints without the home page being read', async ({ page, baseURL }) => {
  const { paints, reads } = await watchReads(page);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=about/index.html`);
  await expect(preview(page).locator('h1[data-key="about-title"]')).toHaveText('About this project');
  await expect.poll(() => paints.length).toBeGreaterThan(0);
  const shas = await blobShas(page);
  const paint = Math.min(...paints);
  const early = reads.filter((read) => read.at < paint);
  expect(early.filter((read) => read.shas.includes(shas['index.html'])), 'the home page read before paint').toEqual([]);
});

// The site's own stylesheets are predicted from the branch and come with the
// page's first read (src/native-boot.ts nativeBootStyleExtras), so the sheet
// the page links needs no serial read of its own before the paint.
test('the linked stylesheet is read in the first wave, before any pre-paint read ends', async ({ page, baseURL }) => {
  const { paints, reads } = await watchReads(page);
  // Each read takes a while, so serial reads cannot overlap by chance.
  await page.route(/\/api\/files?\?/, async (route) => { await new Promise((resolve) => setTimeout(resolve, 150)); await route.continue(); });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(preview(page).locator('.hero h1')).toBeVisible();
  await expect.poll(() => paints.length).toBeGreaterThan(0);
  // A read still inside its 150 ms wait finishes on its own: a plain unroute would continue it
  // first, and its own continue would then throw ("Route is already handled").
  await page.unrouteAll({ behavior: 'wait' });
  const shas = await blobShas(page);
  const paint = Math.min(...paints);
  const early = reads.filter((read) => read.at < paint && read.shas.length);
  const sheet = early.find((read) => read.shas.includes(shas['styles/site.css']));
  expect(sheet, 'styles/site.css read before paint').toBeTruthy();
  expect(sheet!.at).toBeLessThan(Math.min(...early.map((read) => read.end)));
});

const scope = { account: 'native-demo-user', repoId: 501, repo: 'native-demo-user/native-demo', branch: 'main' };
// Drafts as an older version kept them in localStorage: they move into IndexedDB on load.
async function seedDrafts(page: Page, drafts: { path: string; baseSha: string | null; original: string; content: string }[]) {
  await page.evaluate(([scope, drafts]) => {
    for (const draft of drafts) {
      const key = 'astro-site-editor:draft:v1:' + JSON.stringify([scope.account, scope.repoId, scope.branch, draft.path]);
      localStorage.setItem(key, JSON.stringify({ ...scope, version: 1, ...draft, updatedAt: Date.now() }));
    }
  }, [scope, drafts] as const);
}
const demoFile = async (page: Page, baseURL: string | undefined, path: string) =>
  (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`)).text();
const heroColor = (page: Page) => preview(page).locator('.hero h1').evaluate((element) => getComputedStyle(element).color);

test('a drafted page that links a sheet outside the prediction, and a drafted site.css, paint with the drafts', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(preview(page).locator('.hero h1')).toBeVisible({ timeout: 30_000 });
  const shas = await blobShas(page);
  const home = await demoFile(page, baseURL, 'index.html');
  const site = await demoFile(page, baseURL, 'styles/site.css');
  await seedDrafts(page, [
    { path: 'styles/site.css', baseSha: shas['styles/site.css'], original: site, content: `${site}\n.hero h1 { color: rgb(1, 2, 3); }\n` },
  ]);
  await page.reload();
  await expect.poll(() => heroColor(page), { timeout: 30_000 }).toBe('rgb(1, 2, 3)');

  // A sheet in a dot-folder is never predicted: linked only by the drafted page, it is read after.
  await seedDrafts(page, [
    { path: '.theme/late.css', baseSha: null, original: '', content: '.hero h1 { color: rgb(4, 5, 6) !important; }\n' },
    { path: 'index.html', baseSha: shas['index.html'], original: home, content: home.replace('<link rel="stylesheet" href="/styles/site.css">', '<link rel="stylesheet" href="/styles/site.css">\n  <link rel="stylesheet" href="/.theme/late.css">') },
  ]);
  await page.reload();
  await expect.poll(() => heroColor(page), { timeout: 30_000 }).toBe('rgb(4, 5, 6)');
});

// One predicted sheet that cannot be read (in GitHub: not UTF-8) fails its
// own batch only: the page still paints, styled by the sheet it links.
test('an unreadable stylesheet no page links does not hold the preview back', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: 'styles/unused.css', content: '.unused { color: red; }\n' } });
  const shas = await blobShas(page);
  const unused = shas['styles/unused.css'];
  expect(unused).toBeTruthy();
  let refused = 0;
  await page.route(/\/api\/files?\?/, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const asked = [...(params.get('shas')?.split(',') ?? []), ...(params.get('sha') ? [params.get('sha')!] : [])];
    // As GitHub's text read refuses it (415), the boot's predicted read and the text index's alike.
    if (asked.includes(unused)) { refused++; await route.fulfill({ status: 415, contentType: 'application/json', body: JSON.stringify({ error: 'This file is not UTF-8 text.' }) }); return; }
    await route.continue();
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(preview(page).locator('.hero h1')).toBeVisible({ timeout: 30_000 });
  expect(refused).toBeGreaterThan(0);
  // Styled by styles/site.css: its body background, not the browser's white.
  await expect.poll(() => preview(page).locator('body').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(246, 247, 243)');
  await expect(page.locator('.native-preview-error')).toBeHidden();
});

// A predicted read still under way when the branch is read again belongs to
// the old commit: it must not land in the new load's sources.
test('a predicted stylesheet read from before a branch switch does not outlive it', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  const shas = await blobShas(page);
  const old = shas['styles/site.css'];
  const css = await (await page.request.get(`${baseURL}/__demo/file?path=styles/site.css`)).text();
  // Another branch whose sheet says something else.
  await page.request.post(`${baseURL}/__demo/branch`, { data: { name: 'feature', path: 'styles/site.css', content: `${css}\n.hero h1 { color: rgb(7, 8, 9); }\n` } });
  const fresh = (await blobShas(page, 'feature'))['styles/site.css'];
  expect(fresh).not.toBe(old);
  // main's predicted read is held; once the editor has moved to feature, its
  // read of feature's sheet waits until main's read has landed, so that lands
  // inside feature's load (after its sources were cleared).
  let releaseOld!: () => void;
  const oldHeld = new Promise<void>((resolve) => { releaseOld = resolve; });
  let holding = 0, switched = false, featureReads = 0;
  let releaseFeature!: () => void;
  const featureHeld = new Promise<void>((resolve) => { releaseFeature = resolve; });
  await page.route(/\/api\/files?\?/, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const asked = [...(params.get('shas')?.split(',') ?? []), ...(params.get('sha') ? [params.get('sha')!] : [])];
    if (asked.includes(old) && !holding++) await oldHeld;
    else if (switched && asked.includes(fresh)) { featureReads++; await featureHeld; }
    await route.continue();
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect.poll(() => holding, { timeout: 30_000 }).toBeGreaterThan(0);
  switched = true;
  await page.evaluate(() => { location.hash = '#repo=501&branch=feature&file=index.html'; });
  await expect.poll(() => featureReads, { timeout: 30_000 }).toBeGreaterThan(0);
  releaseOld();
  await page.waitForTimeout(500);
  releaseFeature();
  // Every colour the heading shows from feature's first paint on: never main's.
  const colors: string[] = [];
  const color = () => preview(page).locator('.hero h1').evaluate((element) => getComputedStyle(element).color);
  const deadline = Date.now() + 5_000;
  await expect(preview(page).locator('.hero h1')).toBeVisible({ timeout: 30_000 });
  while (Date.now() < deadline) {
    colors.push(await color().catch(() => ''));
    if (colors.at(-1) === 'rgb(7, 8, 9)' && colors.length > 3) break;
    await page.waitForTimeout(50);
  }
  const shown = colors.filter(Boolean);
  expect(shown.length).toBeGreaterThan(0);
  expect(new Set(shown)).toEqual(new Set(['rgb(7, 8, 9)']));
  // The sheet's code, opened on feature, is feature's.
  await page.evaluate(() => { location.hash = '#repo=501&branch=feature&file=styles/site.css'; });
  await expect(page.locator('#current-page')).toHaveAttribute('data-path', 'styles/site.css', { timeout: 30_000 });
  await expect.poll(() => page.evaluate(async () => (await import('/src/components/code-editor.ts')).getMountedSource('styles/site.css')), { timeout: 15_000 }).toContain('rgb(7, 8, 9)');
});
