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
  // A stand-in registry, so the live known-failures.json can shrink to nothing.
  const scratch = mkdtempSync(join(tmpdir(), "ase-summary-"));
  try {
    const registry = join(scratch, "known-failures.json");
    writeFileSync(registry, JSON.stringify([
      { spec: "native-save/selector.spec.ts", title: "loads on demand", status: "flaky", since: "2026-01-01", note: "stand-in" },
      { spec: "native-save/compact.spec.ts", line: 302, status: "failing-on-dev", since: "2026-01-01", note: "stand-in" },
    ]));
    const env = { ...process.env, ASE_KNOWN_FAILURES: registry };
    const report = join(scratch, "results.json");
    writeFileSync(report, JSON.stringify({ suites: [{ title: "suite", file: "native-save/selector.spec.ts", specs: [
      { title: "loads on demand", file: "unknown.spec.ts", line: 1, tests: [{ status: "unexpected" }] },
      { title: "loads on demand", line: 999, tests: [{ status: "unexpected", results: [{ status: "failed", error: { message: "first error\nnext line" } }] }] },
      { title: "variant", file: "native-save/compact.spec.ts", line: 302, tests: [{ status: "unexpected" }] },
      { title: "retried", tests: [{ status: "flaky" }] },
    ] }] }));
    const result = spawnSync(process.execPath, ["scripts/agents/suite-summary.mjs", report], { encoding: "utf8", env });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /failed: 3, skipped: 0, flaky: 1/);
    assert.match(result.stdout, /known flaky: 1, known failing on dev: 1/);
    assert.match(result.stdout, /\[known flaky\]\n  first error/);
    assert.match(result.stdout, /\[known failing on dev\]/);
    assert.doesNotMatch(result.stdout, /next line/);
    assert.equal(spawnSync(process.execPath, ["scripts/agents/suite-summary.mjs"], { encoding: "utf8", env }).status, 2);
    assert.equal(spawnSync(process.execPath, ["scripts/agents/suite-summary.mjs", join(scratch, "missing.json")], { encoding: "utf8", env }).status, 1);
    // Without the override the live registry is read; a failure no entry names stays unlabelled.
    const live = { ...process.env };
    delete live.ASE_KNOWN_FAILURES;
    const unknownReport = join(scratch, "unknown.json");
    writeFileSync(unknownReport, JSON.stringify({ suites: [{ title: "suite", file: "native-save/zz-stand-in.spec.ts", specs: [{ title: "stand-in", line: 1, tests: [{ status: "unexpected" }] }] }] }));
    const plain = spawnSync(process.execPath, ["scripts/agents/suite-summary.mjs", unknownReport], { encoding: "utf8", env: live });
    assert.equal(plain.status, 1);
    assert.match(plain.stdout, /zz-stand-in\.spec\.ts:1 .*stand-in\n/);
    assert.match(plain.stdout, /known flaky: 0, known failing on dev: 0/);
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
