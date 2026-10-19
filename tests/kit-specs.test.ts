import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { combineOutcomes, importsOf, namedSpecs, planShards, removedStrings, routeSpecs, selectAffected, selectionLine, SHARD_MIN_SPECS, shardCount, specGroups, summarizeRun } from "../scripts/agents/specs-affected.mjs";
import { specsDigest } from "../scripts/agents/specs-digest.mjs";

const kit = resolve("scripts/agents/kit");
const save = (name: string) => `tests/native-save/${name}.spec.ts`;
const preview = "tests/native-preview/preview.spec.ts";

const digestFixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/specs-digest/${name}.json`, import.meta.url), "utf8"));
const digestRun = (name: string) => ({ report: digestFixture(name), logPath: "/logs/default.log" });

test("digest shows text assertions, expected/received, app frame and attachment paths within ten lines", () => {
  const digest = specsDigest([digestRun("assertion")]);
  assert.equal(digest, [
    "tests/native-save/label.spec.ts:42 Editor > toolbar > shows the saved title",
    "  Error: expect(locator).toHaveText(expected) failed",
    "  Locator: getByRole('heading')",
    '  Expected string: "Saved"',
    '  expected: "Saved"',
    '  received: "Draft"',
    "  at /repo/tests/native-save/label.spec.ts:45:7",
    "  log: /logs/default.log",
    "  context: /artifacts/error-context.md",
    "  trace: /artifacts/trace.zip",
  ].join("\n"));
  assert.doesNotMatch(digest, /\x1b|Call log|DO NOT PRINT|extra-trace|screen\.png|\[native-save\]/);
});

test("timeout digest keeps three message lines without inventing values, frames or attachments", () => {
  const digest = specsDigest([digestRun("timeout")]);
  assert.match(digest, /^tests\/native-save\/label.spec.ts:18 \[firefox\] waits for the toolbar\n/);
  assert.match(digest, /Test timeout of 30000ms exceeded\.\n  Waiting for toolbar\n  Still waiting\n  log:/);
  assert.doesNotMatch(digest, /expected:|received:|Hidden fourth|context:|trace:|\bat /);
});

test("thrown error skips dependency, Playwright and node frames for the first app frame", () => {
  const digest = specsDigest([digestRun("thrown")]);
  assert.match(digest, /TypeError: Cannot read properties of undefined/);
  assert.match(digest, /at openEditor \(\/repo\/src\/editor.ts:21:9\)/);
  assert.doesNotMatch(digest, /node_modules|runner.js|node:|label.spec.ts:72/);
});

test("retried flaky tests, expected failures and skipped tests have no digest", () => {
  assert.equal(specsDigest([digestRun("flaky")]), "");
  assert.equal(specsDigest([{ report: undefined, logPath: "/logs/missing.log" }]), "");
});

test("digest retains known flaky and known failing labels using the inherited spec file", () => {
  for (const [status, label] of [["flaky", "known flaky"], ["failing", "known failing on dev"]]) {
    const digest = specsDigest([digestRun("assertion")], { entries: [{ spec: "native-save/label.spec.ts", title: "shows the saved title", status }] });
    assert.ok(digest.split("\n")[0].endsWith(` [${label}]`));
  }
});

test("expected and received values are cut to 160 characters everywhere in the digest", () => {
  const report = digestFixture("assertion");
  const expected = "x".repeat(10_000), received = "y".repeat(10_000);
  report.suites[0].suites[0].specs[0].tests[0].results[0].errors[0].message = `Error: toHaveText failed\nExpected: ${expected}\nReceived string: ${received}`;
  const digest = specsDigest([{ report, logPath: "/logs/long.log" }]);
  assert.deepEqual(digest.split("\n").slice(1, 4), [
    "  Error: toHaveText failed",
    `  Expected: ${"x".repeat(159)}…`,
    `  Received string: ${"y".repeat(159)}…`,
  ]);
  const values = [...digest.matchAll(/^\s*(?:expected|received)(?: (?:string|pattern|substring))?:\s*(.*)$/gim)];
  assert.equal(values.length, 4);
  for (const match of values) assert.ok(match[1].length <= 160);
  assert.ok(!digest.includes(expected));
  assert.ok(!digest.includes(received));
  for (const [label, value] of [["expected", "x"], ["received", "y"]]) {
    const line = digest.split("\n").find(line => line.startsWith(`  ${label}: `));
    assert.equal(line, `  ${label}: ${value.repeat(159)}…`);
  }
});

// Messages captured from the installed @playwright/test matchers, without ANSI styling.
for (const [fixture, matcher, expected, received] of [
  ["to-contain", "toContain", '"Saved"', '["Draft"]'],
  ["to-have-length", "toHaveLength", "3", "2"],
]) {
  test(`${matcher} digest extracts expected and received from Playwright's typed labels`, () => {
    const digest = specsDigest([digestRun(fixture)]);
    assert.ok(digest.includes(`.${matcher}(expected)`));
    assert.ok(digest.includes(`\n  expected: ${expected}\n  received: ${received}\n`));
  });
}

test("toContain values are capped everywhere, including value and array labels in the excerpt", () => {
  const expected = "x".repeat(10_000), received = "y".repeat(10_000);
  for (const compact of [false, true]) {
    const report = digestFixture("to-contain");
    const error = report.suites[0].specs[0].tests[0].results[0].errors[0];
    error.message = error.message.replace('"Saved"', JSON.stringify(expected)).replace('"Draft"', JSON.stringify(received));
    // Also put both typed labels in the excerpt, where both values must be bounded.
    if (compact) error.message = error.message.replace("\n\n", "\n");
    const digest = specsDigest([{ report, logPath: "/logs/contain.log" }]);
    const values = [...digest.matchAll(/^\s*(?:expected|received)(?: [^:\r\n]+)?:\s*(.*)$/gim)];
    assert.equal(values.length, compact ? 4 : 3);
    for (const match of values) assert.equal(match[1].length, 160);
    const shownExpected = `"${"x".repeat(158)}…`, shownReceived = `["${"y".repeat(157)}…`;
    assert.ok(digest.includes(`\n  expected: ${shownExpected}\n  received: ${shownReceived}\n`));
    if (compact) assert.deepEqual(digest.split("\n").slice(2, 4), [
      `  Expected value: ${shownExpected}`,
      `  Received array: ${shownReceived}`,
    ]);
    assert.ok(!digest.includes(expected));
    assert.ok(!digest.includes(received));
    assert.ok(digest.split("\n").length <= 10);
  }
});

for (const [fixture, expected, received] of [
  ["to-have-property", "3", "2"],
  ["to-have-property-object", '"value": 3,', '"value": 2,'],
]) {
  test(`${fixture} digest selects assertion values before property path metadata`, () => {
    const digest = specsDigest([digestRun(fixture)]);
    assert.ok(digest.includes(".toHaveProperty(path, value)"));
    assert.ok(digest.includes('  Expected path: "a"'));
    assert.ok(digest.includes(`\n  expected: ${expected}\n  received: ${received}\n`));
    assert.ok(digest.split("\n").length <= 10);
  });
}

for (const [fixture, expected, received] of [
  ["to-equal-object", '"b": 3,', '"b": 2,'],
  ["to-equal-array", "3,", "2,"],
  ["to-contain-text", "Saved", "Draft"],
]) {
  test(`${fixture} digest summarizes both differing values from an actual Playwright unified diff`, () => {
    const digest = specsDigest([digestRun(fixture)]);
    assert.ok(digest.includes(`\n  expected: ${expected}\n  received: ${received}\n`));
    assert.ok(digest.split("\n").length <= 10);
  });
}

test("unified diff summaries and excerpt values are capped at 160 characters within ten lines", () => {
  const expected = "x".repeat(10_000), received = "y".repeat(10_000);
  for (const compact of [false, true]) {
    const report = digestFixture("to-equal-object");
    const error = report.suites[0].specs[0].tests[0].results[0].errors[0];
    error.message = error.message.replace('"b": 3,', `"b": "${expected}",`).replace('"b": 2,', `"b": "${received}",`);
    // A diff-only message also places a changed value within the three-line excerpt.
    if (compact) error.message = error.message.split("\n").filter((line: string) => /^[+-]/.test(line)).join("\n");
    const digest = specsDigest([{ report, logPath: "/logs/equal.log" }]);
    for (const [name, value] of [["expected", "x"], ["received", "y"]]) {
      const summary = digest.split("\n").find(line => line.startsWith(`  ${name}: `))?.slice(`  ${name}: `.length);
      assert.ok(summary?.startsWith(`"b": "${value}`));
      assert.equal(summary.length, 160);
      assert.ok(summary.endsWith("…"));
    }
    if (compact) assert.equal(digest.split("\n")[3].slice("  - ".length).length, 160);
    assert.ok(!digest.includes(expected));
    assert.ok(!digest.includes(received));
    assert.ok(digest.split("\n").length <= 10);
  }
});

test("toContainText typed diff summaries and excerpts stay bounded within ten lines", () => {
  const expected = "Saved" + "x".repeat(10_000), received = "Draft" + "y".repeat(10_000);
  for (const compact of [false, true]) {
    const report = digestFixture("to-contain-text");
    const error = report.suites[0].specs[0].tests[0].results[0].errors[0];
    error.message = error.message.replace("- Saved", `- ${expected}`).replace("+ Draft", `+ ${received}`);
    // Exercise the changed-line excerpt as well as the complete matcher message.
    if (compact) error.message = error.message.split("\n").filter((line: string) => /^[+-]/.test(line)).join("\n");
    const digest = specsDigest([{ report, logPath: "/logs/contain-text.log" }]);
    for (const [name, value] of [["expected", expected], ["received", received]]) {
      const summary = digest.split("\n").find(line => line.startsWith(`  ${name}: `))?.slice(`  ${name}: `.length);
      assert.equal(summary, `${value.slice(0, 159)}…`);
      assert.equal(summary.length, 160);
      assert.ok(!digest.includes(value));
    }
    if (compact) assert.equal(digest.split("\n")[3], `  - ${expected.slice(0, 159)}…`);
    assert.match(digest, /context: \/artifacts\/error-context\.md\n  trace: \/artifacts\/trace\.zip$/);
    assert.equal(digest.split("\n").length, 10);
  }
});

test("twelve failed tests in one spec cap at ten with a remainder and no digest exceeds ten lines", () => {
  const digest = specsDigest([digestRun("twelve-failures")], { directory: "/logs/run-1" });
  assert.equal(digest.split("\n\n").length, 11);
  assert.match(digest, /label.spec.ts:10 failure 10\n/);
  assert.doesNotMatch(digest, /failure 11|failure 12/);
  assert.ok(digest.endsWith("… and 2 more failing tests (/logs/run-1)"));
  // The cap applies across runs too, while retaining each run's log path.
  const runs = Array.from({ length: 12 }, (_, index) => ({ ...digestRun("assertion"), logPath: `/logs/shard-${index}.log` }));
  const combined = specsDigest(runs, { directory: "/logs/run-2" });
  assert.match(combined, /log: \/logs\/shard-9.log/);
  assert.doesNotMatch(combined, /shard-10.log/);
  assert.ok(combined.endsWith("… and 2 more failing tests (/logs/run-2)"));
  for (const output of [digest, combined, ...["assertion", "timeout", "thrown", "flaky", "to-contain", "to-have-length", "to-equal-object", "to-equal-array", "to-contain-text"].map(name => specsDigest([digestRun(name)]))]) {
    for (const block of output.split("\n\n")) assert.ok(block.split("\n").length <= 10, block);
  }
});

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
    "src/index.ts": 'export { media } from "./media.js";\nexport { html } from "../shared/html.ts";\n',
    "shared/html.ts": 'export const html = "<p>";\n',
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
const result = spawnSync(process.argv[2], process.argv.slice(3), { stdio: "inherit", env: { ...process.env, ASE_TEST_PORT: process.env.FAKE_PORT || String(process.pid * 2), PATH: ${JSON.stringify(join(root, "fake-bin"))} + ":" + process.env.PATH } });
process.exit(result.status ?? 1);
`);
  const fakeCommand = `#!${process.execPath}
const { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
async function main() {
const args = process.argv.slice(2);
const project = args.includes("--project=native-preview") ? "native-preview" : "native-save";
const selected = args.filter(arg => arg.endsWith(".spec.ts"));
if (process.env.FAKE_BARRIER_COUNT) {
  mkdirSync(".scratch/arrivals/" + process.pid, { recursive: true });
  const deadline = Date.now() + 5000;
  while (readdirSync(".scratch/arrivals").length < Number(process.env.FAKE_BARRIER_COUNT)) {
    if (Date.now() > deadline) throw new Error("shards did not overlap");
    await new Promise(accept => setTimeout(accept, 10));
  }
}
if (process.env.FAKE_WAIT_FOR_SIGNAL) {
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
    appendFileSync(".scratch/signals.jsonl", JSON.stringify({ pid: process.pid, signal }) + "\\n");
    process.exit(1);
  });
  appendFileSync(".scratch/ready.jsonl", process.pid + "\\n");
  setInterval(() => {}, 1000);
  return;
}
console.log("fake browser output");
console.log("last useful failure");
if (process.env.FAKE_NO_JSON || selected.some(file => file.endsWith(process.env.FAKE_NO_JSON_SPEC || "<none>"))) process.exit(1);
const reports = JSON.parse(readFileSync("reports.json", "utf8"));
const report = reports[project];
if (report?.suites) report.suites = report.suites.map(suite => ({ ...suite, specs: suite.specs.filter(spec => selected.some(file => spec.file === file || spec.file.endsWith("/" + file))) }));
mkdirSync(".scratch/" + project, { recursive: true });
writeFileSync(".scratch/" + project + "/results-" + (Number(process.env.ASE_TEST_PORT) + (project === "native-preview" ? 1 : 0)) + ".json", JSON.stringify(report));
process.exit(process.env.FAKE_EXIT ? Number(process.env.FAKE_EXIT) : 0);
}
main().catch(error => { console.error(error); process.exit(1); });
`;
  put("fake-bin/npx", fakeCommand);
  put("fake-bin/node", fakeCommand);
  for (const file of ["fake-runner", "fake-bin/npx", "fake-bin/node"]) {
    const result = spawnSync("chmod", ["+x", join(root, file)]);
    assert.equal(result.status, 0);
  }
  const run = (args: string[], env: NodeJS.ProcessEnv = {}) => spawnSync(kit, ["specs", ...args], {
    cwd: root, env: { ...process.env, ASE_SPEC_SHARDS: undefined, KIT_SPECS_FREE_SLOTS: undefined, KIT_ROOT: root, KIT_SPECS_RUNNER: join(root, "fake-runner"), ...env }, encoding: "utf8", timeout: 15_000,
  });
  return { root, put, git, files, base, run, calls };
}

test("server changes select agent paths and only changed routes from the server diff", () => {
  const server = "tests/native-save/server.ts";
  const hub = "tests/native-save/fake-hub.ts";
  const files = {
    [server]: 'const route = "/unchanged";',
    "tests/native-save/mcp-prompt.ts": "export const copyConnectionPrompt = () => {};",
    "tests/native-save/agent-helper.ts": 'export * from "./mcp-prompt.js";',
    [save("agent-import")]: 'import "./agent-helper";',
    [save("agent-quoted")]: 'await page.request.post("/mcp/connect");',
    [save("route-new")]: 'await page.goto("/__demo/onboarding");',
    [save("route-old")]: 'await page.goto("/__demo/old");',
    [save("unrelated")]: 'await page.goto("/unchanged");',
    [preview]: 'await page.request.post("/mcp/connect");',
  };
  const diff = `diff --git a/${server} b/${server}
--- a/${server}
+++ b/${server}
@@ -1 +1 @@
-const route = "/__demo/old";
+const route = "/__demo/onboarding";
diff --git a/${hub} b/${hub}
--- a/${hub}
+++ b/${hub}
@@ -1 +1 @@
-const label = "Unrelated label";
+const route = "/unchanged";
`;
  const selected = selectAffected({ files, changed: [server], diff });
  assert.deepEqual(selected.map(spec => spec.file), [save("agent-import"), save("agent-quoted"), save("route-new"), save("route-old")]);
  assert.deepEqual(selected[0].reasons, [`server: agent paths (${server})`]);
  assert.deepEqual(selected[2].reasons, [`server: route "/__demo/onboarding" (${server})`]);
  assert.deepEqual(selected[3].reasons, [`server: route "/__demo/old" (${server})`]);
  assert.match(selectionLine(selected[0]), /\[server 1\]$/);
  assert.deepEqual(selectAffected({ files, changed: [hub], diff }).map(spec => ({ file: spec.file, reasons: spec.reasons })),
    ["agent-import", "agent-quoted"].map(name => ({ file: save(name), reasons: [`server: agent paths (${hub})`] })));
  assert.deepEqual(removedStrings(diff), []);
});

test("server routes ignore common prefixes, context and matches beyond the fifteen-spec cap", () => {
  const server = "tests/native-save/server.ts";
  const files: Record<string, string> = {};
  const diff = `diff --git a/${server} b/${server}
--- a/${server}
+++ b/${server}
@@ -1 +1,4 @@
 const route = "/context-only";
+const routes = ["/", "/api", "/user", "/specific-route"];
`;
  files[save("context")] = 'const route = "/context-only";';
  files[save("prefix")] = 'const routes = ["/elsewhere", "/api/repos", "/user/profile"];';
  for (let i = 0; i < 15; i++) files[save(`route-${i}`)] = 'const route = "/specific-route";';
  assert.equal(selectAffected({ files, changed: [server], diff }).length, 15);
  files[save("route-last")] = 'const route = "/specific-route";';
  assert.deepEqual(selectAffected({ files, changed: [server], diff }), []);
});

test("affected --list passes the server diff and counts server reasons", t => {
  const f = fixture(t);
  f.put("tests/native-save/server.ts", 'const route = "/__demo/onboarding";');
  f.put(save("route"), 'await page.goto("/__demo/onboarding");');
  f.put(save("agent"), 'await page.request.post("/mcp/connect");');
  f.git("add", ".");
  f.git("commit", "--quiet", "-m", "server fixtures");
  f.git("update-ref", "refs/remotes/origin/dev", f.git("rev-parse", "HEAD"));
  f.put("tests/native-save/server.ts", 'const route = "/__demo/replaced";');
  const result = f.run(["--affected", "--list"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /agent.spec.ts .*server: agent paths .*\[server 1\]/);
  assert.match(result.stdout, /route.spec.ts .*server: route "\/__demo\/onboarding" .*\[server 1\]/);
  assert.match(result.stdout, /RESULT: ok specs 2 selected \(list only\)/);
  assert.equal(existsSync(f.calls), false);
});

test("relative import graph follows helper, re-export and .js-to-.ts paths", t => {
  const f = fixture(t);
  const selected = selectAffected({ files: f.files, changed: ["src/media.ts"] });
  assert.deepEqual(selected.map(spec => spec.file), [save("imports")]);
  assert.deepEqual(selected[0].reasons, ["import: src/media.ts"]);
  const files = { ...f.files, "tests/native-save/helpers.ts": 'export * from "../../src/directory";', "src/directory/index.tsx": 'const a = import("../media.js"); const b = require("../cycle.mjs");', "src/cycle.mjs": 'import "./directory";' };
  assert.equal(selectAffected({ files, changed: ["src/media.ts"] })[0].file, save("imports"));
  assert.deepEqual(importsOf('import x from "./a"; export * from "./b"; import "./c"; import("./d"); require("./e")'), ["./a", "./b", "./c", "./d", "./e"]);
  assert.deepEqual(selectAffected({ files, changed: [save("imports")] })[0].reasons, [`import: ${save("imports")}`]);
  // Specs load app modules in the browser from the site root.
  const rooted = { ...f.files, [save("rooted")]: 'test("x", async ({ page }) => page.evaluate(() => import("/src/media.ts")));' };
  assert.ok(selectAffected({ files: rooted, changed: ["src/media.ts"] }).some(spec => spec.file === save("rooted")));
  // shared/ is followed directly from a spec and transitively through src.
  const shared = { ...f.files, [save("direct")]: 'import { html } from "../../shared/html.ts";' };
  assert.deepEqual(selectAffected({ files: shared, changed: ["shared/html.ts"] }).map(spec => spec.file), [save("direct"), save("imports")]);
});

test("removed visible strings match only quoted spec text and ignore moves and code", t => {
  const f = fixture(t);
  f.put("src/button.ts", 'export const moved = "Still here";\nexport const label = "Media";\n');
  const diff = f.git("diff", "--unified=0", f.base, "--", "src");
  assert.deepEqual(removedStrings(diff), [{ file: "src/button.ts", value: "Image" }]);
  const files = { ...f.files, [save("plain")]: "// Image\n", [save("template")]: 'test(`Image picker`, () => {});', [save("apostrophe")]: "// the card's link\ntest(\"Don't open Image menu\", () => {});\n" };
  const selected = selectAffected({ files, changed: ["src/button.ts"], diff })
    .filter(spec => spec.reasons.some(reason => reason.startsWith("removed string:")));
  assert.deepEqual(selected.map(spec => spec.file), [save("apostrophe"), save("label"), save("template")]);
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
  const renames = `diff --git a/src/ui.ts b/src/ui.ts
--- a/src/ui.ts
+++ b/src/ui.ts
@@ -1,3 +1,3 @@
-const label = "Image";
-const html = \`<button>OK</button><button>delete</button>\`;
-const short = "id";
+const label = "Images";
+const html = \`<button>Confirm</button><button>Remove</button>\`;
+const short = "key";
`;
  assert.deepEqual(removedStrings(renames).map(row => row.value).sort(), ["Image", "OK", "delete"]);
  const okSpec = { ...f.files, [save("ok")]: 'await page.getByRole("button", { name: "OK" }).click();' };
  assert.ok(selectAffected({ files: okSpec, changed: ["src/ui.ts"], diff: renames }).some(spec => spec.file === save("ok")));
});

test("defined labels, classes and hooks match quoted spec tokens with useful boundaries", t => {
  const f = fixture(t);
  const module = "src/uploads.ts";
  const files = {
    ...f.files,
    [module]: `
      const html = \`<button aria-label="Choose uploads" title="Upload details" placeholder="Find uploads"
        class="upload-tray pending-upload" id="upload-panel" data-upload-state="pending">Add documents</button>\`;
      node.className = "upload-row other-row";
      node.classList.add("queued-upload", "upload-ready");
      node.classList.toggle("upload-expanded", true);
      node.classList.remove("upload-stale");
      const selector = ".upload-focus";
      const jsx = <div className={"upload-jsx"} />;
      const label = "Upload complete";
      const noise = ["true", "false", "button", "hidden", "active", "error", "Image", "Files", "Media", "OK", "add"];
    `,
    [save("labels")]: 'test("Choose uploads", () => page.getByText("Add documents"));',
    [save("attributes")]: 'page.getByTitle("Upload details"); page.getByPlaceholder("Find uploads");',
    [save("classes")]: 'page.locator(".upload-tray .pending-upload .upload-row .queued-upload .upload-ready .upload-expanded .upload-stale .upload-focus .upload-jsx");',
    [save("hooks")]: 'page.locator("#upload-panel [data-upload-state]");',
    [save("visible")]: 'test("Status: Upload complete!", () => {});',
    [save("noise")]: 'test("true false button hidden active error Image Files Media OK add", () => {});',
    [save("longer")]: 'page.locator(".upload-tray-extra .pre-upload-row .queued-uploaded #upload-panelist [data-upload-states]"); test("Choose uploadstuff ReUpload complete", () => {});',
    [save("unquoted")]: '// Choose uploads\n// upload-tray\n',
  };
  const selected = selectAffected({ files, changed: [module] });
  assert.deepEqual(selected.map(spec => spec.file), ["attributes", "classes", "hooks", "labels", "visible"].map(save));
  assert.ok(selected.find(spec => spec.file === save("labels"))?.reasons.includes(`string: "Choose uploads" (${module})`));
  assert.ok(selected.find(spec => spec.file === save("classes"))?.reasons.includes(`string: "upload-jsx" (${module})`));
  assert.ok(selected.every(spec => spec.reasons.every(reason => reason.startsWith("string:"))));
  assert.deepEqual(selectAffected({ files, changed: ["src/missing.ts", "tools/uploads.ts"] }), []);
});

test("defined strings occurring in more than fifteen specs are ignored", t => {
  const f = fixture(t);
  const files = { ...f.files, "shared/status.ts": 'export const label = "Upload finished";' };
  for (let i = 0; i < 15; i++) files[save(`case-${i}`)] = 'test("Upload finished", () => {});';
  assert.equal(selectAffected({ files, changed: ["shared/status.ts"] }).length, 15);
  files[save("case-last")] = 'test("Upload finished", () => {});';
  assert.deepEqual(selectAffected({ files, changed: ["shared/status.ts"] }), []);
});

test("shared vocabulary and shared helpers do not widen the selection", t => {
  const f = fixture(t);
  const files: Record<string, string> = { ...f.files, "src/tray.ts": 'const a = "Remove upload"; const b = "Upload tray title";', [save("tray")]: 'test("Remove upload Upload tray title", () => {});' };
  // "Remove upload" is defined by four app modules: vocabulary, not a feature hook.
  for (let i = 0; i < 3; i++) files[`src/other-${i}.ts`] = 'const label = "Remove upload";';
  assert.deepEqual(selectAffected({ files, changed: ["src/tray.ts"] })[0].reasons, ['string: "Upload tray title" (src/tray.ts)']);
  delete files["src/other-2.ts"];
  assert.equal(selectAffected({ files, changed: ["src/tray.ts"] })[0].reasons.length, 2);
  // A helper with three importers walks up to them; with four it is a shared helper and stops.
  files["src/helper.ts"] = "export const limit = 1;";
  files[save("panel")] = 'test("Panel heading one", () => {});';
  for (let i = 0; i < 3; i++) files[`src/user-${i}.ts`] = `import { limit } from "./helper"; const label = "Panel heading ${["one", "two", "three"][i]}";`;
  assert.deepEqual(selectAffected({ files, changed: ["src/helper.ts"] }).map(spec => spec.file), [save("panel")]);
  files["src/user-3.ts"] = 'import { limit } from "./helper";';
  assert.deepEqual(selectAffected({ files, changed: ["src/helper.ts"] }), []);
});

test("module names require two shared tokens including a non-generic token", t => {
  const f = fixture(t);
  const module = "src/page-builder/media-files-adding-runs.ts";
  const files = {
    ...f.files, [module]: "export const count = 1;",
    [save("native-media-adding")]: "", [save("actual_mediaFile.test")]: "",
    [save("native-media-pane")]: "", [save("native-file-ops")]: "", [save("adding-queue")]: "",
    "src/native-media.ts": "", [save("native-media")]: "",
    "src/native-pages.ts": "", [save("native-page")]: "",
  };
  const selected = selectAffected({ files, changed: [module, "src/native-media.ts", "src/native-pages.ts"] });
  assert.deepEqual(selected.map(spec => spec.file), [save("actual_mediaFile.test"), save("native-media-adding")]);
  assert.deepEqual(selected.find(spec => spec.file === save("native-media-adding"))?.reasons,
    [`name: media, adding (${module})`]);
});

test("reverse module walk follows value and lazy imports, excludes type references and stops before main", t => {
  const f = fixture(t);
  const module = "shared/job.ts";
  const files = {
    ...f.files, [module]: "export const count = 1;",
    "src/lazy.ts": 'const load = async () => await import("../shared/job"); const label = "Queued documents";',
    "src/chain.ts": 'const load = () => import("./lazy.js").then(module => module); const label = "Pending documents";',
    "src/loop.ts": 'export * from "./chain"; import "./loop"; const label = "Ready documents";',
    "src/value.ts": 'import { count } from "../shared/job"; const label = "Current documents";',
    "src/main.ts": 'const load = () => import("./chain"); const label = "Main documents";',
    "src/above.ts": 'import "./main"; const label = "Above documents";',
    [save("queued")]: 'test("Queued documents", () => {});',
    [save("pending")]: 'test("Pending documents", () => {});',
    [save("ready")]: 'test("Ready documents", () => {});',
    [save("current")]: 'test("Current documents", () => {});',
    [save("main")]: 'test("Main documents Above documents", () => {});',
  };
  const typeReferences = [
    'import type { Job } from "../shared/job";',
    'export type { Job } from "../shared/job";',
    'type Job = typeof import("../shared/job");',
    'type Job = import("../shared/job").Job;',
    'type Job = import("../shared/job")["count"];',
    'import { type Job } from "../shared/job";',
    'export { type Job } from "../shared/job";',
    '// await import("../shared/job");',
    'const source = \'import("../shared/job")\';',
  ];
  for (const [i, reference] of typeReferences.entries()) {
    files[`src/type-${i}.ts`] = `${reference}\nconst label = "Type documents";`;
  }
  files[save("types")] = 'test("Type documents", () => {});';
  assert.deepEqual(selectAffected({ files, changed: [module] }).map(spec => spec.file),
    ["current", "pending", "queued", "ready"].map(save));
  assert.deepEqual(selectAffected({ files, changed: ["src/main.ts"] }), []);
  // Existing spec import selection deliberately still follows type-only imports.
  files[save("direct-type")] = 'import type { Job } from "../..//shared/job";';
  assert.ok(selectAffected({ files, changed: [module] }).find(spec => spec.file === save("direct-type"))?.reasons.includes(`import: ${module}`));
});

test("selection lines count all reason kinds including reasons beyond the first three", () => {
  const reasons = [
    'string: "Add files" (src/adding.ts)', 'name: media, adding (src/adding.ts)',
    'string: "upload-row" (src/adding.ts)', 'string: "pending-upload" (src/adding.ts)',
    "import: shared/jobs.ts", "fixture: default (fixtures/native-starter/index.html)",
    'removed string: "Old upload" (src/adding.ts)',
  ];
  assert.equal(selectionLine({ file: save("uploads"), groups: ["default"], reasons }),
    `${save("uploads")} [default] — ${reasons.slice(0, 3).join("; ")} (+4 more) [import 1, fixture 1, removed string 1, string 3, name 1]`);
});

test("fixture rules match exact tags and collect every applicable reason", t => {
  const f = fixture(t);
  assert.deepEqual(specGroups(save("single"), "'@actual'"), ["default"]);
  const actual = selectAffected({ files: f.files, changed: ["fixtures/actual-starter/index.html"] });
  assert.deepEqual(actual.map(spec => spec.file), [save("actual"), save("both")]);
  const defaults = selectAffected({ files: f.files, changed: ["fixtures/native-starter/index.html"] });
  assert.ok(defaults.every(spec => ["default", "native-preview"].includes(spec.groups.join())));
  assert.ok(defaults.some(spec => spec.file === preview), "the native-preview server serves the default fixture");
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

test("shards balance estimated weights with deterministic ties, sorted files and no empty shards", () => {
  const files = ["f", "d", "a", "c", "e", "b"];
  const weights = { a: 8, b: 7, c: 6, d: 5, e: 4, f: 3 };
  const shards = planShards(files, 3, weights);
  assert.deepEqual(shards, [["a", "f"], ["b", "e"], ["c", "d"]]);
  assert.deepEqual(planShards([...files].reverse(), 3, weights), shards);
  assert.deepEqual(planShards(["b", "a"], 20, { a: 0 }), [["a"], ["b"]]);
  assert.deepEqual(planShards(files, 1), [["a", "b", "c", "d", "e", "f"]]);
  assert.deepEqual(planShards([], 4), []);
  assert.throws(() => planShards(files, 0), /positive integer/);
});

test("shard counts cap by slots, memory, load and files, with at least one and an uncapped override", () => {
  const capacity = { free: 8, memoryKb: 100, minMemoryKb: 10, load: 1, maxLoad: 10, files: 40 };
  assert.deepEqual(shardCount(capacity), { count: 4, free: 8, memoryCap: 10, loadCap: 9 });
  assert.equal(shardCount({ ...capacity, free: 2 }).count, 2);
  assert.equal(shardCount({ ...capacity, memoryKb: 29 }).count, 2);
  assert.equal(shardCount({ ...capacity, load: 7.2 }).count, 2);
  assert.equal(shardCount({ ...capacity, files: 2 }).count, 2);
  assert.equal(shardCount({ ...capacity, free: 0, memoryKb: 0, load: 100 }).count, 1);
  assert.equal(shardCount({ ...capacity, requested: "8", free: 0, memoryKb: 0, load: 100 }).count, 8);
  assert.equal(shardCount({ ...capacity, requested: "999999999999999999999999999999", files: 2 }).count, 2);
  assert.equal(shardCount({ ...capacity, minMemoryKb: 0 }).memoryCap, Infinity);
  assert.equal(shardCount({ ...capacity, files: 0 }).count, 0);
  for (const requested of ["", "0", "-2", "1.5", "bad", " 2", "+2"]) {
    assert.throws(() => shardCount({ ...capacity, requested }), /Invalid ASE_SPEC_SHARDS/);
  }
});

test("routing shards only large default groups and counts test calls from snapshot text", () => {
  const defaults = Array.from({ length: SHARD_MIN_SPECS }, (_, i) => ({ file: save(`shard-${String(i).padStart(2, "0")}`), groups: ["default"] }));
  const tagged = [
    { file: save("actual"), groups: ["actual"] }, { file: save("static"), groups: ["native-static"] },
    ...Array.from({ length: SHARD_MIN_SPECS }, (_, i) => ({ file: `tests/native-preview/${i}.spec.ts`, groups: ["native-preview"] })),
  ];
  const specs = [...defaults, ...tagged];
  const texts = { [defaults[0].file]: 'test("heavy", () => {});\n'.repeat(50) + 'test.skip("skip", () => {});\n'.repeat(50) };
  const runs = routeSpecs(specs, specs, { shards: 2, texts });
  assert.deepEqual(runs.filter(run => run.group === "default").map(run => run.files), [[defaults[0].file], defaults.slice(1).map(spec => spec.file)]);
  assert.deepEqual(runs.filter(run => run.group !== "default"), routeSpecs(tagged));
  for (const run of runs.filter(run => run.group === "default")) {
    assert.deepEqual(run.command, ["npx", "playwright", "test", "--project=native-save", "--workers=1", ...run.files]);
  }
  const small = defaults.slice(0, SHARD_MIN_SPECS - 1);
  assert.deepEqual(routeSpecs(small, small, { shards: 4, texts }), routeSpecs(small));
  assert.deepEqual(routeSpecs(small)[0].command, ["npx", "playwright", "test", "--project=native-save", "--workers=1", ...small.map(spec => spec.file)]);
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
  f.put("shared/html.ts", 'export const html = "<div>";\n');
  const result = f.run(["--affected", "--base", f.base, "--list"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /imports.spec.ts \[default\] — import: shared\/html.ts; import: src\/media.ts/);
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

function largeSelection(f: ReturnType<typeof fixture>, failed?: string) {
  const files = Array.from({ length: SHARD_MIN_SPECS }, (_, i) => save(`parallel-${String(i).padStart(2, "0")}`));
  for (const file of files) f.put(file, 'test("case", () => {});');
  f.put("reports.json", JSON.stringify({ "native-save": { suites: [{ specs: files.map(file => reportSpec(file, "case", file === failed ? "unexpected" : "expected")) }] } }));
  return files;
}

const callFiles = (call: string[]) => [...call[2].matchAll(/'(tests\/native-save\/[^']+\.spec\.ts)'/g)].map(match => match[1]);

test("parallel shards isolate artifacts and merge a known failure in selection order", t => {
  const f = fixture(t);
  const failed = save("parallel-07");
  const files = largeSelection(f, failed);
  f.put("known.json", JSON.stringify([{ spec: "native-save/parallel-07.spec.ts", title: "case", status: "flaky" }]));
  // More than ten concurrent runners also exercises signal listener sharing.
  const result = f.run([...files].reverse(), { ASE_SPEC_SHARDS: "12", FAKE_BARRIER_COUNT: "12", ASE_KNOWN_FAILURES: join(f.root, "known.json") });
  assert.equal(result.status, 1, result.stderr);
  assert.doesNotMatch(result.stderr, /MaxListenersExceededWarning/);
  assert.match(result.stdout, /shards: 12 \(ASE_SPEC_SHARDS\)/);
  assert.match(result.stdout, /parallel-07.spec.ts: case — Missing button \[known flaky\]/);
  assert.match(result.stdout, /RESULT: fail specs 1 of 40 failed: parallel-07.spec.ts\(known\)\n$/);
  const calls: string[][] = readFileSync(f.calls, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(calls.length, 12);
  assert.deepEqual(calls.flatMap(callFiles).sort(), files);
  const outputs = calls.map(call => call[2].match(/'--output=([^']+)'/)?.[1]);
  assert.ok(outputs.every(output => output && /\/run-[^/]+\/artifacts-\d+$/.test(output)));
  assert.equal(new Set(outputs).size, 12);
  const lines = result.stdout.split("\n").filter(line => /^[✓✗] /.test(line));
  assert.deepEqual(lines.map(line => line.split(" ")[1].replace(/:$/, "")), files);
  const reports = [...result.stdout.matchAll(/^log: (.+)\.log$/gm)].map(match => JSON.parse(readFileSync(`${match[1]}.json`, "utf8")));
  assert.deepEqual(reports.flatMap(report => report.suites.flatMap((suite: { specs: { file: string }[] }) => suite.specs.map(spec => spec.file))).sort(), files);
});

test("a missing shard report fails only that shard's specs", t => {
  const f = fixture(t);
  const files = largeSelection(f);
  const result = f.run(files, { ASE_SPEC_SHARDS: "3", FAKE_NO_JSON_SPEC: files[0], FAKE_BARRIER_COUNT: "3" });
  assert.equal(result.status, 1, result.stderr);
  const calls: string[][] = readFileSync(f.calls, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(calls.length, 3);
  const missing = callFiles(calls.find(call => callFiles(call).includes(files[0]))!);
  const failures = result.stdout.split("\n").filter(line => line.startsWith("✗ "));
  assert.deepEqual(failures.map(line => line.split(" ")[1].replace(/:$/, "")), [...missing].sort());
  assert.ok(failures.every(line => line.endsWith("run failed — last useful failure")));
  assert.equal(result.stdout.split("\n").filter(line => line.startsWith("✓ ")).length, files.length - missing.length);
  assert.ok(result.stdout.includes(`RESULT: fail specs ${missing.length} of 40 failed:`));
});

test("automatic shard caps and small selections retain their CLI behavior", t => {
  const f = fixture(t);
  const files = largeSelection(f);
  const automatic = f.run(files, { KIT_SPECS_FREE_SLOTS: "3", ASE_MIN_MEM_KB: "0", ASE_MAX_LOAD: "1000000", FAKE_BARRIER_COUNT: "3" });
  assert.equal(automatic.status, 0, automatic.stderr);
  assert.match(automatic.stdout, /shards: 3 \(free slots 3, memory cap Infinity, load cap \d+\)/);
  assert.match(automatic.stdout, /RESULT: ok specs 40\/40 passed/);
  const small = f.run(files.slice(0, 39), { ASE_SPEC_SHARDS: "12" });
  assert.equal(small.status, 0, small.stderr);
  assert.doesNotMatch(small.stdout, /shards:/);
  const calls: string[][] = readFileSync(f.calls, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(calls.length, 4);
  assert.doesNotMatch(calls[3][2], /--output=/);
});

for (const signal of ["SIGINT", "SIGTERM"] satisfies NodeJS.Signals[]) {
  test(`${signal} reaches every active shard and prevents tagged runs`, async t => {
    const f = fixture(t);
    const files = largeSelection(f);
    const child = spawn(kit, ["specs", ...files, save("actual")], {
      cwd: f.root,
      env: { ...process.env, KIT_ROOT: f.root, KIT_SPECS_RUNNER: join(f.root, "fake-runner"), ASE_SPEC_SHARDS: "2", FAKE_WAIT_FOR_SIGNAL: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const closed = once(child, "close", { signal: AbortSignal.timeout(15_000) });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += String(chunk); });
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    const ready = join(f.root, ".scratch/ready.jsonl");
    try {
      const deadline = Date.now() + 10_000;
      while (!existsSync(ready) || readFileSync(ready, "utf8").trim().split("\n").length < 2) {
        assert.ok(Date.now() < deadline, `shards did not start: ${stderr}`);
        await delay(20);
      }
      child.kill(signal);
      const [code] = await closed;
      assert.equal(code, signal === "SIGINT" ? 130 : 143, stderr);
      const signals: { pid: number; signal: string }[] = readFileSync(join(f.root, ".scratch/signals.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
      assert.equal(signals.length, 2);
      assert.ok(signals.every(entry => entry.signal === signal));
      assert.equal(new Set(signals.map(entry => entry.pid)).size, 2);
      assert.equal(readFileSync(f.calls, "utf8").trim().split("\n").length, 2);
      assert.match(stdout, /actual.spec.ts: run failed — Interrupted by SIG/);
    } finally {
      child.kill("SIGTERM");
      // Only fake browser processes recorded by this fixture can need cleanup.
      if (existsSync(ready)) for (const pid of readFileSync(ready, "utf8").trim().split("\n")) {
        try { process.kill(Number(pid), "SIGKILL"); } catch { /* Already exited. */ }
      }
      await closed;
    }
  });
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

test("fake runner prints the failure digest after spec outcomes and adds nothing on success", t => {
  const f = fixture(t);
  const spec = { ...digestFixture("assertion").suites[0].suites[0].specs[0], file: save("label") };
  f.put("reports.json", JSON.stringify({ "native-save": { suites: [{ specs: [spec] }] } }));
  const failed = f.run(["label.spec.ts"], { FAKE_EXIT: "1" });
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stdout, /✗ tests\/native-save\/label.spec.ts:.*\ntests\/native-save\/label.spec.ts:42 shows the saved title\n/);
  assert.match(failed.stdout, /  expected: "Saved"\n  received: "Draft"/);
  const logPath = failed.stdout.match(/^log: (.+)$/m)?.[1];
  assert.ok(logPath);
  assert.ok(failed.stdout.includes(`  log: ${logPath}\n`));
  assert.match(failed.stdout, /  context: \/artifacts\/error-context.md\n  trace: \/artifacts\/trace.zip\nRESULT: fail specs 1 of 1 failed: label.spec.ts\n$/);
  assert.doesNotMatch(failed.stdout, /fake browser output|DO NOT PRINT ATTACHMENT CONTENTS/);

  f.put("reports.json", JSON.stringify({ "native-save": digestFixture("flaky") }));
  const passed = f.run(["label.spec.ts"]);
  assert.equal(passed.status, 0, passed.stderr);
  const lines = passed.stdout.trim().split("\n");
  assert.equal(lines.length, 4, passed.stdout);
  assert.match(lines[0], /^owner: /);
  assert.match(lines[1], /^log: /);
  assert.equal(lines[2], "✓ tests/native-save/label.spec.ts (2 passed, 1 skipped)");
  assert.equal(lines[3], "RESULT: ok specs 1/1 passed");
});

test("missing, malformed and zero-result reports fail; stale port reports are not reused", t => {
  const f = fixture(t);
  f.put("reports.json", JSON.stringify({ "native-save": { suites: [{ specs: [reportSpec(save("imports"), "pass")] }] } }));
  assert.equal(f.run(["imports.spec.ts"], { FAKE_PORT: "5296" }).status, 0);
  const missing = f.run(["imports.spec.ts"], { FAKE_PORT: "5296", FAKE_NO_JSON: "1" });
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
  assert.match(help.stdout, />= 40 files/);
  assert.match(help.stdout, /ASE_SPEC_SHARDS/);
  assert.doesNotMatch(help.stdout, /RESULT:/);
  const empty = f.run(["--affected", "--list"]);
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /RESULT: ok specs none affected\n$/);
  for (const ASE_SPEC_SHARDS of ["", "0", "-1", "2.5", "bad"]) {
    const result = f.run(["imports.spec.ts", "--list"], { ASE_SPEC_SHARDS });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Invalid ASE_SPEC_SHARDS:/);
    assert.match(result.stderr, /Usage: kit specs/);
  }
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
