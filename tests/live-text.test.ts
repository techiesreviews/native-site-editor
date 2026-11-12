// The open file's shared copy (ticket am-21, ADR 0003): tabs, each with its own
// draft store, sharing one file through a fake room that forwards frames as the
// relay does (tests/live-room.test.ts proves the real room), with real Yjs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { signal } from "@preact/signals-core";
import { createDraftStore, type DraftPersistence } from "../src/draft-store";
import { draftKey, type DraftScope, type SavedDraft } from "../src/drafts";
import { browserKeeper, LIVE_TEXT_CATCH_UP_MS, liveFold, liveState, startLiveText, typedSince, type CopyKeeper, type KeptCopy } from "../src/live-text";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb";
import { LIVE_MESSAGE_LIMIT } from "../shared/live-room";
import { forEachAwait, type AwaitRace } from "./support/await-race";
import type { LiveClock, LivePeer, LiveRoomOptions } from "../src/live-room";
import type { CaretShare, LiveTextPorts, LiveVersion } from "../src/live-text";
import type { JsonValue } from "../shared/agent-command";
import type { LiveAccess } from "../shared/live-room";
import { writeAs, type LiveAuthor } from "../src/live-author";
import { createSaveAuthors, type SaveAuthors } from "../src/save-authors";
import { commitMessage } from "../worker/publish";
import { liveSaves } from "../src/live-saves";

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
  /** `cut`: nothing in or out; `mute`: what it sends is lost, what others send still arrives. */
  type Member = { id: string; options: LiveRoomOptions; access: LiveAccess; cut: boolean; mute?: boolean; state?: JsonValue };
  const members = new Set<Member>();
  let next = 0;
  const others = (me: Member) => new Map([...members].filter(other => other !== me).map(other => [other.id, other.access]));
  /** Presence as the room keeps it: everyone else who said something, with what they said last. */
  const peers = (me: Member) => new Map<string, LivePeer>([...members].filter(other => other !== me && other.state !== undefined)
    .map(other => [other.id, { access: other.access, state: other.state! }]));
  const tell = (me: Member) => { for (const other of members) if (other !== me) { other.options.onMembers?.(others(other)); other.options.onPeers?.(peers(other)); } };
  return {
    frames: 0,
    /** Every frame sent, by sender. */
    log: [] as { from: string; bytes: Uint8Array }[],
    /** Every presence said, by sender. */
    said: [] as { from: string; state: JsonValue }[],
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
          if (!members.has(me) || me.cut || me.mute) return false;
          room.frames++;
          const copy = Uint8Array.from(bytes);
          room.log.push({ from: me.id, bytes: copy });
          for (const other of members) if (other !== me && !other.cut) setImmediate(() => { if (members.has(other) && !other.cut) other.options.onMessage(copy); });
          return true;
        },
        close() { if (members.delete(me)) tell(me); },
        setPresence(state: JsonValue) {
          room.said.push({ from: me.id, state });
          me.state = state;
          for (const other of members) if (other !== me && !other.cut) other.options.onPeers?.(peers(other));
        },
      };
    },
  };
}

/** One browser's kept copies (memory): a reload passes the same one again. */
function keeper(): CopyKeeper & { copies: Map<string, KeptCopy | undefined> } {
  const copies = new Map<string, KeptCopy | undefined>();
  return { copies, read: async key => copies.get(key), write: (key, copy) => { copies.set(key, copy); } };
}

function tab(room: ReturnType<typeof fakeRoom>, text = base, options: { baseSha?: string; clock?: LiveClock; keeper?: CopyKeeper; race?: AwaitRace; persistence?: DraftPersistence; loadYjs?: () => Promise<typeof import("yjs")>; carets?: (share: CaretShare) => () => void; account?: string; authors?: SaveAuthors; base?: string; github?: LiveTextPorts["github"] } = {}) {
  const own: DraftScope = options.account ? { ...scope, account: options.account } : scope;
  const authors = options.authors ?? createSaveAuthors();
  const store = createDraftStore(options.persistence ? { persistence: options.persistence } : {});
  store.open(own, path, { text: options.base ?? base, baseSha: options.baseSha ?? sha });
  if (text !== (options.base ?? base)) store.edit({ scope: own, path, text, label: "Earlier draft" });
  const openFile = signal<string | undefined>(path);
  let yjsLoads = 0, socket: ReturnType<typeof room.open> | undefined;
  const kept = options.keeper ?? keeper(), sockets: string[] = [];
  /** The copy's last load await is over: from here it is made at once. */
  let keptRead = false;
  const race = <Args extends unknown[], Value>(name: string, work: (...args: Args) => Promise<Value>) => options.race ? options.race.port(name, work) : work;
  const stop = startLiveText({
    store, openFile, scope: () => own, on: true, authors, ...(options.clock ? { clock: options.clock } : {}), ...(options.github ? { github: options.github } : {}),
    keeper: { read: key => race("kept copy", (key: string) => kept.read(key))(key).finally(() => { keptRead = true; }), write: (key, copy) => kept.write(key, copy) },
    openRoom: roomOptions => { socket = room.open(roomOptions); sockets.push(socket.me.id); return socket; },
    loadYjs: race("Yjs", () => { yjsLoads++; return options.loadYjs ? options.loadYjs() : import("yjs"); }),
    ...(options.carets ? { loadCarets: race("carets", async () => options.carets!) } : {}),
  });
  return {
    store, openFile, stop, keeper: kept, sockets, scope: own, authors,
    get keptRead() { return keptRead; },
    get yjsLoads() { return yjsLoads; },
    get socket() { return socket!; },
    get text() { return store.text(own, path)!; },
    type(at: number, inserted: string, removed = 0) { assert.equal(store.edit({ scope: own, path, changes: [{ start: at, end: at + removed, text: inserted }] }).ok, true); },
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
  // Per-person Undo (am-24): Anna's change keeps Lex's Undo, which takes back only his words, on both tabs.
  assert.equal(lex.store.canUndo(draftHistory()), true, "Anna's change does not clear Lex's Undo");
  assert.equal(anna.store.canUndo(draftHistory()), true, "nor Lex's change Anna's");
  assert.equal((await lex.store.undo(draftHistory())).ok, true);
  await until(() => anna.text === lex.text && !anna.text.includes("Lex"), "Lex's Undo on both");
  assert.ok(lex.text.startsWith("<!-- shared --><h1>Warm Fresh bread"), "Anna's words stay");
  anna.stop(); lex.stop();
});
const draftHistory = () => draftKey(scope, path);

test("one change putting two words in at one place reaches the room's copy in the draft's order, on every tab (am-59)", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads === 1 && lex.yjsLoads === 1, "both sharing");
  await quiet();
  // As an Undo moved past someone's words can bring back: two pieces at one place, the first given first.
  assert.equal(lex.store.edit({ scope, path, changes: [{ start: 0, end: 0, text: "«26» «18» " }, { start: 0, end: 0, text: "«4» " }] }).ok, true);
  assert.equal(lex.text, `«26» «18» «4» ${base}`);
  await until(() => anna.text.includes("«4»"), "Lex's words at Anna's");
  assert.equal(anna.text, lex.text, "the copy has them in Lex's order, not «4» first");
  anna.stop(); lex.stop();
});

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

test("an answer reaching a tab while it starts its own copy (its wait ran out) is joined, and typing goes on reaching it (am-59)", async () => {
  const time = fakeTimers(), room = fakeRoom(), kept = keeper();
  // Anna runs a copy kept from before, alone.
  const before = tab(room, base, { keeper: kept }), sam = tab(room);
  await until(() => before.yjsLoads + sam.yjsLoads === 2, "the copy");
  before.type(0, "<!-- Anna -->");
  await until(() => sam.text.startsWith("<!-- Anna -->"), "shared");
  before.stop(); sam.stop();
  await quiet();
  const anna = tab(room, before.text, { keeper: kept });
  await until(() => anna.yjsLoads === 1, "Anna's kept copy");
  await quiet();
  // What the room sends Lex waits while `holding`: Anna's answer to his request comes late.
  let holding = true;
  const held: (() => void)[] = [];
  const slow = { ...room, open: (options: LiveRoomOptions, access?: LiveAccess) => room.open({ ...options, onMessage: bytes => { if (holding) held.push(() => options.onMessage(bytes)); else options.onMessage(bytes); } }, access) };
  const lex = tab(slow, base, { clock: time.clock });
  await until(() => held.length > 0 && time.timers.size > 0, "Lex asked; Anna's answer held");
  // A slow digest (the copy id his own start makes): Anna's answer comes in during his start.
  const subtle = crypto.subtle, digest = subtle.digest.bind(subtle);
  Object.defineProperty(subtle, "digest", { configurable: true, value: async (...args: Parameters<SubtleCrypto["digest"]>) => {
    await new Promise(resolve => setTimeout(resolve, 20));
    return digest(...args);
  } });
  try {
    time.advance(LIVE_TEXT_CATCH_UP_MS);
    holding = false;
    for (const deliver of held.splice(0)) deliver();
    await until(() => lex.text.startsWith("<!-- Anna -->"), "Lex on Anna's copy");
  } finally { Object.defineProperty(subtle, "digest", { configurable: true, value: digest }); }
  anna.type(0, "<!-- after -->");
  await until(() => lex.text.startsWith("<!-- after --><!-- Anna -->"), "Anna's typing reaching Lex");
  lex.type(0, "x");
  await until(() => anna.text.startsWith("x<!-- after -->"), "Lex's typing reaching Anna");
  anna.stop(); lex.stop();
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

test("a tab on another version of the file joins the room's copy: its own words move onto the branch's newest version (am-59)", async () => {
  const room = fakeRoom(), newer = sha, older = "b".repeat(40);
  const olderText = "<h1>Fresh bread</h1>\n<p>Open at six.</p>\n";
  // Each tab's workspace says which version it read; GitHub says which is the branch's newest, and that the older came before it.
  const github = (version: string, text: string): LiveTextPorts["github"] => () => ({ sha: version, text, newest: async () => ({ sha: newer, text: base }),
    before: async function* (of) { if (of === newer) yield { sha: older, text: olderText }; } });
  const anna = tab(room, base, { github: github(newer, base) });
  await quiet();
  const lex = tab(room, `${olderText}<p>Lex's line.</p>\n`, { base: olderText, baseSha: older, github: github(older, olderText) });
  await until(() => lex.text === anna.text && anna.text.includes("Lex's line"), "one text");
  assert.equal(anna.text, `${base}<p>Lex's line.</p>\n`, "the newest version, with Lex's own words once");
  assert.equal(lex.store.get(scope, path)?.baseSha, newer, "Lex's draft is over the newest version now");
  lex.type(0, "!");
  await until(() => anna.text.startsWith("!"), "typing after");
  anna.stop(); lex.stop();
});

test("commit 3 heard before commit 2: each enters the room's copy on top of the one before it, once, in GitHub's order (am-59)", async () => {
  // GitHub's history of the file: the base, then commit 2 adds a line, then commit 3 rewrites that line.
  const two = `${base}<p>Closed Mondays.</p>\n`, three = `${base}<p>Closed Sundays.</p>\n`;
  const history = [{ sha, text: base }, { sha: "2".repeat(40), text: two }, { sha: "3".repeat(40), text: three }];
  let newest = 0;
  const github: LiveTextPorts["github"] = () => ({ sha, text: base, newest: async () => history[newest],
    before: async function* (of) { for (let at = history.findIndex(version => version.sha === of) - 1; at >= 0; at--) yield history[at]; } });
  const room = fakeRoom();
  const anna = tab(room, base, { github }), lex = tab(room, base, { github });
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  newest = 2;
  // Anna hears commit 3 first, Lex commit 2 (late) and then commit 3: whichever tab writes, the line enters once.
  const folds = await Promise.all([liveFold(anna.store, draftKey(scope, path), history[2]), liveFold(lex.store, draftKey(scope, path), history[1]),
    liveFold(lex.store, draftKey(scope, path), history[2])]);
  assert.deepEqual(folds, [true, true, true]);
  await until(() => anna.text === three && lex.text === three, "commit 3 on both");
  const edges = liveState(anna.store, draftKey(scope, path)).versions.filter(edge => edge.from).map(edge => `${edge.from[0]}>${edge.to[0]}`).sort();
  assert.deepEqual(edges, ["2>3", "a>2"], "commit 2 on the base, commit 3 on commit 2, nothing else");
  assert.equal(anna.store.get(scope, path)?.baseSha, history[2].sha);
  assert.equal(lex.store.get(scope, path)?.baseSha, history[2].sha);
  anna.stop(); lex.stop();
});

test("Save right after a page opens again waits until it caught up with the room: the save is the room's own, its words once (am-59, Lex's choice A)", async () => {
  const saved = { sha: "c".repeat(40), text: "" };
  const github: LiveTextPorts["github"] = () => ({ sha, text: base, newest: async () => (saved.text ? saved : { sha, text: base }),
    before: async function* (of) { if (of === saved.sha) yield { sha, text: base }; } });
  const room = fakeRoom(), key = draftKey(scope, path);
  const anna = tab(room, base, { github }), lex = tab(room, base, { github });
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  lex.type(base.length, "<p>Lex's line.</p>\n");
  await until(() => anna.text.includes("Lex's line"), "Lex's line shared");
  // Lex reloads and saves at once, as the publish menu does (src/components/publish-menu.ts `send`): it waits for the
  // page to catch up with the room, then reads the draft and notes the save in the room's copy.
  lex.stop();
  await quiet();
  const again = tab(room, lex.text, { keeper: lex.keeper, github });
  const started = Date.now();
  await liveSaves.ready?.(scope, [path], again.store);
  assert.ok(Date.now() - started < LIVE_TEXT_CATCH_UP_MS, "caught up before the wait ran out");
  const text = again.text, copies = liveSaves.note!(scope, [{ path, content: text }], again.store);
  assert.deepEqual(copies, [liveState(anna.store, key).copy], "the room's copy noted the save");
  saved.text = text;
  again.store.markSaved(scope, path, { baseSha: saved.sha, original: text });
  // Anna hears the commit: it names the room's copy, so it enters as the room's own save, not as an outside change.
  assert.equal(await liveFold(anna.store, key, { ...saved, copies }), true);
  await until(() => anna.store.get(scope, path)?.baseSha === saved.sha, "Anna on the saved version");
  await quiet();
  assert.equal(anna.text, again.text);
  assert.equal(times(anna.text, "Lex's line"), 1, "Lex's words once");
  assert.equal(liveSaves.ready?.(scope, [path], again.store), undefined, "caught up, the next save does not wait");
  anna.stop(); again.stop();
});

test("a save landing while a commit folds into the room's copy keeps the draft on the save's newer version (am-59)", async () => {
  const one = { sha: "1".repeat(40), text: `${base}<p>Closed Mondays.</p>\n` };
  // GitHub's newest commit: the base, until Anna's fold asks; that answer waits until `release`.
  let holding = false, release: ((version: LiveVersion) => void) | undefined;
  const github: LiveTextPorts["github"] = () => ({ sha, text: base,
    newest: () => (holding ? new Promise<LiveVersion>(resolve => { release = resolve; }) : Promise.resolve({ sha, text: base })),
    before: async function* (of) { if (of === one.sha) yield { sha, text: base }; } });
  const room = fakeRoom(), key = draftKey(scope, path);
  const anna = tab(room, base, { github });
  await quiet();
  const lex = tab(room, base, { github });
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  lex.type(0, "<!-- Lex -->");
  await until(() => anna.text.startsWith("<!-- Lex -->"), "both caught up");
  // Anna hears commit 1; while her fold asks GitHub for its newest commit, her own save of the room's text lands.
  holding = true;
  const folding = liveFold(anna.store, key, one);
  await until(() => release !== undefined, "the fold asking GitHub");
  anna.type(0, "<!-- Anna -->");
  const saved = "2".repeat(40), copies = liveSaves.note!(scope, [{ path, content: anna.text }], anna.store);
  anna.store.markSaved(scope, path, { baseSha: saved, original: anna.text });
  holding = false;
  release!(one);
  assert.equal(await folding, true);
  assert.equal(anna.store.get(scope, path)?.baseSha, saved, "the draft stays on her save");
  assert.equal(copies.length, 1);
  anna.stop(); lex.stop();
});

test("a commit bringing back the page's earlier text (a revert, A to B to A) is not skipped: the branch loads again (am-59)", async () => {
  const two = `${base}<p>Closed Mondays.</p>\n`;
  const history = [{ sha, text: base }, { sha: "2".repeat(40), text: two }, { sha, text: base }];
  let newest = 0;
  const github: LiveTextPorts["github"] = () => ({ sha, text: base, newest: async () => history[newest],
    before: async function* (of) { for (let at = history.findIndex(version => version.sha === of) - 1; at >= 0; at--) yield history[at]; } });
  const room = fakeRoom(), key = draftKey(scope, path);
  const anna = tab(room, base, { github });
  await quiet();
  const lex = tab(room, base, { github });
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  lex.type(0, "<!-- Lex -->");
  await until(() => anna.text.startsWith("<!-- Lex -->"), "both caught up");
  newest = 1;
  assert.deepEqual(await Promise.all([liveFold(anna.store, key, history[1]), liveFold(lex.store, key, history[1])]), [true, true]);
  await until(() => anna.text.includes("Closed Mondays") && lex.text.includes("Closed Mondays"), "commit 2 on both");
  newest = 2;
  assert.deepEqual(await Promise.all([liveFold(anna.store, key, history[2]), liveFold(lex.store, key, history[2])]), [false, false]);
  anna.stop(); lex.stop();
});

test("a save bringing the page back to its earlier text (A to B to A) puts every tab, and a reload, on that text (am-59)", async () => {
  // A and B are both saves from the room; then Lex takes B's line out again and saves: GitHub's file is A's text, and
  // blob sha, again. The copy holds A twice, in GitHub's order, and each save's note stays its own.
  const line = "<p>Closed Mondays.</p>\n", one = `${base}<p>Fresh daily.</p>\n`, two = `${one}${line}`;
  const history: LiveVersion[] = [{ sha, text: base }];
  const github: LiveTextPorts["github"] = () => ({ sha, text: base, newest: async () => history.at(-1),
    before: async function* (of) { for (let at = history.findLastIndex(version => version.sha === of) - 1; at >= 0; at--) yield history[at]; } });
  const room = fakeRoom(), key = draftKey(scope, path);
  const anna = tab(room, base, { github }), lex = tab(room, base, { github });
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  const save = async (version: LiveVersion) => {
    await until(() => anna.text === version.text, "the text shared");
    const copies = liveSaves.note!(scope, [{ path, content: lex.text }], lex.store);
    history.push({ ...version, copies });
    lex.store.markSaved(scope, path, { baseSha: version.sha, original: lex.text });
    assert.equal(await liveFold(anna.store, key, { ...version, copies }), true);
    await until(() => anna.store.get(scope, path)?.baseSha === version.sha, "Anna on the saved version");
  };
  lex.type(base.length, "<p>Fresh daily.</p>\n");
  await save({ sha: "1".repeat(40), text: one });
  lex.type(one.length, line);
  await save({ sha: "2".repeat(40), text: two });
  lex.type(one.length, "", line.length);
  await save({ sha: "1".repeat(40), text: one });
  await quiet(); await quiet();
  const short = (version: string) => version[0] + version.slice(40);
  const ways = liveState(anna.store, key).versions.filter(edge => edge.from).map(edge => `${short(edge.from)}>${short(edge.to)}`).sort();
  assert.deepEqual(ways, ["1>2", "2>1~1", "a>1"], "A after B is A's second occurrence; A's first stays on the base");
  for (const [name, at] of [["Lex", lex], ["Anna", anna]] as const) {
    assert.equal(at.store.get(scope, path)?.baseSha, "1".repeat(40), `${name} on A`);
    assert.equal(at.store.get(scope, path)?.base, one, `${name}'s base is A's text`);
    assert.equal(at.text, one, `${name}'s text is A's`);
  }
  // Anna reloads with her kept copy: she lands on A, and typing after goes on reaching Lex.
  await new Promise(resolve => setTimeout(resolve, 400));
  anna.stop();
  await quiet();
  const again = tab(room, anna.text, { keeper: anna.keeper, github, base: one, baseSha: "1".repeat(40) });
  await until(() => again.yjsLoads === 1, "the copy");
  await quiet(); await quiet();
  assert.equal(again.store.get(scope, path)?.baseSha, "1".repeat(40), "the reload is on A");
  assert.equal(again.text, one);
  again.type(4, "Warm ");
  await until(() => lex.text.includes("Warm"), "typing after the reload");
  assert.equal(lex.text, again.text);
  assert.equal(times(lex.text, "Mondays"), 0);
  // A tab opening the page fresh (no kept copy) stays on A too.
  const sam = tab(room, one, { github, base: one, baseSha: "1".repeat(40) });
  await until(() => sam.text === lex.text, "Sam caught up");
  await quiet();
  assert.equal(sam.store.get(scope, path)?.baseSha, "1".repeat(40));
  assert.equal(times(sam.text, "Mondays"), 0);
  again.stop(); lex.stop(); sam.stop();
});

test("a commit right after a save brought the page back to an earlier text goes on that occurrence, also from a tab that heard the save late (am-59)", async () => {
  const line = "<p>Closed Mondays.</p>\n", one = `${base}<p>Fresh daily.</p>\n`, two = `${one}${line}`, three = `${one}<p>Closed Sundays.</p>\n`;
  const history: LiveVersion[] = [{ sha, text: base }];
  const github: LiveTextPorts["github"] = () => ({ sha, text: base, newest: async () => history.at(-1),
    before: async function* (of) { for (let at = history.findLastIndex(version => version.sha === of) - 1; at >= 0; at--) yield history[at]; } });
  const room = fakeRoom(), key = draftKey(scope, path);
  const anna = tab(room, base, { github }), lex = tab(room, base, { github });
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  const save = (version: LiveVersion) => {
    const copies = liveSaves.note!(scope, [{ path, content: lex.text }], lex.store);
    history.push({ ...version, copies });
    lex.store.markSaved(scope, path, { baseSha: version.sha, original: lex.text });
    return copies;
  };
  lex.type(base.length, "<p>Fresh daily.</p>\n");
  await until(() => anna.text === one, "A shared");
  assert.equal(await liveFold(anna.store, key, { sha: "1".repeat(40), text: one, copies: save({ sha: "1".repeat(40), text: one }) }), true);
  lex.type(one.length, line);
  await until(() => anna.text === two, "B shared");
  assert.equal(await liveFold(anna.store, key, { sha: "2".repeat(40), text: two, copies: save({ sha: "2".repeat(40), text: two }) }), true);
  await until(() => anna.store.get(scope, path)?.baseSha === "2".repeat(40), "Anna on B");
  // Anna's socket is down while Lex takes the line out again and saves (A's text again), and someone commits C on top.
  anna.socket.me.cut = true;
  lex.type(one.length, "", line.length);
  save({ sha: "1".repeat(40), text: one });
  history.push({ sha: "3".repeat(40), text: three });
  // Anna hears C first: GitHub's history says the save of A came before it, so she waits for its note; it comes late.
  const folding = liveFold(anna.store, key, { sha: "3".repeat(40), text: three });
  await quiet();
  anna.socket.me.cut = false;
  anna.socket.me.options.onKey?.();
  assert.equal(await folding, true);
  assert.equal(await liveFold(lex.store, key, { sha: "3".repeat(40), text: three }), true);
  await until(() => anna.text === three && lex.text === three, "C on both");
  const short = (version: string) => version[0] + version.slice(40);
  for (const at of [anna, lex]) {
    const ways = liveState(at.store, key).versions.filter(edge => edge.from).map(edge => `${short(edge.from)}>${short(edge.to)}`).sort();
    assert.deepEqual(ways, ["1>2", "1~1>3", "2>1~1", "a>1"], "C on A's second occurrence, once");
    assert.equal(at.store.get(scope, path)?.baseSha, "3".repeat(40));
  }
  assert.equal(times(anna.text, "Sundays"), 1);
  anna.stop(); lex.stop();
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

const times = (text: string, part: string) => text.split(part).length - 1;

test("a tab that comes back to a page it shared (another page meanwhile, or a reload) adds nothing twice", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  anna.type(4, "Warm ");
  lex.type(base.length, "<p>Closed Mondays.</p>\n");
  await until(() => anna.text === lex.text && anna.text.includes("Warm") && anna.text.includes("Mondays"), "both edits");
  // Anna opens another page; Lex goes on; Anna comes back.
  anna.openFile.value = "about.html";
  await quiet();
  lex.type(0, "<!-- while Anna was away -->");
  anna.openFile.value = path;
  await until(() => anna.text.startsWith("<!-- while Anna was away -->"), "Anna catching up");
  await quiet();
  assert.equal(anna.text, lex.text);
  assert.deepEqual([times(anna.text, "Warm "), times(anna.text, "Mondays"), times(anna.text, "away")], [1, 1, 1]);
  // Anna reloads (a new page in the same browser, with its draft and kept copy) while Lex types.
  anna.stop();
  await quiet();
  lex.type(0, "<!-- during the reload -->");
  const again = tab(room, anna.text, { keeper: anna.keeper });
  await until(() => again.text.startsWith("<!-- during the reload -->"), "the reloaded tab catching up");
  await quiet();
  assert.equal(again.text, lex.text);
  assert.deepEqual([times(again.text, "Warm "), times(again.text, "Mondays"), times(again.text, "away"), times(again.text, "reload")], [1, 1, 1, 1]);
  again.type(0, "x");
  await until(() => lex.text.startsWith("x<!--"), "its next edit");
  again.stop(); lex.stop();
});

test("two tabs with the same draft that each start their own copy (a catch-up request lost) do not double it", async () => {
  let now = 0, id = 0;
  const timers = new Map<number, { at: number; run(): void }>();
  const clock: LiveClock = { now: () => now, setTimeout(run, delay) { timers.set(++id, { at: now + delay, run }); return id; }, clearTimeout(timer) { timers.delete(timer as number); } };
  const room = fakeRoom(), draft = `${base}<p>Same unsaved line.</p>\n`;
  const anna = tab(room, draft, { clock });
  await quiet();
  const lex = tab(room, draft, { clock });
  await until(() => lex.sockets.length === 1, "Lex in the room");
  // Lex's socket is cut: neither request arrives, and after the wait each starts from its own draft.
  lex.socket.me.cut = true;
  await until(() => lex.yjsLoads === 1 && anna.yjsLoads === 1, "both copies");
  await quiet();
  now += LIVE_TEXT_CATCH_UP_MS;
  for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.run(); }
  await quiet();
  lex.socket.me.cut = false;
  lex.socket.me.options.onKey?.();
  await quiet();
  assert.deepEqual([anna.text, lex.text], [draft, draft], "the same draft makes the same items: nothing doubled");
  anna.type(0, "x");
  await until(() => lex.text === `x${draft}`, "an edit after");
  anna.stop(); lex.stop();
});

test("Discard takes that tab out of the shared copy: the others keep their changes; opening the page again takes the room's copy", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  anna.type(4, "Warm ");
  lex.type(base.length, "<p>Lex's unsaved line.</p>\n");
  await until(() => anna.text === lex.text && anna.text.includes("Warm") && anna.text.includes("Lex's"), "both edits");
  const shared = lex.text;
  assert.equal(anna.store.discard(scope, path).ok, true);
  await quiet();
  assert.equal(anna.text, base, "Anna's page is GitHub's text");
  assert.equal(lex.text, shared, "Lex keeps everyone's changes");
  assert.equal([...room.members].filter(member => member.access === "editor").length, 1, "Anna left the room");
  lex.type(0, "<!-- later -->");
  await quiet();
  assert.equal(anna.text, base, "and does not follow it any more");
  // Opening the page again joins once more, from the room's copy.
  anna.openFile.value = "about.html";
  await quiet();
  anna.openFile.value = path;
  await until(() => anna.text === lex.text, "Anna back on the room's copy");
  assert.equal(times(anna.text, "Warm "), 1);
  anna.stop(); lex.stop();
});

/** The copy's starting-text tag of each frame Anna's sockets sent after `from` in the log. */
const tagsSent = (room: ReturnType<typeof fakeRoom>, sockets: string[], from: number) =>
  room.log.slice(from).filter(item => sockets.includes(item.from)).map(item => Buffer.from(item.bytes.subarray(2, 22)).toString("hex"));
type RaceRun = { done: Promise<unknown>; room: ReturnType<typeof fakeRoom>; anna?: ReturnType<typeof tab>; lex?: ReturnType<typeof tab>; at: number; loading: boolean };
/** Anna has an unsaved draft and the page to herself; Lex opens it: her Yjs load, kept-copy read and starting digest are the awaits. */
function startingRace(race: AwaitRace): RaceRun {
  const subtle = crypto.subtle, digest = subtle.digest.bind(subtle);
  Object.defineProperty(subtle, "digest", { configurable: true, value: race.port("digest", (...args: Parameters<typeof digest>) => digest(...args)) });
  const run: RaceRun = { done: Promise.resolve(), room: fakeRoom(), at: 0, loading: true };
  run.done = (async () => {
    // Her workspace's version of GitHub's text (a save moves it), the branch's newest.
    const github: LiveTextPorts["github"] = (at, file) => { const now = run.anna?.store.get(at, file); return now?.baseSha ? { sha: now.baseSha, text: now.base } : undefined; };
    run.anna = tab(run.room, `${base}<p>Anna's unsaved line.</p>\n`, { race, github });
    await quiet();
    run.lex = tab(run.room);
    // Stopped, discarded or saved while still alone (at her kept copy's read), Anna may load no Yjs and Lex then none.
    await until(() => run.lex!.yjsLoads > 0 || (run.anna!.keptRead && run.anna!.yjsLoads === 0 && run.room.log.length === 0), "both loading, or Anna out early");
    await new Promise(resolve => setTimeout(resolve, 120));
  })().finally(() => { Reflect.deleteProperty(subtle, "digest"); });
  return run;
}
const endRace = (run: RaceRun) => { run.anna?.stop(); run.lex?.stop(); };

test("stopping at any await of starting the copy sends and writes nothing more", async () => {
  const points = await forEachAwait(startingRace, run => {
    run.at = run.room.log.length;
    run.anna!.stop();
  }, async run => {
    let shared = 0;
    run.anna!.store.subscribe(event => { if (event.type === "text" && event.origin === "shared") shared++; });
    await quiet();
    assert.deepEqual(tagsSent(run.room, run.anna!.sockets, run.at), [], "no frame after the stop");
    assert.equal(shared, 0, "no draft write after the stop");
    endRace(run);
  });
  assert.ok(points >= 3, `every await was disturbed (${points})`);
});

test("typing at any await of starting the copy lands once, on both tabs", async () => {
  await forEachAwait(startingRace, run => { run.anna!.type(0, "!"); }, async run => {
    await until(() => run.anna!.text === run.lex!.text && run.lex!.text.startsWith("!"), "the typing on both");
    assert.deepEqual([times(run.lex!.text, "!"), times(run.lex!.text, "Anna's unsaved line")], [1, 1]);
    endRace(run);
  });
});

test("a save landing at any await of loading the copy: the room's one copy takes the saved version, and her words stay once (am-59)", async () => {
  const saved = "c".repeat(40);
  await forEachAwait(startingRace, run => {
    run.at = run.room.log.length;
    run.loading = !run.anna!.keptRead;
    run.anna!.store.markSaved(scope, path, { baseSha: saved, original: run.anna!.text });
  }, async run => {
    await until(() => run.lex!.text === run.anna!.text && liveState(run.anna!.store, draftKey(scope, path)).versions.some(edge => edge.to === saved), "the saved version in the room's copy");
    assert.equal(times(run.anna!.text, "Anna's unsaved line"), 1, "her saved words once");
    // One room copy: whichever tab started it, every frame she sends after the save names that one (or none yet).
    const tags = new Set(tagsSent(run.room, run.anna!.sockets, run.at).filter(tag => tag !== "0".repeat(40)));
    assert.ok(tags.size <= 1, "one copy");
    endRace(run);
  });
});

test("Discard while a tab is alone with its draft takes it out of the room; a tab joining later with that draft's copy brings nothing back", async () => {
  const room = fakeRoom(), draft = `${base}<p>Shared once.</p>\n`;
  const anna = tab(room, draft), lex = tab(room, draft);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  // Lex closes the page (keeping his copy); Anna, alone with no copy loaded any more after reopening, discards.
  lex.stop();
  anna.openFile.value = "about.html";
  await quiet();
  anna.openFile.value = path;
  await quiet();
  const loadsBefore = anna.yjsLoads;
  assert.equal(anna.store.discard(scope, path).ok, true);
  await quiet();
  assert.equal([...room.members].filter(member => member.access === "editor").length, 0, "Anna left the room");
  const back = tab(room, draft, { keeper: lex.keeper });
  await quiet();
  await quiet();
  assert.equal(anna.text, base, "Anna stays on GitHub's text");
  assert.equal(anna.yjsLoads, loadsBefore, "and loads no copy");
  assert.equal(back.text, draft);
  anna.stop(); back.stop();
});

test("Discard at any await of loading the copy leaves the draft on GitHub's text and sends nothing", async () => {
  await forEachAwait(race => {
    const run: RaceRun = { done: Promise.resolve(), room: fakeRoom(), at: 0, loading: true };
    run.done = (async () => {
      // Her workspace's version of GitHub's text (a save moves it), the branch's newest.
    const github: LiveTextPorts["github"] = (at, file) => { const now = run.anna?.store.get(at, file); return now?.baseSha ? { sha: now.baseSha, text: now.base } : undefined; };
    run.anna = tab(run.room, `${base}<p>Anna's unsaved line.</p>\n`, { race, github });
      await quiet();
      run.lex = tab(run.room);
      // Stopped, discarded or saved while still alone (at her kept copy's read), Anna may load no Yjs and Lex then none.
      await until(() => run.lex!.yjsLoads > 0 || (run.anna!.keptRead && run.anna!.yjsLoads === 0 && run.room.log.length === 0), "both loading, or Anna out early");
      await new Promise(resolve => setTimeout(resolve, 120));
    })();
    return run;
  }, run => {
    run.at = run.room.log.length;
    assert.equal(run.anna!.store.discard(scope, path).ok, true);
  }, async run => {
    await quiet();
    assert.equal(run.anna!.text, base, "the discarded draft stays GitHub's text");
    assert.deepEqual(tagsSent(run.room, run.anna!.sockets, run.at), [], "nothing sent after the Discard");
    endRace(run);
  });
});

test("a kept copy Yjs cannot apply is dropped, and the tab still catches up from the room", async () => {
  const room = fakeRoom();
  const lex = tab(room);
  await quiet();
  lex.type(0, "<!-- Lex -->");
  const draft = `${base}<p>Anna's line.</p>\n`, damaged = Uint8Array.from([255, 255, 255, 1, 2, 3, 4, 5]);
  const kept = keeper();
  kept.copies.set(draftKey(scope, path), { tag: Uint8Array.from(sha.match(/../g)!, pair => parseInt(pair, 16)), update: damaged });
  const anna = tab(room, draft, { keeper: kept });
  await until(() => anna.text === lex.text && anna.text.startsWith("<!-- Lex -->") && anna.text.includes("Anna's line"), "Anna caught up, her line kept");
  assert.notDeepEqual(kept.copies.get(draftKey(scope, path))?.update, damaged, "the damaged copy is gone");
  anna.stop(); lex.stop();
});

test("clearing the drafts (sign-out, another workspace) closes the file's room", async () => {
  const room = fakeRoom();
  const anna = tab(room);
  await quiet();
  assert.equal(room.members.size, 1);
  anna.store.clear();
  await quiet();
  assert.equal(room.members.size, 0, "no room socket outlives the drafts");
  anna.stop();
});

test("resuming adds only what was typed since the share began, wherever the kept copy and the draft disagreed", () => {
  const apply = (text: string, change: ReturnType<typeof typedSince>) => change ? text.slice(0, change.start) + change.text + text.slice(change.end) : text;
  // Nothing typed since: nothing added, even when the kept copy missed the last shared change.
  assert.equal(typedSince("<h1>A</h1>", "<h1>warm A</h1>", "<h1>warm A</h1>"), undefined);
  // Kept and draft agreed: the typing as it is.
  assert.equal(apply("<h1>A</h1>", typedSince("<h1>A</h1>", "<h1>A</h1>", "<h1>A!</h1>")), "<h1>A!</h1>");
  // They disagreed (the copy lacks "warm "): typing after that range moves by it, typing before stays.
  assert.equal(apply("<h1>A</h1><p>x</p>", typedSince("<h1>A</h1><p>x</p>", "<h1>warm A</h1><p>x</p>", "<h1>warm A</h1><p>xy</p>")), "<h1>A</h1><p>xy</p>");
  assert.equal(apply("<p>x</p><h1>A</h1>", typedSince("<p>x</p><h1>A</h1>", "<p>x</p><h1>warm A</h1>", "<p>zx</p><h1>warm A</h1>")), "<p>zx</p><h1>A</h1>");
});

test("a reload whose kept copy missed the last shared change does not add that change again", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  anna.type(4, "Crusty ");
  await until(() => lex.text.includes("Crusty"), "Anna's edit");
  await new Promise(resolve => setTimeout(resolve, 400));
  const older = anna.keeper.copies.get(draftKey(scope, path))!;
  assert.ok(older, "Anna kept her copy");
  lex.type(4, "Warm ");
  await until(() => anna.text.includes("Warm Crusty"), "Lex's edit followed by Anna");
  // Her page goes away; the reload keeps the draft's last write but not the copy's.
  anna.stop();
  anna.keeper.copies.set(draftKey(scope, path), older);
  const again = tab(room, anna.text, { keeper: anna.keeper });
  await until(() => again.yjsLoads === 1, "the copy");
  await quiet(); await quiet();
  assert.equal(again.text, lex.text);
  assert.deepEqual([times(again.text, "Warm "), times(again.text, "Crusty ")], [1, 1]);
  again.stop(); lex.stop();
});

test("a reload whose kept copy missed what the tab typed alone keeps that typing, and the next one in gets it once", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  anna.type(4, "Warm ");
  await until(() => lex.text.includes("Warm"), "Anna's edit");
  await new Promise(resolve => setTimeout(resolve, 400));
  // Lex leaves; Anna types alone, and her reload keeps the draft's last write but not the copy's.
  lex.stop();
  await quiet();
  const older = anna.keeper.copies.get(draftKey(scope, path))!;
  assert.ok(older?.draft?.includes("Warm"), "Anna kept her copy with its draft");
  anna.type(base.indexOf("</h1>") + "Warm ".length, " abc");
  await until(() => anna.text.includes("bread abc"), "Anna's typing");
  anna.stop();
  anna.keeper.copies.set(draftKey(scope, path), older);
  const again = tab(room, anna.text, { keeper: anna.keeper });
  await quiet();
  assert.equal(times(again.text, " abc"), 1, "Anna's draft keeps what she typed alone");
  // Lex comes back from his own kept copy (without " abc"): Anna starts her part from the older copy, and he catches up from her.
  const back = tab(room, lex.text, { keeper: lex.keeper });
  await until(() => again.keptRead && back.text.includes(" abc"), "Lex catching up");
  await quiet();
  assert.equal(back.text, again.text);
  assert.deepEqual([times(again.text, "Warm "), times(again.text, " abc")], [1, 1]);
  again.stop(); back.stop();
});

test("a tab alone sends no edits to the room; the next one in is caught up all the same", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  lex.stop();
  await quiet();
  const before = room.log.length;
  anna.type(0, "a"); anna.type(1, "b");
  await quiet();
  assert.equal(room.log.length, before, "nothing sent while alone");
  const back = tab(room, lex.text, { keeper: lex.keeper });
  await until(() => back.text.startsWith("ab"), "Lex catching up");
  assert.equal(back.text, anna.text);
  anna.stop(); back.stop();
});

function fakeTimers() {
  let now = 0, id = 0;
  const timers = new Map<number, { at: number; run(): void }>();
  const clock: LiveClock = { now: () => now, setTimeout(run, delay) { timers.set(++id, { at: now + delay, run }); return id; }, clearTimeout(timer) { timers.delete(timer as number); } };
  return { clock, timers, advance(ms: number) { now += ms; for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.run(); } } };
}

test("a joiner whose only other tab leaves before answering starts from its own draft at once, without the 5 s wait", async () => {
  const time = fakeTimers(), room = fakeRoom(), draft = `${base}<p>Lex's line.</p>\n`;
  const anna = tab(room);
  await quiet();
  // Anna never answers: her socket carries nothing from before Lex comes (she still hears who joins).
  anna.socket.me.cut = true;
  const lex = tab(room, draft, { clock: time.clock });
  await until(() => lex.sockets.length === 1 && room.members.size === 2, "Lex in the room");
  const fromLex = (caughtUp: number) => room.log.some(item => item.from === lex.sockets[0] && item.bytes[0] === 1 && item.bytes[1] === caughtUp);
  await until(() => fromLex(0), "Lex asking to be caught up");
  await until(() => time.timers.size > 0, "Lex waiting for an answer");
  assert.equal(fromLex(1), false, "not caught up yet");
  anna.stop();
  // The clock never moved: Lex starts the copy himself and says so.
  await until(() => fromLex(1), "Lex starting from his own draft");
  const sam = tab(room);
  await until(() => sam.text === draft, "Sam caught up from Lex");
  assert.equal(lex.text, draft);
  lex.stop(); sam.stop();
});

test("a joiner does not count an answer to another tab's request as its own catch-up", async () => {
  const time = fakeTimers(), room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  anna.type(4, "Warm ");
  lex.type(base.length, "<p>Closed Mondays.</p>\n");
  await until(() => anna.text === lex.text && anna.text.includes("Warm") && anna.text.includes("Mondays"), "both edits");
  // Sam opens the page with the room's text as his draft; his own request is lost.
  const sam = tab(room, anna.text, { clock: time.clock });
  await until(() => sam.sockets.length === 1, "Sam in the room");
  sam.socket.me.mute = true;
  await until(() => sam.yjsLoads === 1, "Sam's copy");
  await quiet();
  // Lex asks again (a reconnect): Anna's answer to him reaches Sam too, holding only what Lex lacked.
  const before = room.log.length;
  lex.socket.me.options.onKey?.();
  await until(() => room.log.slice(before).some(item => item.bytes[0] === 3), "Anna answering Lex");
  await quiet();
  assert.equal(sam.text, anna.text, "Sam did not start from that partial answer");
  // His own request gets through: caught up, nothing doubled.
  sam.socket.me.mute = false;
  sam.socket.me.options.onKey?.();
  await quiet(); await quiet();
  assert.equal(sam.text, anna.text);
  assert.deepEqual([times(sam.text, "Warm "), times(sam.text, "Mondays")], [1, 1]);
  sam.type(0, "x");
  await until(() => anna.text.startsWith("x"), "Sam's edit after");
  assert.deepEqual([times(anna.text, "Warm "), times(anna.text, "Mondays")], [1, 1]);
  anna.stop(); lex.stop(); sam.stop();
});

test("another tab's older saved draft adopted while sharing does not take newer changes away from everyone", async () => {
  const records = new Map<string, SavedDraft>();
  const persistence: DraftPersistence = {
    get: (draftScope, file) => records.get(draftKey(draftScope, file)),
    save: record => { records.set(draftKey(record, record.path), record); return true; },
    remove: (draftScope, file) => records.delete(draftKey(draftScope, file)),
  };
  const room = fakeRoom();
  const anna = tab(room, base, { persistence }), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  anna.type(4, "Warm ");
  await until(() => lex.text.includes("Warm"), "Anna's edit");
  const older = records.get(draftKey(scope, path))!;
  lex.type(base.length, "<p>Newer line.</p>\n");
  await until(() => anna.text.includes("Newer line"), "Lex's edit followed");
  // Another tab of Anna's browser wrote the older draft; her code pane mounting adopts it.
  records.set(draftKey(scope, path), { ...older, updatedAt: older.updatedAt + 1 });
  assert.equal(anna.store.reload(scope, path), true);
  await quiet();
  assert.ok(lex.text.includes("Newer line"), "Lex keeps the newer change");
  assert.equal(anna.text, lex.text, "and Anna's draft follows the copy again");
  anna.stop(); lex.stop();
});

test("the browser keeper keeps copies in IndexedDB: a fresh keeper reads them, a removal deletes, a wrong shape reads as none", async () => {
  const fake = fakeIndexedDB();
  const saved = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fake.factory });
  try {
    const copy: KeptCopy = { tag: new Uint8Array(20).fill(7), update: Uint8Array.from([1, 2, 3]) };
    browserKeeper().write("file-a", copy);
    await until(() => fake.stores.get("copies")?.has("file-a") ?? false, "the write");
    assert.deepEqual(await browserKeeper().read("file-a"), copy, "a reload reads it back");
    browserKeeper().write("file-a", undefined);
    await until(() => !(fake.stores.get("copies")?.has("file-a") ?? true), "the removal");
    assert.equal(await browserKeeper().read("file-a"), undefined);
    fake.stores.get("copies")!.set("file-b", { tag: "not bytes", update: [1] });
    assert.equal(await browserKeeper().read("file-b"), undefined, "a record of the wrong shape");
  } finally {
    if (saved) Object.defineProperty(globalThis, "indexedDB", saved); else Reflect.deleteProperty(globalThis, "indexedDB");
  }
});

test("an update over the room's frame limit is not sent, and the joiner goes on from its own draft after the wait", async () => {
  const time = fakeTimers(), room = fakeRoom();
  const anna = tab(room);
  await quiet();
  anna.type(base.length, `<p>${"x".repeat(LIVE_MESSAGE_LIMIT)}</p>\n`);
  const lex = tab(room, base, { clock: time.clock });
  await until(() => lex.yjsLoads === 1 && anna.yjsLoads === 1, "both copies");
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.ok(room.log.every(item => item.bytes.length <= LIVE_MESSAGE_LIMIT), "no frame over the room's limit went out");
  assert.equal(lex.text, base, "Lex is not caught up with a copy that cannot be sent");
  time.advance(LIVE_TEXT_CATCH_UP_MS);
  await quiet();
  lex.type(0, "<!-- Lex -->");
  await until(() => anna.text.startsWith("<!-- Lex -->"), "Lex's small edit still reaching Anna");
  assert.equal(lex.text, `<!-- Lex -->${base}`);
  anna.stop(); lex.stop();
});

test("frames past the inbox limit while Yjs loads are dropped, and the catch-up still brings everything", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const sam = tab(room, base, { loadYjs: async () => { await gate; return import("yjs"); } });
  await until(() => sam.yjsLoads === 1, "Sam loading Yjs");
  for (let index = 0; index < 600; index++) anna.type(0, "y");
  await until(() => lex.text.startsWith("y".repeat(600)), "the edits reaching Lex");
  release();
  await until(() => sam.text === anna.text, "Sam caught up");
  assert.equal(times(sam.text, "y".repeat(600)), 1);
  anna.stop(); lex.stop(); sam.stop();
});

/** The author a caret names: the Yjs client id `who`'s own UPDATE frames carry. */
function authorOf(room: ReturnType<typeof fakeRoom>, who: { sockets: string[] }) {
  const update = room.log.find(entry => who.sockets.includes(entry.from) && entry.bytes[0] === 4)!;
  return new DataView(update.bytes.buffer, update.bytes.byteOffset).getUint32(22);
}

test("the name-tag Undo (am-24) takes back Anna's latest text change on both tabs, and Lex's own Undo still takes back his", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  let told = 0;
  const unlisten = lex.stop.onAuthorUndo(() => { told++; });
  lex.type(base.indexOf("seven"), "half past ");
  await until(() => anna.text === lex.text && anna.text.includes("half past"), "Lex's edit");
  anna.type(4, "Warm ");
  await until(() => lex.text.includes("Warm"), "Anna's edit");
  // The author a caret names: the Yjs client id Anna's UPDATE frames carry.
  const author = authorOf(room, anna);
  assert.equal(lex.stop.canUndoAuthor(author), true);
  assert.equal(lex.stop.canUndoAuthor(author + 1), false, "nobody else's");
  assert.ok(told > 0, "the name tags hear it");
  assert.equal(lex.stop.undoAuthor(author), true);
  await until(() => anna.text === lex.text && !anna.text.includes("Warm"), "Anna's change taken back on both");
  assert.equal(lex.text, "<h1>Fresh bread</h1>\n<p>Open at half past seven.</p>\n", "Lex's words stay");
  assert.equal(lex.stop.canUndoAuthor(author), false);
  assert.equal(lex.stop.undoAuthor(author), false);
  // Lex's own Undo was kept through both of Anna's changes; the name-tag Undo is his newest step.
  assert.equal((await lex.store.undo(draftHistory())).ok, true);
  await until(() => anna.text.includes("Warm") && lex.text === anna.text, "the name-tag Undo undone");
  assert.equal((await lex.store.undo(draftHistory())).ok, true);
  await until(() => !anna.text.includes("half past") && lex.text === anna.text, "Lex's Undo on both");
  assert.equal(lex.text, "<h1>Warm Fresh bread</h1>\n<p>Open at seven.</p>\n");
  unlisten();
  anna.stop(); lex.stop();
  assert.equal(lex.stop.canUndoAuthor(author), false, "stopped, nothing to take back");
});

test("name tags hear nothing is left to take back when the file changes or sharing stops", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  anna.type(4, "Warm ");
  await until(() => lex.text.includes("Warm"), "Anna's edit");
  const author = authorOf(room, anna);
  assert.equal(lex.stop.canUndoAuthor(author), true);
  const seen: boolean[] = [];
  lex.stop.onAuthorUndo(() => seen.push(lex.stop.canUndoAuthor(author)));
  lex.openFile.value = "about/index.html";
  assert.ok(seen.length > 0, "the switch is told");
  assert.deepEqual(seen.filter(Boolean), [], "every answer after the switch is false");
  assert.equal(lex.stop.undoAuthor(author), false);
  // Back on the page, then stopped: told again, and still nothing to take back.
  lex.openFile.value = path;
  await until(() => lex.sockets.length === 2, "the page shared again");
  seen.length = 0;
  lex.stop();
  assert.deepEqual(seen.filter(Boolean), []);
  anna.stop();
});

test("what a late joiner was caught up with is not anyone's name-tag change; what they type after is", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  anna.type(4, "Warm ");
  lex.type(base.indexOf("seven"), "half past ");
  await until(() => anna.text === lex.text && anna.text.includes("Warm") && anna.text.includes("half past"), "both edits");
  const author = authorOf(room, anna);
  const sam = tab(room);
  await until(() => sam.text === anna.text, "Sam caught up");
  assert.equal(sam.stop.canUndoAuthor(author), false, "the catch-up is not Anna's change");
  anna.type(0, "<!-- hi -->");
  await until(() => sam.text.startsWith("<!-- hi -->"), "Anna's new words at Sam's");
  assert.equal(sam.stop.canUndoAuthor(author), true);
  assert.equal(sam.stop.undoAuthor(author), true);
  await until(() => [anna, lex, sam].every(one => one.text === "<h1>Warm Fresh bread</h1>\n<p>Open at half past seven.</p>\n"), "only her new words taken back, everywhere");
  anna.stop(); lex.stop(); sam.stop();
});

test("a tab never counts its own changes as an author's, and taking back Anna's leaves Lex's older Undo steps", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  lex.type(base.indexOf("seven"), "half past ");
  lex.type(base.indexOf("Fresh"), "Warm ");
  await until(() => anna.text === lex.text && anna.text.includes("Warm"), "Lex's edits");
  assert.equal(lex.stop.canUndoAuthor(authorOf(room, lex)), false, "Lex's own changes are not a name tag's");
  assert.equal((await lex.store.undo(draftHistory())).ok, true);
  await until(() => !anna.text.includes("Warm"), "Lex's Undo");
  anna.type(base.length, "<p>Closed Mondays.</p>\n");
  await until(() => lex.text.includes("Mondays"), "Anna's edit");
  assert.equal(lex.stop.undoAuthor(authorOf(room, anna)), true);
  await until(() => !lex.text.includes("Mondays") && !anna.text.includes("Mondays"), "Anna's change taken back");
  // The name-tag Undo is Lex's newest step (so, as any new step, it ends his Redo); his older step stays under it.
  assert.equal(lex.store.canRedo(draftHistory()), false);
  assert.equal((await lex.store.undo(draftHistory())).ok, true);
  await until(() => anna.text.includes("Mondays") && lex.text === anna.text, "her words back");
  assert.equal((await lex.store.undo(draftHistory())).ok, true);
  await until(() => !anna.text.includes("half past") && lex.text === anna.text, "Lex's older step on both");
  anna.stop(); lex.stop();
});

test("a name tag whose words someone removed has nothing to take back", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  anna.type(4, "Warm ");
  await until(() => lex.text.includes("Warm"), "Anna's edit");
  const author = authorOf(room, anna);
  let told = 0;
  lex.stop.onAuthorUndo(() => { told++; });
  lex.type(4, "", "Warm ".length);
  await until(() => anna.text === base, "Lex removed her words on both");
  assert.ok(told > 0, "the name tags look again");
  assert.equal(lex.stop.canUndoAuthor(author), false);
  assert.equal(lex.stop.undoAuthor(author), false);
  await quiet();
  assert.equal(lex.text, base);
  assert.equal(anna.text, base);
  anna.stop(); lex.stop();
});

test("a name-tag Undo is Lex's own step: his Undo brings Anna's words back on both tabs, his Redo takes them again", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  anna.type(4, "Warm ");
  await until(() => lex.text.includes("Warm"), "Anna's edit");
  assert.equal(lex.stop.undoAuthor(authorOf(room, anna), draftHistory()), true);
  await until(() => anna.text === base && lex.text === base, "her words taken back");
  assert.equal(lex.store.peek(draftHistory(), "undo"), "Undo their change");
  assert.equal((await lex.store.undo(draftHistory())).ok, true);
  await until(() => anna.text.includes("Warm ") && lex.text === anna.text, "her words back on both");
  assert.equal((await lex.store.redo(draftHistory())).ok, true);
  await until(() => anna.text === base && lex.text === base, "taken again on both");
  anna.stop(); lex.stop();
});

test("carets (am-22): each tab tells the room where its caret is; others read it in their text, it stays by the same words, and it names the author the name-tag Undo takes", async () => {
  const room = fakeRoom();
  const shares = new Map<string, CaretShare>();
  const drawn = (who: string) => (share: CaretShare) => { shares.set(who, share); return () => { shares.delete(who); }; };
  const anna = tab(room, base, { carets: drawn("anna") });
  await quiet();
  assert.equal(shares.size, 0, "alone with the file: no carets are loaded");
  const lex = tab(room, base, { carets: drawn("lex") });
  await until(() => shares.size === 2, "carets drawn once someone else is here");
  await quiet();
  const bread = base.indexOf("bread");
  shares.get("anna")!.own(() => ({ anchor: bread, head: bread + "bread".length }));
  await until(() => shares.get("lex")!.carets().length === 1, "Anna's caret at Lex's");
  const [caret] = shares.get("lex")!.carets();
  assert.deepEqual({ name: caret.name, anchor: caret.anchor, head: caret.head, agent: caret.agent }, { name: "lex", anchor: bread, head: bread + 5, agent: undefined });
  assert.deepEqual(shares.get("anna")!.carets(), [], "Lex has said nowhere yet");

  // Lex types before her selection: it stays on "bread", read again in his new text.
  let moved = 0;
  const unwatch = shares.get("lex")!.onCarets(() => { moved++; });
  lex.type(4, "Warm ");
  await until(() => anna.text === lex.text, "his edit on both");
  assert.ok(moved > 0, "the caret is drawn again");
  assert.deepEqual(shares.get("lex")!.carets().map(({ anchor, head }) => [anchor, head]), [[bread + 5, bread + 10]]);
  unwatch();

  // The caret names Anna by the Yjs client id her own changes carry: its name tag's Undo takes back her words only.
  anna.type(0, "<!-- Anna -->");
  await until(() => lex.text.startsWith("<!-- Anna -->"), "her edit");
  const author = shares.get("lex")!.carets()[0].author;
  assert.equal(author, authorOf(room, anna));
  assert.equal(shares.get("lex")!.canUndo(author), true);
  assert.equal(shares.get("lex")!.undo(author, draftHistory()), true);
  await until(() => !anna.text.includes("Anna") && lex.text === anna.text, "her words gone on both");
  assert.ok(lex.text.includes("Warm "), "Lex's words stay");

  // An agent in the room: its caret says which program it works in; a person's never does, whatever it says.
  const said = [...room.members].find(member => anna.sockets.includes(member.id))!.state as { caret: JsonValue };
  const agent = room.open({ repo: scope.repo, branch: scope.branch, file: path, onMessage: () => undefined }, "agent");
  await quiet();
  agent.setPresence({ author: 7, name: "Claude Code", agent: "claude-code", caret: said.caret });
  await until(() => shares.get("lex")!.carets().length === 2, "the agent's caret");
  assert.deepEqual(shares.get("lex")!.carets().find(item => item.author === 7)?.agent, "claude-code");
  // Gone from the room: its caret goes.
  agent.close();
  await until(() => shares.get("lex")!.carets().length === 1, "the agent left");

  // Leaving the file takes this tab's carets away.
  anna.stop();
  assert.equal(shares.has("anna"), false);
  lex.stop();
  assert.equal(shares.size, 0);
});

test("a caret whose author someone else here also claims (or this tab's own) offers no Undo, whatever name it says", async () => {
  const room = fakeRoom();
  const shares = new Map<string, CaretShare>();
  const drawn = (who: string) => (share: CaretShare) => { shares.set(who, share); return () => { shares.delete(who); }; };
  const anna = tab(room, base, { carets: drawn("anna") }), lex = tab(room, base, { carets: drawn("lex") });
  await until(() => shares.size === 2, "carets drawn");
  await quiet();
  shares.get("anna")!.own(() => ({ anchor: 4, head: 4 }));
  anna.type(4, "Warm ");
  await until(() => shares.get("lex")!.carets().length === 1 && lex.text.includes("Warm"), "Anna's caret and words");
  const author = authorOf(room, anna);
  assert.equal(shares.get("lex")!.carets()[0].contested, undefined, "hers alone: her tag can take back her words");
  // Someone else in the room says it is "Lex", with Anna's author id, and its caret where hers is.
  const said = [...room.members].find(member => anna.sockets.includes(member.id))!.state as { caret: JsonValue };
  const spoof = room.open({ repo: scope.repo, branch: scope.branch, file: path, onMessage: () => undefined });
  await quiet();
  spoof.setPresence({ author, name: "Lex", caret: said.caret });
  await until(() => shares.get("lex")!.carets().length === 2, "the second claim");
  assert.deepEqual(shares.get("lex")!.carets().map(caret => [caret.author, caret.contested]), [[author, true], [author, true]]);
  spoof.close();
  await until(() => shares.get("lex")!.carets().length === 1, "the claim gone");
  assert.equal(shares.get("lex")!.carets()[0].contested, undefined);
  anna.stop(); lex.stop();
});

test("stopping at any await of loading the carets starts no carets and tells the room no caret", async () => {
  type Run = { done: Promise<unknown>; room: ReturnType<typeof fakeRoom>; anna?: ReturnType<typeof tab>; lex?: ReturnType<typeof tab>; started: number; at: number };
  const points = await forEachAwait((race): Run => {
    const run: Run = { done: Promise.resolve(), room: fakeRoom(), started: 0, at: 0 };
    run.done = (async () => {
      run.anna = tab(run.room, base, { race, carets: share => { run.started++; share.own(() => ({ anchor: 1, head: 1 })); return () => undefined; } });
      await quiet();
      run.lex = tab(run.room);
      // Stopped, discarded or saved while still alone (at her kept copy's read), Anna may load no Yjs and Lex then none.
      await until(() => run.lex!.yjsLoads > 0 || (run.anna!.keptRead && run.anna!.yjsLoads === 0 && run.room.log.length === 0), "both loading, or Anna out early");
      await new Promise(resolve => setTimeout(resolve, 120));
    })();
    return run;
  }, run => {
    run.at = run.room.said.length;
    run.anna!.stop();
  }, async run => {
    await quiet();
    assert.equal(run.started, 0, "no carets after the stop");
    assert.deepEqual(run.room.said.slice(run.at).filter(item => run.anna!.sockets.includes(item.from)), [], "no caret told after the stop");
    run.lex?.stop();
  });
  assert.ok(points >= 2, `the carets' load was disturbed (${points})`);
});

test("a joiner's caret placed before it caught up is told where it is in the shared text", async () => {
  const room = fakeRoom();
  const shares = new Map<string, CaretShare>();
  const drawn = (who: string) => (share: CaretShare) => { shares.set(who, share); return () => { shares.delete(who); }; };
  // Lex shares a text with more in it; his room is caught up when Anna arrives with GitHub's text as her draft.
  const lex = tab(room, `<!-- Lex's long note at the top of the page -->\n${base}`, { carets: drawn("lex") });
  await quiet();
  // Anna's pane places her caret on "seven" at once, in her own text, before the room's copy reaches her.
  const anna = tab(room, base, { carets: share => {
    shares.set("anna", share);
    share.own(() => ({ anchor: anna.text.indexOf("seven"), head: anna.text.indexOf("seven") + "seven".length }));
    return () => { shares.delete("anna"); };
  } });
  await until(() => anna.text === lex.text, "Anna caught up");
  await until(() => shares.get("lex")?.carets().length === 1, "her caret at Lex's");
  const [caret] = shares.get("lex")!.carets();
  assert.equal(lex.text.slice(caret.anchor, caret.head), "seven", "on the same word in the shared text");
  anna.stop(); lex.stop();
});

test("a caret said in another named type is not drawn, and makes no type in this copy", async () => {
  const room = fakeRoom();
  const shares = new Map<string, CaretShare>();
  const drawn = (who: string) => (share: CaretShare) => { shares.set(who, share); return () => { shares.delete(who); }; };
  // Every Doc Lex's tab makes, to look at their root types.
  const docs: import("yjs").Doc[] = [];
  const loadYjs = async () => {
    const Y = await import("yjs");
    return { ...Y, Doc: class extends Y.Doc { constructor(...args: ConstructorParameters<typeof Y.Doc>) { super(...args); docs.push(this); } } } as typeof Y;
  };
  const anna = tab(room, base, { carets: drawn("anna") }), lex = tab(room, base, { carets: drawn("lex"), loadYjs });
  await until(() => shares.size === 2 && anna.text === lex.text, "carets drawn");
  await quiet();
  const stranger = room.open({ repo: scope.repo, branch: scope.branch, file: path, onMessage: () => undefined });
  await quiet();
  const elsewhere = { tname: "x", item: null, type: null, assoc: 0 };
  stranger.setPresence({ author: 9, name: "Sam", caret: { anchor: elsewhere, head: elsewhere } });
  await quiet();
  assert.deepEqual(shares.get("lex")!.carets(), []);
  assert.ok(docs.some(doc => doc.share.has("source")), "the copy is among them");
  assert.ok(docs.every(doc => !doc.share.has("x")), "no type \"x\" made");
  stranger.close();
  anna.stop(); lex.stop();
});


/** An agent's change written into `who`'s drafts as the receiving tab writes it (src/agent-site.ts, the guarded commit's publish). */
function agentWrites(who: ReturnType<typeof tab>, text: string, agent: LiveAuthor = { grant: "grant-1", name: "Claude Code" }) {
  writeAs(agent, () => { assert.ok(who.store.write(scope, path, text)); });
}
/** The id the UPDATE frames from `who`'s sockets name, other than its own. */
const otherIds = (room: ReturnType<typeof fakeRoom>, who: { sockets: string[] }, own: number) =>
  [...new Set(room.log.filter(entry => who.sockets.includes(entry.from) && entry.bytes[0] === 4)
    .map(entry => new DataView(entry.bytes.buffer, entry.bytes.byteOffset).getUint32(22)))].filter(id => id !== own);

test("agents join the merge (am-25): an agent's sentence lands with Lex's typing in the next on every tab, under its own id, and its name tag takes back only its words", async () => {
  const room = fakeRoom();
  const shares = new Map<string, CaretShare>();
  const drawn = (who: string) => (share: CaretShare) => { shares.set(who, share); return () => { shares.delete(who); }; };
  const text = "<h1>Fresh bread</h1>\n<p>Open at seven.</p>\n<p>Closed on Sundays.</p>\n";
  const lex = tab(room, text, { carets: drawn("lex") });
  await quiet();
  const anna = tab(room, base, { carets: drawn("anna") });
  await until(() => shares.size === 2 && anna.text === lex.text, "the copy");
  await quiet();
  lex.type(0, "<!-- Lex -->");
  await until(() => anna.text === lex.text, "Lex's own change first");
  const lexId = authorOf(room, lex);

  // The agent rewrites one sentence in Lex's tab (it receives the agent's commands) while Lex types in the next.
  const sentence = lex.text.indexOf("Open at seven.");
  agentWrites(lex, lex.text.slice(0, sentence) + "Open from seven until two." + lex.text.slice(sentence + "Open at seven.".length));
  lex.type(lex.text.indexOf("Sundays") + "Sundays".length, " and Mondays");
  await until(() => anna.text === lex.text && anna.text.includes("until two") && anna.text.includes("and Mondays"), "both on every tab");
  assert.equal(anna.text, "<!-- Lex --><h1>Fresh bread</h1>\n<p>Open from seven until two.</p>\n<p>Closed on Sundays and Mondays.</p>\n");

  // Its change went out under an id of its own, not Lex's.
  const [agent, ...more] = otherIds(room, lex, lexId);
  assert.ok(agent !== undefined && more.length === 0, "one other id: the agent's");
  assert.notEqual(agent, lexId);
  assert.equal(anna.stop.canUndoAuthor(lexId), true, "Lex's own words are his");
  assert.equal(anna.stop.canUndoAuthor(agent), true, "the agent's words are the agent's at Anna's");
  assert.equal(lex.stop.canUndoAuthor(agent), true, "and at Lex's, who wrote them for it");

  // Its caret: at Lex's (drawn from his own tab) and at Anna's (as his tab says it), named as its commands name it.
  await until(() => shares.get("anna")!.carets().some(caret => caret.author === agent), "the agent's caret at Anna's");
  for (const who of ["lex", "anna"]) {
    const caret = shares.get(who)!.carets().find(item => item.author === agent)!;
    assert.deepEqual({ name: caret.name, agent: caret.agent, contested: caret.contested }, { name: "Claude Code", agent: "Claude Code", contested: undefined }, who);
    assert.equal(lex.text.slice(0, caret.head).endsWith("Open from seven until two"), true, `${who}: the caret ends its change`);
    // Lex's tab knows the agent by its connection, so its caret is drawn as its outline is (src/participant.ts); the
    // connection never leaves his tab.
    assert.deepEqual(caret.who, who === "lex" ? { grant: "grant-1", name: "Claude Code" } : undefined, who);
  }

  // Lex takes it back from the agent's name tag: only the agent's words go, on every tab; Lex's stay.
  assert.equal(shares.get("lex")!.undo(agent, draftHistory()), true);
  await until(() => anna.text === lex.text && !anna.text.includes("until two"), "the agent's words gone on both");
  assert.equal(lex.text, "<!-- Lex --><h1>Fresh bread</h1>\n<p>Open at seven.</p>\n<p>Closed on Sundays and Mondays.</p>\n");
  assert.equal(lex.stop.canUndoAuthor(agent), false);
  // That Undo is Lex's own step: his Undo brings the agent's words back for everyone.
  assert.equal((await lex.store.undo(draftHistory())).ok, true);
  await until(() => anna.text === lex.text && anna.text.includes("until two"), "the agent's words back on both");
  anna.stop(); lex.stop();
});

test("an agent's change taken back from Anna's tab goes from every tab; a second agent has an id of its own; a frame naming an agent's id is not its change at the tab that writes for it", async () => {
  const room = fakeRoom();
  const lex = tab(room), anna = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  lex.type(0, "<!-- Lex -->");
  await until(() => anna.text === lex.text, "Lex's change");
  const lexId = authorOf(room, lex);
  agentWrites(lex, lex.text.replace("Fresh bread", "Warm bread"));
  agentWrites(lex, lex.text.replace("seven", "eight"), { grant: "grant-2", name: "Codex" });
  await until(() => anna.text === lex.text && anna.text.includes("Warm") && anna.text.includes("eight"), "both agents' changes");
  const ids = otherIds(room, lex, lexId);
  assert.equal(ids.length, 2, "one id per agent");
  const [first, second] = ids;
  // Anna takes back the first agent's change: it goes from both tabs, the second agent's and Lex's stay.
  assert.equal(anna.stop.undoAuthor(first), true);
  await until(() => lex.text === anna.text && !lex.text.includes("Warm"), "the first agent's words gone on both");
  assert.equal(lex.text, "<!-- Lex --><h1>Fresh bread</h1>\n<p>Open at eight.</p>\n");
  assert.equal(lex.stop.canUndoAuthor(second), true);

  // Someone else in the room sends a change under the second agent's id: at Lex's it is not the agent's to take back.
  const Y = await import("yjs");
  const spoof = room.open({ repo: scope.repo, branch: scope.branch, file: path, onMessage: () => undefined });
  await quiet();
  const theirs = room.log.find(entry => anna.sockets.includes(entry.from) && entry.bytes[0] === 4)!.bytes;
  const doc = new Y.Doc();
  doc.clientID = 4242;
  doc.getText("source").insert(0, "<!-- spoof -->");
  const update = Y.encodeStateAsUpdate(doc);
  const frame = new Uint8Array(26 + update.length);
  frame.set(theirs.subarray(0, 26));
  new DataView(frame.buffer).setUint32(22, second);
  frame.set(update, 26);
  await spoof.send(frame);
  await until(() => lex.text.startsWith("<!-- spoof -->") && anna.text === lex.text, "the spoofed change on both");
  assert.equal(lex.stop.undoAuthor(second), true, "Lex's tab still takes back only the agent's own change");
  await until(() => anna.text === lex.text && !lex.text.includes("eight"), "the second agent's words gone on both");
  assert.equal(lex.text, "<!-- spoof --><!-- Lex --><h1>Fresh bread</h1>\n<p>Open at seven.</p>\n");
  spoof.close();
  anna.stop(); lex.stop();
});

test("an agent's change while Lex is alone with the file stays his draft; a tab joining later gets it once", async () => {
  const room = fakeRoom();
  const lex = tab(room);
  await quiet();
  agentWrites(lex, lex.text.replace("seven", "eight"));
  assert.equal(lex.yjsLoads, 0, "alone: no copy, no Yjs");
  const anna = tab(room);
  await until(() => anna.text === lex.text && anna.text.includes("eight"), "Anna caught up");
  assert.equal(times(anna.text, "eight"), 1);
  anna.stop(); lex.stop();
});

test("a tab's presence is read for at most 16 agents' carets, and entries that are not carets are left out (am-25)", async () => {
  const room = fakeRoom();
  const shares = new Map<string, CaretShare>();
  const drawn = (who: string) => (share: CaretShare) => { shares.set(who, share); return () => { shares.delete(who); }; };
  const anna = tab(room, base, { carets: drawn("anna") }), lex = tab(room, base, { carets: drawn("lex") });
  await until(() => shares.size === 2 && anna.text === lex.text, "carets drawn");
  await quiet();
  shares.get("anna")!.own(() => ({ anchor: 4, head: 4 }));
  await until(() => shares.get("lex")!.carets().length === 1, "Anna's caret");
  const said = [...room.members].find(member => anna.sockets.includes(member.id))!.state as { caret: JsonValue };
  const sam = room.open({ repo: scope.repo, branch: scope.branch, file: path, onMessage: () => undefined });
  await quiet();
  const many = Array.from({ length: 20 }, (_, index) => ({ author: 100 + index, name: `Agent ${index}`, caret: said.caret }));
  sam.setPresence({ author: 9, name: "Sam", caret: null, agents: [5, null, "agent", { author: 50, name: 7, caret: said.caret }, ...many] as JsonValue });
  await quiet();
  const agents = shares.get("lex")!.carets().filter(caret => caret.agent !== undefined);
  assert.ok(agents.length <= 16, `${agents.length} agents' carets`);
  assert.ok(agents.every(caret => caret.author >= 100 && caret.name.startsWith("Agent ")), "only well-formed entries");
  assert.equal(agents.length, 12, "the first 16 entries, 4 of them not carets");
  // A list that is not a list says nothing.
  sam.setPresence({ author: 9, name: "Sam", caret: null, agents: { author: 1 } as JsonValue });
  await quiet();
  assert.deepEqual(shares.get("lex")!.carets().map(caret => caret.name), ["lex"]);
  sam.close();
  anna.stop(); lex.stop();
});

/** Who `tab` would name in a commit saving the file, as `account`. */
const named = async (who: ReturnType<typeof tab>, account = who.scope.account) =>
  (await who.authors.collect([{ key: draftKey(who.scope, path), baseSha: sha }], account)).authors;
const byName = (authors: { name: string }[]) => [...authors].sort((a, b) => a.name.localeCompare(b.name));

test("saving names everyone whose changes the file carries: another person and an agent, in one commit", async () => {
  const room = fakeRoom();
  const anna = tab(room, base, { account: "anna" });
  const lex = tab(room);
  await until(() => anna.yjsLoads === 1 && lex.yjsLoads === 1, "both sharing");
  await quiet();
  anna.type(4, "Warm ");
  // An agent's change, written into Anna's drafts (ticket am-25), joins the copy as the agent's.
  const agent: LiveAuthor = { grant: "grant-1", name: "Claude Code" };
  writeAs(agent, () => anna.store.edit({ scope: anna.scope, path, changes: [{ start: base.indexOf("seven"), end: base.indexOf("seven"), text: "half past " }] }));
  lex.type(0, "<!-- Lex -->");
  await until(() => lex.text.includes("Warm") && lex.text.includes("half past") && anna.text === lex.text, "every change on both");
  // A name is noted once presence says it, which may come after the text: wait on both tabs.
  for (let tries = 0; ((await named(lex)).length < 2 || (await named(anna)).length < 2) && tries < 500; tries++) await new Promise(resolve => setTimeout(resolve, 2));
  const lexNames = await named(lex);
  assert.deepEqual(byName(lexNames), [{ name: "anna" }, { name: "Claude Code", agent: true }]);
  // The one saving is the commit's author, not named again.
  assert.deepEqual(byName(await named(anna)), [{ name: "Claude Code", agent: true }, { name: "lex" }]);
  const names = lexNames.map(author => `${author.name}${author.agent ? " (agent)" : ""}`);
  assert.equal(commitMessage("Update index.html with Native Site Editor", lexNames),
    `Update index.html with Native Site Editor\n\nChanges by ${names[0]} and ${names[1]}.`);
  anna.stop(); lex.stop();
});

test("a catch-up repeating text this copy holds names no one again: after a save, a joiner brings no old names back", async () => {
  const room = fakeRoom();
  const anna = tab(room, base, { account: "anna" });
  const lex = tab(room);
  await until(() => anna.yjsLoads === 1 && lex.yjsLoads === 1, "both sharing");
  await quiet();
  anna.type(4, "Warm ");
  await until(() => lex.text.includes("Warm"), "Anna's change on Lex's tab");
  for (let tries = 0; !(await named(lex)).length && tries < 500; tries++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.deepEqual(await named(lex), [{ name: "anna" }]);
  // Lex saves: Anna's change is in that commit.
  const { sent } = await lex.authors.collect([{ key: draftKey(lex.scope, path), baseSha: sha }], "lex");
  lex.authors.settle(sent, new Map());
  assert.deepEqual(await named(lex), []);
  // Sam joins: every tab answers his request, and those answers reach Lex's tab too, with all the copy's text.
  const sam = tab(room, base, { account: "sam" });
  await until(() => sam.text === lex.text, "Sam caught up");
  await quiet();
  assert.deepEqual(await named(lex), [], "Anna added nothing since");
  anna.type(0, "<!-- again -->");
  await until(() => lex.text.startsWith("<!-- again -->"), "Anna's next change");
  for (let tries = 0; !(await named(lex)).length && tries < 500; tries++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.deepEqual(await named(lex), [{ name: "anna" }], "her new change names her again");
  anna.stop(); lex.stop(); sam.stop();
});

test("an agent writing into this tab's drafts is named for the commit even with live sharing off, a deletion too; a file back to its saved text names no one", async () => {
  const store = createDraftStore();
  store.open(scope, path, { text: base, baseSha: sha });
  const key = draftKey(scope, path), authors = createSaveAuthors();
  const names = async (baseSha: string | null = sha, at = key) => (await authors.collect([{ key: at, baseSha }], "lex")).authors;
  const stop = startLiveText({ store, openFile: signal<string | undefined>(path), scope: () => scope, on: false, authors });
  store.edit({ scope, path, changes: [{ start: 0, end: 0, text: "<!-- mine -->" }] });
  assert.deepEqual(await names(), [], "this tab's own change names no one");
  writeAs({ grant: "g", name: "Codex" }, () => store.edit({ scope, path, changes: [{ start: 0, end: 0, text: "<!-- agent -->" }] }));
  assert.deepEqual(await names(), [{ name: "Codex", agent: true }]);
  // Undo back to GitHub's text: nothing of theirs is left to save.
  store.edit({ scope, path, text: base });
  assert.deepEqual(await names(), [], "back to the saved text");
  // An agent deleting a file (a receipt step) is named for that deletion.
  const other = "about.html";
  store.open(scope, other, { text: "<p>About</p>", baseSha: "b".repeat(40) });
  const deleted = writeAs({ grant: "g", name: "Codex" }, () => store.applyReceipt(draftKey(scope, other), "Delete about.html",
    [{ scope, path: other, after: { text: "<p>About</p>", base: "<p>About</p>", baseSha: "b".repeat(40), flags: { deleted: true } } }]));
  assert.equal(deleted.ok, true);
  assert.deepEqual(await names("b".repeat(40), draftKey(scope, other)), [{ name: "Codex", agent: true }]);
  stop();
  writeAs({ grant: "g", name: "Later" }, () => store.edit({ scope, path, changes: [{ start: 0, end: 0, text: "x" }] }));
  assert.deepEqual(await names(), [], "stopped: nothing more is noted");
});

test("someone whose only change is a deletion is named: a deletion adds no text of its own", async () => {
  const room = fakeRoom();
  const anna = tab(room, base, { account: "anna" });
  const lex = tab(room);
  await until(() => anna.yjsLoads === 1 && lex.yjsLoads === 1, "both sharing");
  await quiet();
  const gone = "<p>Open at seven.</p>\n";
  anna.type(base.indexOf(gone), "", gone.length);
  await until(() => !lex.text.includes("Open at seven"), "Anna's deletion on Lex's tab");
  for (let tries = 0; !(await named(lex)).length && tries < 500; tries++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.deepEqual(await named(lex), [{ name: "anna" }]);
  anna.stop(); lex.stop();
});

// GitHub pushes reach open tabs (ticket am-32): the open file's room hears the relay's notice and hands it on with the
// file's draft scope, alone in the room or not; once the file is closed its room is gone and hears nothing more.
test("the open file's room hands a push notice on with the draft scope", async () => {
  const room = fakeRoom(), heard: [DraftScope, string][] = [];
  const store = createDraftStore({});
  store.open(scope, path, { text: base, baseSha: sha });
  const openFile = signal<string | undefined>(path);
  let options: LiveRoomOptions | undefined;
  const stop = startLiveText({
    store, openFile, scope: () => scope, on: true, keeper: keeper(), onPushed: (at, commit) => heard.push([at, commit]),
    openRoom: roomOptions => { options = roomOptions; return room.open(roomOptions); },
  });
  await until(() => options !== undefined, "the open file's room");
  options!.onPushed?.("d".repeat(40));
  assert.deepEqual(heard, [[scope, "d".repeat(40)]]);
  stop();
});

test("a tab back on a page with what it typed while away puts back only its own words, wherever others changed the text between them", async () => {
  const room = fakeRoom();
  const anna = tab(room), lex = tab(room);
  await until(() => anna.yjsLoads + lex.yjsLoads === 2, "the copy");
  await quiet();
  anna.openFile.value = "about.html";
  await quiet();
  // Anna's draft changes at the top and at the end while she is on another page (an agent writing into it, say).
  anna.type(0, "<!-- top -->\n");
  anna.type(anna.text.length, "<!-- end -->\n");
  // Meanwhile Lex removes a word in between and types one.
  lex.type(lex.text.indexOf("seven"), "", "seven".length);
  lex.type(lex.text.indexOf("Fresh"), "Warm ");
  anna.openFile.value = path;
  await until(() => anna.text === lex.text && lex.text.includes("top") && lex.text.includes("end"), "Anna back, both on one text");
  assert.equal(lex.text, "<!-- top -->\n<h1>Warm Fresh bread</h1>\n<p>Open at .</p>\n<!-- end -->\n");
  anna.stop(); lex.stop();
});

test("a joiner's unsaved changes in two places go in word by word: what someone typed between them stays, once", async () => {
  const room = fakeRoom();
  const anna = tab(room);
  await quiet();
  anna.type(base.indexOf("seven"), "half past ");
  const lex = tab(room, `<!-- Lex -->\n${base}<p>Closed Mondays.</p>\n`);
  await until(() => anna.text === lex.text && lex.text.includes("Mondays") && lex.text.includes("half past"), "both on one text");
  assert.equal(lex.text, "<!-- Lex -->\n<h1>Fresh bread</h1>\n<p>Open at half past seven.</p>\n<p>Closed Mondays.</p>\n");
  anna.stop(); lex.stop();
});

test("a page whose room never answers counts as shared only for the catch-up wait, so outside changes fold in again", () => {
  const time = fakeTimers(), store = createDraftStore();
  store.open(scope, path, { text: base, baseSha: sha });
  let room: LiveRoomOptions | undefined;
  const stop = startLiveText({ store, openFile: signal<string | undefined>(path), scope: () => scope, on: true, clock: time.clock, keeper: keeper(),
    openRoom: options => { room = options; return { send: async () => false, close: () => undefined }; }, loadYjs: () => import("yjs") });
  const key = draftKey(scope, path);
  assert.equal(liveState(store, key).shared, true, "the room has not said who is here yet");
  time.advance(LIVE_TEXT_CATCH_UP_MS);
  assert.equal(liveState(store, key).shared, false, "no answer: not shared");
  // A slow room that answers later, with someone else in it: shared again.
  room!.onMembers?.(new Map([["2", "editor"]]));
  assert.equal(liveState(store, key).shared, true, "someone else is here after all");
  stop();
});

test("liveState(…).shared: a file is shared in a live room only while another tab is in, or its copy is made, and never after it stops", async () => {
  const room = fakeRoom();
  const lex = tab(room);
  const key = draftKey(scope, path);
  // Until the room says who is here, the page may be shared: an outside change loads the branch again rather than fold in.
  assert.equal(liveState(lex.store, key).shared, true, "before the room answers");
  await quiet();
  assert.equal(liveState(lex.store, key).shared, false, "alone, nobody shares it");
  const anna = tab(room, base, { account: "anna" });
  await until(() => anna.yjsLoads === 1 && lex.yjsLoads === 1, "both sharing");
  assert.equal(liveState(lex.store, key).shared, true);
  anna.stop();
  await quiet();
  assert.equal(liveState(lex.store, key).shared, true, "the copy stays while the file is open");
  lex.stop();
  assert.equal(liveState(lex.store, key).shared, false);
  assert.equal(liveState(lex.store, "another").shared, false);
});
