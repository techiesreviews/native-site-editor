import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { NATIVE_STARTER_VERSION } from '../../worker/starter';

// Native source only: the ordinary demo fixture supplies the pre-creation account.
test('Create site commits the native starter and every public page works without JavaScript', { tag: "@native-static" }, async ({ page, context, browser, baseURL }) => {
  test.skip(!process.env.ASE_NATIVE_STARTER_SOURCE, 'Run test:browser:native-static -- --spec native-static-starter-create.');
  expect(process.env.ASE_NATIVE_STARTER_SOURCE).toBe('native-static');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addCookies([
    { name: 'ase_demo_signed_out', value: '1', url: baseURL! },
    { name: 'ase_demo_browser', value: `native-create-${Date.now()}`, url: baseURL! },
  ]);
  await page.request.post(`${baseURL}/__demo/onboarding`, { data: { reset: true, repositories: 'none', installed: false } });
  await page.goto(baseURL!);
  await page.getByRole('link', { name: 'Continue with GitHub' }).click();
  await expect(page.getByRole('heading', { name: 'Create your site' })).toBeVisible();
  await page.getByLabel('Repository name').fill('native-proof');
  await page.getByRole('radio', { name: /Starter site/ }).check();
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('heading', { name: 'Your site is ready' })).toBeVisible({ timeout: 30_000 });
  const state = await (await page.request.get(`${baseURL}/__demo/onboarding`)).json();
  expect(state.created).toEqual([{ name: 'native-proof', private: false, description: 'A website edited with Native Site Editor' }]);
  expect(state.installs).toBe(1);
  expect(state.authorizations).toBe(1);
  expect(state.starterFetches).toBe(0); // No codeload/template request.
  const head = await (await page.request.get(`${baseURL}/__demo/head?repo=native-proof`)).json();
  expect(head.commit).toMatch(/^[a-f0-9]{40}$/);

  const root = resolve('public/native-static-starter', NATIVE_STARTER_VERSION);
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8')) as {
    files: { path: string; size: number; sha256: string }[]; inline: { path: string; content: string }[];
  };
  const repositories = await (await page.request.get(`${baseURL}/api/repositories`)).json();
  const repository = repositories.find((entry: { name: string }) => entry.name === 'native-proof');
  expect(repository).toBeTruthy();
  const snapshotResponse = await page.request.get(`${baseURL}/api/snapshot?repo=${encodeURIComponent(repository.full_name)}&branch=main`);
  expect(snapshotResponse.status()).toBe(200);
  const snapshot = await snapshotResponse.json();
  expect(snapshot.commit).toBe(head.commit);
  expect(snapshot.tree).toBeDefined();
  expect(snapshot.tree.filter((entry: { type: string }) => entry.type === 'blob').map((entry: { path: string }) => entry.path).sort())
    .toEqual([...manifest.files, ...manifest.inline].map(entry => entry.path).sort());
  const committed = new Map<string, Buffer>();
  for (const entry of [...manifest.files, ...manifest.inline]) {
    const response = await page.request.get(`${baseURL}/__demo/file?repo=native-proof&path=${encodeURIComponent(entry.path)}`);
    expect(response.status(), entry.path).toBe(200);
    const bytes = await response.body();
    committed.set(entry.path, bytes);
    if ('sha256' in entry) {
      const original = readFileSync(resolve(root, 'files', `${entry.path}.asset`));
      expect(original.length).toBe(entry.size);
      expect(createHash('sha256').update(original).digest('hex')).toBe(entry.sha256);
      // The worker deliberately removes the template's deployment address and noindex.
      const expected = entry.path.endsWith('.png') ? original : Buffer.from(original.toString('utf8')
        .split('https://native-site-editor-starter-test.lexvd.workers.dev').join('')
        .replace(entry.path.endsWith('.html') && entry.path !== '404.html' ? /[ \t]*<meta name="robots" content="noindex">\r?\n?/g : /$^/, ''));
      expect(bytes.equals(expected), entry.path).toBe(true);
    } else {
      expect(entry.path).toBe('.editor/config.json');
      expect(bytes.toString()).toBe(JSON.stringify({ site: { name: 'Native proof' } }, null, 2) + '\n');
    }
  }
  const html = [...committed.keys()].filter(path => path.endsWith('.html'));
  expect(html).toHaveLength(6);
  for (const path of html) expect(committed.get(path)!.toString()).not.toMatch(/data-key=|data-native-|astro-native|public\/template|\.editor\/loader/i);
  const png = [...committed.keys()].find(path => path.endsWith('.png'))!;
  expect(png).toBeTruthy();
  expect(committed.get(png)!.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(errors).toEqual([]);

  // A plain byte server: no editor routes, HTML transform, or JavaScript runtime.
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname;
    requests.push(path);
    const file = path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1);
    const bytes = file.startsWith('.editor/') ? undefined : committed.get(file);
    response.statusCode = bytes ? 200 : 404;
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : 'text/plain';
    response.setHeader('Content-Type', type);
    response.end(bytes);
  });
  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Static listener did not bind');
    const origin = `http://127.0.0.1:${address.port}`;
    const publicPage = await staticContext.newPage();
    const network: { url: string; status: number; type: string }[] = [];
    publicPage.on('response', response => network.push({ url: response.url(), status: response.status(), type: response.request().resourceType() }));
    for (const path of html) {
      const route = path === 'index.html' ? '/' : path.endsWith('/index.html') ? `/${path.slice(0, -10)}` : `/${path}`;
      const response = await publicPage.goto(`${origin}${route}`);
      expect(response!.status()).toBe(200);
      expect((await response!.body()).equals(committed.get(path)!)).toBe(true);
      const source = committed.get(path)!.toString();
      const text = (tag: string) => new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(source)![1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
      await expect(publicPage.locator('h1')).toBeVisible();
      await expect(publicPage.locator('h1')).toHaveText(text('h1'));
      await expect(publicPage).toHaveTitle(text('title'));
      await expect(publicPage.locator('main')).toBeVisible();
      for (const reference of await publicPage.locator('link[rel=stylesheet], link[rel=icon], meta[property="og:image"]').all()) {
        const target = (await reference.getAttribute('href')) ?? (await reference.getAttribute('content'));
        expect(target).toMatch(/^\//);
        expect((await staticContext.request.get(`${origin}${target}`)).status(), target!).toBe(200);
      }
      expect(await publicPage.locator('script:not([type="application/ld+json"])').count()).toBe(0);
      for (const metadata of await publicPage.locator('script[type="application/ld+json"]').all()) expect(JSON.parse((await metadata.textContent())!)).toHaveProperty('@context', 'https://schema.org');
      for (const image of await publicPage.locator('img').all()) expect(await image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    expect(network.some(entry => entry.type === 'stylesheet')).toBe(true);
    // This starter uses favicon/social metadata rather than visible <img> elements.
    for (const path of [...committed.keys()].filter(path => path.startsWith('images/'))) {
      const response = await staticContext.request.get(`${origin}/${path}`);
      expect(response.status(), path).toBe(200);
      expect((await response.body()).equals(committed.get(path)!)).toBe(true);
    }
    for (const entry of network) { expect(entry.url.startsWith(origin)).toBe(true); expect(entry.status, entry.url).toBe(200); }
    expect(requests.some(path => path.includes('.editor') || /\.(?:js|mjs)$/.test(path))).toBe(false);
    expect((await staticContext.request.get(`${origin}/.editor/config.json`)).status()).toBe(404);
    const pngResponse = await staticContext.request.get(`${origin}/${png}`);
    expect((await pngResponse.body()).equals(committed.get(png)!)).toBe(true);
    for (const path of [...committed.keys()].filter(path => path.endsWith('.css'))) {
      expect((await (await staticContext.request.get(`${origin}/${path}`)).body()).equals(committed.get(path)!)).toBe(true);
    }
  } finally {
    await staticContext.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
