import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MinimalPluginContextWithoutEnvironment, ViteDevServer } from "vite";
import {
  handleWarmPreviewRequest,
  inspectWarmPreviewProject,
  type WarmPreviewBaseline,
  type WarmPreviewRuntime,
} from "../scripts/warm-preview-provider.ts";
import type { DraftPreviewRequest } from "../shared/draft-preview.ts";

const baseline: WarmPreviewBaseline = {
  repo: "lex/heading-starter",
  branch: "main",
  baseCommit: "a".repeat(40),
};

function qs(extra: Record<string, string> = {}) {
  return new URLSearchParams({ repo: baseline.repo, branch: baseline.branch, baseCommit: baseline.baseCommit, ...extra }).toString();
}

function requestBody(extra: Partial<DraftPreviewRequest> = {}): DraftPreviewRequest {
  return {
    sessionId: "11111111-1111-4111-8111-111111111111",
    repo: baseline.repo,
    branch: baseline.branch,
    baseCommit: baseline.baseCommit,
    files: [{ path: "src/pages/index.astro", content: "<p>draft</p>" }],
    ...extra,
  };
}

async function withServer(
  options: { runtime?: WarmPreviewRuntime; enabled?: boolean },
  run: (origin: string, calls: { runtime: number; fallback: number }) => Promise<void>,
) {
  const calls = { runtime: 0, fallback: 0 };
  const runtime = options.runtime ?? {
    previewOrigin: "http://127.0.0.1:6191",
    availability: () => ({ available: true as const, mode: "warm" as const, previewOrigin: "http://127.0.0.1:6191" }),
    async apply(body: DraftPreviewRequest) {
      calls.runtime++;
      return {
        revision: "b".repeat(64),
        previewUrl: `http://127.0.0.1:6191/revisions/${"b".repeat(64)}/`,
        sources: Object.fromEntries(body.files.map((file) => [file.path, file.content])),
      };
    },
    async close() {},
  };
  const server = createServer((req, res) => {
    const url = req.url ? new URL(req.url, "http://127.0.0.1") : undefined;
    if (url?.pathname === "/api/draft-preview") {
      void handleWarmPreviewRequest(req, res, {
        inspect: async () => options.enabled === false
          ? { enabled: false, reason: "off" }
          : { enabled: true, projectRoot: "/tmp/project", baseline },
        getRuntime: async () => runtime,
      });
      return;
    }
    calls.fallback++;
    res.end("fallback");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`, calls);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("GET returns warm availability only for the exact repo, branch, and base commit", async () => {
  await withServer({}, async (origin) => {
    const ok = await fetch(`${origin}/api/draft-preview?${qs()}`);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { available: true, mode: "warm", previewOrigin: "http://127.0.0.1:6191" });

    const mismatch = await fetch(`${origin}/api/draft-preview?${qs({ baseCommit: "c".repeat(40) })}`);
    assert.equal(mismatch.status, 409);
    assert.equal((await mismatch.json() as { available: boolean }).available, false);

  });
});

test("GET rejects non-loopback Host before exposing warm availability", async () => {
  let status = 0;
  let payload: unknown;
  await handleWarmPreviewRequest(
    { url: `/api/draft-preview?${qs()}`, method: "GET", headers: { host: "192.0.2.1:5173" } } as IncomingMessage,
    {
      writeHead(nextStatus: number) { status = nextStatus; return this as ServerResponse; },
      end(body?: string) { payload = body ? JSON.parse(body) : undefined; return this as ServerResponse; },
    } as ServerResponse,
    {
      inspect: async () => ({ enabled: true, projectRoot: "/tmp/project", baseline }),
      getRuntime: async () => ({
        availability: () => ({ available: true, mode: "warm", previewOrigin: "http://127.0.0.1:6191" }),
        apply: async () => { throw new Error("unexpected"); },
        async close() {},
      }),
      startupError: () => undefined,
    },
  );
  assert.equal(status, 403);
  assert.equal((payload as { available: boolean }).available, false);
});

test("GET reports warm startup failure instead of making capability disappear", async () => {
  let status = 0;
  let payload: unknown;
  await handleWarmPreviewRequest(
    { url: `/api/draft-preview?${qs()}`, method: "GET", headers: { host: "127.0.0.1:5173" } } as IncomingMessage,
    {
      writeHead(nextStatus: number) { status = nextStatus; return this as ServerResponse; },
      end(body?: string) { payload = body ? JSON.parse(body) : undefined; return this as ServerResponse; },
    } as ServerResponse,
    {
      inspect: async () => ({ enabled: true, projectRoot: "/tmp/project", baseline }),
      getRuntime: async () => undefined,
      startupError: () => "Astro dev server exited.",
    },
  );
  assert.equal(status, 503);
  assert.deepEqual(payload, { available: false, mode: "warm", error: "Astro dev server exited." });
});

test("Vite plugin passes /api/draft-preview through when ASE_WARM_PREVIEW_PROJECT is unset", async () => {
  const { warmPreviewProvider } = await import("../scripts/warm-preview-provider.ts");
  const provider = warmPreviewProvider({ env: {} });
  let middleware: ((req: IncomingMessage, res: ServerResponse, next: () => void) => void | Promise<void>) | undefined;
  const configureServer = provider.plugin.configureServer;
  if (typeof configureServer !== "function") throw new Error("Expected function configureServer hook.");
  const server = {
    middlewares: {
      use(fn: typeof middleware) {
        middleware = fn;
      },
    },
    httpServer: { once() {} },
  } as unknown as ViteDevServer;
  configureServer.call({} as MinimalPluginContextWithoutEnvironment, server);
  assert.ok(middleware);
  let nextCalled = false;
  await middleware(
    { url: "/api/draft-preview?repo=x", method: "GET", headers: {} } as IncomingMessage,
    {} as ServerResponse,
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);
});

test("POST requires loopback same-origin and matching query plus body baseline", async () => {
  await withServer({}, async (origin, calls) => {
    const forbidden = await fetch(`${origin}/api/draft-preview?${qs()}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify(requestBody()),
    });
    assert.equal(forbidden.status, 403);

    const badQuery = await fetch(`${origin}/api/draft-preview?${qs({ branch: "other" })}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(requestBody()),
    });
    assert.equal(badQuery.status, 409);

    const badBody = await fetch(`${origin}/api/draft-preview?${qs()}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(requestBody({ baseCommit: "c".repeat(40) })),
    });
    assert.equal(badBody.status, 409);

    const ok = await fetch(`${origin}/api/draft-preview?${qs()}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(requestBody()),
    });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json() as { revision: string }).revision, "b".repeat(64));
    assert.equal(calls.runtime, 1);
  });
});

test("POST preserves runtime error statuses, bounds bodies, and does not catch near routes", async () => {
  const runtime: WarmPreviewRuntime = {
    availability: () => ({ available: true, mode: "warm", previewOrigin: "http://127.0.0.1:6191" }),
    async apply() {
      const error = new Error("Astro render failed.");
      (error as Error & { status: number }).status = 422;
      throw error;
    },
    async close() {},
  };
  await withServer({ runtime }, async (origin, calls) => {
    const failed = await fetch(`${origin}/api/draft-preview?${qs()}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(requestBody()),
    });
    assert.equal(failed.status, 422);
    assert.equal((await failed.json() as { error: string }).error, "Astro render failed.");

    const huge = await fetch(`${origin}/api/draft-preview?${qs()}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ ...requestBody(), files: [{ path: "src/pages/index.astro", content: "x".repeat(1_100_000) }] }),
    });
    assert.equal(huge.status, 413);

    assert.equal(await (await fetch(`${origin}/api/draft-preview/extra?${qs()}`)).text(), "fallback");
    assert.equal(await (await fetch(`${origin}/api/snapshot`)).text(), "fallback");
    assert.equal(calls.fallback, 2);
  });
});

test("inspectWarmPreviewProject accepts only a clean named GitHub checkout without source symlinks", async () => {
  const root = mkdtempSync(join(tmpdir(), "ase-warm-provider-"));
  try {
    mkdirSync(join(root, "src/pages"), { recursive: true });
    mkdirSync(join(root, ".astro-editor"), { recursive: true });
    writeFileSync(join(root, "package.json"), "{}\n");
    writeFileSync(join(root, "astro.config.mjs"), "export default {};\n");
    writeFileSync(join(root, ".astro-editor/annotate.mjs"), "export default function annotate() { return {}; }\n");
    writeFileSync(join(root, "src/pages/index.astro"), "<p>Hello</p>\n");
    mkdirSync(join(root, "node_modules"), { recursive: true });
    git(root, ["init", "-q"]);
    git(root, ["branch", "-M", "main"]);
    git(root, ["config", "user.email", "warm@example.test"]);
    git(root, ["config", "user.name", "Warm"]);
    git(root, ["remote", "add", "origin", "https://github.com/lex/heading-starter.git"]);
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "fixture"]);

    const clean = await inspectWarmPreviewProject(root);
    assert.equal(clean.enabled, true);
    assert.equal(clean.enabled && clean.baseline.repo, "lex/heading-starter");
    assert.equal(clean.enabled && clean.baseline.branch, "main");
    assert.match(clean.enabled ? clean.baseline.baseCommit : "", /^[0-9a-f]{40}$/);

    writeFileSync(join(root, "src/pages/index.astro"), "<p>Dirty</p>\n");
    assert.equal((await inspectWarmPreviewProject(root)).enabled, false);
    git(root, ["checkout", "--", "src/pages/index.astro"]);

    writeFileSync(join(root, "src/pages/new.astro"), "<p>New</p>\n");
    assert.equal((await inspectWarmPreviewProject(root)).enabled, false);
    rmSync(join(root, "src/pages/new.astro"));

    symlinkSync("/tmp", join(root, "src/pages/link.astro"));
    assert.equal((await inspectWarmPreviewProject(root)).enabled, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function git(cwd: string, args: string[]) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}
