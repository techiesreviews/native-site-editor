import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { combineOutcomes, importsOf, namedSpecs, removedStrings, routeSpecs, selectAffected, selectionLine, specGroups, summarizeRun } from "../scripts/agents/specs-affected.mjs";

const kit = resolve("scripts/agents/kit");
const save = (name: string) => `tests/native-save/${name}.spec.ts`;
const preview = "tests/native-preview/preview.spec.ts";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "kit-specs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file: string, text: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const files: Record<string, string> = {
    "src/button.ts": 'export const label = "Image";\nexport const moved = "Still here";\n',
    "src/media.ts": 'export const media = "old";\n',
    "src/index.ts": 'export { media } from "./media.js";\n',
    "tests/native-save/helpers.ts": 'import { media } from "../../src/index.js";\n',
    [save("imports")]: 'import "./helpers";\n',
    [save("label")]: 'test("find Image settings", () => {});\n',
    [save("moved")]: 'test("Still here", () => {});\n',
    [save("actual")]: 'test("actual", { tag: "@actual" }, () => {});\n',
    [save("static")]: 'test("static", { tag: "@native-static" }, () => {});\n',
    [save("both")]: 'test("both", { tag: ["@actual", "@native-static"] }, () => {});\n',
    [save("custom")]: 'const fixture = "fixtures/custom/index.html";\n',
    [preview]: 'test("preview", () => {});\n',
    "fixtures/actual-starter/index.html": "<h1>Starter</h1>\n",
    "tests/known-failures.json": "[]",
    ".gitignore": ".scratch/\nfake-bin/\nfake-runner\nreports.json\nknown.json\n",
  };
  git("init", "--quiet", "--initial-branch=dev");
  git("config", "user.name", "Kit specs test");
  git("config", "user.email", "kit-specs@example.test");
  for (const [file, text] of Object.entries(files)) put(file, text);
  git("add", "."); git("commit", "--quiet", "-m", "base");
  const base = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/dev", base);
  git("switch", "--quiet", "-c", "feature");
  const calls = join(root, ".scratch/calls.jsonl");
  put("fake-runner", `#!${process.execPath}
const { spawnSync } = require("node:child_process");
const { appendFileSync, mkdirSync } = require("node:fs");
mkdirSync(".scratch", { recursive: true });
appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + "\\n");
const result = spawnSync(process.argv[2], process.argv.slice(3), { stdio: "inherit", env: { ...process.env, ASE_TEST_PORT: "5296", PATH: ${JSON.stringify(join(root, "fake-bin"))} + ":" + process.env.PATH } });
process.exit(result.status ?? 1);
`);
  const fakeCommand = `#!${process.execPath}
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
const project = args.includes("--project=native-preview") ? "native-preview" : "native-save";
console.log("fake browser output");
console.log("last useful failure");
if (process.env.FAKE_NO_JSON) process.exit(1);
const reports = JSON.parse(readFileSync("reports.json", "utf8"));
const report = reports[project];
mkdirSync(".scratch/" + project, { recursive: true });
writeFileSync(".scratch/" + project + "/results-" + (Number(process.env.ASE_TEST_PORT) + (project === "native-preview" ? 1 : 0)) + ".json", JSON.stringify(report));
process.exit(process.env.FAKE_EXIT ? Number(process.env.FAKE_EXIT) : 0);
`;
  put("fake-bin/npx", fakeCommand);
  put("fake-bin/node", fakeCommand);
  for (const file of ["fake-runner", "fake-bin/npx", "fake-bin/node"]) {
    const result = spawnSync("chmod", ["+x", join(root, file)]);
    assert.equal(result.status, 0);
  }
  const run = (args: string[], env: NodeJS.ProcessEnv = {}) => spawnSync(kit, ["specs", ...args], {
    cwd: root, env: { ...process.env, KIT_ROOT: root, KIT_SPECS_RUNNER: join(root, "fake-runner"), ...env }, encoding: "utf8", timeout: 15_000,
  });
  return { root, put, git, files, base, run, calls };
}

test("relative import graph follows helper, re-export and .js-to-.ts paths", t => {
  const f = fixture(t);
  const selected = selectAffected({ files: f.files, changed: ["src/media.ts"] });
  assert.deepEqual(selected.map(spec => spec.file), [save("imports")]);
  assert.deepEqual(selected[0].reasons, ["import: src/media.ts"]);
  const files = { ...f.files, "tests/native-save/helpers.ts": 'export * from "../../src/directory";', "src/directory/index.tsx": 'const a = import("../media.js"); const b = require("../cycle.mjs");', "src/cycle.mjs": 'import "./directory";' };
  assert.equal(selectAffected({ files, changed: ["src/media.ts"] })[0].file, save("imports"));
  assert.deepEqual(importsOf('import x from "./a"; export * from "./b"; import "./c"; import("./d"); require("./e")'), ["./a", "./b", "./c", "./d", "./e"]);
  assert.deepEqual(selectAffected({ files, changed: [save("imports")] })[0].reasons, [`import: ${save("imports")}`]);
});

test("removed visible strings match only quoted spec text and ignore moves and code", t => {
  const f = fixture(t);
  f.put("src/button.ts", 'export const moved = "Still here";\nexport const label = "Media";\n');
  const diff = f.git("diff", "--unified=0", f.base, "--", "src");
  assert.deepEqual(removedStrings(diff), [{ file: "src/button.ts", value: "Image" }]);
  const files = { ...f.files, [save("plain")]: "// Image\n", [save("template")]: 'test(`Image picker`, () => {});' };
  const selected = selectAffected({ files, changed: ["src/button.ts"], diff });
  assert.deepEqual(selected.map(spec => spec.file), [save("label"), save("template")]);
  assert.match(selected[0].reasons[0], /removed string: "Image" \(src\/button.ts\)/);
  const markup = `diff --git a/src/ui.ts b/src/ui.ts
--- a/src/ui.ts
+++ b/src/ui.ts
@@ -1 +1 @@
-const html = \`<button aria-label="Open media" title='More options' placeholder="Search media">Save changes</button>\`;
-import "React";
-const code = ["lowercase", "./Module", "#Selector", ".Selector", "[Selector]", "Has=value", "Has{value}", \`Hello \${name}\`];
+const html = "Replacement";
`;
  assert.deepEqual(removedStrings(markup).map(row => row.value).sort(), ["More options", "Open media", "Save changes", "Search media"]);
});

test("fixture rules match exact tags and collect every applicable reason", t => {
  const f = fixture(t);
  assert.deepEqual(specGroups(save("single"), "'@actual'"), ["default"]);
  const actual = selectAffected({ files: f.files, changed: ["fixtures/actual-starter/index.html"] });
  assert.deepEqual(actual.map(spec => spec.file), [save("actual"), save("both")]);
  const defaults = selectAffected({ files: f.files, changed: ["fixtures/native-starter/index.html"] });
  assert.ok(defaults.every(spec => spec.groups.join() === "default"));
  assert.ok(defaults.some(spec => spec.file === save("imports")));
  const all = selectAffected({ files: f.files, changed: ["tests/native-save/fixture-contract.ts", "scripts/native-browser-tests.mjs"] });
  assert.equal(all.length, 7);
  assert.ok(all.every(spec => spec.reasons.length === 2 && !spec.file.includes("native-preview")));
  assert.deepEqual(selectAffected({ files: f.files, changed: ["fixtures/custom/index.html"] }).map(spec => spec.file), [save("custom")]);
  const spec = { file: save("actual"), groups: ["actual"], reasons: ["one", "two", "three", "four", "five"] };
  assert.equal(selectionLine(spec), `${save("actual")} [actual] — one; two; three (+2 more)`);
});

test("routing batches defaults and preview, runs tagged specs individually and both tags twice", t => {
  const f = fixture(t);
  const specs = namedSpecs(["imports.spec.ts", "actual.spec.ts", "static.spec.ts", "both.spec.ts", "preview.spec.ts"], f.files);
  const runs = routeSpecs(specs);
  assert.deepEqual(runs.map(run => run.group), ["default", "actual", "actual", "native-static", "native-static", "native-preview"]);
  assert.deepEqual(runs[0].command, ["npx", "playwright", "test", "--project=native-save", "--workers=1", save("imports")]);
  assert.deepEqual(runs[1].command, ["node", "--import", "tsx", "scripts/native-browser-tests.mjs", "actual", "--port", "$ASE_TEST_PORT", "--workers=1", "--spec", "actual.spec.ts"]);
  assert.deepEqual(runs.at(-1)?.command, ["npx", "playwright", "test", "--project=native-preview", "--workers=1", preview]);
  assert.equal(runs.filter(run => run.files.includes(save("both"))).length, 2);
  assert.throws(() => routeSpecs(specs, [...specs, { file: save("prefix-actual"), groups: ["actual"] }]), /ambiguous --spec filter/);
});

test("real CLI --list includes committed, staged, unstaged and untracked changes, runs nothing", t => {
  const f = fixture(t);
  f.put("src/media.ts", 'export const media = "committed";\n');
  f.git("add", "src/media.ts"); f.git("commit", "--quiet", "-m", "change media");
  f.put(save("moved"), 'test("staged", () => {});'); f.git("add", save("moved"));
  f.put(save("custom"), 'test("staged then restored", () => {});'); f.git("add", save("custom"));
  f.put(save("custom"), f.files[save("custom")]);
  f.put("src/button.ts", 'export const label = "Media";\nexport const moved = "Still here";\n');
  f.put("fixtures/actual-starter/new.html", "new");
  f.put(save("new"), 'test("new", () => {});');
  const result = f.run(["--affected", "--base", f.base, "--list"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /imports.spec.ts \[default\] — import: src\/media.ts/);
  assert.match(result.stdout, /label.spec.ts \[default\] — removed string: "Image"/);
  assert.match(result.stdout, /actual.spec.ts \[actual\] — fixture: actual/);
  assert.match(result.stdout, /moved.spec.ts \[default\] — import: tests\/native-save\/moved.spec.ts/);
  assert.match(result.stdout, /new.spec.ts \[default\] — import:/);
  assert.match(result.stdout, /custom.spec.ts \[default\] — import: tests\/native-save\/custom.spec.ts/);
  assert.match(result.stdout, /RESULT: ok specs 7 selected \(list only\)\n$/);
  assert.equal(existsSync(f.calls), false);
  assert.equal(f.run(["--affected", "--list"]).stdout, result.stdout);
});

function reportSpec(file: string, title: string, status = "expected", results = true) {
  return { title, file, line: 10, tests: [{ status, expectedStatus: "passed", results: results ? [{ status: status === "unexpected" ? "failed" : status === "skipped" ? "skipped" : "passed", errors: status === "unexpected" ? [{ message: "\u001b[31mMissing button\u001b[0m\nmore detail" }] : [] }] : [] }] };
}

test("fake runner exercises port wrapper, reports, known failure labels and failed basename RESULT", t => {
  const f = fixture(t);
  f.put("reports.json", JSON.stringify({
    "native-save": { suites: [{ specs: [reportSpec(save("imports"), "works"), reportSpec(save("imports"), "later", "skipped"), reportSpec(save("label"), "find Image", "unexpected"), reportSpec(save("actual"), "actual fails", "unexpected")] }] },
    "native-preview": { suites: [{ specs: [reportSpec(preview, "preview")] }] },
  }));
  f.put("known.json", JSON.stringify([{ spec: "native-save/label.spec.ts", title: "find Image", status: "flaky" }, { spec: "native-save/actual.spec.ts", title: "actual fails", status: "failing" }]));
  const result = f.run(["imports.spec.ts", "label.spec.ts", "actual.spec.ts", "preview.spec.ts"], { ASE_KNOWN_FAILURES: join(f.root, "known.json"), FAKE_EXIT: "1" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /✓ tests\/native-save\/imports.spec.ts \(1 passed, 1 skipped\)/);
  assert.match(result.stdout, /✗ tests\/native-save\/label.spec.ts: find Image — Missing button \[known flaky\]/);
  assert.match(result.stdout, /✗ tests\/native-save\/actual.spec.ts: actual fails — Missing button \[known failing on dev\]/);
  // A nonzero runner with only passing preview results must still fail that spec.
  assert.match(result.stdout, /preview.spec.ts: run failed — last useful failure/);
  assert.match(result.stdout, /RESULT: fail specs 3 of 4 failed: preview.spec.ts, actual.spec.ts\(known\), label.spec.ts\(known\)\n$/);
  assert.doesNotMatch(result.stdout, /fake browser output/);
  const calls: string[][] = readFileSync(f.calls, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call[0] === "bash" && call[1] === "-c"));
  assert.ok(calls.at(-1)![2].includes("results-$((ASE_TEST_PORT + 1)).json"));
  for (const match of result.stdout.matchAll(/^log: (.+)$/gm)) assert.ok(readFileSync(match[1], "utf8").includes("fake browser output"));
  const knownOnly = f.run(["label.spec.ts"], { ASE_KNOWN_FAILURES: join(f.root, "known.json") });
  assert.equal(knownOnly.status, 1);
  assert.match(knownOnly.stdout, /RESULT: fail specs 1 of 1 failed: label.spec.ts\(known\)/);
  const pass = f.run(["imports.spec.ts", "preview.spec.ts"]);
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /✓ tests\/native-preview\/preview.spec.ts \(1 passed\)/);
  assert.match(pass.stdout, /RESULT: ok specs 2\/2 passed\n$/);
});

test("missing, malformed and zero-result reports fail; stale port reports are not reused", t => {
  const f = fixture(t);
  f.put("reports.json", JSON.stringify({ "native-save": { suites: [{ specs: [reportSpec(save("imports"), "pass")] }] } }));
  assert.equal(f.run(["imports.spec.ts"]).status, 0);
  const missing = f.run(["imports.spec.ts"], { FAKE_NO_JSON: "1" });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /✗ .*imports.spec.ts: run failed — last useful failure/);
  for (const report of [null, {}, { suites: [{ specs: [reportSpec(save("imports"), "none", "expected", false)] }] }, { suites: [], errors: [{ message: "Server died" }] }]) {
    const outcome = summarizeRun({ files: [save("imports")] }, report, { log: "last useful failure" });
    assert.equal(outcome[0].failures.length, 1);
  }
  const runs = [
    ...summarizeRun({ files: [save("both")] }, { suites: [{ specs: [reportSpec(save("both"), "first")] }] }),
    ...summarizeRun({ files: [save("both")] }, { suites: [{ specs: [reportSpec(save("both"), "second", "unexpected")] }] }),
  ];
  assert.equal(combineOutcomes([{ file: save("both") }], runs)[0].failed, true);
});

test("help, empty selection and usage errors return without starting the runner", t => {
  const f = fixture(t);
  const help = f.run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /KIT_SPECS_RUNNER/);
  assert.doesNotMatch(help.stdout, /RESULT:/);
  const empty = f.run(["--affected", "--list"]);
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /RESULT: ok specs none affected\n$/);
  for (const args of [[], ["unknown"], ["--wat"], ["--base"], ["--base", "HEAD"], ["--affected", "imports.spec.ts"], ["--affected", "--base", "not-a-ref"], ["--affected", "--list", "--list"], ["--affected", "--base", "HEAD", "--base", "HEAD"]]) {
    const result = f.run(args);
    assert.equal(result.status, 2, `${args.join(" ")}\n${result.stderr}`);
    assert.equal(result.stdout.trim().split("\n").filter(line => line.startsWith("RESULT:")).length, 1);
    assert.match(result.stdout, /RESULT: fail specs .+\n$/);
  }
  f.put("tests/native-preview/imports.spec.ts", "test('duplicate', () => {});");
  assert.equal(f.run(["imports.spec.ts", "--list"]).status, 2);
  assert.equal(f.run([save("imports"), "--list"]).status, 0);
  assert.equal(existsSync(f.calls), false);
});
