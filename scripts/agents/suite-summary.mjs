#!/usr/bin/env node
// Usage: [ASE_KNOWN_FAILURES=<registry.json>] suite-summary.mjs <results.json> [...]; merge Playwright shard reports.
import { readFileSync } from "node:fs";

// Titles take precedence over line numbers so moved tests still match, while an
// unrelated test at the old line does not. A spec-only entry covers the file.
export function knownFailure(spec, entries) {
  const normalize = (file) => (file ?? "").replaceAll("\\", "/").replace(/^\.\//, "").replace(/^tests\//, "");
  const file = normalize(spec.file);
  return entries.find((entry) => {
    const known = normalize(entry.spec);
    const sameFile = file === known || file.endsWith(`/${known}`) || (!file.includes("/") && file === known.split("/").at(-1));
    return sameFile && (entry.title !== undefined ? spec.title === entry.title : entry.line === undefined || spec.line === entry.line);
  });
}

export function main(files) {
  if (!files.length) {
    console.error("Usage: suite-summary.mjs <results.json> [...]");
    process.exit(2);
  }
  const counts = { passed: 0, failed: 0, skipped: 0, flaky: 0 };
  const knownCounts = { "known flaky": 0, "known failing on dev": 0 };
  // ASE_KNOWN_FAILURES names another registry file (tests use a stand-in).
  const registry = process.env.ASE_KNOWN_FAILURES || new URL("../../tests/known-failures.json", import.meta.url);
  const entries = JSON.parse(readFileSync(registry, "utf8"));
  let invalid = false;
  const stripAnsi = (value) => value.replace(/\x1b\[[0-9;]*m/g, "");
  function visit(suite, parents = []) {
    const titles = [...parents, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const status = { expected: "passed", unexpected: "failed", skipped: "skipped", flaky: "flaky" }[test.status];
        if (!status) throw new Error(`Unknown test status: ${test.status}`);
        counts[status]++;
        if (status !== "failed") continue;
        const known = knownFailure({ ...spec, file: spec.file ?? suite.file }, entries);
        const label = known ? (known.status === "flaky" ? "known flaky" : "known failing on dev") : undefined;
        if (label) knownCounts[label]++;
        const result = test.results?.find((attempt) => attempt.status !== test.expectedStatus && attempt.status !== "skipped");
        const error = result?.errors?.[0] ?? result?.error;
        const first = stripAnsi(error?.message ?? error?.value ?? "No error recorded").split(/\r?\n/).find((line) => line.trim()) ?? "No error recorded";
        console.log(`${spec.file ?? suite.file}:${spec.line ?? 0} [${test.projectName ?? ""}] ${[...titles, spec.title].join(" > ")}${label ? ` [${label}]` : ""}\n  ${first}`);
      }
    }
    for (const child of suite.suites ?? []) visit(child, titles);
  }
  for (const file of files) {
    try {
      const report = JSON.parse(readFileSync(file, "utf8"));
      if (!Array.isArray(report.suites)) throw new Error("Missing suites array");
      for (const suite of report.suites) visit(suite);
      for (const error of report.errors ?? []) {
        invalid = true;
        console.error(`${file}: ${stripAnsi(error.message ?? String(error)).split(/\r?\n/)[0]}`);
      }
    } catch (error) {
      invalid = true;
      console.error(`${file}: ${error.message}`);
    }
  }
  console.log(Object.entries(counts).map(([name, count]) => `${name}: ${count}`).join(", "));
  console.log(Object.entries(knownCounts).map(([name, count]) => `${name}: ${count}`).join(", "));
  if (invalid || counts.failed) process.exitCode = 1;
}

if (import.meta.main) main(process.argv.slice(2));
