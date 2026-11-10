// Fails when a stylesheet reads a custom property that nothing defines: not a CSS declaration,
// not a name a script sets, and not an open hook listed below. A var() fallback does not count
// as a definition (`var(--ease-out, ease-out)` used to hide a token defined nowhere).
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Names a surface may set on its own; the stylesheets read them with a fallback. */
export const openHooks = {
  "--structure-surface": "page-structure.css: another surface may set the row background",
};

const comments = /\/\*[\s\S]*?(?:\*\/|$)/g;

function walk(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

/** Names declared by the stylesheets, and what scripts set: literal names, and the prefix of a
 * template such as `--agent${part}`. `sheets` and `scripts` map a path to its text. */
export function undefinedProperties(sheets, scripts, hooks = openHooks) {
  const declared = new Set(Object.keys(hooks));
  for (const text of Object.values(sheets)) {
    for (const found of text.replace(comments, "").matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)) declared.add(found[1]);
  }
  const literal = new Set(), prefixes = new Set();
  for (const text of Object.values(scripts)) {
    for (const found of text.matchAll(/(--[a-zA-Z][\w-]*)(\$\{)?/g)) (found[2] ? prefixes : literal).add(found[1]);
  }
  const problems = [];
  for (const [path, text] of Object.entries(sheets)) {
    const seen = new Set();
    for (const found of text.replace(comments, "").matchAll(/var\(\s*(--[\w-]+)/g)) {
      const name = found[1];
      if (seen.has(name) || declared.has(name) || literal.has(name) || [...prefixes].some(prefix => name.startsWith(prefix))) continue;
      seen.add(name);
      problems.push(`${path}: var(${name}) is defined nowhere (no declaration in src/**/*.css, no script sets it)`);
    }
  }
  return problems;
}

export function checkRepository(root) {
  const files = walk(join(root, "src"));
  const read = list => Object.fromEntries(list.map(file => [relative(root, file), readFileSync(file, "utf8")]));
  const scripts = read(files.filter(file => /\.(?:ts|js|mjs)$/.test(file)));
  scripts["index.html"] = readFileSync(join(root, "index.html"), "utf8");
  return undefinedProperties(read(files.filter(file => file.endsWith(".css"))), scripts);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkRepository(fileURLToPath(new URL("..", import.meta.url)));
  for (const problem of problems) console.error(problem);
  if (problems.length) {
    console.error(`RESULT: fail css vars ${problems.length} undefined`);
    process.exit(1);
  }
  console.log("RESULT: ok css vars defined");
}
