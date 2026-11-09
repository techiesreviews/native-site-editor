import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { monacoDompurify } from "./vite-monaco-dompurify.ts";
import { monacoTrim } from "./vite-monaco-trim.ts";
import { previewRuntime } from "./vite-preview-runtime.ts";
import { pdfjsAssets } from "./vite-pdfjs-assets.ts";
import { mockups } from "./vite-mockups.ts";

const monaco = monacoTrim();
const dompurify = monacoDompurify();

export default defineConfig({
  // The self-contained browser bundle keeps Mediabunny from splitting shared boot helpers into new chunks.
  resolve: { alias: [{ find: /^mediabunny$/, replacement: fileURLToPath(new URL("./node_modules/mediabunny/dist/bundles/mediabunny.mjs", import.meta.url)) }] },
  // MOCKUPS=1 (`npm run build:preview`) adds the planning mock-ups at /mockups/; production never has them.
  plugins: [monaco.plugin, dompurify.plugin, previewRuntime(), pdfjsAssets(), ...(process.env.MOCKUPS === "1" ? [mockups(fileURLToPath(new URL(".", import.meta.url)))] : [])],
  // Three pages: the editor, a synced session's guest page (live.html, slice 30), which loads the preview and the live room only,
  // and a preview link's page (preview-visit.html, slice 35), which the preview Worker serves on its own address.
  // The editor keeps the key index: kit preview and scripts/agents/cold.sh find its bundle as assets/index-*.js.
  // Every browser the editor supports preloads modules itself: no polyfill (with three pages it would be a chunk of its own,
  // one more request before the editor's first paint).
  build: { modulePreload: { polyfill: false }, rolldownOptions: { input: {
    index: fileURLToPath(new URL("./index.html", import.meta.url)), live: fileURLToPath(new URL("./live.html", import.meta.url)),
    preview: fileURLToPath(new URL("./preview-visit.html", import.meta.url)),
  } } },
  worker: { format: "es" },
  // SVGO and oxipng are reached only from the optimise worker; prebundle them so the dev server never reloads
  // mid-session. jSquash WebP/AVIF resolve their WASM next to their own files, so they stay unbundled.
  optimizeDeps: {
    ...monaco.optimizeDeps, ...dompurify.optimizeDeps,
    // Every helper's pre-bundle plugins run, not only the last helper's.
    rolldownOptions: { ...monaco.optimizeDeps?.rolldownOptions, ...dompurify.optimizeDeps?.rolldownOptions,
      plugins: [monaco.optimizeDeps?.rolldownOptions?.plugins, dompurify.optimizeDeps?.rolldownOptions?.plugins] },
    include: ["mediabunny", "pdfjs-dist", "svgo/browser", "@jsquash/oxipng/codec/pkg/squoosh_oxipng.js"], exclude: ["@jsquash/webp", "@jsquash/avif"] },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/auth": "http://127.0.0.1:8787",
    },
  },
});
