import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { transform, type TransformOptions } from "esbuild";
import type { Plugin } from "vite";

const runtimeName = "native-preview-runtime.js";
const runtimeUrl = 'new URL("./native-preview-runtime.js", import.meta.url)';

export async function minifyPreviewRuntime(source: string, target: TransformOptions["target"]) {
  // No format conversion: the iframe loads this IIFE as a classic script.
  // The runtime reads DOM/CSS names, never function names or function source.
  const result = await transform(source, {
    minify: true,
    target,
    sourcefile: runtimeName,
    sourcemap: "external",
    sourcesContent: true,
  });
  // Hash both payloads before adding the self-referencing map URL. Any change
  // to either payload invalidates both immutable URLs, including map-only edits.
  const hash = createHash("sha256").update(result.code).update(result.map).digest("hex").slice(0, 12);
  const fileName = `native-preview-runtime-${hash}.js`;
  return {
    fileName,
    code: `${result.code}//# sourceMappingURL=${fileName}.map\n`,
    map: result.map,
  };
}

export function previewRuntime(): Plugin {
  let root: string;
  let assetsDir: string;
  let target: TransformOptions["target"];
  return {
    name: "preview-runtime",
    apply: "build",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
      assetsDir = config.build.assetsDir;
      target = config.build.target === false ? "esnext" : config.build.target;
    },
    async transform(code, id) {
      if (id !== resolve(root, "src/components/native-preview.ts")) return;
      if (!code.includes(runtimeUrl)) this.error("Preview runtime URL expression was not found.");
      const path = resolve(root, `src/components/${runtimeName}`);
      this.addWatchFile(path);
      const runtime = await minifyPreviewRuntime(await readFile(path, "utf8"), target);
      const reference = this.emitFile({ type: "asset", fileName: `${assetsDir}/${runtime.fileName}`, source: runtime.code });
      this.emitFile({ type: "asset", fileName: `${assetsDir}/${runtime.fileName}.map`, source: runtime.map });
      // Vite resolves the emitted reference relative to the importing chunk,
      // including builds with a custom base. Dev and esbuild harnesses skip us.
      return { code: code.replace(runtimeUrl, `new URL(import.meta.ROLLUP_FILE_URL_${reference}, import.meta.url)`), map: null };
    },
  };
}
