import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { parseStep, parseSteps, type Step } from "../scripts/agents/shots/core";

// The feature tries kit ux runs (factory slices 42 and 45): each file is its feature's scenario.
const dir = new URL("../scripts/agents/shots/features/", import.meta.url);
const files = readdirSync(dir).filter(file => file.endsWith(".json")).sort();
const evidence = new Set(["expect", "wait", "record"]);

/** One field ("Steps", "Phone") of each feature in docs/agents/features.md, by id. */
function fieldByFeature(field = "Steps") {
  const values = new Map<string, string>();
  let id: string | undefined;
  for (const line of readFileSync(new URL("../docs/agents/features.md", import.meta.url), "utf8").split("\n")) {
    const heading = /^### (F-[a-z]+-\d{2}) /.exec(line);
    if (heading) id = heading[1];
    else if (id && line.startsWith(`- ${field}: `)) values.set(id, line.slice(`- ${field}: `.length));
  }
  return values;
}
const stepsByFeature = () => fieldByFeature();
const phoneByFeature = fieldByFeature("Phone");

// What the phone layout hides (src/style.css, max-width 650px) and the step a phone user takes just before it.
const phoneOpener = new Map([
  ...["History", "Inbox", "Switch site", "Share a preview link", "Add a block", "Tablet", "Mobile"].map(name => [name, "Menu"] as const),
  ...["Section", "Div", "Heading", "Paragraph"].map(name => [name, "Add a block"] as const),
]);
// No phone route has these names (the phone Menu says Switch site or Share a preview link, Tablet, Mobile), so they are on wide only.
const wideOnly = new Set(["repository actions", "Redo", "Desktop, fills the canvas", "Tablet, 768 px", "Mobile, 390 px"]);

/** The first click a phone user cannot make as written, or undefined. */
function phoneRouteProblem(steps: Step[]) {
  for (const [index, step] of steps.entries()) {
    if (step.kind !== "click" || step.only === "wide") continue;
    if (wideOnly.has(step.name)) return `step ${index + 1} clicks "${step.name}", which a phone never shows; mark it on wide`;
    const opener = phoneOpener.get(step.name);
    const before = steps[index - 1];
    if (opener && !(before?.kind === "click" && before.only === "phone" && before.name === opener)) return `step ${index + 1} clicks "${step.name}", which a phone shows only just after on phone click "${opener}"`;
  }
}

test("the phone route check refuses clicks a phone user cannot make", () => {
  const check = (sources: string[]) => phoneRouteProblem(sources.map(parseStep));
  assert.match(check(['on phone click exactly "Menu"', 'on phone click "Switch site"', 'click "repository actions"']) ?? "", /step 3 clicks "repository actions", which a phone never shows/);
  assert.match(check(['on phone click exactly "Menu"', 'click exactly "Section"']) ?? "", /step 2 clicks "Section", which a phone shows only just after on phone click "Add a block"/);
  assert.match(check(['click "History"']) ?? "", /step 1 clicks "History"/);
  assert.match(check(['on phone click exactly "Menu"', 'on phone click "Switch site"', 'click "History"']) ?? "", /step 3 clicks "History", which a phone shows only just after on phone click "Menu"/);
  assert.match(check(['on phone click "Add a block"', 'click exactly "Section"']) ?? "", /step 1 clicks "Add a block", which a phone shows only just after on phone click "Menu"/);
  assert.equal(check(['on phone click exactly "Menu"', 'on phone click "Switch site"', 'on wide click "repository actions"']), undefined);
  assert.equal(check(['on phone click exactly "Menu"', 'on phone click "Add a block"', 'click exactly "Section"']), undefined);
  assert.equal(check(['on phone click exactly "Menu"', 'click "History"']), undefined);
});

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
    const steps = scenario.steps.map(parseStep);
    const last = steps.at(-1)!;
    assert.ok(evidence.has(last.kind), `${file} ends on an expect, wait or record step, not ${last.kind}`);
    assert.ok(!last.only, `${file}: the closing step runs at every width, not only on ${last.only}`);
    // kit ux tries 390 px only for Phone: yes, so a phone step elsewhere never runs.
    const phone = phoneByFeature.get(id) === "yes";
    assert.ok(phone || !steps.some(step => step.only === "phone"), `${file}: Phone: no, so its on phone steps never run`);
    const problem = phone ? phoneRouteProblem(steps) : undefined;
    assert.equal(problem, undefined, `${file}: ${problem}`);
    // A closing check that repeats one made before the last action proves nothing about that action,
    // unless a record after the earlier check, or another check after the action, shows what happened.
    if (last.kind === "expect" || last.kind === "wait") {
      const action = steps.findLastIndex(step => !evidence.has(step.kind));
      const earlier = steps.findIndex((step, index) => index < action && (step.kind === "expect" || step.kind === "wait") && step.text === last.text);
      const shown = earlier >= 0 && (steps.slice(earlier + 1).some(step => step.kind === "record") || steps.slice(action + 1, -1).length > 0);
      assert.ok(earlier < 0 || shown, `${file}: the closing check "${last.text}" repeats step ${earlier + 1} from before the last action`);
    }
  });
}
