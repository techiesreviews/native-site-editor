// The cold-start byte budget (docs/wayfinder/lean-fast-editor/tickets/02-set-cold-start-budget.md):
// at most 350 KB gzip fetched before the first preview paint, on the
// throttled local profile (100 ms / 20 Mbps), median of the cold loads.
//
//   npm run test:budget                  build dist, measure, fail over budget
//   npm run test:budget -- --no-build    measure the dist/ already built
//   npm run test:budget -- --report-only print the number, never fail
//
// It builds the production UI, serves it with tests/native-save/server.ts in
// dist mode (gzip, public/_headers, the real worker over a fake GitHub) on
// ASE_BUDGET_PORT (default 5294), and runs tests/perf/cold-start.ts against it.
// ASE_BUDGET_RUNS (default 3) sets the number of cold/warm runs.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BUDGET = 350 * 1024;
const args = new Set(process.argv.slice(2));
const reportOnly = args.has("--report-only") || process.env.ASE_BUDGET_REPORT_ONLY === "1";
const port = Number(process.env.ASE_BUDGET_PORT ?? 5294);
const runs = process.env.ASE_BUDGET_RUNS ?? "3";
const base = `http://127.0.0.1:${port}`;

function run(command: string, argv: string[], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(command, argv, { stdio: "inherit", env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${command} ${argv.join(" ")} exited with ${result.status ?? result.signal}`);
}

async function waitFor(url: string, server: ChildProcess, ms = 120_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`The server exited with ${server.exitCode} before it answered.`);
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not answer within ${ms / 1000} s.`);
}

const median = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

// The preview runtime is a classic script Vite must emit as-is under a hashed
// /assets/ name (native-preview.ts); a bundled or transformed copy fails here.
function assertRuntimeVerbatim() {
  const emitted = readdirSync("dist/assets").filter((name) => /^native-preview-runtime-[\w-]+\.js$/.test(name));
  if (emitted.length !== 1) throw new Error(`Expected one dist/assets/native-preview-runtime-<hash>.js, found ${emitted.length}.`);
  if (!readFileSync(join("dist/assets", emitted[0])).equals(readFileSync("src/components/native-preview-runtime.js")))
    throw new Error(`dist/assets/${emitted[0]} differs from src/components/native-preview-runtime.js: Vite transformed the runtime.`);
  console.log(`Preview runtime emitted verbatim as dist/assets/${emitted[0]}.`);
}

async function main() {
  if (!args.has("--no-build")) run("npx", ["vite", "build"]);
  assertRuntimeVerbatim();
  const dir = mkdtempSync(join(tmpdir(), "ase-budget-"));
  const json = join(dir, "cold.json");
  const server = spawn("npx", ["tsx", "tests/native-save/server.ts"], {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, ASE_NATIVE_SAVE_DIST: "1", ASE_NATIVE_SAVE_PORT: String(port) },
    detached: true,
  });
  const stop = () => { try { process.kill(-server.pid!, "SIGTERM"); } catch { /* already gone */ } };
  try {
    await waitFor(`${base}/api/session`, server);
    run("npx", ["tsx", "tests/perf/cold-start.ts", runs], { ASE_COLD_BASE: base, ASE_COLD_NET: "100/20", ASE_COLD_JSON: json });
    const result = JSON.parse(readFileSync(json, "utf8")) as { cold: { bytesBeforePaint: number; paint: number | null; signedIn: boolean }[] };
    if (!result.cold.every((r) => r.signedIn && r.paint !== null)) throw new Error("A cold load never painted the preview signed in; nothing to measure.");
    const bytes = median(result.cold.map((r) => r.bytesBeforePaint));
    const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
    const verdict = bytes <= BUDGET ? "within" : "OVER";
    console.log(`\nByte budget: ${kb(bytes)} gzip before first preview paint (cold median of ${result.cold.length}), budget ${kb(BUDGET)}: ${verdict}.`);
    if (bytes > BUDGET) {
      if (reportOnly) console.log("Report-only: not failing.");
      else process.exitCode = 1;
    }
  } finally {
    stop();
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
