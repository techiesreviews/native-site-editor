import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DraftBuildSuccess, DraftFile, DraftPreviewRequest } from '../shared/draft-preview.ts';

const execFileAsync = promisify(execFile);

export const demoDraftBaseline = {
  repo: 'demo/heading-starter-local-fixture',
  branch: 'main',
  baseCommit: 'c'.repeat(40),
};

const allowedExtensions = new Set(['.astro', '.css', '.json', '.mjs', '.js', '.ts', '.tsx', '.md', '.mdx']);
const allowedSourceRoots = ['src/'];
const allowedEditorFiles = new Set([
  '.astro-editor/annotate.mjs',
  '.astro-editor/astro.preview.config.mjs',
  '.astro-editor/text-attributes.mjs',
  '.astro-editor/text-options.mjs',
  '.astro-editor/text-attributes.d.mts',
  '.astro-editor/text-options.d.mts',
]);
const maxBodyBytes = 1_000_000;
const maxFiles = 80;
const maxFileBytes = 200_000;
const maxTotalFileBytes = 750_000;
const maxOutputBytes = 8_000_000;
const maxOutputFiles = 400;
const maxArtifactAgeMs = 60 * 60 * 1000;
const bodyReadTimeoutMs = 10_000;
const buildTimeoutMs = 90_000;
const maxArtifactsPerSession = 8;
const maxSessions = 20;

export interface DraftPreviewRuntimeOptions {
  projectRoot: string;
  fixtureRoot: string;
  artifactRoot: string;
  previewOrigin: string;
}

interface BuildRecord {
  sessionId: string;
  revision: string;
  dir: string;
  createdAt: number;
}

export class DraftPreviewRuntime {
  private readonly projectRoot: string;
  private readonly fixtureRoot: string;
  private readonly artifactRoot: string;
  private readonly previewOrigin: string;
  private busy = false;
  private readonly artifacts: BuildRecord[] = [];

  constructor(options: DraftPreviewRuntimeOptions) {
    this.projectRoot = resolve(options.projectRoot);
    this.fixtureRoot = resolve(options.fixtureRoot);
    this.artifactRoot = resolve(options.artifactRoot);
    this.previewOrigin = options.previewOrigin.replace(/\/$/, '');
    mkdirSync(this.artifactRoot, { recursive: true });
  }

  availability() {
    return { available: true as const, previewOrigin: this.previewOrigin };
  }

  async handleAvailability(_req: IncomingMessage, res: ServerResponse) {
    json(res, 200, this.availability());
  }

  async handleBuild(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (!origin || !host) return json(res, 403, { error: 'Origin required.' });
    if (origin && host) {
      let ok = false;
      try {
        const parsed = new URL(origin);
        ok = parsed.host === host;
      } catch {}
      if (!ok) return json(res, 403, { error: 'Origin not allowed.' });
    }
    if (this.busy) return json(res, 429, { error: 'Draft preview runtime is busy.' });
    this.busy = true;

    let request: DraftPreviewRequest;
    try {
      request = JSON.parse(await readBody(req, maxBodyBytes));
    } catch (error) {
      const status = error instanceof PayloadTooLargeError ? 413 : 400;
      this.busy = false;
      return json(res, status, { error: status === 413 ? 'Request body is too large.' : 'Invalid JSON request.' });
    }

    try {
      const build = await this.build(request);
      return json(res, 200, build);
    } catch (error) {
      if (error instanceof RuntimeHttpError) return json(res, error.status, { error: error.message });
      return json(res, 500, { error: error instanceof Error ? error.message : 'Draft preview failed.' });
    } finally {
      this.busy = false;
    }
  }

  serveArtifact(req: IncomingMessage, res: ServerResponse, pathname: string) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      res.end();
      return true;
    }
    if (!pathname.startsWith('/drafts/')) return false;
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length < 3 || parts[0] !== 'drafts') {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
    const [, sessionId, revision, ...rest] = parts;
    if (!validSessionId(sessionId) || !/^[a-f0-9]{64}$/.test(revision)) {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
    const root = resolve(this.artifactRoot, sessionId, revision);
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
    const relativePath = rest.length ? rest.join('/') : 'index.html';
    serveStaticFile(req, res, root, relativePath);
    return true;
  }

  async build(request: DraftPreviewRequest): Promise<DraftBuildSuccess> {
    validateRequest(request);
    const normalizedFiles = normalizeFiles(request.files);
    const revision = createHash('sha256')
      .update(JSON.stringify({ repo: request.repo, branch: request.branch, baseCommit: request.baseCommit, files: normalizedFiles }))
      .digest('hex');
    const artifactDir = resolve(this.artifactRoot, request.sessionId, revision);
    const sources = this.sourceSnapshot(normalizedFiles);
    if (existsSync(join(artifactDir, 'index.html'))) {
      return { revision, previewUrl: `${this.previewOrigin}/drafts/${request.sessionId}/${revision}/`, sources };
    }

    const workRoot = mkdtempSync(join(tmpdir(), 'ase-draft-'));
    const sourceDir = join(workRoot, 'project');
    const outputDir = join(sourceDir, 'preview-dist');
    const viteCacheDir = join(workRoot, 'vite-cache');
    const stagedArtifact = join(this.artifactRoot, request.sessionId, `${revision}.${randomUUID()}.tmp`);
    try {
      await copyBaseline(this.fixtureRoot, sourceDir);
      await cp(join(this.fixtureRoot, 'node_modules/.vite'), viteCacheDir, { recursive: true, verbatimSymlinks: true });
      assertNoSymlinks(viteCacheDir);
      for (const file of normalizedFiles) {
        const target = resolve(sourceDir, file.path);
        ensureInside(sourceDir, target);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.content);
      }
      await runAstroBuild({
        fixtureRoot: this.fixtureRoot,
        sourceDir,
        outputDir,
        viteCacheDir,
        base: `/drafts/${request.sessionId}/${revision}/`,
      });
      mkdirSync(dirname(stagedArtifact), { recursive: true });
      assertTreeWithinLimit(outputDir, maxOutputBytes, maxOutputFiles);
      await cp(outputDir, stagedArtifact, { recursive: true, verbatimSymlinks: true });
      assertNoSymlinks(stagedArtifact);
      mkdirSync(dirname(artifactDir), { recursive: true });
      if (!existsSync(artifactDir)) renameSync(stagedArtifact, artifactDir);
      this.recordArtifact({ sessionId: request.sessionId, revision, dir: artifactDir, createdAt: Date.now() });
      return { revision, previewUrl: `${this.previewOrigin}/drafts/${request.sessionId}/${revision}/`, sources };
    } catch (error) {
      if (error instanceof RuntimeHttpError) throw error;
      throw new RuntimeHttpError(422, error instanceof Error ? error.message : 'Astro build failed.');
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
      rmSync(stagedArtifact, { recursive: true, force: true });
    }
  }

  private sourceSnapshot(files: DraftFile[]) {
    const snapshot = new Map<string, string>();
    collectSources(this.fixtureRoot, snapshot);
    for (const file of files) snapshot.set(file.path, file.content);
    return Object.fromEntries([...snapshot.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }

  private recordArtifact(record: BuildRecord) {
    this.artifacts.push(record);
    const now = Date.now();
    for (const stale of this.artifacts.filter((artifact) => now - artifact.createdAt > maxArtifactAgeMs)) this.removeArtifact(stale);
    const sessions = new Set(this.artifacts.map((artifact) => artifact.sessionId));
    for (const sessionId of sessions) {
      const sessionArtifacts = this.artifacts.filter((artifact) => artifact.sessionId === sessionId);
      sessionArtifacts.sort((a, b) => b.createdAt - a.createdAt);
      for (const stale of sessionArtifacts.slice(maxArtifactsPerSession)) this.removeArtifact(stale);
    }
    const newestBySession = [...sessions]
      .map((sessionId) => this.artifacts.filter((artifact) => artifact.sessionId === sessionId).sort((a, b) => b.createdAt - a.createdAt)[0])
      .filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const staleSession of newestBySession.slice(maxSessions)) {
      for (const artifact of this.artifacts.filter((item) => item.sessionId === staleSession.sessionId)) this.removeArtifact(artifact);
    }
  }

  private removeArtifact(record: BuildRecord) {
    rmSync(record.dir, { recursive: true, force: true });
    const index = this.artifacts.indexOf(record);
    if (index >= 0) this.artifacts.splice(index, 1);
  }
}

async function runAstroBuild(options: { fixtureRoot: string; sourceDir: string; outputDir: string; viteCacheDir: string; base: string }) {
  const astroPackage = join(options.fixtureRoot, 'node_modules/astro');
  const astroCli = JSON.parse(readFileSync(join(astroPackage, 'package.json'), 'utf8')).bin.astro;
  const nodePath = process.execPath;
  const buildScript = `/project/node_modules/astro/${astroCli}`;
  const args = [
    '--unshare-all',
    '--die-with-parent',
    '--ro-bind', '/usr', '/usr',
    '--symlink', 'usr/lib', '/lib',
    '--symlink', 'usr/lib64', '/lib64',
    '--proc', '/proc',
    '--dev', '/dev',
    '--size', '1073741824',
    '--tmpfs', '/tmp',
    '--bind', options.sourceDir, '/project',
    '--ro-bind', resolve(options.fixtureRoot, 'node_modules'), '/project/node_modules',
    '--bind', options.viteCacheDir, '/project/node_modules/.vite',
    '--chdir', '/project',
    '--clearenv',
    '--setenv', 'PATH', '/usr/bin:/bin',
    '--setenv', 'HOME', '/tmp',
    '--setenv', 'TMPDIR', '/tmp',
    '--setenv', 'ASTRO_TELEMETRY_DISABLED', '1',
    '--setenv', 'RAYON_NUM_THREADS', '2',
    '--setenv', 'REVISION_SHA', demoDraftBaseline.baseCommit,
    '--setenv', 'REVISION_REF', demoDraftBaseline.branch,
    '--',
    '/usr/bin/prlimit',
    '--nproc=1024',
    '--nofile=256',
    '--fsize=33554432',
    '--as=17179869184',
    nodePath,
    '--max-old-space-size=768',
    '--disable-wasm-trap-handler',
    buildScript,
    'build',
    '--config', '.astro-editor/astro.preview.config.mjs',
    '--outDir', './preview-dist',
    '--base', options.base,
  ];
  try {
    await execFileAsync('bwrap', args, {
      env: {},
      timeout: buildTimeoutMs,
      maxBuffer: 1_000_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Astro build failed.';
    throw new RuntimeHttpError(422, message);
  }
}

function validateRequest(request: DraftPreviewRequest) {
  if (!request || typeof request !== 'object') throw new RuntimeHttpError(400, 'Invalid draft preview request.');
  if (request.repo !== demoDraftBaseline.repo || request.branch !== demoDraftBaseline.branch || request.baseCommit !== demoDraftBaseline.baseCommit) {
    throw new RuntimeHttpError(409, 'Unsupported draft preview baseline.');
  }
  if (!validSessionId(request.sessionId)) throw new RuntimeHttpError(400, 'Invalid session ID.');
  if (!Array.isArray(request.files) || request.files.length > maxFiles) throw new RuntimeHttpError(413, 'Too many draft files.');
}

function normalizeFiles(files: DraftFile[]) {
  const seen = new Set<string>();
  let total = 0;
  return files.map((file) => {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') throw new RuntimeHttpError(400, 'Invalid draft file.');
    const path = normalizeDraftPath(file.path);
    if (seen.has(path)) throw new RuntimeHttpError(400, 'Duplicate draft file.');
    seen.add(path);
    const bytes = Buffer.byteLength(file.content);
    total += bytes;
    if (bytes > maxFileBytes || total > maxTotalFileBytes) throw new RuntimeHttpError(413, 'Draft source is too large.');
    return { path, content: file.content };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function normalizeDraftPath(path: string) {
  if (path.includes('\0') || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) throw new RuntimeHttpError(400, 'Unsafe draft path.');
  const normalized = path.split('/').filter(Boolean).join('/');
  if (normalized !== path || normalized.includes('..')) throw new RuntimeHttpError(400, 'Unsafe draft path.');
  if (!allowedSourceRoots.some((root) => normalized.startsWith(root))) throw new RuntimeHttpError(400, 'Unsupported draft path.');
  if (!allowedExtensions.has(extname(normalized))) throw new RuntimeHttpError(400, 'Unsupported draft file type.');
  return normalized;
}

async function copyBaseline(fixtureRoot: string, sourceDir: string) {
  mkdirSync(sourceDir, { recursive: true });
  for (const name of ['src', 'public', '.astro-editor', 'package.json', 'astro.config.mjs']) {
    await cp(join(fixtureRoot, name), join(sourceDir, name), { recursive: true, verbatimSymlinks: true });
  }
  assertNoSymlinks(join(sourceDir, 'src'));
  assertNoSymlinks(join(sourceDir, 'public'));
  assertNoSymlinks(join(sourceDir, '.astro-editor'));
}

function collectSources(root: string, snapshot: Map<string, string>, relativePath = '') {
  const absolute = join(root, relativePath);
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (!relativePath && !['src', '.astro-editor'].includes(entry.name)) continue;
    const full = join(root, path);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) collectSources(root, snapshot, path);
    else if (allowedEditorFiles.has(path) || (path.startsWith('src/') && allowedExtensions.has(extname(path)))) {
      snapshot.set(path, readFileSync(full, 'utf8'));
    }
  }
}

function assertNoSymlinks(root: string) {
  if (!existsSync(root)) return;
  const info = lstatSync(root);
  if (info.isSymbolicLink()) throw new RuntimeHttpError(400, 'Symlinks are not allowed.');
  if (!info.isDirectory()) return;
  for (const entry of readdirSync(root)) assertNoSymlinks(join(root, entry));
}

function ensureInside(root: string, target: string) {
  const rel = relative(root, target);
  if (rel.startsWith('..') || rel === '..' || rel.includes(`..${sep}`) || rel === '') throw new RuntimeHttpError(400, 'Unsafe draft path.');
  if (target !== root && !target.startsWith(root + sep)) throw new RuntimeHttpError(400, 'Unsafe draft path.');
}

function assertTreeWithinLimit(root: string, limit: number, maxFiles: number) {
  let total = 0;
  let files = 0;
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const info = lstatSync(path);
      if (info.isSymbolicLink()) throw new RuntimeHttpError(422, 'Build output contains a symlink.');
      if (info.isDirectory()) visit(path);
      else if (info.isFile()) {
        files++;
        if (files > maxFiles) throw new RuntimeHttpError(422, 'Build output has too many files.');
        total += info.size;
        if (total > limit) throw new RuntimeHttpError(422, 'Build output is too large.');
      }
    }
  };
  visit(root);
}

function readBody(req: IncomingMessage, limit: number) {
  return new Promise<string>((resolvePromise, reject) => {
    let size = 0;
    let done = false;
    const chunks: Buffer[] = [];
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      req.destroy();
      finish(() => reject(new Error('Request body timed out.')));
    }, bodyReadTimeoutMs);
    req.on('data', (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        finish(() => reject(new PayloadTooLargeError()));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish(() => resolvePromise(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', (error) => finish(() => reject(error)));
  });
}

function serveStaticFile(req: IncomingMessage, res: ServerResponse, root: string, relativePath: string) {
  try {
    const decoded = decodeURIComponent(relativePath);
    if (decoded.includes('\0')) throw new Error('bad path');
    let file = resolve(root, decoded);
    if (file !== root && !file.startsWith(root + sep)) throw new Error('bad path');
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file) || !statSync(file).isFile() || lstatSync(file).isSymbolicLink()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const type = contentTypes[extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*' });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(value));
}

function validSessionId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

class PayloadTooLargeError extends Error {}

class RuntimeHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
