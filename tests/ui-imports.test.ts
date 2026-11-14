import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
// @ts-expect-error The script is plain JavaScript without declarations.
import { importsInScript, importsInStyles, scan, wrongTarget } from "../scripts/agents/ui-imports.mjs";

const script = new URL("../scripts/agents/ui-imports.mjs", import.meta.url).pathname;
const repo = new URL("..", import.meta.url).pathname;

type Found = { line: number; specifier: string };
const lines = (found: Found[]) => found.map(({ line, specifier }) => [line, specifier]);

test("every form of import is read: static, type-only, re-export, side effect and dynamic, over several lines", () => {
  const found: Found[] = importsInScript([
    'import { icon } from "../icons";',
    "import type { IconName } from '../../icons';",
    'export { button } from "./dom";',
    'export * from "./parts/badge";',
    'import "./inline-field.css";',
    "const later = () => import(\"../components/flyout\");",
    "import {",
    "  a,",
    "  b,",
    '} from "../page-builder/media-picker";',
  ].join("\n"));
  assert.deepEqual(lines(found), [
    [1, "../icons"], [2, "../../icons"], [3, "./dom"], [4, "./parts/badge"], [5, "./inline-field.css"],
    [6, "../components/flyout"], [7, "../page-builder/media-picker"],
  ]);
});

test("an import in a comment never counts", () => {
  assert.deepEqual(importsInScript('// import { x } from "../components/a";\n/* import("../workspace-shell") */\nconst a = 1;\n'), []);
});

test("a CSS @import is read in both forms", () => {
  assert.deepEqual(lines(importsInStyles('@import "../components/a.css";\n/* @import "../b.css"; */\n@import url(../theme.css) layer(x);\n')), [
    [1, "../components/a.css"], [3, "../theme.css"],
  ]);
});

test("src/ui/ may import its own files, packages, code outside src/ and the icons; anything else in src/ is a screen", () => {
  const from = "src/ui/parts/badge.ts";
  assert.equal(wrongTarget(from, "./badge-options"), "");
  assert.equal(wrongTarget(from, "../dom"), "");
  assert.equal(wrongTarget(from, "../../icons"), "");
  assert.equal(wrongTarget(from, "../../icons.ts"), "");
  assert.equal(wrongTarget(from, "@preact/signals-core"), "");
  assert.equal(wrongTarget(from, "node:path"), "");
  assert.equal(wrongTarget(from, "../../../shared/css-imports.ts"), "");
  assert.equal(wrongTarget(from, "../../components/flyout"), "src/components/flyout");
  assert.equal(wrongTarget(from, "../../page-builder/media-picker.ts"), "src/page-builder/media-picker.ts");
  assert.equal(wrongTarget(from, "../../workspace-shell"), "src/workspace-shell");
  assert.equal(wrongTarget(from, "../../catalogue/board"), "src/catalogue/board");
  assert.equal(wrongTarget(from, "/src/setup-wizard.ts"), "src/setup-wizard.ts", "a root path from the project counts too");
  assert.equal(wrongTarget(from, "../../icons.css"), "src/icons.css", "only the icons module, not every file named icons");
});

function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "ui-imports-"));
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  for (const [path, text] of Object.entries(files)) write(path, text);
  const run = (...args: string[]) => spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8" });
  return { root, run, write };
}

test("a planted wrong import fails the check with its file, line and target; the tree outside src/ui/ is not read", () => {
  const p = project({
    "src/ui/dom.ts": 'import { icon } from "../icons";\n',
    "src/ui/parts/badge.ts": 'import { escape } from "./escape";\n',
    "src/components/flyout.ts": 'import { button } from "../ui/dom";\n',
  });
  try {
    const ok = p.run("check");
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /RESULT: ok ui-imports 2 files in src\/ui\/ import only src\/ui\/, src\/icons\.ts, packages and code outside src\//);

    p.write("src/ui/parts/badge.ts", 'import { escape } from "./escape";\nimport type { Pane } from "../../page-builder/pane";\n');
    p.write("src/ui/inline-field.css", '@import "../components/flyout.css";\n');
    const wrong = p.run("check");
    assert.equal(wrong.status, 1);
    assert.match(wrong.stderr, /^src\/ui\/parts\/badge\.ts:2: imports src\/page-builder\/pane \("\.\.\/\.\.\/page-builder\/pane"\)/m);
    assert.match(wrong.stderr, /^src\/ui\/inline-field\.css:1: imports src\/components\/flyout\.css/m);
    assert.match(wrong.stderr, /docs\/agents\/parts-plan\.md/);
    assert.match(wrong.stdout, /RESULT: fail ui-imports 2 wrong imports in 2 files/);
    assert.equal(scan(p.root).length, 2);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("--then runs the next script with every argument after it, and either failure fails the check", () => {
  const p = project({ "src/ui/dom.ts": "" });
  try {
    p.write("scripts/next.mjs", "console.log('next got', process.argv.slice(2).join(' '));\n");
    p.write("scripts/bad.mjs", "process.exitCode = 1;\n");
    const ok = p.run("check", "--then", "scripts/next.mjs", "check", "--then", "x.mjs", "src/a.css");
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /next got check --then x\.mjs src\/a\.css/);
    assert.equal(p.run("check", "--then", "scripts/bad.mjs").status, 1);
    p.write("src/ui/dom.ts", 'import "../workspace-shell";\n');
    const both = p.run("check", "--then", "scripts/next.mjs");
    assert.equal(both.status, 1, "the next script still runs, and the wrong import still fails");
    assert.match(both.stdout, /next got/);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("the editor today: nothing in src/ui/ imports from a screen", () => {
  assert.deepEqual(scan(repo), [], "Move the shared piece into src/ui/ (or pass it in as an argument); see docs/agents/parts-plan.md");
});
