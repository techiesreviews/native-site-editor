import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareNativeTextHistory } from "../src/page-builder/native-operation-history";
import type { SavedDraft } from "../src/drafts";
const scope = { account: "a", repoId: 1, repo: "a/site", branch: "main" };
function fixture() {
  const records = new Map<string, SavedDraft>();
  const models = new Map<string, { text: string; version: number }>([["index.html", { text: "before", version: 1 }], ["untouched.css", { text: "same", version: 1 }]]);
  const record: SavedDraft = { ...scope, version: 1, path: "index.html", baseSha: "base", original: "before", content: "after", updatedAt: 1 };
  let sourceListener: ((after: boolean) => void) | undefined;
  let live = true, fail = false, listener: (() => void) | undefined;
  const host = {
    scope, store: { error: null, get: (_scope: unknown, path: string) => records.get(path), save: (draft: SavedDraft) => { if (fail) return false; records.set(draft.path, draft); listener?.(); return true; }, remove: (_scope: unknown, path: string) => { records.delete(path); return true; } },
    isLive: () => live, source: (path: string) => models.get(path)?.text, mounted: (path: string) => models.has(path),
    modelState(path: string) { const model = models.get(path), version = model?.version; return { isCurrent: () => models.get(path) === model && model?.version === version }; },
    evictModel(_path: string, proof: { isCurrent(): boolean }) { return proof.isCurrent() ? proof : undefined; },
    prepareSources(edits: { path: string; expectedSource: string; text: string }[]) {
      let after = false;
      const current = () => edits.every(edit => models.get(edit.path)?.text === (after ? edit.text : edit.expectedSource));
      const change = (next: boolean) => { if (!current()) return false; for (const edit of edits) { const model = models.get(edit.path)!; model.text = next ? edit.text : edit.expectedSource; model.version++; } sourceListener?.(next); after = next; return true; };
      return { isCurrent: current, apply: () => change(true), undo: () => change(false), redo: () => change(true) };
    },
  };
  const plan = { before: new Map<string, SavedDraft | undefined>([["index.html", undefined]]), after: new Map([["index.html", record]]), beforeSources: new Map([["index.html", "before"], ["untouched.css", "same"]]), afterSources: new Map([["index.html", "after"], ["untouched.css", "same"]]) };
  return { records, models, record, host, plan, stale: () => { live = false; }, fail: () => { fail = true; }, listen: (callback: () => void) => { listener = callback; }, sourceListen: (callback: (after: boolean) => void) => { sourceListener = callback; } };
}
test("text and draft transition together through one guarded Undo and Redo", () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!;
  assert.equal(receipt.apply(), true); assert.equal(f.records.get("index.html"), f.record); assert.equal(f.models.get("index.html")!.text, "after");
  assert.equal(receipt.undo(), true); assert.equal(f.records.has("index.html"), false); assert.equal(f.models.get("index.html")!.text, "before");
  assert.equal(receipt.redo(), true); assert.equal(f.records.get("index.html"), f.record); assert.equal(f.models.get("index.html")!.text, "after");
});
test("same-text unrelated model changes retain the original proof and refuse Undo", () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!; assert.equal(receipt.apply(), true);
  f.models.get("untouched.css")!.version++;
  assert.equal(receipt.undo(), false); assert.equal(f.records.get("index.html"), f.record); assert.equal(f.models.get("index.html")!.text, "after");
});
test("scope changes and changed draft identity never overwrite the later record", () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!; assert.equal(receipt.apply(), true);
  const external = { ...f.record, content: "agent" }; f.records.set("index.html", external);
  assert.equal(receipt.undo(), false); assert.equal(f.records.get("index.html"), external); f.stale(); assert.equal(receipt.redo(), false);
});
test("storage failure rolls back the exact owned source step", () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!; f.fail();
  assert.equal(receipt.apply(), false); assert.equal(f.models.get("index.html")!.text, "before"); assert.equal(f.records.has("index.html"), false);
});
test("synchronous unrelated model mutation is rejected without blessing a new proof", () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!;
  f.listen(() => { f.models.get("untouched.css")!.version++; });
  assert.equal(receipt.apply(), false); assert.equal(f.models.get("index.html")!.text, "before"); assert.equal(f.records.has("index.html"), false); assert.equal(receipt.isCurrent(), false);
});

test("a proven mounted history state accepts identical persistence after earlier Undo and Redo", () => {
  const f = fixture(), before = { ...f.record, original: "baseline", content: "before" };
  f.record.original = "baseline"; f.records.set("index.html", before); f.plan.before.set("index.html", before);
  const receipt = prepareNativeTextHistory(f.host, f.plan)!; assert.equal(receipt.apply(), true); assert.equal(receipt.undo(), true);
  f.records.set("index.html", { ...before, updatedAt: 99 });
  assert.equal(receipt.redo(), true); assert.equal(f.models.get("index.html")!.text, "after");
});
for (const change of [{ baseSha: "new-base" }, { movedFrom: "other.html" }, { content: "agent" }]) test(`mounted record reanchor refuses changed fields ${Object.keys(change)}`, () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!; assert.equal(receipt.apply(), true);
  const external = { ...f.record, ...change }; f.records.set("index.html", external);
  assert.equal(receipt.undo(), false); assert.equal(f.records.get("index.html"), external);
});
test("unmounted equal records are never reanchored", () => {
  const f = fixture(); f.models.delete("index.html");
  f.host.source = path => path === "index.html" ? f.records.get(path)?.content ?? "before" : f.models.get(path)?.text;
  const receipt = prepareNativeTextHistory(f.host, f.plan)!; assert.equal(receipt.apply(), true);
  const external = { ...f.record, updatedAt: 99 }; f.records.set("index.html", external);
  assert.equal(receipt.undo(), false); assert.equal(f.records.get("index.html"), external);
});

for (const change of [{ baseSha: "external-base" }, { mode: "100755" }, { movedFrom: "foreign.html" }]) test(`source notification draft race keeps external fields ${Object.keys(change)} and rolls back its owned text`, () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!;
  const external = { ...f.record, ...change };
  f.sourceListen(after => { if (after) f.records.set("index.html", external); else f.records.delete("index.html"); });
  assert.equal(receipt.apply(), false); assert.equal(f.models.get("index.html")!.text, "before");
  assert.equal(f.records.get("index.html"), external); assert.equal(receipt.isCurrent(), false);
});
test("a draft writer's synchronous replacement is never treated as an owned saved record", () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!;
  const external = { ...f.record, baseSha: "external-base" };
  f.listen(() => { f.records.set("index.html", external); });
  assert.equal(receipt.apply(), false); assert.equal(f.records.get("index.html"), external);
});

test("rollback restores a writer replacement after real source persistence replaces it again", () => {
  const f = fixture(), foreign = { ...f.record, baseSha: "foreign-base", mode: "100755" };
  f.sourceListen(after => { after ? f.records.set("index.html", { ...f.record }) : f.records.delete("index.html"); });
  let replaced = false;
  f.listen(() => { if (!replaced) { replaced = true; f.records.set("index.html", foreign); } });
  const receipt = prepareNativeTextHistory(f.host, f.plan)!;
  assert.equal(receipt.apply(), false);
  assert.equal(f.models.get("index.html")!.text, "before");
  assert.equal(f.records.get("index.html"), foreign);
});

test("own UI completion refuses unrelated model proof changes", () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!; assert.equal(receipt.apply(), true);
  const finish = receipt.beginOwnUITransition(["index.html"])!;
  const owned = new Map([["index.html", f.host.modelState("index.html")]]);
  f.models.get("untouched.css")!.version++;
  assert.equal(finish(owned), false); assert.equal(receipt.undo(), false);
});
test("own UI completion refuses source changes after its exact mount proof", () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!; assert.equal(receipt.apply(), true);
  const finish = receipt.beginOwnUITransition(["index.html"])!;
  const owned = new Map([["index.html", f.host.modelState("index.html")]]);
  f.models.get("index.html")!.version++;
  assert.equal(finish(owned), false); assert.equal(receipt.undo(), false);
});
test("an unrelated path cannot be declared as an owned UI transition", () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!; assert.equal(receipt.apply(), true);
  assert.equal(receipt.beginOwnUITransition(["untouched.css"]), undefined);
});

test("an unchanged foreign model cannot become an owned UI transition", () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!;
  assert.equal(receipt.apply(), true);
  assert.equal(receipt.beginOwnUITransition(["untouched.css"]), undefined);
  assert.match(receipt.error()!, /untouched\.css.*not part of this owned source transition/);
  f.models.get("untouched.css")!.version++;
  assert.equal(receipt.undo(), false);
  assert.equal(f.records.get("index.html"), f.record);
});

// The host's stylesheet pane remounts a file during its own page transition and proves the new
// model at that mount boundary (it passes that proof in `owned`): accepted, and kept for Undo.
test("own UI completion accepts a model the host proved at its own mount during the transition", () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!; assert.equal(receipt.apply(), true);
  const finish = receipt.beginOwnUITransition(["index.html"])!;
  f.models.set("untouched.css", { text: "same", version: 1 });
  const owned = new Map([["index.html", f.host.modelState("index.html")], ["untouched.css", f.host.modelState("untouched.css")]]);
  assert.equal(finish(owned), true);
  assert.equal(receipt.undo(), true); assert.equal(f.records.has("index.html"), false);
});
test("a model proved at the host's mount must still be current when the transition completes", () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!; assert.equal(receipt.apply(), true);
  const finish = receipt.beginOwnUITransition(["index.html"])!;
  f.models.set("untouched.css", { text: "same", version: 1 });
  const owned = new Map([["index.html", f.host.modelState("index.html")], ["untouched.css", f.host.modelState("untouched.css")]]);
  f.models.get("untouched.css")!.version++;
  assert.equal(finish(owned), false); assert.match(receipt.error()!, /untouched\.css/);
  assert.equal(receipt.undo(), false);
});
test("a remount the host did not prove stays an unrelated change", () => {
  const f = fixture(), receipt = prepareNativeTextHistory(f.host, f.plan)!; assert.equal(receipt.apply(), true);
  const finish = receipt.beginOwnUITransition(["index.html"])!;
  const owned = new Map([["index.html", f.host.modelState("index.html")]]);
  f.models.set("untouched.css", { text: "same", version: 1 });
  assert.equal(finish(owned), false); assert.match(receipt.error()!, /editor for untouched\.css changed while opening/);
});
