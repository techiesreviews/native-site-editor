import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { monacoDompurify } from "./vite-monaco-dompurify.ts";
import { monacoTrim } from "./vite-monaco-trim.ts";
import { previewRuntime } from "./vite-preview-runtime.ts";
import { pdfjsAssets } from "./vite-pdfjs-assets.ts";

const monaco = monacoTrim();
const dompurify = monacoDompurify();

export default defineConfig({
  // The self-contained browser bundle keeps Mediabunny from splitting shared boot helpers into new chunks.
  resolve: { alias: [{ find: /^mediabunny$/, replacement: fileURLToPath(new URL("./node_modules/mediabunny/dist/bundles/mediabunny.mjs", import.meta.url)) }] },
  plugins: [monaco.plugin, dompurify.plugin, previewRuntime(), pdfjsAssets()],
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
