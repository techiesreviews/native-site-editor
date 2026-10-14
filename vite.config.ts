import { defineConfig } from "vite";
import { monacoTrim } from "./vite-monaco-trim.ts";
import { previewRuntime } from "./vite-preview-runtime.ts";

const monaco = monacoTrim();

export default defineConfig({
  plugins: [monaco.plugin, previewRuntime()],
  worker: { format: "es" },
  optimizeDeps: { ...monaco.optimizeDeps, exclude: ["@jsquash/webp", "@jsquash/avif"] },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/auth": "http://127.0.0.1:8787",
    },
  },
});
