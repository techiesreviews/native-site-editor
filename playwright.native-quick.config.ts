import { defineConfig } from "@playwright/test";

// Targeted run against an already-running demo server (default: the root-owned
// instance on 5190). No webServer, so there is no startup build.
export default defineConfig({
  testDir: "./tests/native-preview",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: ".scratch/native-preview/quick-results",
  use: {
    baseURL: process.env.ASE_NATIVE_BASE_URL ?? "http://127.0.0.1:5190",
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
});
