import { defineConfig } from "vite";
import { monacoTrim } from "./vite-monaco-trim.ts";

const monaco = monacoTrim();

export default defineConfig({
  plugins: [monaco.plugin],
  optimizeDeps: monaco.optimizeDeps,
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/auth": "http://127.0.0.1:8787",
    },
  },
});
