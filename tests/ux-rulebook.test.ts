import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The UX rulebook (factory slice 40): its links resolve, every rule keeps its id, headline, why,
// source and check, and ticket 40's coverage table names only rules that exist.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rulebookPath = "docs/agents/ux-rulebook.md";
const ticketPath = "docs/wayfinder/software-factory/build/tickets/40-ux-rulebook.md";
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const sections = [["Say less", "S"], ["Looks", "L"], ["Behaviour", "B"], ["Bugs a user sees", "U"]] as const;
const tags = new Set(["script: layout", "script: colours", "script: spec", "script: text", "script: frames", "script: drag", "eye"]);

const slug = (heading: string) => heading.toLowerCase().replace(/[^\w\- ]/g, "").replace(/ /g, "-");

/** GitHub's heading anchors: a repeated heading gets `-1`, `-2`, … */
function anchors(markdown: string): string[] {
  const seen = new Map<string, number>();
  return markdown.split("\n").filter(line => /^#+ /.test(line)).map(line => {
    const base = slug(line.replace(/^#+ /, ""));
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  });
}

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}\n`);
  assert.ok(start >= 0, `Section missing: ${heading}`);
  const body = markdown.slice(start + heading.length + 4);
  const end = body.search(/^## /m);
  return end < 0 ? body : body.slice(0, end);
}

const ruleIds = (markdown: string) => [...markdown.matchAll(/^- \*\*([SLBU]\d+)\*\* /gm)].map(match => match[1]);

test("heading anchors follow GitHub: punctuation dropped, repeats numbered", () => {
  assert.equal(slug("Resolution (2026-10-22)"), "resolution-2026-10-22");
  assert.deepEqual(anchors("# Notes\n## Done\ntext\n## Done\n### Done"), ["notes", "done", "done-1", "done-2"]);
});

test("every relative link and anchor in the rulebook and the kitchen resolves", () => {
  for (const path of [rulebookPath, "docs/agents/kitchen.md"]) {
    for (const [, target] of read(path).matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^https?:/.test(target)) continue;
      const [file, anchor] = target.split("#");
      const full = file ? resolve(root, dirname(path), file) : resolve(root, path);
      assert.ok(existsSync(full), `${path}: missing ${target}`);
      if (anchor) assert.ok(anchors(readFileSync(full, "utf8")).includes(anchor), `${path}: no heading for ${target}`);
    }
  }
});

test("AGENTS.md points to the rulebook under Review", () => {
  assert.match(section(read("AGENTS.md"), "Review"), /^UX: `docs\/agents\/ux-rulebook\.md`\.$/m);
});

test("rules run in order per section: one-line headline, why with a source link, known check tags", () => {
  const markdown = read(rulebookPath);
  for (const [heading, letter] of sections) {
    const rules = section(markdown, heading).split(/^(?=- \*\*)/m).filter(block => block.startsWith("- **"));
    assert.ok(rules.length > 0, `${heading} has no rules`);
    rules.forEach((rule, index) => {
      const id = `${letter}${index + 1}`;
      assert.ok(rule.startsWith(`- **${id}** `), `${heading}: expected ${id}, got ${rule.slice(0, 12)}`);
      const headline = rule.slice(0, rule.indexOf("\n"));
      assert.ok(headline.endsWith(".") && headline.length <= 112, `${id}: the headline is one line ending in a full stop`);
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

test("ticket 40's coverage table places all 35 items on rules that exist", () => {
  const rulebook = read(rulebookPath);
  const ids = new Set(ruleIds(rulebook));
  const rows = read(ticketPath).split("\n").filter(line => /^\| [ABCD]\d+ /.test(line)).map(line => line.split("|").map(cell => cell.trim()));
  const expected = [["A", 7], ["B", 9], ["C", 8], ["D", 11]].flatMap(([kind, count]) => Array.from({ length: count as number }, (_, i) => `${kind}${i + 1}`));
  assert.deepEqual(rows.map(row => row[1].split(" ")[0]), expected);
  let notARule = 0;
  for (const row of rows) {
    const rule = row[3];
    if (rule.startsWith("Not a rule")) { notARule++; continue; }
    const named = [...rule.matchAll(/\b[SLBU]\d+\b/g)].map(match => match[0]);
    assert.ok(named.length > 0, `${row[1]}: no rule`);
    for (const id of named) assert.ok(ids.has(id), `${row[1]}: ${id} is not in the rulebook`);
  }
  assert.equal(section(rulebook, "Not a rule").split("\n").filter(line => line.startsWith("- ")).length, notARule);
});
