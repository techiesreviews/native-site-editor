import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { parseStep, parseSteps, screens } from "../scripts/agents/shots/core";

// The feature tries kit ux runs (factory slices 42 and 45): each file is its feature's scenario.
const dir = new URL("../scripts/agents/shots/features/", import.meta.url);
const files = readdirSync(dir).filter(file => file.endsWith(".json")).sort();

test("there are feature tries to check", () => {
  assert.ok(files.length > 0);
});

for (const file of files) {
  const id = file.slice(0, -".json".length);
  test(`${file} is a working try for ${id}`, () => {
    const scenario = parseSteps(readFileSync(new URL(file, dir), "utf8"));
    assert.match(id, /^F-[a-z]+-\d{2}$/);
    // A name may add the bug the try would have caught (slice 45): F-media-18-bug-popup-flicker.
    assert.ok(scenario.name === id || scenario.name?.startsWith(`${id}-`), `name ${scenario.name} starts with ${id}`);
    assert.ok(screens.includes(scenario.screen));
    const kinds = scenario.steps.map(step => parseStep(step).kind);
    // A try holds evidence: a visible result to expect or wait for, or a recorded strip to look at.
    assert.ok(kinds.some(kind => kind === "expect" || kind === "wait" || kind === "record"), `${file} has an expect, wait or record step`);
  });
}
