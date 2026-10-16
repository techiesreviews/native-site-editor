import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { pathToFileURL } from "node:url";

const script = resolve("scripts/agents/kit.d/size"), kit = resolve("scripts/agents/kit");
// Node loads this extensionless executable as ESM; a URL keeps tsx from resolving it as TS.
const { formatDelta, parseBudget } = await import(pathToFileURL(script).href);
const table = (boot = "301 KB") => `        session  paint  usable  monaco  bytes<paint  reqs<paint  bytes total
cold        812    905    1200    2100       ${boot}          14       1234 KB
warm        100    200     300     400        50 KB           4        200 KB
`;
const summary = "Byte budget: 302 KB gzip before first preview paint (cold median of 3), budget 355 KB: within.\n";
type Output = { status: number | null; stdout: string; stderr: string };

function result(output: Output, status: number, pattern: RegExp) {
  assert.equal(output.status, status, output.stderr + output.stdout);
  const lines = output.stdout.trimEnd().split("\n");
  const results = lines.filter(line => line.startsWith("RESULT: "));
  assert.equal(results.length, 1, output.stdout);
  assert.equal(lines.at(-1), results[0]);
  assert.match(results[0], pattern);
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "kit-size-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, KIT_ROOT: root, KIT_MAIN_ROOT: root, ASE_OWNER: "size-test", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args: string[]) => {
    const output = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
    assert.equal(output.status, 0, output.stderr);
    return output.stdout.trim();
  };
  const put = (file: string, text: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  git("init", "--quiet", "--initial-branch=feature");
  git("config", "user.name", "Kit size test");
  git("config", "user.email", "kit-size@example.test");
  put("README", "base\n");
  git("add", "README"); git("commit", "--quiet", "-m", "base");
  const base = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/dev", base);
  put("README", "head\n");
  git("add", "README"); git("commit", "--quiet", "-m", "head");
  const sha = git("rev-parse", "HEAD");
  const calls = join(root, ".scratch/calls.jsonl"), runner = join(root, ".scratch/runner.cjs");
  put(".scratch/runner.cjs", `#!${process.execPath}
const { spawnSync } = require("node:child_process");
const { appendFileSync } = require("node:fs");
appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ runner: process.argv.slice(2) }) + "\\n");
const child = spawnSync(process.argv[2], process.argv.slice(3), {
  stdio: "inherit", env: { ...process.env, ASE_TEST_PORT: "5299", PATH: ${JSON.stringify(join(root, ".scratch/bin"))} + ":" + process.env.PATH }
});
process.exit(child.status ?? 1);
`);
  put(".scratch/bin/npm", `#!${process.execPath}
const { appendFileSync, writeFileSync } = require("node:fs");
appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ npm: process.argv.slice(2), cwd: process.cwd(), port: process.env.ASE_BUDGET_PORT, reportOnly: process.env.ASE_BUDGET_REPORT_ONLY }) + "\\n");
if (process.env.SIZE_DIRTY_DURING) writeFileSync("README", "changed during measurement\\n");
if (process.argv.includes("test:budget")) console.log(process.env.SIZE_OUTPUT ?? ${JSON.stringify(table())});
console.error("budget diagnostic");
process.exit(Number(process.env.SIZE_EXIT ?? 0));
`);
  for (const file of [runner, join(root, ".scratch/bin/npm")]) chmodSync(file, 0o755);
  const run = (args: string[] = [], extra: NodeJS.ProcessEnv = {}) => spawnSync(kit, ["size", ...args], {
    cwd: root, env: { ...env, KIT_SIZE_RUNNER: runner, ...extra }, encoding: "utf8", timeout: 15_000,
  });
  const cachePath = (commit = sha) => join(root, ".scratch/size-cache", `${commit}.json`);
  const seed = (commit = base, values = {}) => put(`.scratch/size-cache/${commit}.json`, JSON.stringify({ version: 1, sha: commit, boot: 298 * 1024, total: 1236 * 1024, requests: 15, over: false, ...values }));
  const count = () => existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n").filter(line => line.startsWith('{"runner"')).length : 0;
  return { root, env, git, put, base, sha, calls, runner, run, cachePath, seed, count };
}

test("delta formatting covers signs, zero and symmetric KB rounding", () => {
  for (const [bytes, expected] of [[3072, "+3 KB"], [-2048, "-2 KB"], [0, "±0 KB"], [511, "±0 KB"], [-511, "±0 KB"], [512, "+1 KB"], [-512, "-1 KB"], [1.6 * 1024, "+2 KB"], [-1.6 * 1024, "-2 KB"]] as const) {
    assert.equal(formatDelta(bytes), expected);
  }
});

test("parse cold medians in bytes, prefer row boot and fall back to the budget line", () => {
  assert.deepEqual(parseBudget(table() + summary), { boot: 301 * 1024, total: 1234 * 1024, requests: 14, over: false });
  assert.deepEqual(parseBudget(table("—") + summary), { boot: 302 * 1024, total: 1234 * 1024, requests: 14, over: false });
  assert.equal(parseBudget(table("355 KB") + summary.replace("within", "OVER")).over, true);
  assert.equal(parseBudget(table("356 KB")).over, true);
  assert.equal(parseBudget(table("301.5 KB")).boot, 301.5 * 1024);
  assert.equal(parseBudget(table("0 KB")).boot, 0);
  assert.deepEqual(parseBudget(table().replaceAll("\n", "\r\n")), parseBudget(table()));
  for (const output of ["", summary, table().replace("cold", "other"), table("—"), table().replace("14", "—"), table().replace("1234 KB", "oops"), table("-1 KB"), table().replace(/cold[^\n]+/, "cold 812 905 1200 2100") + summary]) {
    assert.throws(() => parseBudget(output), /missing or unparseable/);
  }
});

test("clean HEAD cache misses then hits, ignores scratch, and preserves full logs", t => {
  const f = fixture(t);
  const first = f.run(["--no-base"]);
  result(first, 0, /ok size boot 301 KB, budget 355 KB$/);
  assert.match(first.stdout, new RegExp(`cache: miss ${f.sha.slice(0, 7)}`));
  assert.match(first.stdout, /owner: size-test/);
  assert.match(first.stdout, /boot 301 KB, total 1234 KB, requests 14, budget 355 KB/);
  assert.equal(f.count(), 1);
  const calls = readFileSync(f.calls, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(calls[0].runner.slice(0, 2), ["bash", "-c"]);
  assert.deepEqual(calls[1], { npm: ["run", "build:ui"], cwd: f.root });
  assert.deepEqual(calls[2], { npm: ["run", "test:budget", "--", "--no-build"], cwd: f.root, port: "5299", reportOnly: "1" });
  const log = /^log: (.+)$/m.exec(first.stdout)![1];
  assert.ok(log.startsWith(join(f.root, ".scratch/size/")));
  assert.match(readFileSync(log, "utf8"), /cold\s+812/);
  assert.match(readFileSync(log, "utf8"), /budget diagnostic/);
  assert.doesNotMatch(first.stdout, /budget diagnostic/);
  assert.deepEqual(JSON.parse(readFileSync(f.cachePath(), "utf8")), { version: 1, sha: f.sha, boot: 301 * 1024, total: 1234 * 1024, requests: 14, over: false });
  const second = f.run(["--no-base"]);
  result(second, 0, /ok size boot 301 KB, budget 355 KB$/);
  assert.match(second.stdout, new RegExp(`cache: hit ${f.sha.slice(0, 7)}`));
  assert.doesNotMatch(second.stdout, /log:|\([+±-]\d/);
  assert.equal(f.count(), 1);
  assert.deepEqual(readdirSync(dirname(f.cachePath())), [`${f.sha}.json`]);
});

test("dirty HEAD bypasses existing cache and never overwrites it", t => {
  const f = fixture(t);
  f.seed(f.sha);
  const original = readFileSync(f.cachePath(), "utf8");
  f.put("README", "dirty\n");
  for (let i = 0; i < 2; i++) {
    const output = f.run(["--no-base"]);
    result(output, 0, /boot 301 KB/);
    assert.match(output.stdout, /cache: miss/);
  }
  assert.equal(f.count(), 2);
  assert.equal(readFileSync(f.cachePath(), "utf8"), original);
});

test("untracked and staged changes each measure without writing a HEAD cache", t => {
  const f = fixture(t);
  f.put("new-file", "untracked\n");
  for (let i = 0; i < 2; i++) {
    result(f.run(["--no-base"]), 0, /ok size/);
    assert.equal(existsSync(f.cachePath()), false);
    f.git("add", "new-file");
  }
  assert.equal(f.count(), 2);
});

test("HEAD becoming dirty during measurement prevents cache publication", t => {
  const f = fixture(t);
  result(f.run(["--no-base"], { SIZE_DIRTY_DURING: "1" }), 0, /ok size/);
  assert.equal(existsSync(f.cachePath()), false);
});

test("KIT_MAIN_ROOT selects persistent cache storage independently of KIT_ROOT", t => {
  const f = fixture(t);
  const mainRoot = join(f.root, ".scratch/main");
  result(f.run(["--no-base"], { KIT_MAIN_ROOT: mainRoot }), 0, /ok size/);
  assert.ok(existsSync(join(mainRoot, ".scratch/size-cache", `${f.sha}.json`)));
  assert.equal(existsSync(f.cachePath()), false);
  const hit = f.run(["--no-base"], { KIT_MAIN_ROOT: mainRoot });
  result(hit, 0, /ok size/);
  assert.match(hit.stdout, /cache: hit/);
  assert.equal(f.count(), 1);
});

test("cached default base prints deltas without creating a base worktree", t => {
  const f = fixture(t);
  f.seed();
  const output = f.run();
  result(output, 0, new RegExp(`ok size boot 301 KB \\(\\+3 KB\\) vs dev@${f.base.slice(0, 7)}, budget 355 KB$`));
  assert.match(output.stdout, /boot 301 KB \(\+3 KB\), total 1234 KB \(-2 KB\), requests 14 \(-1\), budget 355 KB/);
  assert.match(output.stdout, new RegExp(`cache: hit ${f.base.slice(0, 7)}`));
  assert.equal(f.count(), 1);
  assert.equal(existsSync(join(f.root, ".scratch/shots-base")), false);
  result(f.run(), 0, /ok size/);
  assert.equal(f.count(), 1);
});

test("explicit local base ref works and zero deltas use ±0 KB", t => {
  const f = fixture(t);
  f.git("tag", "baseline", f.base);
  f.seed(f.base, { boot: 301 * 1024, total: 1234 * 1024, requests: 14 });
  const output = f.run(["--base", "baseline"]);
  result(output, 0, /boot 301 KB \(±0 KB\) vs baseline@/);
  assert.match(output.stdout, /total 1234 KB \(±0 KB\), requests 14 \(\+0\)/);
});

test("--no-base never resolves a base ref or creates a base worktree", t => {
  const f = fixture(t);
  f.git("update-ref", "-d", "refs/remotes/origin/dev");
  result(f.run(["--no-base", "--base", "does-not-exist"]), 0, /ok size boot 301 KB, budget/);
  assert.equal(f.count(), 1);
  assert.equal(existsSync(join(f.root, ".scratch/shots-base")), false);
  assert.equal(existsSync(f.cachePath(f.base)), false);
});

test("corrupt, mismatched and invalid cache records are misses", t => {
  const f = fixture(t);
  for (const text of ["{", "null", "{}", JSON.stringify({ version: 1, sha: f.sha, boot: "301", total: 0, requests: 0 }),
    ...[{ sha: f.base }, { version: 2 }, { boot: -1 }, { total: null }, { requests: -1 }, { over: undefined }, { over: "no" }].map(values => JSON.stringify({ version: 1, sha: f.sha, boot: 301 * 1024, total: 1234 * 1024, requests: 14, over: false, ...values }))]) {
    f.put(`.scratch/size-cache/${f.sha}.json`, text);
    const output = f.run(["--no-base"]);
    result(output, 0, /ok size/);
    assert.match(output.stdout, /cache: miss/);
  }
  assert.equal(f.count(), 11);
});

test("budget boundary is 355 * 1024 bytes and cached over-budget results still fail", t => {
  const f = fixture(t);
  for (const [boot, status] of [["355 KB", 0], ["355.001 KB", 1], ["360 KB", 1]] as const) {
    rmSync(f.cachePath(), { force: true });
    result(f.run(["--no-base"], { SIZE_OUTPUT: table(boot) }), status, status ? /fail size boot \d+ KB over budget 355 KB$/ : /ok size boot 355 KB/);
  }
  const before = f.count();
  const cached = f.run(["--no-base"]);
  result(cached, 1, /fail size boot 360 KB over budget 355 KB$/);
  assert.match(cached.stdout, /cache: hit/);
  assert.equal(f.count(), before);
});

test("the runner's OVER verdict fails even when the rounded boot reads 355 KB, also from cache", t => {
  const f = fixture(t);
  const over = table("355 KB") + "Byte budget: 355 KB gzip before first preview paint (cold median of 3), budget 355 KB: OVER.\nReport-only: not failing.";
  result(f.run(["--no-base"], { SIZE_OUTPUT: over }), 1, /fail size boot 355 KB over budget 355 KB$/);
  const cached = f.run(["--no-base"]);
  result(cached, 1, /fail size boot 355 KB over budget 355 KB$/);
  assert.match(cached.stdout, /cache: hit/);
  assert.equal(f.count(), 1);
});

test("uncached base measures in a detached base worktree, caches it and releases the lease", t => {
  const f = fixture(t);
  mkdirSync(join(f.root, "node_modules"));
  f.put(".git/info/exclude", "node_modules\n");
  const first = f.run();
  result(first, 0, new RegExp(`ok size boot 301 KB \\(±0 KB\\) vs dev@${f.base.slice(0, 7)}`));
  assert.match(first.stdout, new RegExp(`cache: miss ${f.base.slice(0, 7)}`));
  const dir = join(f.root, ".scratch/shots-base", f.base);
  const cwds = readFileSync(f.calls, "utf8").trim().split("\n").map(line => JSON.parse(line).cwd).filter(Boolean);
  assert.deepEqual([...new Set(cwds)], [f.root, dir]);
  assert.equal(f.git("-C", dir, "rev-parse", "HEAD"), f.base);
  assert.equal(JSON.parse(readFileSync(f.cachePath(f.base), "utf8")).sha, f.base);
  assert.deepEqual(readdirSync(join(dir, ".scratch/kit-shots-leases")), []);
  const second = f.run();
  result(second, 0, /ok size/);
  assert.match(second.stdout, new RegExp(`cache: hit ${f.base.slice(0, 7)}`));
  assert.equal(f.count(), 2);
});

test("failed or unparseable measurements fail once and never populate cache", t => {
  const f = fixture(t);
  for (const env of [{ SIZE_EXIT: "7" }, { SIZE_OUTPUT: "not a budget report" }, { KIT_SIZE_RUNNER: join(f.root, "missing-runner") }]) {
    result(f.run(["--no-base"], env), 1, /fail size (budget runner exited 7|missing or unparseable|spawn .*ENOENT)/);
    assert.equal(existsSync(f.cachePath()), false);
  }
  result(f.run(["--base", "missing-ref"]), 1, /fail size/);
});

test("help, discovery and invalid arguments do not invoke a measurement", t => {
  const f = fixture(t);
  assert.equal(readFileSync(script, "utf8").split("\n")[1], "// kit: measure boot bytes and compare the byte budget with dev");
  for (const flag of ["--help", "-h"]) {
    const output = f.run([flag]);
    assert.equal(output.status, 0, output.stderr);
    assert.match(output.stdout, /Usage: kit size/);
    assert.match(output.stdout, /KIT_SIZE_RUNNER/);
    assert.doesNotMatch(output.stdout, /RESULT:/);
  }
  const listing = spawnSync(kit, [], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  assert.match(listing.stdout, /size\s+measure boot bytes and compare the byte budget with dev/);
  for (const args of [["extra"], ["--unknown"], ["--base"], ["--base", "--no-base"], ["--base", "dev", "--base", "dev"], ["--no-base", "--no-base"]]) {
    result(f.run(args), 2, /fail size/);
  }
  assert.equal(f.count(), 0);
});

for (const signal of ["SIGINT", "SIGTERM"] satisfies NodeJS.Signals[]) {
  test(`measurement forwards ${signal} and leaves no successful cache`, async t => {
    const f = fixture(t);
    // This runner stays alive until it receives the signal, then records it and exits.
    f.put(".scratch/signal.cjs", `#!${process.execPath}
const { writeFileSync } = require("node:fs");
process.on(${JSON.stringify(signal)}, () => { writeFileSync(${JSON.stringify(join(f.root, ".scratch/signal"))}, ${JSON.stringify(signal)}); process.exit(1); });
console.log("ready");
setInterval(() => {}, 1000);
`);
    chmodSync(join(f.root, ".scratch/signal.cjs"), 0o755);
    const child = spawn(process.execPath, [script, "--no-base"], {
      cwd: f.root, env: { ...f.env, KIT_SIZE_RUNNER: join(f.root, ".scratch/signal.cjs") }, stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
    let stdout = "", stderr = "";
    child.stdout.on("data", data => { stdout += data; });
    child.stderr.on("data", data => { stderr += data; });
    const closed = once(child, "close");
    await t.test("runner ready", async () => {
      // Read the owned log until the runner installs its signal handler.
      const deadline = Date.now() + 5000;
      while (true) {
        const log = /^log: (.+)$/m.exec(stdout)?.[1];
        if (log && existsSync(log) && readFileSync(log, "utf8").includes("ready")) break;
        assert.ok(Date.now() < deadline, stderr + stdout);
        await new Promise(accept => setTimeout(accept, 10));
      }
    });
    child.kill(signal);
    const [status] = await closed;
    result({ status, stdout, stderr }, signal === "SIGINT" ? 130 : 143, /fail size interrupted by SIG/);
    assert.equal(readFileSync(join(f.root, ".scratch/signal"), "utf8"), signal);
    assert.equal(existsSync(f.cachePath()), false);
  });
}
