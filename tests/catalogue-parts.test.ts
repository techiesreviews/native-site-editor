import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import test from "node:test";
import { parseApprovals } from "../src/catalogue/approvals.ts";
import { forcedSelector, groupPrelude } from "../src/catalogue/force-states.ts";
import { boardPoint, frameOf, frameQuery } from "../src/catalogue/frame.ts";
import { MOCKUPS } from "../src/catalogue/mockups.ts";
import { SCREENS } from "../src/catalogue/screens.ts";
import { AREAS, PARTS, STATE_NAMES, isPart, untracedLines, type Part } from "../src/catalogue/parts.ts";

// The catalogue board's one list of parts (src/catalogue/parts.ts) and its mock-ups (mockups.ts), atomic catalogue
// ticket 05: every entry is complete, names files that exist, and a molecule's "made of" list traces to the parts
// its code really imports.

const repo = new URL("..", import.meta.url).pathname;
const entries = [...PARTS, ...SCREENS, ...MOCKUPS];
const byId = new Map(entries.map((entry) => [entry.id, entry]));
const tsFiles = (files: readonly string[]) => files.filter((file) => file.endsWith(".ts"));

/** The repository files a TypeScript file imports by relative path. */
function imports(file: string): Set<string> {
  const text = readFileSync(join(repo, file), "utf8");
  const found = new Set<string>();
  for (const match of text.matchAll(/(?:from|import)\s*\(?\s*"(\.[^"]+)"/g)) {
    const path = normalize(join(dirname(file), match[1]));
    found.add(/\.\w+$/.test(path) ? path : `${path}.ts`);
  }
  return found;
}

test("every entry has a unique id, a known area and a name", () => {
  assert.equal(byId.size, entries.length, "ids are unique across parts and mock-ups");
  const areas = new Set(AREAS.map((area) => area.id));
  for (const entry of entries) {
    assert.ok(areas.has(entry.area), `${entry.id}: area ${entry.area}`);
    assert.match(entry.id, /^[a-z][a-z0-9-]*$/, `${entry.id}: id`);
    assert.ok(entry.name.trim(), `${entry.id}: name`);
  }
  assert.deepEqual(AREAS.map((area) => area.id), ["values", "atoms", "molecules", "organisms", "screens", "mockups"]);
  assert.ok(MOCKUPS.every((mockup) => mockup.area === "mockups"));
  assert.ok(PARTS.every((part) => part.area !== "mockups"));
});

test("the files each entry names exist", () => {
  for (const entry of entries) {
    assert.ok(entry.files.length, `${entry.id}: names where it lives`);
    for (const file of entry.files) assert.ok(existsSync(join(repo, file)), `${entry.id}: ${file} exists`);
  }
});

test("options: every control has a default, and a choice's default is one of its choices", () => {
  for (const entry of entries) {
    const keys = new Set<string>();
    for (const control of entry.controls) {
      assert.ok(!keys.has(control.key), `${entry.id}: control ${control.key} once`);
      keys.add(control.key);
      assert.ok(control.key in entry.defaults, `${entry.id}: default for ${control.key}`);
      if (control.kind === "choice") assert.ok(control.choices.some(([value]) => value === entry.defaults[control.key]), `${entry.id}: ${control.key} default is a choice`);
      if (control.kind === "switch") assert.equal(typeof entry.defaults[control.key], "boolean", `${entry.id}: ${control.key} is on or off`);
    }
  }
});

test("parts have rows and columns, columns name real states, and frames a size", () => {
  const parts = PARTS.filter(isPart);
  assert.ok(parts.some((part) => part.area === "atoms") && parts.some((part) => part.area === "molecules"));
  for (const part of parts) {
    assert.ok(part.rows.length && part.columns.length, `${part.id}: rows and columns`);
    for (const column of part.columns) if (column.state) assert.ok(column.state in STATE_NAMES, `${part.id}: state ${column.state}`);
    if (part.frame) assert.ok(part.frame.width > 0 && part.frame.height > 0, `${part.id}: frame size`);
  }
  assert.ok(SCREENS.length && SCREENS.every((screen) => screen.area === "screens"));
  for (const mockup of [...SCREENS, ...MOCKUPS]) assert.ok(mockup.widths.length && mockup.widths.every((width) => width >= 320) && mockup.height > 0, `${mockup.id}: widths`);
});

test("made of: molecules, organisms and mock-ups list known parts; atoms list none", () => {
  for (const entry of entries) {
    const madeOf = "madeOf" in entry ? entry.madeOf ?? [] : [];
    if (entry.area === "atoms" || entry.area === "values") assert.equal(madeOf.length, 0, `${entry.id}: an atom is made of nothing`);
    if (entry.area === "molecules" || entry.area === "organisms" || entry.area === "screens" || entry.area === "mockups") assert.ok(madeOf.length, `${entry.id}: says what it is made of`);
    for (const id of madeOf) {
      assert.notEqual(id, entry.id, `${entry.id}: not made of itself`);
      const part = byId.get(id);
      assert.ok(part && isPart(part), `${entry.id}: made of ${id}, a part on the board`);
    }
  }
});

test("made of traces to the code: a molecule's own files import each part it lists", () => {
  for (const part of PARTS.filter(isPart).filter((item): item is Part => Boolean(item.madeOf?.length))) {
    const imported = new Set(tsFiles(part.files).flatMap((file) => [...imports(file)]));
    for (const id of part.madeOf!) {
      const used = byId.get(id) as Part;
      assert.ok(tsFiles(used.files).some((file) => imported.has(file)), `${part.id} imports ${id} (${tsFiles(used.files).join(", ")})`);
    }
  }
});

test("untraced: the one-offs count for an entry's stylesheets, in plain words", () => {
  const counts = { "src/components/row-menu.css": { spacing: 5, zIndex: 1 }, "src/a.css": { radii: 1 } };
  assert.deepEqual(untracedLines(["src/components/row-menu.ts", "src/components/row-menu.css"], counts), ["5 hand-typed spacings, 1 hand-typed layer in row-menu.css"]);
  assert.deepEqual(untracedLines(["src/a.css", "src/clean.css"], counts), ["1 hand-typed corner in a.css"]);
  // The committed count names the board's molecules' stylesheets.
  const committed = JSON.parse(readFileSync(join(repo, "scripts/agents/one-offs.json"), "utf8")).files;
  assert.match(untracedLines(["src/components/row-menu.css"], committed)[0] ?? "", /in row-menu\.css$/);
});

test("a live frame says so in its query, and a frame page reads it back", () => {
  const live = frameQuery({ kind: "frame", id: "row-menu", theme: "dark", values: {}, live: true });
  assert.equal(new URLSearchParams(live).get("live"), "1");
  assert.equal(frameOf(live)?.live, true);
  const still = frameQuery({ kind: "frame", id: "row-menu", theme: "light", values: { shortcut: false } });
  assert.equal(new URLSearchParams(still).get("live"), null);
  assert.equal(frameOf(still)?.live, false);
  assert.equal(frameOf("?mockup=sharing-panel&live=1")?.live, true);
});

test("a wheel turned over a live frame lands on the board at the same place, through the board's zoom", () => {
  // A 280 px frame drawn at half size from (100, 40) on the board's page.
  assert.deepEqual(boardPoint({ left: 100, top: 40, width: 140 }, 280, { x: 20, y: 60 }), { x: 110, y: 70 });
  assert.deepEqual(boardPoint({ left: 0, top: 0, width: 280 }, 280, { x: 20, y: 60 }), { x: 20, y: 60 });
  assert.deepEqual(boardPoint({ left: 5, top: 5, width: 0 }, 0, { x: 2, y: 3 }), { x: 7, y: 8 }, "an unmeasured frame counts as full size");
});

test("the committed approvals only name entries on the board", () => {
  const approvals = parseApprovals(readFileSync(join(repo, "src/catalogue/approvals.json"), "utf8"));
  for (const id of Object.keys(approvals.approved)) assert.ok(byId.has(id), `approved ${id} is on the board`);
});

test("forced states: a state pseudo-class also matches the attribute, as the browser would", () => {
  assert.equal(forcedSelector(".primary:hover:not(:disabled)"), '.primary:is([data-force~="hover"], :has([data-force~="hover"])):not(:disabled)');
  assert.equal(forcedSelector(".secondary:active"), '.secondary:is([data-force~="pressed"], :has([data-force~="pressed"]))');
  assert.equal(forcedSelector("button:focus-visible, a:focus"), 'button[data-force~="focus"], a[data-force~="focus"]');
  assert.equal(forcedSelector(".link-row:focus-within .copy"), '.link-row:is([data-force~="focus"], :has([data-force~="focus"])) .copy');
  assert.equal(forcedSelector(".field:not(:focus)"), '.field:not([data-force~="focus"])');
  // Inside a :has() the element alone: a :has() within another is invalid, and the outer one reaches the ancestors.
  assert.equal(forcedSelector(".a:has(b:hover)"), '.a:has(b[data-force~="hover"])');
  assert.equal(forcedSelector(".row:has(.x:is(:active, :focus-visible)) .y:hover"), '.row:has(.x:is([data-force~="pressed"], [data-force~="focus"])) .y:is([data-force~="hover"], :has([data-force~="hover"]))');
  assert.equal(forcedSelector(".button"), null);
  assert.equal(forcedSelector(".hover-card"), null, "a class named hover is not the pseudo-class");
  assert.equal(forcedSelector(".cat-card:hover .cat-card__title"), null, "the board's own rules are never forced");
});

test("forced states leave a mouse-only condition and keep any other", () => {
  assert.equal(groupPrelude("@media (hover: hover) and (pointer: fine) { a:hover { } }", "(hover: hover) and (pointer: fine)"), "");
  assert.equal(groupPrelude("@media (hover: hover) { a:hover { } }", "(hover: hover)"), "");
  assert.equal(groupPrelude("@media (max-width: 650px) { a:hover { } }", "(max-width: 650px)"), "@media (max-width: 650px)");
  assert.equal(groupPrelude("@supports (anchor-name: --a) { a:hover { } }", undefined), "@supports (anchor-name: --a)");
});
