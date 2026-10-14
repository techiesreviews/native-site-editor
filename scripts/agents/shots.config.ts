import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import config, { server } from "../../playwright.config.ts";

const root = resolve(import.meta.dirname, "../..");
const scenario = process.env.ASE_SHOTS_SPEC;
if (!scenario || !process.env.ASE_SHOTS_OUT_DIR || !process.env.ASE_TEST_PORT) throw new Error("Run shots.sh <out-dir> <scratch-spec>");
const native = config.projects!.find(project => project.name === "native-save")!;
const port = Number(process.env.ASE_TEST_PORT);

export default defineConfig({
  ...config,
  testDir: dirname(scenario),
  testMatch: new RegExp(`${scenario.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
  // Dedicated absolute paths avoid resolving the root config's relative
  // server/artifact paths against this config's scripts/agents directory.
  outputDir: resolve(root, `.scratch/shots-results/${port}`),
  reporter: "line",
  projects: [{
    name: "shots",
    timeout: native.timeout,
    expect: native.expect,
    use: { ...native.use, baseURL: `http://127.0.0.1:${port}` },
  }],
  webServer: { ...server("shots", port), cwd: root },
});
