import assert from "node:assert/strict";
import test from "node:test";
import { BADGE_KINDS, BADGE_TONES, countText } from "../src/ui/badge/badge-options.ts";
import { ICON_PLACES, ICON_SIZES } from "../src/ui/icon/icon-options.ts";
import { keyList } from "../src/ui/key/key-options.ts";
import { PROGRESS_STEPS } from "../src/ui/progress/progress-options.ts";
import { HEADING_LEVELS } from "../src/ui/section-heading/section-heading-options.ts";
import { SPINNER_PLACES, SPINNER_SIZES } from "../src/ui/spinner/spinner-options.ts";
import { PARTS, isPart } from "../src/catalogue/parts.ts";

// The design board shows each part's variants, and its options reach the part (atomic catalogue tickets 10, 13 and
// 14). Each part's own markup tests sit beside it, in src/ui/<part>/.

test("the board's Icon shows every size and each place, and its options reach the part", () => {
  const part = PARTS.find((entry) => entry.id === "icon");
  assert.ok(part && "rows" in part);
  assert.deepEqual(part.columns.map((column) => column.values?.size), ICON_SIZES.map(String));
  const places = new Set(part.rows.map((row) => row.values?.place ?? part.defaults.place));
  assert.deepEqual([...places].sort(), ["after", "alone", "before"]);
  const choices = (key: string) => part.controls.flatMap((control) => (control.kind === "choice" && control.key === key ? control.choices.map(([value]) => value) : []));
  assert.deepEqual(choices("size"), ICON_SIZES.map(String));
  assert.deepEqual(choices("place"), [...ICON_PLACES]);
});

test("the board's Spinner shows every size and place, and its options reach the part", () => {
  const part = PARTS.find((entry) => entry.id === "spinner");
  assert.ok(part && "rows" in part);
  assert.equal(part.area, "atoms");
  assert.deepEqual(part.columns.map((column) => column.values?.size), [...SPINNER_SIZES]);
  assert.deepEqual(part.rows.map((row) => row.values?.place), [...SPINNER_PLACES]);
  const offered = (key: string) => part.controls.flatMap((control) => (control.kind === "choice" && control.key === key ? control.choices.map(([value]) => value) : []));
  assert.deepEqual(offered("size"), [...SPINNER_SIZES]);
  assert.deepEqual(offered("place"), [...SPINNER_PLACES]);
  assert.ok(part.controls.some((control) => control.kind === "text" && control.key === "label"));
});

test("the board's Progress bar shows unknown and each step, and its options reach the part", () => {
  const part = PARTS.find((entry) => entry.id === "progress");
  assert.ok(part && "rows" in part);
  assert.equal(part.area, "atoms");
  const amounts = part.rows.map((row) => row.values?.amount);
  assert.deepEqual(amounts, ["unknown", ...PROGRESS_STEPS.map(String)]);
  const control = part.controls.find((entry) => entry.kind === "choice" && entry.key === "amount");
  assert.ok(control && control.kind === "choice");
  assert.deepEqual(control.choices.map(([value]) => value), amounts);
  assert.ok(amounts.includes(String(part.defaults.amount)), "the default amount is one the board offers");
});

test("the board shows every kind, tone, heading end slot and key count, and its options reach the parts", () => {
  const badge = PARTS.find((entry) => entry.id === "badge");
  assert.ok(badge && isPart(badge));
  assert.deepEqual(badge.rows.map((row) => row.values?.kind).filter((kind, i, all) => all.indexOf(kind) === i), [...BADGE_KINDS]);
  assert.ok(badge.rows.some((row) => row.label === "Long tag" && String(row.values?.words).length > 40), "a long tag");
  assert.deepEqual(badge.columns.map((column) => column.values?.tone), [...BADGE_TONES]);
  const choices = (part: typeof badge, key: string) => part.controls.flatMap((control) => (control.kind === "choice" && control.key === key ? control.choices.map(([value]) => value) : []));
  assert.deepEqual(choices(badge, "kind"), [...BADGE_KINDS]);
  assert.deepEqual(choices(badge, "tone"), [...BADGE_TONES]);
  assert.ok(badge.rows.some((row) => row.values?.kind === "count" && countText(String(row.values.words)) === "99+"), "a count over 99");

  const heading = PARTS.find((entry) => entry.id === "section-heading");
  assert.ok(heading && isPart(heading));
  assert.deepEqual(new Set(heading.rows.map((row) => row.values?.end ?? heading.defaults.end)), new Set(["none", "count", "button"]));
  assert.deepEqual(choices(heading, "level"), HEADING_LEVELS.map(String));

  const key = PARTS.find((entry) => entry.id === "key");
  assert.ok(key && isPart(key));
  const counts = new Set(key.rows.map((row) => keyList(String(row.values?.keys ?? key.defaults.keys)).length));
  assert.deepEqual([...counts].sort(), [1, 2, 3]);
});
