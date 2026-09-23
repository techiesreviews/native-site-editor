import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/heading-bar',
  testMatch: /browser-structural-preview\.spec\.ts/,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  outputDir: '.scratch/browser-structural-preview/results',
  use: {
    baseURL: 'http://127.0.0.1:5181',
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'VITE_BROWSER_STRUCTURAL_PREVIEW=1 npx vite --host 127.0.0.1 --port 5181 --strictPort',
    url: 'http://127.0.0.1:5181',
    reuseExistingServer: false,
  },
});
