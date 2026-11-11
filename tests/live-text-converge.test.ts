// Typing together, played at random (sweep 2026-11-10 item 1): several tabs and agents share one file
// (src/live-text.ts) and join, type, leave, reload, save, drop their connection and fold in outside changes in an
// order a seed picks. Every run must end with the open tabs of each file version on one text, where no word is doubled
// and none that was typed (and not deleted since) is lost: not on any tab, nor from the GitHub text a tab started from.
// Copies of two file versions never mix (src/live-text.ts, frames): a tab that loads the branch again after a save keeps
// its draft over the older version, and a tab opening the page later starts from the newer one, so they stay apart until
// the draft is kept over the newer version. Bringing them together is a ticket of its own (am-59, folding into a live
// room); here tabs are compared per version. A failing run names its seed:
// `LIVE_SEED=<seed> npx tsx --test tests/live-text-converge.test.ts` plays only that one, step by step in the message;
// `LIVE_SEEDS` and `LIVE_STEPS` play more or longer runs, `LIVE_SKIP=save,outside` leaves steps out.
//
// Everything runs on one deterministic schedule: the relay is a queue per receiver (one socket each, so frames
// and member notices reach a tab in the order the relay took them), the clock is fake, Yjs is loaded once and the
// starting-text digest answers without the thread pool, so a seed always plays the same way.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { signal } from "@preact/signals-core";
import * as Y from "yjs";
import { createDraftStore } from "../src/draft-store";
import { draftKey, type DraftScope } from "../src/drafts";
import { liveShared, startLiveText, type CopyKeeper, type KeptCopy, type LiveTextPorts } from "../src/live-text";
import { writeAs } from "../src/live-author";
import { foldFile } from "../src/outside-merge";
import { createSaveAuthors } from "../src/save-authors";
import type { LiveClock, LivePeer, LiveRoomOptions } from "../src/live-room";
import type { JsonValue } from "../shared/agent-command";
import type { LiveAccess } from "../shared/live-room";

const scope: DraftScope = { account: "lex", repoId: 501, repo: "lex/starter", branch: "main" };
const path = "index.html";
const START = "<h1>Fresh bread</h1>\n<p>Open at seven.</p>\n";
const shaOf = (text: string) => createHash("sha1").update(`blob\n${text}`).digest("hex");

/** A small fast generator (mulberry32): the same seed, the same run. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]! };
}

/** The fake clock: timers run only when the run moves time on. */
function fakeClock() {
  let now = 0, id = 0;
  const timers = new Map<number, { at: number; run(): void }>();
  const clock: LiveClock = {
    now: () => now,
    setTimeout(run, delay) { timers.set(++id, { at: now + delay, run }); return id; },
    clearTimeout(timer) { timers.delete(timer as number); },
  };
  return {
    clock, timers,
    /** Moves time on by `ms`, running each timer due on the way in order. */
    advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].run();
      }
      now = until;
    },
  };
}

/**
 * The relay: one queue per socket. A send is taken at once and put on every other member's queue; joins, leaves
 * and presence go on the queues the same way, so each socket hears them in the relay's order. `deliver` hands the
 * next item of one queue over. A dropped socket sends and hears nothing; the relay may or may not notice it left.
 */
function relay() {
  type Item = (() => void) & { what: string };
  const item = (what: string, run: () => void): Item => Object.assign(run, { what });
  /** `tag`: the starting-text tag of the last frame it sent (src/live-text.ts frames), which names the file version its copy is on. */
  type Member = { id: string; options: LiveRoomOptions; access: LiveAccess; queue: Item[]; dropped: boolean; seen: boolean; state?: JsonValue; closed: boolean; tag?: string };
  const members: Member[] = [];
  let next = 0;
  const present = () => members.filter(member => !member.closed && member.seen);
  const others = (me: Member) => new Map(present().filter(other => other !== me).map(other => [other.id, other.access]));
  const peers = (me: Member) => new Map<string, LivePeer>(present().filter(other => other !== me && other.state !== undefined)
    .map(other => [other.id, { access: other.access, state: other.state! }]));
  /** Who is here and what they said, as the relay knows it now (not when the notice is read). */
  const notice = (to: Member, key = false) => {
    const now = others(to), said = peers(to);
    to.queue.push(item(`members [${[...now.keys()].join(",")}]${key ? " and the key" : ""}`, () => { to.options.onMembers?.(now); to.options.onPeers?.(said); if (key) to.options.onKey?.(); }));
  };
  const tellMembers = (except?: Member) => { for (const other of present()) if (other !== except && !other.dropped) notice(other); };
  const tellPeers = (except: Member) => {
    for (const other of present()) if (other !== except && !other.dropped) { const said = peers(other); other.queue.push(item("presence", () => other.options.onPeers?.(said))); }
  };
  return {
    members,
    open(options: LiveRoomOptions, access: LiveAccess = "editor") {
      const me: Member = { id: String(++next), options, access, queue: [], dropped: false, seen: true, closed: false };
      members.push(me);
      notice(me, true);
      tellMembers(me);
      return {
        me,
        send(bytes: Uint8Array) {
          if (me.closed || me.dropped) return Promise.resolve(false);
          const copy = Uint8Array.from(bytes);
          me.tag = Buffer.from(copy.subarray(2, 22)).toString("hex");
          for (const other of present()) if (other !== me && !other.dropped) other.queue.push(item(`${["", "HELLO", "ASK", "REPLY", "UPDATE"][copy[0]!]}${copy[1] ? "" : " (not caught up)"} from ${me.id}`, () => other.options.onMessage(copy, { peer: me.id, access })));
          return Promise.resolve(true);
        },
        close() {
          if (me.closed) return;
          me.closed = true;
          me.queue.length = 0;
          tellMembers(me);
        },
        setPresence(state: JsonValue) {
          if (me.closed || me.dropped) return;
          me.state = state;
          tellPeers(me);
        },
      } satisfies ReturnType<NonNullable<LiveTextPorts["openRoom"]>> & { me: Member };
    },
    /** The socket drops: what was on its way to it is lost; `noticed`: the relay tells the others it left. */
    drop(member: Member, noticed: boolean) {
      member.dropped = true;
      member.queue.length = 0;
      if (noticed) { member.seen = false; tellMembers(member); }
    },
    /** It is back: it hears who is here and holds the key again, and the others hear it joined (if they heard it leave). */
    reconnect(member: Member) {
      if (member.closed) return;
      member.dropped = false;
      const rejoined = !member.seen;
      member.seen = true;
      notice(member, true);
      if (rejoined) tellMembers(member);
    },
    pending: () => members.filter(member => !member.closed && member.queue.length > 0),
  };
}

/** One browser's kept copies: a reload of a tab passes the same one again. */
function keeper(): CopyKeeper & { copies: Map<string, KeptCopy | undefined> } {
  const copies = new Map<string, KeptCopy | undefined>();
  return { copies, read: async key => copies.get(key), write: (key, copy) => { copies.set(key, copy); } };
}

/** Lets every promise the last step started settle: nothing in a run waits on anything but microtasks. */
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };

type Room = ReturnType<typeof relay>;
type Github = { text: string; sha: string };

/** A tab: its own draft store with the file open (GitHub's text, and a draft over it), sharing it live. */
function openTab(room: Room, time: ReturnType<typeof fakeClock>, name: string, browser: ReturnType<typeof keeper>, from: { base: string; sha: string; text: string }) {
  const store = createDraftStore();
  store.open(scope, path, { text: from.base, baseSha: from.sha });
  if (from.text !== from.base) store.edit({ scope, path, text: from.text, label: "Earlier draft" });
  const openFile = signal<string | undefined>(path);
  let socket: ReturnType<Room["open"]> | undefined;
  const stop = startLiveText({
    store, openFile, scope: () => scope, on: true, clock: time.clock, keeper: browser, authors: createSaveAuthors(),
    openRoom: options => (socket = room.open(options)),
    loadYjs: async () => Y,
  });
  return {
    name, store, openFile, stop, browser,
    get socket() { return socket; },
    get text() { return store.text(scope, path)!; },
    get file() { return store.get(scope, path)!; },
    /** Typed into the open file; false when the store refused it. */
    edit(start: number, end: number, text: string) { return store.edit({ scope, path, changes: [{ start, end, text }] }).ok; },
  };
}
type Tab = ReturnType<typeof openTab>;

/** A word typed: unique. It is typed with a space after it, so a merge by words (src/text-merge.ts) never takes two as one;
 * where that space ends up is not checked. */
const WORD = /«\d+»/g;
/** Where a word can go without splitting another: the very start or end, after a line, or after a word. */
function gaps(text: string) {
  const out = [0, text.length];
  for (let at = 0; at < text.length; at++) if (text[at] === "\n" || text[at] === " " && text[at - 1] === "»") out.push(at + 1);
  return out;
}

/**
 * One seeded run: `length` random steps, then everyone settles (every queue delivered, every timer run, every
 * connection back). Returns what the end must satisfy, and the log of steps.
 */
async function play(seed: number, length: number, skip: ReadonlySet<string> = new Set()) {
  const pick = random(seed), time = fakeClock(), room = relay();
  const log: string[] = [];
  const say = (line: string) => { log.push(line); };
  let github: Github = { text: START, sha: shaOf(START) };
  let words = 0, browsers = 0;
  /** Every word typed, by whom, and the words someone deleted (or that a fold may have dropped): those may be gone. */
  const typed = new Map<string, string>(), gone = new Set<string>();
  /** Each browser's tab, open or closed (its draft is what it shows on coming back). */
  type Entry = { tab: Tab; open: boolean };
  const tabs: Entry[] = [];
  const open = () => tabs.filter(entry => entry.open).map(entry => entry.tab);
  const word = (by: string) => { const made = `«${++words}»`; typed.set(made, by); return made; };

  const join = (draft: boolean) => {
    const name = `t${++browsers}`, extra = draft ? `<p>${word(name)}</p>\n` : "";
    const tab = openTab(room, time, name, keeper(), { base: github.text, sha: github.sha, text: github.text + extra });
    tabs.push({ tab, open: true });
    say(`${name} joins${draft ? ` with a draft ${extra.trim()}` : ""}`);
  };
  const type = (tab: Tab, agent?: string) => {
    const text = tab.text, present = text.match(WORD) ?? [];
    if (present.length && pick.next() < 0.3) {
      const target = pick.pick(present), at = text.indexOf(target), end = at + target.length + (text[at + target.length] === " " ? 1 : 0);
      const run = () => tab.edit(at, end, "");
      if (agent ? writeAs({ grant: agent, name: agent }, run) : run()) { gone.add(target); say(`${agent ?? tab.name} deletes ${target}`); }
      return;
    }
    const at = pick.pick(gaps(text)), made = word(agent ?? tab.name);
    const run = () => tab.edit(at, at, `${made} `);
    if (agent ? writeAs({ grant: agent, name: agent }, run) : run()) say(`${agent ? `${agent} (in ${tab.name})` : tab.name} types ${made} at ${at}`);
    else typed.delete(made);
  };
  const leave = (entry: Entry) => { entry.tab.stop(); entry.open = false; say(`${entry.tab.name} closes the page`); };
  /** The same browser opens the page again: GitHub's text as its store had it, its draft as it left it, its kept copy. */
  const reopen = (entry: Entry, reload: boolean) => {
    const was = entry.tab, file = was.file;
    if (entry.open) was.stop();
    entry.tab = openTab(room, time, was.name, was.browser, { base: file.base, sha: file.baseSha!, text: was.text });
    entry.open = true;
    say(`${was.name} ${reload ? "reloads" : "opens the page again"}`);
  };
  const away = (tab: Tab) => { tab.openFile.value = "about.html"; say(`${tab.name} opens another page`); };
  const back = (tab: Tab) => { tab.openFile.value = path; say(`${tab.name} comes back to the page`); };
  /** A commit on the branch (this tab's save, or one made outside): every other open tab hears of it. A tab sharing the
   * page live loads the branch again (src/outside-merge.ts `foldIn` refuses the fold): the open file opens again, its draft
   * kept over the version it started from (src/workspace-boot.ts `loadSnapshot`). A tab that is not folds it into its draft. */
  const commit = (next: Github, by?: Tab) => {
    const was = github;
    github = next;
    for (const tab of open()) {
      if (tab === by || tab.openFile.peek() !== path) continue;
      if (liveShared(tab.store, tab.file.key)) {
        tab.openFile.value = undefined;
        tab.openFile.value = path;
        say(`  ${tab.name} loads the branch again`);
        continue;
      }
      if (tab.file.baseSha !== was.sha) continue;
      // A fold may drop a word on a clash (the latest version shows): no word typed is expected to survive one.
      const before = new Set(tab.text.match(WORD) ?? []);
      foldFile(tab.store, scope, path, undefined, next.text, next.sha, () => draftKey(scope, path), "Sam · GitHub");
      for (const lost of before) if (!tab.text.includes(lost)) gone.add(lost);
    }
  };
  const save = (tab: Tab) => {
    const text = tab.text, sha = shaOf(text);
    if (tab.openFile.peek() !== path || sha === github.sha || tab.file.baseSha !== github.sha) return;
    tab.store.markSaved(scope, path, { baseSha: sha, original: text });
    say(`${tab.name} saves`);
    commit({ text, sha }, tab);
  };
  const outside = () => {
    const at = pick.pick(gaps(github.text)), made = word("github");
    const text = `${github.text.slice(0, at)}${made} ${github.text.slice(at)}`;
    say(`a commit made outside adds ${made} at ${at}`);
    commit({ text, sha: shaOf(text) });
  };

  /** The steps a run picks from: name, weight, when it can run, what it does. */
  const steps: [string, number, (live: Tab[]) => boolean, (live: Tab[], entryOf: (tab: Tab) => Entry) => void][] = [
    ["deliver", 30, () => room.pending().length > 0, () => { const member = pick.pick(room.pending()); say(`  socket ${member.id} hears ${member.queue[0]!.what}`); member.queue.shift()!(); }],
    ["type", 22, live => live.length > 0, live => type(pick.pick(live))],
    ["agent", 4, live => live.length > 0, live => type(pick.pick(live), pick.pick(["agent-a", "agent-b"]))],
    ["join", 6, () => tabs.length < 5, () => join(pick.next() < 0.4)],
    ["leave", 4, live => live.length > 0, (live, entryOf) => leave(entryOf(pick.pick(live)))],
    ["reopen", 4, () => tabs.some(entry => !entry.open), () => reopen(pick.pick(tabs.filter(entry => !entry.open)), false)],
    ["reload", 4, live => live.length > 0, (live, entryOf) => reopen(entryOf(pick.pick(live)), true)],
    ["away", 3, live => live.length > 0, live => { const tab = pick.pick(live); if (tab.openFile.peek() === path) away(tab); else back(tab); }],
    ["save", 3, live => live.length > 0, live => save(pick.pick(live))],
    ["outside", 2, () => true, () => outside()],
    ["drop", 3, live => live.length > 0, live => {
      const socket = pick.pick(live).socket?.me, member = room.members.find(item => item === socket);
      if (!member || member.closed) return;
      if (member.dropped) { room.reconnect(member); say(`socket ${member.id} is back`); return; }
      const noticed = pick.next() < 0.5;
      room.drop(member, noticed);
      say(`socket ${member.id} drops${noticed ? " (the relay notices)" : ""}`);
    }],
    ["time", 15, () => true, () => { const ms = pick.pick([50, 200, 1_000, 5_000]); say(`  ${ms} ms pass`); time.advance(ms); }],
  ];

  const subtle = crypto.subtle;
  Object.defineProperty(subtle, "digest", { configurable: true, value: async (_: AlgorithmIdentifier, data: BufferSource) =>
    new Uint8Array(createHash("sha256").update(data as Uint8Array).digest()).buffer });
  try {
    join(pick.next() < 0.5);
    await settle();
    for (let step = 0; step < length; step++) {
      const live = open(), entryOf = (tab: Tab) => tabs.find(entry => entry.tab === tab)!;
      const choices = steps.filter(([name, , can]) => !skip.has(name) && can(live));
      let roll = pick.next() * choices.reduce((sum, [, weight]) => sum + weight, 0);
      const [, , , run] = choices.find(([, weight]) => (roll -= weight) < 0) ?? choices.at(-1)!;
      run(live, entryOf);
      await settle();
    }
    // Settle: every page back on the file, every connection back, every queue delivered, every timer run.
    say("— everyone settles —");
    for (const tab of open()) if (tab.openFile.peek() !== path) back(tab);
    // Everyone who closed the page comes back to it, with the draft it kept: their unsaved words count too.
    for (const entry of tabs) if (!entry.open) { reopen(entry, false); await settle(); }
    await settle();
    for (let round = 0; round < 400; round++) {
      for (const member of room.members) if (member.dropped && !member.closed) room.reconnect(member);
      const pending = room.pending();
      if (pending.length) { for (const member of pending) member.queue.shift()!(); await settle(); continue; }
      if (time.timers.size) { time.advance(5_000); await settle(); continue; }
      break;
    }
    // The file version each tab's copy is on: a copy keeps the version it started from, even once its tab saved (a known
    // limit, src/live-text.ts `load`), and copies of two versions never mix by design. Tabs are compared per version.
    const version = (tab: Tab) => room.members.find(member => member === tab.socket?.me)?.tag ?? tab.file.baseSha!;
    return { log, tabs: open().map(tab => ({ name: tab.name, text: tab.text, base: tab.file.base, version: version(tab) })), typed, gone, github };
  } finally {
    for (const tab of open()) tab.stop();
    Reflect.deleteProperty(subtle, "digest");
  }
}

/** What every run must end with; undefined when it does. */
function fault(end: Awaited<ReturnType<typeof play>>) {
  const versions = new Map<string, typeof end.tabs>();
  for (const tab of end.tabs) versions.set(tab.version, [...versions.get(tab.version) ?? [], tab]);
  for (const [version, tabs] of versions) if (new Set(tabs.map(tab => tab.text)).size > 1)
    return `the tabs on ${version.slice(0, 7)} differ:\n${tabs.map(tab => `  ${tab.name}: ${JSON.stringify(tab.text)}`).join("\n")}`;
  const seen = new Set<string>();
  for (const { name, text } of end.tabs) {
    const counts = new Map<string, number>();
    for (const made of text.match(WORD) ?? []) { counts.set(made, (counts.get(made) ?? 0) + 1); seen.add(made); }
    const doubled = [...counts].filter(([, count]) => count > 1).map(([made]) => made);
    if (doubled.length) return `doubled at ${name}: ${doubled.join(" ")} in ${JSON.stringify(text)}`;
    if ((text.match(/[«»]/g) ?? []).length !== 2 * [...counts.values()].reduce((sum, count) => sum + count, 0)) return `a word cut apart at ${name}: ${JSON.stringify(text)}`;
  }
  // Words typed (by a tab or an agent) and never deleted: each is on some tab. An outside commit's word is on every tab whose
  // GitHub text holds it (one that loaded the branch again keeps its draft over the older version, without it).
  const lost = [...end.typed.keys()].filter(made => !end.gone.has(made) && !seen.has(made) && end.typed.get(made) !== "github");
  if (lost.length) return `lost: ${lost.map(made => `${made} (${end.typed.get(made)})`).join(" ")} in ${JSON.stringify(end.tabs.map(tab => tab.text))}`;
  for (const { name, text, base } of end.tabs) {
    const dropped = (base.match(WORD) ?? []).filter(made => !end.gone.has(made) && !text.includes(made));
    if (dropped.length) return `lost at ${name}: ${dropped.join(" ")} of its GitHub text, in ${JSON.stringify(text)}`;
  }
  return undefined;
}

const SEEDS = Number(process.env.LIVE_SEEDS ?? 150), STEPS = Number(process.env.LIVE_STEPS ?? 60);
/** Seeds past the first SEEDS that once failed, played every time: a commit landing on a tab still joining the room. */
const FOUND = [819, 1370, 1722];
/** Steps left out of every run (`LIVE_SKIP=save,outside`), to narrow down what a failing seed needs. */
const SKIP = new Set((process.env.LIVE_SKIP ?? "").split(",").filter(Boolean));

test("typing together, in seeded random order: every run ends with the tabs of each file version on one text, nothing doubled or lost", async () => {
  const only = process.env.LIVE_SEED === undefined ? undefined : Number(process.env.LIVE_SEED);
  const seeds = only === undefined ? [...Array.from({ length: SEEDS }, (_, index) => index + 1), ...FOUND.filter(seed => seed > SEEDS)] : [only];
  const failed: string[] = [];
  // A tab's changes carry its Yjs client id, which carets and the name-tag Undo name: Yjs giving a copy a new one (it says
  // so on the console) breaks that, so it fails the run too.
  const print = console.log;
  let renamed = 0;
  console.log = (...args: unknown[]) => { if (String(args[0]).includes("Changed the client-id")) renamed++; else print(...args); };
  try {
    for (const seed of seeds) {
      renamed = 0;
      const end = await play(seed, STEPS, SKIP);
      const wrong = fault(end) ?? (renamed ? `Yjs gave a copy a new client id ${renamed} times` : undefined);
      if (wrong) failed.push(only === undefined ? `seed ${seed}: ${wrong.split("\n")[0]}` : `seed ${seed}: ${wrong}\n${end.log.join("\n")}`);
    }
  } finally { console.log = print; }
  assert.deepEqual(failed, [], `failing seeds (rerun one with LIVE_SEED=<seed>):\n${failed.join("\n")}`);
});
