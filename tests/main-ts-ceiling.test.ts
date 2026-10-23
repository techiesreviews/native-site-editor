import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const CEILING = 5280;

function checkCeiling(count: number, ceiling: number): void {
  assert.ok(count <= ceiling, `src/main.ts has ${count} lines, above the ceiling of ${ceiling}`);
  assert.ok(ceiling - count < 50, `src/main.ts has ${count} lines; lower the ceiling to ${Math.ceil(count / 10) * 10}`);
}

test("src/main.ts stays within its line ceiling and records shrinking progress", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const count = source.split("\n").length - Number(source.endsWith("\n"));
  checkCeiling(count, CEILING);
});

test("a count above the ceiling fails naming the count and ceiling", () => {
  assert.throws(() => checkCeiling(1001, 1000), {
    message: "src/main.ts has 1001 lines, above the ceiling of 1000",
  });
});

test("the ceiling and counts up to 49 lines under pass", () => {
  for (const count of [1000, 999, 951]) assert.doesNotThrow(() => checkCeiling(count, 1000));
});

test("a count exactly 50 lines under fails naming the suggested ceiling", () => {
  assert.throws(() => checkCeiling(950, 1000), {
    message: "src/main.ts has 950 lines; lower the ceiling to 950",
  });
});

test("larger reductions suggest the count rounded up to a multiple of 10", () => {
  for (const count of [949, 941, 940]) {
    assert.throws(() => checkCeiling(count, 1000), {
      message: `src/main.ts has ${count} lines; lower the ceiling to ${count === 940 ? 940 : 950}`,
    });
  }
});
