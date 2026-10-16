import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { contactHtml, expandMatrix, makeIndex, nextEncoding, parseArgs, parseStep, parseSteps, screens, type Encoding, type Shot } from "../scripts/agents/shots/core";

test("steps parse every grammar form and name unknown instructions", () => {
  assert.deepEqual(parseStep('click "Filter"'), { kind: "click", name: "Filter" });
  assert.deepEqual(parseStep('type "logo" in search'), { kind: "type", text: "logo", label: "search" });
  assert.deepEqual(parseStep('type "" in Search media'), { kind: "type", text: "", label: "Search media" });
  for (const [source, target] of [["first", 0], ["last", -1], ["nth 3", 2]] as const) assert.deepEqual(parseStep(`hover ${source} tile`), { kind: "hover", target });
  assert.deepEqual(parseStep('hover "Filter"'), { kind: "hover", target: "Filter" });
  assert.deepEqual(parseStep("press Control+K"), { kind: "press", key: "Control+K" });
  assert.deepEqual(parseStep("scroll down"), { kind: "scroll", direction: "down" });
  assert.deepEqual(parseStep("scroll up"), { kind: "scroll", direction: "up" });
  assert.deepEqual(parseStep('wait for "Ready"'), { kind: "wait", text: "Ready" });
  for (const source of ["explode logo", "hover nth 0 tile", "scroll sideways", "wait 300"]) assert.throws(() => parseStep(source), { message: `Unknown step: ${source}` });
});

test("JSON and documented YAML subset yield the same validated scenario", () => {
  const scenario = { screen: "media-gallery", name: "filtered", steps: ['click "Filter"', 'type "logo" in search', "hover first tile"] };
  assert.deepEqual(parseSteps(JSON.stringify(scenario)), scenario);
  assert.deepEqual(parseSteps(`screen: media-gallery\nname: 'filtered'\n# comment\nsteps:\n  - click "Filter"\n  - 'type "logo" in search'\n  - hover first tile\n`, true), scenario);
  assert.deepEqual(parseSteps('screen: editor\nsteps: []', true), { screen: "editor", steps: [] });
  assert.throws(() => parseSteps('{"screen":"editor","steps":["explode logo"]}'), /Unknown step: explode logo/);
  for (const input of ["null", "[]", '{"screen":"missing","steps":[]}', '{"screen":"editor","steps":[3]}', '{"screen":"editor","steps":[],"name":"../escape"}', '{"screen":"editor","steps":[],"extra":true}']) assert.throws(() => parseSteps(input));
  assert.throws(() => parseSteps("screen: editor\nscript: evil", true), /Unsupported YAML/);
  assert.throws(() => parseSteps("screen: editor\nscreen: files\nsteps: []", true), /Unsupported YAML/);
});

test("screen flags and default matrix expand predictably", () => {
  const options = parseArgs(["editor", "media-gallery"]);
  assert.equal(screens.length, 13);
  assert.deepEqual(expandMatrix(options.widths, options.themes), [
    { width: 390, theme: "light" }, { width: 390, theme: "dark" },
    { width: 768, theme: "light" }, { width: 768, theme: "dark" },
    { width: 1280, theme: "light" }, { width: 1280, theme: "dark" },
  ]);
  const narrow = parseArgs(["editor", "--width", "390,1280,390", "--theme", "dark", "--out", "my output"]);
  assert.deepEqual(expandMatrix(narrow.widths, narrow.themes), [{ width: 390, theme: "dark" }, { width: 1280, theme: "dark" }]);
  assert.equal(narrow.out, "my output");
  assert.equal(parseArgs(["--steps", ".scratch/test.yaml"]).steps, ".scratch/test.yaml");
  assert.equal(parseArgs(["--spec", ".scratch/example.spec.ts"]).spec, ".scratch/example.spec.ts");
  for (const args of [[], ["missing"], ["editor", "--nope"], ["editor", "--width"], ["editor", "--width", "0"], ["editor", "--width", "1e3"], ["editor", "--theme", "auto"], ["--steps", "file", "editor"], ["--spec", "file", "--width", "390"], ["editor", "--width", "390", "--width", "768"]]) assert.throws(() => parseArgs(args));
});

test("WebP stepping spends quality before dimensions and always terminates", () => {
  let state: Encoding | null = { quality: 85, width: 390, height: 900 };
  const states: Encoding[] = [];
  while (state) { states.push(state); state = nextEncoding(state); assert.ok(states.length < 100); }
  assert.deepEqual(states.slice(0, 6).map(state => state.quality), [85, 70, 55, 40, 25, 20]);
  assert.ok(states.slice(0, 6).every(state => state.width === 390 && state.height === 900));
  assert.deepEqual(states[6], { quality: 20, width: 312, height: 720 });
  assert.deepEqual(states.at(-1), { quality: 20, width: 1, height: 1 });
});

function shot(name?: string): Shot {
  return { screen: "editor", name, width: 390, theme: "light", files: [{ path: `editor${name ? `-${name}` : ""}-390-light.webp`, bytes: 123 }], attempts: 1, failures: [], layout: [], ok: true };
}

test("contact HTML labels single rows and orders paired before/after columns", () => {
  const single = contactHtml([shot()]);
  assert.match(single, /editor · 390px · light/);
  assert.match(single, /src="editor-390-light.webp"/);
  assert.doesNotMatch(single, /class="row paired"/);
  const pair = contactHtml([shot("after"), shot("before")]);
  assert.match(pair, /class="row paired"/);
  assert.ok(pair.indexOf("<figcaption>before") < pair.indexOf("<figcaption>after"));
  assert.equal((pair.match(/<section>/g) ?? []).length, 1);
  assert.match(contactHtml([{ ...shot('<script>'), ok: false, files: [] }]), /&lt;script&gt; — failed/);
  assert.match(contactHtml([{ ...shot(), ok: false, files: [] }]), /No screenshot/);
});

test("index retains dimensions, files, sizes, failed attempts and layout findings", () => {
  const retry = { ...shot(), attempts: 2, failures: [{ attempt: 1, step: 'click "Filter"', error: "timeout" }], layout: [{ message: "overflow" }] };
  const index = JSON.parse(JSON.stringify(makeIndex([retry])));
  assert.equal(index.version, 1);
  assert.equal(index.screens[0].ok, true);
  assert.equal(index.screens[0].attempts, 2);
  assert.deepEqual(index.files, retry.files);
  assert.equal(index.failures[0].step, 'click "Filter"');
  assert.equal(index.failures[0].width, 390);
  assert.equal(index.layoutFindings[0].finding.message, "overflow");
  assert.deepEqual(makeIndex([]), { version: 1, screens: [], files: [], failures: [], outputFailures: [], layoutFindings: [] });
});

test("kit shots help and invalid arguments finish without starting a server", () => {
  const run = (args: string[]) => spawnSync("scripts/agents/kit", ["shots", ...args], { encoding: "utf8", timeout: 15_000 });
  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /No screen: list screens and fail/);
  assert.doesNotMatch(help.stdout, /RESULT:/);
  const missing = run([]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Choose a screen: editor, media-gallery/);
  assert.equal(missing.stdout.split("\n").filter(line => line.startsWith("RESULT:")).length, 1);
  const outside = run(["--steps", "package.json"]);
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /Scenario file must live under .scratch/);
});
