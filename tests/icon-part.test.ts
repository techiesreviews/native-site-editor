import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ICON_SIZE, ICON_PLACES, ICON_SIZES, iconPlace, iconSize, iconSvg } from "../src/ui/parts/icon-options.ts";
import { PARTS } from "../src/catalogue/parts.ts";

// The Icon part's options become markup (atomic catalogue ticket 10): a size from a small set, a place beside words,
// one class, the variants as data attributes, hidden from assistive technology.

// Phosphor Regular's check, as the package ships it.
const check = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>';

test("size: the sizes in the set are kept, anything else is the default", () => {
  assert.deepEqual([...ICON_SIZES], [12, 16, 20, 24]);
  for (const size of ICON_SIZES) assert.equal(iconSize(size), size);
  assert.equal(iconSize("20"), 20, "a size from a text option");
  assert.equal(iconSize(undefined), DEFAULT_ICON_SIZE);
  assert.equal(iconSize(18), DEFAULT_ICON_SIZE);
  assert.equal(iconSize("big"), DEFAULT_ICON_SIZE);
});

test("place: alone, before or after words; anything else is alone", () => {
  assert.deepEqual([...ICON_PLACES], ["alone", "before", "after"]);
  assert.equal(iconPlace("before"), "before");
  assert.equal(iconPlace("after"), "after");
  assert.equal(iconPlace(undefined), "alone");
  assert.equal(iconPlace("beside"), "alone");
});

test("markup: one class, the size twice, hidden from assistive technology, no place when alone", () => {
  const markup = iconSvg(check);
  assert.match(markup, /^<svg class="icon" width="16" height="16" data-size="16" aria-hidden="true" focusable="false" /);
  assert.ok(!markup.includes("data-place"));
  assert.equal(markup.slice(markup.indexOf(" xmlns")), check.slice(check.indexOf(" xmlns")), "the icon's own drawing is untouched");
});

test("markup: every size and place is data on the same class", () => {
  for (const size of ICON_SIZES) {
    const markup = iconSvg(check, { size });
    assert.ok(markup.includes(`width="${size}" height="${size}" data-size="${size}"`), `size ${size}`);
  }
  assert.ok(iconSvg(check, { place: "before" }).includes(' data-place="before" aria-hidden="true"'));
  assert.ok(iconSvg(check, { size: 24, place: "after" }).includes('data-size="24" data-place="after"'));
  assert.equal(iconSvg(check, { size: 13, place: "sideways" }), iconSvg(check), "unknown options fall back to the defaults");
  assert.equal([...iconSvg(check, { place: "after" }).matchAll(/class="/g)].length, 1, "one class and no modifier classes");
});

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
