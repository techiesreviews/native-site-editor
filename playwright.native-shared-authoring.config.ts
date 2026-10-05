import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/native-shared-authoring", workers: 1, retries: 0, timeout: 30_000,
  expect: { timeout: 5_000 }, outputDir: ".scratch/native-shared-authoring/results",
  use: { viewport: { width: 800, height: 700 }, reducedMotion: "reduce", screenshot: "only-on-failure" },
});
