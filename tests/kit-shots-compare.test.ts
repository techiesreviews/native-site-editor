import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { baseKey, beforeShots, breakGuard, breakStale, ensureBase, hasLiveLease, isHit, lockHolder, planBase, pruneTargets, saveCache, setupLock, splitCompare, toolingFiles, toolingHash } from "../scripts/agents/shots/compare.mjs";
import { contactHtml, type Scenario, type Shot } from "../scripts/agents/shots/core";

const temporary: string[] = [];
after(async () => { for (const dir of temporary) await rm(dir, { recursive: true, force: true }); });
async function temp() {
  const dir = await mkdtemp(join(tmpdir(), "kit-shots-compare-"));
  temporary.push(dir);
  return dir;
}
function git(repo: string, ...args: string[]) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function commit(repo: string) {
  git(repo, "-c", "user.name=Shots test", "-c", "user.email=shots@example.test", "commit", "--allow-empty", "-qm", "test commit");
  return git(repo, "rev-parse", "HEAD");
}
function shot(overrides: Partial<Shot> = {}): Shot {
  return { screen: "editor", name: "before", width: 390, theme: "light", files: [
    { path: "editor-before-390-light.png", bytes: 3 }, { path: "editor-before-390-light.webp", bytes: 4 },
  ], attempts: 1, failures: [], layout: [], ok: true, ...overrides };
}
async function cache(dir: string, value: Shot) {
  await mkdir(dir, { recursive: true });
  for (const file of value.files) await writeFile(join(dir, file.path), "image");
  await writeFile(join(dir, "shot.json"), JSON.stringify(value));
}

test("splitCompare extracts one ref and preserves the remaining arguments", () => {
  assert.deepEqual(splitCompare(["editor", "--compare", "dev", "--width", "390"]), { ref: "dev", rest: ["editor", "--width", "390"] });
  assert.deepEqual(splitCompare(["--compare", "abc123", "--steps", ".scratch/test.json"]), { ref: "abc123", rest: ["--steps", ".scratch/test.json"] });
  for (const args of [[], ["--compare"], ["--compare", ""], ["--compare", "--width"], ["--compare", "-h"]]) assert.throws(() => splitCompare(args), /Missing/);
  assert.throws(() => splitCompare(["--compare", "dev", "--compare", "main"]), /Repeated flag: --compare/);
});

test("baseKey is stable and includes screen, ordered steps, width, theme and tooling", () => {
  const input = { screen: "editor", steps: ['click "Filter"', "hover first tile"], width: 390, theme: "light", tooling: "version-one" };
  const key = baseKey(input);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(key, baseKey({ tooling: input.tooling, theme: "light", width: 390, steps: [...input.steps], screen: "editor" }));
  for (const change of [{ screen: "files" }, { steps: [] }, { steps: [...input.steps].reverse() }, { width: 768 }, { theme: "dark" }, { tooling: "version-two" }]) assert.notEqual(key, baseKey({ ...input, ...change }));
  assert.equal(key, baseKey({ ...input, name: "ignored" }));
});

test("toolingHash includes listed paths and recursive files, ignores other files and tolerates missing files", async () => {
  const dir = await temp();
  const missing = await toolingHash(dir);
  assert.match(missing, /^[0-9a-f]{64}$/);
  assert.equal(await toolingHash(await temp()), missing, "missing markers do not depend on the checkout root");
  await writeFile(join(dir, "unlisted.txt"), "ignored");
  assert.equal(await toolingHash(dir), missing);
  const paths = toolingFiles.filter((path: string) => !path.endsWith("/"));
  paths.push("scripts/agents/shots/nested/capture.ts", "scripts/agents/shots/core.ts");
  for (const path of paths) {
    await mkdir(resolve(dir, path, ".."), { recursive: true });
    const before = await toolingHash(dir);
    await writeFile(join(dir, path), "first");
    const added = await toolingHash(dir);
    assert.notEqual(added, before, `${path} is included`);
    await writeFile(join(dir, path), "second");
    assert.notEqual(await toolingHash(dir), added, `${path} contents are included`);
    await rm(join(dir, path));
    assert.equal(await toolingHash(dir), before, `${path} can be missing again`);
    await writeFile(join(dir, path), "first");
  }
  const reordered = await temp();
  for (const path of [...paths].reverse()) {
    await mkdir(resolve(reordered, path, ".."), { recursive: true });
    await writeFile(join(reordered, path), "first");
  }
  assert.equal(await toolingHash(reordered), await toolingHash(dir), "directory creation order does not matter");
  await rm(join(dir, paths[0]));
  await writeFile(join(dir, "unlisted.txt"), "changed");
  const partial = await toolingHash(dir);
  await writeFile(join(dir, "another.txt"), "ignored too");
  assert.equal(await toolingHash(dir), partial);
});

test("shots config validates app root and overrides only the server cwd", async () => {
  const dir = await temp();
  const env = { ...process.env, ASE_TEST_PORT: "5299", ASE_KIT_SHOTS_REQUEST: "test" };
  delete env.ASE_KIT_SHOTS_APP_ROOT;
  const run = (override: Record<string, string> = {}) => spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    "import config from './scripts/agents/shots/config.ts'; console.log(JSON.stringify(config));",
  ], { env: { ...env, ...override }, encoding: "utf8", timeout: 15_000 });
  const original = run();
  assert.equal(original.status, 0, original.stderr);
  const baseline = JSON.parse(original.stdout);
  assert.equal(baseline.webServer.cwd, process.cwd());
  const changed = run({ ASE_KIT_SHOTS_APP_ROOT: dir });
  assert.equal(changed.status, 0, changed.stderr);
  assert.deepEqual(JSON.parse(changed.stdout), { ...baseline, webServer: { ...baseline.webServer, cwd: dir } });
  const file = join(dir, "file");
  await writeFile(file, "not a directory");
  for (const root of ["", ".", "relative/path", join(dir, "missing"), file]) {
    const result = run({ ASE_KIT_SHOTS_APP_ROOT: root });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ASE_KIT_SHOTS_APP_ROOT must be an absolute path to an existing directory/);
  }
});

test("planBase uses complete on-disk cache entries and rejects damaged entries", async () => {
  const dir = await temp();
  const scenarios: Scenario[] = [{ screen: "editor", steps: [] }, { screen: "files", steps: ["press Escape"] }];
  const widths = [390, 768], themes = ["light", "dark"];
  const entry = (scenario: Scenario, width: number, theme: string) => join(dir, baseKey({ ...scenario, width, theme }));
  const hit = (scenario: Scenario, width: number, theme: string) => isHit(entry(scenario, width, theme));
  assert.equal(planBase(scenarios, widths, themes, hit).length, 8);
  for (const scenario of scenarios) await cache(entry(scenario, 390, "light"), shot({ screen: scenario.screen }));
  const missing = planBase(scenarios, widths, themes, hit);
  assert.equal(missing.length, 6);
  assert.ok(missing.every((item: { width: number; theme: string }) => item.width !== 390 || item.theme !== "light"));
  const first = entry(scenarios[0], 390, "light");
  await rm(join(first, "editor-before-390-light.webp"));
  assert.equal(isHit(first), false, "missing listed WebP invalidates a cache entry");
  await writeFile(join(first, "editor-before-390-light.webp"), "image");
  assert.equal(isHit(first), true);
  await writeFile(join(first, "shot.json"), "{");
  assert.equal(isHit(first), false, "partial metadata is never a hit");
  await writeFile(join(first, "shot.json"), JSON.stringify(shot({ ok: false })));
  assert.equal(isHit(first), false, "failed captures are never cached");
  await writeFile(join(first, "shot.json"), JSON.stringify(shot({ files: [] })));
  assert.equal(isHit(first), false, "metadata alone is insufficient");
});

test("saveCache keeps complete entries, replaces broken ones and serializes concurrent publishers", async () => {
  const dir = await temp(), runA = join(dir, "run-a"), runB = join(dir, "run-b"), entry = join(dir, "cache", "key");
  for (const [run, text] of [[runA, "a"], [runB, "b"]]) {
    await mkdir(run);
    for (const file of shot().files) await writeFile(join(run, file.path), text);
  }
  await Promise.all([saveCache(entry, shot(), runA), saveCache(entry, shot(), runB)]);
  assert.equal(isHit(entry), true);
  const winner = await readFile(join(entry, "editor-before-390-light.png"), "utf8");
  assert.equal(await readFile(join(entry, "editor-before-390-light.webp"), "utf8"), winner, "one publisher's files, never a mix");
  await saveCache(entry, shot(), winner === "a" ? runB : runA);
  assert.equal(await readFile(join(entry, "editor-before-390-light.png"), "utf8"), winner, "a complete entry is never replaced");
  await rm(join(entry, "editor-before-390-light.webp"));
  await saveCache(entry, shot(), runB);
  assert.equal(isHit(entry), true, "a broken entry is replaced");
  assert.deepEqual((await readdir(join(dir, "cache"))).sort(), ["key"], "no temp, aside or lock folders remain");
});

test("pruneTargets keeps the newest three and current while ignoring other names", () => {
  const entries = Array.from({ length: 5 }, (_, index) => ({ sha: String(index).repeat(40), mtimeMs: index }));
  const input = [...entries, { sha: ".lock", mtimeMs: 99 }, { sha: "abc", mtimeMs: 100 }];
  assert.deepEqual(pruneTargets(input).map((entry: { sha: string }) => entry.sha), [entries[1].sha, entries[0].sha]);
  assert.deepEqual(pruneTargets(input, 3, entries[0].sha).map((entry: { sha: string }) => entry.sha), [entries[1].sha]);
  assert.equal(input[0], entries[0], "the pure helper leaves its input untouched");
});

test("ensureBase creates detached linked worktrees, reuses, repairs and prunes", async () => {
  const dir = await temp(), repo = join(dir, "repo"), mainRoot = join(dir, "main"), actualModules = join(dir, "dependencies");
  await mkdir(repo);
  git(repo, "init", "-q");
  const sha = commit(repo);
  await mkdir(actualModules);
  const modules = join(repo, "node_modules");
  await symlink(actualModules, modules);
  const options = { repo, mainRoot, sha, modules };
  const first = await ensureBase(options);
  await first.release();
  assert.equal(first.reused, false);
  assert.equal(first.dir, join(mainRoot, ".scratch/shots-base", sha));
  assert.equal(git(first.dir, "rev-parse", "HEAD"), sha);
  assert.equal(git(first.dir, "branch", "--show-current"), "");
  assert.equal(await readlink(join(first.dir, "node_modules")), await realpath(modules));
  assert.equal(await readlink(join(first.dir, ".scratch/native-static-preview")), join(mainRoot, ".scratch/native-static-preview"));
  const old = new Date(1_000);
  await utimes(first.dir, old, old);
  const reuse = await ensureBase(options);
  await reuse.release();
  assert.equal(reuse.reused, true);
  assert.ok((await lstat(first.dir)).mtimeMs > old.getTime());
  await rm(join(first.dir, "node_modules"));
  const repaired = await ensureBase(options);
  await repaired.release();
  assert.equal(repaired.reused, false, "broken cached worktree is replaced");
  const shas = [sha];
  for (let index = 0; index < 3; index++) {
    const next = commit(repo);
    shas.push(next);
    await (await ensureBase({ ...options, sha: next })).release();
    const path = join(mainRoot, ".scratch/shots-base", next);
    await utimes(path, new Date(2_000 + index * 1_000), new Date(2_000 + index * 1_000));
    if (!index) await utimes(first.dir, old, old);
  }
  await assert.rejects(lstat(first.dir), { code: "ENOENT" });
  const registered = git(repo, "worktree", "list", "--porcelain");
  assert.ok(!registered.includes(first.dir), "pruning removes git registration too");
  for (const kept of shas.slice(1)) assert.match(registered, new RegExp(kept));
});

test("a live lease keeps a base worktree through pruning until it is released", async () => {
  const dir = await temp(), repo = join(dir, "repo"), mainRoot = join(dir, "main"), modules = join(dir, "modules");
  await mkdir(repo);
  await mkdir(modules);
  git(repo, "init", "-q");
  const options = { repo, mainRoot, modules };
  const active = await ensureBase({ ...options, sha: commit(repo) });
  const stale = await ensureBase({ ...options, sha: commit(repo) });
  await stale.release();
  const dead = spawnSync(process.execPath, ["-e", ""]).pid;
  await writeFile(join(stale.dir, ".scratch/kit-shots-leases", `${dead}-finished`), "");
  assert.equal(await hasLiveLease(active.dir), true);
  assert.equal(await hasLiveLease(stale.dir), false, "a finished process's lease does not count");
  for (let index = 0; index < 3; index++) {
    await utimes(active.dir, new Date(1_000), new Date(1_000));
    await utimes(stale.dir, new Date(2_000), new Date(2_000));
    await (await ensureBase({ ...options, sha: commit(repo) })).release();
  }
  assert.ok((await lstat(active.dir)).isDirectory(), "an active comparison's base survives pruning");
  await assert.rejects(lstat(stale.dir), { code: "ENOENT" });
  await active.release();
  await utimes(active.dir, new Date(1_000), new Date(1_000));
  await (await ensureBase({ ...options, sha: commit(repo) })).release();
  await assert.rejects(lstat(active.dir), { code: "ENOENT" }, "released bases prune normally");
});

test("ensureBase serializes concurrent setup and removes stale locks", async () => {
  const dir = await temp(), repo = join(dir, "repo"), mainRoot = join(dir, "main"), modules = join(dir, "modules");
  await mkdir(repo);
  await mkdir(modules);
  git(repo, "init", "-q");
  const sha = commit(repo);
  const parent = join(mainRoot, ".scratch/shots-base"), lock = join(parent, ".lock");
  await mkdir(lock, { recursive: true });
  await utimes(lock, new Date(0), new Date(0));
  const results = await Promise.all(Array.from({ length: 4 }, () => ensureBase({ repo, mainRoot, sha, modules })));
  await Promise.all(results.map(result => result.release()));
  assert.deepEqual(results.map(result => result.reused).sort(), [false, true, true, true]);
  assert.deepEqual((await readdir(parent)).sort(), [sha], "no lock or guard folders remain");
});

test("setupLock admits one holder at a time while waiters break one stale lock", async () => {
  const parent = await temp(), lock = join(parent, ".lock");
  for (let round = 0; round < 5; round++) {
    await mkdir(lock);
    await utimes(lock, new Date(0), new Date(0));
    let inside = 0, most = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      const held = await setupLock(parent);
      most = Math.max(most, ++inside);
      await new Promise(resolve => setTimeout(resolve, 5));
      inside--;
      await held.release();
    }));
    assert.equal(most, 1, `round ${round}: two callers held the lock together`);
    assert.deepEqual(await readdir(parent), []);
  }
});

test("setupLock breaks old locks only when no live process holds them", async () => {
  const parent = await temp(), lock = join(parent, ".lock"), old = new Date(0);
  const holdLock = async (owner: string | null, time = old) => {
    await mkdir(lock);
    if (owner !== null) await writeFile(join(lock, "owner"), owner);
    await utimes(lock, time, time);
  };
  await holdLock(`${process.pid}-alive`);
  await assert.rejects(setupLock(parent, { timeoutMs: 300 }), /Timed out waiting for shots base lock/);
  assert.equal(await readFile(join(lock, "owner"), "utf8"), `${process.pid}-alive`, "a live holder keeps its lock however old");
  await rm(lock, { recursive: true });
  await holdLock(null, new Date());
  await assert.rejects(setupLock(parent, { timeoutMs: 300 }), /Timed out/, "a lock just created, before its owner file, is not stale");
  await rm(lock, { recursive: true });
  const dead = spawnSync(process.execPath, ["-e", ""]).pid;
  for (const owner of [`${dead}-finished`, null, "unreadable"]) {
    await holdLock(owner);
    const held = await setupLock(parent, { timeoutMs: 1_000 });
    assert.match(await readFile(join(lock, "owner"), "utf8"), new RegExp(`^${process.pid}-`), `${owner} lock is replaced`);
    await held.release();
    await assert.rejects(lstat(lock), { code: "ENOENT" });
  }
  const held = await setupLock(parent);
  await writeFile(join(lock, "owner"), "1-someone-else");
  await held.release();
  assert.equal(await readFile(join(lock, "owner"), "utf8"), "1-someone-else", "release never frees another holder's lock");
});

test("breakStale never removes a lock that replaced the stale instance it saw", async () => {
  const parent = await temp(), lock = join(parent, ".lock"), old = new Date(0);
  const dead = spawnSync(process.execPath, ["-e", ""]).pid;
  const plant = async (path: string, owner: string | null, time = old) => {
    await mkdir(path);
    if (owner !== null) await writeFile(join(path, "owner"), owner);
    await utimes(path, time, time);
  };
  // Two waiters saw the same stale lock; the first broke it and a new holder took the lock before the second acts.
  for (const [first, next] of [[null, `${process.pid}-live`], [`${dead}-old`, `${dead}-newer`], [null, null]] as const) {
    await plant(lock, first);
    const seen = await lockHolder(lock);
    assert.ok(seen);
    assert.equal(await breakStale(lock, seen), true, "the first waiter removes the stale instance");
    await plant(lock, next, new Date(1_000));
    assert.equal(await breakStale(lock, seen), false, `a late waiter keeps the ${next ?? "owner-less"} replacement`);
    assert.equal((await lockHolder(lock))?.owner, next ?? "");
    await rm(lock, { recursive: true });
  }
  assert.deepEqual(await readdir(parent), [], "breakers release their guards");
});

test("a guard left by a dead breaker is recovered, and a live breaker's guard is not", async () => {
  const parent = await temp(), lock = join(parent, ".lock"), old = new Date(0);
  const dead = spawnSync(process.execPath, ["-e", ""]).pid;
  const plant = async (path: string, owner: string | null) => {
    await mkdir(path);
    if (owner !== null) await writeFile(join(path, "owner"), owner);
    await utimes(path, old, old);
  };
  await plant(lock, null);
  const seen = await lockHolder(lock);
  assert.ok(seen);
  await plant(breakGuard(lock, seen), `${process.pid}-breaking`);
  await assert.rejects(setupLock(parent, { timeoutMs: 300 }), /Timed out/, "a live breaker's guard is never expired by age");
  assert.equal((await lockHolder(breakGuard(lock, seen)))?.owner, `${process.pid}-breaking`);
  await rm(breakGuard(lock, seen), { recursive: true });
  await plant(breakGuard(lock, seen), `${dead}-crashed`);
  let inside = 0, most = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    const held = await setupLock(parent, { timeoutMs: 5_000 });
    most = Math.max(most, ++inside);
    await new Promise(resolve => setTimeout(resolve, 5));
    inside--;
    await held.release();
  }));
  assert.equal(most, 1);
  assert.deepEqual(await readdir(parent), [], "the dead breaker's guard, the stale lock and every guard are gone");
});

test("beforeShots rewrites filenames without mutating cache and pairs before first", () => {
  const source = shot({ name: "custom", files: [{ path: "custom.png", bytes: 3 }, { path: "custom.webp", bytes: 4 }] });
  const [before] = beforeShots([source]);
  assert.equal(before.name, "before");
  assert.deepEqual(before.files, [{ path: "editor-before-390-light.png", bytes: 3 }, { path: "editor-before-390-light.webp", bytes: 4 }]);
  assert.equal(source.name, "custom");
  assert.equal(source.files[0].path, "custom.png");
  const html = contactHtml([shot({ name: "after" }), before]);
  assert.equal((html.match(/class="row paired"/g) ?? []).length, 1);
  assert.ok(html.indexOf("<figcaption>before") < html.indexOf("<figcaption>after"));
});

const comparePath = resolve("scripts/agents/shots/compare.mjs");
const fakeCapture = `#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
const scenario = JSON.parse(readFileSync(value('--steps'), 'utf8'));
const widths = value('--width').split(',').map(Number);
const themes = args.includes('--theme') ? [value('--theme')] : ['light', 'dark'];
const out = value('--out');
appendFileSync(process.env.TEST_LOG, JSON.stringify({ root: process.env.KIT_ROOT, cwd: process.cwd(), appRoot: process.env.ASE_KIT_SHOTS_APP_ROOT, stepsFile: value('--steps'), scenario, widths, themes, fixture: process.env.ASE_NATIVE_SAVE_FIXTURE, kind: process.env.ASE_NATIVE_SAVE_FIXTURE_KIND, request: process.env.ASE_KIT_SHOTS_REQUEST, port: process.env.ASE_TEST_PORT }) + '\\n');
mkdirSync(out, { recursive: true });
if (scenario.name === 'before' && ['missing', 'empty', 'no-shots'].includes(process.env.TEST_FAIL_BASE)) {
  if (process.env.TEST_FAIL_BASE === 'empty') writeFileSync(join(out, 'index.json'), '');
  if (process.env.TEST_FAIL_BASE === 'no-shots') writeFileSync(join(out, 'index.json'), JSON.stringify({ screens: [] }));
  process.exit(1);
}
let previous = [];
try { previous = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')).screens; } catch {}
const failed = process.env.TEST_FAIL_BASE === '1' && scenario.name === 'before';
const shots = widths.flatMap(width => themes.map(theme => {
  const stem = scenario.screen + '-' + scenario.name + '-' + width + '-' + theme;
  const files = failed ? [] : ['png', 'webp'].map(extension => {
    writeFileSync(join(out, stem + '.' + extension), scenario.name);
    return { path: stem + '.' + extension, bytes: scenario.name.length };
  });
  return { screen: scenario.screen, name: scenario.name, width, theme, files, ok: !failed, attempts: 1, failures: [], layout: [] };
}));
previous = previous.filter(shot => !shots.some(next => next.screen === shot.screen && next.name === shot.name && next.width === shot.width && next.theme === shot.theme));
writeFileSync(join(out, 'index.json'), JSON.stringify({ version: 1, screens: [...previous, ...shots] }));
console.log(join(out, 'index.json'));
console.log('RESULT: ok child stdout');
console.error('RESULT: fail child stderr');
console.error('child diagnostic');
process.exitCode = failed ? 1 : 0;
`;

test("compare coordinates fake captures, remote refs, cache reuse and partial matrices", async () => {
  const dir = await temp(), repo = join(dir, "repo"), mainRoot = join(dir, "main"), out = join(dir, "out"), fixture = join(dir, "fixture");
  await mkdir(join(repo, "scripts/agents/kit.d"), { recursive: true });
  await mkdir(join(repo, "node_modules"));
  await mkdir(fixture);
  const fixtureLink = join(dir, "fixture-link");
  await symlink(fixture, fixtureLink);
  await writeFile(join(repo, "package.json"), '{"type":"module"}');
  await writeFile(join(repo, ".gitignore"), "node_modules\n.scratch\n");
  await mkdir(join(repo, "tests/native-save"), { recursive: true });
  await writeFile(join(repo, "tests/native-save/server.ts"), "// Base app server fixture\n");
  git(repo, "init", "-q");
  git(repo, "add", ".");
  const baseSha = commit(repo);
  git(repo, "branch", "dev", baseSha);
  const remote = join(dir, "remote.git");
  git(repo, "clone", "--bare", "-q", repo, remote);
  git(repo, "remote", "add", "origin", remote);
  const command = join(repo, "scripts/agents/kit.d/shots");
  await writeFile(command, fakeCapture);
  await chmod(command, 0o755);
  git(repo, "add", ".");
  const currentSha = commit(repo);
  git(repo, "branch", "-f", "dev", currentSha);
  const log = join(dir, "events.jsonl");
  const env = { ...process.env, KIT_ROOT: repo, KIT_MAIN_ROOT: mainRoot, ASE_NATIVE_SAVE_FIXTURE: fixtureLink, ASE_NATIVE_SAVE_FIXTURE_KIND: "actual", ASE_KIT_SHOTS_REQUEST: "inherited", ASE_KIT_SHOTS_APP_ROOT: "inherited-invalid-root", ASE_TEST_PORT: "9999", TEST_LOG: log };
  const run = (args: string[], extraEnv = {}) => spawnSync(process.execPath, ["--import", "tsx", comparePath, ...args], { env: { ...env, ...extraEnv }, cwd: process.cwd(), encoding: "utf8", timeout: 30_000 });
  const args = ["editor", "--compare", "dev", "--width", "390", "--out", out];
  const first = run(args);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, new RegExp(`shots compare dev@${baseSha.slice(0, 7)}: base 0 cached, 2 shot; after ok`));
  assert.equal((first.stdout.match(/^RESULT:/gm) ?? []).length, 1);
  assert.doesNotMatch(first.stderr, /RESULT:/);
  assert.match(first.stderr, /child diagnostic/);
  assert.doesNotMatch(first.stderr, /captured no ok shots/);
  const base = join(mainRoot, ".scratch/shots-base", baseSha);
  await assert.rejects(lstat(join(base, "scripts/agents/kit.d/shots")), { code: "ENOENT" });
  const second = run(args);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /base 2 cached, 0 shot; after ok/);
  const third = run(["editor", "--compare", "dev", "--width", "390,768", "--out", out]);
  assert.equal(third.status, 0, third.stderr);
  assert.match(third.stdout, /base 2 cached, 2 shot; after ok/);
  const events = (await readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(events.filter(event => event.scenario.name === "before").map(event => event.widths), [[390], [768]]);
  for (const event of events) {
    assert.equal(event.fixture, await realpath(fixture));
    assert.equal(event.kind, "actual");
    assert.equal(event.request, undefined);
    assert.equal(event.port, undefined);
    assert.equal(event.root, repo);
    assert.equal(event.cwd, repo);
    assert.ok(event.stepsFile.startsWith(join(repo, ".scratch/kit-shots-compare/")));
    assert.equal(event.appRoot, event.scenario.name === "before" ? base : undefined);
  }
  const index = JSON.parse(await readFile(join(out, "index.json"), "utf8"));
  assert.equal(index.screens.length, 8, "reusing out replaces matching before/after identities");
  assert.equal(await readFile(join(out, "editor-before-390-light.png"), "utf8"), "before");
  const oldTooling = await toolingHash(repo);
  await writeFile(command, `${fakeCapture}\n// Current tooling changed\n`);
  const changedTooling = await toolingHash(repo);
  assert.notEqual(changedTooling, oldTooling);
  const changed = run(args);
  assert.equal(changed.status, 0, changed.stderr);
  assert.match(changed.stdout, /base 0 cached, 2 shot; after ok/);
  const unchanged = run(args);
  assert.equal(unchanged.status, 0, unchanged.stderr);
  assert.match(unchanged.stdout, /base 2 cached, 0 shot; after ok/);
  for (const tooling of [oldTooling, changedTooling]) {
    const key = baseKey({ screen: "editor", steps: [], width: 390, theme: "light", tooling });
    assert.equal(isHit(join(base, ".scratch/kit-shots-cache", key)), true, "old tooling entries remain unused");
  }
  const stepsFile = join(repo, ".scratch/custom.yaml");
  await writeFile(stepsFile, 'screen: files\nname: custom\nsteps:\n  - press Escape\n');
  const steps = run(["--steps", stepsFile, "--compare", baseSha, "--width", "390", "--theme", "dark", "--out", out]);
  assert.equal(steps.status, 0, steps.stderr);
  const updated = JSON.parse(await readFile(join(out, "index.json"), "utf8"));
  assert.equal(updated.screens.length, 10);
  assert.ok(updated.screens.every((item: Shot) => item.name === "before" || item.name === "after"));
  const failed = run(["pages", "--compare", "dev", "--width", "390", "--theme", "light", "--out", out], { TEST_FAIL_BASE: "1" });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Base shot failed: pages 390 light/);
  assert.match(failed.stderr, /Missing before shot: pages 390 light/);
  const diagnostic = `Base dev@${baseSha.slice(0, 7)} captured no ok shots; see server logs in ${base}/.scratch/kit-shots/`;
  assert.equal(failed.stderr.split("\n").filter(line => line === diagnostic).length, 1);
  assert.match(failed.stdout, /RESULT: fail shots compare .*after ok/);
  assert.equal((failed.stdout.match(/^RESULT:/gm) ?? []).length, 1);
  const missingKey = baseKey({ screen: "pages", steps: [], width: 390, theme: "light", tooling: changedTooling });
  assert.equal(isHit(join(base, ".scratch/kit-shots-cache", missingKey)), false);
  for (const mode of ["missing", "empty", "no-shots"]) {
    const noIndex = run(["pages", "--compare", "dev", "--width", "390", "--theme", "light", "--out", out], { TEST_FAIL_BASE: mode });
    assert.equal(noIndex.status, 1);
    assert.equal(noIndex.stderr.split("\n").filter(line => line === diagnostic).length, 1);
    assert.match(noIndex.stdout, /after ok/);
    assert.doesNotMatch(noIndex.stderr, /ENOENT|Unexpected end of JSON/);
  }
  await assert.rejects(lstat(join(base, ".scratch/kit-shots-compare")), { code: "ENOENT" });
  assert.equal(git(base, "diff", "--exit-code"), "", "base tracked files remain untouched");
  for (const path of [join(base, ".scratch/kit-shots-runs"), join(repo, ".scratch/kit-shots-compare")]) {
    assert.deepEqual(await readdir(path), [], "generated steps and run folders are cleaned");
  }
  git(repo, "rm", "-q", "tests/native-save/server.ts");
  const noServer = commit(repo);
  const cannotServe = run(["editor", "--compare", noServer, "--out", out]);
  assert.equal(cannotServe.status, 1);
  assert.ok(cannotServe.stderr.includes(`Base ${noServer}@${noServer.slice(0, 7)} cannot serve: tests/native-save/server.ts is missing`));
});

test("wrapper help and rejected compare arguments never capture", () => {
  const run = (args: string[]) => spawnSync("scripts/agents/kit.d/shots", args, { encoding: "utf8", timeout: 15_000 });
  for (const flag of ["--help", "-h"]) {
    const help = run(["--compare", "dev", flag]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage: kit shots/);
    assert.match(help.stdout, /Compare: kit shots/);
    assert.match(help.stdout, /overrides a steps file's name/);
    assert.doesNotMatch(help.stdout, /RESULT:/);
  }
  for (const [args, message] of [
    [["editor", "--compare"], /Missing value for --compare/],
    [["editor", "--compare", "dev", "--compare", "main"], /Repeated flag/],
    [["--spec", ".scratch/test.spec.ts", "--compare", "dev"], /--spec cannot be used with --compare/],
    [["missing", "--compare", "dev"], /Unknown screen/],
    [["--steps", "package.json", "--compare", "dev"], /Scenario file must live under .scratch/],
  ] as const) {
    const result = run([...args]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, message);
    assert.equal((result.stdout.match(/^RESULT:/gm) ?? []).length, 1);
  }
});
