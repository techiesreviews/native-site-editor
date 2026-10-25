import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const FIELDS = ["Try", "Good", "Files", "Phone", "Spec", "Steps"] as const;
const SOURCE_ROOTS = ["src/", "shared/", "worker/"];
const SPEC_PATH = /^tests\/native-(save|preview)\/[^/]+\.spec\.ts$/;
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

// A list of backticked values separated by commas, and nothing else; a value may hold commas (braces).
function backticked(value: string): string[] | undefined {
  if (!/^`[^`]+`(?:,\s*`[^`]+`)*$/.test(value)) return undefined;
  return [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function filesProblems(entry: Feature, repo: string[]): string[] {
  const globs = backticked(entry.fields.get("Files") ?? "");
  if (!globs) return [`${entry.id}: Files is a comma-separated list of backticked globs`];
  return globs.flatMap((glob) => [
    ...SOURCE_ROOTS.some((root) => glob.startsWith(root)) ? [] : [`${entry.id}: Files glob outside ${SOURCE_ROOTS.join(", ")}: ${glob}`],
    ...repo.some((path) => matchesGlob(path, glob)) ? [] : [`${entry.id}: no repository file matches ${glob}`],
  ]);
}

// Spec: browser specs that pin the feature, or none.
function specProblems(entry: Feature, repo: string[]): string[] {
  const spec = entry.fields.get("Spec") ?? "";
  if (spec === "none") return [];
  const paths = backticked(spec);
  if (!paths) return [`${entry.id}: Spec is backticked spec paths or none: ${spec}`];
  return paths.flatMap((path) => [
    ...SPEC_PATH.test(path) ? [] : [`${entry.id}: Spec is not a browser spec: ${path}`],
    ...repo.includes(path) ? [] : [`${entry.id}: no repository file ${path}`],
  ]);
}

// Steps: the feature's own kit shots steps file, or none yet with an optional reason.
function stepsProblems(entry: Feature, repo: string[]): string[] {
  const steps = entry.fields.get("Steps") ?? "";
  if (/^none yet(?: \(\S[^()]*\))?$/.test(steps)) return [];
  const expected = `scripts/agents/shots/features/${entry.id}.json`;
  if (steps !== `\`${expected}\``) return [`${entry.id}: Steps is \`${expected}\` or none yet: ${steps}`];
  return repo.includes(expected) ? [] : [`${entry.id}: no repository file ${expected}`];
}

function rulebookIds(good: string): string[] {
  return [...good.matchAll(/\b[SLBU]\d+\b/g)].map((match) => match[0]);
}

const markdown = readFileSync(new URL("docs/agents/features.md", root), "utf8");
const listed = features(markdown);

function headingProblems(listed: Feature[], markdown: string): string[] {
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
  const last = new Map<string, number>();
  for (const { id, area } of listed) {
    const number = Number(id.slice(id.lastIndexOf("-") + 1));
    if (number <= (last.get(area) ?? 0)) problems.push(`${id}: numbers in ${area} must count up`);
    last.set(area, number);
  }
  const headings = new Set(markdown.split("\n"));
  for (const area of AREAS) {
    if (!headings.has(`## ${area}`)) problems.push(`Area missing: ${area}`);
    else if (!listed.some((entry) => entry.area === area)) problems.push(`Area has no entries: ${area}`);
  }
  return problems;
}

test("feature headings are well-formed, unique and grouped by area", () => {
  assert.deepEqual(headingProblems(listed, markdown), []);
});

// Committed, staged and new files, leaving out ignored ones (.scratch/, node_modules/) that CI never has.
const repo = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  cwd: root, encoding: "utf8",
}).split("\0").filter(Boolean);

test("every Files glob is source the repository holds", () => {
  assert.deepEqual(listed.flatMap((entry) => filesProblems(entry, repo)), []);
});

test("every Spec is a browser spec the repository holds, or none", () => {
  assert.deepEqual(listed.flatMap((entry) => specProblems(entry, repo)), []);
});

test("every Steps is the feature's own steps file, or none yet", () => {
  assert.deepEqual(listed.flatMap((entry) => stepsProblems(entry, repo)), []);
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
    "- Phone: maybe", "- Spec: none", "- Steps: none yet",
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
  assert.deepEqual(backticked("`src/{a,b}.ts`, `src/c.ts`"), ["src/{a,b}.ts", "src/c.ts"]);
});

test("heading checks refuse duplicates, numbers out of order and a prefix in another area", () => {
  const fields = ["- Try: a", "- Good: b", "- Files: `src/a.ts`", "- Phone: no", "- Spec: none", "- Steps: none yet"];
  const markdown = [
    ...AREAS.filter((area) => area !== "Edit bar").flatMap((area, n) => [`## ${area}`, `### F-a${"abcdefghijklmn"[n]}-01 x`, ...fields]),
    "## Edit bar", "### F-bar-02 x", ...fields, "### F-bar-01 x", ...fields, "### F-bar-02 x", ...fields,
    "### F-code-03 x", ...fields,
  ].join("\n");
  assert.deepEqual(headingProblems(features(markdown), markdown), [
    "F-bar-02: used 2 times",
    "F-code-03: area Edit bar and prefix F-code do not pair one to one",
    "F-bar-01: numbers in Edit bar must count up",
  ]);
  const empty = "## Edit bar\n";
  assert.ok(headingProblems([], empty).includes("Area has no entries: Edit bar"));
  assert.ok(headingProblems([], empty).includes("Area missing: Phone layout"));
});

test("Files, Spec and Steps refuse paths of the wrong kind or missing from the repository", () => {
  const repo = ["src/a.ts", "tests/native-save/x.spec.ts", "tests/unit.test.ts",
    "scripts/agents/shots/features/F-bar-02.json", "scripts/agents/shots/features/F-bar-09.json"];
  const entry = (fields: Record<string, string>): Feature => ({
    id: "F-bar-02", area: "Edit bar", slug: "bar", heading: "F-bar-02 x", problems: [],
    fields: new Map(Object.entries(fields)),
  });
  assert.deepEqual(filesProblems(entry({ Files: "`src/*.ts`, `src/{a,b}.ts`" }), repo), []);
  assert.deepEqual(filesProblems(entry({ Files: "`tests/unit.test.ts`, `src/gone.ts`" }), repo), [
    "F-bar-02: Files glob outside src/, shared/, worker/: tests/unit.test.ts",
    "F-bar-02: no repository file matches src/gone.ts",
  ]);
  assert.deepEqual(specProblems(entry({ Spec: "`tests/native-save/x.spec.ts`" }), repo), []);
  assert.deepEqual(specProblems(entry({ Spec: "none" }), repo), []);
  assert.deepEqual(specProblems(entry({ Spec: "`tests/unit.test.ts`, `tests/native-save/ignored.spec.ts`" }), repo), [
    "F-bar-02: Spec is not a browser spec: tests/unit.test.ts",
    "F-bar-02: no repository file tests/native-save/ignored.spec.ts",
  ]);
  for (const steps of ["none yet", "none yet (needs a two-tab try)", "`scripts/agents/shots/features/F-bar-02.json`"]) {
    assert.deepEqual(stepsProblems(entry({ Steps: steps }), repo), [], steps);
  }
  assert.match(stepsProblems(entry({ Steps: "`tests/native-save/x.spec.ts`" }), repo).join(), /Steps is `scripts/);
  assert.match(stepsProblems(entry({ Steps: "`scripts/agents/shots/features/F-bar-09.json`" }), repo).join(), /Steps is `scripts/);
  assert.deepEqual(stepsProblems(entry({ Steps: "`scripts/agents/shots/features/F-bar-02.json`" }), repo.slice(0, 3)), [
    "F-bar-02: no repository file scripts/agents/shots/features/F-bar-02.json",
  ]);
});
