import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
// @ts-expect-error The script is plain JavaScript without declarations.
import { knownFailure } from "../scripts/agents/suite-summary.mjs";

const entries = [
  { spec: "native-save/a.spec.ts", title: "moved test", line: 10, status: "flaky" },
  { spec: "native-save/b.spec.ts", line: 20, status: "failing-on-dev" },
  { spec: "native-save/c.spec.ts", status: "flaky" },
];

test("known failures match report paths, exact titles, line families and spec-wide entries", () => {
  for (const file of ["native-save/a.spec.ts", "tests/native-save/a.spec.ts", "/repo/tests/native-save/a.spec.ts", "C:\\repo\\tests\\native-save\\a.spec.ts", "a.spec.ts"]) {
    assert.equal(knownFailure({ file, title: "moved test", line: 99 }, entries), entries[0]);
  }
  assert.equal(knownFailure({ file: "native-save/a.spec.ts", title: "unrelated test", line: 10 }, entries), undefined);
  assert.equal(knownFailure({ file: "other/a.spec.ts", title: "moved test", line: 10 }, entries), undefined);
  assert.equal(knownFailure({ file: "native-save/b.spec.ts", line: 20 }, entries), entries[1]);
  assert.equal(knownFailure({ file: "native-save/b.spec.ts", line: 21 }, entries), undefined);
  assert.equal(knownFailure({ file: "native-save/c.spec.ts", title: "any test", line: 33 }, entries), entries[2]);
  assert.equal(knownFailure({ file: "native-save/unknown.spec.ts", line: 20 }, entries), undefined);
});

test("summary marks known failures separately and still exits 1 for mixed failing reports", () => {
  const scratch = mkdtempSync(join(tmpdir(), "ase-summary-"));
  try {
    const report = join(scratch, "results.json");
    writeFileSync(report, JSON.stringify({ suites: [{ title: "suite", file: "native-save/native-selector.spec.ts", specs: [
      { title: entries[0].title, file: "unknown.spec.ts", line: 1, tests: [{ status: "unexpected" }] },
      { title: "component CSS loads on demand, scopes to matching shadow root, and edits live", line: 999, tests: [{ status: "unexpected", results: [{ status: "failed", error: { message: "first error\nnext line" } }] }] },
      { title: "variant", file: "native-save/native-structure-compact.spec.ts", line: 301, tests: [{ status: "unexpected" }] },
      { title: "retried", tests: [{ status: "flaky" }] },
    ] }] }));
    const result = spawnSync(process.execPath, ["scripts/agents/suite-summary.mjs", report], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /failed: 3, skipped: 0, flaky: 1/);
    assert.match(result.stdout, /known flaky: 1, known failing on dev: 1/);
    assert.match(result.stdout, /\[known flaky\]\n  first error/);
    assert.match(result.stdout, /\[known failing on dev\]/);
    assert.doesNotMatch(result.stdout, /next line/);
    assert.equal(spawnSync(process.execPath, ["scripts/agents/suite-summary.mjs"], { encoding: "utf8" }).status, 2);
    assert.equal(spawnSync(process.execPath, ["scripts/agents/suite-summary.mjs", join(scratch, "missing.json")], { encoding: "utf8" }).status, 1);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("registry entries name current tests and existing tickets", () => {
  const registry = JSON.parse(readFileSync("tests/known-failures.json", "utf8"));
  for (const entry of registry) {
    const source = readFileSync(`tests/${entry.spec}`, "utf8");
    if (entry.line) assert.match(source.split("\n")[entry.line - 1], /test\(/);
    if (entry.title) assert.ok(source.includes(entry.title));
    assert.ok(["flaky", "failing-on-dev"].includes(entry.status));
    assert.match(entry.since, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.note);
    if (entry.ticket) assert.ok(readFileSync(entry.ticket, "utf8"));
  }
});
