// Brings a self-hosted copy of the editor (made by Deploy to Cloudflare) up
// to date with the upstream repository: every file becomes upstream's, except
// the copy's own settings in wrangler.jsonc (its Worker name, vars, routes and
// account) and its workflows (GitHub refuses workflow changes from Actions).
// The "Update the editor" workflow runs it, then commits and pushes, and
// Workers Builds deploys the push.
//
//   node scripts/update-editor.mjs            upstream main from GitHub
//   UPSTREAM_DIR=../other node scripts/...    a local upstream (tests)
//
// Prints the new upstream commit, or nothing when the copy is current.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM = process.env.UPSTREAM_REPOSITORY || "techiesreviews/native-site-editor";
const VERSION_FILE = ".editor-upstream";
// Never replaced or removed: the copy's own state.
const KEEP = [".git/", ".github/workflows/", VERSION_FILE, "wrangler.jsonc", "node_modules/", "dist/", ".dev.vars", ".wrangler/"];

const kept = (path) => KEEP.some((prefix) => (prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix));

/** JSONC to a value: comments and trailing commas removed, strings left alone. */
export function parseJsonc(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      out += text.slice(start, i + 1);
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (char === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 1;
      if (i === 0) break;
    } else if (char === "}" || char === "]") {
      // A trailing comma: the last thing before the closer, outside strings.
      out = out.replace(/,(\s*)$/, "$1") + char;
    } else out += char;
  }
  return JSON.parse(out);
}

/**
 * Upstream's wrangler.jsonc (its bindings, migrations and everything new)
 * with the copy's own settings put back: `name`, `account_id`, `workers_dev`
 * and `routes` when the copy has them, and every var the copy has, over
 * upstream's. Written as plain JSON with a note on where the comments went.
 */
export function mergeWranglerConfig(upstreamText, localText) {
  const upstream = parseJsonc(upstreamText);
  const local = parseJsonc(localText);
  const merged = { ...upstream };
  for (const key of ["name", "account_id", "workers_dev", "routes"]) if (key in local) merged[key] = local[key];
  if (local.vars || upstream.vars) merged.vars = { ...upstream.vars, ...local.vars };
  return `// Your editor's Cloudflare settings. The "Update the editor" workflow keeps
// name, account_id, workers_dev, routes and vars as you set them, and takes
// everything else from https://github.com/techiesreviews/native-site-editor
// (whose wrangler.jsonc explains each setting).
${JSON.stringify(merged, null, 2)}
`;
}

function files(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === ".git" ? [] : files(root, path);
    return [relative(root, path)];
  });
}

function upstreamCheckout() {
  if (process.env.UPSTREAM_DIR) {
    const sha = execFileSync("git", ["-C", process.env.UPSTREAM_DIR, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    return { dir: process.env.UPSTREAM_DIR, sha };
  }
  const dir = mkdtempSync(join(tmpdir(), "editor-upstream-"));
  execFileSync("git", ["clone", "--depth", "1", `https://github.com/${UPSTREAM}.git`, dir], { stdio: "ignore" });
  const sha = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  return { dir, sha };
}

export function update(root, upstream) {
  const versionPath = join(root, VERSION_FILE);
  if (existsSync(versionPath) && readFileSync(versionPath, "utf8").trim() === upstream.sha) return null;
  const incoming = files(upstream.dir).filter((path) => !kept(path));
  const incomingSet = new Set(incoming);
  const tracked = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  for (const path of tracked) if (!kept(path) && !incomingSet.has(path)) rmSync(join(root, path), { force: true });
  for (const path of incoming) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(upstream.dir, path), join(root, path));
  }
  const upstreamConfig = join(upstream.dir, "wrangler.jsonc");
  const localConfig = join(root, "wrangler.jsonc");
  if (existsSync(upstreamConfig))
    writeFileSync(
      localConfig,
      existsSync(localConfig)
        ? mergeWranglerConfig(readFileSync(upstreamConfig, "utf8"), readFileSync(localConfig, "utf8"))
        : readFileSync(upstreamConfig, "utf8"),
    );
  writeFileSync(versionPath, `${upstream.sha}\n`);
  return upstream.sha;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const upstream = upstreamCheckout();
  const sha = update(root, upstream);
  if (!process.env.UPSTREAM_DIR) rmSync(upstream.dir, { recursive: true, force: true });
  if (sha) console.log(sha);
}
