import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, normalize, sep } from "node:path";
import type { Plugin } from "vite";

/** pdf.js's decoding data (Adobe CMaps, standard font files, image-decoder WASM, ICC profiles), with
 * their licence files. pdf.js reads them by name from a base URL, so they keep their names under a
 * versioned folder: `assets/pdfjs-<version>/<folder>/<file>`. Only a PDF preview fetches them.
 * pdf.js's QuickJS sandbox (JavaScript inside PDFs) is left out: previews never run PDF scripts. */
export const PDFJS_ASSET_FOLDERS = ["cmaps", "standard_fonts", "wasm", "iccs"] as const;

const root = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const version = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;
const prefix = `assets/pdfjs-${version}/`;
const types: Record<string, string> = { ".wasm": "application/wasm", ".js": "text/javascript", ".ttf": "font/ttf" };

function files() {
  return PDFJS_ASSET_FOLDERS.flatMap(folder =>
    readdirSync(join(root, folder)).filter(name => !name.startsWith("quickjs") && statSync(join(root, folder, name)).isFile()).map(name => `${folder}/${name}`));
}

export function pdfjsAssets(): Plugin {
  return {
    name: "ase-pdfjs-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = decodeURIComponent((request.url ?? "").split("?")[0]).replace(/^\/+/, "");
        if (!path.startsWith(prefix)) return next();
        const relative = normalize(path.slice(prefix.length));
        const folder = relative.split(sep)[0];
        if (relative.startsWith("..") || relative.includes("quickjs") || !(PDFJS_ASSET_FOLDERS as readonly string[]).includes(folder)) return next();
        try {
          const body = readFileSync(join(root, relative));
          response.setHeader("Content-Type", types[relative.slice(relative.lastIndexOf("."))] ?? "application/octet-stream");
          response.end(body);
        } catch { next(); }
      });
    },
    generateBundle() {
      for (const file of files()) this.emitFile({ type: "asset", fileName: prefix + file, source: readFileSync(join(root, file)) });
    },
  };
}
