import { posix } from "node:path";
import { createRequire } from "node:module";
import { knownFailure } from "./suite-summary.mjs";

// The repo's lint dependency supplies the compiler API (TypeScript 7 has none).
const ts = createRequire(import.meta.url)("typescript-eslint-api");

const browserSpec = /^tests\/(native-save|native-preview)\/[^/]+\.spec\.ts$/;
/** Folders whose modules the import scan follows (specs reach app code in shared/ and worker/). */
export const graphFile = /^(tests|src|scripts|shared|worker|tools)\//;
// Quote and apostrophe strings end at the line, so an apostrophe in a comment cannot swallow later lines.
const quoted = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g;
const appModule = /^(src|shared)\/.*\.(?:ts|tsx|js|mjs)$/;
const MAX_STRING_SPECS = 15;
// A string defined by more app modules than this is shared vocabulary ("Delete", "is-error"), not a feature hook.
const MAX_STRING_MODULES = 3;
// A module with more importers than this is a shared helper: its own strings count, its importers' do not.
const MAX_WALK_IMPORTERS = 3;
const GENERIC_NAME_TOKENS = new Set(["native", "media", "page", "builder", "editor"]);
// Common UI states, element kinds and domain nouns do not identify a feature.
const COMMON_STRINGS = new Set([
  "true", "false", "none", "auto", "button", "hidden", "active", "open", "close", "error",
  "image", "video", "file", "files", "page", "pages", "media", "native", "editor", "input", "text",
]);
const REASON_KINDS = ["import", "fixture", "removed string", "string", "name", "server"];
const TEST_SERVER = "tests/native-save/server.ts";
const AGENT_SERVERS = [TEST_SERVER, "tests/native-save/fake-hub.ts"];

function changedRoutes(diff) {
  const routes = new Set();
  let server = false, inHunk = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) { server = false; inHunk = false; }
    if (!inHunk && (line.startsWith("--- a/") || line.startsWith("+++ b/"))) server = line.slice(6).replace(/\t.*$/, "") === TEST_SERVER;
    if (line.startsWith("@@")) inHunk = true;
    if (!server || !inHunk || !/^[+-]/.test(line)) continue;
    for (const value of literals(line.slice(1))) {
      if (/^\/(?!\/)[\w/.-]+$/.test(value) && !["/", "/api", "/user"].includes(value)) routes.add(value);
    }
  }
  return [...routes].sort();
}

export function specGroups(file, text) {
  if (file.startsWith("tests/native-preview/")) return ["native-preview"];
  const groups = ["actual", "native-static"].filter(group => text.includes(`"@${group}"`));
  return groups.length ? groups : ["default"];
}

export function importsOf(text) {
  const pattern = /\b(?:import|export)\s+(?:[^;"'`]*?\s+from\s*)?["']([^"']+)["']|\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;
  return [...text.matchAll(pattern)].map(match => match[1] ?? match[2]);
}

function resolveImport(file, specifier, files) {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return undefined;
  // Specs load app modules in the browser from the site root, e.g. import("/src/drafts.ts").
  const target = posix.normalize(specifier.startsWith("/") ? specifier.slice(1) : posix.join(posix.dirname(file), specifier));
  const stems = [target, ...(target.endsWith(".js") ? [target.slice(0, -3)] : [])];
  const candidates = stems.flatMap(stem => [stem, ...[".ts", ".tsx", ".js", ".mjs"].map(ext => stem + ext), ...[".ts", ".tsx", ".js", ".mjs"].map(ext => `${stem}/index${ext}`)]);
  return candidates.find(candidate => graphFile.test(candidate) && files.has(candidate));
}

function literals(text) {
  return [...text.matchAll(quoted)].map(match => match[0].slice(1, -1));
}

// Markup text and accessibility attributes are visible by position; other literals
// must look like a label (capitalised or several words) to count.
function visible(text, explicit) {
  return text.length >= 2 && /\p{L}/u.test(text) && (explicit || /^\p{Lu}/u.test(text) || text.includes(" "))
    && !/[/\\{}=]/.test(text) && !/^(?:[.#]|\[)/.test(text);
}

function lineStrings(line) {
  const modules = new Set(importsOf(line));
  const attributes = [...line.matchAll(/(?:aria-label|title|placeholder)=["']([^"']+)["']/g)].map(match => match[1]);
  const text = [...line.matchAll(/>([^<>]+)</g)].map(match => match[1].trim());
  return [
    ...literals(line).filter(value => !modules.has(value)).map(value => ({ value, explicit: false })),
    ...[...attributes, ...text].map(value => ({ value, explicit: true })),
  ];
}

export function removedStrings(diff) {
  const files = new Map();
  let file, inHunk = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) { file = undefined; inHunk = false; }
    if (!inHunk && line.startsWith("--- a/")) {
      file = line.slice(6).replace(/\t.*$/, "");
      if (file.startsWith("src/")) files.set(file, { removed: [], added: [] });
    }
    if (line.startsWith("@@")) inHunk = true;
    if (!inHunk || !files.has(file)) continue;
    if (line.startsWith("-")) files.get(file).removed.push(line.slice(1));
    if (line.startsWith("+")) files.get(file).added.push(line.slice(1));
  }
  const result = [];
  for (const [file, { removed, added }] of files) {
    const candidates = new Set();
    for (const line of removed) {
      for (const { value, explicit } of lineStrings(line)) if (visible(value, explicit)) candidates.add(value);
    }
    // A string that reappears whole in an added line moved; "Image" → "Images" is still a rename.
    const kept = new Set(added.flatMap(line => lineStrings(line).map(({ value }) => value)));
    for (const value of candidates) if (!kept.has(value)) result.push({ file, value });
  }
  return result;
}

// Separate from importsOf: browser import selection retains its original semantics.
// Syntax nodes distinguish import types from real calls, including calls inside templates.
function runtimeImports(file, text) {
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const imports = [];
  const visit = node => {
    if (ts.isTypeNode(node)) return;
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause, bindings = clause?.namedBindings;
      const onlyTypes = clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings)
        && bindings.elements.length > 0 && bindings.elements.every(element => element.isTypeOnly));
      if (!onlyTypes) imports.push(node.moduleSpecifier.text);
      return;
    }
    if (ts.isExportDeclaration(node)) {
      const clause = node.exportClause;
      const onlyTypes = node.isTypeOnly || (clause && ts.isNamedExports(clause)
        && clause.elements.length > 0 && clause.elements.every(element => element.isTypeOnly));
      if (node.moduleSpecifier && !onlyTypes) imports.push(node.moduleSpecifier.text);
      return;
    }
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
      if (node.moduleReference.expression) imports.push(node.moduleReference.expression.text);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) imports.push(argument.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return imports;
}

function changedModules(files, changed, paths) {
  const reverse = new Map();
  for (const [file, text] of Object.entries(files)) {
    if (!appModule.test(file) || file === "src/main.ts") continue;
    for (const specifier of runtimeImports(file, text)) {
      const dependency = resolveImport(file, specifier, paths);
      if (!dependency) continue;
      if (!reverse.has(dependency)) reverse.set(dependency, new Set());
      reverse.get(dependency).add(file);
    }
  }
  const modules = new Set();
  const visit = file => {
    if (file === "src/main.ts" || modules.has(file)) return;
    modules.add(file);
    const importers = reverse.get(file) ?? new Set();
    if (importers.size <= MAX_WALK_IMPORTERS) for (const importer of importers) visit(importer);
  };
  for (const file of changed) if (appModule.test(file) && Object.hasOwn(files, file)) visit(file);
  return [...modules].sort();
}

function definedStrings(text) {
  const candidates = new Map();
  const add = (value, hook = false) => {
    value = value.trim();
    if (value.length < 4 || COMMON_STRINGS.has(value.toLowerCase()) || /[\\{}\n]/.test(value)) return;
    candidates.set(value, hook || candidates.get(value) || false);
  };
  // Per line, as in removedStrings, so markup text cannot span code between unrelated < and >.
  for (const { value, explicit } of text.split("\n").flatMap(lineStrings)) if (visible(value, explicit)) add(value);
  for (const match of text.matchAll(/\b(class|className|id|data-[\w-]+)\s*(?:=\s*\{?\s*|:\s*)["'`]([^"'`]+)["'`]/g)) {
    if (match[1].startsWith("data-")) add(match[1], true);
    for (const token of match[2].split(/\s+/)) add(token, true);
  }
  for (const match of text.matchAll(/\bclassList\s*\.\s*(?:add|toggle|remove)\s*\(([^)]*)\)/g)) {
    for (const value of literals(match[1])) add(value, true);
  }
  for (const value of literals(text)) {
    if (/^[.#\[]/.test(value.trim())) {
      for (const match of value.matchAll(/[.#]([\w-]+)/g)) add(match[1], true);
    }
    for (const match of value.matchAll(/\bdata-[\w-]+/g)) add(match[0], true);
  }
  return [...candidates].map(([value, hook]) => ({ value, hook }));
}

function stringPattern({ value, hook }) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = hook ? "[\\w-]" : "[\\p{L}\\p{N}_]";
  return new RegExp(`(?<!${word})${escaped}(?!${word})`, "u");
}

function nameTokens(file) {
  return new Set(posix.basename(file).replace(/\.[^.]+$/, "").replace(/([a-z\d])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase().split(/[-_.]+/)
    .filter(token => token && !["spec", "test", "actual", "index"].includes(token))
    .map(token => token.length > 1 && token.endsWith("s") ? token.slice(0, -1) : token));
}

function moduleReasons(files, modules, specs) {
  const reasons = new Map(specs.map(spec => [spec.file, []]));
  if (!modules.length) return reasons;
  const defined = new Map(Object.entries(files).filter(([file]) => appModule.test(file)).map(([file, text]) => [file, definedStrings(text)]));
  const definers = new Map();
  for (const candidates of defined.values()) for (const { value } of candidates) definers.set(value, (definers.get(value) ?? 0) + 1);
  // Cache matches across modules: common labels occur in many importers.
  const matches = new Map();
  for (const file of modules) {
    for (const candidate of defined.get(file) ?? []) {
      if (definers.get(candidate.value) > MAX_STRING_MODULES) continue;
      const key = JSON.stringify(candidate);
      if (!matches.has(key)) {
        const pattern = stringPattern(candidate);
        const found = specs.filter(spec => spec.text.includes(candidate.value) && spec.strings.some(value => pattern.test(value)));
        matches.set(key, found.length <= MAX_STRING_SPECS ? found : []);
      }
      for (const spec of matches.get(key)) reasons.get(spec.file).push(`string: ${JSON.stringify(candidate.value)} (${file})`);
    }
    const tokens = nameTokens(file);
    for (const spec of specs) {
      const shared = [...tokens].filter(token => spec.tokens.has(token));
      if (shared.length >= 2 && shared.some(token => !GENERIC_NAME_TOKENS.has(token))) {
        reasons.get(spec.file).push(`name: ${shared.join(", ")} (${file})`);
      }
    }
  }
  return reasons;
}

/** Select from a snapshot of repository paths and text; no filesystem or git reads. */
export function selectAffected({ files, changed, diff = "" }) {
  const changedFiles = [...new Set(changed)].sort();
  const paths = new Set([...Object.keys(files), ...changedFiles]);
  const graph = new Map(Object.entries(files).filter(([file]) => graphFile.test(file)).map(([file, text]) =>
    [file, importsOf(text).map(value => resolveImport(file, value, paths)).filter(Boolean)]));
  const removed = removedStrings(diff);
  const specs = Object.keys(files).filter(file => browserSpec.test(file)).sort()
    .map(file => { const strings = literals(files[file]); return { file, strings, text: strings.join("\n"), tokens: nameTokens(file) }; });
  const extraReasons = moduleReasons(files, changedModules(files, changedFiles, paths), specs);
  const routeReasons = new Map(specs.map(spec => [spec.file, []]));
  if (changedFiles.includes(TEST_SERVER)) for (const route of changedRoutes(diff)) {
    const matches = specs.filter(spec => spec.strings.some(value => value.includes(route)));
    if (matches.length <= MAX_STRING_SPECS) for (const spec of matches) routeReasons.get(spec.file).push(`server: route ${JSON.stringify(route)} (${TEST_SERVER})`);
  }
  const selected = [];
  for (const { file, strings } of specs) {
    const text = files[file], groups = specGroups(file, text), reasons = new Set();
    const reached = new Set();
    const visit = path => {
      if (reached.has(path)) return;
      reached.add(path);
      for (const dependency of graph.get(path) ?? []) visit(dependency);
    };
    visit(file);
    for (const change of changedFiles) {
      if (reached.has(change)) reasons.add(`import: ${change}`);
      if (file.startsWith("tests/native-save/") && AGENT_SERVERS.includes(change)
        && (reached.has("tests/native-save/mcp-prompt.ts") || strings.some(value => value.includes("/mcp")))) reasons.add(`server: agent paths (${change})`);
      if (file.startsWith("tests/native-save/") && ["scripts/native-browser-tests.mjs", "tests/native-save/fixture-contract.ts"].includes(change)) reasons.add(`fixture: all native-save (${change})`);
      if (change.startsWith("fixtures/actual-starter/") && groups.includes("actual")) reasons.add(`fixture: actual (${change})`);
      // The native-preview server serves the default fixture too.
      else if (change.startsWith("fixtures/native-starter/") && (groups.includes("default") || groups.includes("native-preview"))) reasons.add(`fixture: default (${change})`);
      else {
        const fixture = /^fixtures\/([^/]+)\//.exec(change)?.[1];
        if (fixture && !["actual-starter", "native-starter"].includes(fixture) && text.includes(`fixtures/${fixture}`)) reasons.add(`fixture: ${fixture} (${change})`);
      }
    }
    for (const { file: source, value } of removed) if (strings.some(string => string.includes(value))) reasons.add(`removed string: ${JSON.stringify(value)} (${source})`);
    for (const reason of extraReasons.get(file)) reasons.add(reason);
    for (const reason of routeReasons.get(file)) reasons.add(reason);
    if (reasons.size) selected.push({ file, groups, reasons: [...reasons] });
  }
  return selected;
}

export function namedSpecs(names, files) {
  const available = Object.keys(files).filter(file => browserSpec.test(file));
  const selected = new Map();
  for (const name of names) {
    const normalized = name.replace(/^\.\//, "");
    const matches = available.filter(file => file === normalized || posix.basename(file) === normalized);
    if (matches.length !== 1) throw new Error(`${matches.length ? "ambiguous" : "unknown"} spec: ${name}`);
    const file = matches[0];
    selected.set(file, { file, groups: specGroups(file, files[file]), reasons: ["named spec"] });
  }
  return [...selected.values()].sort((a, b) => a.file.localeCompare(b.file));
}

export const SHARD_MIN_SPECS = 40;

/** Greedy largest-first partitioning, with stable ties independent of input order. */
export function planShards(files, count, weights = {}) {
  if (!Number.isInteger(count) || count < 1) throw new Error("shard count must be a positive integer");
  const shards = Array.from({ length: Math.min(count, files.length) }, () => ({ files: [], weight: 0 }));
  const weight = file => Math.max(1, weights[file] ?? 1);
  const ordered = [...files].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b));
  for (const file of ordered) {
    const lightest = shards.reduce((best, shard) => shard.weight < best.weight ? shard : best);
    lightest.files.push(file);
    lightest.weight += weight(file);
  }
  return shards.map(shard => shard.files.sort());
}

/** Return the concurrency and its diagnostic caps without reading the host. */
export function shardCount({ requested, free = 0, memoryKb = 0, minMemoryKb = 4194304, load = 0, maxLoad = 1, files }) {
  if (requested !== undefined && !/^[1-9][0-9]*$/.test(String(requested))) throw new Error(`Invalid ASE_SPEC_SHARDS: ${requested}`);
  const memoryCap = minMemoryKb === 0 ? Infinity : Math.floor(memoryKb / minMemoryKb);
  const loadCap = Math.floor(maxLoad - load);
  // Convert only after validating decimal text: even enormous overrides cap at files.
  const count = Math.min(files, requested === undefined ? Math.max(1, Math.min(4, free, memoryCap, loadCap)) : Number(requested));
  return { count, free, memoryCap, loadCap };
}

export function routeSpecs(specs, available = specs, { shards = 1, texts = {} } = {}) {
  const runs = [];
  for (const group of ["default", "actual", "native-static", "native-preview"]) {
    const selected = specs.filter(spec => spec.groups.includes(group));
    if (!selected.length) continue;
    const project = group === "native-preview" ? group : "native-save";
    if (["default", "native-preview"].includes(group)) {
      const files = selected.map(spec => spec.file);
      const weights = Object.fromEntries(files.map(file => [file, Math.max(1, (texts[file] ?? "").match(/\btest(?:\.(?:only|skip|fixme|fail))?\s*\(/g)?.length ?? 0)]));
      const batches = group === "default" && files.length >= SHARD_MIN_SPECS ? planShards(files, shards, weights) : [files];
      for (const files of batches) runs.push({ group, project, files, command: ["npx", "playwright", "test", `--project=${project}`, "--workers=1", ...files] });
    } else for (const spec of selected) {
      const name = posix.basename(spec.file);
      if (available.filter(other => other.file.startsWith("tests/native-save/") && other.groups.includes(group) && posix.basename(other.file).includes(name)).length !== 1) throw new Error(`ambiguous --spec filter: ${name}`);
      runs.push({ group, project, files: [spec.file], command: ["node", "--import", "tsx", "scripts/native-browser-tests.mjs", group, "--port", "$ASE_TEST_PORT", "--workers=1", "--spec", name] });
    }
  }
  return runs;
}

export function selectionLine(spec) {
  const extra = spec.reasons.length - 3;
  const counts = REASON_KINDS.map(kind => [kind, spec.reasons.filter(reason => reason.startsWith(`${kind}:`)).length])
    .filter(([, count]) => count).map(([kind, count]) => `${kind} ${count}`);
  return `${spec.file} [${spec.groups.join(", ")}] — ${spec.reasons.slice(0, 3).join("; ")}${extra > 0 ? ` (+${extra} more)` : ""}${counts.length ? ` [${counts.join(", ")}]` : ""}`;
}

const firstLine = value => String(value ?? "").replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/).find(line => line.trim())?.trim();

/** Reduce a Playwright report to one outcome per requested spec. */
export function summarizeRun(run, report, { entries = [], log = "", exitCode = 0 } = {}) {
  const fallback = log.split(/\r?\n/).map(line => firstLine(line)).filter(Boolean).at(-1) || "No test results recorded";
  const outcomes = run.files.map(file => ({ file, passed: 0, skipped: 0, results: 0, failures: [] }));
  const fail = (outcome, title, error, known) => outcome.failures.push({ title, error, known });
  const visit = (suite, inherited) => {
    const suiteFile = suite.file ?? inherited;
    for (const spec of suite.specs ?? []) {
      const file = (spec.file ?? suiteFile ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
      const outcome = outcomes.find(outcome => file === outcome.file || file.endsWith(`/${outcome.file}`) || outcome.file === `tests/${file}`);
      if (!outcome) continue;
      for (const test of spec.tests ?? []) {
        if (!test.results?.length) continue;
        outcome.results += test.results.length;
        if (test.status === "skipped") outcome.skipped++;
        else if (["expected", "flaky"].includes(test.status)) outcome.passed++;
        else {
          const attempt = test.results.find(result => result.status !== test.expectedStatus && result.status !== "skipped") ?? test.results[0];
          const error = attempt.errors?.[0] ?? attempt.error;
          fail(outcome, spec.title, firstLine(error?.message ?? error?.value) || fallback, knownFailure({ ...spec, file }, entries));
        }
      }
    }
    for (const child of suite.suites ?? []) visit(child, suiteFile);
  };
  if (Array.isArray(report?.suites)) for (const suite of report.suites) visit(suite);
  const globalError = report?.errors?.[0];
  const anyFailed = outcomes.some(outcome => outcome.failures.length);
  for (const outcome of outcomes) {
    if (!outcome.results || globalError || (exitCode !== 0 && !anyFailed)) fail(outcome, "run failed", firstLine(globalError?.message) || fallback);
  }
  return outcomes;
}

export function combineOutcomes(specs, outcomes) {
  return specs.map(spec => {
    const rows = outcomes.filter(outcome => outcome.file === spec.file);
    const failures = rows.flatMap(row => row.failures);
    const passed = rows.reduce((sum, row) => sum + row.passed, 0), skipped = rows.reduce((sum, row) => sum + row.skipped, 0);
    const known = failures.length > 0 && failures.every(failure => failure.known);
    const first = failures[0];
    const label = first?.known ? ` [${first.known.status === "flaky" ? "known flaky" : "known failing on dev"}]` : "";
    return { file: spec.file, failed: failures.length > 0, known, line: first
      ? `✗ ${spec.file}: ${first.title} — ${first.error}${label}`
      : `✓ ${spec.file} (${passed} passed${skipped ? `, ${skipped} skipped` : ""})` };
  });
}
