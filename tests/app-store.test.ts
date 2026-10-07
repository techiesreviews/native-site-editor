import { test } from "node:test";
import assert from "node:assert/strict";
import { batch, effect } from "@preact/signals-core";
import { createAppStore } from "../src/app-store.ts";
import { createDraftStore } from "../src/draft-store.ts";
import { draftKey } from "../src/drafts.ts";
import type { Repository } from "../shared/types.ts";

const repository: Repository = { id: 1, name: "site", full_name: "lex/site", private: false, default_branch: "main", owner: { login: "lex", type: "User" } };
const scope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };

test("navigation subscribers see coherent batched states, including the branch before a snapshot arrives", () => {
  const app = createAppStore(createDraftStore());
  const seen: unknown[] = [];
  const stop = effect(() => {
    seen.push([app.repository.value?.id, app.branch.value, app.snapshot.value?.commit, app.openFile.value, app.selection.value?.path]);
  });
  batch(() => {
    app.repository.value = repository;
    app.branch.value = "main";
  });
  assert.deepEqual(seen.at(-1), [1, "main", undefined, undefined, undefined]);
  batch(() => {
    app.snapshot.value = { branch: "main", commit: "head", entries: [] };
    app.openFile.value = "index.html";
    app.selection.value = { path: "index.html", tag: "p", text: "Hello", reason: "click", selectors: [] };
  });
  app.reset({ ...repository, id: 2 });
  assert.deepEqual(seen, [
    [undefined, undefined, undefined, undefined, undefined],
    [1, "main", undefined, undefined, undefined],
    [1, "main", "head", "index.html", "index.html"],
    [2, undefined, undefined, undefined, undefined],
  ]);
  stop();
  app.dispose();
});

test("draft signals follow edits, undo and saved baselines without owning draft text", async () => {
  const draft = createDraftStore();
  const app = createAppStore(draft);
  const changed: string[][] = [];
  const stop = effect(() => { changed.push(app.drafts.changed.value.map(file => file.text)); });
  draft.open(scope, "index.html", { text: "one", baseSha: "base" });
  draft.edit({ scope, path: "index.html", text: "two" });
  assert.deepEqual(changed.at(-1), ["two"]);
  assert.equal(app.drafts.hasHistory.value, true);
  assert.equal((await draft.undo(draftKey(scope, "index.html"))).ok, true);
  assert.deepEqual(changed.at(-1), []);
  draft.edit({ scope, path: "index.html", text: "saved" });
  draft.markSaved(scope, "index.html", { original: "saved", baseSha: "next" });
  assert.deepEqual(changed.at(-1), []);
  assert.equal(app.drafts.store, draft);
  stop();
  app.dispose();
});

test("dispose unsubscribes the draft bridge; workspace clear can be explicitly refreshed", () => {
  const draft = createDraftStore();
  const app = createAppStore(draft);
  draft.open(scope, "index.html", { text: "one", baseSha: "base" });
  draft.write(scope, "index.html", "two");
  assert.equal(app.drafts.changed.value.length, 1);
  draft.clear();
  app.drafts.refresh();
  assert.equal(app.drafts.changed.value.length, 0);
  const revision = app.drafts.revision.value;
  app.dispose();
  app.dispose();
  draft.open(scope, "other.html", { text: "other", baseSha: "other" });
  app.drafts.refresh();
  assert.equal(app.drafts.revision.value, revision);
});

test("multi-file receipt observers never see only half the draft change", async () => {
  const draft = createDraftStore();
  const app = createAppStore(draft);
  draft.open(scope, "index.html", { text: "page", baseSha: "page-base" });
  draft.open(scope, "style.css", { text: "style", baseSha: "style-base" });
  const seen: string[][] = [];
  const stop = effect(() => { seen.push(app.drafts.changed.value.map(file => file.path).sort()); });
  assert.equal(draft.applyReceipt("page", "Change both", [
    { scope, path: "index.html", after: { text: "new page", base: "page", baseSha: "page-base" } },
    { scope, path: "style.css", after: { text: "new style", base: "style", baseSha: "style-base" } },
  ]).ok, true);
  assert.ok(seen.slice(1).every(paths => paths.join() === "index.html,style.css"));
  seen.length = 0;
  assert.equal((await draft.undo("page")).ok, true);
  assert.ok(seen.length > 0);
  assert.ok(seen.every(paths => paths.length === 0));
  stop();
  app.dispose();
});
