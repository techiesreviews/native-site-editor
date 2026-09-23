import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { createServer as createHttpServer, type ServerResponse } from "node:http";
import { createServer, type Connect, type Plugin } from "vite";
import { warmPreviewProvider } from "../../scripts/warm-preview-provider.ts";
import { createWarmPreviewRuntime } from "../../scripts/warm-preview-runtime.ts";

const appPort = Number(process.env.ASE_WARM_PREVIEW_APP_PORT ?? 5190);
const previewPort = Number(process.env.ASE_WARM_PREVIEW_PORT ?? 5191);
const manualMode = process.env.ASE_WARM_PREVIEW_MANUAL === "1";
const manualBaselinePort = Number(process.env.ASE_WARM_PREVIEW_BASELINE_PORT ?? 5194);
const manualBaselineOrigin = process.env.ASE_WARM_PREVIEW_BASELINE_ORIGIN ?? `http://127.0.0.1:${manualBaselinePort}`;
const publicPreviewOrigin = process.env.ASE_WARM_PREVIEW_PUBLIC_ORIGIN;
const projectRoot = process.cwd();
const fixtureRoot = resolve(projectRoot, "fixtures/astro-starter");
const nativeFixtureRoot = resolve(projectRoot, "fixtures/native-starter");
const checkoutRoot = mkdtempSync(join(tmpdir(), "ase-warm-preview-checkout-"));
const baselineDist = mkdtempSync(join(tmpdir(), "ase-warm-preview-baseline-"));
const sourcePath = "src/pages/index.astro";
const logPath = resolve(projectRoot, ".scratch/warm-preview/browser.log");
const repo = {
  id: 42,
  name: "heading-starter",
  full_name: "lex/heading-starter",
  private: true,
  default_branch: "main",
  owner: { login: "lex", type: "User" },
};
// Second, browser-native sample repository. It has no Astro build: its sources
// are served straight from the fixture so the editor can exercise the native
// preview path (`.astro-editor/native.json`).
const nativeRepo = {
  id: 77,
  name: "native-starter",
  full_name: "lex/native-starter",
  private: true,
  default_branch: "main",
  owner: { login: "lex", type: "User" },
};
const nativeCommit = sha("native-starter-main");

// Recursively read a fixture directory into the shared blob/tree maps, keeping
// each path's sha namespaced by `prefix` so two repositories never collide.
function treeFrom(
  root: string,
  relative: string,
  prefix: string,
  top: string[],
  allow: (path: string) => boolean,
  blobs: Record<string, string>,
  trees: Record<string, { entries: object[] }>,
): object[] {
  const entries: object[] = [];
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (!relative && !top.includes(entry.name)) continue;
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const key = sha(prefix + path);
    if (entry.isDirectory()) {
      trees[key] = { entries: treeFrom(root, path, prefix, top, allow, blobs, trees) };
      entries.push({ path: entry.name, sha: key, type: "tree", mode: "040000" });
    } else if (allow(path)) {
      blobs[key] = readFileSync(join(root, path), "utf8");
      entries.push({ path: entry.name, sha: key, type: "blob", mode: "100644", size: blobs[key].length });
    }
  }
  return entries;
}

function nativeAllowedFile(path: string) {
  return [".html", ".css", ".json"].includes(extname(path));
}

function prepareTrustedCheckout() {
  mkdirSync(resolve(projectRoot, ".scratch/warm-preview"), { recursive: true });
  for (const name of ["src", "public", ".astro-editor", "package.json", "astro.config.mjs"]) {
    cpSync(join(fixtureRoot, name), join(checkoutRoot, name), { recursive: true });
  }
  symlinkSync(join(fixtureRoot, "node_modules"), join(checkoutRoot, "node_modules"), "dir");
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: checkoutRoot });
  execFileSync("git", ["config", "user.email", "warm-preview@example.test"], { cwd: checkoutRoot });
  execFileSync("git", ["config", "user.name", "Warm Preview"], { cwd: checkoutRoot });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/lex/heading-starter.git"], { cwd: checkoutRoot });
  execFileSync("git", ["add", "."], { cwd: checkoutRoot });
  execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: checkoutRoot });
}

function buildCommittedPreview() {
  const astroPackage = join(checkoutRoot, "node_modules/astro");
  const cli = JSON.parse(readFileSync(join(astroPackage, "package.json"), "utf8")).bin.astro;
  execFileSync(process.execPath, [
    join(astroPackage, cli),
    "build",
    "--config", ".astro-editor/astro.preview.config.mjs",
    "--outDir", baselineDist,
  ], {
    cwd: checkoutRoot,
    env: {
      ...process.env,
      ASTRO_TELEMETRY_DISABLED: "1",
      REVISION_SHA: headCommit(),
      REVISION_REF: "main",
    },
    stdio: "pipe",
    timeout: 90_000,
  });
}

function headCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkoutRoot, encoding: "utf8" }).trim();
}

function sha(path: string) {
  return createHash("sha1").update(path).digest("hex");
}

function tree(relative: string, blobs: Record<string, string>, trees: Record<string, { entries: object[] }>): object[] {
  const entries: object[] = [];
  for (const entry of readdirSync(join(checkoutRoot, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (!relative && !["src", ".astro-editor", "package.json", "astro.config.mjs"].includes(entry.name)) continue;
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (entry.isDirectory()) {
      trees[sha(path)] = { entries: tree(path, blobs, trees) };
      entries.push({ path: entry.name, sha: sha(path), type: "tree", mode: "040000" });
    } else if (allowedFile(path)) {
      blobs[sha(path)] = readFileSync(join(checkoutRoot, path), "utf8");
      entries.push({ path: entry.name, sha: sha(path), type: "blob", mode: "100644", size: blobs[sha(path)].length });
    }
  }
  return entries;
}

function allowedFile(path: string) {
  return path === ".astro-editor/preview.json" || [".astro", ".css", ".json", ".mjs", ".tsx", ".ts"].includes(extname(path));
}

function json(res: ServerResponse, status: number, value: unknown) {
  log(`server json ${status} ${JSON.stringify(value).slice(0, 500)}`);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

function serveStatic(res: ServerResponse, path: string) {
  log(`server static ${path}`);
  const relativePath = path.replace(/^\/__warm-baseline\/?/, "").replace(/^\//, "") || "index.html";
  const target = resolve(baselineDist, relativePath);
  if (target !== baselineDist && !target.startsWith(`${baselineDist}/`)) return notFound(res);
  const file = existsSync(target) && statSync(target).isDirectory() ? join(target, "index.html") : target;
  if (!existsSync(file) || !statSync(file).isFile()) return notFound(res);
  res.writeHead(200, { "content-type": contentTypes[extname(file)] ?? "application/octet-stream", "access-control-allow-origin": "*" });
  res.end(readFileSync(file));
}

function notFound(res: ServerResponse) {
  log("server 404");
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

function apiMiddleware(): Connect.NextHandleFunction {
  let published: unknown;
  return async (req, res, next) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${appPort}`);
    if (url.pathname === "/__warm-baseline/.astro-editor/revision.json")
      return json(res, 200, { sha: headCommit(), ref: "main", builtAt: "2026-09-23T00:00:00Z" });
    if (url.pathname.startsWith("/__warm-baseline/")) return serveStatic(res, url.pathname);
    if (!url.pathname.startsWith("/api/")) return next();
    if (url.pathname === "/api/publish") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        published = JSON.parse(body || "{}");
        json(res, 503, { error: "Offline warm preview test destination; no GitHub write performed." });
      });
      return;
    }
    if (url.pathname === "/api/warm-preview-published") return json(res, 200, published ?? null);

    const blobs: Record<string, string> = {};
    const trees: Record<string, { entries: object[] }> = {};
    const entries = tree("", blobs, trees);
    blobs[sha(".astro-editor/preview.json")] = JSON.stringify({
      provider: "cloudflare-workers-assets",
      worker: "heading-starter",
      subdomain: "lexvd.workers.dev",
      revisionPath: "/.astro-editor/revision.json",
    });
    const nativeEntries = treeFrom(nativeFixtureRoot, "", "n/", ["src", ".astro-editor"], nativeAllowedFile, blobs, trees);
    const requestedRepo = url.searchParams.get("repo");
    const isNative = requestedRepo === nativeRepo.full_name;
    const responses: Record<string, unknown> = {
      "/api/session": { configured: true, user: { login: "lex" }, installUrl: null },
      "/api/repositories": [repo, nativeRepo],
      "/api/branches": ["main"],
      "/api/snapshot": isNative
        ? { branch: "main", commit: nativeCommit, entries: nativeEntries, detection: { status: "detected", message: "Browser-native project" } }
        : { branch: "main", commit: headCommit(), entries, detection: { status: "detected", message: "Astro" } },
      "/api/tree": trees[url.searchParams.get("sha") ?? ""],
      "/api/file": { content: blobs[url.searchParams.get("sha") ?? ""] },
    };
    if (Object.hasOwn(responses, url.pathname)) return json(res, 200, responses[url.pathname]);
    return notFound(res);
  };
}

function githubApiStubPlugin(): Plugin {
  return {
    name: "ase-warm-preview-github-api-stubs",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(apiMiddleware());
    },
  };
}

function manualCommittedPreviewOriginPlugin(): Plugin {
  return {
    name: "ase-warm-preview-manual-committed-origin",
    apply: "serve",
    transform(code, id) {
      if (!manualMode || !id.endsWith("src/components/preview-panel.ts")) return undefined;
      const from = "return sharedPreviewOrigin(config, branch);";
      const to = "return " + JSON.stringify(manualBaselineOrigin) + ";";
      if (!code.includes(from)) throw new Error("Manual warm preview transform target not found.");
      return code.replace(from, to);
    },
  };
}

async function main() {
  log(`server start appPort=${appPort} previewPort=${previewPort}`);
  prepareTrustedCheckout();
  buildCommittedPreview();
  const provider = warmPreviewProvider({
    env: { ...process.env, ASE_WARM_PREVIEW_PROJECT: checkoutRoot },
    runtimeFactory: async ({ projectRoot: warmProjectRoot, baseline }) => {
      const runtime = await createWarmPreviewRuntime({
        projectRoot: warmProjectRoot,
        fixtureRoot: warmProjectRoot,
        baseline,
        previewOrigin: `http://127.0.0.1:${previewPort}`,
        port: previewPort,
        devPort: previewPort + 100,
      });
      if (!publicPreviewOrigin) return runtime;
      return {
        ...runtime,
        availability() {
          const availability = runtime.availability ? runtime.availability() : { available: true as const };
          return { ...availability, available: true as const, mode: "warm" as const, previewOrigin: publicPreviewOrigin };
        },
        async apply(body) {
          const result = await runtime.apply(body);
          return { ...result, previewUrl: result.previewUrl.replace(`http://127.0.0.1:${previewPort}`, publicPreviewOrigin) };
        },
      };
    },
  });
  const manualBaselineServer = manualMode ? createHttpServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${manualBaselinePort}`);
    if (url.pathname === "/.astro-editor/revision.json") {
      res.setHeader("access-control-allow-origin", "*");
      return json(res, 200, { sha: headCommit(), ref: "main", builtAt: "2026-09-23T00:00:00Z" });
    }
    return serveStatic(res, url.pathname);
  }) : undefined;
  if (manualBaselineServer) await new Promise<void>((resolveListen) => manualBaselineServer.listen(manualBaselinePort, "127.0.0.1", resolveListen));
  const app = await createServer({
    configFile: false,
    root: projectRoot,
    cacheDir: resolve(projectRoot, `.scratch/warm-preview/vite-cache-${appPort}`),
    plugins: [provider.plugin, githubApiStubPlugin(), manualCommittedPreviewOriginPlugin()],
    optimizeDeps: {
      include: ["typescript-language", "@astrojs/compiler", "@jridgewell/trace-mapping"],
    },
    server: {
      hmr: process.env.ASE_WARM_PREVIEW_PUBLIC_ORIGIN ? false : undefined,
      host: "127.0.0.1",
      port: appPort,
      strictPort: true,
      fs: { allow: [projectRoot, realpathSync(join(projectRoot, "node_modules"))] },
    },
  });
  await app.listen();
  const cleanup = async () => {
    log("server cleanup");
    await provider.close().catch(() => undefined);
    await app.close().catch(() => undefined);
    if (manualBaselineServer) await new Promise<void>((resolveClose) => manualBaselineServer.close(() => resolveClose()));
    rmSync(checkoutRoot, { recursive: true, force: true });
    rmSync(baselineDist, { recursive: true, force: true });
  };
  process.once("SIGTERM", () => void cleanup().finally(() => process.exit(0)));
  process.once("SIGINT", () => void cleanup().finally(() => process.exit(0)));
}

main().catch((error) => {
  log(`server fatal ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  console.error(error);
  process.exit(1);
});

function log(message: string) {
  appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
}

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};
