import { defineConfig } from "@playwright/test";

// Standalone real-preview bridge and existing section bridge regressions.
export default defineConfig({
  testDir: "./tests",
  testMatch: ["native-page-part-preview/*.spec.ts", "native-master-preview/*.spec.ts"],
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: ".scratch/native-page-part-preview/results",
  use: { viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
