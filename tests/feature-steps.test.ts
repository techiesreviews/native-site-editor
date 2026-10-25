import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { parseStep, parseSteps } from "../scripts/agents/shots/core";

// The feature tries kit ux runs (factory slices 42 and 45): each file is its feature's scenario.
const dir = new URL("../scripts/agents/shots/features/", import.meta.url);
const files = readdirSync(dir).filter(file => file.endsWith(".json")).sort();
const evidence = new Set(["expect", "wait", "record"]);

/** Each feature's Steps value in docs/agents/features.md, by id. */
function stepsByFeature() {
  const steps = new Map<string, string>();
  let id: string | undefined;
  for (const line of readFileSync(new URL("../docs/agents/features.md", import.meta.url), "utf8").split("\n")) {
    const heading = /^### (F-[a-z]+-\d{2}) /.exec(line);
    if (heading) id = heading[1];
    else if (id && line.startsWith("- Steps: ")) steps.set(id, line.slice("- Steps: ".length));
  }
  return steps;
}

test("there are feature tries to check", () => {
  assert.ok(files.length > 0);
});

test("every steps file is its feature's Steps, so kit ux --all runs it", () => {
  const steps = stepsByFeature();
  for (const file of files) {
    const id = file.slice(0, -".json".length);
    assert.equal(steps.get(id), `\`scripts/agents/shots/features/${file}\``, `${id}: Steps names its file`);
  }
});

test("a feature without a try says why (slice 45)", () => {
  for (const [id, steps] of stepsByFeature()) assert.notEqual(steps, "none yet", `${id}: none yet (<why>)`);
});

for (const file of files) {
  const id = file.slice(0, -".json".length);
  test(`${file} is a working try for ${id}`, () => {
    // parseSteps refuses an unknown screen or step.
    const scenario = parseSteps(readFileSync(new URL(file, dir), "utf8"));
    assert.match(id, /^F-[a-z]+-\d{2}$/);
    // A name may add the bug the try would have caught (slice 45): F-media-18-bug-popup-flicker.
    assert.ok(scenario.name === id || scenario.name?.startsWith(`${id}-`), `name ${scenario.name} starts with ${id}`);
    // A try ends on evidence: a visible result to expect or wait for, or a recorded strip to look at.
    const last = parseStep(scenario.steps.at(-1) ?? "").kind;
    assert.ok(evidence.has(last), `${file} ends on an expect, wait or record step, not ${last}`);
  });
}
