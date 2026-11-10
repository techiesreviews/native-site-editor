import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
// @ts-expect-error The script is plain JavaScript without declarations.
import { baselinePath, compare, oneOffs, readBaseline, scan, tally, total } from "../scripts/agents/one-offs.mjs";

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

test("paths the kit appends are ignored, and --then runs the colour check beside the count", () => {
  const p = project(".x { padding: 8px; }\n");
  try {
    p.run("update");
    writeFileSync(join(p.root, "scripts/ok.mjs"), "console.log('colours ok');\n");
    writeFileSync(join(p.root, "scripts/bad.mjs"), "console.error('colours bad'); process.exitCode = 1;\n");
    const ok = p.run("check", "--then", "scripts/ok.mjs", "src/a.css");
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /colours ok/);
    const bad = p.run("check", "--then", "scripts/bad.mjs", "src/a.css");
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /RESULT: ok one-offs/);
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

test("the editor's CSS holds no more hand-typed values than the committed count", () => {
  const found: Record<string, Found[]> = scan(repo);
  const current = Object.fromEntries(Object.entries(found).map(([file, list]) => [file, tally(list)]));
  const { rises } = compare(readBaseline(repo).files, current);
  assert.deepEqual(rises, [], "a CSS file gained hand-typed values: use a token, or have a lead run `node scripts/agents/one-offs.mjs update --waive \"<reason>\"`");
});
