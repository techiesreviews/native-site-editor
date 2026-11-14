// The weekly package check (.github/workflows/package-check.yml) reports known
// problems in packages through a failing check: never an issue, never in a
// self-hosted copy of the editor, and on dev and main alike.
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

// An updated self-hosted copy holds .editor-upstream and keeps its own workflows
// (scripts/update-editor.mjs), so one made before this check has no such file.
const skip = existsSync(".editor-upstream") && "a self-hosted copy keeps its own workflows";
const workflow = skip ? "" : readFileSync(".github/workflows/package-check.yml", "utf8");

test("the package check runs weekly, by hand, and on pull requests that change packages", { skip }, () => {
  assert.match(workflow, /schedule:\n\s+- cron: "\d+ \d+ \* \* \d"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:[\s\S]*paths:[\s\S]*package-lock\.json/);
});

test("a weekly run audits both dev and main", { skip }, () => {
  assert.match(workflow, /github\.event_name == 'schedule' && fromJSON\('\["dev","main"\]'\)/);
});

test("the check fails on a high or critical finding and reads only the lockfile", { skip }, () => {
  assert.match(workflow, /npm audit --package-lock-only --audit-level=high/);
});

test("the check runs only in the editor's own repository and can only read it", { skip }, () => {
  assert.match(workflow, /if: github\.repository == 'techiesreviews\/native-site-editor'/);
  assert.match(workflow, /permissions:\n\s+contents: read\n/);
  assert.doesNotMatch(workflow, /write-all|:\s*write\b/);
});

test("no Dependabot file: self-hosted copies take every file outside .github/workflows/ and would get its pull requests", () => {
  assert.equal(existsSync(".github/dependabot.yml"), false);
  assert.equal(existsSync(".github/dependabot.yaml"), false);
});

test("an updated self-hosted copy without the workflow skips these checks instead of failing", { skip }, () => {
  const copy = mkdtempSync(join(tmpdir(), "package-check-copy-"));
  try {
    mkdirSync(join(copy, "tests"));
    copyFileSync("tests/package-check.test.ts", join(copy, "tests/package-check.test.ts"));
    writeFileSync(join(copy, ".editor-upstream"), "0".repeat(40) + "\n");
    const { NODE_TEST_CONTEXT: _parent, ...env } = process.env;
    const run = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), "--test", "--test-reporter=tap", "tests/package-check.test.ts"], { cwd: copy, env, encoding: "utf8" });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /# fail 0/);
    assert.match(run.stdout, /# skipped [1-9]/);
  } finally { rmSync(copy, { recursive: true, force: true }); }
});
