import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/heading-bar',
  testIgnore: /(?:browser-structural-preview|button-insertion-recovery)\.spec\.ts/,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  outputDir: '.scratch/heading-bar/results',
  use: {
    baseURL: 'http://127.0.0.1:5180',
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5180 --strictPort',
    url: 'http://127.0.0.1:5180',
    reuseExistingServer: false,
  },
});
