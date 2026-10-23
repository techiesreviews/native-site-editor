import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_PAGE_LIMIT, backgroundKey, createBackgroundPages, openBackgroundFrame, pinnedPorts } from "../src/background-page";
import type { NativePreview } from "../src/components/native-preview";
import type { NativeSite } from "../shared/native-project";
import type { MediaControllerPorts, MediaPin } from "../src/controllers/media-controller";
import type { DraftScope } from "../src/drafts";
import type { MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
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

// The ports a placement uses, held to the workspace and page it began on: the editor's while that page
// is shown, its background page's once another workspace (or another page of its own) is shown.
function pinned(options: { beganOnPage?: boolean } = {}) {
  let here = true, shown: DraftScope | undefined, open = options.beganOnPage ? "index.html" : "about/index.html";
  const scope: DraftScope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
  shown = scope;
  const store = { get: () => undefined, save: () => true, remove: () => true, list: () => [] };
  const pin = { repo: "lex/site", scope, identity: "1", drafts: store, here: () => here,
    entry: () => ({ path: "index.html", sha: "s1", mode: "100644", type: "blob" as const }), find: async () => undefined,
    source: (path: string) => path === "index.html" ? "<img src=a.png>" : undefined,
    files: () => ["index.html"], list: async () => ["index.html"], remember: () => {} } satisfies MediaPin;
  const said: string[] = [], changes: string[] = [], away: string[] = [], measured: string[] = [], restored: string[] = [];
  const batches: { edits: Map<string, string>; sources: Map<string, string | undefined>; label: string; pinned: boolean; opened?: string }[] = [];
  // eslint-disable-next-line no-restricted-syntax -- the placement reads only these members.
  const live = {
    source: () => "<p>shown</p>", openFile: () => open, viewingVersion: () => false, stamp: () => ({ holds: () => false, changed: () => "scope" as const }),
    change: (path: string) => { changes.push(path); return true; }, announce: (message: string) => { said.push(message); },
    restoreFile: async (path: string) => { restored.push(path); },
    applyBatch: async (_scope: DraftScope, _stamp: unknown, batch: MediaWorkspaceBatch, held?: MediaPin, opened?: string) => {
      batches.push({ edits: batch.edits, sources: batch.expectedSources, label: batch.label, pinned: held === pin, opened });
    },
    measureImage: async () => { measured.push("shown"); return undefined; },
    measureAway: async () => { measured.push("away"); return undefined; }, finishedAway: (to: DraftScope) => { away.push(to.branch); },
    shownScope: () => shown,
  } as unknown as MediaControllerPorts;
  return { ports: pinnedPorts(live, pin, "index.html"), said, changes, away, measured, restored, batches,
    leave: () => { here = false; shown = { ...scope, branch: "feature" }; },
    leaveSite: () => { here = false; shown = { account: "lex", repoId: 2, repo: "lex/other", branch: "main" }; },
    openOther: () => { open = "about/index.html"; } };
}

test("held ports read and write through the editor while their workspace is shown", async () => {
  const p = pinned();
  assert.equal(p.ports.source("index.html"), "<img src=a.png>", "the pin's reads, the editor's on show");
  assert.equal(await p.ports.change("index.html", "<img src=a.png>", [{ start: 9, end: 14, text: "b.png" }], [0], "Image replaced"), true);
  assert.deepEqual(p.changes, ["index.html"]);
  await p.ports.measureImage!("index.html", [0], {});
  assert.deepEqual(p.measured, ["shown"]);
  assert.deepEqual(p.said, []);
});

test("held ports write a change as one pinned batch for their own page once another workspace is shown, and say where", async () => {
  const p = pinned();
  p.leave();
  assert.equal(p.ports.stamp().holds(), true, "a switch is no reason to stop");
  assert.equal(p.ports.openFile(), "index.html", "its own page, not the one shown");
  assert.equal(p.ports.viewingVersion(), false);
  assert.equal(await p.ports.change("index.html", "<img src=a.png>", [{ start: 9, end: 14, text: "b.png" }], [0], "Image replaced"), true);
  assert.deepEqual(p.changes, [], "nothing on the page shown");
  assert.deepEqual(p.batches.map(batch => [batch.label, batch.pinned, [...batch.edits], [...batch.sources]]),
    [["Image replaced", true, [["index.html", "<img src=b.png>"]], [["index.html", "<img src=a.png>"]]]], "one transaction, proved by the page as it was read");
  assert.deepEqual(p.said, ["On main: Image replaced"]);
  assert.deepEqual(p.away, ["main"], "a note on the workspace it landed in");
  await p.ports.measureImage!("index.html", [0], {});
  assert.deepEqual(p.measured, ["away"], "measured in its background page");
});

test("work that landed on another site says which repository and branch", async () => {
  const p = pinned();
  p.leaveSite();
  assert.equal(await p.ports.change("index.html", "<img src=a.png>", [{ start: 9, end: 14, text: "b.png" }], [0], "Image replaced"), true);
  assert.deepEqual(p.said, ["On lex/site (main): Image replaced"], "another site's main is shown: its own is named");
});

// Another page of the same site opened while work begun on its page runs: Lex is not pulled back.
test("work begun on its page, with another page of the site opened, writes that page without opening it", async () => {
  const p = pinned({ beganOnPage: true });
  p.openOther();
  assert.equal(p.ports.openFile(), "index.html", "its own page");
  await p.ports.restoreFile("index.html", 1);
  assert.deepEqual(p.restored, [], "the page shown stays");
  await p.ports.measureImage!("index.html", [0], {});
  assert.deepEqual(p.measured, ["away"], "the page shown is another: measured in a background page");
  assert.equal(await p.ports.change("index.html", "<img src=a.png>", [{ start: 9, end: 14, text: "b.png" }], [0], "Image replaced"), true);
  assert.deepEqual(p.changes, []);
  assert.deepEqual(p.batches.map(batch => [batch.pinned, batch.opened]), [[true, "index.html"]], "its Undo step belongs to its own page");
  assert.deepEqual(p.said, ["On index.html: Image replaced"]);
  assert.deepEqual(p.away, [], "a page of the site shown needs no note");
});

test("a background page that never opens refuses its work at the deadline, frees its room, and is closed if it opens later", async () => {
  const pages = createBackgroundPages<{ close(): void }>(1, 20);
  const late = deferred<{ close(): void }>();
  let closed = 0, ran = false;
  await assert.rejects(pages.use("stuck", () => late.promise, () => { ran = true; }), /did not open in time/);
  assert.equal(ran, false);
  assert.deepEqual(pages.open(), [], "its room is free again");
  assert.equal(await pages.use("next", () => ({ close: () => {} }), () => "ran"), "ran");
  late.resolve({ close: () => { closed++; } });
  await tick();
  assert.equal(closed, 1, "opened too late: closed at once");
});

test("a background page that fails to open refuses its work and frees its room", async () => {
  const pages = createBackgroundPages<{ close(): void }>(1);
  await assert.rejects(pages.use("broken", () => { throw new Error("no texts"); }, () => "ran"), /no texts/);
  assert.deepEqual(pages.open(), []);
});

// The hidden frame (openBackgroundFrame): a fake preview and host.
function frameFixture(answers: (() => unknown)[], options: { failOnUpdate?: boolean } = {}) {
  const calls: string[] = [], reads: string[] = [], styles: (Record<string, string> | undefined)[] = [];
  const host = { className: "", style: { cssText: "" }, inert: false, attributes: new Map<string, string>(),
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }, remove() { calls.push("host removed"); } };
  // eslint-disable-next-line no-restricted-syntax -- the frame reads only its owner document and append.
  const parent = { ownerDocument: { createElement: () => host }, append: () => { calls.push("host appended"); } } as unknown as HTMLElement;
  // eslint-disable-next-line no-restricted-syntax -- the frame calls only these members of the preview.
  const preview = {
    activate: () => { calls.push("activate"); },
    update: (input: { sources: Record<string, string>; route?: string; componentStyles?: Record<string, string> }) => {
      if (options.failOnUpdate) throw new Error("The frame could not draw.");
      calls.push(`update ${input.route} ${Object.keys(input.sources).sort().join(",")}`);
      styles.push(input.componentStyles);
    },
    measureImage: async () => { const answer = answers.length > 1 ? answers.shift()! : answers[0]; return answer(); },
    destroy: () => { calls.push("destroy"); },
  } as unknown as NativePreview;
  const site = { routes: { "/about/": "about/index.html" }, components: { "site-card": "components/site-card.html" } } satisfies NativeSite;
  const texts: Record<string, string> = { "about/index.html": '<link rel="stylesheet" href="/style.css"><site-card></site-card>', "components/site-card.html": "<p>card</p>",
    "components/site-card.css": ".card{}", "style.css": "p{}" };
  // As nativeShownFiles: the page, then its template, its stylesheet and the template's own stylesheet.
  const shown = (source: (path: string) => string | undefined) => {
    const files = ["about/index.html"], componentCss = new Map<string, string>();
    if (source("about/index.html") !== undefined) { files.push("components/site-card.html", "style.css", "components/site-card.css"); componentCss.set("site-card", "components/site-card.css"); }
    return { files, componentCss };
  };
  return { calls, reads, styles, host, open: () => openBackgroundFrame({ site, page: "about/index.html", files: () => new Set(Object.keys(texts)),
    text: async path => { reads.push(path); return texts[path]; }, shown }, () => preview, parent) };
}

test("a background frame reads its page's texts a level at a time, draws it hidden and inert, and closes", async () => {
  const f = frameFixture([() => ({ width: 10 })]);
  const frame = await f.open();
  assert.deepEqual(f.reads, ["about/index.html", "components/site-card.html", "style.css", "components/site-card.css"], "the page, then what it shows");
  assert.equal(f.host.inert, true);
  assert.equal(f.host.attributes.get("aria-hidden"), "true");
  assert.match(f.host.style.cssText, /visibility:hidden/);
  assert.deepEqual(f.calls, ["host appended", "activate", "update /about/ about/index.html,components/site-card.css,components/site-card.html,style.css"]);
  assert.deepEqual(f.styles, [{ "site-card": "components/site-card.css" }], "a component's own stylesheet, as the editor draws it");
  assert.deepEqual(await frame.measure({ path: "about/index.html", node: [0] }), { width: 10 });
  frame.close();
  assert.deepEqual(f.calls.slice(-2), ["destroy", "host removed"]);
});

test("a background frame asks again while its page is not drawn yet, and gives up after 50 tries", async () => {
  const notYet = () => { throw new Error("The preview is not showing a page yet. Try again in a moment."); };
  const ready = frameFixture([notYet, notYet, () => ({ width: 5 })]);
  assert.deepEqual(await (await ready.open()).measure({ path: "about/index.html", node: [0] }), { width: 5 });
  const never = frameFixture([notYet]);
  await assert.rejects((await never.open()).measure({ path: "about/index.html", node: [0] }), /not showing a page yet/);
  const other = frameFixture([() => { throw new Error("Invalid image measurement."); }]);
  await assert.rejects((await other.open()).measure({ path: "about/index.html", node: [0] }), /Invalid image/, "other errors at once");
});

test("a background frame that fails as it opens leaves nothing in the document", async () => {
  const f = frameFixture([() => ({})], { failOnUpdate: true });
  await assert.rejects(f.open(), /could not draw/);
  assert.deepEqual(f.calls, ["host appended", "activate", "destroy", "host removed"]);
});

test("work asking for room right as a page closes waits behind the work already waiting", async () => {
  const r = registry(1);
  const held = deferred<void>(), order: string[] = [];
  const first = r.use("first", async () => { await held.promise; });
  const waiter = r.use("waiter", () => { order.push("waiter"); });
  await tick();
  held.resolve(); await first;
  // Asked synchronously after the room was freed, before the waiter resumed.
  const late = r.use("late", () => { order.push("late"); });
  await Promise.all([waiter, late]);
  assert.deepEqual(order, ["waiter", "late"]);
});

test("a background page shared by work holding another pin of it is drawn from the measuring work's own texts", async () => {
  const f = frameFixture([() => ({ width: 1 })]);
  const frame = await f.open();
  const other = { site: { routes: { "/about/": "about/index.html" }, components: {} } satisfies NativeSite, page: "about/index.html", files: () => new Set(["about/index.html"]),
    text: async () => "<p>the other pin's page</p>", shown: () => ({ files: ["about/index.html"], componentCss: new Map<string, string>() }) };
  await frame.measure({ path: "about/index.html", node: [0] }, other);
  assert.equal(f.calls.at(-1), "update undefined about/index.html", "drawn again from the second work's texts");
  assert.deepEqual(f.styles.at(-1), {});
});

