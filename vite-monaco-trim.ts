import type { Plugin, UserConfig } from "vite";

// Keeps src/components/monaco.ts's trimmed contribution set trimmed.
//
// monaco-editor's internal/common/workers.js (imported by the HTML, CSS, JSON
// and TypeScript language features for createWebWorker) also side-effect
// imports nearly every editor contribution, editor.main.js style. So the first
// HTML, CSS, JSON or JS model would load all the contributions monaco.ts
// leaves out (inline completions alone is ~650 KB of source). This drops those
// bare editor registration imports from that one file and keeps its code and
// unrelated side effects as is.
//
// Applied to the build and the dev server's dependency pre-bundling alike, so
// the browser tests run the same contribution set as production.
const workersModule = /monaco-editor[\\/]esm[\\/]vs[\\/]internal[\\/]common[\\/]workers\.js$/;

function strip(code: string) {
  // Only editor registration imports are redundant with monaco.ts. Preserve
  // unrelated side effects if Monaco adds any to this worker manager later.
  return code.replace(/^import ['"]\.\.\/\.\.\/editor\/[^'"]+['"];\r?\n/gm, "");
}

export function monacoTrim() {
  const transform = (code: string, id: string) => (workersModule.test(id) ? { code: strip(code), map: null } : undefined);
  const plugin: Plugin = { name: "monaco-trim", enforce: "pre", transform };
  // The pre-bundler is Rolldown; the same transform hook works there.
  const optimizeDeps: UserConfig["optimizeDeps"] = {
    rolldownOptions: { plugins: [{ name: "monaco-trim", transform }] },
  };
  return { plugin, optimizeDeps };
}
