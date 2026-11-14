// The parts list: every UI component of the editor in one file agents read first (TOOLS-241). It is generated, so it
// cannot go stale: docs/agents/parts.md comes from docs/agents/parts.json (the parts and shared pieces, described by
// hand) and from the code (every other screen file, its leading comment, its styles, its tests, its options).
//
//   node scripts/agents/parts-list.mjs write     rewrite docs/agents/parts.md
//   node scripts/agents/parts-list.mjs check [--then <script> [args…]]
//       fail when it is out of date, or a file is missing or undescribed; --then runs one more node script after it
//
// `--root <dir>` reads that project instead of this one. The list reads every test and every UI file's leading
// comment, so every tier of checks runs this: npm test (tests/parts-list.test.ts, also a docs guard), npm run check
// (the tests tier) and the kit's css command.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutComments } from "./copies.mjs";

export const sourcePath = "docs/agents/parts.json";
export const listPath = "docs/agents/parts.md";
/** Not the editor's UI: the design board (preview only), web workers, the page builder's pure rules. */
const outside = /^src\/catalogue\/|\.worker\.ts$|^src\/page-builder\/rules\/|\.d\.ts$/;
/** A TypeScript file that builds elements (outside its comments): it is UI. One without (maths, protocols, state) is plumbing. */
const buildsElements = /\bnode\(\s*["'`]|\b(?:button|link)\(|\bdocument\.createElement(?:NS)?\(|\.innerHTML\s*=|\binsertAdjacentHTML\(|<(?:div|span|button|dialog|section|ul|ol|li|label|input|form|p|a|svg|img|details)[\s>]/;


function walk(root, dir) {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap(entry => {
    const path = posix.join(dir, entry.name);
    return entry.isDirectory() ? walk(root, path) : [path];
  });
}

/** The component folders: every TypeScript file in them is UI, also one built only from other parts (`shareRow()`). */
const componentFolders = /^src\/(?:ui|components)\//;

/** Every UI file under src: each stylesheet, each TypeScript file in a component folder, and each that builds elements. */
export function uiFiles(root) {
  return walk(root, "src").filter(path => !outside.test(path) && (path.endsWith(".css")
    || (path.endsWith(".ts") && (componentFolders.test(path) || buildsElements.test(withoutComments(readFileSync(join(root, path), "utf8")))))));
}

/**
 * What a file is for, from its leading comment: the first sentence of the first comment before any code (imports
 * may come first), without ticket and slice references. Empty when there is none.
 */
export function purpose(text) {
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && (/^\s*$/.test(lines[i]) || /^\s*(import|export \* from)\b/.test(lines[i]) || /^\s*\/\/\s*@ts-/.test(lines[i]))) {
    // A multi-line import runs to its closing line.
    if (/^\s*import\b/.test(lines[i]) && !/from\s+["'`]|^\s*import\s+["'`]/.test(lines[i])) while (i < lines.length && !/from\s+["'`]/.test(lines[i])) i++;
    i++;
  }
  const words = [];
  if (/^\s*\/\//.test(lines[i] ?? "")) {
    for (; i < lines.length && /^\s*\/\//.test(lines[i]); i++) words.push(lines[i].replace(/^\s*\/\/\s?/, ""));
  } else if (/^\s*\/\*/.test(lines[i] ?? "")) {
    for (; i < lines.length; i++) {
      words.push(lines[i].replace(/^\s*\/\*\*?\s?/, "").replace(/\*\/.*$/, "").replace(/^\s*\*\s?/, ""));
      if (lines[i].includes("*/")) break;
    }
  }
  const joined = words.join(" ").replace(/\s+/g, " ").trim()
    .replace(/\s*\((?:[^()]|\([^()]*\))*?\b(?:ticket|tickets|slice|slices|wayfinder|mock-up|research|TOOLS-\d+|am-\d+)\b(?:[^()]|\([^()]*\))*\)/gi, "")
    .replace(/\s+([,.:;])/g, "$1");
  const sentence = /^(.+?[.!?])(?=\s|$)/.exec(joined)?.[1] ?? joined;
  return sentence.length > 220 ? `${sentence.slice(0, 217).replace(/\s+\S*$/, "")}…` : sentence;
}

/** The exported lists of an options file, as `label: a, b, c` (`BADGE_TONES` → `tones`). */
export function optionLists(text) {
  return [...text.matchAll(/^export const ([A-Z][A-Z0-9_]*)\s*=\s*\[([^\]]*)\]\s*as const/gm)].map(([, name, body]) => {
    const label = name.split("_").at(-1).toLowerCase();
    const values = body.split(",").map(value => value.trim().replace(/^["'`]|["'`]$/g, "")).filter(Boolean);
    return `${label}: ${values.join(", ")}`;
  });
}

/** The relative imports and the `src/…` paths a test names (a test of a script: its imports only), resolved to project files. */
function testTargets(root, test, text) {
  const found = new Set();
  for (const [, spec] of text.matchAll(/(?:from\s+|import\(\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
    const base = posix.normalize(posix.join(posix.dirname(test), spec));
    for (const path of [base, `${base}.ts`, `${base.replace(/\.m?js$/, "")}.ts`]) if (existsSync(join(root, path))) found.add(path);
  }
  // A test of a script (it imports from scripts/) names src files as its fixtures, not as what it tests.
  if (/from\s+["']\.{1,2}\/(?:\.\.\/)*scripts\//.test(text)) return found;
  for (const [, path] of text.matchAll(/["'`/](src\/[\w./-]+\.(?:ts|css))\b/g)) found.add(path);
  return found;
}

/** Test file → the files it imports or names. */
function testMap(root) {
  return new Map(walk(root, "tests").filter(path => path.endsWith(".test.ts"))
    .map(test => [test, testTargets(root, test, readFileSync(join(root, test), "utf8"))]));
}

/** The design board's parts (src/catalogue/parts.ts): their area and name by each file they list. */
function boardParts(root) {
  const path = join(root, "src/catalogue/parts.ts");
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  return [...text.matchAll(/id: "([\w-]+)", area: "(atoms|molecules|organisms)", name: "([^"]+)"[\s\S]*?files: \[([^\]]*)\]/g)]
    .map(([, id, area, name, files]) => ({ id, area, name, files: [...files.matchAll(/"([^"]+)"/g)].map(match => match[1]) }));
}

const capital = text => text.charAt(0).toUpperCase() + text.slice(1);
/** A file's stem as a name: `publish-menu` → `Publish menu`. */
const nameOf = stem => capital(stem.replace(/[-_]+/g, " "));
const stemOf = path => path.replace(/\.(ts|css)$/, "");
const code = path => `\`${path}\``;

function listTests(tests) {
  if (!tests.length) return "none yet";
  const shown = tests.slice(0, 5).map(code).join(", ");
  return tests.length > 5 ? `${shown} and ${tests.length - 5} more` : shown;
}

/**
 * The parts list as markdown, with the problems that make it wrong: a listed file that does not exist, a part with
 * no purpose, a screen file with neither a leading comment nor a description in docs/agents/parts.json.
 */
export function build(root) {
  const source = JSON.parse(readFileSync(join(root, sourcePath), "utf8"));
  const problems = [];
  const tests = testMap(root);
  const testsOf = files => [...tests].filter(([, targets]) => files.some(file => targets.has(file))).map(([test]) => test).sort();
  const board = boardParts(root);
  const boardOf = files => board.filter(part => files.includes(part.files[0]));
  const claimed = new Set();

  const entries = (source.parts ?? []).map(entry => {
    for (const field of ["id", "name", "group", "for", "files"]) if (!entry[field]) problems.push(`${sourcePath}: ${entry.id ?? entry.name ?? "an entry"} has no ${field}`);
    if (!["part", "shared"].includes(entry.group)) problems.push(`${sourcePath}: ${entry.id}: group is part or shared, not ${entry.group}`);
    for (const file of entry.files ?? []) {
      if (!existsSync(join(root, file))) problems.push(`${sourcePath}: ${entry.id} lists ${file}, which does not exist`);
      claimed.add(file);
    }
    return entry;
  });

  const describe = (title, entry) => {
    const files = entry.files ?? [];
    const scripts = files.filter(file => file.endsWith(".ts") && !file.endsWith("-options.ts"));
    const styles = files.filter(file => file.endsWith(".css"));
    const options = files.filter(file => file.endsWith("-options.ts"));
    const variants = [
      ...(entry.variants ? [entry.variants] : []),
      ...options.flatMap(file => (existsSync(join(root, file)) ? optionLists(readFileSync(join(root, file), "utf8")) : [])),
    ];
    const lines = [`### ${title}`, "", `- **For:** ${entry.for}`];
    if (entry.notFor) lines.push(`- **Not for:** ${entry.notFor}`);
    if (entry.use) lines.push(`- **Use:** ${entry.use}`);
    if (variants.length) lines.push(`- **Variants:** ${variants.join("; ")}`);
    lines.push(`- **Code:** ${scripts.length ? scripts.map(code).join(", ") : "none (styles only)"}`);
    if (styles.length) lines.push(`- **Styles:** ${styles.map(code).join(", ")}`);
    if (options.length) lines.push(`- **Options:** ${options.map(code).join(", ")}`);
    lines.push(`- **Tests:** ${listTests(testsOf(files))}`);
    const shown = boardOf(files);
    if (shown.length) lines.push(`- **Design board:** ${shown.map(part => `${capital(part.area)} › ${part.name}`).join(", ")}`);
    if (entry.copies) lines.push(`- **Copies to swap:** ${entry.copies}`);
    return [...lines, ""];
  };

  // Every other UI file, as screens and their pieces: one row per file stem (code and styles side by side).
  const descriptions = source.screens ?? {};
  for (const file of Object.keys(descriptions)) if (!existsSync(join(root, file))) problems.push(`${sourcePath}: screens describes ${file}, which does not exist`);
  const stems = new Map();
  for (const file of uiFiles(root)) {
    if (claimed.has(file)) continue;
    const stem = stemOf(file);
    if (!stems.has(stem)) stems.set(stem, []);
    stems.get(stem).push(file);
  }
  // A stem's other file (its stylesheet, or a code file that builds nothing) belongs on its row too.
  for (const [stem, files] of stems) for (const extension of [".ts", ".css"]) {
    const sibling = `${stem}${extension}`;
    if (!files.includes(sibling) && !claimed.has(sibling) && existsSync(join(root, sibling))) files.push(sibling);
  }
  // A description for a file that is no longer on a row (now a part, or plumbing) is dropped, so none goes stale.
  const listed = new Set([...stems.values()].flat());
  for (const file of Object.keys(descriptions)) if (existsSync(join(root, file)) && !listed.has(file)) problems.push(`${sourcePath}: screens describes ${file}, which is not a screen file on the list; remove it`);
  const rows = [...stems].sort(([a], [b]) => (a < b ? -1 : 1)).map(([stem, files]) => {
    files.sort((a, b) => (a.endsWith(".ts") === b.endsWith(".ts") ? 0 : a.endsWith(".ts") ? -1 : 1));
    const said = files.map(file => descriptions[file]).find(Boolean)
      ?? files.map(file => purpose(readFileSync(join(root, file), "utf8"))).find(Boolean) ?? "";
    if (!said) problems.push(`${files[0]}: no leading comment says what it is for; add one, or describe it under screens in ${sourcePath}`);
    const shown = boardOf(files);
    const name = `${nameOf(posix.basename(stem))}${shown.length ? ` (board: ${shown.map(part => part.name).join(", ")})` : ""}`;
    return `| ${name} | ${said.replace(/\|/g, "\\|")} | ${files.map(code).join(" ")} | ${listTests(testsOf(files))} |`;
  });

  const markdown = [
    "# Parts list",
    "",
    `<!-- Generated by \`node scripts/agents/parts-list.mjs write\` from ${sourcePath} and the code. Do not edit by hand: npm test fails when it is out of date. -->`,
    "",
    "Every UI component of the editor, so you find the one that exists before you build another.",
    "",
    "**Reuse before new.** Building or changing UI starts here:",
    "",
    "1. A part or shared piece fits: use it.",
    "2. It nearly fits: extend it (a new option, a variant or a default in its own files), never copy its look into a screen.",
    "3. Nothing fits: add a new part with a reason in the PR, as a new entry in `docs/agents/parts.json` (then run the write",
    "   command above). A screen may place and size a part; it may not give it a look of its own.",
    "",
    "When copies of one look differ slightly, the most used look wins. Home-made copies are counted per file and may only",
    "go down (`node scripts/agents/copies.mjs report` lists them; `npm test` fails when they rise). The target shape and the",
    "plan for moving each part into its own folder: [parts-plan.md](parts-plan.md).",
    "",
    `## Parts: reuse these first`,
    "",
    ...entries.filter(entry => entry.group === "part").flatMap(entry => describe(entry.name, entry)),
    `## Shared pieces`,
    "",
    "Behaviour or looks several screens use. Reuse them the same way.",
    "",
    ...entries.filter(entry => entry.group === "shared").flatMap(entry => describe(entry.name, entry)),
    "## Screens and their pieces",
    "",
    "One row per file stem: what it is for (its leading comment, or the description in `docs/agents/parts.json`), its code",
    "and styles, and the tests that import or name them. A screen is built from the parts above; it is not a part to copy.",
    "",
    "| Name | For | Files | Tests |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
  return { markdown, problems, counts: { parts: entries.filter(e => e.group === "part").length, shared: entries.filter(e => e.group === "shared").length, screens: rows.length } };
}

function write(root, log) {
  const { markdown, problems, counts } = build(root);
  writeFileSync(join(root, listPath), markdown);
  for (const problem of problems) log.error(problem);
  const summary = `${counts.parts} parts, ${counts.shared} shared pieces, ${counts.screens} screen files`;
  if (problems.length) {
    log.log(`RESULT: fail parts-list ${listPath} rewritten (${summary}) with ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
    return 1;
  }
  log.log(`RESULT: ok parts-list ${listPath} rewritten: ${summary}`);
  return 0;
}

function check(root, log) {
  const { markdown, problems, counts } = build(root);
  const path = join(root, listPath);
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const problem of problems) log.error(problem);
  if (current !== markdown) log.error(`${listPath} is out of date: run node scripts/agents/parts-list.mjs write and commit it`);
  if (problems.length || current !== markdown) {
    log.log(`RESULT: fail parts-list ${problems.length} problem${problems.length === 1 ? "" : "s"}${current !== markdown ? `, ${listPath} out of date` : ""}`);
    return 1;
  }
  log.log(`RESULT: ok parts-list ${counts.parts} parts, ${counts.shared} shared pieces, ${counts.screens} screen files`);
  return 0;
}

export function run(argv, { log = console, root: defaultRoot = fileURLToPath(new URL("../..", import.meta.url)) } = {}) {
  // `--then <script> [args…]` runs one more node script with every argument after it, as copies.mjs does, so the
  // kit's single css command can check this list before the counts.
  const cut = argv.indexOf("--then");
  const own = cut < 0 ? argv : argv.slice(0, cut), then = cut < 0 ? [] : argv.slice(cut + 1);
  const at = own.indexOf("--root");
  const root = at >= 0 ? own[at + 1] : defaultRoot;
  const command = own.find(arg => arg === "write" || arg === "check") ?? "check";
  let status = command === "write" ? write(root, log) : check(root, log);
  if (command === "check" && then.length) {
    try { execFileSync(process.execPath, [join(root, then[0]), ...then.slice(1)], { cwd: root, stdio: "inherit" }); } catch { status = 1; }
  }
  return status;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = run(process.argv.slice(2));
