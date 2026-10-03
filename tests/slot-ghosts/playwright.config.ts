import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: ".", testMatch: "browser.spec.ts", workers: 1, use: { viewport: { width: 1200, height: 900 }, reducedMotion: "reduce" }, outputDir: "../../.scratch/slot-ghosts-browser" });
