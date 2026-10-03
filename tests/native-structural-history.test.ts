import { test } from "node:test";
import assert from "node:assert/strict";
import { planNativeStructuralDrafts } from "../src/page-builder/native-structural-history";
import type { SavedDraft } from "../src/drafts";
const scope = { account: "a", repoId: 1, repo: "a/site", branch: "main" };
const record: SavedDraft = { ...scope, version: 1, path: "index.html", baseSha: "base", original: "before", content: "before", updatedAt: 1 };
const input = () => ({ scope, before: new Map<string, SavedDraft | undefined>(), movable: new Map(), bases: new Map(), moves: [], deletes: [], creates: [], edits: new Map<string, string>(), now: 2 });
test("a page and its listing are planned without mutating the captured originals", () => {
  const plan = input(); plan.before.set("index.html", record); plan.before.set("work/new/index.html", undefined);
  const after = planNativeStructuralDrafts({ ...plan, creates: [{ path: "work/new/index.html", content: "new page" }], edits: new Map([["index.html", "new listing"]]) });
  assert.equal(plan.before.get("index.html"), record); assert.equal(record.content, "before");
  assert.equal(after.get("index.html")!.content, "new listing"); assert.equal(after.get("work/new/index.html")!.baseSha, null);
});
test("opaque moves preserve source blob and executable mode without inventing text", () => {
  const after = planNativeStructuralDrafts({ ...input(), movable: new Map([["old.bin", { path: "old.bin", sha: "blob", mode: "100755" }]]), moves: [{ from: "old.bin", to: "new.bin" }] });
  assert.equal(after.get("new.bin")!.opaque, true); assert.equal(after.get("new.bin")!.sourceSha, "blob"); assert.equal(after.get("new.bin")!.mode, "100755");
  assert.equal(after.get("old.bin")!.movedTo, "new.bin");
});
test("edits at arriving paths are merged with their move metadata", () => {
  const after = planNativeStructuralDrafts({ ...input(), movable: new Map([["old.html", { path: "old.html", sha: "blob", text: "old page" }]]), moves: [{ from: "old.html", to: "new.html" }], edits: new Map([["new.html", "rewritten page"]]) });
  assert.equal(after.get("new.html")!.content, "rewritten page"); assert.equal(after.get("new.html")!.movedFrom, "old.html"); assert.equal(after.get("new.html")!.sourceSha, "blob");
});
test("deleting a never-published page has an undefined after state", () => {
  const plan = input(); const created = { ...record, path: "new.html", baseSha: null, original: "", content: "new" }; plan.before.set("new.html", created);
  const after = planNativeStructuralDrafts({ ...plan, movable: new Map([["new.html", { path: "new.html", text: "new" }]]), deletes: ["new.html"] });
  assert.equal(after.get("new.html"), undefined); assert.equal(plan.before.get("new.html"), created);
});
