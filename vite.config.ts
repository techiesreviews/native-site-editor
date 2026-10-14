import { defineConfig } from "vite";
import { monacoTrim } from "./vite-monaco-trim.ts";
import { previewRuntime } from "./vite-preview-runtime.ts";

const monaco = monacoTrim();

export default defineConfig({
  plugins: [monaco.plugin, previewRuntime()],
  worker: { format: "es" },
  // SVGO and oxipng are reached only from the optimise worker; prebundle them so the dev server never reloads
  // mid-session. jSquash WebP/AVIF resolve their WASM next to their own files, so they stay unbundled.
  optimizeDeps: { ...monaco.optimizeDeps, include: ["svgo/browser", "@jsquash/oxipng/codec/pkg/squoosh_oxipng.js"], exclude: ["@jsquash/webp", "@jsquash/avif"] },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/auth": "http://127.0.0.1:8787",
    },
  },
});
