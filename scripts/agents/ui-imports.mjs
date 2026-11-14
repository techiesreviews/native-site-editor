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
// `require("…")` (TypeScript's `import x = require("…")` too), `import(`…${x}`)` and imports in JSX text after an
// apostrophe, which the editor does not use. Vite's `import.meta.glob` and `new URL(…, import.meta.url)` are read.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutComments } from "./copies.mjs";

const uiDir = "src/ui/";
/** Modules under src/ that every part may use: shared foundations, not screens. Adding one needs a reason in the PR. */
export const foundations = ["src/icons"];

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/**
 * The comment-free code with the text of its strings and templates blanked (quotes, `${…}` and lines kept), so import-like
 * text in a string never reads as an import. Regex bodies are blanked already by withoutComments.
 */
function withoutStringText(code) {
  let out = "";
  const modes = ["code"], depths = [0];
  for (let i = 0; i < code.length;) {
    const mode = modes.at(-1), char = code[i];
    if (mode === "code") {
      if (char === '"' || char === "'" || char === "`") modes.push(char);
      else if (char === "{") depths[depths.length - 1]++;
      else if (char === "}" && modes.length > 1 && depths.at(-1) === 0) { modes.pop(); depths.pop(); }
      else if (char === "}") depths[depths.length - 1]--;
      out += char; i++;
      continue;
    }
    if (char === "\\") { out += code.slice(i, i + 2).replace(/[^\n]/g, " "); i += 2; continue; }
    if (mode === "`" && char === "$" && code[i + 1] === "{") { modes.push("code"); depths.push(0); out += "${"; i += 2; continue; }
    if (char === mode || (mode !== "`" && char === "\n")) { modes.pop(); out += char; i++; continue; }
    out += char === "\n" ? "\n" : " "; i++;
  }
  return out;
}

// Matched on the code with string text blanked; the specifier is then read at the same place in the code. `from`
// imports and re-exports may span lines, but never run past a line that starts the next statement, so an import after
// a statement with no semicolon keeps its own line. A dynamic import reads its first argument only.
const scriptPatterns = [
  /\b(?:import|export)\b(?:(?!\n\s*(?:import|export)\b)[^;'"`])*?\bfrom\s*(["'])([^"'\n]+)\1/dg,
  /\bimport\s*(["'])([^"'\n]+)\1/dg,
  /\bimport\s*\(\s*(["'`])([^"'`\n$]+)\1\s*[,)]/dg,
  // Vite: a module's address (`new URL("../x.ts", import.meta.url)`).
  /\bnew\s+URL\s*\(\s*(["'`])([^"'`\n$]+)\1\s*,\s*import\.meta\.url\b/dg,
];
// Vite: `import.meta.glob("…")` or a list of patterns; a negated one (`!…`) imports nothing.
const globPattern = /\bimport\.meta\.glob\s*(?:<[^>()]*>)?\s*\(\s*(\[[^\]]*\]|(["'`])[^"'`\n$]+\2)/dg;

/** Every module one script file's text imports, with the 1-based line its statement starts on. */
export function importsInScript(text) {
  const code = withoutComments(text), bare = withoutStringText(code);
  const found = [];
  for (const pattern of scriptPatterns)
    for (const match of bare.matchAll(pattern)) found.push({ line: lineAt(code, match.index), specifier: code.slice(...match.indices[2]) });
  for (const match of bare.matchAll(globPattern)) {
    const [start] = match.indices[1];
    for (const quoted of bare.slice(...match.indices[1]).matchAll(/(["'`])([^"'`\n]+)\1/dg)) {
      const specifier = code.slice(start + quoted.indices[2][0], start + quoted.indices[2][1]);
      if (!specifier.startsWith("!")) found.push({ line: lineAt(code, start + quoted.index), specifier });
    }
  }
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
