import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import config, { server } from "../../../playwright.config.ts";

const root = resolve(import.meta.dirname, "../../..");
const port = Number(process.env.ASE_TEST_PORT);
if (!port || !process.env.ASE_KIT_SHOTS_REQUEST) throw new Error("Run kit shots");
const native = config.projects!.find(project => project.name === "native-save")!;

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "capture.spec.ts",
  outputDir: resolve(root, `.scratch/kit-shots-results/${port}`),
  reporter: "line",
  workers: 1,
  retries: 0,
  projects: [{ name: "kit-shots", timeout: 0, expect: native.expect, use: { ...native.use, baseURL: `http://127.0.0.1:${port}` } }],
  webServer: { ...server("kit-shots", port), cwd: root },
});
