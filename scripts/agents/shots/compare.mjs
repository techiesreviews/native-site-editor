import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { kitMainRoot, kitOwner, kitResult, kitRoot, nodeEnv } from "../kit-lib.mjs";
import { parseArgs, parseSteps } from "./core.ts";

export function splitCompare(args) {
  const rest = [];
  let ref;
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== "--compare") { rest.push(args[index]); continue; }
    if (ref !== undefined) throw new Error("Repeated flag: --compare");
    ref = args[++index];
    if (!ref || ref.startsWith("-")) throw new Error("Missing value for --compare");
  }
  if (ref === undefined) throw new Error("Missing --compare <ref>");
  return { ref, rest };
}

export function baseKey({ screen, steps, width, theme }) {
  return createHash("sha256").update(JSON.stringify({ screen, steps, width, theme })).digest("hex");
}

function cachedShot(dir) {
  try {
    const shot = JSON.parse(readFileSync(join(dir, "shot.json"), "utf8"));
    if (!shot.ok || !Array.isArray(shot.files) || ![".png", ".webp"].every(extension => shot.files.some(file => file.path.endsWith(extension)))) return null;
    if (!shot.files.every(file => file.path === basename(file.path) && statSync(join(dir, file.path)).isFile())) return null;
    return shot;
  } catch { return null; }
}

/** An entry is usable only after its metadata and both image formats exist. */
export function isHit(dir) {
  return cachedShot(dir) !== null;
}

export function planBase(scenarios, widths, themes, hit) {
  return scenarios.flatMap(scenario => widths.flatMap(width => themes
    .filter(theme => !hit(scenario, width, theme))
    .map(theme => ({ scenario, width, theme }))));
}

export function pruneTargets(entries, keep = 3, current) {
  const sorted = entries.filter(entry => /^[0-9a-f]{40}$/.test(entry.sha)).sort((a, b) => b.mtimeMs - a.mtimeMs);
  const retained = new Set(sorted.slice(0, keep).map(entry => entry.sha));
  if (current) retained.add(current);
  return sorted.filter(entry => !retained.has(entry.sha));
}

export function beforeShots(cached) {
  return cached.map(shot => ({ ...shot, name: "before", files: shot.files.map(file => ({
    ...file, path: `${shot.screen}-before-${shot.width}-${shot.theme}${extname(file.path)}`,
  })) }));
}

const children = new Set();
let interrupted;
function checkInterrupted() {
  if (interrupted) throw new Error(`Interrupted by ${interrupted}`);
}

/** Forward complete lines so nested kit commands cannot emit extra RESULT lines. */
async function run(command, args, { cwd, env = process.env, forward = false }) {
  checkInterrupted();
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  let stdout = "", stderr = "";
  const readers = [];
  for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    if (forward) {
      const reader = createInterface({ input: stream, crlfDelay: Infinity });
      // A predicate can also hide lines, such as paths in a run folder deleted afterwards.
      const keep = typeof forward === "function" ? forward : () => true;
      reader.on("line", line => { if (!line.startsWith("RESULT:") && keep(line)) output.write(`${line}\n`); });
      readers.push(reader);
    }
  }
  child.stdout.on("data", data => { stdout += data; });
  child.stderr.on("data", data => { stderr += data; });
  try {
    const status = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve(code ?? (signal ? 128 : 1)));
    });
    checkInterrupted();
    return { status, stdout: stdout.trimEnd(), stderr: stderr.trimEnd() };
  } finally {
    children.delete(child);
    readers.forEach(reader => reader.close());
  }
}

async function git(repo, args, required = true) {
  const result = await run("git", ["-C", repo, ...args], { cwd: repo });
  if (required && result.status) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result;
}

async function removeBase(repo, dir) {
  await git(repo, ["worktree", "remove", "--force", dir], false);
  await rm(dir, { recursive: true, force: true });
  await git(repo, ["worktree", "prune"]);
}

async function setupLock(parent) {
  const lock = join(parent, ".lock");
  const deadline = Date.now() + 60_000;
  while (true) {
    checkInterrupted();
    try { await mkdir(lock); return lock; }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    try {
      if (Date.now() - (await stat(lock)).mtimeMs > 600_000) {
        await rm(lock, { recursive: true, force: true });
        continue;
      }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for shots base lock: ${lock}`);
    await delay(100);
  }
}

export async function ensureBase({ repo, mainRoot, sha, modules }) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Invalid base commit: ${sha}`);
  const parent = join(mainRoot, ".scratch/shots-base");
  const dir = join(parent, sha);
  await mkdir(parent, { recursive: true });
  const lock = await setupLock(parent);
  try {
    let reused = false;
    try {
      // The base dir sits inside the main checkout, so a leftover plain folder would
      // otherwise answer with the main checkout's HEAD; require its own worktree top.
      const head = await git(dir, ["rev-parse", "--show-toplevel", "HEAD"], false);
      const [top, commit] = head.stdout.split("\n");
      reused = head.status === 0 && commit === sha && top === await realpath(dir)
        && (await stat(join(dir, "node_modules"))).isDirectory()
        && (await lstat(join(dir, ".scratch/native-static-preview"))).isSymbolicLink();
    } catch (error) { checkInterrupted(); if (error.code !== "ENOENT") throw error; }
    if (!reused) {
      const source = await realpath(modules);
      if (!(await stat(source)).isDirectory()) throw new Error(`Missing node_modules: ${source}`);
      await removeBase(repo, dir);
      await git(repo, ["worktree", "add", "--detach", dir, sha]);
      await symlink(source, join(dir, "node_modules"));
      await mkdir(join(dir, ".scratch"), { recursive: true });
      await symlink(join(mainRoot, ".scratch/native-static-preview"), join(dir, ".scratch/native-static-preview"));
    }
    const now = new Date();
    await utimes(dir, now, now);
    const entries = await Promise.all((await readdir(parent, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && /^[0-9a-f]{40}$/.test(entry.name))
      .map(async entry => ({ sha: entry.name, mtimeMs: (await stat(join(parent, entry.name))).mtimeMs })));
    for (const entry of pruneTargets(entries, 3, sha)) await removeBase(repo, join(parent, entry.sha));
    return { dir, reused };
  } finally { await rm(lock, { recursive: true, force: true }); }
}

async function scratchFile(file, roots) {
  const path = await realpath(resolve(file));
  const scratchRoots = await Promise.all(roots.map(async root => {
    try { return await realpath(join(root, ".scratch")); } catch { return join(root, ".scratch"); }
  }));
  if (!scratchRoots.some(root => { const part = relative(root, path); return part && !part.startsWith("..") && !isAbsolute(part); })) throw new Error("Scenario file must live under .scratch/");
  if (!/\.(json|ya?ml)$/.test(path)) throw new Error("--steps accepts .json, .yaml or .yml");
  return path;
}

async function saveCache(dir, shot, out) {
  await mkdir(resolve(dir, ".."), { recursive: true });
  const temp = await mkdtemp(`${dir}-`);
  try {
    for (const file of shot.files) {
      if (file.path !== basename(file.path)) throw new Error(`Unexpected shot path: ${file.path}`);
      await copyFile(join(out, file.path), join(temp, file.path));
    }
    await writeFile(join(temp, "shot.json"), JSON.stringify(shot));
    if (!isHit(temp)) throw new Error(`Incomplete base shot: ${shot.screen} ${shot.width} ${shot.theme}`);
    // Another compare may have published this same entry while we captured it.
    if (!isHit(dir)) {
      await rm(dir, { recursive: true, force: true });
      try { await rename(temp, dir); }
      catch (error) { if (!isHit(dir)) throw error; }
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
}

function matrixArgs(widths, themes) {
  return ["--width", widths.join(","), ...(themes.length === 1 ? ["--theme", themes[0]] : [])];
}

async function capture(root, scenario, name, out, widths, themes, env, stamp) {
  const stepsDir = join(root, ".scratch/kit-shots-compare");
  await mkdir(stepsDir, { recursive: true });
  const file = join(stepsDir, `${stamp}-${randomUUID()}.json`);
  try {
    await writeFile(file, JSON.stringify({ screen: scenario.screen, steps: scenario.steps, name }));
    return await run(join(root, "scripts/agents/kit.d/shots"), ["--steps", file, "--out", out, ...matrixArgs(widths, themes)], {
      cwd: root, env: { ...env, KIT_ROOT: root }, forward: name === "before" ? line => !line.startsWith(out) : true,
    });
  } finally { await rm(file, { force: true }); }
}

export async function main(args = process.argv.slice(2)) {
  let ref = "(unknown)", sha = "???????", out = "(not created)", hits = 0, misses = 0, after = "not run", failed = false;
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  const handlers = signals.map(signal => () => {
    interrupted = signal;
    for (const child of children) child.kill(signal);
  });
  signals.forEach((signal, index) => process.on(signal, handlers[index]));
  try {
    const split = splitCompare(args);
    ref = split.ref;
    const options = parseArgs(split.rest);
    if (options.spec) throw new Error("--spec cannot be used with --compare");
    const root = kitRoot(), mainRoot = kitMainRoot();
    let scenarios = options.screens.map(screen => ({ screen, steps: [] }));
    if (options.steps) {
      const file = await scratchFile(options.steps, [root, mainRoot]);
      scenarios = [parseSteps(await readFile(file, "utf8"), /\.ya?ml$/.test(file))];
    }
    const fixture = await realpath(process.env.ASE_NATIVE_SAVE_FIXTURE ?? join(homedir(), "Projects/native-site-editor-starter"));
    if (!(await stat(fixture)).isDirectory()) throw new Error(`Fixture missing: ${fixture}`);
    const env = nodeEnv({ ...process.env, ASE_NATIVE_SAVE_FIXTURE: fixture, ASE_NATIVE_SAVE_FIXTURE_KIND: process.env.ASE_NATIVE_SAVE_FIXTURE_KIND ?? "actual" });
    delete env.ASE_KIT_SHOTS_REQUEST;
    delete env.ASE_TEST_PORT;
    await git(root, ["fetch", "-q", "origin", ref], false);
    const remote = await git(root, ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${ref}`], false);
    sha = (await git(root, ["rev-parse", "--verify", `${remote.status === 0 ? `origin/${ref}` : ref}^{commit}`])).stdout;
    const { dir: base } = await ensureBase({ repo: root, mainRoot, sha, modules: join(root, "node_modules") });
    try { await stat(join(base, "scripts/agents/kit.d/shots")); }
    catch { throw new Error(`Ref ${ref} predates kit shots: scripts/agents/kit.d/shots is missing`); }
    const cacheDir = (scenario, width, theme) => join(base, ".scratch/kit-shots-cache", baseKey({ ...scenario, width, theme }));
    const missing = planBase(scenarios, options.widths, options.themes, (scenario, width, theme) => isHit(cacheDir(scenario, width, theme)));
    misses = missing.length;
    hits = scenarios.length * options.widths.length * options.themes.length - misses;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const runStamp = `${stamp}-${process.pid}`;
    const owner = kitOwner().replace(/[^a-zA-Z0-9_.-]/g, "-").replace(/^\.+$/, "unknown");
    out = resolve(options.out ?? join(mainRoot, ".scratch/shots", owner, stamp));
    for (const scenario of scenarios) {
      // Group only identical missing width sets, avoiding hits in a partial matrix.
      const groups = new Map();
      for (const theme of options.themes) {
        const widths = missing.filter(item => item.scenario === scenario && item.theme === theme).map(item => item.width);
        if (!widths.length) continue;
        const key = widths.join(",");
        const group = groups.get(key) ?? { widths, themes: [] };
        group.themes.push(theme);
        groups.set(key, group);
      }
      for (const { widths, themes } of groups.values()) {
        const runOut = join(base, ".scratch/kit-shots-runs", `${runStamp}-${randomUUID()}`);
        try {
          const result = await capture(base, scenario, "before", runOut, widths, themes, env, runStamp);
          if (result.status) failed = true;
          const index = JSON.parse(await readFile(join(runOut, "index.json"), "utf8"));
          for (const shot of index.screens) {
            if (!shot.ok) { failed = true; console.error(`Base shot failed: ${shot.screen} ${shot.width} ${shot.theme}`); continue; }
            await saveCache(cacheDir(scenario, shot.width, shot.theme), shot, runOut);
          }
        } catch (error) { checkInterrupted(); failed = true; console.error(error.message); }
        finally { await rm(runOut, { recursive: true, force: true }); }
      }
    }
    await mkdir(out, { recursive: true });
    const cached = [];
    for (const scenario of scenarios) for (const width of options.widths) for (const theme of options.themes) {
      const dir = cacheDir(scenario, width, theme);
      const shot = cachedShot(dir);
      if (!shot) { failed = true; console.error(`Missing before shot: ${scenario.screen} ${width} ${theme}`); continue; }
      const before = beforeShots([shot])[0];
      for (let index = 0; index < shot.files.length; index++) await copyFile(join(dir, shot.files[index].path), join(out, before.files[index].path));
      cached.push(before);
    }
    let previous = [];
    try { previous = JSON.parse(await readFile(join(out, "index.json"), "utf8")).screens; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    previous = previous.filter(shot => !(shot.name === "before" && scenarios.some(scenario => scenario.screen === shot.screen) && options.widths.includes(shot.width) && options.themes.includes(shot.theme)));
    await writeFile(join(out, "index.json"), JSON.stringify({ version: 1, screens: [...previous, ...cached] }));
    let afterFailed = false;
    after = "fail";
    for (const scenario of scenarios) {
      const result = await capture(root, scenario, "after", out, options.widths, options.themes, env, runStamp);
      if (result.status) afterFailed = true;
    }
    after = afterFailed ? "fail" : "ok";
    failed ||= afterFailed;
  } catch (error) {
    failed = true;
    console.error(error instanceof Error ? error.message : String(error));
  } finally {
    signals.forEach((signal, index) => process.off(signal, handlers[index]));
    process.exitCode = failed ? 1 : 0;
    kitResult(failed ? "fail" : "ok", `shots compare ${ref}@${sha.slice(0, 7)}: base ${hits} cached, ${misses} shot; after ${after}; out ${out}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
