import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMediaBatch, type MediaBatchPorts } from "../src/media-batch";
import type { MediaPin } from "../src/controllers/media-controller";
import type { DraftScope } from "../src/drafts";
import type { Stamp } from "../src/guarded-edit";
import type { MediaDraftHost } from "../src/page-builder/media-draft-transaction";
import type { MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
import { deferred } from "./fakes/memory-workspace";

// The batch body loads with Media. Without a pin a repository switch while any of its loads is held
// refuses before staging; with one (ticket 23) the batch lands in the pin's workspace.
function harness(options: { stage?: (host: MediaDraftHost) => Promise<void> } = {}) {
  let live = true, staged = 0, listings = 0;
  const histories: string[] = [], hosts: MediaDraftHost[] = [];
  const appStore = { openFile: { value: "index.html" as string | undefined }, repository: { value: { full_name: "lex/site" } }, snapshot: { value: { branch: "main" } } };
  const workspace = deferred<Awaited<ReturnType<MediaBatchPorts["load"]>>>();
  const listing = deferred<string[]>();
  // eslint-disable-next-line no-restricted-syntax -- the batch body reads only these three exports of the lazy modules.
  const modules = [
    { applyMediaWorkspaceBatch: async (_batch: MediaWorkspaceBatch, host: MediaDraftHost) => { staged++; hosts.push(host); await options.stage?.(host); } },
    { mediaDraftTransaction: (input: unknown) => input },
    { MEDIA_RECORDS_PATH: ".editor/media.json" },
  ] as unknown as Awaited<ReturnType<MediaBatchPorts["load"]>>;
  const stamp: Stamp = { holds: () => live, changed: () => (live ? undefined : "scope") };
  // eslint-disable-next-line no-restricted-syntax -- the editor, stores and history home are faked by the members the batch body calls.
  const ports = {
    appStore, site: () => undefined, load: () => workspace.promise, stamp: () => stamp,
    listRepositoryFiles: () => { listings++; return listing.promise; },
    editor: { captureHistoryHost: (path: string) => ({ isCurrent: () => appStore.openFile.value === path }), isMounted: () => true,
      recordHistoryAction: (path: string) => { histories.push(path); return true; } },
    mediaHistoryHome: { hold: () => { histories.push("home"); return true; } },
    nativeFiles: () => ["shown.html"], draftStore: () => ({ list: () => [], get: () => undefined }), bytes: () => ({}),
    mediaTextSource: () => "shown", entryAt: () => undefined, findEntry: async () => undefined,
    refresh: () => {}, announce: () => {},
  } as unknown as MediaBatchPorts;
  const pin = {
    repo: "lex/site", scope: { account: "lex", repoId: 1, repo: "lex/site", branch: "main" }, identity: "1", drafts: { list: () => [], get: () => undefined, save: () => true, remove: () => true },
    here: () => live, entry: () => ({ path: "index.html", sha: "pinned-sha", mode: "100644", type: "blob" as const }), find: async () => undefined,
    source: () => "pinned", files: () => ["pinned.html"], list: () => listing.promise, remember: () => {},
  } satisfies MediaPin;
  const batch: MediaWorkspaceBatch = { label: "Swap image", expectedPaths: [], expectedSources: new Map(), expectedAssets: new Map(),
    edits: new Map([["index.html", "<img>"]]), moves: [], deletes: [], restores: [], uploads: [] };
  const run = (pinned = false) => applyMediaBatch(ports, pin.scope satisfies DraftScope, stamp, batch, pinned ? pin : undefined);
  return { appStore, workspace, listing, modules, run, hosts, histories, switchRepository: () => { live = false; }, back: () => { live = true; }, counts: () => ({ staged, listings }) };
}

test("without a pin, a media batch refuses a repository switch while its workspace chunk loads or the listing is read", async () => {
  for (const at of ["chunk", "listing"] as const) {
    const h = harness();
    const pending = h.run();
    if (at === "chunk") h.switchRepository();
    h.workspace.resolve(h.modules);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.counts().listings, 1, at);
    if (at === "listing") h.switchRepository();
    h.listing.resolve([]);
    await assert.rejects(pending, /repository changed/);
    assert.equal(h.counts().staged, 0, at);
  }
});

// Ticket 23: another page opened meanwhile stops nothing; the step's Undo goes to the page open as it commits.
test("a page opened while the batch loads takes the step's Undo", async () => {
  const h = harness();
  const pending = h.run();
  h.appStore.openFile.value = "about/index.html";
  h.workspace.resolve(h.modules);
  h.listing.resolve([]);
  await pending;
  assert.equal(h.counts().staged, 1);
  assert.equal(h.hosts[0].history(() => true, () => true, () => {}), true);
  assert.deepEqual(h.histories, ["about/index.html"]);
});

test("a media batch with nothing switched stages once on show, through the editor", async () => {
  const h = harness();
  const pending = h.run(true);
  h.workspace.resolve(h.modules);
  h.listing.resolve([]);
  await pending;
  assert.equal(h.counts().staged, 1);
  assert.equal(h.hosts[0].mounted("index.html"), true);
  assert.equal(h.hosts[0].source("index.html"), "shown");
});

test("a pinned batch switched away while it loads is written to its own workspace's drafts, with no Undo step", async () => {
  const h = harness();
  const pending = h.run(true);
  h.switchRepository();
  h.workspace.resolve(h.modules);
  h.listing.resolve(["a.png"]);
  await pending;
  assert.equal(h.counts().staged, 1);
  const host = h.hosts[0];
  // The pin's reads, no editor model, nothing on any page's history.
  assert.equal(host.source("index.html"), "pinned");
  assert.equal(host.mounted("index.html"), false);
  assert.equal(host.assetVersion("index.html"), "pinned-sha");
  assert.deepEqual(host.paths(), ["a.png"]);
  let disposed = false;
  assert.equal(host.history(() => true, () => true, () => { disposed = true; }), true);
  assert.equal(disposed, true, "the step's holds go at once: it has no Undo");
  assert.deepEqual(h.histories, []);
  // Its workspace shown again stops the attempt, which then runs again on show.
  assert.equal(host.stamp.holds(), true);
  h.back();
  assert.equal(host.stamp.holds(), false);
});

test("a switch during a pinned attempt rolls it back and runs it again elsewhere, where it lands", async () => {
  const h = harness({ stage: async host => {
    if (h.counts().staged > 1) return;
    h.switchRepository();
    if (!host.stamp.holds()) throw new Error("The repository changed. Close Media and open it again.");
  } });
  const pending = h.run(true);
  h.workspace.resolve(h.modules);
  h.listing.resolve([]);
  await pending;
  assert.deepEqual(h.hosts.map(host => host.mounted("index.html")), [true, false], "on show, then elsewhere");
});

test("a workspace switched back and forth during each attempt is tried three times, then says why", async () => {
  let flips = 0;
  const h = harness({ stage: async host => {
    flips++;
    if (flips % 2) h.switchRepository(); else h.back();
    if (!host.stamp.holds()) throw new Error("The repository changed. Close Media and open it again.");
  } });
  const pending = h.run(true);
  h.workspace.resolve(h.modules);
  h.listing.resolve([]);
  await assert.rejects(pending, /repository changed/);
  assert.deepEqual(h.hosts.map(host => host.mounted("index.html")), [true, false, true]);
});
