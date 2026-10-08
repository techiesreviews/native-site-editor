#!/usr/bin/env node
// Usage: suite-summary.mjs <results.json> [...]; merge Playwright shard reports.
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: suite-summary.mjs <results.json> [...]");
  process.exit(2);
}
const counts = { passed: 0, failed: 0, skipped: 0, flaky: 0 };
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
      const result = test.results?.find((attempt) => attempt.status !== test.expectedStatus && attempt.status !== "skipped");
      const error = result?.errors?.[0] ?? result?.error;
      const first = stripAnsi(error?.message ?? error?.value ?? "No error recorded").split(/\r?\n/).find((line) => line.trim()) ?? "No error recorded";
      console.log(`${spec.file ?? suite.file}:${spec.line ?? 0} [${test.projectName ?? ""}] ${[...titles, spec.title].join(" > ")}\n  ${first}`);
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
if (invalid || counts.failed) process.exitCode = 1;
