import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { type TestContext } from "node:test";

const preview = resolve("scripts/agents/kit.d/preview");
const kit = resolve("scripts/agents/kit");
const wrapper = resolve("scripts/agents/deploy-preview.sh");
const version = "12345678-abcd-1234-abcd-123456789abc";
const built = "index-new123.js";
const html = (name: string) => `<script type="module" src="/assets/${name}"></script>`;

interface Call { tool: string; args?: string[]; cwd?: string; ci?: string; color?: string }
const npm = `#!/bin/sh
set -eu
printf '%s\\n' '{"tool":"npm"}' >> "$FAKE_CALLS"
[ "$#" = 2 ] && [ "$1" = run ] && [ "$2" = deploy:preview ] || exit 90
exec wrangler deploy
`;
const wrangler = `#!/usr/bin/env node
const fs = require("node:fs"), env = process.env;
fs.appendFileSync(env.FAKE_CALLS, JSON.stringify({ tool: "wrangler", args: process.argv.slice(2), cwd: process.cwd(), ci: env.CI, color: env.NO_COLOR }) + "\\n");
if (fs.existsSync("dist/stale.js")) throw new Error("stale dist was not removed");
if (env.FAKE_DEPLOY_HOLD) {
  process.on("SIGTERM", () => fs.writeFileSync(env.FAKE_DEPLOY_HOLD + ".term", ""));
  fs.writeFileSync(env.FAKE_DEPLOY_HOLD + ".started", "");
  const wait = () => fs.existsSync(env.FAKE_DEPLOY_HOLD + ".release") ? fs.writeFileSync(env.FAKE_DEPLOY_HOLD + ".done", "") : setTimeout(wait, 20);
  wait();
  return;
}
if (env.FAKE_DEPLOY_FAIL) {
  for (let i = 1; i <= 35; i++) console.error("failure line " + i);
  process.exit(1);
}
if (env.FAKE_BUNDLE_MODE !== "missing") {
  fs.mkdirSync("dist/assets", { recursive: true });
  fs.writeFileSync("dist/assets/${built}", "// built bundle\\n");
  fs.writeFileSync("dist/index.html", env.FAKE_BUNDLE_MODE === "fallback" ? "<html></html>" : ${JSON.stringify(html(built))});
  if (env.FAKE_BUNDLE_MODE === "multiple") fs.writeFileSync("dist/assets/index-other.js", "// other bundle\\n");
}
if (!env.FAKE_NO_VERSION) {
  console.log("Version ID: 00000000-0000-0000-0000-000000000000");
  console.log("Current Version ID: ${version}");
}
console.log("RESULT: ok child output stays in the log");
`;

async function fixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "kit-preview-"));
  const origin = join(dir, "origin.git"), root = join(dir, "work"), main = join(dir, "main"), bin = join(dir, "bin");
  const requests: { url: string; cache: string | undefined }[] = [];
  let live: (count: number) => string = () => html(built);
  const server = createServer((request, response) => {
    requests.push({ url: request.url || "", cache: request.headers["cache-control"] });
    if (live(requests.length) === "hang") return;
    response.setHeader("Content-Type", "text/html");
    response.end(live(requests.length));
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
    rmSync(dir, { recursive: true, force: true });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  mkdirSync(bin); mkdirSync(main);
  // Keep nodeEnv's Node lookup in this bin, with fake npm and wrangler first on PATH.
  symlinkSync(process.execPath, join(bin, "node"));
  for (const [name, contents] of [["npm", npm], ["wrangler", wrangler]]) {
    writeFileSync(join(bin, name), contents); chmodSync(join(bin, name), 0o755);
  }
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("KIT_") || key.startsWith("FAKE_") || key.startsWith("GIT_")) delete env[key];
  Object.assign(env, {
    PATH: `${bin}:${process.env.PATH}`, KIT_ROOT: root, KIT_MAIN_ROOT: main, ASE_OWNER: "kit-preview-test",
    KIT_PREVIEW_LOCK: join(dir, "preview.lock"), KIT_PREVIEW_URL: `http://127.0.0.1:${address.port}/`,
    KIT_PREVIEW_VERIFY_MS: "300", KIT_PREVIEW_INTERVAL_MS: "20", FAKE_CALLS: join(dir, "calls.jsonl"),
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Kit test", GIT_AUTHOR_EMAIL: "kit@example.com", GIT_COMMITTER_NAME: "Kit test", GIT_COMMITTER_EMAIL: "kit@example.com",
  });
  const gitAt = (cwd: string, ...args: string[]) => {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8", timeout: 5_000 });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  gitAt(dir, "init", "--bare", "--initial-branch=dev", origin);
  gitAt(dir, "clone", origin, root);
  const git = (...args: string[]) => gitAt(root, ...args);
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "deploy:preview": "wrangler deploy" } }));
  writeFileSync(join(root, ".gitignore"), "node_modules\ndist\n.scratch\n");
  writeFileSync(join(root, "source.txt"), "origin dev\n");
  git("add", "."); git("commit", "-qm", "initial"); git("push", "-q", "origin", "dev");
  const sha = git("rev-parse", "HEAD");
  const modules = join(root, "node_modules");
  mkdirSync(join(modules, ".bin"), { recursive: true });
  const deployDir = join(main, ".scratch/preview-deploy");

  async function run(args: string[] = [], overrides: NodeJS.ProcessEnv = {}, entry = preview, onOutput?: (text: string) => void) {
    const child = spawn(entry, entry === kit ? ["preview", ...args] : args, { cwd: root, env: { ...env, ...overrides } });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 8_000);
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; onOutput?.(stdout); });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    let status, signal;
    try { [status, signal] = await once(child, "close"); }
    finally { clearTimeout(timer); }
    assert.equal(signal, null, `command timed out or was signalled: ${stdout}\n${stderr}`);
    const results = stdout.split("\n").filter(line => line.startsWith("RESULT: "));
    assert.equal(results.length, 1, stdout);
    assert.equal(stdout.trimEnd().split("\n").at(-1), results[0]);
    return { status, stdout, stderr };
  }
  const calls = (): Call[] => existsSync(env.FAKE_CALLS!) ? readFileSync(env.FAKE_CALLS!, "utf8").trim().split("\n").map(line => JSON.parse(line)) : [];
  return { dir, root, main, origin, bin, env, sha, modules, deployDir, git, gitAt, run, calls, requests,
    setLive: (serve: (count: number) => string) => { live = serve; } };
}

test("help and invalid arguments do not prepare or deploy anything", async t => {
  const f = await fixture(t);
  for (const flag of ["--help", "-h"]) {
    const result = await f.run([flag]);
    assert.equal(result.status, 0); assert.match(result.stdout, /Usage: kit preview/);
  }
  for (const args of [["--wat"], ["--help", "--wat"], ["extra"]]) {
    const result = await f.run(args);
    assert.equal(result.status, 2); assert.match(result.stderr, /Usage: kit preview/);
    assert.match(result.stdout, /RESULT: fail preview invalid arguments/);
  }
  assert.equal(existsSync(f.deployDir), false); assert.deepEqual(f.calls(), []);
});

test("dry run creates an isolated detached origin/dev worktree without deploying", async t => {
  const f = await fixture(t);
  // Local changes and commits must never become the deployed source.
  writeFileSync(join(f.root, "source.txt"), "local commit\n");
  f.git("add", "source.txt"); f.git("commit", "-qm", "local only");
  writeFileSync(join(f.root, "source.txt"), "unsaved local change\n");
  const result = await f.run(["--dry-run"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.endsWith(`RESULT: ok preview dry-run ${f.sha} created ${f.deployDir}\n`));
  assert.equal(f.gitAt(f.deployDir, "rev-parse", "HEAD"), f.sha);
  assert.equal(f.gitAt(f.deployDir, "branch", "--show-current"), "");
  assert.ok(lstatSync(join(f.deployDir, "node_modules")).isSymbolicLink());
  assert.equal(realpathSync(join(f.deployDir, "node_modules")), realpathSync(f.modules));
  assert.equal(readFileSync(join(f.deployDir, "source.txt"), "utf8"), "origin dev\n");
  assert.equal(readFileSync(join(f.root, "source.txt"), "utf8"), "unsaved local change\n");
  assert.deepEqual(f.calls(), []); assert.equal(f.requests.length, 0);
  assert.doesNotMatch(result.stdout, /waiting for preview lock/);
});

test("reuse cleans tracked and untracked changes and advances to freshly fetched origin/dev", async t => {
  const f = await fixture(t);
  assert.equal((await f.run(["--dry-run"])).status, 0);
  writeFileSync(join(f.deployDir, "source.txt"), "dirty\n");
  writeFileSync(join(f.deployDir, "untracked.txt"), "remove me\n");
  writeFileSync(join(f.modules, "keep.txt"), "keep modules\n");
  let result = await f.run(["--dry-run"]);
  assert.equal(result.status, 0, result.stdout);
  assert.ok(result.stdout.includes(`dry-run ${f.sha} reused ${f.deployDir}`));
  assert.equal(existsSync(join(f.deployDir, "untracked.txt")), false);
  assert.equal(readFileSync(join(f.deployDir, "source.txt"), "utf8"), "origin dev\n");
  writeFileSync(join(f.root, "source.txt"), "new dev\n");
  f.git("add", "source.txt"); f.git("commit", "-qm", "advance dev"); f.git("push", "-q", "origin", "dev");
  const sha = f.git("rev-parse", "HEAD");
  result = await f.run(["--dry-run"]);
  assert.equal(result.status, 0, result.stdout);
  assert.ok(result.stdout.includes(`dry-run ${sha} reused ${f.deployDir}`));
  assert.equal(f.gitAt(f.deployDir, "rev-parse", "HEAD"), sha);
  assert.equal(readFileSync(join(f.modules, "keep.txt"), "utf8"), "keep modules\n");
  assert.deepEqual(f.calls(), []);
});

test("a plain folder inside the checkout is replaced rather than mistaken for a worktree", async t => {
  const f = await fixture(t), dir = join(f.root, ".scratch/preview-deploy");
  mkdirSync(dir, { recursive: true });
  symlinkSync(f.modules, join(dir, "node_modules"));
  writeFileSync(join(dir, "stale.txt"), "leftover\n");
  assert.equal(f.gitAt(dir, "rev-parse", "--show-toplevel"), realpathSync(f.root));
  const result = await f.run(["--dry-run"], { KIT_MAIN_ROOT: f.root });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.includes(`dry-run ${f.sha} created ${dir}`));
  assert.equal(existsSync(join(dir, "stale.txt")), false);
  assert.equal(f.gitAt(dir, "rev-parse", "--show-toplevel"), realpathSync(dir));
});

test("a worktree without a usable node_modules symlink is recreated", async t => {
  const f = await fixture(t);
  await f.run(["--dry-run"]);
  rmSync(join(f.deployDir, "node_modules"));
  const result = await f.run(["--dry-run"]);
  assert.equal(result.status, 0, result.stdout);
  assert.ok(result.stdout.includes(`dry-run ${f.sha} created ${f.deployDir}`));
  assert.ok(lstatSync(join(f.deployDir, "node_modules")).isSymbolicLink());
});

test("full deploy logs fake tools, removes stale dist, uses the last version and retries the live bundle", async t => {
  const f = await fixture(t);
  await f.run(["--dry-run"]);
  mkdirSync(join(f.deployDir, "dist")); writeFileSync(join(f.deployDir, "dist/stale.js"), "stale");
  f.setLive(count => html(count <= 2 ? "index-old.js" : built));
  const result = await f.run([], { KIT_PREVIEW_VERIFY_MS: "1500", FAKE_BUNDLE_MODE: "multiple" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.endsWith(`RESULT: ok preview ${version} ${f.sha}\n`));
  assert.deepEqual(f.calls().map(call => call.tool), ["npm", "wrangler"]);
  const call = f.calls()[1];
  assert.equal(call.cwd, f.deployDir); assert.equal(call.ci, "1"); assert.equal(call.color, "1");
  assert.deepEqual(call.args, ["deploy"]);
  const log = /^log: (.+)$/m.exec(result.stdout)?.[1];
  assert.ok(log); assert.ok(log.startsWith(join(f.main, ".scratch/deploy/")));
  assert.match(log, /\d{8}-\d{6}-\d+\.log$/);
  assert.match(readFileSync(log, "utf8"), /Current Version ID:/);
  assert.equal(f.requests.length, 3);
  for (const request of f.requests) {
    assert.match(request.url, /^\/\?v=\d+$/); assert.match(request.cache || "", /no-cache/);
  }
});

test("built bundle falls back to the only index asset when HTML has no reference", async t => {
  const f = await fixture(t), result = await f.run([], { FAKE_BUNDLE_MODE: "fallback" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.endsWith(`RESULT: ok preview ${version} ${f.sha}\n`));
});

test("an old live bundle fails within the verification deadline and names both bundles", async t => {
  const f = await fixture(t); f.setLive(() => html("index-old.js"));
  const start = Date.now(), result = await f.run();
  assert.equal(result.status, 1);
  assert.ok(result.stdout.endsWith(`RESULT: fail preview ${version} ${f.sha} live index-old.js != built ${built}\n`));
  assert.ok(Date.now() - start < 5_000); assert.ok(f.requests.length >= 2);
});

test("an HTTP response that never finishes is bounded by the verification deadline", async t => {
  const f = await fixture(t); f.setLive(() => "hang");
  const start = Date.now(), result = await f.run();
  assert.equal(result.status, 1);
  assert.ok(result.stdout.endsWith(`RESULT: fail preview ${version} ${f.sha} live unreachable != built ${built}\n`));
  assert.ok(Date.now() - start < 5_000);
});

test("deploy failure tails 30 lines, preserves the log and releases the lock", async t => {
  const f = await fixture(t), result = await f.run([], { FAKE_DEPLOY_FAIL: "1" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /RESULT: fail preview deploy failed \(log .+\)/);
  const log = /^log: (.+)$/m.exec(result.stdout)?.[1]; assert.ok(log);
  assert.match(readFileSync(log, "utf8"), /failure line 1\n/);
  assert.equal(result.stderr.trimEnd().split("\n").length, 30);
  assert.match(result.stderr, /^  failure line 6\n/); assert.match(result.stderr, /failure line 35/);
  assert.equal(f.requests.length, 0);
  const retry = await f.run(["--dry-run"]);
  assert.equal(retry.status, 0); assert.doesNotMatch(retry.stdout, /waiting for preview lock/);
});

test("missing version and missing built bundle fail before requesting the live site", async t => {
  const f = await fixture(t);
  let result = await f.run([], { FAKE_NO_VERSION: "1" });
  assert.equal(result.status, 1); assert.match(result.stdout, /RESULT: fail preview missing Version ID \(log .+\)/);
  result = await f.run([], { FAKE_BUNDLE_MODE: "missing" });
  assert.equal(result.status, 1); assert.match(result.stdout, /RESULT: fail preview built bundle not found/);
  assert.equal(f.requests.length, 0);
});

test("missing modules and fetch failures produce one final failure", async t => {
  const f = await fixture(t); rmSync(f.modules, { recursive: true });
  let result = await f.run(["--dry-run"]);
  assert.equal(result.status, 1); assert.match(result.stdout, /RESULT: fail preview missing node_modules:/);
  f.git("remote", "set-url", "origin", join(f.dir, "no-origin.git"));
  result = await f.run(["--dry-run"]);
  assert.equal(result.status, 1); assert.match(result.stdout, /RESULT: fail preview git fetch failed:/);
  assert.deepEqual(f.calls(), []);
});

test("preview waits for another process's flock and succeeds after it releases", async t => {
  const f = await fixture(t);
  const holder = spawn("flock", [f.env.KIT_PREVIEW_LOCK!, "sh", "-c", "echo locked; read -r release"], { env: f.env });
  t.after(() => { holder.kill("SIGKILL"); });
  const closed = once(holder, "close");
  await once(holder.stdout, "data");
  let released = false;
  const result = await f.run(["--dry-run"], {}, preview, output => {
    if (!released && output.includes("waiting for preview lock")) {
      assert.equal(existsSync(f.deployDir), false);
      released = true; holder.stdin.end("release\n");
    }
  });
  await closed;
  assert.equal(released, true); assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.split("waiting for preview lock").length - 1, 1);
});

for (const signal of ["SIGTERM", "SIGKILL"] as const) {
  test(`a ${signal} mid-deploy keeps the lock until the deploy child exits`, async t => {
    const f = await fixture(t), hold = join(f.dir, "hold");
    const until = async (check: () => boolean) => {
      for (const end = Date.now() + 5_000; !check(); await delay(20)) assert.ok(Date.now() < end, "timed out");
    };
    const first = spawn(preview, [], { cwd: f.root, env: { ...f.env, FAKE_DEPLOY_HOLD: hold } });
    let firstOut = "";
    first.stdout.setEncoding("utf8").on("data", chunk => { firstOut += chunk; });
    const firstClosed = once(first, "close");
    try {
      await until(() => existsSync(hold + ".started"));
      first.kill(signal);
      if (signal === "SIGTERM") await until(() => existsSync(hold + ".term"));
      else await firstClosed;
      let released = false;
      const second = f.run(["--dry-run"], {}, preview, output => {
        if (!released && output.includes("waiting for preview lock")) {
          released = true;
          setTimeout(() => writeFileSync(hold + ".release", ""), 200);
        }
      });
      const result = await second;
      assert.equal(released, true, result.stdout);
      assert.ok(existsSync(hold + ".done"), "second run finished before the held deploy ended");
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const [status, killed] = await firstClosed;
      if (signal === "SIGTERM") {
        assert.equal(status, 143); assert.equal(killed, null);
        assert.match(firstOut, /RESULT: fail preview interrupted by SIGTERM\n$/);
      } else assert.equal(killed, "SIGKILL");
    } finally { writeFileSync(hold + ".release", ""); first.kill("SIGKILL"); }
  });
}

test("kit preview and deploy-preview.sh both reach the command with --dry-run", async t => {
  const f = await fixture(t);
  let result = await f.run(["--dry-run"], {}, kit);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.endsWith(`RESULT: ok preview dry-run ${f.sha} created ${f.deployDir}\n`));
  result = await f.run(["--dry-run"], {}, wrapper);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.endsWith(`RESULT: ok preview dry-run ${f.sha} reused ${f.deployDir}\n`));
  assert.deepEqual(f.calls(), []);
});
