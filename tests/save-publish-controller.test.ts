import { test } from "node:test";
import assert from "node:assert/strict";
import { createSavePublishController, type SavePublishPorts } from "../src/controllers/save-publish-controller.ts";
import type { DraftScope, SavedDraft } from "../src/drafts.ts";
import { keepAsNewFile, pruneUnchanged, settleDeletedUpstream } from "../src/file-changes.ts";
import { EMPTY_COMMIT, type Repository, type Snapshot } from "../shared/types.ts";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const repo = (id = 1): Repository => ({ id, name: "site", full_name: `lex/site${id}`, private: false } as Repository);
const draft = (path: string, over: Partial<SavedDraft> = {}): SavedDraft =>
  ({ version: 1, account: "lex", repoId: 1, repo: "lex/site1", branch: "main", path, baseSha: "b".repeat(40), original: "old", content: "new", updatedAt: 1, ...over });
const snap = (commit = "a".repeat(40), branch = "main", extra: Partial<Snapshot> = {}): Snapshot => ({ commit, branch, entries: [], ...extra } as Snapshot);

function fixture(overrides: Partial<SavePublishPorts> = {}) {
  const state = { generation: 1, account: "lex" as string | undefined, repository: repo() as Repository | undefined, snapshot: snap() as Snapshot | undefined, visible: true };
  const drafts = new Map<string, SavedDraft>();
  const calls: unknown[][] = [];
  const answers: ReturnType<typeof deferred<unknown>>[] = [];
  let wake: (() => void) | undefined, unwoken = 0, loads = 0;
  const log: string[] = [];
  const entries = new Map<string, ReturnType<typeof deferred<{ path: string; sha: string; mode: string; type: "blob" } | undefined>>>();
  let resync = false, opened: string | undefined;
  const scope = (): DraftScope | undefined => state.repository && state.snapshot && state.account
    ? { account: state.account, repoId: state.repository.id, repo: state.repository.full_name, branch: state.snapshot.branch } : undefined;
  const ports: SavePublishPorts = {
    generation: () => state.generation, account: () => state.account, repository: () => state.repository, snapshot: () => state.snapshot,
    draftScope: scope,
    drafts: () => ({
      list: () => [...drafts.values()], get: (_s, path) => drafts.get(path),
      save: (value) => { drafts.set(value.path, value); return true; }, remove: (_s, path) => drafts.delete(path),
    }),
    api: <T>(action: string, body: Record<string, unknown>) => { calls.push([action, body]); const answer = deferred<unknown>(); answers.push(answer); return answer.promise as Promise<T>; },
    visible: () => state.visible,
    onWake: (check) => { wake = check; return () => { wake = undefined; unwoken++; }; },
    loadSnapshot: async () => { loads++; },
    findEntry: (path) => { const answer = deferred<{ path: string; sha: string; mode: string; type: "blob" } | undefined>(); entries.set(path, answer); return answer.promise; },
    settleDeletedUpstream, pruneUnchanged, keepAsNewFile,
    nativeSite: () => true,
    forgetDraftModel: (_s, path) => { log.push(`forget ${path}`); },
    refreshDrafts: () => { log.push("drafts"); }, renderFileTree: () => { log.push("tree"); },
    updateNativePreviewSources: () => { log.push("preview"); },
    forgetDraftedAssets: () => { log.push("assets"); }, refreshHistory: () => { log.push("history"); },
    refreshNativeSite: () => { log.push("routes"); }, updateAgentContext: () => { log.push("agent"); },
    updateCurrentPageLabel: () => { log.push("label"); }, resyncNativeSite: () => { log.push("resync"); return resync; },
    requestExplorerImagesRefresh: () => { log.push("images"); },
    releaseFiles: (paths) => { log.push(`release ${[...paths].join(",")}`); return opened && paths.has(opened) ? opened : undefined; },
    openAfter: async (path) => { log.push(`open ${path ?? "-"}`); },
    announce: (text) => { log.push(text); },
    adoptNativeBaseSources: () => { log.push("adopt"); }, sweepUploads: () => { log.push("sweep"); },
    trackPublished: () => { log.push("track"); },
    adoptSnapshot: (_r, value) => { state.snapshot = value; log.push(`snapshot ${value.commit.slice(0, 1)}`); },
    setRevision: (commit) => { log.push(`revision ${commit.slice(0, 1)}`); }, startNativeTextIndex: () => { log.push("index"); },
    status: (text) => { log.push(text); }, errorMessage: (error) => { log.push(`error ${String(error)}`); },
    ...overrides,
  };
  const controller = createSavePublishController(ports);
  return {
    controller, state, drafts, calls, answers, log, entries, wake: () => wake?.(), counts: () => ({ loads, unwoken }),
    open: (path?: string) => { opened = path; }, resyncing: (value: boolean) => { resync = value; },
  };
}

test("the proof holds only for the same generation, account, repository, branch and snapshot", () => {
  const f = fixture();
  const was = f.controller.proof();
  assert.equal(f.controller.live(was), true);
  f.state.snapshot = snap("b".repeat(40));
  assert.equal(f.controller.live(was), false);
  assert.equal(f.controller.live(was, false), true, "a refreshed snapshot of the branch passes when asked");
  for (const [name, change] of Object.entries({
    generation: (s: typeof f.state) => { s.generation++; }, account: (s: typeof f.state) => { s.account = "other"; },
    repository: (s: typeof f.state) => { s.repository = repo(2); }, branch: (s: typeof f.state) => { s.snapshot = snap(undefined, "dev"); },
  })) {
    const g = fixture(), proof = g.controller.proof();
    change(g.state);
    assert.equal(g.controller.live(proof, false), false, name);
  }
});

test("head trust: a seen head is trusted, an empty repository commits onto the null commit", () => {
  const f = fixture();
  assert.equal(f.controller.trustedHead(), undefined);
  f.controller.seeHead("c".repeat(40));
  assert.equal(f.controller.trustedHead(), "c".repeat(40));
  const scope = { account: "lex", repoId: 1, repo: "lex/site1", branch: "main" };
  assert.equal(f.controller.publishedHead(scope), "c".repeat(40));
  assert.equal(f.controller.publishedHead({ ...scope, branch: "dev" }), undefined);
  assert.equal(f.controller.publishedHead({ ...scope, repoId: 2 }), undefined);
  const empty = fixture();
  empty.state.snapshot = snap(EMPTY_COMMIT, "main", { empty: true });
  assert.equal(empty.controller.publishedHead(scope), EMPTY_COMMIT);
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
  void g.controller.checkBranchHead(true);
  g.state.generation++;
  g.answers[0].resolve({ commit: "d".repeat(40) });
  await flush();
  assert.equal(g.counts().loads, 0, "a new generation drops the answer");

  const h = fixture();
  void h.controller.checkBranchHead(true);
  void h.controller.checkBranchHead(true);
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
  const done = f.controller.checkDeletedUpstream(1);
  assert.equal(f.controller.checkDeletedUpstream(1), done, "once per snapshot load");
  f.entries.get("gone.html")!.resolve(undefined);
  f.entries.get("removed.html")!.resolve(undefined);
  f.entries.get("kept.html")!.resolve({ path: "kept.html", sha: "c".repeat(40), mode: "100644", type: "blob" });
  await done;
  assert.equal(f.controller.isDeletedUpstream("gone.html"), true);
  assert.equal(f.drafts.has("removed.html"), false);
  assert.equal(f.drafts.has("kept.html"), true);
  assert.deepEqual(f.log, ["drafts", "tree", "preview"]);

  const g = fixture();
  g.drafts.set("gone.html", draft("gone.html"));
  const late = g.controller.findDeletedUpstream(1);
  g.state.snapshot = snap("e".repeat(40));
  g.entries.get("gone.html")!.resolve(undefined);
  await late;
  assert.equal(g.controller.isDeletedUpstream("gone.html"), false);
  assert.deepEqual(g.log, []);

  const stale = fixture();
  stale.drafts.set("gone.html", draft("gone.html"));
  await stale.controller.findDeletedUpstream(0);
  assert.equal(stale.entries.size, 0, "an old epoch looks nothing up");
});

test("settling a deleted draft keeps it as a new file or drops it, then reopens what was open", async () => {
  const f = fixture();
  f.drafts.set("gone.html", draft("gone.html"));
  f.entries.clear();
  const check = f.controller.findDeletedUpstream(1);
  f.entries.get("gone.html")!.resolve(undefined);
  await check;
  f.log.length = 0;
  f.open("gone.html");
  f.controller.settleDeletedDraft("gone.html", true);
  assert.equal(f.drafts.get("gone.html")?.baseSha, null);
  assert.equal(f.controller.isDeletedUpstream("gone.html"), false);
  assert.deepEqual(f.log, ["release gone.html", "assets", "drafts", "history", "routes", "tree", "agent", "label", "resync", "images", "open gone.html", "Kept gone.html as a new file. Saving creates it again."]);
  f.log.length = 0;
  f.open(undefined);
  f.controller.settleDeletedDraft("gone.html", false);
  assert.equal(f.drafts.has("gone.html"), false);
  assert.equal(f.log.at(-1), "Discarded the draft of gone.html.");
  assert.equal(f.log.some((line) => line.startsWith("open")), false);
});

const scope1 = { account: "lex", repoId: 1, repo: "lex/site1", branch: "main" };
const result = (commit: string) => ({ commit, url: "u" } as import("../shared/types.ts").PublishResult);

test("a save refreshes the snapshot once, in order, and only for the scope it began on", async () => {
  const f = fixture();
  const was = f.controller.proof();
  f.controller.published(was, scope1, result("f".repeat(40)), []);
  assert.deepEqual(f.log, ["adopt", "sweep", "track"]);
  assert.equal(f.controller.trustedHead(), "f".repeat(40));
  assert.deepEqual(f.calls[0], ["snapshot", { repo: "lex/site1", branch: "main", commit: "f".repeat(40) }]);
  f.answers[0].resolve(snap("f".repeat(40)));
  await flush();
  assert.deepEqual(f.log.slice(3), ["snapshot f", "agent", "revision f", "tree", "index", "Selected files saved to GitHub."]);

  const moved = fixture();
  const old = moved.controller.proof();
  moved.state.generation++;
  moved.controller.published(old, scope1, result("f".repeat(40)), []);
  assert.deepEqual(moved.log, [], "a save for an old workspace changes nothing");

  const raced = fixture();
  void raced.controller.refreshAfterPublish(scope1, "f".repeat(40));
  raced.state.repository = repo(2);
  raced.answers[0].resolve(snap("f".repeat(40)));
  await flush();
  assert.deepEqual(raced.log, [], "another repository keeps its snapshot");

  const twice = fixture();
  void twice.controller.refreshAfterPublish(scope1, "1".repeat(40));
  void twice.controller.refreshAfterPublish(scope1, "2".repeat(40));
  twice.answers[1].resolve(snap("2".repeat(40)));
  await flush();
  twice.answers[0].resolve(snap("1".repeat(40)));
  await flush();
  assert.equal(twice.state.snapshot?.commit, "2".repeat(40), "an older save's answer never steps back");

  const failed = fixture();
  void failed.controller.refreshAfterPublish(scope1, "f".repeat(40));
  failed.answers[0].reject("down");
  await flush();
  assert.deepEqual(failed.log, ["error down"]);
});
