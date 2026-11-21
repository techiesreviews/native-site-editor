import { fileURLToPath } from "node:url";
import { Features } from "lightningcss";
import { build as viteBuild, defineConfig, type Plugin, type ResolvedConfig } from "vite";
import { monacoDompurify } from "./vite-monaco-dompurify.ts";
import { monacoTrim } from "./vite-monaco-trim.ts";
import { previewRuntime } from "./vite-preview-runtime.ts";
import { pdfjsAssets } from "./vite-pdfjs-assets.ts";
import { mockups, mockupsHeaders } from "./vite-mockups.ts";

const monaco = monacoTrim();
const dompurify = monacoDompurify();

// The guest page builds separately so its bar and lazy picker do not split the editor's boot modules into more chunks.
// CATALOGUE=1 (`npm run build:preview`) then adds the catalogue board, catalogue.html (atomic catalogue ticket 05),
// in another independent build. Both append to dist/; production builds never contain the catalogue.
const catalogueOnly = process.env.CATALOGUE_ONLY === "1";
const guestOnly = process.env.GUEST_ONLY === "1";
function separatePages(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "ase-separate-pages-build",
    apply: "build",
    configResolved(resolved) { config = resolved; },
    async closeBundle() {
      // The guest's bar and picker share editor modules, but must not split those modules out of its first load.
      // As with the catalogue, a separate build keeps each page's lazy imports within that page's own graph.
      for (const flag of ["GUEST_ONLY", ...(process.env.CATALOGUE === "1" ? ["CATALOGUE_ONLY"] : [])]) {
        process.env[flag] = "1";
        try { await viteBuild({ configFile: fileURLToPath(import.meta.url), configLoader: "runner", logLevel: "warn",
          root: config.root, base: config.base,
          build: { outDir: config.build.outDir, assetsDir: config.build.assetsDir, write: config.build.write, emptyOutDir: false },
        }); }
        finally { delete process.env[flag]; }
      }
    },
  };
}

export default defineConfig({
  // The self-contained browser bundle keeps Mediabunny from splitting shared boot helpers into new chunks.
  resolve: { alias: [{ find: /^mediabunny$/, replacement: fileURLToPath(new URL("./node_modules/mediabunny/dist/bundles/mediabunny.mjs", import.meta.url)) }] },
  // MOCKUPS=1 (`npm run build:preview`) adds the planning mock-ups at /mockups/ (/mockups/ opens the board's mock-ups,
  // /mockups/list/ leads there too); production never has them.
  // Each extra page copies public/ again, so it adds the mock-ups' header rule back.
  plugins: catalogueOnly || guestOnly ? [monaco.plugin, dompurify.plugin, ...(guestOnly ? [previewRuntime()] : []), ...(process.env.MOCKUPS === "1" ? [mockupsHeaders()] : [])] : [
    monaco.plugin, dompurify.plugin, previewRuntime(), pdfjsAssets(),
    ...(process.env.MOCKUPS === "1" ? [mockups(fileURLToPath(new URL(".", import.meta.url)))] : []),
    separatePages(),
  ],
  // Three pages: the editor, a synced session's guest page (live.html, slice 30), which loads the preview and the live room only,
  // and a preview link's page (preview-visit.html, slice 35), which the preview Worker serves on its own address.
  // The editor keeps the key index: kit preview and scripts/agents/cold.sh find its bundle as assets/index-*.js.
  // Every browser the editor supports preloads modules itself: no polyfill (with three pages it would be a chunk of its own,
  // one more request before the editor's first paint).
  build: { modulePreload: { polyfill: false }, rolldownOptions: { input: {
    index: fileURLToPath(new URL("./index.html", import.meta.url)),
    preview: fileURLToPath(new URL("./preview-visit.html", import.meta.url)),
  } },
  ...(guestOnly ? { emptyOutDir: false, rolldownOptions: { input: { live: fileURLToPath(new URL("./live.html", import.meta.url)) } } } : {}),
  // The catalogue's own build: only its page, added to the editor's dist/.
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
