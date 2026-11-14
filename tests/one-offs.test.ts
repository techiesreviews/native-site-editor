import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
// @ts-expect-error The script is plain JavaScript without declarations.
import { baselinePath, compare, noVars, oneOffs, readBaseline, scan, tally, total } from "../scripts/agents/one-offs.mjs";

const script = new URL("../scripts/agents/one-offs.mjs", import.meta.url).pathname;
const repo = new URL("..", import.meta.url).pathname;

type Found = { kind: string; line: number; text: string };

test("the seven kinds are found by hand-typed value, with their line", () => {
  const found: Found[] = oneOffs([
    "a {",
    "  padding: 4px 0 var(--space-xs);",
    "  margin: 0;",
    "  border-radius: 999px;",
    "  box-shadow: 0 2px 6px black;",
    "  transition: opacity 120ms ease;",
    "  --local: 3px;",
    "  z-index: 30;",
    "  font-size: 13px;",
    "}",
  ].join("\n"), { file: "src/a.css" });
  assert.deepEqual(found.map(({ kind, line }) => [kind, line]), [
    ["spacing", 2], ["radii", 4], ["shadows", 5], ["timings", 6], ["localProperties", 7], ["zIndex", 8], ["fontSizes", 9],
  ]);
});

test("a token never counts, in any kind", () => {
  assert.deepEqual(oneOffs([
    "a { padding: var(--space-xs); gap: 0; margin: 0px 0 0; border-radius: var(--radius); border-radius: 0; border-radius: inherit;",
    "  box-shadow: var(--shadow); box-shadow: none; transition: opacity var(--dur-hover) var(--ease-out); animation-duration: var(--dur-fly);",
    "  z-index: var(--layer-2); font-size: var(--font-size-s); font-size: 1rem; }",
  ].join("\n")), []);
});

test("a var() fallback holding a px value never counts, in any kind; a raw value beside it still does", () => {
  assert.deepEqual(oneOffs([
    "a { padding: var(--space-s, 4px); margin-inline: var(--gap, 6px) var(--gap, 6px); border-radius: var(--radius, 6px);",
    "  box-shadow: var(--shadow, 0 2px 6px black); transition: opacity var(--dur-hover, 120ms); z-index: var(--layer, 5);",
    "  font-size: var(--size, 13px); }",
  ].join("\n")), []);
  assert.deepEqual(oneOffs("a { padding: var(--space-s, 4px) 10px; }").map(({ kind }: Found) => kind), ["spacing"]);
});

test("custom properties with digits, capitals or underscores count; property names are read whole and case-insensitively", () => {
  const found: Found[] = oneOffs("a { --space-2: 10px; --Pad_Big: 3px; --x2y: 1; padding: var(--space-2); PADDING: 10px; Z-Index: 3; }", { file: "src/a.css" });
  assert.deepEqual(found.map(({ kind, text }) => [kind, text]), [
    ["localProperties", "--space-2: 10px"], ["localProperties", "--Pad_Big: 3px"], ["localProperties", "--x2y: 1"],
    ["spacing", "PADDING: 10px"], ["zIndex", "Z-Index: 3"],
  ]);
  assert.deepEqual(oneOffs("a { --space-2: 10px; }", { file: "src/theme.css" }), []);
});

test("a component's own hooks on the components layer count as the property they stand for", () => {
  const component = [
    "@layer components {",
    "  .btn {",
    "    --btn-padding-block: 6px;",
    "    --btn-padding-inline: var(--space-s);",
    "    --btn-radius: 8px;",
    "    --btn-font-size: 13px;",
    "    --btn-font-weight: 600;",
    "    --btn-background: var(--primary);",
    "    --btn-hover-background: linear-gradient(var(--hover) 0 0), var(--surface);",
    "    --btn-icon-gap: 13px;",
    "    --btn-hover-shadow: 0 2px 4px black;",
    "    --btn-corner: 8px;",
    "    --btn-press-duration: 90ms;",
    "  }",
    "}",
  ].join("\n");
  // A hook that ends in a counted property counts as it (icon-gap as gap, hover-shadow as a shadow); one that ends in
  // none still counts as a local property when it holds a hand-typed length or time.
  assert.deepEqual(oneOffs(component, { file: "src/ui/parts/button.css" }).map(({ kind, line }: Found) => [kind, line]), [
    ["spacing", 3], ["radii", 5], ["fontSizes", 6], ["spacing", 10], ["shadows", 11], ["localProperties", 12], ["timings", 13],
  ]);
  // Any length unit counts, the newer viewport, line-height and container units too; a hex colour or a weight does not.
  const units = ["@layer components {", "  .btn {", "    --btn-min-block-size: 2lh;", "    --btn-max: 100dvh;", "    --btn-wide: 10cqw;",
    "    --btn-tint: #1a2b3c;", "    --btn-weight: 600;", "  }", "}"].join("\n");
  assert.deepEqual(oneOffs(units, { file: "src/ui/parts/x.css" }).map(({ kind, line }: Found) => [kind, line]), [
    ["localProperties", 3], ["localProperties", 4], ["localProperties", 5],
  ]);
  // Only inside the components block: a custom property elsewhere in the same file is still a local one.
  const outside = [":root { --panel-gap: 10px; --panel-colour: red; }", "@layer components {", "  .btn { --btn-gap: 12px; }", "}"].join("\n");
  assert.deepEqual(oneOffs(outside, { file: "src/ui/parts/x.css" }).map(({ kind, line }: Found) => [kind, line]), [
    ["localProperties", 1], ["localProperties", 1], ["spacing", 3],
  ]);
  // Off the components layer, a custom property is still a local one, whatever it is named.
  assert.deepEqual(oneOffs(".btn { --btn-background: var(--primary); }", { file: "src/a.css" }).map(({ kind }: Found) => kind), ["localProperties"]);
});

test("signed times count, a negative delay included; a name that ends in a time does not", () => {
  assert.deepEqual(oneOffs("a { animation-delay: -120ms; transition-delay: +0.5s; }").map(({ kind }: Found) => kind), ["timings", "timings"]);
  assert.deepEqual(oneOffs("a { animation-delay: var(--dur-delay); animation-name: fade-2s; animation: fade-2s var(--dur-fly); }"), []);
  assert.equal(oneOffs("a { animation: fade-2s 1s; }").length, 1);
});

test("a nested var() fallback is removed whole, so a token inside a token never counts", () => {
  assert.equal(noVars("var(--pad, var(--small) 10px) 4px"), " 4px");
  assert.equal(noVars("calc(var(--a, calc(1px + 2px)) + 3px)"), "calc( + 3px)");
  assert.equal(noVars("VAR(--a, 5px) 1px"), " 1px");
  assert.equal(noVars("var(--a"), "");
  assert.deepEqual(oneOffs("a { padding: var(--pad, var(--small) 10px); border-radius: var(--r, var(--s) 6px); transition: opacity var(--d, var(--e) 120ms); }"), []);
  assert.deepEqual(oneOffs("a { padding: var(--pad, var(--small)) 10px; }").map(({ kind }: Found) => kind), ["spacing"]);
});

test("comments are ignored but keep line numbers; theme.css may hold its own custom properties", () => {
  const text = "/* padding: 10px;\n   z-index: 9; */\na { padding: 10px; }\n";
  assert.deepEqual(oneOffs(text).map(({ kind, line }: Found) => [kind, line]), [["spacing", 3]]);
  assert.deepEqual(oneOffs("a { --x: 4px; }", { file: "src/theme.css" }), []);
  assert.equal(oneOffs("a { --x: 4px; }", { file: "src/b.css" }).length, 1);
});

test("a rise is found per file and kind; a new file rises from zero; a fall includes a deleted file", () => {
  const baseline = { "src/a.css": { spacing: 2, radii: 1 }, "src/gone.css": { spacing: 3 } };
  const current = { "src/a.css": { spacing: 3, radii: 1 }, "src/new.css": { zIndex: 1 } };
  assert.deepEqual(compare(baseline, current), {
    rises: [{ file: "src/a.css", kind: "spacing", was: 2, now: 3 }, { file: "src/new.css", kind: "zIndex", was: 0, now: 1 }],
    falls: [{ file: "src/gone.css", kind: "spacing", was: 3, now: 0 }],
  });
  assert.equal(total({ "src/a.css": { spacing: 3, radii: 1 }, "src/b.css": { zIndex: 2 } }), 6);
  assert.deepEqual(tally(oneOffs("a { padding: 1px; margin: 2px; }")), { spacing: 2 });
});

function project(css: string) {
  const root = mkdtempSync(join(tmpdir(), "one-offs-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "scripts/agents"), { recursive: true });
  writeFileSync(join(root, "src/a.css"), css);
  const run = (...args: string[]) => spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8", env: { ...process.env, ASE_OWNER: "fleet-lead" } });
  const baseline = () => JSON.parse(readFileSync(join(root, baselinePath), "utf8"));
  return { root, run, baseline, write: (text: string) => writeFileSync(join(root, "src/a.css"), text) };
}

test("a diff that adds a raw padding: 10px fails the check; a token swap lowers the count and rewrites the file", () => {
  const p = project(".x { padding: 8px; }\n");
  try {
    assert.equal(p.run("update").status, 0);
    assert.deepEqual(p.baseline().files, { "src/a.css": { spacing: 1 } });
    assert.equal(p.run("check").status, 0);

    p.write(".x { padding: 8px; }\n.y { padding: 10px; }\n");
    const rise = p.run("check");
    assert.equal(rise.status, 1);
    assert.match(rise.stderr, /^src\/a\.css:1: spacing \(px margin, padding or gap\) rose from 1 to 2 \(lines 1, 2\)/m);
    assert.match(rise.stdout, /RESULT: fail one-offs rose by 1 in 1 file/);
    assert.deepEqual(p.baseline().files, { "src/a.css": { spacing: 1 } }, "a rise never rewrites the count");

    p.write(".x { padding: var(--space-xs); }\n");
    const fall = p.run("check");
    assert.equal(fall.status, 0);
    assert.match(fall.stdout, /RESULT: ok one-offs fell by 1 in 1 file, 0 left; scripts\/agents\/one-offs\.json rewritten/);
    assert.deepEqual(p.baseline().files, {});
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("update raises a count only with a written reason from a lead, and records it", () => {
  const p = project(".x { padding: 8px; }\n");
  try {
    p.run("update");
    p.write(".x { padding: 8px; }\n.y { padding: 10px; }\n");
    const bare = p.run("update");
    assert.equal(bare.status, 1);
    assert.match(bare.stdout, /update needs --waive for a rise/);
    assert.equal(p.baseline().files["src/a.css"].spacing, 1);

    const notLead = spawnSync(process.execPath, [script, "--root", p.root, "update", "--waive", "board needs it"], { encoding: "utf8", env: { ...process.env, ASE_OWNER: "builder-one" } });
    assert.equal(notLead.status, 1);
    assert.match(notLead.stderr, /requires a \*-lead owner/);

    const waived = p.run("update", "--waive", "  board  needs it ");
    assert.equal(waived.status, 0);
    assert.equal(p.baseline().files["src/a.css"].spacing, 2);
    assert.deepEqual(p.baseline().waivers.map(({ file, kind, from, to, reason }: Record<string, unknown>) => ({ file, kind, from, to, reason })),
      [{ file: "src/a.css", kind: "spacing", from: 1, to: 2, reason: "board needs it" }]);
    assert.equal(p.run("check").status, 0);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("paths the kit appends go to the --then script, and it runs the colour check beside the count", () => {
  const p = project(".x { padding: 8px; }\n");
  try {
    p.run("update");
    writeFileSync(join(p.root, "scripts/ok.mjs"), "console.log('colours ok', process.argv.slice(2).join(' '));\n");
    writeFileSync(join(p.root, "scripts/bad.mjs"), "console.error('colours bad'); process.exitCode = 1;\n");
    const ok = p.run("check", "--then", "scripts/ok.mjs", "src/a.css");
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /colours ok src\/a\.css/);
    const bad = p.run("check", "--then", "scripts/bad.mjs", "src/a.css");
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /RESULT: ok one-offs/);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("update takes the owner from .scratch/owner when ASE_OWNER is not set", () => {
  const p = project(".x { padding: 8px; }\n");
  try {
    p.run("update");
    p.write(".x { padding: 8px; }\n.y { padding: 10px; }\n");
    mkdirSync(join(p.root, ".scratch"));
    const env = { ...process.env, ASE_OWNER: "" };
    const waive = () => spawnSync(process.execPath, [script, "--root", p.root, "update", "--waive", "x"], { encoding: "utf8", env });
    writeFileSync(join(p.root, ".scratch/owner"), "2026-11-10T10:00:00Z builder-one ignored\n");
    assert.equal(waive().status, 1);
    assert.equal(p.baseline().files["src/a.css"].spacing, 1);
    writeFileSync(join(p.root, ".scratch/owner"), "2026-11-10T10:00:00Z fleet-lead ignored\n");
    assert.equal(waive().status, 0);
    assert.equal(p.baseline().files["src/a.css"].spacing, 2);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("the kit's own checks.css value runs as the kit runs it and never leaves the tree dirty", () => {
  const settings = JSON.parse(readFileSync(join(repo, "scripts/agents/kit.json"), "utf8"));
  const [name, ...argv] = String(settings.checks.css).trim().split(/\s+/);
  assert.equal(name, "node");
  assert.ok(argv.includes("scripts/agents/one-offs.mjs"), "the css check still runs the one-offs count");
  const p = project(".x { padding: 8px; }\n");
  try {
    copyFileSync(script, join(p.root, "scripts/agents/one-offs.mjs"));
    // The command runs the copy counter first (scripts/agents/copies.mjs), which hands on to this count.
    copyFileSync(join(repo, "scripts/agents/copies.mjs"), join(p.root, "scripts/agents/copies.mjs"));
    copyFileSync(join(repo, "scripts/check-colours.mjs"), join(p.root, "scripts/check-colours.mjs"));
    writeFileSync(join(p.root, "scripts/check-colours.allow.json"), "[]\n");
    p.run("update");
    assert.equal(spawnSync(process.execPath, ["scripts/agents/copies.mjs", "update"], { cwd: p.root, encoding: "utf8" }).status, 0);
    const before = readFileSync(join(p.root, baselinePath), "utf8");
    const kit = () => spawnSync(process.execPath, [...argv, "src/a.css"], { cwd: p.root, encoding: "utf8" });
    const same = () => assert.equal(readFileSync(join(p.root, baselinePath), "utf8"), before, "the kit's command must not write the count");

    assert.equal(kit().status, 0);
    same();

    p.write(".x { padding: var(--space-xs); }\n");
    const fall = kit();
    assert.equal(fall.status, 1);
    assert.match(fall.stderr, /run node scripts\/agents\/one-offs\.mjs update and commit it/);
    assert.match(fall.stdout, /RESULT: fail one-offs fell by 1 in 1 file and scripts\/agents\/one-offs\.json was not updated/);
    same();

    p.write(".x { padding: 8px; }\n.y { padding: 10px; }\n");
    assert.equal(kit().status, 1);
    same();

    p.write(".x { padding: 8px; color: red; }\n");
    const colour = kit();
    assert.equal(colour.status, 1, "the colour check still runs beside the count");
    assert.match(colour.stderr, /src\/a\.css:1:/);
    same();
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("without --no-write a fall rewrites the count, and --no-write leaves it alone", () => {
  const p = project(".x { padding: 8px; }\n");
  try {
    p.run("update");
    p.write(".x { padding: var(--space-xs); }\n");
    const before = readFileSync(join(p.root, baselinePath), "utf8");
    assert.equal(p.run("check", "--no-write").status, 1);
    assert.equal(readFileSync(join(p.root, baselinePath), "utf8"), before);
    assert.equal(p.run("update").status, 0, "a fall needs no waiver");
    assert.deepEqual(p.baseline().files, {});
    assert.equal(p.run("check", "--no-write").status, 0);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("report lists every counted value with file and line, as JSON for the board too", () => {
  const p = project(".x {\n  padding: 8px;\n  z-index: 4;\n}\n");
  try {
    const text = p.run("report");
    assert.match(text.stdout, /src\/a\.css: spacing 1, zIndex 1\n  src\/a\.css:2: spacing: padding: 8px\n  src\/a\.css:3: zIndex: z-index: 4\n/);
    const json = JSON.parse(p.run("report", "--json").stdout);
    assert.equal(json.total, 2);
    assert.deepEqual(json.files["src/a.css"].counts, { spacing: 1, zIndex: 1 });
    assert.deepEqual(json.files["src/a.css"].untraced[0], { kind: "spacing", line: 2, text: "padding: 8px" });
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("the committed count equals the editor's CSS: a rise is waived and a fall is committed", () => {
  const found: Record<string, Found[]> = scan(repo);
  const current = Object.fromEntries(Object.entries(found).map(([file, list]) => [file, tally(list)]));
  const { rises, falls } = compare(readBaseline(repo).files, current);
  assert.deepEqual(rises, [], "a CSS file gained hand-typed values: use a token, or have a lead run `node scripts/agents/one-offs.mjs update --waive \"<reason>\"` and commit the file");
  assert.deepEqual(falls, [], "a CSS file lost hand-typed values: run `node scripts/agents/one-offs.mjs update` and commit scripts/agents/one-offs.json");
});
