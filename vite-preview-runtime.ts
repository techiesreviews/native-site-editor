import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { dirname, posix, relative, resolve } from "node:path";
import { build, type BuildOptions } from "esbuild";
import type { Plugin } from "vite";

const runtimeName = "native-preview-runtime.js";
const runtimeUrl = 'new URL("./native-preview-runtime.js", import.meta.url)';

export type RuntimeBundle = {
  code: string;
  /** The external source map (empty when the map is inline). */
  map: string;
  /** Every file bundled, absolute. */
  inputs: string[];
};

/**
 * Bundles the preview runtime and the modules it imports into one IIFE: the
 * srcdoc frame loads it as a classic script. The runtime reads DOM/CSS names,
 * never function names or function source, so minifying is safe.
 */
export async function bundlePreviewRuntime(options: {
  entry: string;
  minify: boolean;
  sourcemap: "external" | "inline";
  target: BuildOptions["target"];
}): Promise<RuntimeBundle> {
  const cwd = dirname(options.entry);
  const result = await build({
    entryPoints: [options.entry],
    // Not written: names the output so the map's sources are relative to the
    // runtime's own URL (the dev server serves the bundle there).
    outfile: options.entry,
    write: false,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: options.target,
    minify: options.minify,
    sourcemap: options.sourcemap,
    sourcesContent: true,
    metafile: true,
    absWorkingDir: cwd,
    logLevel: "silent",
  });
  const code = result.outputFiles.find((file) => !file.path.endsWith(".map"))!.text;
  const map = result.outputFiles.find((file) => file.path.endsWith(".map"))?.text ?? "";
  return { code, map, inputs: Object.keys(result.metafile.inputs).map((input) => resolve(cwd, input)) };
}

/** The build's runtime under an immutable, content-hashed name with its external map. */
export function immutableRuntimeAsset(bundle: Pick<RuntimeBundle, "code" | "map">) {
  // Hash both payloads before adding the self-referencing map URL. Any change
  // to either payload invalidates both immutable URLs, including map-only edits.
  const hash = createHash("sha256").update(bundle.code).update(bundle.map).digest("hex").slice(0, 12);
  const fileName = `native-preview-runtime-${hash}.js`;
  return { fileName, code: `${bundle.code}//# sourceMappingURL=${fileName}.map\n`, map: bundle.map };
}

/**
 * The bundle as the dev server serves it, rebuilt when a bundled file
 * changed since the last build. Concurrent callers share one build; a failed
 * build is not kept, so the next call tries again.
 */
export function devRuntimeBundle(entry: string, target: BuildOptions["target"]) {
  let current: { stamps: Map<string, number>; code: Promise<string>; stamped: boolean } | undefined;
  // A file that cannot be read is NaN, which equals nothing: never fresh.
  const mtime = (path: string) => stat(path).then((s) => s.mtimeMs, () => NaN);
  const fresh = async (stamps: Map<string, number>) => {
    for (const [path, stamp] of stamps) if ((await mtime(path)) !== stamp) return false;
    return true;
  };
  return async (): Promise<string> => {
    const seen = current;
    // A build still running (or still stamping its inputs) is the newest.
    if (seen && !seen.stamped) return seen.code;
    if (seen && (await fresh(seen.stamps))) return seen.code;
    if (current && current !== seen) return current.code;
    const next = { stamps: new Map<string, number>(), code: Promise.resolve(""), stamped: false };
    next.code = (async () => {
      const started = Date.now();
      const bundle = await bundlePreviewRuntime({ entry, minify: false, sourcemap: "inline", target });
      // A file written while the build ran may be in it or not: stamp it as
      // changed (NaN), so the next request builds again.
      for (const input of bundle.inputs) {
        const stamp = await mtime(input);
        next.stamps.set(input, stamp >= started ? NaN : stamp);
      }
      next.stamped = true;
      return bundle.code;
    })();
    current = next;
    next.code.catch(() => { if (current === next) current = undefined; });
    return next.code;
  };
}

export function previewRuntime(): Plugin {
  let root: string;
  let base: string;
  let assetsDir: string;
  let target: BuildOptions["target"];
  let command: "build" | "serve";
  const entry = () => resolve(root, `src/components/${runtimeName}`);
  return {
    name: "preview-runtime",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
      base = config.base;
      command = config.command;
      assetsDir = config.build.assetsDir;
      target = config.build.target === false ? "esnext" : config.build.target;
    },
    // Dev: `new URL("./native-preview-runtime.js", import.meta.url)` stays the
    // source path; answer it with the readable bundle and an inline map before
    // Vite would serve the file as written (its imports break a classic script).
    configureServer(server) {
      const url = posix.join(base, relative(root, entry()).split("\\").join("/"));
      const bundle = devRuntimeBundle(entry(), target);
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== url) return next();
        bundle().then((code) => {
          res.setHeader("content-type", "text/javascript; charset=utf-8");
          res.setHeader("cache-control", "no-cache");
          res.end(code);
        }, next);
      });
    },
    // Build: the minified bundle under a hashed /assets/ name.
    async transform(code, id) {
      if (command !== "build" || id !== resolve(root, "src/components/native-preview.ts")) return;
      if (!code.includes(runtimeUrl)) this.error("Preview runtime URL expression was not found.");
      const bundle = await bundlePreviewRuntime({ entry: entry(), minify: true, sourcemap: "external", target });
      for (const input of bundle.inputs) this.addWatchFile(input);
      const runtime = immutableRuntimeAsset(bundle);
      const reference = this.emitFile({ type: "asset", fileName: `${assetsDir}/${runtime.fileName}`, source: runtime.code });
      this.emitFile({ type: "asset", fileName: `${assetsDir}/${runtime.fileName}.map`, source: runtime.map });
      // Vite resolves the emitted reference relative to the importing chunk,
      // including builds with a custom base.
      return { code: code.replace(runtimeUrl, `new URL(import.meta.ROLLUP_FILE_URL_${reference}, import.meta.url)`), map: null };
    },
  };
}
