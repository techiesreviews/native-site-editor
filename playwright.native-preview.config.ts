import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/native-preview",
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: ".scratch/native-preview/results",
  use: {
    baseURL: "http://127.0.0.1:5207",
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  webServer: [
    {
      command: "ASE_NATIVE_SAVE_PORT=5207 tsx tests/native-save/server.ts",
      url: "http://127.0.0.1:5207/api/session",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
