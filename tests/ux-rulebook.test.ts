import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The UX rulebook (factory slice 40): its links resolve, and every rule keeps its id, why, source and check.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rulebookPath = "docs/agents/ux-rulebook.md";
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const sections = [["Say less", "S"], ["Looks", "L"], ["Behaviour", "B"], ["Bugs a user sees", "U"]] as const;
const tags = new Set(["script: layout", "script: colours", "script: spec", "script: text", "script: frames", "script: drag", "eye"]);

const slug = (heading: string) => heading.toLowerCase().replace(/[^\w\- ]/g, "").replace(/ /g, "-");

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}\n`);
  assert.ok(start >= 0, `Rulebook section missing: ${heading}`);
  const body = markdown.slice(start + heading.length + 4);
  const end = body.search(/^## /m);
  return end < 0 ? body : body.slice(0, end);
}

test("every relative link and anchor in the rulebook and the kitchen resolves", () => {
  for (const path of [rulebookPath, "docs/agents/kitchen.md"]) {
    for (const [, target] of read(path).matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^https?:/.test(target)) continue;
      const [file, anchor] = target.split("#");
      const full = resolve(root, dirname(path), file);
      assert.ok(existsSync(full), `${path}: missing ${target}`);
      if (!anchor) continue;
      const headings = readFileSync(full, "utf8").split("\n").filter(line => /^#+ /.test(line)).map(line => slug(line.replace(/^#+ /, "")));
      assert.ok(headings.includes(anchor), `${path}: no heading for ${target}`);
    }
  }
  assert.match(read("AGENTS.md"), /^UX: `docs\/agents\/ux-rulebook\.md`\.$/m);
});

test("rules run in order per section, each with a why, a source link and known check tags", () => {
  const markdown = read(rulebookPath);
  for (const [heading, letter] of sections) {
    const rules = section(markdown, heading).split(/^(?=- \*\*)/m).filter(block => block.startsWith("- **"));
    assert.ok(rules.length > 0, `${heading} has no rules`);
    rules.forEach((rule, index) => {
      const id = `${letter}${index + 1}`;
      assert.ok(rule.startsWith(`- **${id}** `), `${heading}: expected ${id}, got ${rule.slice(0, 12)}`);
      const why = rule.indexOf("  Why: ");
      const check = rule.match(/^ {2}Check: (.+)$/m);
      assert.ok(why > 0 && check && check.index! > why, `${id}: needs a Why: line, then a Check: line`);
      assert.match(rule.slice(why, check.index), /\]\([^)]+\)/, `${id}: why has no source link`);
      const tokens = [...check[1].matchAll(/`([^`]+)`/g)].map(match => match[1]);
      const found = tokens.filter(token => !token.endsWith(".spec.ts"));
      assert.ok(found.length > 0, `${id}: no check tag`);
      for (const tag of found) assert.ok(tags.has(tag), `${id}: unknown check tag ${tag}`);
      if (tokens.some(token => token.endsWith(".spec.ts"))) assert.ok(found.includes("script: spec"), `${id}: names specs without script: spec`);
    });
  }
});

test("every spec the rulebook names exists", () => {
  const specs = [...read(rulebookPath).matchAll(/`(native-[\w-]+\.spec\.ts)`/g)].map(match => match[1]);
  assert.ok(specs.length > 0);
  for (const spec of specs) assert.ok(existsSync(resolve(root, "tests/native-save", spec)), `missing tests/native-save/${spec}`);
});
