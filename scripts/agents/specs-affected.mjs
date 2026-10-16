import { posix } from "node:path";
import { knownFailure } from "./suite-summary.mjs";

const browserSpec = /^tests\/(native-save|native-preview)\/[^/]+\.spec\.ts$/;
const graphFile = /^(tests|src|scripts)\//;
// Quote and apostrophe strings end at the line, so an apostrophe in a comment cannot swallow later lines.
const quoted = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g;

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
  if (!specifier.startsWith(".")) return undefined;
  const target = posix.normalize(posix.join(posix.dirname(file), specifier));
  const stems = [target, ...(target.endsWith(".js") ? [target.slice(0, -3)] : [])];
  const candidates = stems.flatMap(stem => [stem, ...[".ts", ".tsx", ".js", ".mjs"].map(ext => stem + ext), ...[".ts", ".tsx", ".js", ".mjs"].map(ext => `${stem}/index${ext}`)]);
  return candidates.find(candidate => graphFile.test(candidate) && files.has(candidate));
}

function literals(text) {
  return [...text.matchAll(quoted)].map(match => match[0].slice(1, -1));
}

function visible(text) {
  return text.length >= 3 && /\p{L}/u.test(text) && (/^\p{Lu}/u.test(text) || text.includes(" "))
    && !/[/\\{}=]/.test(text) && !/^(?:[.#]|\[)/.test(text) && !text.includes("${");
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
      const modules = new Set(importsOf(line));
      const attributes = [...line.matchAll(/(?:aria-label|title|placeholder)=["']([^"']+)["']/g)].map(match => match[1]);
      const text = [...line.matchAll(/>([^<>]+)</g)].map(match => match[1].trim());
      for (const value of [...literals(line), ...attributes, ...text]) {
        if (visible(value) && !modules.has(value)) candidates.add(value);
      }
    }
    for (const value of candidates) if (!added.some(line => line.includes(value))) result.push({ file, value });
  }
  return result;
}

/** Select from a snapshot of repository paths and text; no filesystem or git reads. */
export function selectAffected({ files, changed, diff = "" }) {
  const changedFiles = [...new Set(changed)].sort();
  const paths = new Set([...Object.keys(files), ...changedFiles]);
  const graph = new Map(Object.entries(files).filter(([file]) => graphFile.test(file)).map(([file, text]) =>
    [file, importsOf(text).map(value => resolveImport(file, value, paths)).filter(Boolean)]));
  const removed = removedStrings(diff);
  const selected = [];
  for (const file of Object.keys(files).filter(file => browserSpec.test(file)).sort()) {
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
      if (file.startsWith("tests/native-save/") && ["scripts/native-browser-tests.mjs", "tests/native-save/fixture-contract.ts"].includes(change)) reasons.add(`fixture: all native-save (${change})`);
      if (change.startsWith("fixtures/actual-starter/") && groups.includes("actual")) reasons.add(`fixture: actual (${change})`);
      else if (change.startsWith("fixtures/native-starter/") && groups.includes("default")) reasons.add(`fixture: default (${change})`);
      else {
        const fixture = /^fixtures\/([^/]+)\//.exec(change)?.[1];
        if (fixture && !["actual-starter", "native-starter"].includes(fixture) && text.includes(`fixtures/${fixture}`)) reasons.add(`fixture: ${fixture} (${change})`);
      }
    }
    const strings = literals(text);
    for (const { file: source, value } of removed) if (strings.some(string => string.includes(value))) reasons.add(`removed string: ${JSON.stringify(value)} (${source})`);
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

export function routeSpecs(specs, available = specs) {
  const runs = [];
  for (const group of ["default", "actual", "native-static", "native-preview"]) {
    const selected = specs.filter(spec => spec.groups.includes(group));
    if (!selected.length) continue;
    const project = group === "native-preview" ? group : "native-save";
    if (["default", "native-preview"].includes(group)) {
      runs.push({ group, project, files: selected.map(spec => spec.file), command: ["npx", "playwright", "test", `--project=${project}`, "--workers=1", ...selected.map(spec => spec.file)] });
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
  return `${spec.file} [${spec.groups.join(", ")}] — ${spec.reasons.slice(0, 3).join("; ")}${extra > 0 ? ` (+${extra} more)` : ""}`;
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
