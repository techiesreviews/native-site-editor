import { execFile } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, lstatSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { Plugin, ViteDevServer } from "vite";
import type { DraftBuildSuccess, DraftPreviewAvailability, DraftPreviewRequest } from "../shared/draft-preview.ts";
import {
  createWarmPreviewRuntime,
  type WarmPreviewRuntime as RuntimeWarmPreviewRuntime,
  type WarmPreviewRuntimeOptions,
} from "./warm-preview-runtime.ts";

const execFileAsync = promisify(execFile);
const maxBodyBytes = 1_000_000;
const bodyReadTimeoutMs = 10_000;

export type WarmPreviewBaseline = Pick<DraftPreviewRequest, "repo" | "branch" | "baseCommit">;

export type WarmPreviewRuntime = Pick<RuntimeWarmPreviewRuntime, "availability" | "apply" | "close">;

export interface WarmPreviewRuntimeFactoryOptions {
  projectRoot: string;
  baseline: WarmPreviewBaseline;
  artifactRoot: string;
}

export type WarmPreviewRuntimeFactory = (options: WarmPreviewRuntimeFactoryOptions) => WarmPreviewRuntime | Promise<WarmPreviewRuntime>;

export interface WarmPreviewProviderOptions {
  env?: NodeJS.ProcessEnv;
  runtimeFactory?: WarmPreviewRuntimeFactory;
}

export type WarmPreviewProjectState =
  | { enabled: false; reason: string }
  | { enabled: true; projectRoot: string; baseline: WarmPreviewBaseline };

export function warmPreviewProvider(options: WarmPreviewProviderOptions = {}) {
  const env = options.env ?? process.env;
  let runtimePromise: Promise<WarmPreviewRuntime | undefined> | undefined;
  let runtime: WarmPreviewRuntime | undefined;
  let artifactRoot: string | undefined;
  let shuttingDown = false;
  let runtimeBaseline: WarmPreviewBaseline | undefined;
  let startupError: string | undefined;

  const inspect = () => inspectWarmPreviewProject(env.ASE_WARM_PREVIEW_PROJECT);

  async function getRuntime() {
    if (shuttingDown) return undefined;
    const state = await inspect();
    if (!state.enabled) return undefined;
    if (runtimePromise) {
      if (runtimeBaseline && baselineEquals(runtimeBaseline, state.baseline)) return runtimePromise;
      await stopRuntime();
    }
    runtimePromise = (async () => {
      runtimeBaseline = state.baseline;
      startupError = undefined;
      artifactRoot = mkdtempSync(join(tmpdir(), "ase-warm-preview-artifacts-"));
      try {
        runtime = await (options.runtimeFactory ?? defaultRuntimeFactory)({
          projectRoot: state.projectRoot,
          baseline: state.baseline,
          artifactRoot,
        });
        if (shuttingDown) {
          await stopRuntime();
          return undefined;
        }
        const current = await inspect();
        if (!current.enabled || !baselineEquals(current.baseline, state.baseline)) {
          await stopRuntime();
          return undefined;
        }
        return runtime;
      } catch (error) {
        startupError = error instanceof Error ? error.message : "Warm preview runtime failed to start.";
        if (artifactRoot) rmSync(artifactRoot, { recursive: true, force: true });
        artifactRoot = undefined;
        runtimePromise = undefined;
        return undefined;
      }
    })();
    return runtimePromise;
  }

  async function stopRuntime() {
    const pending = runtimePromise;
    runtimePromise = undefined;
    if (pending && !runtime) await pending.catch(() => undefined);
    const current = runtime;
    runtime = undefined;
    if (current) await current.close();
    if (artifactRoot) rmSync(artifactRoot, { recursive: true, force: true });
    artifactRoot = undefined;
    runtimeBaseline = undefined;
    startupError = undefined;
  }

  async function closeRuntime() {
    shuttingDown = true;
    await stopRuntime();
  }

  const plugin: Plugin = {
    name: "ase-warm-preview-provider",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? new URL(req.url, "http://127.0.0.1") : undefined;
        if (url?.pathname !== "/api/draft-preview") return next();
        if (!env.ASE_WARM_PREVIEW_PROJECT) return next();
        try {
          await handleWarmPreviewRequest(req, res, { inspect, getRuntime, startupError: () => startupError });
        } catch (error) {
          json(res, 500, { error: error instanceof Error ? error.message : "Warm preview failed." });
        }
      });
      server.httpServer?.once("close", () => void closeRuntime());
    },
  };

  return { plugin, inspect, close: closeRuntime, runtimeBaseline: () => runtimeBaseline };
}

export async function handleWarmPreviewRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: {
    inspect(): Promise<WarmPreviewProjectState>;
    getRuntime(): Promise<WarmPreviewRuntime | undefined>;
    startupError?(): string | undefined;
  },
) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET") return handleAvailability(req, res, url, deps);
  if (req.method === "POST") return handleApply(req, res, url, deps);
  res.writeHead(405, { allow: "GET, POST" });
  res.end();
}

async function handleAvailability(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: {
    inspect(): Promise<WarmPreviewProjectState>;
    getRuntime(): Promise<WarmPreviewRuntime | undefined>;
    startupError?(): string | undefined;
  },
) {
  const state = await deps.inspect();
  if (!state.enabled) return json(res, 404, { available: false, reason: state.reason });
  if (!loopbackHost(req)) return json(res, 403, { available: false, reason: "Host not allowed." });
  if (!queryMatches(url, state.baseline)) return json(res, 409, { available: false, reason: "Baseline does not match warm preview project." });
  const runtime = await deps.getRuntime();
  if (!runtime) return json(res, 503, { available: false, mode: "warm", error: deps.startupError?.() ?? "Warm preview runtime failed to start." });
  const availability = runtime.availability ? await runtime.availability() : { available: true as const };
  return json(res, 200, { ...availability, available: true, mode: "warm" as const });
}

async function handleApply(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: {
    inspect(): Promise<WarmPreviewProjectState>;
    getRuntime(): Promise<WarmPreviewRuntime | undefined>;
    startupError?(): string | undefined;
  },
) {
  const state = await deps.inspect();
  if (!state.enabled) return json(res, 404, { error: state.reason });
  if (!sameLoopbackOrigin(req)) return json(res, 403, { error: "Origin not allowed." });
  if (!queryMatches(url, state.baseline)) return json(res, 409, { error: "Unsupported warm preview baseline." });
  let body: DraftPreviewRequest;
  try {
    body = JSON.parse(await readBody(req, maxBodyBytes)) as DraftPreviewRequest;
  } catch (error) {
    return json(res, error instanceof PayloadTooLargeError ? 413 : 400, { error: error instanceof PayloadTooLargeError ? "Request body is too large." : "Invalid JSON request." });
  }
  if (!requestMatches(body, state.baseline)) return json(res, 409, { error: "Unsupported warm preview baseline." });
  const runtime = await deps.getRuntime();
  if (!runtime) return json(res, 503, { error: "Warm preview runtime failed to start." });
  try {
    return json(res, 200, await runtime.apply(body));
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
    return json(res, status, { error: error instanceof Error ? error.message : "Warm preview failed." });
  }
}

export async function inspectWarmPreviewProject(projectRoot: string | undefined): Promise<WarmPreviewProjectState> {
  if (!projectRoot) return { enabled: false, reason: "ASE_WARM_PREVIEW_PROJECT is not set." };
  const root = resolve(projectRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) return { enabled: false, reason: "ASE_WARM_PREVIEW_PROJECT is not a directory." };
  try {
    assertRequiredWarmPreviewFiles(root);
    assertSafeProjectTree(root);
    const [{ stdout: remoteStdout }, { stdout: branchStdout }, { stdout: headStdout }, { stdout: toplevelStdout }, { stdout: dirtyStdout }] = await Promise.all([
      git(root, ["config", "--get", "remote.origin.url"]),
      git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
      git(root, ["rev-parse", "HEAD"]),
      git(root, ["rev-parse", "--show-toplevel"]),
      git(root, ["status", "--porcelain=v1", "--untracked-files=all"]),
    ]);
    if (resolve(toplevelStdout.trim()) !== root) return { enabled: false, reason: "ASE_WARM_PREVIEW_PROJECT must be the Git checkout root." };
    const repo = githubRepoName(remoteStdout.trim());
    if (!repo) return { enabled: false, reason: "origin remote is not a GitHub repository." };
    const branch = branchStdout.trim();
    if (!branch || branch === "HEAD") return { enabled: false, reason: "Warm preview project must be on a named branch." };
    const baseCommit = headStdout.trim();
    if (!/^[0-9a-f]{40}$/i.test(baseCommit)) return { enabled: false, reason: "HEAD is not an immutable commit." };
    const dirtyPaths = dirtyStdout.split(/\r?\n/).map((line) => line.slice(3).trim()).filter(Boolean).filter((path) => isProjectSourcePath(path));
    if (dirtyPaths.length) return { enabled: false, reason: "Warm preview project has uncommitted source changes." };
    return { enabled: true, projectRoot: root, baseline: { repo, branch, baseCommit } };
  } catch (error) {
    return { enabled: false, reason: error instanceof Error ? error.message : "Warm preview project is unavailable." };
  }
}

function queryMatches(url: URL, baseline: WarmPreviewBaseline) {
  return url.searchParams.get("repo") === baseline.repo &&
    url.searchParams.get("branch") === baseline.branch &&
    url.searchParams.get("baseCommit") === baseline.baseCommit;
}

function requestMatches(request: DraftPreviewRequest, baseline: WarmPreviewBaseline) {
  return request?.repo === baseline.repo && request.branch === baseline.branch && request.baseCommit === baseline.baseCommit;
}

function sameLoopbackOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host && ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function loopbackHost(req: IncomingMessage) {
  const host = req.headers.host;
  if (!host) return false;
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function readBody(req: IncomingMessage, limit: number) {
  return new Promise<string>((resolveBody, reject) => {
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
      finish(() => reject(new Error("Request body timed out.")));
    }, bodyReadTimeoutMs);
    req.on("data", (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        finish(() => reject(new PayloadTooLargeError()));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => finish(() => resolveBody(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", (error) => finish(() => reject(error)));
  });
}

function assertRequiredWarmPreviewFiles(root: string) {
  for (const path of ["package.json", "astro.config.mjs", ".astro-editor/annotate.mjs"]) {
    if (!existsSync(join(root, path))) throw new Error(`Warm preview project is missing ${path}.`);
  }
}

function assertSafeProjectTree(root: string) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", ".astro"].includes(entry.name)) continue;
    assertNoSymlinks(join(root, entry.name));
  }
}

function assertNoSymlinks(path: string) {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) throw new Error("Warm preview project contains symlinks outside ignored dependency/output directories.");
  if (!info.isDirectory()) return;
  for (const entry of readdirSync(path)) assertNoSymlinks(join(path, entry));
}

function isProjectSourcePath(path: string) {
  const clean = path.replace(/^"|"$/g, "").replace(/\\/g, "/");
  return !clean.startsWith("node_modules/") && !clean.startsWith("dist/") && !clean.startsWith(".astro/");
}

function githubRepoName(remote: string) {
  const ssh = remote.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i)?.[1];
  if (ssh) return ssh;
  try {
    const url = new URL(remote);
    if (url.hostname !== "github.com") return undefined;
    return url.pathname.replace(/^\//, "").replace(/\.git$/, "") || undefined;
  } catch {
    return undefined;
  }
}

async function defaultRuntimeFactory(options: WarmPreviewRuntimeFactoryOptions): Promise<WarmPreviewRuntime> {
  const runtimeOptions: WarmPreviewRuntimeOptions = {
    projectRoot: options.projectRoot,
    fixtureRoot: options.projectRoot,
    baseline: options.baseline,
  };
  return createWarmPreviewRuntime(runtimeOptions);
}

function baselineEquals(a: WarmPreviewBaseline, b: WarmPreviewBaseline) {
  return a.repo === b.repo && a.branch === b.branch && a.baseCommit === b.baseCommit;
}

function git(cwd: string, args: string[]) {
  return execFileAsync("git", args, { cwd, timeout: 10_000, maxBuffer: 1_000_000 });
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

class PayloadTooLargeError extends Error {}
