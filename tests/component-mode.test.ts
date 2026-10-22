// Edit component mode (src/page-builder/component-mode.ts) through its interface, on the
// memory workspace (tests/fakes/memory-workspace.ts) with the real guarded edit's stamps and
// `peek`, and recorders for the history shares and the frame. Every case counts the live shares.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { EditComponentFrameMode } from "../src/components/native-preview";
import { createGuardedEdits, type Stamp } from "../src/guarded-edit";
import { backChain, createComponentMode, drillChain, ENTER_DEADLINE, EnterTimeout, type ComponentMode, type ComponentModePorts, type Level, type Renamed } from "../src/page-builder/component-mode";
import { readSource } from "../src/page-builder/source-tree";
import { createMemoryWorkspace, deferred, type MemoryWorkspace } from "./fakes/memory-workspace";

const PAGE = "<!doctype html><html><body><main><site-card>One</site-card><site-card>Two</site-card></main></body></html>";
const ABOUT = "<!doctype html><html><body><main><site-card>About</site-card></main></body></html>";
const CARD = "<article class=\"card\"><site-badge></site-badge><slot></slot></article>";
const BADGE = "<span class=\"badge\"><site-pill></site-pill><slot></slot></span>";
const PILL = "<em><slot></slot></em>";
const CARD_PATH = "components/site-card.html", BADGE_PATH = "components/site-badge.html", PILL_PATH = "components/site-pill.html";
const TILE_PATH = "components/site-tile.html";
const SITE = { routes: { "/": "index.html", "/about/": "about.html" }, components: { "site-card": CARD_PATH, "site-badge": BADGE_PATH, "site-pill": PILL_PATH } };

const flush = () => new Promise<void>((done) => setImmediate(done));

function setup() {
  let mode!: ComponentMode;
  let inEntry = false, reads = 0, refuse = false, typing = false;
  const hooks: { onOpen?: (path: string) => void } = {};
  const m = createMemoryWorkspace({
    branch: { "index.html": PAGE, "about.html": ABOUT, [CARD_PATH]: CARD, [BADGE_PATH]: BADGE, [PILL_PATH]: PILL },
    open: "index.html", site: SITE,
    // The stamps' entry is the module's; it must read no stamp (a stamp's check calls it).
    editModeEntry: () => { inEntry = true; try { return mode.entry(); } finally { inEntry = false; } },
    onOpen: (path) => hooks.onOpen?.(path),
  });
  const guarded = createGuardedEdits(m.workspace);
  const watched = (stamp: Stamp): Stamp => {
    const check = () => assert.ok(!inEntry, "entry() read a stamp");
    return { holds: () => { check(); return stamp.holds(); }, changed: () => { check(); return stamp.changed(); } };
  };
  const shares: { path: string; page: string; live: boolean }[] = [];
  const frames: (EditComponentFrameMode | undefined)[] = [];
  const counts = { changed: 0 };
  const ports = {
    edits: { peek: guarded.peek, stamp: (over?: "repository") => watched(guarded.stamp(over)) },
    shown: () => { const route = m.workspace.route(); return { open: m.openFile(), page: route === undefined ? undefined : m.workspace.site()?.routes[route] }; },
    open: async (path: string) => {
      if (refuse) { await Promise.resolve(); return false; }
      await m.workspace.open(path);
      return m.openFile() === path;
    },
    share: (path: string, page: string) => {
      const share = { path, page, live: true };
      shares.push(share);
      return () => { assert.ok(share.live, `the share of ${path} was released twice`); share.live = false; };
    },
    frame: (mode: EditComponentFrameMode | undefined) => { frames.push(mode); },
    changed: () => { counts.changed++; },
    read: (source: string) => { reads++; return readSource(source, { page: true }); },
    typing: () => typing,
  } satisfies ComponentModePorts;
  mode = createComponentMode(ports);
  return {
    m, mode, guarded, frames, counts, hooks,
    /** The shares not yet released, as `template>page`. */
    live: () => shares.filter((share) => share.live).map((share) => `${share.path}>${share.page}`),
    reads: () => reads,
    refuseOpens: () => { refuse = true; },
    /** A template part is typed (Structure) or no longer. */
    type: (on: boolean) => { typing = on; },
  };
}
type Setup = ReturnType<typeof setup>;

const card = (s: Setup, node: readonly number[] = [0, 0], extra: { notes?: readonly string[]; ready?: Promise<unknown> } = {}, mounted?: () => void) =>
  s.mode.enter({ tag: "site-card", template: CARD_PATH, instance: { path: "index.html", node }, ...extra }, { mounted });
const badgeStep: Level = { tag: "site-badge", template: BADGE_PATH, node: [0, 0] };
const pillStep: Level = { tag: "site-pill", template: PILL_PATH, node: [0, 0] };

/** The rename step as the guarded edit writes it: the template moves, the map and the page's instances follow, the new path opens. */
async function renameCard(m: MemoryWorkspace): Promise<Renamed> {
  m.writeDraft(TILE_PATH, CARD);
  m.deleteFile(CARD_PATH);
  m.writeDraft("index.html", PAGE.replaceAll("site-card", "site-tile"));
  m.setSite({ ...SITE, components: { "site-tile": TILE_PATH, "site-badge": BADGE_PATH, "site-pill": PILL_PATH } });
  await m.workspace.open(TILE_PATH);
  return { tag: "site-tile", template: TILE_PATH, notes: ["Renamed on 1 page."] };
}
/** Its Undo: everything back, the old path open. `site`: the map as Undo leaves it. */
async function undoRename(m: MemoryWorkspace, site = SITE) {
  m.writeDraft(CARD_PATH, CARD);
  m.deleteFile(TILE_PATH);
  m.writeDraft("index.html", PAGE);
  m.setSite(site);
  await m.workspace.open(CARD_PATH);
}

// ---- The chain (moved from edit-component-chain.test.ts) ----

const section = { tag: "section-work", template: "section.html", node: [0, 2] };
const cardLevel = { tag: "card-project", template: "card.html", node: [0, 1, 0, 0] };
const note = { tag: "card-note", template: "note.html", node: [0, 2] };

test("drill keeps the page instance and records each nested template instance", () => {
  const chain = drillChain(drillChain([section], cardLevel), note);
  assert.deepEqual(chain, [section, cardLevel, note]);
  assert.deepEqual(backChain(chain, 0), [section]);
  assert.deepEqual(backChain(chain, 1), [section, cardLevel]);
  assert.deepEqual(chain, [section, cardLevel, note]);
});

test("re-drilling a tag returns to its original level, never adds recursion", () => {
  const chain = [section, cardLevel, note];
  assert.deepEqual(drillChain(chain, { ...cardLevel, node: [9] }), [section, cardLevel]);
  assert.deepEqual(drillChain(chain, section), [section]);
  assert.deepEqual(drillChain(chain, note), chain);
  assert.deepEqual(backChain(chain, -1), chain);
  assert.deepEqual(backChain(chain, 10), chain);
});

// ---- Enter ----

test("enter with an instance frames it: one frame message, one live share, an entry object", async () => {
  const s = setup(), ready = deferred();
  let mounted = 0;
  const pending = card(s, [0, 0], { notes: ["Carried over: 2 classes."], ready: ready.promise }, () => { mounted++; });
  await flush();
  // Mounted before the view loads: the opening answers, the mode is not on yet.
  assert.equal(mounted, 1);
  assert.equal(s.mode.opened(), CARD_PATH);
  assert.equal(s.mode.now(), undefined);
  assert.deepEqual(s.live(), [`${CARD_PATH}>index.html`]);
  ready.resolve();
  assert.deepEqual(await pending, { status: "mode" });
  const now = s.mode.now()!;
  assert.equal(now.page, "index.html");
  assert.deepEqual(now.node, [0, 0]);
  assert.deepEqual(now.chain, [{ tag: "site-card", template: CARD_PATH, node: [0, 0] }]);
  assert.equal(now.tag, "site-card");
  assert.equal(now.template, CARD_PATH);
  assert.deepEqual(now.notes, ["Carried over: 2 classes."]);
  assert.equal(typeof now.entry, "object");
  assert.equal(s.mode.entry(), now.entry);
  assert.deepEqual(s.frames, [{ path: "index.html", node: [0, 0], tag: "site-card", nested: [] }]);
  assert.equal(s.counts.changed, 1);
  assert.deepEqual(s.live(), [`${CARD_PATH}>index.html`]);
});

test("enter without an instance opens the code pane only: no mode, no share, no frame", async () => {
  const s = setup();
  let mounted = 0;
  assert.deepEqual(await s.mode.enter({ tag: "site-card", template: CARD_PATH }, { mounted: () => { mounted++; } }), { status: "opened" });
  assert.equal(mounted, 1);
  assert.equal(s.mode.opened(), CARD_PATH);
  assert.equal(s.mode.now(), undefined);
  assert.equal(s.mode.entry(), undefined);
  assert.deepEqual(s.live(), []);
  assert.deepEqual(s.frames, []);
});

test("a later enter during the first's open supersedes it: the first is stale and its share released at once", async () => {
  const s = setup(), hold = s.m.holdOpen();
  const first = card(s, [0, 0]);
  await hold.reached;
  assert.deepEqual(s.live(), [`${CARD_PATH}>index.html`]);
  const second = card(s, [0, 1]);
  assert.equal(s.live().length, 1, "the first entry's share went as the second took its own");
  hold.release();
  assert.deepEqual(await first, { status: "stale" });
  assert.deepEqual(await second, { status: "mode" });
  assert.deepEqual(s.mode.now()?.node, [0, 1]);
  assert.deepEqual(s.frames, [{ path: "index.html", node: [0, 1], tag: "site-card", nested: [] }]);
  assert.deepEqual(s.live(), [`${CARD_PATH}>index.html`]);
});

test("the template's bytes changed during the open: stale, no opening, nothing live", async () => {
  const s = setup(), hold = s.m.holdOpen();
  const pending = card(s);
  await hold.reached;
  s.m.writeDraft(CARD_PATH, "<article>agent</article>");
  hold.release();
  assert.deepEqual(await pending, { status: "stale" });
  assert.equal(s.mode.opened(), undefined);
  assert.equal(s.mode.now(), undefined);
  assert.deepEqual(s.live(), []);
  assert.deepEqual(s.frames, []);
});

test("the page's bytes changed during the open: stale, the code pane keeps the template, nothing live", async () => {
  const s = setup(), hold = s.m.holdOpen();
  const pending = card(s);
  await hold.reached;
  s.m.writeDraft("index.html", PAGE.replace("One", "Uno"));
  hold.release();
  assert.deepEqual(await pending, { status: "stale" });
  assert.equal(s.mode.opened(), CARD_PATH);
  assert.equal(s.mode.now(), undefined);
  assert.deepEqual(s.live(), []);
  assert.deepEqual(s.frames, []);
});

test("a mode already on gives way to a new entry: its shares go, the frame is told only the new mode", async () => {
  const s = setup();
  await card(s, [0, 0]);
  assert.equal(await s.mode.open({ step: badgeStep }), true);
  assert.equal(s.live().length, 2);
  assert.deepEqual(await card(s, [0, 1]), { status: "mode" });
  assert.deepEqual(s.live(), [`${CARD_PATH}>index.html`]);
  assert.ok(!s.frames.includes(undefined), "the frame never ends between the two modes");
  assert.deepEqual(s.frames.at(-1), { path: "index.html", node: [0, 1], tag: "site-card", nested: [] });
  assert.deepEqual(s.mode.now()?.chain.length, 1);
});

// ---- The settle matrix of enter (deadline from the call) ----

test("settle matrix: mounted, ready rejects: failed with the error, the opening stays, nothing live", async () => {
  const s = setup(), error = new Error("chunk failed");
  assert.deepEqual(await card(s, [0, 0], { ready: Promise.reject(error) }), { status: "failed", error });
  assert.equal(s.mode.opened(), CARD_PATH);
  assert.equal(s.mode.now(), undefined);
  assert.deepEqual(s.live(), []);
  assert.deepEqual(s.frames, []);
});

for (const late of [true, false]) {
  test(`settle matrix: mounted, ready ${late ? "settles late" : "never settles"}: failed at the deadline, nothing late starts`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const s = setup(), ready = deferred(), mounted = deferred();
    const pending = card(s, [0, 0], { ready: ready.promise }, () => mounted.resolve());
    await mounted.promise;
    t.mock.timers.tick(ENTER_DEADLINE);
    const outcome = await pending;
    assert.equal(outcome.status, "failed");
    assert.ok("error" in outcome && outcome.error instanceof EnterTimeout);
    assert.deepEqual(s.live(), []);
    if (late) ready.resolve();
    await flush();
    assert.equal(s.mode.now(), undefined);
    assert.equal(s.mode.opened(), CARD_PATH, "the code pane keeps the template");
    assert.deepEqual(s.frames, []);
    assert.equal(s.counts.changed, 0);
  });
}

test("settle matrix: mounts after the deadline: failed at it; the late mount writes nothing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const s = setup(), hold = s.m.holdOpen();
  let mounted = 0;
  const pending = card(s, [0, 0], {}, () => { mounted++; });
  await hold.reached;
  t.mock.timers.tick(ENTER_DEADLINE);
  const outcome = await pending;
  assert.ok(outcome.status === "failed" && outcome.error instanceof EnterTimeout);
  assert.deepEqual(s.live(), []);
  assert.equal(s.mode.opened(), undefined);
  hold.release();
  await flush();
  // The code pane shows the template (the host mounted it), but this entry gave up: no opening, no `mounted`.
  assert.equal(s.m.openFile(), CARD_PATH);
  assert.equal(mounted, 0);
  assert.equal(s.mode.opened(), undefined);
  assert.equal(s.mode.entry(), undefined);
  assert.equal(s.mode.now(), undefined);
  assert.deepEqual(s.frames, []);
  assert.equal(s.counts.changed, 0);
  assert.deepEqual(s.live(), []);
});

test("settle matrix: a late mount after a later entry sets nothing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const s = setup(), hold = s.m.holdOpen();
  let mounted = 0;
  const pending = card(s, [0, 0], {}, () => { mounted++; });
  await hold.reached;
  t.mock.timers.tick(ENTER_DEADLINE);
  assert.equal((await pending).status, "failed");
  assert.deepEqual(await s.mode.enter({ tag: "site-badge", template: BADGE_PATH }), { status: "opened" });
  hold.release();
  await flush();
  assert.equal(mounted, 0);
  assert.equal(s.mode.opened(), undefined, "the card opened late, over the badge's opening");
  assert.deepEqual(s.live(), []);
});

test("settle matrix: the open refused: stale, nothing live", async () => {
  const s = setup();
  s.refuseOpens();
  assert.deepEqual(await card(s), { status: "stale" });
  assert.equal(s.mode.opened(), undefined);
  assert.deepEqual(s.live(), []);
});

test("settle matrix: the open never mounts: failed at the deadline, nothing live", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const s = setup(), hold = s.m.holdOpen();
  const pending = card(s);
  await hold.reached;
  t.mock.timers.tick(ENTER_DEADLINE);
  const outcome = await pending;
  assert.ok(outcome.status === "failed" && outcome.error instanceof EnterTimeout);
  assert.deepEqual(s.live(), []);
  assert.deepEqual(s.frames, []);
});

test("settle matrix: destroy during the open: stale, nothing late written", async () => {
  const s = setup(), hold = s.m.holdOpen();
  let mounted = 0;
  const pending = card(s, [0, 0], {}, () => { mounted++; });
  await hold.reached;
  s.mode.destroy();
  assert.deepEqual(await pending, { status: "stale" });
  assert.deepEqual(s.live(), []);
  hold.release();
  await flush();
  assert.equal(mounted, 0);
  assert.equal(s.mode.opened(), undefined);
  assert.deepEqual(s.frames, []);
  assert.equal(s.counts.changed, 0);
});

test("settle matrix: destroy during the ready wait: stale, nothing late written", async () => {
  const s = setup(), ready = deferred(), mounted = deferred();
  const pending = card(s, [0, 0], { ready: ready.promise }, () => mounted.resolve());
  await mounted.promise;
  s.mode.destroy();
  assert.deepEqual(await pending, { status: "stale" });
  ready.resolve();
  await flush();
  assert.equal(s.mode.now(), undefined);
  assert.equal(s.mode.opened(), undefined);
  assert.deepEqual(s.live(), []);
  assert.deepEqual(s.frames, []);
  assert.equal(s.counts.changed, 0);
  assert.deepEqual(await card(s), { status: "stale" }, "nothing enters after destroy");
});

test("settle matrix: a later enter during the ready wait: the first is stale, only the second frames", async () => {
  const s = setup(), ready = deferred(), mounted = deferred();
  const first = card(s, [0, 0], { ready: ready.promise }, () => mounted.resolve());
  await mounted.promise;
  assert.deepEqual(await card(s, [0, 1]), { status: "mode" });
  ready.resolve();
  assert.deepEqual(await first, { status: "stale" });
  assert.deepEqual(s.frames, [{ path: "index.html", node: [0, 1], tag: "site-card", nested: [] }]);
  assert.deepEqual(s.live(), [`${CARD_PATH}>index.html`]);
});

// ---- Nested levels ----

test("open a nested level and back: the chain, a share per level, a new entry each, older stamps stale (edit-mode)", async () => {
  const s = setup();
  await card(s);
  const first = s.mode.entry()!, before = s.guarded.stamp();
  assert.equal(await s.mode.open({ step: badgeStep }), true);
  assert.deepEqual(s.mode.now()?.chain.map((level) => level.tag), ["site-card", "site-badge"]);
  assert.equal(s.mode.now()?.template, BADGE_PATH);
  assert.equal(s.mode.opened(), BADGE_PATH);
  assert.notEqual(s.mode.entry(), first);
  assert.equal(before.changed(), "edit-mode");
  assert.deepEqual(s.live(), [`${CARD_PATH}>index.html`, `${BADGE_PATH}>index.html`]);
  assert.deepEqual(s.frames.at(-1), { path: "index.html", node: [0, 0], tag: "site-card", nested: [{ tag: "site-badge", node: [0, 0] }] });
  // A plan whose stamp was taken before the level opened is stale on the mode's entry.
  const atBadge = s.guarded.stamp();
  assert.equal(await s.mode.open({ step: pillStep }), true);
  assert.equal(s.live().length, 3);
  const outcome = await s.guarded.run(() => ({ stayed: "Nothing to do." }), { since: atBadge });
  assert.deepEqual(outcome, { ok: false, reason: "stale", changed: "edit-mode", message: "The page changed meanwhile. Try again." });
  assert.equal(await s.mode.open({ back: 0 }), true);
  assert.deepEqual(s.mode.now()?.chain.map((level) => level.tag), ["site-card"]);
  assert.equal(s.m.openFile(), CARD_PATH);
  assert.deepEqual(s.live(), [`${CARD_PATH}>index.html`]);
  assert.deepEqual(s.frames.at(-1)?.nested, []);
  // A tag already in the chain goes back to it.
  await s.mode.open({ step: badgeStep });
  await s.mode.open({ step: pillStep });
  assert.equal(await s.mode.open({ step: { ...badgeStep, node: [9] } }), true);
  assert.deepEqual(s.mode.now()?.chain.map((level) => level.tag), ["site-card", "site-badge"]);
  assert.equal(s.live().length, 2);
  assert.equal(await s.mode.open({ back: 5 }), false, "no such level");
});

test("open is refused while another transition is in flight", async () => {
  const s = setup();
  await card(s);
  const hold = s.m.holdOpen();
  const pending = s.mode.open({ step: badgeStep });
  await hold.reached;
  assert.equal(await s.mode.open({ back: 0 }), false);
  let ran = false;
  assert.equal(await s.mode.rename(async () => { ran = true; return undefined; }), undefined);
  assert.equal(ran, false);
  hold.release();
  assert.equal(await pending, true);
  assert.equal(s.live().length, 2);
});

test("open is refused when a level's template changed meanwhile: its share goes, and the mode with its template", async () => {
  const s = setup();
  await card(s);
  const hold = s.m.holdOpen();
  const pending = s.mode.open({ step: badgeStep });
  await hold.reached;
  assert.equal(s.live().length, 2);
  s.m.writeDraft(CARD_PATH, "<article>agent</article>");
  hold.release();
  assert.equal(await pending, false);
  // The badge is the file open now: the mode is off, and the settle leaves it.
  assert.equal(s.mode.now(), undefined);
  assert.deepEqual(s.live(), []);
  assert.equal(s.frames.at(-1), undefined);
});

test("open refuses a step whose template is not the component map's", async () => {
  const s = setup();
  await card(s);
  assert.equal(await s.mode.open({ step: { ...badgeStep, template: "components/elsewhere.html" } }), false);
  assert.equal(s.live().length, 1);
});

test("sync during open's and enter's file switch changes nothing", async () => {
  const s = setup();
  let syncs = 0;
  s.hooks.onOpen = () => { syncs++; s.mode.sync(); };
  await card(s);
  assert.equal(await s.mode.open({ step: badgeStep }), true);
  assert.deepEqual(s.mode.now()?.chain.length, 2);
  // A new entry over the mode, on another instance: the old one is not left on the way.
  assert.deepEqual(await card(s, [0, 1]), { status: "mode" });
  assert.equal(syncs, 3);
  assert.ok(!s.frames.includes(undefined));
  assert.deepEqual(s.live(), [`${CARD_PATH}>index.html`]);
});

// ---- Rename ----

test("rename: sync during the run changes nothing; after it the mode follows, with notes and one more share", async () => {
  const s = setup();
  await card(s);
  const first = s.mode.entry();
  let during: unknown = "unset";
  s.hooks.onOpen = () => { s.mode.sync(); during = s.frames.length; };
  const result = await s.mode.rename(() => renameCard(s.m));
  assert.equal(result?.template, TILE_PATH);
  assert.equal(during, 1, "nothing framed or left while the template moved");
  const now = s.mode.now()!;
  assert.equal(now.tag, "site-tile");
  assert.equal(now.template, TILE_PATH);
  assert.deepEqual(now.chain, [{ tag: "site-tile", template: TILE_PATH, node: [0, 0] }]);
  assert.deepEqual(now.notes, ["Renamed on 1 page."]);
  assert.notEqual(now.entry, first);
  assert.deepEqual(s.frames.at(-1), { path: "index.html", node: [0, 0], tag: "site-tile", nested: [] });
  assert.deepEqual(s.live(), [`${CARD_PATH}>index.html`, `${TILE_PATH}>index.html`]);
});

test("rename's Undo and Redo: sync follows back without notes and forward with them; stamps across a follow are stale", async () => {
  const s = setup();
  await card(s);
  await s.mode.rename(() => renameCard(s.m));
  const before = s.guarded.stamp();
  await undoRename(s.m);
  // Off until the host syncs (the file open is the other path).
  assert.equal(s.mode.now(), undefined);
  s.mode.sync();
  assert.equal(s.mode.now()?.template, CARD_PATH);
  assert.equal(s.mode.now()?.tag, "site-card");
  assert.deepEqual(s.mode.now()?.notes, []);
  assert.equal(before.changed(), "edit-mode");
  assert.equal(s.live().length, 2);
  // Redo.
  await renameCard(s.m);
  s.mode.sync();
  assert.equal(s.mode.now()?.template, TILE_PATH);
  assert.deepEqual(s.mode.now()?.notes, ["Renamed on 1 page."]);
  assert.equal(s.live().length, 2);
  s.mode.sync();
  assert.equal(s.live().length, 2, "sync is idempotent");
});

test("a rename pair whose tag no longer maps to the path is not followed: the mode leaves", async () => {
  const s = setup();
  await card(s);
  await s.mode.rename(() => renameCard(s.m));
  await undoRename(s.m, { ...SITE, components: { "site-tile": CARD_PATH, "site-badge": BADGE_PATH, "site-pill": PILL_PATH } });
  s.mode.sync();
  assert.equal(s.mode.now(), undefined);
  assert.deepEqual(s.live(), []);
  assert.equal(s.frames.at(-1), undefined);
});

test("a rename that wrote nothing changes nothing", async () => {
  const s = setup();
  await card(s);
  const now = s.mode.now();
  assert.equal(await s.mode.rename(async () => undefined), undefined);
  assert.equal(s.mode.now(), now);
  assert.equal(s.live().length, 1);
});

// ---- When the mode ends ----

const leaving: [string, (s: Setup) => void | Promise<void>][] = [
  ["another file opens", async (s) => { await s.m.workspace.open("about.html"); }],
  ["the page shown changes (M1)", (s) => { s.m.setRoute("/about/"); }],
  ["the branch changes", (s) => { s.m.setScope("lex/site@other"); }],
  ["version view starts", (s) => { s.m.setVersionView(true); }],
  ["the instance leaves its place (M3)", (s) => { s.m.writeDraft("index.html", PAGE.replace("<main>", "<main><p>New</p>")); }],
];
for (const [what, change] of leaving) {
  test(`the mode ends when ${what}: now() off at once, sync leaves and releases every share`, async () => {
    const s = setup();
    await card(s);
    await s.mode.open({ step: badgeStep });
    const changed = s.counts.changed, frames = s.frames.length;
    await change(s);
    assert.equal(s.mode.now(), undefined);
    assert.equal(s.frames.length, frames, "now() frames nothing");
    assert.equal(s.live().length, 2, "nothing released before sync");
    s.mode.sync();
    assert.deepEqual(s.live(), []);
    assert.equal(s.frames.at(-1), undefined);
    assert.equal(s.counts.changed, changed + 1);
    s.mode.sync();
    assert.equal(s.counts.changed, changed + 1, "sync is idempotent");
  });
}

test("while a template part is typed, the instance leaving its place keeps the mode on; sync after the typing leaves", async () => {
  const s = setup();
  await card(s);
  const now = s.mode.now()!, changed = s.counts.changed;
  s.type(true);
  s.m.writeDraft("index.html", PAGE.replace("<main>", "<main><p>New</p>"));
  assert.equal(s.mode.now(), now);
  s.mode.sync();
  assert.equal(s.mode.now(), now);
  assert.equal(s.counts.changed, changed);
  assert.deepEqual(s.live(), [`${CARD_PATH}>index.html`]);
  // The frame shows the instance where it went (the first of the page's two cards), once.
  assert.deepEqual(s.frames.at(-1), { path: "index.html", node: [0, 1], tag: "site-card", nested: [] });
  const told = s.frames.length;
  s.mode.sync();
  assert.equal(s.frames.length, told);
  s.type(false);
  assert.equal(s.mode.now(), undefined);
  s.mode.sync();
  assert.deepEqual(s.live(), []);
  assert.equal(s.frames.at(-1), undefined);
  assert.equal(s.counts.changed, changed + 1);
});

test("while typing holds the mode, a page with another count of its tag shows no instance in the frame; back in place, it shows again", async () => {
  const s = setup();
  await card(s, [0, 1]);
  s.type(true);
  // Two paragraphs and a third card above: which card was edited is not known, so the frame shows none.
  s.m.writeDraft("index.html", PAGE.replace("<main>", "<main><p>A</p><p>B</p><site-card>New</site-card>"));
  s.mode.sync();
  assert.ok(s.mode.now());
  assert.equal(s.frames.at(-1), undefined);
  // The card goes again: the instance is back at its node.
  s.m.writeDraft("index.html", PAGE);
  s.mode.sync();
  assert.deepEqual(s.frames.at(-1), { path: "index.html", node: [0, 1], tag: "site-card", nested: [] });
  s.type(false);
  s.mode.sync();
  assert.ok(s.mode.now());
});

test("typing keeps the mode only through its instance moving: another file opening still ends it", async () => {
  const s = setup();
  await card(s);
  s.type(true);
  await s.m.workspace.open("about.html");
  assert.equal(s.mode.now(), undefined);
  s.mode.sync();
  assert.deepEqual(s.live(), []);
});

test("leave (Done): every share released, the frame told, the instance it was on", async () => {
  const s = setup();
  await card(s);
  await s.mode.open({ step: badgeStep });
  await s.mode.open({ step: pillStep });
  assert.deepEqual(s.mode.leave(), { page: "index.html", node: [0, 0], tag: "site-card", template: CARD_PATH });
  assert.deepEqual(s.live(), []);
  assert.equal(s.frames.at(-1), undefined);
  assert.equal(s.mode.now(), undefined);
  assert.equal(s.mode.entry(), undefined);
  assert.equal(s.mode.leave(), undefined);
});

test("leave (Done) during an entry's load ends it too: it is stale, nothing frames later", async () => {
  const s = setup();
  await card(s, [0, 0]);
  const ready = deferred(), mounted = deferred();
  const pending = card(s, [0, 1], { ready: ready.promise }, () => mounted.resolve());
  await mounted.promise;
  s.mode.leave();
  assert.deepEqual(s.live(), []);
  ready.resolve();
  assert.deepEqual(await pending, { status: "stale" });
  assert.equal(s.mode.now(), undefined);
  assert.equal(s.frames.at(-1), undefined);
  assert.deepEqual(s.live(), []);
});

test("leave (Done) during a level's open releases its share at once", async () => {
  const s = setup();
  await card(s);
  const hold = s.m.holdOpen();
  const pending = s.mode.open({ step: badgeStep });
  await hold.reached;
  s.mode.leave();
  assert.deepEqual(s.live(), []);
  hold.release();
  assert.equal(await pending, false);
  assert.deepEqual(s.live(), []);
  assert.equal(s.frames.at(-1), undefined);
});

test("a rename's Undo is not followed onto a page that left the preview: no frame for it, the mode leaves", async () => {
  const s = setup();
  await card(s);
  await s.mode.rename(() => renameCard(s.m));
  await undoRename(s.m);
  s.m.setRoute("/about/");
  const frames = s.frames.length;
  s.mode.sync();
  assert.deepEqual(s.frames.slice(frames), [undefined]);
  assert.deepEqual(s.live(), []);
});

test("an entry of a missing template still supersedes the one loading", async () => {
  const s = setup(), ready = deferred(), mounted = deferred();
  const first = card(s, [0, 0], { ready: ready.promise }, () => mounted.resolve());
  await mounted.promise;
  assert.deepEqual(await s.mode.enter({ tag: "site-gone", template: "components/site-gone.html", instance: { path: "index.html", node: [0, 0] } }), { status: "stale" });
  ready.resolve();
  assert.deepEqual(await first, { status: "stale" });
  assert.deepEqual(s.frames, []);
  assert.deepEqual(s.live(), []);
});

test("settle matrix: the open rejecting: failed with its error, nothing live", async () => {
  const s = setup(), error = new Error("editor failed");
  s.m.workspace.open = () => Promise.reject(error);
  assert.deepEqual(await card(s), { status: "failed", error });
  assert.deepEqual(s.live(), []);
  assert.equal(s.mode.opened(), undefined);
});

test("destroy during a level's open releases its share at once", async () => {
  const s = setup();
  await card(s);
  const hold = s.m.holdOpen();
  const pending = s.mode.open({ step: badgeStep });
  await hold.reached;
  assert.equal(s.live().length, 2);
  s.mode.destroy();
  assert.deepEqual(s.live(), []);
  hold.release();
  assert.equal(await pending, false);
  assert.deepEqual(s.live(), []);
});

test("notes dismissed during a level's open or a rename: the transition still lands, the notes stay dismissed", async () => {
  const s = setup();
  await card(s, [0, 0], { notes: ["Carried over: 2 classes."] });
  const hold = s.m.holdOpen();
  const pending = s.mode.open({ step: badgeStep });
  await hold.reached;
  s.mode.dismissNotes();
  hold.release();
  assert.equal(await pending, true);
  assert.deepEqual(s.mode.now()?.notes, []);
  assert.equal(s.live().length, 2);
  const r = setup();
  await card(r, [0, 0], { notes: ["Carried over: 2 classes."] });
  const wait = deferred();
  const renamed = r.mode.rename(async () => { await wait.promise; return renameCard(r.m); });
  r.mode.dismissNotes();
  assert.deepEqual(r.mode.now()?.notes, []);
  wait.resolve();
  await renamed;
  assert.equal(r.mode.now()?.template, TILE_PATH);
  assert.deepEqual(r.mode.now()?.notes, ["Renamed on 1 page."]);
  assert.equal(r.live().length, 2, "the mode's and the rename's");
});

test("a rename whose page left the preview meanwhile is not followed: no renamed frame, the mode leaves", async () => {
  const s = setup();
  await card(s);
  const frames = s.frames.length;
  await s.mode.rename(async () => { const result = await renameCard(s.m); s.m.setRoute("/about/"); return result; });
  assert.equal(s.mode.now(), undefined);
  assert.deepEqual(s.frames.slice(frames), [undefined]);
  assert.deepEqual(s.live(), []);
});

// ---- Kept names, notes ----

test("keep and kept are per source and node, and cleared on leave", async () => {
  const s = setup();
  await card(s);
  s.mode.keep(CARD, [0], "title");
  assert.equal(s.mode.kept(CARD, [0]), "title");
  assert.equal(s.mode.kept(CARD, [1]), undefined);
  assert.equal(s.mode.kept(`${CARD} `, [0]), undefined);
  s.mode.leave();
  assert.equal(s.mode.kept(CARD, [0]), undefined);
  s.mode.keep(CARD, [0], "title");
  assert.equal(s.mode.kept(CARD, [0]), undefined, "nothing kept outside the mode");
});

test("kept names are the template's: another level with the same bytes does not take them", async () => {
  const s = setup();
  await card(s);
  // The badge and the pill templates read the same here; a name kept in one is not the other's.
  s.m.writeDraft(PILL_PATH, BADGE);
  assert.equal(await s.mode.open({ step: badgeStep }), true);
  s.mode.keep(BADGE, [0], "label");
  assert.equal(s.mode.kept(BADGE, [0]), "label");
  assert.equal(await s.mode.open({ step: { ...pillStep, node: [0, 0] } }), true);
  assert.equal(s.mode.now()?.template, PILL_PATH);
  assert.equal(s.mode.kept(BADGE, [0]), undefined);
  assert.equal(await s.mode.open({ back: 1 }), true);
  assert.equal(s.mode.kept(BADGE, [0]), "label");
});

test("a new entry over a mode keeps its rename pair, the pair's share and kept names until leave", async () => {
  const s = setup();
  await card(s);
  await s.mode.rename(() => renameCard(s.m));
  s.mode.keep(CARD, [0], "title");
  const entered = await s.mode.enter({ tag: "site-tile", template: TILE_PATH, instance: { path: "index.html", node: [0, 1] } });
  assert.deepEqual(entered, { status: "mode" });
  assert.deepEqual(s.live(), [`${TILE_PATH}>index.html`, `${TILE_PATH}>index.html`], "the rename's share and the new mode's");
  assert.equal(s.mode.kept(CARD, [0]), "title");
  // The pair still follows Undo.
  await undoRename(s.m);
  s.mode.sync();
  assert.equal(s.mode.now()?.template, CARD_PATH);
  s.mode.leave();
  assert.deepEqual(s.live(), []);
  assert.equal(s.mode.kept(CARD, [0]), undefined);
});

test("dismissNotes keeps the entry and survives sync, levels and a rename's Undo; Redo brings the rename's notes back", async () => {
  const s = setup();
  await card(s, [0, 0], { notes: ["Carried over: 2 classes."] });
  const entry = s.mode.entry(), changed = s.counts.changed;
  s.mode.dismissNotes();
  assert.deepEqual(s.mode.now()?.notes, []);
  assert.equal(s.mode.entry(), entry);
  assert.equal(s.counts.changed, changed + 1);
  s.mode.sync();
  assert.deepEqual(s.mode.now()?.notes, []);
  await s.mode.open({ step: badgeStep });
  await s.mode.open({ back: 0 });
  assert.deepEqual(s.mode.now()?.notes, []);
  await s.mode.rename(() => renameCard(s.m));
  assert.deepEqual(s.mode.now()?.notes, ["Renamed on 1 page."]);
  s.mode.dismissNotes();
  await undoRename(s.m);
  s.mode.sync();
  assert.deepEqual(s.mode.now()?.notes, []);
  await renameCard(s.m);
  s.mode.sync();
  assert.deepEqual(s.mode.now()?.notes, ["Renamed on 1 page."]);
});

// ---- destroy, purity, stamps ----

test("destroy releases everything and draws nothing", async () => {
  const s = setup();
  await card(s);
  await s.mode.open({ step: badgeStep });
  await s.mode.open({ back: 0 });
  await s.mode.rename(() => renameCard(s.m));
  assert.equal(s.live().length, 2);
  const changed = s.counts.changed;
  s.mode.destroy();
  assert.deepEqual(s.live(), []);
  assert.equal(s.frames.at(-1), undefined);
  assert.equal(s.counts.changed, changed);
  assert.equal(s.mode.now(), undefined);
  assert.equal(s.mode.opened(), undefined);
  assert.equal(s.mode.entry(), undefined);
  s.mode.destroy();
});

test("now() is pure: the same frozen object until a transition, no frame or change, the page read once per source", async () => {
  const s = setup();
  await card(s);
  const frames = s.frames.length, changed = s.counts.changed, reads = s.reads();
  const now = s.mode.now()!;
  for (let i = 0; i < 5; i++) assert.equal(s.mode.now(), now);
  assert.ok(Object.isFrozen(now) && Object.isFrozen(now.chain) && Object.isFrozen(now.chain[0]) && Object.isFrozen(now.node));
  assert.equal(s.frames.length, frames);
  assert.equal(s.counts.changed, changed);
  assert.ok(s.reads() - reads <= 1, "the page is parsed at most once per source");
  // Off reads frame nothing either.
  s.m.setRoute("/about/");
  for (let i = 0; i < 3; i++) assert.equal(s.mode.now(), undefined);
  assert.equal(s.frames.length, frames);
  assert.equal(s.counts.changed, changed);
  s.m.setRoute("/");
  assert.equal(s.mode.now(), now, "the same object when it reads on again");
});

test("entry() reads no stamp: a stamp's check inside now() terminates", async () => {
  const s = setup();
  await card(s);
  // The opening's stamp checks the workspace's entry, which is the module's entry().
  const stamp = s.guarded.stamp();
  assert.equal(stamp.holds(), true);
  assert.ok(s.mode.now());
  assert.ok(s.mode.opened());
  assert.equal(stamp.holds(), true);
});
