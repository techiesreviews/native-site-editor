import { test } from "node:test";
import assert from "node:assert/strict";
import { createSavePublishController, type SavePublishPorts } from "../src/controllers/save-publish-controller.ts";
import type { DraftScope, SavedDraft } from "../src/drafts.ts";
import { EMPTY_COMMIT, type Repository, type Snapshot } from "../shared/types.ts";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const repo = (id = 1): Repository => ({ id, name: "site", full_name: `lex/site${id}`, private: false } as Repository);
const snap = (commit = "a".repeat(40), branch = "main", extra: Partial<Snapshot> = {}): Snapshot => ({ commit, branch, entries: [], ...extra } as Snapshot);

function fixture(overrides: Partial<SavePublishPorts> = {}) {
  const state = { generation: 1, account: "lex" as string | undefined, repository: repo() as Repository | undefined, snapshot: snap() as Snapshot | undefined, visible: true };
  const drafts = new Map<string, SavedDraft>();
  const calls: unknown[][] = [];
  const answers: ReturnType<typeof deferred<unknown>>[] = [];
  let wake: (() => void) | undefined, unwoken = 0, loads = 0;
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
    ...overrides,
  };
  const controller = createSavePublishController(ports);
  return { controller, state, drafts, calls, answers, wake: () => wake?.(), counts: () => ({ loads, unwoken }) };
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
