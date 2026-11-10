import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
// @ts-expect-error The script is plain JavaScript without declarations.
import { checkTheme, currentBlock, exportTokens, files, generatedBlock, parseExport, toEditorPx, withBlock } from "../scripts/tokens-from-framework.mjs";

const theme = readFileSync(files.theme, "utf8");
const exported = readFileSync(files.exported, "utf8");

test("running the script on the committed export reproduces theme.css's generated block byte for byte", () => {
  assert.equal(currentBlock(theme), generatedBlock(exported));
  assert.equal(withBlock(theme, generatedBlock(exported)), theme);
  assert.deepEqual(checkTheme(theme, exported), []);
});

test("the generated block holds the spacing steps and the pill corner in the editor's pixels", () => {
  const block = generatedBlock(exported);
  for (const line of ["--space-4xs: 2px;", "--space-3xs: 4px;", "--space-2xs: 6px;", "--space-xs: 8px;", "--space-s: 12px;", "--space-m: 16px;", "--space-l: 24px;", "--radius-full: 999px;"]) {
    assert.ok(block.includes(`  ${line}`), line);
  }
  assert.match(block, new RegExp(`content hash ${parseExport(exported).hash}`));
});

test("a hand edit of the generated block, a changed export or removed markers fail the check", () => {
  const edited = theme.replace("--space-xs: 8px;", "--space-xs: 9px;");
  assert.notEqual(edited, theme);
  assert.equal(checkTheme(edited, exported).length, 1);
  assert.equal(checkTheme(theme, exported.replace("--radius-full: 999rem", "--radius-full: 1rem")).length, 1);
  assert.equal(checkTheme(theme.replace("/* ---- end generated ---- */", ""), exported).length, 1);
  assert.throws(() => withBlock("a {}", generatedBlock(exported)), /no generated block/);
});

test("an edit outside the generated block does not fail the check", () => {
  assert.deepEqual(checkTheme(theme.replace("--radius: 6px;", "--radius: 7px;"), exported), []);
});

test("rem converts from the Framework's 16px to pixels, fixed sizes only", () => {
  assert.equal(toEditorPx("--a", "0.5rem"), "8px");
  assert.equal(toEditorPx("--a", "clamp(0.375rem, calc(0.375rem + 0vw), 0.375rem)"), "6px");
  assert.equal(toEditorPx("--a", "999rem"), "999px");
  assert.throws(() => toEditorPx("--a", "clamp(1rem, calc(0.5rem + 1vw), 2rem)"), /fluid/);
  assert.throws(() => toEditorPx("--a", "12px"), /not in rem/);
});

test("an export without a hash, a :root block or properties is refused", () => {
  assert.throws(() => parseExport(":root { --a: 1rem; }"), /Content hash/);
  assert.throws(() => parseExport("/* Content hash: ab */ a {}"), /:root/);
  assert.throws(() => parseExport("/* Content hash: ab */ :root { }"), /custom properties/);
});

test("the check command passes on the committed files", () => {
  const run = spawnSync(process.execPath, ["scripts/tokens-from-framework.mjs", "check"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /RESULT: ok tokens in step/);
});

// Needs the Framework checkout; CI and self-hosted copies skip it.
const frameworkDir = process.env.FRAMEWORK_DIR ?? join(homedir(), "Projects/TechiesTools");
test("the Framework's own export of the committed settings is the committed export", { skip: !existsSync(join(frameworkDir, "src/framework/compiler/index.ts")) }, async () => {
  assert.equal(await exportTokens(JSON.parse(readFileSync(files.settings, "utf8")), frameworkDir), exported);
});
