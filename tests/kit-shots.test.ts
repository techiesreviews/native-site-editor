import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { contactHtml, contactSheets, initialEncoding, expandMatrix, makeIndex, nextEncoding, parseArgs, parseStep, parseSteps, screens, type Encoding, type Shot } from "../scripts/agents/shots/core";

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
  assert.equal(parseArgs(["editor", "--files"]).files, true);
  assert.throws(() => parseArgs(["editor", "--files", "--files"]), /Repeated flag/);
  assert.equal(parseArgs(["--steps", ".scratch/test.yaml"]).steps, ".scratch/test.yaml");
  assert.equal(parseArgs(["--spec", ".scratch/example.spec.ts"]).spec, ".scratch/example.spec.ts");
  for (const args of [[], ["missing"], ["editor", "--nope"], ["editor", "--width"], ["editor", "--width", "0"], ["editor", "--width", "1e3"], ["editor", "--theme", "auto"], ["--steps", "file", "editor"], ["--spec", "file", "--width", "390"], ["--spec", "file", "--files"], ["editor", "--width", "390", "--width", "768"]]) assert.throws(() => parseArgs(args));
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
  assert.match(single, /<h2>editor<\/h2>/);
  assert.match(single, /<figcaption>editor · 390px · light<\/figcaption>/);
  const matrix = contactHtml([shot(), { ...shot(), theme: "dark", files: [{ path: "editor-390-dark.webp", bytes: 1 }] }]);
  assert.equal((matrix.match(/<section>/g) ?? []).length, 1, "one row per screen across sizes and themes");
  assert.match(single, /src="editor-390-light.webp"/);
  assert.doesNotMatch(single, /class="row paired"/);
  const pair = contactHtml([shot("after"), shot("before")]);
  assert.match(pair, /class="row paired"/);
  assert.ok(pair.indexOf("· before</figcaption>") < pair.indexOf("· after</figcaption>"));
  assert.equal((pair.match(/<section>/g) ?? []).length, 1);
  assert.match(pair, /<h2>editor · 390px · light<\/h2>/);
  const lone = contactHtml([shot("before")]);
  assert.doesNotMatch(lone, /class="row paired"/, "a before without its after is a plain row");
  assert.match(lone, /<h2>editor-before<\/h2>/);
  const escaped = contactHtml([{ ...shot('<script>'), ok: false, files: [] }]);
  assert.match(escaped, /<h2>editor-&lt;script&gt;<\/h2>/);
  assert.match(escaped, /390px · light · &lt;script&gt; — failed/);
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
  assert.match(help.stdout, /--files lists every file path/);
  assert.match(help.stdout, /1600 x 2400 px/);
  const missing = run([]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Choose a screen: editor, media-gallery/);
  assert.equal(missing.stdout.split("\n").filter(line => line.startsWith("RESULT:")).length, 1);
  const outside = run(["--steps", "package.json"]);
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /Scenario file must live under .scratch/);
});


test("contact geometry preserves readable tiles and splits 1, 13 and 39 shots only by whole rows", () => {
  for (const count of [1, 13, 39]) {
    const shots = count === 1 ? [shot()] : screens.flatMap(screen => (count === 13 ? [390] : [390, 768, 1280]).map(width => ({ ...shot(), screen, width })));
    const sheets = contactSheets(shots);
    assert.equal(sheets.length, count === 1 ? 1 : 7);
    assert.deepEqual(sheets.map(sheet => sheet.path), count === 1 ? ["contact.webp"] : Array.from({ length: 7 }, (_, i) => `contact-${i + 1}.webp`));
    assert.equal(sheets[0].width, count === 39 ? 1262 : 430);
    assert.equal(sheets[0].height, count === 1 ? 1056 : 2048);
    assert.deepEqual(sheets.map(sheet => sheet.rows.length), count === 1 ? [1] : [2, 2, 2, 2, 2, 2, 1]);
    assert.equal(sheets.flatMap(sheet => sheet.rows).length, count === 1 ? 1 : 13);
    assert.deepEqual(sheets.flatMap(sheet => sheet.rows.flatMap(row => row.tiles.map(tile => tile.shot))), shots);
    for (const sheet of sheets) {
      assert.ok(sheet.width <= 1600 && sheet.height <= 2400);
      for (const row of sheet.rows) {
        assert.equal(new Set(row.tiles.map(tile => tile.shot.screen)).size, 1);
        assert.equal(row.tiles.length, count === 39 ? 3 : 1);
        for (const tile of row.tiles) {
          assert.equal(tile.width, tile.shot.width === 390 ? 390 : 400);
          assert.equal(tile.imageWidth, tile.width);
          assert.equal(tile.imageHeight, Math.floor(900 * Math.min(1, 400 / tile.shot.width)));
          assert.equal(tile.label, `${tile.shot.screen} · ${tile.shot.width}px · light`);
          assert.ok(sheet.html.includes(`<figcaption>${tile.label}</figcaption>`));
        }
      }
    }
  }
});

test("wide screen matrices wrap whole rows, preserve pairs and prefer source PNGs", () => {
  const shots = screens.flatMap(screen => [390, 768, 1280].flatMap(width => ["light", "dark"].map(theme => ({ ...shot(), screen, width, theme } satisfies Shot))));
  const sheets = contactSheets(shots);
  assert.equal(sheets.length, 13, "six tiles need two rows per sheet");
  assert.ok(sheets.every(sheet => sheet.rows.length === 2 && sheet.width <= 1600 && sheet.height <= 2400));
  assert.equal(sheets.flatMap(sheet => sheet.rows.flatMap(row => row.tiles)).length, 78);
  const pairs = contactSheets(screens.flatMap(screen => [390, 768, 1280].flatMap(width => ["after", "before"].map(name => ({ ...shot(name), screen, width })))));
  for (const sheet of pairs) for (const row of sheet.rows) {
    assert.equal(row.paired, true);
    assert.deepEqual(row.tiles.map(tile => tile.shot.name), ["before", "after"]);
  }
  const tall = contactSheets([{ ...shot(), height: 50_000 }, { ...shot(), width: 1 }, { ...shot(), width: 7680 }]);
  assert.ok(tall.every(sheet => sheet.width <= 1600 && sheet.height <= 2400));
  const original = contactHtml([{ ...shot(), files: [{ path: "small.webp", bytes: 2 }, { path: 'source&".png', bytes: 3 }] }]);
  assert.match(original, /src="source&amp;%22.png"/);
});

test("contact encoding never exceeds its bounds and spends all quality steps before shrinking", () => {
  for (const [width, height] of [[1600, 2400], [3000, 900], [1000, 20_000]]) {
    let state: Encoding | null = initialEncoding(width, height, true);
    const first = state;
    const attempts: Encoding[] = [];
    while (state) { attempts.push(state); state = nextEncoding(state); }
    assert.ok(attempts.every(state => state.width <= 1600 && state.height <= 2400));
    assert.deepEqual(attempts.slice(0, 6).map(state => state.quality), [85, 70, 55, 40, 25, 20]);
    assert.ok(attempts.slice(0, 6).every(state => state.width === first.width && state.height === first.height));
    assert.ok(attempts[6].width < first.width && attempts[6].height < first.height);
  }
});

const temporary: string[] = [];
after(async () => { for (const dir of temporary) await rm(dir, { recursive: true, force: true }); });

test("CLI prints only contact paths first, includes them in RESULT and lists files on request", async () => {
  const root = await mkdtemp(join(tmpdir(), "kit-shots-cli-"));
  temporary.push(root);
  await mkdir(join(root, "scripts/agents"), { recursive: true });
  await mkdir(join(root, "fixture"));
  const capture = join(root, "capture.mjs");
  await writeFile(capture, `import { writeFileSync } from "node:fs";
import { join } from "node:path";
const { contactSheets, expandMatrix, makeIndex } = await import(process.env.TEST_SHOTS_CORE);
const { options, scenarios, out } = JSON.parse(process.env.ASE_KIT_SHOTS_REQUEST);
const shots = scenarios.flatMap(scenario => expandMatrix(options.widths, options.themes).map(size => ({ ...scenario, ...size, files: [{ path: scenario.screen + size.width + size.theme + ".png", bytes: 10 }], attempts: 1, failures: [], layout: [], ok: true })));
const index = makeIndex(shots);
for (const sheet of contactSheets(shots)) { writeFileSync(join(out, sheet.path), "stub"); index.files.push({ path: sheet.path, bytes: 4 }); }
writeFileSync(join(out, "index.json"), JSON.stringify(index));
console.log("capture diagnostic");
`);
  const port = join(root, "scripts/agents/port.sh");
  await writeFile(port, '#!/bin/sh\nexec "$KIT_NODE" "$TEST_CAPTURE" "$@"\n');
  await chmod(port, 0o755);
  for (const many of [false, true]) for (const files of [false, true]) {
    const out = join(root, `out-${many}-${files}`);
    const args = [...(many ? screens : ["editor"]), "--width", "390,768,1280", "--theme", "light", "--out", out, ...(files ? ["--files"] : [])];
    const result = spawnSync(process.execPath, ["--import", "tsx", resolve("scripts/agents/shots/cli.ts"), ...args], {
      env: { ...process.env, KIT_ROOT: root, KIT_MAIN_ROOT: root, ASE_NATIVE_SAVE_FIXTURE: join(root, "fixture"), TEST_CAPTURE: capture, TEST_SHOTS_CORE: pathToFileURL(resolve("scripts/agents/shots/core.ts")).href }, encoding: "utf8", timeout: 15_000,
    });
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.trim().split("\n");
    const count = many ? 7 : 1;
    const contacts = Array.from({ length: count }, (_, i) => join(out, many ? `contact-${i + 1}.webp` : "contact.webp"));
    assert.deepEqual(lines.slice(0, count), contacts.map(path => `contact: ${path}`));
    assert.ok(lines.at(-1)?.includes(`contact ${contacts[0]}${many ? " +6 more" : ""}`));
    assert.match(result.stderr, /capture diagnostic/);
    assert.doesNotMatch(result.stdout, /capture diagnostic/);
    const index = JSON.parse(await readFile(join(out, "index.json"), "utf8"));
    if (files) {
      assert.ok(lines.includes(`${out}/${index.files[0].path} (10 bytes)`));
      assert.ok(lines.includes(`${out}/index.json`));
    }
    else {
      assert.equal(lines[count], `${index.files.length} files: ${out}/index.json`);
      assert.doesNotMatch(result.stdout, /\.png/);
    }
    assert.equal(lines.filter(line => line.startsWith("RESULT:")).length, 1);
  }
});
