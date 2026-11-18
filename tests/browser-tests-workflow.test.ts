// The full browser suite (browser-tests.yml) also runs on dev, not only on
// main's nightly schedule, and every run lists its failures on the run page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/browser-tests.yml", "utf8");
const triggers = workflow.match(/^on:\n((?: {2}.*\n|\s*\n)+)/m)?.[1] ?? "";

test("the full suite runs on every push to dev, besides the schedule and Run workflow", () => {
  assert.match(triggers, /^ {2}push:\n {4}branches: \[dev\]$/m);
  assert.match(triggers, /^ {2}schedule:$/m);
  assert.match(triggers, /^ {2}workflow_dispatch:$/m);
});

test("a newer push to dev never cancels the dev run in progress", () => {
  assert.match(workflow, /^ {2}cancel-in-progress: \$\{\{ github\.event_name != 'push' \}\}$/m);
});

test("the report job lists every failure, known flaky ones labeled, in the run summary", () => {
  const report = workflow.slice(workflow.indexOf("\n  report:\n"));
  assert.match(report, /merge-reports --reporter=json \.\/all-blob-reports > results\.json/);
  assert.match(report, /node scripts\/agents\/suite-summary\.mjs results\.json[^\n]*\n[\s\S]*>> "\$GITHUB_STEP_SUMMARY"/);
});
