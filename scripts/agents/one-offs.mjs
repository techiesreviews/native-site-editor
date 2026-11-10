// The one-way count of one-offs: hand-typed values per CSS file that may only go down (atomic catalogue, ticket 04).
//
//   node scripts/agents/one-offs.mjs check [--no-write] [--then <script> [paths…]]
//       fail when a file has more of a kind than the committed count; a fall rewrites scripts/agents/one-offs.json.
//       --no-write (what the kit runs) never writes: a fall then fails until update is committed
//   node scripts/agents/one-offs.mjs update [--waive "<reason>"]
//       rewrite the committed count from the tree; a rise needs a written reason and a *-lead owner, and is recorded
//   node scripts/agents/one-offs.mjs report [--json]
//       every counted value with file and line: what does not trace to a shared value, for the catalogue board
//
// `--root <dir>` reads that project instead of this one. Counting follows research 04 ("Re-running the counts"): a
// value that is a token (`var(--x)`) has no digits to count, so using a token never counts.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const kinds = ["spacing", "radii", "shadows", "timings", "localProperties", "zIndex", "fontSizes"];
const what = {
  spacing: "px margin, padding or gap", radii: "raw border radius", shadows: "raw box-shadow", timings: "hand-typed duration or delay",
  localProperties: "local custom property", zIndex: "raw z-index", fontSizes: "px font-size",
};
export const baselinePath = "scripts/agents/one-offs.json";
const themeFile = "src/theme.css";

const px = /(?<![\w.-])-?\d*\.?\d+px\b/;
const nonZeroPx = /(?<![\w.-])-?(?:0*[1-9]\d*(?:\.\d+)?|0?\.\d*[1-9]\d*)px\b/;
// Signed: a negative delay is valid. A name such as fade-2s still never counts, as nothing word-like may precede the sign or digit.
const time = /(?<![\w.-])[+-]?\d*\.?\d+m?s\b/;
/** The value without its `var(...)` expressions, nested parentheses and fallbacks included. */
export function noVars(value) {
  let out = "";
  for (let i = 0; i < value.length;) {
    if (/^var\(/i.test(value.slice(i)) && !/[\w-]/.test(value[i - 1] ?? "")) {
      let depth = 0, j = i + 3;
      for (; j < value.length; j++) {
        if (value[j] === "(") depth++;
        else if (value[j] === ")" && --depth === 0) break;
      }
      i = j + 1;
    } else out += value[i++];
  }
  return out;
}
const timingProperty = /^(transition|transition-duration|transition-delay|animation|animation-duration|animation-delay)$/;

/** Every hand-typed value in one CSS file's text, with its 1-based line. Comments are blanked, lines kept. */
export function oneOffs(text, { file = "" } = {}) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, " "));
  const found = [];
  // A whole property name: custom properties keep digits, capitals and underscores; others are case-insensitive.
  for (const match of code.matchAll(/(?<![\w-])(--[\w-]+|-?[a-zA-Z][\w-]*)\s*:\s*([^;{}]+)(?=;|\})/g)) {
    const [, name, value] = match;
    const property = name.startsWith("--") ? name : name.toLowerCase();
    const add = kind => found.push({ kind, line: code.slice(0, match.index).split("\n").length, text: `${name}: ${value.trim().replace(/\s+/g, " ")}` });
    if (property.startsWith("--")) { if (file !== themeFile) add("localProperties"); continue; }
    const own = noVars(value);
    if (/^(margin|padding|gap|row-gap|column-gap)(-|$)/.test(property) && nonZeroPx.test(own)) add("spacing");
    if (/radius$/.test(property) && /\d/.test(own) && !/^\s*(0|inherit)\s*$/.test(value)) add("radii");
    if (property === "box-shadow" && !/^\s*(none|var\(--[\w-]+\))\s*$/.test(value) && /\d/.test(own)) add("shadows");
    if (property === "z-index" && /\d/.test(own)) add("zIndex");
    if (property === "font-size" && px.test(own)) add("fontSizes");
    if (timingProperty.test(property) && time.test(own)) add("timings");
  }
  return found;
}

/** Counts per kind; kinds with none are left out. */
export function tally(found) {
  const counts = {};
  for (const { kind } of found) counts[kind] = (counts[kind] ?? 0) + 1;
  return counts;
}

function stylesheets(dir) {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? stylesheets(path) : entry.name.endsWith(".css") ? [path] : [];
  });
}

/** `{ "src/a.css": [found values] }` for every CSS file under src, empty files left out. */
export function scan(root) {
  const files = {};
  const src = join(root, "src");
  if (!existsSync(src)) return files;
  for (const path of stylesheets(src)) {
    const file = relative(root, path).split(sep).join("/");
    const found = oneOffs(readFileSync(path, "utf8"), { file });
    if (found.length) files[file] = found;
  }
  return files;
}

export const total = counts => Object.values(counts).reduce((sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0), 0);

/** What rose and what fell between the committed counts and the tree's, per file and kind. */
export function compare(baseline, current) {
  const rises = [], falls = [];
  for (const file of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
    for (const kind of kinds) {
      const was = baseline[file]?.[kind] ?? 0, now = current[file]?.[kind] ?? 0;
      if (now > was) rises.push({ file, kind, was, now });
      if (now < was) falls.push({ file, kind, was, now });
    }
  }
  return { rises, falls };
}

const sorted = counts => Object.fromEntries(Object.keys(counts).sort().map(file => [file, Object.fromEntries(kinds.filter(kind => counts[file][kind]).map(kind => [kind, counts[file][kind]]))]));

export function readBaseline(root) {
  const path = join(root, baselinePath);
  if (!existsSync(path)) return { files: {}, waivers: [] };
  const data = JSON.parse(readFileSync(path, "utf8"));
  return { files: data.files ?? {}, waivers: data.waivers ?? [] };
}

function writeBaseline(root, counts, waivers) {
  const text = JSON.stringify({
    about: "Hand-typed values per CSS file (kinds as in scripts/agents/one-offs.mjs). They may only go down: node scripts/agents/one-offs.mjs check. A lead raises them with update --waive.",
    files: sorted(counts), waivers,
  }, null, 2);
  // One file per line keeps merges and reviews short.
  writeFileSync(join(root, baselinePath), `${text.replace(/\{\n\s+("[a-zA-Z]+": \d+(?:,\n\s+"[a-zA-Z]+": \d+)*)\n\s+\}/g, (_, body) => `{ ${body.replace(/,\n\s+/g, ", ")} }`)}\n`);
}

function owner(root) {
  if (process.env.ASE_OWNER) return process.env.ASE_OWNER.trim();
  try { return readFileSync(join(root, ".scratch/owner"), "utf8").split(/\r?\n/, 1)[0].trim().split(/\s+/)[1] ?? ""; } catch { return ""; }
}

const counts = scanned => Object.fromEntries(Object.entries(scanned).map(([file, found]) => [file, tally(found)]));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const lineList = lines => `lines ${lines.slice(0, 6).join(", ")}${lines.length > 6 ? ", …" : ""}`;

function check(root, flags, log) {
  const scanned = scan(root), current = counts(scanned), { files: baseline, waivers } = readBaseline(root);
  const { rises, falls } = compare(baseline, current);
  for (const { file, kind, was, now } of rises) {
    const lines = scanned[file].filter(entry => entry.kind === kind).map(entry => entry.line);
    log.error(`${file}:${lines[0]}: ${kind} (${what[kind]}) rose from ${was} to ${now} (${lineList(lines)}); use a shared value instead`);
  }
  if (rises.length) {
    const by = rises.reduce((sum, { now, was }) => sum + now - was, 0);
    log.error(`${plural(by, "hand-typed value")} more than the count in ${baselinePath}. Swap them for tokens; a lead may waive with: node scripts/agents/one-offs.mjs update --waive "<reason>"`);
    log.log(`RESULT: fail one-offs rose by ${by} in ${plural(new Set(rises.map(entry => entry.file)).size, "file")}`);
    return 1;
  }
  if (falls.length) {
    const by = falls.reduce((sum, { now, was }) => sum + was - now, 0);
    const files = plural(new Set(falls.map(entry => entry.file)).size, "file");
    if (!flags["--no-write"]) {
      writeBaseline(root, current, waivers);
      log.log(`RESULT: ok one-offs fell by ${by} in ${files}, ${total(current)} left; ${baselinePath} rewritten, commit it`);
      return 0;
    }
    // The kit runs this mid-slice and must not leave the tree dirty, so a fall is never written here. A count
    // above the tree would let a later change add values back up to it, so it fails until update is committed.
    for (const { file, kind, was, now } of falls) log.error(`${file}: ${kind} fell from ${was} to ${now}`);
    log.error(`${baselinePath} is above the tree: run node scripts/agents/one-offs.mjs update and commit it`);
    log.log(`RESULT: fail one-offs fell by ${by} in ${files} and ${baselinePath} was not updated`);
    return 1;
  }
  log.log(`RESULT: ok one-offs ${total(current)} hand-typed values in ${plural(Object.keys(current).length, "file")}, none above ${baselinePath}`);
  return 0;
}

function update(root, flags, log) {
  const current = counts(scan(root)), { files: baseline, waivers } = readBaseline(root);
  // The first count has nothing to rise above.
  const { rises } = existsSync(join(root, baselinePath)) ? compare(baseline, current) : { rises: [] };
  const reason = typeof flags["--waive"] === "string" ? flags["--waive"].replace(/\s+/g, " ").trim() : "";
  if (rises.length && !reason) {
    for (const { file, kind, was, now } of rises) log.error(`${file}: ${kind} rose from ${was} to ${now}`);
    log.error('update raises a count only with --waive "<reason>"');
    log.log("RESULT: fail one-offs update needs --waive for a rise");
    return 1;
  }
  if (rises.length && !owner(root).endsWith("-lead")) {
    log.error("--waive requires a *-lead owner");
    log.log("RESULT: fail one-offs waive needs a lead");
    return 1;
  }
  const date = new Date().toISOString().slice(0, 10);
  const recorded = rises.map(({ file, kind, was, now }) => ({ date, file, kind, from: was, to: now, reason }));
  writeBaseline(root, current, [...waivers, ...recorded]);
  log.log(`RESULT: ok one-offs ${baselinePath} rewritten, ${total(current)} hand-typed values${recorded.length ? `, ${plural(recorded.length, "rise")} waived` : ""}`);
  return 0;
}

function report(root, flags, log) {
  const scanned = scan(root);
  if (flags["--json"]) {
    const files = Object.fromEntries(Object.entries(scanned).map(([file, found]) => [file, { counts: tally(found), untraced: found }]));
    log.log(JSON.stringify({ total: total(counts(scanned)), files }));
    return 0;
  }
  for (const [file, found] of Object.entries(scanned)) {
    log.log(`${file}: ${Object.entries(tally(found)).map(([kind, n]) => `${kind} ${n}`).join(", ")}`);
    for (const { kind, line, text } of found) log.log(`  ${file}:${line}: ${kind}: ${text}`);
  }
  log.log(`RESULT: ok one-offs ${total(counts(scanned))} hand-typed values in ${plural(Object.keys(scanned).length, "file")}`);
  return 0;
}

const withValue = new Set(["--root", "--then", "--waive"]), switches = new Set(["--no-write", "--json"]);

function parse(argv) {
  const flags = {}, paths = [];
  let command = "check", named = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (withValue.has(arg)) flags[arg] = argv[++i] ?? "";
    else if (switches.has(arg)) flags[arg] = true;
    else if (!named && ["check", "update", "report"].includes(arg)) { command = arg; named = true; }
    // Anything else is a path the kit appends for a css check: the count reads the whole tree and hands them to --then.
    else paths.push(arg);
  }
  return { command, flags, paths };
}

export function run(argv, { log = console, root: defaultRoot = fileURLToPath(new URL("../..", import.meta.url)) } = {}) {
  const { command, flags, paths } = parse(argv);
  const root = flags["--root"] || defaultRoot;
  let status = { check, update, report }[command](root, flags, log);
  // The kit runs one css command; --then lets that one command also run the colour check beside the count.
  if (command === "check" && flags["--then"]) {
    try { execFileSync(process.execPath, [join(root, flags["--then"]), ...paths], { cwd: root, stdio: "inherit" }); } catch { status = 1; }
  }
  return status;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = run(process.argv.slice(2));
