import { defineConfig } from "@playwright/test";

// ASE_TEST_PORT moves the server off 5206 (for runs side by side).
const port = Number(process.env.ASE_TEST_PORT ?? 5206);

// Focused end-to-end tests for native Explicit Save to GitHub. The webServer is
// the native-save server, which runs the REAL worker handler over a fake GitHub
// boundary (no Astro build). Port 5206 is the focused-test port.
export default defineConfig({
  testDir: "./tests/native-save",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: ".scratch/native-save/results",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  webServer: [
    {
      command: `ASE_NATIVE_SAVE_PORT=${port} tsx tests/native-save/server.ts`,
      url: `http://127.0.0.1:${port}/api/session`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
