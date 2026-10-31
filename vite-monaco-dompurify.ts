import { fileURLToPath } from "node:url";
import type { Plugin, UserConfig } from "vite";

// Ships the npm dompurify package in place of the copy Monaco vendors.
//
// monaco-editor bundles its own DOMPurify (esm/vs/base/browser/dompurify/
// dompurify.js, byte for byte the package's dist/purify.es.mjs) and imports it
// by relative path from domSanitize.js, so the package.json override on
// dompurify only reaches npm audit, never the browser bundle. This points that
// one import at the installed package, which the override keeps on a patched
// release.
//
// Applied to the build and the dev server's dependency pre-bundling alike, so
// the browser tests run the same DOMPurify as production.
const sanitizeModule = /monaco-editor[\\/]esm[\\/]vs[\\/]base[\\/]browser[\\/]domSanitize\.js$/;
export const dompurifyEntry = fileURLToPath(new URL("./node_modules/dompurify/dist/purify.es.mjs", import.meta.url));

export function resolveMonacoDompurify(source: string, importer: string | undefined) {
  return source === "./dompurify/dompurify.js" && importer && sanitizeModule.test(importer) ? dompurifyEntry : undefined;
}

export function monacoDompurify() {
  const resolveId = (source: string, importer: string | undefined) => resolveMonacoDompurify(source, importer);
  const plugin: Plugin = { name: "monaco-dompurify", enforce: "pre", resolveId };
  // The pre-bundler is Rolldown; the same resolveId hook works there.
  const optimizeDeps: UserConfig["optimizeDeps"] = {
    rolldownOptions: { plugins: [{ name: "monaco-dompurify", resolveId }] },
  };
  return { plugin, optimizeDeps };
}
