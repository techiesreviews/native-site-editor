import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(ASE_NATIVE_SAVE_FIXTURE|ASE_NATIVE_SAVE_FIXTURE_KIND|STATIC_SECTIONS_FIXTURE|ASE_NATIVE_STARTER_SOURCE|ASE_TEST_PORT)$/.test(key)));
function launch(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/native-browser-tests.mjs", ...args], { env: { ...clean, ...env }, encoding: "utf8" });
  return { status: result.status, out: result.stdout, err: result.stderr, files: result.stdout.split("\n").filter(line => line.endsWith(".spec.ts")) };
}
const nativeHosts = [
  "native-master-after-done-proof.spec.ts", "native-master-assets-host.spec.ts", "native-master-code-collapse.spec.ts",
  "native-master-controls.spec.ts", "native-master-host.spec.ts", "native-master-visual-host.spec.ts",
  "native-shared-authoring-host.spec.ts", "native-static-grid-collection-host.spec.ts",
  // Supported future native-only hosts count once their spec lands.
  ...["native-shared-link-host.spec.ts", "native-shared-files-lifecycle.spec.ts"].filter(name => existsSync(`tests/native-save/${name}`)),
];

test("native-static selects every native-only host plus the dual sections host", () => {
  const { status, files, out } = launch(["native-static", "--check"]);
  assert.equal(status, 0);
  assert.match(out, /^Fixture: native-static /);
  assert.deepEqual(files, [...nativeHosts, "native-static-sections-host.spec.ts", "native-static-starter-create.spec.ts"].sort());
  for (const spec of ["native-shared-authoring-host.spec.ts", "native-static-grid-collection-host.spec.ts", "native-master-visual-host.spec.ts", ...nativeHosts.filter(name => name.startsWith("native-shared-") && !name.includes("authoring"))]) {
    const one = launch(["native-static", "--check", "--spec", spec]);
    assert.equal(one.status, 0, one.err);
    assert.deepEqual(one.files, [spec]);
    assert.match(one.out, /native-static-preview/);
  }
});

test("default excludes native-only hosts and actual-only specs but keeps universal native specs", () => {
  const { status, files, out } = launch(["default", "--check"]);
  assert.equal(status, 0);
  assert.match(out, /^Fixture: default /);
  for (const spec of [...nativeHosts, "native-static-starter-create.spec.ts", "native-static-sections-host.spec.ts", "native-editor-json.spec.ts"]) assert.ok(!files.includes(spec), spec);
  assert.ok(files.includes("native-master-preview-locator.spec.ts"));
});

test("actual selection is unchanged", () => {
  const { status, files } = launch(["actual", "--check"]);
  assert.equal(status, 0);
  assert.ok(files.includes("native-static-sections-host.spec.ts") && files.includes("native-editor-json.spec.ts"));
  for (const spec of nativeHosts) assert.ok(!files.includes(spec), spec);
});

test("creation alone keeps the demo-account default fixture", () => {
  const { status, files, out } = launch(["native-static", "--check", "--spec", "starter-create"]);
  assert.equal(status, 0);
  assert.deepEqual(files, ["native-static-starter-create.spec.ts"]);
  assert.match(out, /^Fixture: native-static \(.*fixtures\/native-starter\)/);
});

test("conflicting, unknown and mismatched fixture identities still refuse", () => {
  assert.match(launch(["default", "--check"], { ASE_NATIVE_SAVE_FIXTURE: "fixtures/actual-starter" }).err, /does not match/);
  assert.match(launch(["native-static", "--check"], { STATIC_SECTIONS_FIXTURE: "other" }).err, /only accepts native/);
  assert.match(launch(["default", "--check"], { ASE_NATIVE_SAVE_FIXTURE: "/tmp/no-such-fixture" }).err, /Unknown fixture/);
  assert.match(launch(["actual", "--check"], { ASE_NATIVE_SAVE_FIXTURE_KIND: "native-static" }).err, /identity mismatch/);
  assert.match(launch(["native-static", "--check"], { ASE_NATIVE_STARTER_SOURCE: "other" }).err, /require ASE_NATIVE_STARTER_SOURCE/);
  assert.match(launch(["bogus", "--check"]).err, /Choose default/);
  for (const result of [launch(["default", "--check"], { ASE_NATIVE_SAVE_FIXTURE: "fixtures/actual-starter" }), launch(["bogus"])]) assert.equal(result.status, 1);
});
