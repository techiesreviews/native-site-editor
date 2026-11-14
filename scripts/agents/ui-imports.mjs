// The import direction of the editor's parts (TOOLS-247, slice 2 of docs/agents/parts-plan.md): nothing in src/ui/
// imports from a screen. Screens import parts, never the other way round, so a part can be found, read and reused on
// its own.
//
//   node scripts/agents/ui-imports.mjs check [--then <script> [args…]]
//       fail when a script or CSS file under src/ui/ imports anything under src/ outside src/ui/, but for the
//       shared icons (src/icons.ts). Packages and code outside src/ (shared/) are fine. Never writes. --then runs one
//       more node script with every argument after it, so the kit's single css command can run this check too.
//
// `--root <dir>` reads that project instead of this one. Every other module under src/ counts as a screen:
// src/components/, src/page-builder/, src/catalogue/ and the editor's own top-level files. Today no import breaks the
// rule, so there is no allow-list: a part that needs a screen's piece gets it moved into src/ui/ or passed in. Not read:
// `require("…")` (TypeScript's `import x = require("…")` too) and `import(`…${x}`)`, which the editor does not use.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutComments } from "./copies.mjs";

const uiDir = "src/ui/";
/** Modules under src/ that every part may use: shared foundations, not screens. Adding one needs a reason in the PR. */
export const foundations = ["src/icons"];

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

// Read from the text with its comments blanked (lines kept). `from` imports and re-exports may span lines, but never
// run past a line that starts the next statement, so an import after a statement with no semicolon keeps its own line.
const scriptPatterns = [
  /\b(?:import|export)\b(?:(?!\n\s*(?:import|export)\b)[^;'"`])*?\bfrom\s*(["'])([^"'\n]+)\1/g,
  /\bimport\s*(["'])([^"'\n]+)\1/g,
  /\bimport\s*\(\s*(["'`])([^"'`\n$]+)\1\s*\)/g,
];

/** Every module one script file's text imports, with the 1-based line its statement starts on. */
export function importsInScript(text) {
  const code = withoutComments(text);
  const found = [];
  for (const pattern of scriptPatterns)
    for (const match of code.matchAll(pattern)) found.push({ line: lineAt(code, match.index), specifier: match[2] });
  return found.sort((a, b) => a.line - b.line);
}

/** Every `@import` in one CSS file's text, quoted or in `url()`. Comments never count. */
export function importsInStyles(text) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, " "));
  return [...code.matchAll(/@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1/g)].map(match => ({ line: lineAt(code, match.index), specifier: match[2] }));
}

/**
 * The project path a file under src/ui/ reaches through one import when that breaks the rule, else "". A bare name
 * (a package, `node:path`) is never a screen.
 */
export function wrongTarget(from, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return "";
  // A bundler query or hash (`../icons?raw`) names the same module.
  const path = specifier.replace(/[?#].*$/, "");
  const target = path.startsWith("/") ? posix.normalize(path.slice(1)) : posix.join(posix.dirname(from), path);
  if (!target.startsWith("src/") || `${target}/`.startsWith(uiDir)) return "";
  return foundations.includes(target.replace(/\.(?:[cm]?[jt]sx?)$/, "")) ? "" : target;
}

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sources(path) : scriptOrStyle.test(entry.name) ? [path] : [];
  });
}

const scriptOrStyle = /\.(?:[cm]?[jt]sx?|css)$/;

/** The script (TypeScript or JavaScript) and CSS files under src/ui/, as project paths. */
export function uiSources(root) {
  const dir = join(root, uiDir);
  return existsSync(dir) ? sources(dir).map(path => relative(root, path).split(sep).join("/")) : [];
}

/** Every import under src/ui/ that breaks the rule: `{ file, line, specifier, target }`. */
export function scan(root) {
  return uiSources(root).flatMap(file => {
    const text = readFileSync(join(root, file), "utf8");
    return (file.endsWith(".css") ? importsInStyles(text) : importsInScript(text))
      .map(entry => ({ file, ...entry, target: wrongTarget(file, entry.specifier) })).filter(entry => entry.target);
  });
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function check(root, log) {
  const wrong = scan(root);
  for (const { file, line, specifier, target } of wrong) log.error(`${file}:${line}: imports ${target} ("${specifier}"), a screen`);
  if (wrong.length) {
    log.error("Nothing in src/ui/ imports from a screen (docs/agents/parts-plan.md): move the shared piece into src/ui/, or pass it in from the screen that uses the part.");
    log.log(`RESULT: fail ui-imports ${plural(wrong.length, "wrong import")} in ${plural(new Set(wrong.map(entry => entry.file)).size, "file")}`);
    return 1;
  }
  log.log(`RESULT: ok ui-imports ${plural(uiSources(root).length, "file")} in src/ui/ import only src/ui/, src/icons.ts, packages and code outside src/`);
  return 0;
}

export function run(argv, { log = console, root: defaultRoot = fileURLToPath(new URL("../..", import.meta.url)) } = {}) {
  let root = defaultRoot, then;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--then") { then = argv.slice(i + 1); break; }
    if (argv[i] === "--root") root = argv[++i] ?? root;
    // Anything else (`check`, a path the kit appends to its css command) changes nothing: the check reads all of src/ui/.
  }
  let status = check(root, log);
  if (then?.length) {
    try { execFileSync(process.execPath, [join(root, then[0]), ...then.slice(1)], { cwd: root, stdio: "inherit" }); } catch { status = 1; }
  }
  return status;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = run(process.argv.slice(2));
