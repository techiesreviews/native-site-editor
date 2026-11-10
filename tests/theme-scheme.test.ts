import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Dark mode is written once per colour with light-dark() in src/theme.css (docs/editor-colors.md), so a part's own
// color-scheme picks its palette. A prefers-color-scheme block would bring back colours that only follow the system.
// tests/native-save/native-theme-scheme.spec.ts checks the resolved colours in a browser.
const cssFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? cssFiles(join(dir, entry.name)) : entry.name.endsWith(".css") ? [join(dir, entry.name)] : []);

test("no editor stylesheet switches colours with prefers-color-scheme", () => {
  const offenders = cssFiles("src").filter((file) => /prefers-color-scheme/.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});

test("the palette declares both schemes and writes themed colours with light-dark()", () => {
  const theme = readFileSync("src/theme.css", "utf8");
  assert.match(theme, /:root \{[^}]*color-scheme: light dark;/);
  for (const token of ["--semantic-surface", "--semantic-text", "--semantic-border", "--component", "--pressed", "--surface-card"]) {
    assert.match(theme, new RegExp(`^\\s*${token}: light-dark\\(`, "m"), token);
  }
});
