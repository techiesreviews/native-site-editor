// The weekly package check (.github/workflows/package-check.yml) reports known
// problems in packages through a failing check: never an issue, never in a
// self-hosted copy of the editor, and on dev and main alike.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/package-check.yml", "utf8");

test("the package check runs weekly, by hand, and on pull requests that change packages", () => {
  assert.match(workflow, /schedule:\n\s+- cron: "\d+ \d+ \* \* \d"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:[\s\S]*paths:[\s\S]*package-lock\.json/);
});

test("a weekly run audits both dev and main", () => {
  assert.match(workflow, /github\.event_name == 'schedule' && fromJSON\('\["dev","main"\]'\)/);
});

test("the check fails on a high or critical finding and reads only the lockfile", () => {
  assert.match(workflow, /npm audit --package-lock-only --audit-level=high/);
});

test("the check runs only in the editor's own repository and can only read it", () => {
  assert.match(workflow, /if: github\.repository == 'techiesreviews\/native-site-editor'/);
  assert.match(workflow, /permissions:\n\s+contents: read\n/);
  assert.doesNotMatch(workflow, /write-all|:\s*write\b/);
});

test("no Dependabot file: self-hosted copies take every file outside .github/workflows/ and would get its pull requests", () => {
  assert.equal(existsSync(".github/dependabot.yml"), false);
  assert.equal(existsSync(".github/dependabot.yaml"), false);
});
