import { defineConfig } from '@playwright/test';
// Focused check of the focal widget's typed drafts, on its own port (5311).
export default defineConfig({
  testDir: '.', testMatch: 'focal-draft.spec.ts', workers: 1, retries: 0,
  outputDir: '../../.scratch/style-test-results/focal-draft',
  use: { baseURL: 'http://127.0.0.1:5311', viewport: { width: 800, height: 600 }, reducedMotion: 'reduce' },
  webServer: { command: 'npx vite --host 127.0.0.1 --port 5311 --strictPort', url: 'http://127.0.0.1:5311/tests/style-widgets/fixture.html', reuseExistingServer: false, cwd: '../..' },
});
