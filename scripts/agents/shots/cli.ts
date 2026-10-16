import { spawn } from "node:child_process";
import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
// @ts-expect-error Shared kit helpers are plain JavaScript without declarations.
import { kitMainRoot, kitOwner, kitResult, kitRoot, nodeEnv } from "../kit-lib.mjs";
import { parseArgs, parseSteps, screens, type Shot } from "./core";

const help = `Usage: kit shots <screen...> [--width 390,1280] [--theme light|dark] [--out dir]
       kit shots --steps .scratch/scenario.json|yaml [matrix flags] [--out dir]
       kit shots --spec .scratch/example.spec.ts [--out dir]

Screens: ${screens.join(", ")}
No screen: list screens and fail. Default matrix: 390,768,1280 x light,dark.
Default output: <kitMainRoot>/.scratch/shots/<owner>/<YYYYMMDD-HHMMSS>/.
Steps files must resolve under this checkout's or main checkout's .scratch/.
JSON: {"screen":"media-gallery","steps":["hover first tile"],"name":"after"}
YAML subset: one mapping with screen/name scalars and an indented steps list;
plain, single-quoted or JSON double-quoted strings, comments on separate lines.
Steps: click "<name>"; type "<text>" in <label>; hover first|last|nth N tile;
hover "<name>"; press <key>; scroll down|up; wait for "<text>".
nth is 1-based. 'search' means the searchbox. Button names can match a substring.
Before/after: use name "before" and "after" with the same screen, width, theme
and --out across runs; contact sheet includes both. Each screen retries at most once.
--spec delegates to shots.sh; its raw spec controls captures and matrix.
Real starter: ~/Projects/native-site-editor-starter; ASE_NATIVE_SAVE_FIXTURE overrides it.
`;

async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { cwd: kitRoot(), env, stdio: "inherit" });
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  const handlers = signals.map(signal => () => { child.kill(signal); });
  signals.forEach((signal, index) => process.on(signal, handlers[index]));
  try {
    return await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve(code ?? (signal ? 128 : 1)));
    });
  } finally { signals.forEach((signal, index) => process.off(signal, handlers[index])); }
}

async function scratchFile(file: string) {
  const path = await realpath(resolve(file));
  const roots = await Promise.all([kitRoot(), kitMainRoot()].map(async root => {
    try { return await realpath(join(root, ".scratch")); } catch { return join(root, ".scratch"); }
  }));
  if (!roots.some(root => { const part = relative(root, path); return part && !part.startsWith("..") && !isAbsolute(part); })) throw new Error("Scenario file must live under .scratch/");
  return path;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) { console.log(help); return; }
  let out = "(not created)";
  try {
    const options = parseArgs(args);
    const root = kitRoot();
    const owner = kitOwner().replace(/[^a-zA-Z0-9_.-]/g, "-").replace(/^\.+$/, "unknown");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    out = resolve(options.out ?? join(kitMainRoot(), ".scratch/shots", owner, stamp));
    let scenarios = options.screens.map(screen => ({ screen, steps: [] as string[] }));
    if (options.steps) {
      const file = await scratchFile(options.steps);
      if (!/\.(json|ya?ml)$/.test(file)) throw new Error("--steps accepts .json, .yaml or .yml");
      scenarios = [parseSteps(await readFile(file, "utf8"), /\.ya?ml$/.test(file))];
    }
    const spec = options.spec ? await scratchFile(options.spec) : undefined;
    if (spec && !spec.endsWith(".spec.ts")) throw new Error("--spec needs a .spec.ts file");
    const fixture = await realpath(process.env.ASE_NATIVE_SAVE_FIXTURE ?? join(homedir(), "Projects/native-site-editor-starter"));
    if (!(await stat(fixture)).isDirectory()) throw new Error(`Fixture missing: ${fixture}`);
    await mkdir(out, { recursive: true });
    const env = nodeEnv({ ...process.env, ASE_NATIVE_SAVE_FIXTURE: fixture, ASE_NATIVE_SAVE_FIXTURE_KIND: process.env.ASE_NATIVE_SAVE_FIXTURE_KIND ?? "actual" });
    if (spec) {
      const status = await run(join(root, "scripts/agents/shots.sh"), [out, spec], env);
      process.exitCode = status;
      kitResult(status ? "fail" : "ok", `shots raw spec, out ${out}`);
      return;
    }
    // Keep prior shots for before/after captures in an explicitly reused output directory.
    let previous: Shot[] = [];
    try { previous = JSON.parse(await readFile(join(out, "index.json"), "utf8")).screens; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    env.ASE_KIT_SHOTS_REQUEST = JSON.stringify({ options, scenarios, out, previous });
    const status = await run(join(root, "scripts/agents/port.sh"), [join(root, "node_modules/.bin/playwright"), "test", "--config", join(root, "scripts/agents/shots/config.ts")], env);
    const index = JSON.parse(await readFile(join(out, "index.json"), "utf8"));
    for (const file of index.files) console.log(`${join(out, file.path)} (${file.bytes} bytes)`);
    const failed = index.screens.filter((shot: Shot) => !shot.ok).length + (index.outputFailures?.length ?? 0);
    const findings = index.layoutFindings.length;
    process.exitCode = status || (failed ? 1 : 0);
    kitResult(process.exitCode ? "fail" : "ok", `shots ${index.files.length} files, ${failed} failed, ${findings} layout findings, out ${out}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    kitResult("fail", `shots 0 files, 1 failed, 0 layout findings, out ${out}`);
  }
}

await main();
