import { fileURLToPath } from "node:url";
import { Features } from "lightningcss";
import { build as viteBuild, defineConfig, type Plugin } from "vite";
import { monacoDompurify } from "./vite-monaco-dompurify.ts";
import { monacoTrim } from "./vite-monaco-trim.ts";
import { previewRuntime } from "./vite-preview-runtime.ts";
import { pdfjsAssets } from "./vite-pdfjs-assets.ts";
import { mockups, mockupsHeaders } from "./vite-mockups.ts";

const monaco = monacoTrim();
const dompurify = monacoDompurify();

// CATALOGUE=1 (the preview editor's build, wrangler.preview.jsonc) adds the catalogue board, catalogue.html (atomic
// catalogue ticket 05); production builds never contain it. It is a second build, run once the editor's is written,
// into the same dist/ with only that page: sharing no chunk with the editor's pages, it leaves the editor's files and
// boot exactly as without it (one build of all four pages split shared modules into new chunks, +4 KB at boot).
const catalogueOnly = process.env.CATALOGUE_ONLY === "1";
function catalogue(): Plugin {
  return {
    name: "ase-catalogue-build",
    apply: "build",
    async closeBundle() {
      process.env.CATALOGUE_ONLY = "1";
      try { await viteBuild({ configFile: fileURLToPath(import.meta.url), configLoader: "runner", logLevel: "warn" }); }
      finally { delete process.env.CATALOGUE_ONLY; }
    },
  };
}

export default defineConfig({
  // The self-contained browser bundle keeps Mediabunny from splitting shared boot helpers into new chunks.
  resolve: { alias: [{ find: /^mediabunny$/, replacement: fileURLToPath(new URL("./node_modules/mediabunny/dist/bundles/mediabunny.mjs", import.meta.url)) }] },
  // MOCKUPS=1 (`npm run build:preview`) adds the planning mock-ups at /mockups/; production never has them.
  // The catalogue-only build copies public/ again, which drops the mock-ups' header rule: it adds the rule back.
  plugins: catalogueOnly ? [monaco.plugin, dompurify.plugin, ...(process.env.MOCKUPS === "1" ? [mockupsHeaders()] : [])] : [
    monaco.plugin, dompurify.plugin, previewRuntime(), pdfjsAssets(),
    ...(process.env.MOCKUPS === "1" ? [mockups(fileURLToPath(new URL(".", import.meta.url)))] : []),
    ...(process.env.CATALOGUE === "1" ? [catalogue()] : []),
  ],
  // Three pages: the editor, a synced session's guest page (live.html, slice 30), which loads the preview and the live room only,
  // and a preview link's page (preview-visit.html, slice 35), which the preview Worker serves on its own address.
  // The editor keeps the key index: kit preview and scripts/agents/cold.sh find its bundle as assets/index-*.js.
  // Every browser the editor supports preloads modules itself: no polyfill (with three pages it would be a chunk of its own,
  // one more request before the editor's first paint).
  build: { modulePreload: { polyfill: false }, rolldownOptions: { input: {
    index: fileURLToPath(new URL("./index.html", import.meta.url)), live: fileURLToPath(new URL("./live.html", import.meta.url)),
    preview: fileURLToPath(new URL("./preview-visit.html", import.meta.url)),
  } },
  // The catalogue's own build (see catalogue() above): only its page, added to the editor's dist/.
  ...(catalogueOnly ? { emptyOutDir: false, rolldownOptions: { input: { catalogue: fileURLToPath(new URL("./catalogue.html", import.meta.url)) } } } : {}) },
  // Keep light-dark() as written (src/theme.css). The CSS minifier otherwise rewrites it into a
  // prefers-color-scheme toggle, which ignores a part's inline color-scheme and adds bytes to the boot.
  // Every browser the editor supports has light-dark(); its relative colours already need newer ones.
  css: { lightningcss: { exclude: Features.LightDark } },
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
