import { test } from "node:test";
import assert from "node:assert/strict";
import { createSavePublishController, type SavePublishPorts } from "../src/controllers/save-publish-controller.ts";
import type { DraftScope, SavedDraft } from "../src/drafts.ts";
import { listChanges } from "../src/file-changes.ts";
import { EMPTY_COMMIT, type PublishResult, type Snapshot } from "../shared/types.ts";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const draft = (path: string, over: Partial<SavedDraft> = {}): SavedDraft =>
  ({ version: 1, account: "lex", repoId: 1, repo: "lex/site1", branch: "main", path, baseSha: "b".repeat(40), original: "old", content: "new", updatedAt: 1, ...over });
const snap = (commit = "a".repeat(40), branch = "main", extra: Partial<Snapshot> = {}): Snapshot => ({ commit, branch, entries: [], ...extra } as Snapshot);
const scope1: DraftScope = { account: "lex", repoId: 1, repo: "lex/site1", branch: "main" };
const result = (commit: string) => ({ commit, url: "u" } as PublishResult);
type Entry = { path: string; sha: string; mode: string; type: "blob" } | undefined;

function fixture() {
  const state = { generation: 1, account: "lex", repoId: 1, snapshot: snap() as Snapshot | undefined, visible: true };
  const drafts = new Map<string, SavedDraft>();
  const calls: unknown[][] = [];
  const answers: ReturnType<typeof deferred<unknown>>[] = [];
  const entries = new Map<string, ReturnType<typeof deferred<Entry>>>();
  const asked: ReturnType<typeof deferred<boolean>>[] = [];
  const questions: string[] = [];
  const log: string[] = [];
  const hooks: { get?: () => void } = {};
  let wake: (() => void) | undefined, unwoken = 0, loads = 0, resync = false, opened: string | undefined;
  const ports: SavePublishPorts = {
    generation: () => state.generation,
    snapshot: () => state.snapshot,
    scope: () => state.snapshot ? { account: state.account, repoId: state.repoId, repo: `lex/site${state.repoId}`, branch: state.snapshot.branch } : undefined,
    drafts: () => ({
      list: () => [...drafts.values()], get: (_s, path) => { hooks.get?.(); return drafts.get(path); },
      save: (value) => { drafts.set(value.path, value); return true; }, remove: (_s, path) => drafts.delete(path),
    }),
    api: <T>(action: string, body: Record<string, string>) => { calls.push([action, body]); const answer = deferred<unknown>(); answers.push(answer); return answer.promise as Promise<T>; },
    onWake: (check) => { wake = check; return () => { wake = undefined; unwoken++; }; },
    visible: () => state.visible,
    reload: async () => { loads++; },
    findEntry: (path) => { const answer = deferred<Entry>(); entries.set(path, answer); return answer.promise; },
    forget: (_s, path) => { log.push(`forget ${path}`); },
    redraw: () => { log.push("redraw"); },
    changed: () => { log.push("changed"); },
    release: (paths) => { log.push(`release ${[...paths].join(",")}`); return opened && paths.has(opened) ? opened : undefined; },
    openAfter: async (path) => { log.push(`open ${path ?? "-"}`); },
    announce: (text) => { log.push(text); },
    saved: () => { log.push("saved"); },
    adopt: (value) => { state.snapshot = value; log.push(`snapshot ${value.commit.slice(0, 1)}`); },
    showSaved: (commit) => { log.push(`shown ${commit.slice(0, 1)}`); },
    status: (text) => { log.push(text); },
    fail: (error) => { log.push(`error ${String(error)}`); },
    change: (path) => listChanges([...drafts.values()]).find((change) => change.path === path),
    openFile: () => opened,
    secondary: () => undefined,
    drop: (_s, path) => { log.push(`drop ${path}`); return false; },
    clearHistory: () => { log.push("clear history"); },
    resync: () => resync,
    fallback: () => "index.html",
    reopen: (wasOpen, back, styled) => { log.push(`reopen ${wasOpen} ${back ?? "-"} ${styled}`); },
    confirm: (question) => { questions.push(question.title); const answer = deferred<boolean>(); asked.push(answer); return answer.promise; },
  };
  const controller = createSavePublishController(ports);
  return {
    controller, state, drafts, calls, answers, entries, asked, questions, log, hooks,
    wake: () => wake?.(), counts: () => ({ loads, unwoken }),
    open: (path?: string) => { opened = path; }, resyncing: (value: boolean) => { resync = value; },
  };
}

// A save's proof drops its result once any part of the scope moved on.
test("a save goes through only for the generation, account, repository and branch it began on", () => {
  const moves: Record<string, (s: ReturnType<typeof fixture>["state"]) => void> = {
    generation: (s) => { s.generation++; }, account: (s) => { s.account = "other"; },
    repository: (s) => { s.repoId = 2; }, branch: (s) => { s.snapshot = snap(undefined, "dev"); },
  };
  for (const [name, move] of Object.entries(moves)) {
    const f = fixture(), was = f.controller.proof();
    move(f.state);
    f.controller.published(was, scope1, result("f".repeat(40)), []);
    assert.deepEqual(f.log, [], name);
    assert.equal(f.calls.length, 0, name);
  }
  const refreshed = fixture(), was = refreshed.controller.proof();
  refreshed.state.snapshot = snap("e".repeat(40));
  refreshed.controller.published(was, scope1, result("f".repeat(40)), []);
  assert.deepEqual(refreshed.log, ["saved"], "a refreshed snapshot of the same branch still takes the save");
});

test("head trust: a seen head is trusted, an empty repository commits onto the null commit", () => {
  const f = fixture();
  assert.equal(f.controller.trustedHead(), undefined);
  f.controller.seeHead("c".repeat(40));
  assert.equal(f.controller.trustedHead(), "c".repeat(40));
  assert.equal(f.controller.headFor(scope1), "c".repeat(40));
  assert.equal(f.controller.headFor({ ...scope1, branch: "dev" }), undefined);
  assert.equal(f.controller.headFor({ ...scope1, repoId: 2 }), undefined);
  const empty = fixture();
  empty.state.snapshot = snap(EMPTY_COMMIT, "main", { empty: true });
  assert.equal(empty.controller.headFor(scope1), EMPTY_COMMIT);
});

test("a head check loads a moved branch once, throttled, and drops answers for another scope", async () => {
  const f = fixture();
  f.wake();
  assert.equal(f.calls.length, 1);
  f.wake();
  assert.equal(f.calls.length, 1, "throttled to one check per 15 seconds");
  f.answers[0].resolve({ commit: "d".repeat(40) });
  await flush();
  assert.equal(f.counts().loads, 1);
  assert.equal(f.controller.trustedHead(), "d".repeat(40));

  const g = fixture();
  void g.controller.checkHead(true);
  g.state.generation++;
  g.answers[0].resolve({ commit: "d".repeat(40) });
  await flush();
  assert.equal(g.counts().loads, 0, "a new generation drops the answer");

  const h = fixture();
  void h.controller.checkHead(true);
  void h.controller.checkHead(true);
  h.answers[0].resolve({ commit: "d".repeat(40) });
  await flush();
  assert.equal(h.counts().loads, 0, "a newer forced check supersedes the older");
  h.answers[1].resolve({ commit: "a".repeat(40) });
  await flush();
  assert.equal(h.counts().loads, 0, "the same head loads nothing");

  const hidden = fixture();
  hidden.state.visible = false;
  hidden.wake();
  assert.equal(hidden.calls.length, 0);
  hidden.controller.dispose();
  assert.equal(hidden.counts().unwoken, 1);
});

test("deleted upstream: a missing edit waits to be settled, a missing deletion goes, a late answer for another scope is dropped", async () => {
  const f = fixture();
  f.drafts.set("gone.html", draft("gone.html"));
  f.drafts.set("removed.html", draft("removed.html", { deleted: true }));
  f.drafts.set("kept.html", draft("kept.html"));
  const done = f.controller.checkDeleted(1);
  assert.equal(f.controller.checkDeleted(1), done, "once per snapshot load");
  f.entries.get("gone.html")!.resolve(undefined);
  f.entries.get("removed.html")!.resolve(undefined);
  f.entries.get("kept.html")!.resolve({ path: "kept.html", sha: "c".repeat(40), mode: "100644", type: "blob" });
  await done;
  assert.equal(f.controller.isDeleted("gone.html"), true);
  assert.equal(f.drafts.has("removed.html"), false);
  assert.equal(f.drafts.has("kept.html"), true);
  assert.deepEqual(f.log, ["redraw"]);
  f.controller.resetDeleted();
  assert.equal(f.controller.isDeleted("gone.html"), false);

  const g = fixture();
  g.drafts.set("gone.html", draft("gone.html"));
  const late = g.controller.checkDeleted(1);
  g.state.snapshot = snap("e".repeat(40));
  g.entries.get("gone.html")!.resolve(undefined);
  await late;
  assert.equal(g.controller.isDeleted("gone.html"), false);
  assert.deepEqual(g.log, []);

  const stale = fixture();
  stale.drafts.set("gone.html", draft("gone.html"));
  await stale.controller.checkDeleted(0);
  assert.equal(stale.entries.size, 0, "an old epoch looks nothing up");
});

test("settling a deleted draft keeps it as a new file or drops it, then reopens what was open", async () => {
  const f = fixture();
  f.drafts.set("gone.html", draft("gone.html"));
  const check = f.controller.checkDeleted(1);
  f.entries.get("gone.html")!.resolve(undefined);
  await check;
  f.log.length = 0;
  f.open("gone.html");
  f.controller.settleDeleted("gone.html", true);
  assert.equal(f.drafts.get("gone.html")?.baseSha, null);
  assert.equal(f.controller.isDeleted("gone.html"), false);
  assert.deepEqual(f.log, ["release gone.html", "changed", "open gone.html", "Kept gone.html as a new file. Saving creates it again."]);
  f.log.length = 0;
  f.open(undefined);
  f.controller.settleDeleted("gone.html", false);
  assert.equal(f.drafts.has("gone.html"), false);
  assert.deepEqual(f.log, ["release gone.html", "changed", "Discarded the draft of gone.html."]);
});

test("a save refreshes the snapshot once, in order, and only for the scope it began on", async () => {
  const f = fixture();
  f.controller.published(f.controller.proof(), scope1, result("f".repeat(40)), []);
  assert.deepEqual(f.log, ["saved"]);
  assert.equal(f.calls.length, 1, "the refresh request starts before the host's save steps");
  assert.equal(f.controller.trustedHead(), "f".repeat(40));
  assert.deepEqual(f.calls[0], ["snapshot", { repo: "lex/site1", branch: "main", commit: "f".repeat(40) }]);
  f.answers[0].resolve(snap("f".repeat(40)));
  await flush();
  assert.deepEqual(f.log.slice(1), ["snapshot f", "shown f", "Selected files saved to GitHub."]);

  const raced = fixture();
  raced.controller.published(raced.controller.proof(), scope1, result("f".repeat(40)), []);
  raced.state.repoId = 2;
  raced.answers[0].resolve(snap("f".repeat(40)));
  await flush();
  assert.deepEqual(raced.log, ["saved"], "another repository keeps its snapshot");

  const twice = fixture();
  twice.controller.published(twice.controller.proof(), scope1, result("1".repeat(40)), []);
  twice.controller.published(twice.controller.proof(), scope1, result("2".repeat(40)), []);
  twice.answers[1].resolve(snap("2".repeat(40)));
  await flush();
  twice.answers[0].resolve(snap("1".repeat(40)));
  await flush();
  assert.equal(twice.state.snapshot?.commit, "2".repeat(40), "an older save's answer never steps back");

  const failed = fixture();
  failed.controller.published(failed.controller.proof(), scope1, result("f".repeat(40)), []);
  failed.answers[0].reject("down");
  await flush();
  assert.deepEqual(failed.log, ["saved", "error down"]);
});

test("discard drops a rename's two halves together, clears editor history and reopens the old path", () => {
  const f = fixture();
  f.drafts.set("new.html", draft("new.html", { baseSha: null, movedFrom: "old.html" }));
  f.drafts.set("old.html", draft("old.html", { deleted: true, movedTo: "new.html" }));
  f.drafts.set("other.html", draft("other.html"));
  f.open("new.html");
  assert.equal(f.controller.discard(["new.html"]), 2);
  assert.deepEqual([...f.drafts.keys()], ["other.html"]);
  assert.deepEqual(f.log, ["release new.html,old.html", "drop new.html", "drop old.html", "clear history", "changed", "reopen true old.html false"]);

  const added = fixture();
  added.drafts.set("about.html", draft("about.html", { baseSha: null }));
  added.open("about.html");
  added.controller.discard(["about.html"]);
  assert.equal(added.log.at(-1), "reopen true index.html false", "a new page opens its parent page");

  const site = fixture();
  site.drafts.set("index.html", draft("index.html", { baseSha: null }));
  site.resyncing(true);
  site.open("index.html");
  assert.equal(site.controller.discard(), 1);
  assert.equal(site.log.some((line) => line.startsWith("reopen")), false, "the project opens again instead");
});

test("a discard confirmed for another scope, or superseded, does nothing; a cancelled one keeps the drafts", async () => {
  const f = fixture();
  f.drafts.set("a.html", draft("a.html"));
  const one = f.controller.discardFile("a.html");
  assert.deepEqual(f.questions, ["Discard the changes to a.html?"]);
  f.state.snapshot = snap(undefined, "dev");
  f.asked[0].resolve(true);
  await one;
  assert.equal(f.drafts.has("a.html"), true, "the branch changed while asking");

  const all = fixture();
  all.drafts.set("a.html", draft("a.html"));
  all.drafts.set("b.html", draft("b.html"));
  const first = all.controller.discardAll();
  assert.deepEqual(all.questions, ["Discard 2 unsaved changes?"]);
  all.asked[0].resolve(false);
  await first;
  assert.equal(all.drafts.size, 2, "cancelled");
  const older = all.controller.discardAll();
  const newer = all.controller.discardFile("a.html");
  all.asked[1].resolve(true);
  await older;
  assert.equal(all.drafts.size, 2, "a newer question supersedes the older");
  all.asked[2].resolve(true);
  await newer;
  assert.deepEqual([...all.drafts.keys()], ["b.html"]);
  assert.equal(all.log.at(-1), "Discarded the changes to a.html.");

  const done = fixture();
  done.drafts.set("a.html", draft("a.html"));
  const last = done.controller.discardAll();
  done.asked[0].resolve(true);
  await last;
  assert.equal(done.drafts.size, 0);
  assert.equal(done.log.at(-1), "Discarded 1 unsaved change.");
});

test("a discard confirmed while a save's refresh adopts a snapshot of the same branch still discards", async () => {
  const f = fixture();
  f.drafts.set("a.html", draft("a.html"));
  const one = f.controller.discardFile("a.html");
  f.state.snapshot = snap("e".repeat(40));
  f.asked[0].resolve(true);
  await one;
  assert.equal(f.drafts.has("a.html"), false);
  assert.equal(f.log.at(-1), "Discarded the changes to a.html.");
});

test("pruned drafts are forgotten and redrawn when a save's refresh adopts a snapshot mid-check", async () => {
  const f = fixture();
  f.drafts.set("same.html", draft("same.html", { content: "x" }));
  const check = f.controller.checkDeleted(1);
  // The blob SHA of "x", so the draft is GitHub's version and is pruned.
  // The refresh lands while the blob SHAs are worked out (pruneUnchanged reads the draft again).
  f.hooks.get = () => { f.state.snapshot = snap("e".repeat(40)); };
  f.entries.get("same.html")!.resolve({ path: "same.html", sha: "c1b0730e0133447badcfd47fd144e254807b06e1", mode: "100644", type: "blob" });
  await check;
  assert.equal(f.drafts.has("same.html"), false);
  assert.deepEqual(f.log, ["forget same.html", "redraw"]);
});
