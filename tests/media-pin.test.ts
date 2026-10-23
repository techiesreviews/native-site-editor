import { test } from "node:test";
import assert from "node:assert/strict";
import { pinMedia, type MediaPinPorts } from "../src/controllers/media-pin";
import { createWorkspaceSession, type WorkspaceScope } from "../src/workspace-session";
import type { DraftScope, SavedDraft } from "../src/drafts";
import type { Repository, Snapshot, TreeEntry } from "../shared/types";

// Ticket 23: the pin reads through the editor while its workspace is on show (a new load of it too),
// and through its own snapshot, texts and drafts once another workspace or a version view is shown.
function fixture() {
  const scope: DraftScope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
  const shown: WorkspaceScope = { kind: "github", ...scope };
  const session = createWorkspaceSession(shown);
  const repo = { id: 1, full_name: "lex/site", size: 10 } as Repository; // eslint-disable-line no-restricted-syntax -- only the id, name and size are read.
  const snapshot = { branch: "main", commit: "c1", entries: [] } as unknown as Snapshot; // eslint-disable-line no-restricted-syntax -- only passed through.
  const drafts = new Map<string, SavedDraft>(), texts = new Map([["index.html", "branch text"]]);
  const pinnedEntry = { path: "index.html", sha: "s1", mode: "100644", type: "blob" } as TreeEntry;
  const ports = {
    shown: () => ({ repo, scope, snapshot }), begin: () => session.begin(),
    base: () => ({ files: ["index.html"], texts, key: "k1" }),
    live: { entry: () => undefined, find: async () => undefined, source: () => "live text", files: () => ["live.html"], remember: () => {} },
    entry: () => pinnedEntry, find: async () => pinnedEntry, files: (_scope, base) => [...base, "drafted.html"], list: async () => [],
    peek: () => undefined, identity: () => "1", drafts: () => ({ list: () => [...drafts.values()], get: (_s, path) => drafts.get(path), save: () => true, remove: () => true }),
  } satisfies MediaPinPorts;
  return { session, shown, ports, drafts, texts };
}

test("on show the pin reads through the editor; elsewhere its own snapshot, texts and drafts", async () => {
  const f = fixture(), pin = pinMedia(f.ports)!;
  assert.equal(pin.here(), true);
  assert.equal(pin.source("index.html"), "live text");
  assert.deepEqual(pin.files(), ["live.html"]);
  f.session.next(f.shown);
  assert.equal(pin.here(), true, "a new load of it is on show");
  f.texts.clear();
  f.session.next({ ...f.shown, branch: "feature" });
  assert.equal(pin.here(), false);
  assert.equal(pin.source("index.html"), "branch text", "the texts as read when pinned");
  assert.deepEqual(pin.files(), ["index.html", "drafted.html"]);
  assert.equal((await pin.find("index.html"))?.sha, "s1");
  f.drafts.set("index.html", { account: "lex", repoId: 1, repo: "lex/site", branch: "main", version: 1, path: "index.html", baseSha: "s1", original: "branch text", content: "drafted", updatedAt: 1 });
  assert.equal(pin.source("index.html"), "drafted", "its workspace's draft wins");
});

test("a version view of the pinned branch is elsewhere; nothing open pins nothing", () => {
  const f = fixture(), pin = pinMedia(f.ports)!;
  f.session.next({ ...f.shown, view: "abc1234" });
  assert.equal(pin.here(), false);
  assert.equal(pinMedia({ ...f.ports, shown: () => undefined }), undefined);
});
