import test from "node:test";
import assert from "node:assert/strict";
import { createMediaHistoryHome } from "../src/page-builder/media-history-home";
import { createWorkspaceSession, type WorkspaceScope } from "../src/workspace-session";

// Steps belong to the workspace session's load they were made in (src/workspace-session.ts).
const lex: WorkspaceScope = { kind: "github", account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
const site = { holds: () => true };

test("held steps adopt oldest first, once, with their undo and redo", async () => {
  const home = createMediaHistoryHome(), calls: string[] = [];
  for (const name of ["first", "second"]) {
    assert.equal(home.hold(site, () => { calls.push(`undo ${name}`); return true; }, async () => { calls.push(`redo ${name}`); return true; }), true);
  }
  const steps: { undo: () => boolean | Promise<boolean>; redo: () => boolean | Promise<boolean> }[] = [];
  home.adopt((undo, redo) => { steps.push({ undo, redo }); return true; });
  home.adopt(() => { assert.fail("already adopted"); });
  assert.equal(steps.length, 2);
  for (const step of steps) { assert.equal(await step.undo(), true); assert.equal(await step.redo(), true); }
  assert.deepEqual(calls, ["undo first", "redo first", "undo second", "redo second"]);
});

test("steps of an earlier load or another workspace are dropped permanently", () => {
  for (const next of [lex, { ...lex, branch: "dev" }]) {
    const home = createMediaHistoryHome(), session = createWorkspaceSession(lex);
    home.hold(session.begin(), () => true, () => true);
    session.next(next);
    home.adopt(() => { assert.fail("an earlier load"); });
    home.hold(session.begin(), () => true, () => true);
    let adopted = 0;
    home.adopt(() => { adopted++; return true; });
    assert.equal(adopted, 1, "only the step of this load");
  }
});

test("failed registration keeps the step for another adoption", () => {
  const home = createMediaHistoryHome(), undo = () => true, redo = () => true;
  home.hold(site, undo, redo);
  home.adopt(() => false);
  let recorded = 0;
  home.adopt((u, r) => { assert.equal(u, undo); assert.equal(r, redo); recorded++; return true; });
  assert.equal(recorded, 1);
});

test("a refused step stays held with every later one, in order", () => {
  const home = createMediaHistoryHome(), actions = [() => true, () => true, () => true];
  for (const action of actions) home.hold(site, action, action);
  const first: unknown[] = [];
  home.adopt(undo => { if (undo === actions[1]) return false; first.push(undo); return true; });
  assert.deepEqual(first, [actions[0]]);
  const second: unknown[] = [];
  home.adopt(undo => { second.push(undo); return true; });
  assert.deepEqual(second, [actions[1], actions[2]]);
});

test("disposal travels with adopted steps; steps of an earlier load release theirs", () => {
  const home = createMediaHistoryHome(), released: string[] = [], session = createWorkspaceSession(lex);
  home.hold(session.begin(), () => true, () => true, () => { released.push("old"); });
  session.next(lex);
  const site = session.begin();
  home.hold(site, () => true, () => true, () => { released.push("site"); });
  assert.deepEqual(released, ["old"]);
  home.adopt(() => false);
  assert.deepEqual(released, ["old"]);
  let dispose = () => {};
  home.adopt((_undo, _redo, release) => { dispose = release!; return true; });
  assert.deepEqual(released, ["old"]);
  dispose();
  assert.deepEqual(released, ["old", "site"]);
  home.hold(site, () => true, () => true, () => { released.push("other"); });
  session.next({ ...lex, branch: "dev" });
  home.adopt(() => { assert.fail("another branch"); });
  assert.deepEqual(released, ["old", "site", "other"]);
  home.hold(site, () => true, () => true, () => { released.push("cleared"); });
  home.clear();
  assert.deepEqual(released, ["old", "site", "other", "cleared"]);
});
