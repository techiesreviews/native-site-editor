import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', workers: 1, retries: 0,
  outputDir: '../../.scratch/style-widgets-browser',
  use: { baseURL: 'http://127.0.0.1:5386', viewport: { width: 800, height: 600 }, reducedMotion: 'reduce' },
});
