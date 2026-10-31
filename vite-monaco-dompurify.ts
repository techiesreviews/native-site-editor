import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, UserConfig } from "vite";

// Ships the npm dompurify package in place of the copy Monaco vendors.
//
// monaco-editor bundles its own DOMPurify (esm/vs/base/browser/dompurify/
// dompurify.js, byte for byte the package's dist/purify.es.mjs) and imports it
// by relative path from domSanitize.js, so the package.json override on
// dompurify only reaches npm audit, never the browser bundle. This points that
// one import at the installed package, which the override keeps on a patched
// release. The package is resolved from monaco-editor's own folder, so it is
// the copy the override controls even if npm stops hoisting it.
//
// Applied to the build and the dev server's dependency pre-bundling alike, so
// the browser tests run the same DOMPurify as production.
const sanitizeModule = /monaco-editor[\\/]esm[\\/]vs[\\/]base[\\/]browser[\\/]domSanitize\.js$/;
const fromMonaco = createRequire(fileURLToPath(new URL("./node_modules/monaco-editor/package.json", import.meta.url)));
// The package exports only its CommonJS build to require; the ES build sits beside it.
export const dompurifyEntry = join(dirname(fromMonaco.resolve("dompurify")), "purify.es.mjs");

export function resolveMonacoDompurify(source: string, importer: string | undefined) {
  return source === "./dompurify/dompurify.js" && importer !== undefined && sanitizeModule.test(importer) ? dompurifyEntry : undefined;
}

export function monacoDompurify() {
  const plugin: Plugin = { name: "monaco-dompurify", enforce: "pre", resolveId: resolveMonacoDompurify };
  // The pre-bundler is Rolldown; the same resolveId hook works there.
  const optimizeDeps: UserConfig["optimizeDeps"] = {
    rolldownOptions: { plugins: [{ name: "monaco-dompurify", resolveId: resolveMonacoDompurify }] },
  };
  return { plugin, optimizeDeps };
}
