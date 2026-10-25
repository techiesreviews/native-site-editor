import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const FIELDS = ["Try", "Good", "Files", "Phone", "Steps"] as const;
// The areas factory slice 41 lists, in order; each holds at least one entry.
const AREAS = [
  "Sign-in and setup", "Repositories and branches", "Pages and files", "Page editing on the canvas",
  "Edit bar", "Page Structure", "Components and Edit component mode", "Media and the image popup",
  "Code panes", "Versions and history", "Publish and discard", "Agents menu and agent connection",
  "Command palette", "Phone layout",
];

type Feature = {
  id: string; area: string; slug: string; heading: string;
  fields: Map<string, string>; problems: string[];
};

function features(markdown: string): Feature[] {
  const found: Feature[] = [];
  let area = "";
  let current: Feature | undefined;
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
      current = undefined;
      continue;
    }
    if (fenced) continue;
    if (line.startsWith("## ")) {
      area = line.slice(3).trim();
      current = undefined;
    } else if (line.startsWith("### ")) {
      const heading = line.slice(4).trim();
      const match = /^F-([a-z]+)-(\d{2}) (\S.*)$/.exec(heading);
      current = {
        id: match ? `F-${match[1]}-${match[2]}` : heading, area, slug: match?.[1] ?? "", heading,
        fields: new Map(), problems: match ? [] : [`Heading not F-<area>-<nn> <name>: ${heading}`],
      };
      found.push(current);
    } else if (current && line.trim()) {
      const field = /^- ([A-Za-z]+): (\S.*)$/.exec(line);
      if (!field) current.problems.push(`Not a field line: ${line}`);
      else if (current.fields.has(field[1])) current.problems.push(`Repeated field: ${field[1]}`);
      else current.fields.set(field[1], field[2]);
    }
  }
  return found;
}

function shapeProblems(entry: Feature): string[] {
  const problems = [...entry.problems];
  const names = [...entry.fields.keys()];
  if (names.join() !== FIELDS.join()) problems.push(`Fields ${names.join(", ")}; expected ${FIELDS.join(", ")}`);
  const phone = entry.fields.get("Phone");
  if (phone !== undefined && phone !== "yes" && phone !== "no") problems.push(`Phone is yes or no: ${phone}`);
  return problems.map((problem) => `${entry.id}: ${problem}`);
}

// A list of backticked values separated by commas, and nothing else.
function backticked(value: string): string[] | undefined {
  const items = value.split(/,\s*/);
  if (!items.every((item) => /^`[^`]+`$/.test(item))) return undefined;
  return items.map((item) => item.slice(1, -1));
}

function rulebookIds(good: string): string[] {
  return [...good.matchAll(/\b[SLBU]\d+\b/g)].map((match) => match[0]);
}

const markdown = readFileSync(new URL("docs/agents/features.md", root), "utf8");
const listed = features(markdown);

test("feature headings are well-formed, unique and grouped by area", () => {
  const problems = listed.flatMap(shapeProblems);
  const ids = new Map<string, number>();
  for (const { id } of listed) ids.set(id, (ids.get(id) ?? 0) + 1);
  for (const [id, count] of ids) if (count > 1) problems.push(`${id}: used ${count} times`);
  // One prefix per area and one area per prefix.
  const slugOf = new Map<string, string>();
  const areaOf = new Map<string, string>();
  for (const { id, area, slug } of listed) {
    if (!AREAS.includes(area)) problems.push(`${id}: outside a feature area (${area || "none"})`);
    if ((slugOf.get(area) ?? slug) !== slug || (areaOf.get(slug) ?? area) !== area) {
      problems.push(`${id}: area ${area} and prefix F-${slug} do not pair one to one`);
    }
    slugOf.set(area, slugOf.get(area) ?? slug);
    areaOf.set(slug, areaOf.get(slug) ?? area);
  }
  for (const area of AREAS) {
    if (!markdown.includes(`\n## ${area}\n`)) problems.push(`Area missing: ${area}`);
    else if (!listed.some((entry) => entry.area === area)) problems.push(`Area has no entries: ${area}`);
  }
  assert.deepEqual(problems, []);
});

test("every Files glob matches a tracked file", () => {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0").filter(Boolean);
  const problems: string[] = [];
  for (const { id, fields } of listed) {
    const globs = backticked(fields.get("Files") ?? "");
    if (!globs) {
      problems.push(`${id}: Files is a comma-separated list of backticked globs`);
      continue;
    }
    for (const glob of globs) {
      if (!tracked.some((path) => matchesGlob(path, glob))) problems.push(`${id}: no tracked file matches ${glob}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("every Steps path exists or the feature says none yet", () => {
  const problems: string[] = [];
  for (const { id, fields } of listed) {
    const steps = fields.get("Steps") ?? "";
    if (steps === "none yet") continue;
    const paths = backticked(steps);
    if (!paths) problems.push(`${id}: Steps is backticked paths or none yet: ${steps}`);
    else for (const path of paths) if (!existsSync(new URL(path, root))) problems.push(`${id}: no such Steps file ${path}`);
  }
  assert.deepEqual(problems, []);
});

test("rulebook ids in Good exist in the UX rulebook", () => {
  const rulebook = readFileSync(new URL("docs/agents/ux-rulebook.md", root), "utf8");
  const rules = new Set([...rulebook.matchAll(/^- \*\*([SLBU]\d+)\*\* /gm)].map((match) => match[1]));
  assert.ok(rules.size > 0, "No rules found in the UX rulebook");
  const problems = listed.flatMap(({ id, fields }) =>
    rulebookIds(fields.get("Good") ?? "").filter((rule) => !rules.has(rule)).map((rule) => `${id}: no rule ${rule}`));
  assert.deepEqual(problems, []);
});

test("the parser reports malformed entries", () => {
  const [bad, good] = features([
    "## Edit bar", "### F-bar-1 Too short", "- Try: x", "Loose text", "- Try: again",
    "### F-bar-02 Fine", "- Try: a", "- Good: b (B1, L12)", "- Files: `src/a.ts`, `src/b/*.ts`",
    "- Phone: maybe", "- Steps: none yet",
    "```", "### F-bar-03 Inside a fence is ignored", "```",
  ].join("\n"));
  assert.match(bad.problems.join("\n"), /Heading not F-<area>-<nn>/);
  assert.match(bad.problems.join("\n"), /Not a field line: Loose text/);
  assert.match(bad.problems.join("\n"), /Repeated field: Try/);
  assert.equal(good.id, "F-bar-02");
  assert.deepEqual(shapeProblems(good), ["F-bar-02: Phone is yes or no: maybe"]);
  assert.deepEqual(backticked(good.fields.get("Files") ?? ""), ["src/a.ts", "src/b/*.ts"]);
  assert.equal(backticked("`src/a.ts` and more"), undefined);
  assert.deepEqual(rulebookIds(good.fields.get("Good") ?? ""), ["B1", "L12"]);
  assert.equal(features("### F-bar-03 x").length, 1);
});
