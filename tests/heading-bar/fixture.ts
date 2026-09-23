import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { expect, type Page } from '@playwright/test';

export const revision = 'c'.repeat(40);
export const previewHost = 'https://main-heading-starter.lexvd.workers.dev';
export const sourcePath = 'src/pages/index.astro';
const fixtureRoot = resolve('fixtures/astro-starter');
export const originalSource = readFileSync(join(fixtureRoot, sourcePath), 'utf8');
export const originalTitle = 'A little space on the web, updated.';
let buildRoot: string;

export function preparePreview(source = originalSource, frameworkSource?: string, files: Record<string, string | null> = {}) {
  buildRoot = mkdtempSync(join(tmpdir(), 'astro-heading-bar-fixture-'));
  for (const name of ['src', 'public', '.astro-editor', 'package.json', 'astro.config.mjs']) {
    cpSync(join(fixtureRoot, name), join(buildRoot, name), { recursive: true });
  }
  symlinkSync(join(fixtureRoot, 'node_modules'), join(buildRoot, 'node_modules'), 'dir');
  writeFileSync(join(buildRoot, sourcePath), source);
  if (frameworkSource !== undefined)
    writeFileSync(join(buildRoot, 'src/styles/framework.css'), frameworkSource);
  for (const [path, content] of Object.entries(files)) {
    if (content === null) unlinkSync(join(buildRoot, path));
    else writeFileSync(join(buildRoot, path), content);
  }
  build(true);
}

function build(preview: boolean) {
  const astroPackage = join(fixtureRoot, 'node_modules/astro');
  const cli = JSON.parse(readFileSync(join(astroPackage, 'package.json'), 'utf8')).bin.astro;
  execFileSync(process.execPath, [join(astroPackage, cli), 'build',
    ...(preview ? ['--config', '.astro-editor/astro.preview.config.mjs'] : []),
    '--outDir', preview ? './preview-dist' : './plain-dist'], {
    cwd: buildRoot,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: 'pipe',
    timeout: 90_000,
  });
}

export function independentlyBuild(source: string) {
  const path = join(buildRoot, sourcePath);
  const previousSource = readFileSync(path, 'utf8');
  writeFileSync(path, source);
  try {
    build(false);
    return readFileSync(join(buildRoot, 'plain-dist/index.html'), 'utf8');
  } finally { writeFileSync(path, previousSource); }
}

export function rebuildPreview(source: string, files: Record<string, string> = {}) {
  writeFileSync(join(buildRoot, sourcePath), source);
  for (const [path, content] of Object.entries(files)) writeFileSync(join(buildRoot, path), content);
  build(true);
}

export function previewFile(pathname: string) {
  const file = join(buildRoot, 'preview-dist', decodeURIComponent(pathname), pathname.endsWith('/') ? 'index.html' : '');
  if (!existsSync(file)) return undefined;
  const types: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
  return { body: readFileSync(file), contentType: types[extname(file)] ?? 'application/octet-stream' };
}

export async function openEditor(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const blobs: Record<string, string> = {};
  const trees: Record<string, { entries: object[] }> = {};
  const sha = (name: string) => createHash('sha1').update(name).digest('hex');
  function tree(relative: string): object[] {
    const entries: object[] = [];
    for (const entry of readdirSync(join(buildRoot, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (!relative && !['src', '.astro-editor'].includes(entry.name)) continue;
      if (entry.isDirectory()) {
        trees[sha(path)] = { entries: tree(path) };
        entries.push({ path: entry.name, sha: sha(path), type: 'tree', mode: '040000' });
      } else if (/\.(astro|css|json|mjs|tsx)$/.test(entry.name)) {
        blobs[sha(path)] = readFileSync(join(buildRoot, path), 'utf8');
        entries.push({ path: entry.name, sha: sha(path), type: 'blob', mode: '100644', size: blobs[sha(path)].length });
      }
    }
    return entries;
  }
  const entries = tree('');
  blobs[sha('.astro-editor/preview.json')] = JSON.stringify({
    provider: 'cloudflare-workers-assets', worker: 'heading-starter',
    subdomain: 'lexvd.workers.dev', revisionPath: '/.astro-editor/revision.json',
  });
  let submitted: { path: string; content: string }[] | undefined;
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/publish') {
      submitted = route.request().postDataJSON().files;
      // Inspect the actual delivery boundary without making a live repository write.
      return route.fulfill({ status: 503, json: { error: 'Offline test destination; draft retained.' } });
    }
    const responses: Record<string, unknown> = {
      '/api/session': { configured: true, user: { login: 'lex' }, installUrl: null },
      '/api/repositories': [{ id: 42, name: 'heading-starter', full_name: 'lex/heading-starter', private: true, default_branch: 'main', owner: { login: 'lex', type: 'User' } }],
      '/api/branches': ['main'],
      '/api/snapshot': { branch: 'main', commit: revision, entries, detection: { status: 'detected', message: 'Astro' } },
      '/api/tree': trees[url.searchParams.get('sha') ?? ''],
      '/api/file': { content: blobs[url.searchParams.get('sha') ?? ''] },
    };
    return route.fulfill({ json: responses[url.pathname] ?? {} });
  });
  await page.route('https://heading-starter.lexvd.workers.dev/**', route => route.fulfill({
    json: { sha: revision, ref: 'main', builtAt: '2026-09-20T10:00:00Z' },
    headers: { 'access-control-allow-origin': '*' },
  }));
  await page.route(`${previewHost}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/.astro-editor/revision.json') return route.fulfill({
      json: { sha: revision, ref: 'main', builtAt: '2026-09-20T10:00:00Z' },
      headers: { 'access-control-allow-origin': '*' },
    });
    const file = previewFile(url.pathname);
    if (!file) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fulfill(file);
  });
  await page.goto('/');
  await expect(page.locator('.preview-summary')).toContainText('same as main');
  return {
    errors,
    async submittedFiles() {
      submitted = undefined;
      await page.getByRole('button', { name: 'Publish', exact: true }).click();
      for (const checkbox of await page.locator(".publish-menu input[type=checkbox]").all()) await checkbox.check();
      await page.getByRole('button', { name: 'Publish selected files', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Offline test destination' })).toBeVisible();
      await page.keyboard.press('Escape');
      expect(submitted).toBeDefined();
      return submitted!;
    },
    async submittedSource() {
      const source = (await this.submittedFiles()).find(file => file.path === sourcePath)?.content;
      expect(source).toBeDefined();
      return source!;
    },
  };
}
