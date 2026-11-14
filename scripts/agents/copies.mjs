// The one-way copy counter: home-made look-alikes of the editor's parts (buttons, badges, dialogs) per file, which may
// only go down (TOOLS-241; the parts list is docs/agents/parts.md, the rule "reuse before new" is in AGENTS.md).
//
//   node scripts/agents/copies.mjs check [--then <script> [args…]]
//       fail when a file has more copies of a kind than the committed count, or fewer (then run update and commit it,
//       so a later change cannot add copies back up to a stale count). Never writes. --then runs one more node script
//       with every argument after it, so the kit's single css command can run this count before the others.
//   node scripts/agents/copies.mjs update [--waive "<reason>"]
//       rewrite the committed count from the tree; a rise needs a written reason and a *-lead owner, and is recorded
//   node scripts/agents/copies.mjs report [--json]
//       every counted copy with file and line: the work list for the one-component-per-PR slices
//
// `--root <dir>` reads that project instead of this one. What counts is in `kinds` below; a part's own files (`homes`)
// never count. Using a part never counts: the `button()` helper, the Badge part's `ui-badge`, a screen setting a
// part's `--btn-*` hook.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const kinds = ["buttons", "dialogs", "buttonLooks", "badgeLooks", "dialogLooks"];
const what = {
  buttons: "button element made by hand instead of button() from src/ui/dom.ts",
  dialogs: "dialog element made by hand",
  buttonLooks: "button look styled outside src/ui/parts/button.css",
  badgeLooks: "badge look styled outside src/ui/parts/badge.css",
  dialogLooks: "dialog or backdrop look styled by hand",
};
/** A part's own files: copies of its kind never count there. A kind with no part yet has none. */
export const homes = {
  buttons: ["src/ui/dom.ts"],
  dialogs: [],
  buttonLooks: ["src/ui/parts/button.css"],
  badgeLooks: ["src/ui/parts/badge.css", "src/ui/parts/badge-options.ts"],
  dialogLooks: [],
};
export const baselinePath = "scripts/agents/copies.json";
/** The design board draws parts to show them; it is not the editor's UI. */
const skipped = /^src\/catalogue\//;

const lineAt = (text, index) => text.slice(0, index).split("\n").length;
const blank = text => text.replace(/[^\n]/g, " ");

// ---------- Scripts ----------

const scriptPatterns = {
  buttons: /\bnode\(\s*["'`]button["'`]|\bcreateElement\(\s*["'`]button["'`]|<button[\s>]/g,
  dialogs: /\bnode\(\s*["'`]dialog["'`]|\bcreateElement\(\s*["'`]dialog["'`]|<dialog[\s>]/g,
};

/** True when a value may start after `code` (so a `/` there opens a regex literal, not a division). */
function startsValue(code) {
  // Only the last few characters before the `/` matter: step back over spaces, never trim the whole text.
  let end = code.length;
  while (end > 0 && /\s/.test(code[end - 1])) end--;
  const before = code.slice(Math.max(0, end - 12), end);
  if (!before || /(?:\+\+|--)$/.test(before)) return !before;
  return /[(,=:[!&|?{};+\-*%<>~^]$|\b(?:return|typeof|case|yield|await|throw|else|in|of|void|delete|new)$/.test(before);
}

/**
 * The text with its comments blanked (lines kept) and its strings and regex literals left as they are, so `"image/*"`
 * or a URL's `//` never starts a comment. A template's `${…}` is code again, nested templates included.
 */
export function withoutComments(text) {
  let out = "";
  const modes = ["code"], depths = [0];
  for (let i = 0; i < text.length;) {
    const mode = modes.at(-1), char = text[i], next = text[i + 1];
    if (mode === "code") {
      if (char === "/" && next === "/") { const end = text.indexOf("\n", i); const stop = end < 0 ? text.length : end; out += blank(text.slice(i, stop)); i = stop; continue; }
      if (char === "/" && next === "*") { const end = text.indexOf("*/", i + 2); const stop = end < 0 ? text.length : end + 2; out += blank(text.slice(i, stop)); i = stop; continue; }
      // A regex literal (a `/` where a value starts) is skipped whole, so a quote or backtick in it opens no string.
      if (char === "/" && startsValue(out)) {
        let j = i + 1, inClass = false;
        for (; j < text.length && text[j] !== "\n"; j++) {
          if (text[j] === "\\" && text[j + 1] !== "\n") j++;
          else if (text[j] === "[") inClass = true;
          else if (text[j] === "]") inClass = false;
          else if (text[j] === "/" && !inClass) break;
        }
        out += text.slice(i, j + 1); i = j + 1;
        continue;
      }
      if (char === '"' || char === "'") modes.push(char);
      else if (char === "`") modes.push("`");
      else if (char === "{") depths[depths.length - 1]++;
      else if (char === "}" && modes.length > 1 && depths.at(-1) === 0) { modes.pop(); depths.pop(); }
      else if (char === "}") depths[depths.length - 1]--;
      out += char; i++;
      continue;
    }
    if (char === "\\") { out += text.slice(i, i + 2); i += 2; continue; }
    if (mode === "`" && char === "$" && next === "{") { modes.push("code"); depths.push(0); out += "${"; i += 2; continue; }
    // A quote's string ends at its quote, or at a line end (an unclosed string never swallows the file).
    if (char === mode || (mode !== "`" && char === "\n")) modes.pop();
    out += char; i++;
  }
  return out;
}

/** Every hand-made button and dialog element in one TypeScript file's text, with its 1-based line. Comments never count. */
export function copiesInScript(text) {
  const code = withoutComments(text);
  const found = [];
  for (const [kind, pattern] of Object.entries(scriptPatterns))
    for (const match of code.matchAll(pattern)) {
      const line = lineAt(code, match.index);
      found.push({ kind, line, text: text.split("\n")[line - 1].trim().slice(0, 120) });
    }
  return found.sort((a, b) => a.line - b.line);
}

// ---------- Styles ----------

/** Split on commas outside parentheses and brackets. */
function splitList(text) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(" || text[i] === "[") depth++;
    else if (text[i] === ")" || text[i] === "]") depth--;
    else if (text[i] === "," && depth === 0) { out.push(text.slice(start, i)); start = i + 1; }
  }
  out.push(text.slice(start));
  return out.map(part => part.trim()).filter(Boolean);
}

/** A nested selector list resolved against its parent's (`&` replaced, else a descendant). */
function resolve(parents, own) {
  const list = splitList(own);
  if (!parents.length) return list;
  return parents.flatMap(parent => list.map(child => (child.includes("&") ? child.replaceAll("&", parent) : `${parent} ${child}`)));
}

/**
 * Every style rule in one CSS file's text: its full selectors (nesting resolved; at-rules are see-through), its
 * declarations and the line it starts on. Comments are blanked, lines kept.
 */
export function styleRules(text) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  const rules = [], stack = [{ selectors: [], rule: null }];
  let start = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char === "{") {
      const prelude = code.slice(start, i);
      const parent = stack.at(-1);
      // Declarations written before a nested rule belong to the parent; the text after the last ";" is the prelude.
      const cut = prelude.lastIndexOf(";");
      if (cut >= 0 && parent.rule) parent.rule.declarations.push(...declarations(prelude.slice(0, cut)));
      const from = start + cut + 1, head = code.slice(from, i).trim();
      // An at-rule is see-through: inside a rule, what it holds still belongs to that rule.
      if (head.startsWith("@")) stack.push({ selectors: parent.selectors, rule: parent.rule });
      else {
        const rule = { selectors: resolve(parent.selectors, head), declarations: [], line: lineAt(code, from + code.slice(from, i).search(/\S/)) };
        rules.push(rule);
        stack.push({ selectors: rule.selectors, rule });
      }
      start = i + 1;
    } else if (char === "}") {
      const top = stack.pop();
      if (top?.rule) top.rule.declarations.push(...declarations(code.slice(start, i)));
      if (!stack.length) stack.push({ selectors: [], rule: null });
      start = i + 1;
    } else if (char === ";" && !stack.at(-1).rule) start = i + 1;
  }
  return rules;
}

function declarations(text) {
  return text.split(";").map(part => /^\s*(--[\w-]+|[a-zA-Z-]+)\s*:\s*([\s\S]*)$/.exec(part)).filter(Boolean)
    .map(([, name, value]) => ({ name: name.startsWith("--") ? name : name.toLowerCase(), value: value.trim() }));
}

/**
 * A selector with each `:is()` and `:where()` spelled out as its alternatives (`.a :is(button, .b)` is `.a button` and
 * `.a .b`), so a look inside a group still counts, once per place. At most 64 selectors come out of one.
 */
export function expandGroups(selector) {
  const out = [], queue = [selector];
  while (queue.length && out.length + queue.length <= 64) {
    const current = queue.shift();
    const start = current.search(/:(?:is|where)\(/);
    if (start < 0) { out.push(current); continue; }
    const open = current.indexOf("(", start);
    let depth = 0, end = open;
    for (; end < current.length; end++) {
      if (current[end] === "(") depth++;
      else if (current[end] === ")" && --depth === 0) break;
    }
    // A group glued to a compound (`.button:is(.panel .choice)`) puts an alternative's ancestors before that
    // compound and its last compound onto it: `.panel .button.choice`.
    const from = lastCombinator(current.slice(0, start)) + 1;
    for (const choice of splitList(current.slice(open + 1, end))) {
      const cut = lastCombinator(choice) + 1;
      // An element name leads its compound (`.button:is(button)` is `button.button`).
      const tail = choice.slice(cut), element = /^(?:[a-z][\w-]*|\*)/i.exec(tail)?.[0] ?? "";
      const glued = element ? `${element}${current.slice(from, start)}${tail.slice(element.length)}` : `${current.slice(from, start)}${tail}`;
      queue.push(`${current.slice(0, from)}${choice.slice(0, cut)}${glued}${current.slice(end + 1)}`);
    }
  }
  return [...out, ...queue];
}

/** The index of the last combinator (a space, `>`, `+` or `~`) outside brackets and parentheses, or -1. */
function lastCombinator(selector) {
  let depth = 0, found = -1;
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(char)) found = i;
  }
  return found;
}

/**
 * What a selector styles: its last compound without pseudo-classes or attribute tests, that compound's element and
 * classes, and the compounds before it (the context).
 */
function subject(selector) {
  // Arguments and attribute tests may hold spaces and combinator signs (`[aria-label="Open menu"]`, `:has(.a > .b)`):
  // they are emptied first, nested ones included, so only real combinators split the selector.
  let flat = selector.replace(/\[(?:[^\]"']|"[^"]*"|'[^']*')*\]/g, "[]");
  for (let last = ""; last !== flat;) { last = flat; flat = flat.replace(/\([^()]*\)/g, "\u0000"); }
  const parts = flat.replaceAll("\u0000", "()").split(/\s*[\s>+~]\s*/).filter(Boolean);
  const last = parts.at(-1) ?? "";
  const bare = compound => compound.replace(/::?[\w-]+(\(\))?/g, "").replace(/\[[^\]]*\]/g, "");
  const plain = bare(last);
  return {
    // Each compound of the context keeps its element, id and first class, the name of the thing; its states and further
    // classes go, so `.row:hover .row__button` and `.row.is-open .row__button` draw the look `.row .row__button` does.
    backdrop: /::backdrop\b/.test(last),
    context: parts.slice(0, -1).map(compound => {
      const plainCompound = bare(compound);
      return `${/^[a-z][\w-]*/i.exec(plainCompound)?.[0] ?? ""}${/#[\w-]+/.exec(plainCompound)?.[0] ?? ""}${/\.[\w-]+/.exec(plainCompound)?.[0] ?? ""}`;
    }).filter(Boolean).join(" "),
    element: /^[a-z][\w-]*/.exec(plain)?.[0] ?? "", classes: [...plain.matchAll(/\.([\w-]+)/g)].map(match => match[1]),
  };
}

/**
 * The words of a class's own name (after its last BEM `__`): `edit-bar__button` has `button`, `create-dialog__kinds`
 * has none of `dialog` (a part of a dialog, not its look). A `--modifier` adds its words.
 */
const words = name => name.split("__").at(-1).toLowerCase().split(/[-_]+/).filter(Boolean);
/** The class that names the look, or "" for none; a modifier the word is not in is dropped (`slot-chip--items` is `slot-chip`). */
function named(classes, list) {
  for (const name of classes) {
    if (!words(name).some(word => list.includes(word))) continue;
    const base = name.replace(/--[\w-]*$/, "");
    return words(base).some(word => list.includes(word)) ? base : name;
  }
  return "";
}
// Every border property draws a look (sides, logical sides, colour, style, width, corners), except a table's layout.
const looks = /^(?:background|background-color|background-image|box-shadow)$|^border(?:$|-(?!collapse$|spacing$)[a-z-]+$)/;
const setsLook = rule => rule.declarations.some(({ name }) => looks.test(name));

/** The names that say only what a thing is, not which one: their copies differ by where they stand. */
const generic = new Set(["button", "btn", "badge", "pill", "chip", "count", "counter", "dialog", "modal", "backdrop", "scrim"]);

/** Per kind: the name of the look a selector's subject draws, or "" when it draws none of that kind. */
const styleKinds = {
  buttonLooks: ({ element, classes }) => named(classes, ["button", "btn"]) || (element === "button" ? "button" : ""),
  badgeLooks: ({ classes }) => named(classes, ["badge", "pill", "chip", "count", "counter"]),
  dialogLooks: ({ element, classes, backdrop }) => {
    const name = named(classes, ["dialog", "modal", "backdrop", "scrim"]) || (element === "dialog" ? "dialog" : "");
    if (backdrop) return `${name || classes[0] || element}::backdrop`;
    return name;
  },
};

/**
 * Every home-made look in one CSS file's text: a rule that sets a look (background, border, corner or shadow) on
 * something named as a button, a badge or a dialog. One copy per look and place, however many rules and states draw
 * it: `.x__button`, `.x__button:hover` and `.x.is-on .x__button` count once, at the first line; a bare name counts once
 * per place it stands, so `.a .button` and `.b .button` count twice. A rule that sets only a part's
 * hooks (`--btn-*`) uses the part and never counts.
 */
export function copiesInStyles(text) {
  const found = [], seen = new Set();
  for (const rule of styleRules(text)) {
    if (!setsLook(rule)) continue;
    for (const selector of rule.selectors.flatMap(expandGroups)) {
      const target = subject(selector);
      for (const [kind, look] of Object.entries(styleKinds)) {
        const name = look(target);
        if (!name) continue;
        // A name of its own (`wizard__badge`, `setup-pill`) is the place: its states and parents' states are the same
        // copy. A bare name (`.button`, `button`, `dialog`) is told apart by where it stands: `.a .button`, `.b .button`.
        const key = `${kind} ${generic.has(name.replace(/::backdrop$/, "")) ? `${target.context} ` : ""}${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ kind, line: rule.line, text: selector.replace(/\s+/g, " ").slice(0, 120) });
      }
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

// ---------- The tree ----------

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(ts|css)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

/** `{ "src/a.css": [found copies] }` for every TypeScript and CSS file under src, files with none left out. */
export function scan(root) {
  const files = {};
  const src = join(root, "src");
  if (!existsSync(src)) return files;
  for (const path of sources(src)) {
    const file = relative(root, path).split(sep).join("/");
    if (skipped.test(file)) continue;
    const text = readFileSync(path, "utf8");
    const found = (file.endsWith(".css") ? copiesInStyles(text) : copiesInScript(text)).filter(({ kind }) => !homes[kind].includes(file));
    if (found.length) files[file] = found;
  }
  return files;
}

/** Counts per kind; kinds with none are left out. */
export function tally(found) {
  const counts = {};
  for (const { kind } of found) counts[kind] = (counts[kind] ?? 0) + 1;
  return counts;
}
export const total = counts => Object.values(counts).reduce((sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0), 0);
/** The whole tree's count per kind, every kind named. */
export const byKind = counts => Object.fromEntries(kinds.map(kind => [kind, Object.values(counts).reduce((sum, row) => sum + (row[kind] ?? 0), 0)]));

/** What rose and what fell between the committed counts and the tree's, per file and kind. */
export function compare(baseline, current) {
  const rises = [], falls = [];
  for (const file of [...new Set([...Object.keys(baseline), ...Object.keys(current)])].sort()) {
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
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf8"));
  return { files: data.files ?? {}, waivers: data.waivers ?? [] };
}

function writeBaseline(root, counts, waivers) {
  const text = JSON.stringify({
    about: "Home-made look-alikes of the editor's parts per file (kinds in scripts/agents/copies.mjs). They may only go down: node scripts/agents/copies.mjs check. A lead raises them with update --waive.",
    totals: byKind(counts), files: sorted(counts), waivers,
  }, null, 2);
  // One file per line keeps merges and reviews short.
  writeFileSync(join(root, baselinePath), `${text.replace(/\{\n\s+("[a-zA-Z]+": \d+(?:,\n\s+"[a-zA-Z]+": \d+)*)\n\s+\}/g, (_, body) => `{ ${body.replace(/,\n\s+/g, ", ")} }`)}\n`);
}

function owner(root) {
  if (process.env.ASE_OWNER) return process.env.ASE_OWNER.trim();
  try { return readFileSync(join(root, ".scratch/owner"), "utf8").split(/\r?\n/, 1)[0].trim().split(/\s+/)[1] ?? ""; } catch { return ""; }
}

const counts = scanned => Object.fromEntries(Object.entries(scanned).map(([file, found]) => [file, tally(found)]));
const plural = (n, word) => `${n} ${n === 1 ? word : word === "copy" ? "copies" : `${word}s`}`;
const lineList = lines => `lines ${lines.slice(0, 6).join(", ")}${lines.length > 6 ? ", …" : ""}`;

function check(root, flags, log) {
  const committed = readBaseline(root);
  if (!committed) {
    log.error(`${baselinePath} is missing: run node scripts/agents/copies.mjs update and commit it`);
    log.log("RESULT: fail copies no committed count");
    return 1;
  }
  const scanned = scan(root), current = counts(scanned);
  const { rises, falls } = compare(committed.files, current);
  for (const { file, kind, was, now } of rises) {
    const lines = scanned[file].filter(entry => entry.kind === kind).map(entry => entry.line);
    log.error(`${file}:${lines[0]}: ${kind} (${what[kind]}) rose from ${was} to ${now} (${lineList(lines)}); reuse the part (docs/agents/parts.md) instead`);
  }
  if (rises.length) {
    const by = rises.reduce((sum, { now, was }) => sum + now - was, 0);
    log.error(`${plural(by, "copy")} more than the count in ${baselinePath}. Use or extend the existing part (docs/agents/parts.md); a lead may waive with: node scripts/agents/copies.mjs update --waive "<reason>"`);
    log.log(`RESULT: fail copies rose by ${by} in ${plural(new Set(rises.map(entry => entry.file)).size, "file")}`);
    return 1;
  }
  if (falls.length) {
    // A count above the tree would let a later change add copies back up to it, so a fall fails until it is committed.
    const by = falls.reduce((sum, { now, was }) => sum + was - now, 0);
    for (const { file, kind, was, now } of falls) log.error(`${file}: ${kind} fell from ${was} to ${now}`);
    log.error(`${baselinePath} is above the tree: run node scripts/agents/copies.mjs update and commit it`);
    log.log(`RESULT: fail copies fell by ${by} in ${plural(new Set(falls.map(entry => entry.file)).size, "file")} and ${baselinePath} was not updated`);
    return 1;
  }
  log.log(`RESULT: ok copies ${total(current)} home-made copies in ${plural(Object.keys(current).length, "file")}, none above ${baselinePath}`);
  return 0;
}

function update(root, flags, log) {
  const current = counts(scan(root)), committed = readBaseline(root);
  // The first count has nothing to rise above.
  const { rises } = committed ? compare(committed.files, current) : { rises: [] };
  const reason = typeof flags["--waive"] === "string" ? flags["--waive"].replace(/\s+/g, " ").trim() : "";
  if (rises.length && !reason) {
    for (const { file, kind, was, now } of rises) log.error(`${file}: ${kind} rose from ${was} to ${now}`);
    log.error('update raises a count only with --waive "<reason>"');
    log.log("RESULT: fail copies update needs --waive for a rise");
    return 1;
  }
  if (rises.length && !owner(root).endsWith("-lead")) {
    log.error("--waive requires a *-lead owner");
    log.log("RESULT: fail copies waive needs a lead");
    return 1;
  }
  const date = new Date().toISOString().slice(0, 10);
  const recorded = rises.map(({ file, kind, was, now }) => ({ date, file, kind, from: was, to: now, reason }));
  writeBaseline(root, current, [...(committed?.waivers ?? []), ...recorded]);
  log.log(`RESULT: ok copies ${baselinePath} rewritten, ${total(current)} home-made copies${recorded.length ? `, ${plural(recorded.length, "rise")} waived` : ""}`);
  return 0;
}

function report(root, flags, log) {
  const scanned = scan(root), current = counts(scanned);
  if (flags["--json"]) {
    log.log(JSON.stringify({ total: total(current), totals: byKind(current), files: scanned }));
    return 0;
  }
  for (const kind of kinds) {
    const rows = Object.entries(scanned).flatMap(([file, found]) => found.filter(entry => entry.kind === kind).map(entry => ({ file, ...entry })));
    log.log(`${kind} (${what[kind]}): ${rows.length}`);
    for (const { file, line, text } of rows) log.log(`  ${file}:${line}: ${text}`);
  }
  log.log(`RESULT: ok copies ${total(current)} home-made copies in ${plural(Object.keys(current).length, "file")}`);
  return 0;
}

function parse(argv) {
  const flags = {};
  let command = "check", named = false, then;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--then") { then = argv.slice(i + 1); break; }
    if (arg === "--root" || arg === "--waive") flags[arg] = argv[++i] ?? "";
    else if (arg === "--json") flags[arg] = true;
    else if (!named && ["check", "update", "report"].includes(arg)) { command = arg; named = true; }
    // Anything else (a path the kit appends to its css command) is not ours: the count always reads the whole tree.
  }
  return { command, flags, then };
}

export function run(argv, { log = console, root: defaultRoot = fileURLToPath(new URL("../..", import.meta.url)) } = {}) {
  const { command, flags, then } = parse(argv);
  const root = flags["--root"] || defaultRoot;
  let status = { check, update, report }[command](root, flags, log);
  if (command === "check" && then?.length) {
    try { execFileSync(process.execPath, [join(root, then[0]), ...then.slice(1)], { cwd: root, stdio: "inherit" }); } catch { status = 1; }
  }
  return status;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = run(process.argv.slice(2));
