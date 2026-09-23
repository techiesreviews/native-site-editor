import { createHash, randomUUID } from "node:crypto";
import { execFile, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { buildSignature, type DraftBuildSuccess, type DraftFile, type DraftPreviewAvailability, type DraftPreviewRequest } from "../shared/draft-preview.ts";

export interface WarmPreviewRuntimeOptions {
  projectRoot: string;
  baseline: Pick<DraftPreviewRequest, "repo" | "branch" | "baseCommit">;
  previewOrigin?: string;
  fixtureRoot?: string;
  routes?: string[];
  host?: string;
  port?: number;
  devPort?: number;
  maxQueue?: number;
  maxRevisions?: number;
  maxAssets?: number;
  maxAssetBytes?: number;
}

export type WarmPreviewAvailability = DraftPreviewAvailability & { mode: "warm" };

export interface WarmPreviewRuntime {
  previewOrigin: string;
  availability(): WarmPreviewAvailability;
  apply(request: DraftPreviewRequest): Promise<DraftBuildSuccess>;
  handlePreview(req: IncomingMessage, res: ServerResponse): Promise<void>;
  close(): Promise<void>;
}

interface RevisionRecord {
  revision: string;
  files: DraftFile[];
  sources: Record<string, string>;
  pages: Map<string, string>;
  assets: Map<string, AssetRecord>;
}

interface AssetRecord {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

const allowedExtensions = new Set([".astro", ".css", ".json", ".mjs", ".js", ".ts", ".tsx", ".md", ".mdx"]);
const allowedEditorFiles = new Set([
  ".astro-editor/annotate.mjs",
  ".astro-editor/text-attributes.mjs",
  ".astro-editor/text-options.mjs",
  ".astro-editor/text-attributes.d.mts",
  ".astro-editor/text-options.d.mts",
]);
const maxFiles = 80;
const maxFileBytes = 200_000;
const maxTotalFileBytes = 750_000;
const startupTimeoutMs = 60_000;
const readinessTimeoutMs = 20_000;
const defaultMaxAssetBytes = 8_000_000;
const maxPageBytes = 2_000_000;
const controlTimeoutMs = 5_000;
const closeQueueTimeoutMs = 2_000;

export async function createWarmPreviewRuntime(options: WarmPreviewRuntimeOptions): Promise<WarmPreviewRuntime> {
  const projectRoot = resolve(options.projectRoot);
  const fixtureRoot = resolve(options.fixtureRoot ?? projectRoot);
  const host = options.host ?? "127.0.0.1";
  assertLoopbackHost(host);
  const port = options.port ?? 4394;
  const devPort = options.devPort ?? port + 1;
  const previewOrigin = (options.previewOrigin ?? `http://${host}:${port}`).replace(/\/$/, "");
  assertLoopbackOrigin(previewOrigin);
  const routes = normalizeRoutes(options.routes ?? discoverStaticRoutes(fixtureRoot));
  const maxQueue = options.maxQueue ?? 4;
  const maxRevisions = options.maxRevisions ?? 8;
  const maxAssets = options.maxAssets ?? 120;
  const maxAssetBytes = options.maxAssetBytes ?? defaultMaxAssetBytes;
  const workRoot = mkdtempSync(join(tmpdir(), "ase-warm-preview-"));
  const baselineRoot = join(workRoot, "baseline");
  const runtimeRoot = join(workRoot, "runtime");
  const baseline = options.baseline;
  const controlToken = randomUUID();

  const devOrigin = `http://${host}:${devPort}`;
  let dev: ReturnType<typeof startAstroDev> | undefined;
  let closed = false;
  let boundSessionId: string | undefined;
  let activeFiles: DraftFile[] = [];
  let queueDepth = 0;
  let writeQueue = Promise.resolve();
  let serverListening = false;
  const revisions = new Map<string, RevisionRecord>();

  const server = createServer((req, res) => {
    void handlePreview(req, res);
  });

  try {
    await copyTrustedProject(fixtureRoot, baselineRoot);
    await copyTrustedProject(baselineRoot, runtimeRoot);
    writeWarmPreviewConfig(runtimeRoot, controlToken, fixtureRoot);
    symlinkSync(join(fixtureRoot, "node_modules"), join(runtimeRoot, "node_modules"), "dir");
    dev = startAstroDev({ fixtureRoot, runtimeRoot, host, devPort, baseline });
    await listen(server, port, host);
    serverListening = true;
    await waitForDevReady(devOrigin, () => dev?.diagnostics() ?? { output: "" });
    const baselineRevision = revisionFor({ sessionId: "baseline", ...baseline, files: [] });
    writeRuntimeSources({ baselineRoot, runtimeRoot, previousFiles: [], nextFiles: [] });
    await invalidateDevGraph(devOrigin, controlToken);
    const baselineRecord = await captureRevision({ revision: baselineRevision, files: [], baselineRoot, devOrigin, routes, maxAssets, maxAssetBytes });
    revisions.set(baselineRevision, baselineRecord);
    activeFiles = [];
  } catch (error) {
    await close();
    throw error;
  }

  function availability(): WarmPreviewAvailability {
    return { available: true, previewOrigin, mode: "warm" };
  }

  async function apply(request: DraftPreviewRequest): Promise<DraftBuildSuccess> {
    if (closed) throw new RuntimeHttpError(410, "Warm preview runtime is closed.");
    if (queueDepth >= maxQueue) throw new RuntimeHttpError(429, "Warm preview runtime queue is full.");
    queueDepth++;
    try {
      let result!: DraftBuildSuccess;
      writeQueue = writeQueue.then(async () => {
        result = await applyNow(request);
      }, async () => {
        result = await applyNow(request);
      });
      await writeQueue;
      return result;
    } finally {
      queueDepth--;
    }
  }

  async function applyNow(request: DraftPreviewRequest): Promise<DraftBuildSuccess> {
    if (closed) throw new RuntimeHttpError(410, "Warm preview runtime is closed.");
    validateRequest(request, baseline);
    if (!boundSessionId) boundSessionId = request.sessionId;
    if (request.sessionId !== boundSessionId) throw new RuntimeHttpError(409, "Warm preview runtime already has an active session.");
    const files = normalizeFiles(request.files);
    const revision = revisionFor({ ...request, files });
    const existing = revisions.get(revision);
    if (existing) {
      writeRuntimeSources({ baselineRoot, runtimeRoot, previousFiles: activeFiles, nextFiles: existing.files });
      await invalidateDevGraph(devOrigin, controlToken);
      if (closed) throw new RuntimeHttpError(410, "Warm preview runtime is closed.");
      await waitForRoutes(devOrigin, existing.pages.keys());
      if (closed) throw new RuntimeHttpError(410, "Warm preview runtime is closed.");
      activeFiles = existing.files;
      return success(existing, previewOrigin);
    }

    const previousFiles = activeFiles;
    writeRuntimeSources({ baselineRoot, runtimeRoot, previousFiles, nextFiles: files });
    try {
      await invalidateDevGraph(devOrigin, controlToken);
      if (closed) throw new RuntimeHttpError(410, "Warm preview runtime is closed.");
      const record = await captureRevision({ revision, files, baselineRoot, devOrigin, routes, maxAssets, maxAssetBytes });
      if (closed) throw new RuntimeHttpError(410, "Warm preview runtime is closed.");
      revisions.set(revision, record);
      pruneRevisions(revisions, revision, maxRevisions);
      activeFiles = files;
      return success(record, previewOrigin);
    } catch (error) {
      if (!closed) {
        writeRuntimeSources({ baselineRoot, runtimeRoot, previousFiles: files, nextFiles: previousFiles });
        await invalidateDevGraph(devOrigin, controlToken).catch(() => undefined);
      }
      throw error instanceof RuntimeHttpError ? error : new RuntimeHttpError(422, error instanceof Error ? error.message : "Astro render failed.");
    }
  }

  async function handlePreview(req: IncomingMessage, res: ServerResponse) {
    try {
      if (!req.url) return notFound(res);
      const url = new URL(req.url, previewOrigin);
      if (req.method === "GET" && url.pathname === "/api/draft-preview") return json(res, 200, availability());
      if (req.method !== "GET" && req.method !== "HEAD") return methodNotAllowed(res);
      const match = /^\/revisions\/([a-f0-9]{64})(\/.*)?$/.exec(url.pathname);
      if (!match) return notFound(res);
      const record = revisions.get(match[1]);
      if (!record) return notFound(res);
      const pathname = normalizePreviewPath(match[2] ?? "/");
      if (isHtmlRoute(pathname)) return servePage(req, res, record, pathname);
      return serveAsset(req, res, record, normalizePreviewPath(`${match[2] ?? "/"}${url.search}`));
    } catch (error) {
      json(res, error instanceof RuntimeHttpError ? error.status : 500, { error: error instanceof Error ? error.message : "Warm preview failed." });
    }
  }

  async function close() {
    if (closed) return;
    closed = true;
    await Promise.race([writeQueue.catch(() => undefined), timeout(closeQueueTimeoutMs)]);
    if (serverListening) await closeServer(server);
    await dev?.close();
    rmSync(workRoot, { recursive: true, force: true });
  }

  return { previewOrigin, availability, apply, handlePreview, close };
}

function success(record: RevisionRecord, previewOrigin: string): DraftBuildSuccess {
  return { revision: record.revision, previewUrl: `${previewOrigin}/revisions/${record.revision}/`, sources: record.sources };
}

async function captureRevision(options: { revision: string; files: DraftFile[]; baselineRoot: string; devOrigin: string; routes: string[]; maxAssets: number; maxAssetBytes: number }): Promise<RevisionRecord> {
  await waitForRoutes(options.devOrigin, options.routes);
  const pages = new Map<string, string>();
  const assets = new Map<string, AssetRecord>();
  for (const route of options.routes) {
    const html = await renderedPage(options.devOrigin, route);
    const stripped = stripDevScripts(html);
    assertNoUnsupportedAbsoluteAssets(stripped);
    pages.set(route, rewriteHtmlForRevision(stripped, options.revision));
  }
  await captureAssets({ origin: options.devOrigin, revision: options.revision, pages, assets, maxAssets: options.maxAssets, maxAssetBytes: options.maxAssetBytes });
  return { revision: options.revision, files: options.files, sources: sourceSnapshot(options.baselineRoot, options.files), pages, assets };
}

function startAstroDev(options: { fixtureRoot: string; runtimeRoot: string; host: string; devPort: number; baseline: Pick<DraftPreviewRequest, "branch" | "baseCommit"> }) {
  let output = "";
  let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  const dev = execFile(process.execPath, [astroCli(options.fixtureRoot), "dev", "--ignore-lock", "--host", options.host, "--port", String(options.devPort), "--config", ".astro-editor/warm-preview.config.mjs"], {
    cwd: options.runtimeRoot,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: tmpdir(),
      TMPDIR: tmpdir(),
      ASTRO_TELEMETRY_DISABLED: "1",
      REVISION_SHA: options.baseline.baseCommit,
      REVISION_REF: options.baseline.branch,
    },
  });
  const remember = (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-4000);
  };
  dev.stdout?.on("data", remember);
  dev.stderr?.on("data", remember);
  dev.once("exit", (code, signal) => {
    exit = { code, signal };
  });
  return {
    diagnostics: () => ({ output, exit }),
    close: () => closeChild(dev),
  };
}

function astroCli(fixtureRoot: string) {
  const astroPackage = join(fixtureRoot, "node_modules/astro/package.json");
  const bin = JSON.parse(readFileSync(astroPackage, "utf8")).bin.astro;
  return join(fixtureRoot, "node_modules/astro", bin);
}

async function copyTrustedProject(fixtureRoot: string, targetRoot: string) {
  mkdirSync(targetRoot, { recursive: true });
  for (const name of ["src", "public", ".astro-editor", "package.json", "astro.config.mjs"]) {
    await cp(join(fixtureRoot, name), join(targetRoot, name), { recursive: true, verbatimSymlinks: true });
  }
  assertNoSymlinks(join(targetRoot, "src"));
  assertNoSymlinks(join(targetRoot, "public"));
  assertNoSymlinks(join(targetRoot, ".astro-editor"));
}

function writeWarmPreviewConfig(runtimeRoot: string, controlToken: string, fixtureRoot: string) {
  writeFileSync(join(runtimeRoot, ".astro-editor/warm-preview.config.mjs"), `
import base from "../astro.config.mjs";
import annotations from "./annotate.mjs";

const warmPreviewControl = {
  name: "astro-site-editor-warm-preview-control",
  configureServer(server) {
    server.middlewares.use("/__ase_warm/invalidate", (req, res) => {
      const url = new URL(req.url ?? "", "http://127.0.0.1");
      if (url.searchParams.get("token") !== ${JSON.stringify(controlToken)}) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      server.moduleGraph.invalidateAll();
      server.ws.send({ type: "full-reload" });
      res.writeHead(204);
      res.end();
    });
  },
};

export default {
  ...base,
  devToolbar: { enabled: false },
  integrations: [...(base.integrations ?? []), annotations()],
  vite: {
    ...(base.vite ?? {}),
    cacheDir: ".warm-vite-cache",
    plugins: [...(base.vite?.plugins ?? []), warmPreviewControl],
    server: {
      ...(base.vite?.server ?? {}),
      hmr: false,
      strictPort: true,
      fs: {
        ...(base.vite?.server?.fs ?? {}),
        allow: [...(base.vite?.server?.fs?.allow ?? []), ${JSON.stringify(realpathSync(runtimeRoot))}, ${JSON.stringify(realpathSync(join(fixtureRoot, "node_modules")))}],
      },
    },
  },
};
`);
}

function writeRuntimeSources(options: { baselineRoot: string; runtimeRoot: string; previousFiles: DraftFile[]; nextFiles: DraftFile[] }) {
  const next = new Map(options.nextFiles.map((file) => [file.path, file.content]));
  const touched = new Set([...sourcePaths(options.baselineRoot), ...options.previousFiles.map((file) => file.path), ...options.nextFiles.map((file) => file.path)]);
  for (const path of [...touched].sort()) {
    const target = resolve(options.runtimeRoot, path);
    ensureInside(options.runtimeRoot, target);
    const baselinePath = join(options.baselineRoot, path);
    if (!next.has(path) && !existsSync(baselinePath)) {
      rmSync(target, { force: true });
      continue;
    }
    const content = next.get(path) ?? readFileSync(baselinePath, "utf8");
    if (existsSync(target) && readFileSync(target, "utf8") === content) {
      const now = new Date();
      utimesSync(target, now, now);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    const now = new Date();
    utimesSync(target, now, now);
  }
}

function sourcePaths(root: string) {
  const srcRoot = join(root, "src");
  const sources: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (allowedExtensions.has(extname(entry.name))) sources.push(relative(root, full).split(sep).join("/"));
    }
  };
  visit(srcRoot);
  return sources;
}

function rewriteHtmlForRevision(html: string, revision: string) {
  return rewriteTextReferences(html, revision);
}

function assetPathsFromHtml(html: string) {
  const paths = new Set<string>();
  for (const match of html.matchAll(/(?:src|href|component-url|renderer-url|before-hydration-url)=["']\/revisions\/[a-f0-9]{64}([^"']+)/g)) {
    const path = htmlUnescape(match[1]);
    if (supportedAssetPath(path)) paths.add(path);
    else throw new RuntimeHttpError(422, `Warm preview cannot snapshot asset ${path}.`);
  }
  return paths;
}

async function captureAssets(options: { origin: string; revision: string; pages: Map<string, string>; assets: Map<string, AssetRecord>; maxAssets: number; maxAssetBytes: number }) {
  const pending = [...options.pages.values()].flatMap((html) => [...assetPathsFromHtml(html)]);
  let totalBytes = 0;
  for (let index = 0; index < pending.length; index++) {
    const assetPath = pending[index];
    if (options.assets.has(assetPath)) continue;
    if (options.assets.size >= options.maxAssets) throw new RuntimeHttpError(422, "Warm preview asset graph is too large.");
    const asset = await fetchAsset(options.origin, assetPath, options.maxAssetBytes);
    totalBytes += asset.body.byteLength;
    if (totalBytes > options.maxAssetBytes) throw new RuntimeHttpError(422, "Warm preview asset graph is too large.");
    if (asset.status !== 200) throw new RuntimeHttpError(422, `Warm preview could not snapshot asset ${assetPath}: HTTP ${asset.status}.`);
    options.assets.set(assetPath, rewriteAsset(asset, assetPath, options.revision));
    if (!isTextAsset(assetPath, asset)) continue;
    for (const child of assetReferences(asset.body.toString("utf8"), assetPath)) {
      if (!options.assets.has(child) && !pending.includes(child)) pending.push(child);
    }
  }
}

async function fetchAsset(origin: string, path: string, maxBytes: number): Promise<AssetRecord> {
  const response = await fetchWithTimeout(new URL(path, origin), readinessTimeoutMs);
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("access-control-allow-origin", "*");
  headers.delete("content-encoding");
  headers.delete("transfer-encoding");
  headers.delete("etag");
  const body = await readResponseBody(response, maxBytes, `Warm preview asset ${path} is too large.`);
  headers.set("content-length", String(body.byteLength));
  return { status: response.status, headers: Object.fromEntries(headers.entries()), body };
}

function rewriteAsset(asset: AssetRecord, path: string, revision: string): AssetRecord {
  if (!isTextAsset(path, asset)) return asset;
  let source = asset.body.toString("utf8");
  if (path.startsWith("/@vite/client")) source = disableViteHmrTransport(source);
  const body = Buffer.from(rewriteTextReferences(source, revision));
  return { ...asset, body, headers: { ...asset.headers, "content-length": String(body.byteLength) } };
}

function rewriteTextReferences(text: string, revision: string) {
  return text.replace(/(["'(=])((?:\/)(?:_astro|_image|images|src|@id|@fs|@vite|node_modules|\.warm-vite-cache)(?:\/|\?)[^"')\s]+)/g, `$1/revisions/${revision}$2`);
}

function assetReferences(text: string, fromPath: string) {
  const refs = new Set<string>();
  for (const match of text.matchAll(/(?:import\s*\(\s*|import\s+[^"']*?from\s*|import\s*|export\s+[^"']*?from\s*|url\(\s*|new URL\(\s*)["']([^"']+)["']/g)) {
    const ref = resolveAssetReference(match[1], fromPath);
    if (ref) refs.add(ref);
  }
  for (const match of text.matchAll(/["'](\/(?:_astro|_image|images|src|@id|@fs|@vite|node_modules|\.warm-vite-cache)(?:\/|\?)[^"']+)["']/g)) {
    refs.add(match[1]);
  }
  if (/import\s*\(\s*(?!["'])/.test(text) && !devRuntimeAsset(fromPath)) throw new RuntimeHttpError(422, `Warm preview asset graph contains a non-literal dynamic import in ${fromPath}.`);
  return refs;
}

function devRuntimeAsset(path: string) {
  return path.startsWith("/@vite/") || path.startsWith("/@id/") || path.startsWith("/@fs/") || path.startsWith("/.warm-vite-cache/") || path.includes("/node_modules/");
}

function htmlUnescape(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
}

function resolveAssetReference(ref: string, fromPath: string) {
  if (ref.startsWith("/")) return supportedAssetPath(ref) ? ref : undefined;
  if (!ref.startsWith(".")) return undefined;
  const base = fromPath.split("?")[0];
  const url = new URL(ref, `http://warm.local${base}`);
  const resolved = `${url.pathname}${url.search}`;
  return supportedAssetPath(resolved) ? resolved : undefined;
}

function supportedAssetPath(path: string) {
  return /^\/(?:_astro|_image|images|src|@id|@fs|@vite|node_modules|\.warm-vite-cache)(?:\/|\?)/.test(path);
}

function disableViteHmrTransport(source: string) {
  const hmrConnect = "transport.connect(createHMRHandler(handleMessage));";
  if (!source.includes(hmrConnect)) throw new RuntimeHttpError(422, "Unsupported Vite client shape: HMR connection hook not found.");
  return source.replace(hmrConnect, "/* Astro Site Editor warm preview disables Vite HMR transport for immutable snapshots. */");
}

function assertNoUnsupportedAbsoluteAssets(html: string) {
  for (const match of html.matchAll(/\b(?:src|href)=["'](\/[^"']+)["']/g)) {
    const path = htmlUnescape(match[1]);
    if (supportedAssetPath(path) || isHtmlNavigation(path)) continue;
    if (/\.[a-z0-9]{2,8}(?:[?#]|$)/i.test(path)) throw new RuntimeHttpError(422, `Warm preview cannot snapshot asset ${path}.`);
  }
}

function isHtmlNavigation(path: string) {
  return path === "/" || path.endsWith("/") || path.endsWith(".html") || path.startsWith("/#") || path.startsWith("/?");
}

function isTextAsset(path: string, asset: AssetRecord) {
  const type = asset.headers["content-type"] ?? "";
  return type.startsWith("text/") || type.includes("javascript") || type.includes("json") || [".js", ".mjs", ".ts", ".tsx", ".css", ".json"].includes(extname(path.split("?")[0]));
}

async function fetchWithTimeout(input: URL | string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseBody(response: Response, maxBytes: number, tooLargeMessage: string) {
  const reader = response.body?.getReader();
  if (!reader) {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > maxBytes) throw new RuntimeHttpError(422, tooLargeMessage);
    return body;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RuntimeHttpError(422, tooLargeMessage);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

function validateRequest(request: DraftPreviewRequest, baseline: Pick<DraftPreviewRequest, "repo" | "branch" | "baseCommit">) {
  if (!request || typeof request !== "object") throw new RuntimeHttpError(400, "Invalid draft preview request.");
  if (request.repo !== baseline.repo || request.branch !== baseline.branch || request.baseCommit !== baseline.baseCommit) throw new RuntimeHttpError(409, "Unsupported warm preview baseline.");
  if (!validSessionId(request.sessionId)) throw new RuntimeHttpError(400, "Invalid session ID.");
  if (!Array.isArray(request.files) || request.files.length > maxFiles) throw new RuntimeHttpError(413, "Too many draft files.");
}

function assertLoopbackHost(host: string) {
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new RuntimeHttpError(400, "Warm preview host must be loopback.");
}

function assertLoopbackOrigin(origin: string) {
  const url = new URL(origin);
  assertLoopbackHost(url.hostname);
}

function discoverStaticRoutes(root: string) {
  const pagesRoot = join(root, "src/pages");
  if (!existsSync(pagesRoot)) throw new RuntimeHttpError(400, "Warm preview project must have src/pages.");
  const routes: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if ([".astro", ".md", ".mdx"].includes(extname(entry.name))) {
        const relativePage = relative(pagesRoot, full).split(sep).join("/");
        if (/\[[^\]]+\]/.test(relativePage)) continue;
        routes.push(routeForPage(relativePage));
      }
    }
  };
  visit(pagesRoot);
  return routes;
}

function routeForPage(page: string) {
  const withoutExt = page.replace(/\.(astro|md|mdx)$/u, "");
  const route = withoutExt === "index" ? "/" : withoutExt.endsWith("/index") ? `/${withoutExt.slice(0, -"index".length)}` : `/${withoutExt}/`;
  return route.replace(/\/+/g, "/");
}

function normalizeRoutes(routes: string[]) {
  const normalized = [...new Set(routes.map((route) => route.startsWith("/") ? route : `/${route}`))]
    .map((route) => route.endsWith("/") || route.endsWith(".html") ? route : `${route}/`)
    .sort();
  if (!normalized.length) throw new RuntimeHttpError(400, "Warm preview needs at least one static route.");
  return normalized;
}

function normalizeFiles(files: DraftFile[]) {
  const seen = new Set<string>();
  let total = 0;
  return files.map((file) => {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") throw new RuntimeHttpError(400, "Invalid draft file.");
    const path = normalizeDraftPath(file.path);
    if (seen.has(path)) throw new RuntimeHttpError(400, "Duplicate draft file.");
    seen.add(path);
    const bytes = Buffer.byteLength(file.content);
    total += bytes;
    if (bytes > maxFileBytes || total > maxTotalFileBytes) throw new RuntimeHttpError(413, "Draft source is too large.");
    return { path, content: file.content };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function normalizeDraftPath(path: string) {
  if (path.includes("\0") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) throw new RuntimeHttpError(400, "Unsafe draft path.");
  const normalized = path.split("/").filter(Boolean).join("/");
  if (normalized !== path || normalized.includes("..")) throw new RuntimeHttpError(400, "Unsafe draft path.");
  if (!normalized.startsWith("src/")) throw new RuntimeHttpError(400, "Unsupported draft path.");
  if (!allowedExtensions.has(extname(normalized))) throw new RuntimeHttpError(400, "Unsupported draft file type.");
  return normalized;
}

function revisionFor(request: Pick<DraftPreviewRequest, "sessionId" | "repo" | "branch" | "baseCommit" | "files">) {
  return createHash("sha256").update(buildSignature(request)).digest("hex");
}

function sourceSnapshot(root: string, files: DraftFile[]) {
  const snapshot = new Map<string, string>();
  collectSources(root, snapshot);
  for (const file of files) snapshot.set(file.path, file.content);
  return Object.fromEntries([...snapshot.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function collectSources(root: string, snapshot: Map<string, string>, relativePath = "") {
  const absolute = join(root, relativePath);
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (!relativePath && !["src", ".astro-editor"].includes(entry.name)) continue;
    const full = join(root, path);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) collectSources(root, snapshot, path);
    else if (allowedEditorFiles.has(path) || (path.startsWith("src/") && allowedExtensions.has(extname(path)))) snapshot.set(path, readFileSync(full, "utf8"));
  }
}

async function waitForDevReady(origin: string, diagnostics: () => { output: string; exit?: { code: number | null; signal: NodeJS.Signals | null } }) {
  const until = Date.now() + startupTimeoutMs;
  let lastError = "";
  while (Date.now() < until) {
    try {
      const response = await fetchWithTimeout(origin, Math.max(1, Math.min(1_500, until - Date.now())));
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    const state = diagnostics();
    if (state.exit) throw new Error(`Astro dev server exited (${state.exit.code ?? state.exit.signal ?? "unknown"}): ${state.output.slice(-800)}`);
    await delay(150);
  }
  throw new Error(`Astro dev server was not ready: ${lastError} ${diagnostics().output.slice(-800)}`);
}

async function invalidateDevGraph(origin: string, token: string) {
  const url = new URL("/__ase_warm/invalidate", origin);
  url.searchParams.set("token", token);
  const response = await fetchWithTimeout(url, controlTimeoutMs);
  if (!response.ok) throw new RuntimeHttpError(500, `Warm preview invalidation failed with HTTP ${response.status}.`);
}

async function waitForRoutes(origin: string, routes: Iterable<string>) {
  for (const route of routes) await renderedPage(origin, route);
}

async function renderedPage(origin: string, path: string) {
  const until = Date.now() + readinessTimeoutMs;
  let last = "";
  while (Date.now() < until) {
    try {
      const url = new URL(path, origin);
      url.searchParams.set("ase-warm-preview", String(Date.now()));
      const response = await fetchWithTimeout(url, Math.max(1, Math.min(readinessTimeoutMs, until - Date.now())));
      last = (await readResponseBody(response, maxPageBytes, "Warm preview page is too large.")).toString("utf8");
      if (response.ok) return last;
      if (!response.ok) throw new RuntimeHttpError(422, `Astro dev server rejected draft with HTTP ${response.status}. Last response: ${last.slice(0, 240)}`);
    } catch (error) {
      if (error instanceof RuntimeHttpError) throw error;
      last = error instanceof Error ? error.message : String(error);
    }
    await delay(120);
  }
  throw new RuntimeHttpError(422, `Astro dev server did not render the warm preview. Last response: ${last.slice(0, 240)}`);
}

function stripDevScripts(html: string) {
  return html
    .replace(/<script\b[^>]*\bsrc=["'][^"']*astro[^"']*hmr[^"']*["'][^>]*><\/script>\s*/g, "");
}

function normalizePreviewPath(path: string) {
  const raw = path || "/";
  const queryAt = raw.indexOf("?");
  const pathname = queryAt >= 0 ? raw.slice(0, queryAt) : raw;
  const search = queryAt >= 0 ? raw.slice(queryAt) : "";
  const decodedPathname = decodeURIComponent(pathname);
  if (decodedPathname.includes("\0") || decodedPathname.includes("..") || search.includes("\0") || search.includes("..")) throw new RuntimeHttpError(400, "Unsafe preview path.");
  return `${decodedPathname.startsWith("/") ? decodedPathname : `/${decodedPathname}`}${search}`;
}

function isHtmlRoute(path: string) {
  return path === "/" || path.endsWith("/") || path.endsWith(".html");
}

function servePage(req: IncomingMessage, res: ServerResponse, record: RevisionRecord, path: string) {
  const route = path === "/index.html" ? "/" : path;
  const html = record.pages.get(route);
  if (!html) return notFound(res);
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
  res.end(req.method === "HEAD" ? undefined : html);
}

function serveAsset(req: IncomingMessage, res: ServerResponse, record: RevisionRecord, path: string) {
  const asset = record.assets.get(path) ?? record.assets.get(canonicalRetryAssetPath(path));
  if (!asset || asset.status !== 200) return notFound(res);
  res.writeHead(asset.status, asset.headers);
  res.end(req.method === "HEAD" ? undefined : asset.body);
}

function canonicalRetryAssetPath(path: string) {
  try {
    const url = new URL(path, "http://warm.local");
    url.searchParams.delete("astro-retry");
    return `${url.pathname}${url.search}`;
  } catch {
    return path;
  }
}

function assertNoSymlinks(root: string) {
  if (!existsSync(root)) return;
  const info = lstatSync(root);
  if (info.isSymbolicLink()) throw new RuntimeHttpError(400, "Symlinks are not allowed.");
  if (!info.isDirectory()) return;
  for (const entry of readdirSync(root)) assertNoSymlinks(join(root, entry));
}

function ensureInside(root: string, target: string) {
  const rel = relative(root, target);
  if (rel.startsWith("..") || rel === ".." || rel.includes(`..${sep}`) || rel === "") throw new RuntimeHttpError(400, "Unsafe draft path.");
  if (target !== root && !target.startsWith(root + sep)) throw new RuntimeHttpError(400, "Unsafe draft path.");
}

function pruneRevisions(revisions: Map<string, RevisionRecord>, current: string, maxRevisions: number) {
  for (const revision of [...revisions.keys()].slice(0, Math.max(0, revisions.size - maxRevisions))) {
    if (revision !== current) revisions.delete(revision);
  }
}

function listen(server: Server, port: number, host: string) {
  return new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolveListen();
    });
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}

async function closeChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolveDone) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolveDone();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveDone();
    });
  });
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(value));
}

function notFound(res: ServerResponse) {
  res.writeHead(404);
  res.end("Not found");
}

function methodNotAllowed(res: ServerResponse) {
  res.writeHead(405, { allow: "GET, HEAD" });
  res.end("Method not allowed");
}

function validSessionId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function delay(ms: number) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function timeout(ms: number) {
  return new Promise<void>((resolveTimeout) => {
    const timer = setTimeout(resolveTimeout, ms);
    timer.unref?.();
  });
}

class RuntimeHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
