// Command-line static export of a native project, bundled to
// `dist/native-export.mjs` and served by the editor at
// https://editor.techies.tools/native-export.mjs so a site's deploy workflow
// can run it without keeping a copy of the export rules:
//
//   curl -fsSL https://editor.techies.tools/native-export.mjs -o native-export.mjs
//   node native-export.mjs [projectDir] [--out dist] [--site-url https://example.com]
//
// SITE_URL in the environment also overrides the url in the site settings
// (`.astro-editor/site.json`, else `src/site.json`). A project is exported
// when it has `.astro-editor/native.json` or a home page,
// `src/pages/index.html`; the manifest is optional.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { exportNativeSite, ExportError, MANIFEST_PATH, SITE_PATHS, type FileContent } from "./native-export";
import { isNativeProject, NATIVE_HOME_PAGE } from "./native-project";

const TEXT = /\.(html|css|json)$/i;

function collect(root: string, dir: string, files: Record<string, FileContent>) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(root, full, files);
    else {
      const path = relative(root, full).split("\\").join("/");
      files[path] = TEXT.test(name) ? readFileSync(full, "utf8") : new Uint8Array(readFileSync(full));
    }
  }
}

function main(argv: string[]) {
  let project = ".";
  let outDir = "dist";
  let siteUrl = process.env.SITE_URL || undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") outDir = argv[++i] ?? outDir;
    else if (arg === "--site-url") siteUrl = argv[++i] ?? siteUrl;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node native-export.mjs [projectDir] [--out dist] [--site-url https://example.com]");
      return 0;
    } else project = arg;
  }
  const root = resolve(project);
  const files: Record<string, FileContent> = {};
  for (const path of [MANIFEST_PATH, ...SITE_PATHS]) {
    try {
      files[path] = readFileSync(join(root, path), "utf8");
    } catch {
      // Optional: the manifest and the site settings may both be absent.
    }
  }
  const src = join(root, "src");
  try {
    if (statSync(src).isDirectory()) collect(root, src, files);
  } catch {
    throw new ExportError(`No src/ directory in ${root}`);
  }
  if (!isNativeProject(Object.keys(files))) throw new ExportError(`No ${MANIFEST_PATH} or ${NATIVE_HOME_PAGE} in ${root}`);
  const result = exportNativeSite({ files, siteUrl });
  const target = resolve(root, outDir);
  rmSync(target, { recursive: true, force: true });
  for (const [path, content] of Object.entries(result.files)) {
    const full = join(target, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  for (const line of result.log) console.log(line);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof ExportError ? error.message : error);
  process.exitCode = 1;
}
