import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
// @ts-expect-error The script is plain JavaScript without declarations.
import { build, listPath, optionLists, purpose, uiFiles } from "../scripts/agents/parts-list.mjs";

const script = new URL("../scripts/agents/parts-list.mjs", import.meta.url).pathname;
const repo = new URL("..", import.meta.url).pathname;

test("a file's purpose is the first sentence of its leading comment, without ticket references", () => {
  assert.equal(purpose([
    'import { node } from "../ui/dom";',
    "",
    "// The publish menu (slice 30, ticket 58): the changes to save. It loads on first",
    "// use.",
    "export const x = 1;",
  ].join("\n")), "The publish menu: the changes to save.");
  assert.equal(purpose("/**\n * A splitter that resizes a panel\n * and toggles it.\n */\nexport {};"), "A splitter that resizes a panel and toggles it.");
  assert.equal(purpose("/* Inline fields (TOOLS-12): plain text until focus. */\n.x {}"), "Inline fields: plain text until focus.");
  assert.equal(purpose("export const x = 1;\n// Too late to count.\n"), "");
  assert.equal(purpose('import {\n  a,\n  b,\n} from "./x";\nimport "./y.css";\n// The sheet: one row per file.\nexport {};'), "The sheet: one row per file.");
});

test("an options file's exported lists become its variants", () => {
  assert.deepEqual(optionLists([
    'export const BADGE_KINDS = ["count", "status"] as const;',
    "export const ICON_SIZES = [12, 16] as const;",
    'const HIDDEN = ["x"] as const;',
  ].join("\n")), ["kinds: count, status", "sizes: 12, 16"]);
});

function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "parts-list-"));
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  for (const [path, text] of Object.entries(files)) write(path, text);
  const run = (command: string) => spawnSync(process.execPath, [script, "--root", root, command], { encoding: "utf8" });
  return { root, write, run, list: () => readFileSync(join(root, listPath), "utf8") };
}

const source = (parts: unknown[], screens: Record<string, string> = {}) => JSON.stringify({ parts, screens });
const badge = {
  id: "badge", name: "Badge", group: "part", for: "A count or a status.", use: "`badgePart(options)`",
  files: ["src/ui/parts/badge.ts", "src/ui/parts/badge-options.ts", "src/ui/parts/badge.css"],
};

test("every UI file is listed: parts by hand, screens from the code with their styles and tests", () => {
  const p = project({
    "docs/agents/parts.json": source([badge]),
    "src/ui/parts/badge.ts": 'export const badgePart = () => document.createElement("span");\n',
    "src/ui/parts/badge-options.ts": 'export const BADGE_TONES = ["neutral", "danger"] as const;\n',
    "src/ui/parts/badge.css": ".ui-badge {}\n",
    "src/components/publish-menu.ts": '// The Save menu: the changes to save.\nexport const m = () => node("div");\n',
    "src/components/publish-menu.css": ".publish-menu {}\n",
    "src/page-builder/maths.ts": "export const add = (a: number, b: number) => a + b;\n",
    "src/page-builder/opener.ts": "// Opens the page's <dialog> from elsewhere.\nexport const open = (d: { showModal(): void }) => d.showModal();\n",
    "src/components/preview-menu.ts": "// The preview row, built from the sharing row.\nexport const row = () => shareRow();\n",
    "src/page-builder/busy-lock.ts": "// The busy lock's Cancel.\nexport const cancel = (label: string) => button(label, stop);\n",
    "src/catalogue/board.ts": 'node("div");\n',
    "tests/badge.test.ts": 'import { badgePart } from "../src/ui/parts/badge";\n',
    "tests/publish.test.ts": 'readFileSync("src/components/publish-menu.css");\n',
  });
  try {
    assert.deepEqual(uiFiles(p.root), [
      "src/components/preview-menu.ts", "src/components/publish-menu.css", "src/components/publish-menu.ts", "src/page-builder/busy-lock.ts",
      "src/ui/parts/badge-options.ts", "src/ui/parts/badge.css", "src/ui/parts/badge.ts",
    ], "every file in a component folder is UI; elsewhere, one that builds elements");
    assert.equal(p.run("write").status, 0);
    const list = p.list();
    assert.match(list, /### Badge\n\n- \*\*For:\*\* A count or a status\.\n- \*\*Use:\*\* `badgePart\(options\)`\n- \*\*Variants:\*\* tones: neutral, danger\n/);
    assert.match(list, /- \*\*Options:\*\* `src\/ui\/parts\/badge-options\.ts`\n- \*\*Tests:\*\* `tests\/badge\.test\.ts`/);
    assert.match(list, /^\| Publish menu \| The Save menu: the changes to save\. \| `src\/components\/publish-menu\.ts` `src\/components\/publish-menu\.css` \| `tests\/publish\.test\.ts` \|$/m);
    assert.match(list, /^\| Preview menu \| The preview row, built from the sharing row\. \|/m);
    assert.doesNotMatch(list, /maths|opener|board/, "plumbing outside the component folders (an element named in a comment too) and the design board are not UI");
    assert.equal(p.run("check").status, 0);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("a new screen file makes the list out of date, and one with no purpose fails until it is described", () => {
  const p = project({
    "docs/agents/parts.json": source([badge]),
    "src/ui/parts/badge.ts": "", "src/ui/parts/badge-options.ts": "", "src/ui/parts/badge.css": "",
  });
  try {
    p.run("write");
    p.write("src/components/new-sheet.css", ".new-sheet { padding: 0; }\n");
    const stale = p.run("check");
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /src\/components\/new-sheet\.css: no leading comment says what it is for/);
    assert.match(stale.stderr, /docs\/agents\/parts\.md is out of date: run node scripts\/agents\/parts-list\.mjs write/);

    p.write("docs/agents/parts.json", source([badge], { "src/components/new-sheet.css": "A sheet for new things." }));
    assert.equal(p.run("write").status, 0);
    assert.match(p.list(), /^\| New sheet \| A sheet for new things\. \|/m);
    assert.equal(p.run("check").status, 0);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("a listed file that is gone, a part without its purpose, or a description of no screen file is a problem", () => {
  const p = project({
    "docs/agents/parts.json": source([{ ...badge, for: "" }], { "src/gone.ts": "Gone.", "src/maths.ts": "Sums." }),
    "src/ui/parts/badge.ts": "", "src/ui/parts/badge-options.ts": "", "src/maths.ts": "export const add = (a: number, b: number) => a + b;\n",
  });
  try {
    const { problems } = build(p.root);
    assert.deepEqual(problems, [
      "docs/agents/parts.json: badge has no for",
      "docs/agents/parts.json: badge lists src/ui/parts/badge.css, which does not exist",
      "docs/agents/parts.json: screens describes src/gone.ts, which does not exist",
      "docs/agents/parts.json: screens describes src/maths.ts, which is not a screen file on the list; remove it",
    ]);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("--then runs the next script after the check, and its failure fails the command", () => {
  const p = project({ "docs/agents/parts.json": source([]), "scripts/next.mjs": "console.log('next got', process.argv.slice(2).join(' '));\n", "scripts/bad.mjs": "process.exitCode = 1;\n" });
  try {
    p.run("write");
    const ok = spawnSync(process.execPath, [script, "--root", p.root, "check", "--then", "scripts/next.mjs", "check", "src/a.css"], { encoding: "utf8" });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /next got check src\/a\.css/);
    assert.equal(spawnSync(process.execPath, [script, "--root", p.root, "check", "--then", "scripts/bad.mjs"], { encoding: "utf8" }).status, 1);
  } finally { rmSync(p.root, { recursive: true, force: true }); }
});

test("the editor's parts list is current: every UI component is listed", () => {
  const result = spawnSync(process.execPath, [script, "check"], { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stderr}${result.stdout}`);
});
