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

/** A script or page without its `//`, block and HTML comments; a `//` after a colon or a quote stays (a URL).
 * A `/*` with no closing `*` + `/` is left alone (a glob in a string). */
function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(^|[^:\\"'`\w])\/\/[^\n]*/g, "$1");
}

/** How a script writes a custom property: a quoted name in the first argument of `setProperty` (both
 * arms of a ternary count), `--x:` in a style string, or the prefix of a template such as `--agent${part}`.
 * Reading it (`getPropertyValue`, `removeProperty`, `var()`) is not a write. */
const writes = /setProperty\(([^,)]*)|(?<![\w-])(--[a-zA-Z][\w-]*)\s*:|(?<![\w-])(--[a-zA-Z][\w-]*)\$\{/g;

/** Names declared by the stylesheets, and the names scripts write (see `writes`). `sheets` and `scripts` map a path to its text. */
export function undefinedProperties(sheets, scripts, hooks = openHooks) {
  const declared = new Set(Object.keys(hooks));
  for (const text of Object.values(sheets)) {
    for (const found of text.replace(comments, "").matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)) declared.add(found[1]);
  }
  const literal = new Set(), prefixes = new Set();
  for (const text of Object.values(scripts)) {
    // Only a name a script writes counts: not one in a comment, and not one it only reads.
    for (const found of withoutComments(text).matchAll(writes)) {
      if (found[1] !== undefined) for (const quoted of found[1].matchAll(/["'`](--[a-zA-Z][\w-]*)(\$\{)?/g)) (quoted[2] ? prefixes : literal).add(quoted[1]);
      else if (found[2]) literal.add(found[2]);
      else prefixes.add(found[3]);
    }
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
