import { defineConfig } from "vite";
import { warmPreviewProvider } from "./scripts/warm-preview-provider.ts";

const warmPreview = warmPreviewProvider();

export default defineConfig({
  plugins: [warmPreview.plugin],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/auth": "http://127.0.0.1:8787",
    },
  },
});
