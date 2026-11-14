import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
// @ts-expect-error The script is plain JavaScript without declarations.
import { baselinePath, byKind, compare, copiesInScript, copiesInStyles, readBaseline, scan, styleRules, tally } from "../scripts/agents/copies.mjs";

const script = new URL("../scripts/agents/copies.mjs", import.meta.url).pathname;
const repo = new URL("..", import.meta.url).pathname;

type Found = { kind: string; line: number; text: string };
const kindsAndLines = (found: Found[]) => found.map(({ kind, line }) => [kind, line]);

test("a button or dialog made by hand counts; the button() helper and comments never do", () => {
  const found: Found[] = copiesInScript([
    'const a = node("button", "x", "Go");',
    "const b = button(\"Go\", go);",
    "const c = document.createElement('button');",
    "// node(\"button\") in a comment",
    'const d = `<button type="button">x</button>`;',
    'const e = node("dialog", "x");',
    "/* <dialog> */ const f = `<dialog open>`;",
    'const url = "https://x.test/"; const g = node("buttons");',
  ].join("\n"));
  assert.deepEqual(kindsAndLines(found), [["buttons", 1], ["buttons", 3], ["buttons", 5], ["dialogs", 6], ["dialogs", 7]]);
});

test("style rules resolve nesting, see through at-rules and keep their first line", () => {
  const rules = styleRules([
    "@layer components {",
    "  .menu {",
    "    color: red;",
    "    & .menu__button, .x { background: blue; }",
    "    @media (hover: hover) { &:hover { border: 0; } }",
    "  }",
    "}",
  ].join("\n"));
  assert.deepEqual(rules.map(({ selectors, line }: { selectors: string[]; line: number }) => [selectors, line]), [
    [[".menu"], 2], [[".menu .menu__button", ".menu .x"], 4], [[".menu:hover"], 5],
  ]);
  assert.deepEqual(rules[0].declarations, [{ name: "color", value: "red" }]);
});

test("a look on something named as a button, a badge or a dialog counts once per look", () => {
  const found: Found[] = copiesInStyles([
    ".bar__button { background: var(--surface); }",
    ".bar__button:hover, .bar__button.is-on { background: var(--hover); }",
    ".bar__button--big { border-radius: var(--radius); }",
    ".bar button { border: 0; }",
    ".bar__count { border-radius: var(--radius-full); }",
    ".slot-chip--items { background: var(--surface); }",
    ".sheet::backdrop { background: rgb(0 0 0 / 40%); }",
    ".create-dialog { box-shadow: var(--elevation-4); }",
    ".create-dialog__kinds { border: 1px solid; }",
  ].join("\n"));
  assert.deepEqual(kindsAndLines(found), [
    ["buttonLooks", 1], ["buttonLooks", 4], ["badgeLooks", 5], ["badgeLooks", 6], ["dialogLooks", 7], ["dialogLooks", 8],
  ]);
});

test("placing, sizing or setting a part's hooks never counts, nor a look on a name that only sounds alike", () => {
  assert.deepEqual(copiesInStyles([
    ".bar__button { margin: 0; inline-size: 100%; color: var(--text); }",
    ".bar .button { --btn-background: var(--danger); }",
    ".account-summary { background: var(--surface); }",
    ".buttons-row { background: var(--surface); }",
    "/* .x__button { background: red; } */",
  ].join("\n")), []);
});

test("compare finds rises and falls per file and kind; totals name every kind", () => {
  const baseline = { "src/a.css": { buttonLooks: 2 }, "src/gone.ts": { buttons: 3 } };
  const current = { "src/a.css": { buttonLooks: 3 }, "src/new.ts": { dialogs: 1 } };
  assert.deepEqual(compare(baseline, current), {
    rises: [{ file: "src/a.css", kind: "buttonLooks", was: 2, now: 3 }, { file: "src/new.ts", kind: "dialogs", was: 0, now: 1 }],
    falls: [{ file: "src/gone.ts", kind: "buttons", was: 3, now: 0 }],
  });
  assert.deepEqual(byKind(current), { buttons: 0, dialogs: 1, buttonLooks: 3, badgeLooks: 0, dialogLooks: 0 });
  assert.deepEqual(tally(copiesInScript('node("button"); node("button");')), { buttons: 2 });
});

function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "copies-"));
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  for (const [path, text] of Object.entries(files)) write(path, text);
  mkdirSync(join(root, "scripts/agents"), { recursive: true });
  const run = (...args: string[]) => spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8", env: { ...process.env, ASE_OWNER: "fleet-lead" } });
  const baseline = () => JSON.parse(readFileSync(join(root, baselinePath), "utf8"));
  return { root, run, baseline, write };
}

test("a part's own files and the design board never count", () => {
  const p = project({
    "src/ui/dom.ts": 'export const b = () => node("button");\n',
    "src/ui/parts/button.css": ".button { background: var(--primary); }\n",
    "src/catalogue/board.ts": 'node("button");\n',
    "src/a.ts": 'node("button");\n',
  });
  try {
    assert.deepEqual(Object.keys(scan(p.root)), ["src/a.ts"]);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("a planted copy fails the check and never rewrites the count; a fall fails until update is committed", () => {
  const p = project({ "src/a.ts": 'node("button");\n' });
  try {
    const missing = p.run("check");
    assert.equal(missing.status, 1);
    assert.match(missing.stdout, /RESULT: fail copies no committed count/);

    assert.equal(p.run("update").status, 0);
    assert.deepEqual(p.baseline().files, { "src/a.ts": { buttons: 1 } });
    assert.deepEqual(p.baseline().totals, { buttons: 1, dialogs: 0, buttonLooks: 0, badgeLooks: 0, dialogLooks: 0 });
    assert.match(p.run("check").stdout, /RESULT: ok copies 1 home-made copies in 1 file, none above/);

    p.write("src/a.ts", 'node("button");\nnode("button");\n');
    p.write("src/b.css", ".b__badge { background: var(--surface); }\n");
    const rise = p.run("check");
    assert.equal(rise.status, 1);
    assert.match(rise.stderr, /^src\/a\.ts:1: buttons \(button element made by hand instead of button\(\) from src\/ui\/dom\.ts\) rose from 1 to 2 \(lines 1, 2\)/m);
    assert.match(rise.stderr, /^src\/b\.css:1: badgeLooks .* rose from 0 to 1/m);
    assert.match(rise.stdout, /RESULT: fail copies rose by 2 in 2 files/);
    assert.deepEqual(p.baseline().files, { "src/a.ts": { buttons: 1 } }, "a rise never rewrites the count");

    p.write("src/a.ts", 'button("Go", go);\n');
    rmSync(join(p.root, "src/b.css"));
    const fall = p.run("check");
    assert.equal(fall.status, 1);
    assert.match(fall.stderr, /run node scripts\/agents\/copies\.mjs update and commit it/);
    assert.match(fall.stdout, /RESULT: fail copies fell by 1 in 1 file and scripts\/agents\/copies\.json was not updated/);
    assert.equal(p.run("update").status, 0);
    assert.deepEqual(p.baseline().files, {});
    assert.equal(p.run("check").status, 0);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("update raises a count only with a written reason from a lead, and records it", () => {
  const p = project({ "src/a.ts": 'node("button");\n' });
  try {
    p.run("update");
    p.write("src/a.ts", 'node("button");\nnode("dialog");\n');
    const bare = p.run("update");
    assert.equal(bare.status, 1);
    assert.match(bare.stdout, /update needs --waive for a rise/);

    const notLead = spawnSync(process.execPath, [script, "--root", p.root, "update", "--waive", "needed"], { encoding: "utf8", env: { ...process.env, ASE_OWNER: "builder-one" } });
    assert.equal(notLead.status, 1);
    assert.match(notLead.stderr, /requires a \*-lead owner/);

    assert.equal(p.run("update", "--waive", "  one-off  sheet ").status, 0);
    assert.deepEqual(p.baseline().files, { "src/a.ts": { buttons: 1, dialogs: 1 } });
    assert.deepEqual(p.baseline().waivers.map(({ file, kind, from, to, reason }: Record<string, unknown>) => ({ file, kind, from, to, reason })),
      [{ file: "src/a.ts", kind: "dialogs", from: 0, to: 1, reason: "one-off sheet" }]);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("--then runs the next script with every argument after it, and its failure fails the check", () => {
  const p = project({ "src/a.ts": "" });
  try {
    p.run("update");
    p.write("scripts/next.mjs", "console.log('next got', process.argv.slice(2).join(' '));\n");
    p.write("scripts/bad.mjs", "process.exitCode = 1;\n");
    const ok = p.run("check", "--then", "scripts/next.mjs", "check", "--no-write", "src/a.css");
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /next got check --no-write src\/a\.css/);
    assert.equal(p.run("check", "--then", "scripts/bad.mjs").status, 1);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("the committed count matches the editor today: copies may only go down", () => {
  const committed = readBaseline(repo);
  assert.ok(committed, `${baselinePath} is committed`);
  const current = Object.fromEntries(Object.entries(scan(repo) as Record<string, Found[]>).map(([file, found]) => [file, tally(found)]));
  const { rises, falls } = compare(committed.files, current);
  assert.deepEqual(rises, [], "Copies rose: reuse the part from docs/agents/parts.md, or a lead waives with node scripts/agents/copies.mjs update --waive");
  assert.deepEqual(falls, [], "Copies fell: run node scripts/agents/copies.mjs update and commit scripts/agents/copies.json");
});
