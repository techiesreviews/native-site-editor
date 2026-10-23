import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_PAGE_LIMIT, backgroundKey, createBackgroundPages, pinnedPorts } from "../src/background-page";
import type { MediaControllerPorts, MediaPin } from "../src/controllers/media-controller";
import type { DraftScope, SavedDraft } from "../src/drafts";
import { deferred } from "./fakes/memory-workspace";

// Ticket 27: background pages of a site, branch and page not shown. One per page, shared by its work,
// closed once that work is done; at most BACKGROUND_PAGE_LIMIT at once, the rest waiting their turn.
function registry(limit?: number) {
  const opened: string[] = [], closed: string[] = [];
  const pages = createBackgroundPages<{ key: string; close(): void }>(limit);
  const open = (key: string) => () => { opened.push(key); return { key, close: () => { closed.push(key); } }; };
  return { pages, opened, closed, use: <T>(key: string, work: (page: { key: string }) => Promise<T> | T) => pages.use(key, open(key), work) };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test("a background page opens for its work and closes once that work is done", async () => {
  const r = registry();
  const held = deferred<void>();
  const work = r.use("main|index.html", async page => { await held.promise; return page.key; });
  await tick();
  assert.deepEqual(r.pages.open(), ["main|index.html"]);
  assert.deepEqual(r.closed, []);
  held.resolve();
  assert.equal(await work, "main|index.html");
  assert.deepEqual(r.pages.open(), []);
  await tick();
  assert.deepEqual(r.closed, ["main|index.html"]);
});

test("work that fails closes its background page too", async () => {
  const r = registry();
  await assert.rejects(r.use("main|index.html", () => { throw new Error("refused"); }), /refused/);
  await tick();
  assert.deepEqual(r.pages.open(), []);
  assert.deepEqual(r.closed, ["main|index.html"]);
});

test("work for the same site, branch and page shares one background page, closed after the last", async () => {
  const r = registry();
  const first = deferred<void>(), second = deferred<void>();
  const a = r.use("k", async () => { await first.promise; }), b = r.use("k", async () => { await second.promise; });
  await tick();
  assert.deepEqual(r.opened, ["k"], "opened once");
  first.resolve(); await a; await tick();
  assert.deepEqual(r.closed, [], "still in use");
  second.resolve(); await b; await tick();
  assert.deepEqual(r.closed, ["k"]);
});

test("the memory limit holds: work beyond it waits, in the order it came, and none is refused", async () => {
  const r = registry();
  const holds = Array.from({ length: BACKGROUND_PAGE_LIMIT + 2 }, () => deferred<void>());
  const works = holds.map((held, index) => r.use(`page ${index}`, async () => { await held.promise; return index; }));
  await tick();
  assert.equal(r.pages.open().length, BACKGROUND_PAGE_LIMIT);
  assert.deepEqual(r.opened, holds.slice(0, BACKGROUND_PAGE_LIMIT).map((_, index) => `page ${index}`));
  holds[1].resolve(); await works[1]; await tick();
  assert.equal(r.pages.open().length, BACKGROUND_PAGE_LIMIT, "the first waiting takes the room");
  assert.equal(r.opened.at(-1), `page ${BACKGROUND_PAGE_LIMIT}`);
  for (const held of holds) held.resolve();
  assert.deepEqual(await Promise.all(works), holds.map((_, index) => index));
  await tick();
  assert.deepEqual(r.pages.open(), []);
  assert.equal(r.closed.length, holds.length);
});

test("work for a page already open shares it while others wait for room", async () => {
  const r = registry(1);
  const held = deferred<void>();
  const a = r.use("k", async () => { await held.promise; });
  const waiting = r.use("other", async () => "other");
  const sharing = r.use("k", async () => "shared");
  assert.equal(await sharing, "shared");
  assert.deepEqual(r.opened, ["k"]);
  held.resolve(); await a;
  assert.equal(await waiting, "other");
  assert.deepEqual(r.opened, ["k", "other"]);
});

test("a background page belongs to one account (any capitals), repository, branch and page", () => {
  const scope = { account: "Lex", repoId: 1, branch: "main" };
  assert.equal(backgroundKey(scope, "index.html"), backgroundKey({ ...scope, account: "lex" }, "index.html"));
  assert.notEqual(backgroundKey(scope, "index.html"), backgroundKey({ ...scope, branch: "feature" }, "index.html"));
  assert.notEqual(backgroundKey(scope, "index.html"), backgroundKey(scope, "about/index.html"));
});

// The ports a placement uses, held to the workspace it began on: the editor's while it is shown, its
// background page's once another is shown.
function pinned() {
  let here = true;
  const scope: DraftScope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
  const drafts = new Map<string, SavedDraft>();
  const store = { get: (_scope: DraftScope, path: string) => drafts.get(path), save: (draft: SavedDraft) => { drafts.set(draft.path, draft); return true; }, remove: () => true, list: () => [...drafts.values()] };
  const pin = { repo: "lex/site", scope, identity: "1", drafts: store, here: () => here,
    entry: () => ({ path: "index.html", sha: "s1", mode: "100644", type: "blob" as const }), find: async () => undefined,
    source: (path: string) => drafts.get(path)?.content ?? (path === "index.html" ? "<img src=a.png>" : undefined),
    files: () => ["index.html"], list: async () => ["index.html"], remember: () => {} } satisfies MediaPin;
  const said: string[] = [], changes: string[] = [], away: string[] = [], measured: string[] = [];
  // eslint-disable-next-line no-restricted-syntax -- the placement reads only these members.
  const live = {
    source: () => "<p>shown</p>", openFile: () => "about/index.html", viewingVersion: () => false, stamp: () => ({ holds: () => false, changed: () => "scope" as const }),
    change: (path: string) => { changes.push(path); return true; }, announce: (message: string) => { said.push(message); },
    measureImage: async () => { measured.push("shown"); return undefined; },
    measureAway: async () => { measured.push("away"); return undefined; }, finishedAway: (to: DraftScope) => { away.push(to.branch); },
  } as unknown as MediaControllerPorts;
  return { ports: pinnedPorts(live, pin, "index.html"), drafts, said, changes, away, measured, leave: () => { here = false; } };
}

test("held ports read and write through the editor while their workspace is shown", async () => {
  const p = pinned();
  assert.equal(p.ports.source("index.html"), "<img src=a.png>", "the pin's reads, the editor's on show");
  assert.equal(p.ports.change("index.html", "<img src=a.png>", [{ start: 9, end: 14, text: "b.png" }], [0], "Image replaced"), true);
  assert.deepEqual(p.changes, ["index.html"]);
  await p.ports.measureImage!("index.html", [0], {});
  assert.deepEqual(p.measured, ["shown"]);
  assert.deepEqual(p.said, []);
});

test("held ports write a change to their own workspace's drafts once another is shown, and say where", async () => {
  const p = pinned();
  p.leave();
  assert.equal(p.ports.stamp().holds(), true, "a switch is no reason to stop");
  assert.equal(p.ports.openFile(), "index.html", "its own page, not the one shown");
  assert.equal(p.ports.viewingVersion(), false);
  assert.equal(p.ports.change("index.html", "<img src=a.png>", [{ start: 9, end: 14, text: "b.png" }], [0], "Image replaced"), true);
  assert.deepEqual(p.changes, [], "nothing on the page shown");
  assert.deepEqual(p.drafts.get("index.html"), { ...p.drafts.get("index.html")!, path: "index.html", branch: "main", baseSha: "s1", original: "<img src=a.png>", content: "<img src=b.png>" });
  assert.deepEqual(p.said, ["On main: Image replaced"]);
  assert.deepEqual(p.away, ["main"]);
  await p.ports.measureImage!("index.html", [0], {});
  assert.deepEqual(p.measured, ["away"], "measured in its background page");
  // Its page changed there since it was read: refused, nothing written.
  assert.equal(p.ports.change("index.html", "<img src=a.png>", [{ start: 0, end: 0, text: "x" }], [0], "Image replaced"), false);
  assert.equal(p.drafts.get("index.html")!.content, "<img src=b.png>");
});
