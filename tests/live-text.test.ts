// The open file's shared copy (ticket am-21, ADR 0003): tabs, each with its own
// draft store, sharing one file through a fake room that forwards frames as the
// relay does (tests/live-room.test.ts proves the real room), with real Yjs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { signal } from "@preact/signals-core";
import { createDraftStore } from "../src/draft-store";
import { draftKey, type DraftScope } from "../src/drafts";
import { LIVE_TEXT_CATCH_UP_MS, startLiveText } from "../src/live-text";
import type { LiveClock, LiveRoomOptions } from "../src/live-room";
import type { LiveAccess } from "../shared/live-room";

const scope: DraftScope = { account: "lex", repoId: 501, repo: "lex/starter", branch: "main" };
const path = "index.html";
const base = "<h1>Fresh bread</h1>\n<p>Open at seven.</p>\n";
const sha = "a".repeat(40);

async function until(check: () => boolean, what: string) {
  for (const started = Date.now(); !check(); await new Promise(resolve => setTimeout(resolve, 2)))
    if (Date.now() - started > 3_000) assert.fail(`timed out waiting: ${what}`);
}
const quiet = () => new Promise(resolve => setTimeout(resolve, 40));

/** One room for the file: frames go to everyone else in it, members hear joins and leaves, a joiner holds the key at once. */
function fakeRoom() {
  type Member = { id: string; options: LiveRoomOptions; access: LiveAccess; cut: boolean };
  const members = new Set<Member>();
  let next = 0;
  const others = (me: Member) => new Map([...members].filter(other => other !== me).map(other => [other.id, other.access]));
  const tell = (me: Member) => { for (const other of members) if (other !== me) other.options.onMembers?.(others(other)); };
  return {
    frames: 0,
    members,
    open(options: LiveRoomOptions, access: LiveAccess = "editor") {
      const me: Member = { id: String(++next), options, access, cut: false };
      const room = this;
      setImmediate(() => {
        members.add(me);
        options.onMembers?.(others(me));
        tell(me);
        options.onKey?.();
      });
      return {
        me,
        async send(bytes: Uint8Array) {
          if (!members.has(me) || me.cut) return false;
          room.frames++;
          const copy = Uint8Array.from(bytes);
          for (const other of members) if (other !== me && !other.cut) setImmediate(() => { if (members.has(other) && !other.cut) other.options.onMessage(copy); });
          return true;
        },
        close() { if (members.delete(me)) tell(me); },
      };
    },
  };
}

function tab(room: ReturnType<typeof fakeRoom>, text = base, options: { baseSha?: string; clock?: LiveClock } = {}) {
  const store = createDraftStore();
  store.open(scope, path, { text: base, baseSha: options.baseSha ?? sha });
  if (text !== base) store.edit({ scope, path, text, label: "Earlier draft" });
  const openFile = signal<string | undefined>(path);
  let yjsLoads = 0, socket: ReturnType<typeof room.open> | undefined;
  const stop = startLiveText({
    store, openFile, scope: () => scope, ...(options.clock ? { clock: options.clock } : {}),
    openRoom: roomOptions => (socket = room.open(roomOptions)),
    loadYjs: () => { yjsLoads++; return import("yjs"); },
  });
  return {
    store, openFile, stop,
    get yjsLoads() { return yjsLoads; },
    get socket() { return socket!; },
    get text() { return store.text(scope, path)!; },
    type(at: number, inserted: string, removed = 0) { assert.equal(store.edit({ scope, path, changes: [{ start: at, end: at + removed, text: inserted }] }).ok, true); },
  };
}

test("two tabs editing one file end identical, and a tab alone loads no Yjs and sends nothing", async () => {
  const room = fakeRoom();
  const anna = tab(room);
  await quiet();
  assert.equal(anna.yjsLoads, 0, "alone with the file: no Yjs");
  assert.equal(room.frames, 0, "and no frames");
  const lex = tab(room);
  await until(() => anna.yjsLoads === 1 && lex.yjsLoads === 1, "both loading Yjs once someone else is here");
  await quiet();
  anna.type(4, "Warm ");
  lex.type(base.indexOf("seven"), "half past ", 0);
  await until(() => anna.text === lex.text && anna.text.includes("Warm") && anna.text.includes("half past"), "both edits on both");
  assert.equal(anna.text, "<h1>Warm Fresh bread</h1>\n<p>Open at half past seven.</p>\n");
  // Someone else's change is not this tab's Undo step.
  lex.type(0, "<!-- Lex -->");
  assert.equal(lex.store.canUndo(draftHistory()), true, "Lex's own edit is his step");
  anna.type(0, "<!-- shared -->");
  await until(() => lex.text.startsWith("<!-- shared --><!-- Lex -->") || lex.text.startsWith("<!-- Lex --><!-- shared -->"), "Anna's next edit");
  assert.equal(lex.text, anna.text);
  assert.equal(lex.store.canUndo(draftHistory()), false, "a change from the shared copy clears the history over the file, as another tab's draft does");
  anna.stop(); lex.stop();
});
const draftHistory = () => draftKey(scope, path);

test("a late joiner catches up from a tab that is online", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  anna.type(4, "Warm ");
  lex.type(base.length, "<p>Closed Mondays.</p>\n");
  await until(() => anna.text === lex.text && anna.text.includes("Mondays") && anna.text.includes("Warm"), "both edits");
  const sam = tab(room);
  await until(() => sam.text === anna.text, "Sam catching up");
  assert.equal(sam.text, "<h1>Warm Fresh bread</h1>\n<p>Open at seven.</p>\n<p>Closed Mondays.</p>\n");
  sam.type(0, "<!-- hi -->");
  await until(() => anna.text === sam.text && lex.text === sam.text, "Sam's edit everywhere");
  anna.stop(); lex.stop(); sam.stop();
});

test("two tabs opening an empty room at once do not double the text, with GitHub's text or the same draft", async () => {
  for (const start of [base, `${base}<p>Same unsaved line.</p>\n`]) {
    const room = fakeRoom();
    const anna = tab(room, start), lex = tab(room, start);
    await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
    await quiet();
    assert.deepEqual([anna.text, lex.text], [start, start], "nothing doubled");
    lex.type(0, "x");
    await until(() => anna.text === `x${start}`, "an edit after");
    anna.stop(); lex.stop();
  }
});

test("a catch-up request that arrives while a tab is still starting its copy is answered once it has", async () => {
  const subtle = crypto.subtle, digest = subtle.digest.bind(subtle);
  let release!: () => void, held = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  Object.defineProperty(subtle, "digest", { configurable: true, value: async (...args: Parameters<typeof digest>) => {
    if (!held) { held = true; await gate; }
    return digest(...args);
  } });
  try {
    const room = fakeRoom(), draft = `${base}<p>Anna's unsaved line.</p>\n`;
    const anna = tab(room, draft);
    await quiet();
    const lex = tab(room);
    // Anna starts from her own draft (its id is being worked out) while Lex already asks to be caught up.
    await until(() => held && room.frames > 0, "Lex asking while Anna starts");
    release();
    await until(() => lex.text === draft, "Lex caught up well before the 5 s fallback");
    anna.stop(); lex.stop();
  } finally { Reflect.deleteProperty(subtle, "digest"); }
});

test("a joiner's own unsaved change joins the room's copy; one the room already has is not added again", async () => {
  const room = fakeRoom();
  const anna = tab(room);
  await quiet();
  const extra = "<p>From Lex's unsaved draft.</p>\n";
  const lex = tab(room, base + extra);
  await until(() => anna.text === base + extra, "Lex's draft reaching Anna");
  assert.equal(lex.text, base + extra);
  // A third tab with that same draft (the same browser) finds it in the room already.
  const again = tab(room, base + extra);
  await until(() => again.yjsLoads === 1, "the copy");
  await quiet();
  assert.deepEqual([anna.text, lex.text, again.text], [base + extra, base + extra, base + extra]);
  anna.stop(); lex.stop(); again.stop();
});

test("after frames are lost (a reconnect or a new key), the tabs ask again and nothing typed is lost", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  // Lex's socket is down: Anna's edits and his go nowhere.
  lex.socket.me.cut = true;
  anna.type(4, "Warm ");
  lex.type(base.length, "<p>Offline line.</p>\n");
  await quiet();
  assert.notEqual(anna.text, lex.text);
  lex.socket.me.cut = false;
  lex.socket.me.options.onKey?.();
  await until(() => anna.text === lex.text, "caught up both ways");
  assert.equal(anna.text, `<h1>Warm Fresh bread</h1>\n<p>Open at seven.</p>\n<p>Offline line.</p>\n`);
  anna.stop(); lex.stop();
});

test("a tab on another version of the file keeps its own text; a joiner nobody catches up starts from its own draft", async () => {
  let now = 0;
  const timers = new Map<number, { at: number; run(): void }>();
  let id = 0;
  const clock: LiveClock = { now: () => now, setTimeout(run, delay) { timers.set(++id, { at: now + delay, run }); return id; }, clearTimeout(timer) { timers.delete(timer as number); } };
  const room = fakeRoom();
  const anna = tab(room);
  await quiet();
  const other = tab(room, "<h1>Older page</h1>\n", { baseSha: "b".repeat(40), clock });
  await until(() => other.yjsLoads === 1, "the copy");
  await quiet();
  assert.equal(anna.text, base, "copies of another version never mix");
  assert.equal(other.text, "<h1>Older page</h1>\n");
  // Nobody with its version answers: after the wait it goes on from its own draft.
  assert.equal(timers.size, 1);
  now += LIVE_TEXT_CATCH_UP_MS;
  for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.run(); }
  await quiet();
  other.type(0, "!");
  await quiet();
  assert.equal(other.text, "!<h1>Older page</h1>\n");
  assert.equal(anna.text, base);
  anna.stop(); other.stop();
});

test("the copy follows the open file: another file closes the room, and agents alone do not load Yjs", async () => {
  const room = fakeRoom();
  const anna = tab(room);
  await quiet();
  assert.equal(room.members.size, 1);
  // An agent in the room is not a tab: it joins the shared copy in a later slice.
  room.open({ repo: scope.repo, branch: scope.branch, file: path, onMessage: () => undefined }, "agent");
  await quiet();
  assert.equal(anna.yjsLoads, 0);
  anna.openFile.value = "about.html";
  await quiet();
  assert.equal([...room.members].filter(member => member.access === "editor").length, 0, "the tab left the file's room");
  anna.stop();
});
