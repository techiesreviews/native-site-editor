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

test("a generated name declared again outside the block fails the check; mentions in comments and uses do not", () => {
  const override = theme.replace("  --radius: 6px;", "  --radius: 6px;\n  --space-s: 13px;");
  assert.notEqual(override, theme);
  const problems = checkTheme(override, exported);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /--space-s/);
  assert.deepEqual(checkTheme(theme.replace("--radius: 6px;", "--radius: 6px; /* --space-s: 13px; */ --gap: var(--space-s);"), exported), []);
});

test("an edit outside the generated block does not fail the check", () => {
  assert.deepEqual(checkTheme(theme.replace("--radius: 6px;", "--radius: 7px;"), exported), []);
});

test("rem converts from the Framework's 16px to pixels, fixed sizes only", () => {
  assert.equal(toEditorPx("--a", "0.5rem"), "8px");
  assert.equal(toEditorPx("--a", "clamp(0.375rem, calc(0.375rem + 0vw), 0.375rem)"), "6px");
  assert.equal(toEditorPx("--radius-full", "999rem"), "999px");
  assert.throws(() => toEditorPx("--a", "clamp(1rem, calc(0.5rem + 1vw), 2rem)"), /fluid/);
  assert.throws(() => toEditorPx("--a", "12px"), /not in rem/);
});

test("a spacing step is never rewritten to a pill; only 999rem of --radius-full is", () => {
  assert.equal(toEditorPx("--space-xl", "99rem"), "1584px");
  assert.equal(toEditorPx("--radius-full", "999rem"), "999px");
  assert.equal(toEditorPx("--radius-full", "100rem"), "1600px");
  assert.equal(toEditorPx("--space-xl", "999rem"), "15984px");
});

test("the committed export holds exactly the steps of the committed settings", () => {
  const { snapshot } = JSON.parse(readFileSync(files.settings, "utf8"));
  const expected = [snapshot.radii, snapshot.spacing].flatMap((system: { name: string; tokens: { token: string; min: number }[] }) =>
    system.tokens.map(({ token, min }) => [`--${system.name}-${token}`, toEditorPx(`--${system.name}-${token}`, `${min}rem`)]));
  const exportedPx = parseExport(exported).entries.map(([name, value]: [string, string]) => [name, toEditorPx(name, value)]);
  assert.deepEqual(exportedPx.sort(), expected.sort());
});

test("the generated block has the editor's spacing steps in pixels and the pill radius", () => {
  const block = generatedBlock(exported);
  const pixels = (name: string) => new RegExp(`${name}: (\\d+)px;`).exec(block)?.[1];
  const steps = { "--space-4xs": "2", "--space-3xs": "4", "--space-2xs": "6", "--space-xs": "8", "--space-s": "12", "--space-m": "16", "--space-l": "24", "--radius-full": "999" };
  for (const [name, px] of Object.entries(steps)) assert.equal(pixels(name), px, name);
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
// Only the custom properties are compared: the header's version and comments are the Framework's to change.
test("the Framework's own export of the committed settings has the committed custom properties", { skip: !existsSync(join(frameworkDir, "src/framework/compiler/index.ts")) }, async () => {
  const fresh = await exportTokens(JSON.parse(readFileSync(files.settings, "utf8")), frameworkDir);
  assert.deepEqual(parseExport(fresh).entries, parseExport(exported).entries);
});
