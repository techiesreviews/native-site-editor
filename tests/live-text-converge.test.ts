// Typing together, played at random (sweep 2026-11-10 item 1; ticket am-59): several tabs and agents share one file
// (src/live-text.ts) and join, type, leave, reload, save, drop their connection and hear commits (a save of one of them,
// or one made outside) in an order a seed picks. Each tab hears a commit at a moment of its own: the push notice is one
// more item on its socket's queue, and a focus check reads GitHub's head whenever the run picks it. A tab sharing the
// page folds the commit into the room's one copy (src/live-text.ts `liveFold`); a save goes through the room
// (src/live-saves.ts `liveSaves.note`, set by src/live-text.ts). Every run must end with every open tab on one copy and one text, where no word is
// doubled and none that was typed (and not deleted since) is lost; every word of GitHub's text is there exactly once;
// a word gone in a clash (the latest version shows) is one its own tab's Undo brings back. A failing run names its seed:
// `LIVE_SEED=<seed> npx tsx --test tests/live-text-converge.test.ts` plays only that one, step by step in the message;
// `LIVE_SEEDS` and `LIVE_STEPS` play more or longer runs, `LIVE_SKIP=save,outside` leaves steps out.
//
// Everything runs on one deterministic schedule: the relay is a queue per receiver (one socket each, so frames
// and member notices reach a tab in the order the relay took them), the clock is fake, Yjs is loaded once (each share gets ids of its own) and the
// starting-text digest answers without the thread pool and random bytes come from the seed, so a seed always plays the same way.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { signal } from "@preact/signals-core";
import * as Y from "yjs";
import { createDraftStore } from "../src/draft-store";
import { draftKey, type DraftScope } from "../src/drafts";
import { liveSaves } from "../src/live-saves";
import { liveFold, liveState, startLiveText, type CopyKeeper, type KeptCopy, type LiveTextPorts } from "../src/live-text";
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

/** A 32-bit FNV-1a hash of `text`. */
function fnv(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return hash >>> 0;
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
    /** A GitHub push: the relay tells every socket of the room, after whatever it took before (src/live-room.ts `onPushed`). */
    push(commit: string) {
      for (const other of present()) if (!other.dropped) other.queue.push(item(`the push of ${commit.slice(0, 7)}`, () => other.options.onPushed?.(commit)));
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
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

type Room = ReturnType<typeof relay>;
type Github = { text: string; sha: string; copies?: string[] };

/** A tab: its own draft store with the file open (GitHub's text, and a draft over it), sharing it live. `seen`: GitHub's
 * version of the file in the tab's workspace (what its last load or head check read; src/live-text.ts `github`, which
 * also reads GitHub's newest version and the version before each one); `heard` runs when a push notice reaches it. */
function openTab(room: Room, time: ReturnType<typeof fakeClock>, name: string, browser: ReturnType<typeof keeper>, from: { base: string; sha: string; text: string; seen: string },
  heard: (tab: Tab) => void, versions: ReadonlyMap<string, string>, newest: () => Github, before: (sha: string) => Github[], yjs: () => typeof Y) {
  const store = createDraftStore();
  store.open(scope, path, { text: from.base, baseSha: from.sha });
  if (from.text !== from.base) store.edit({ scope, path, text: from.text, label: "Earlier draft" });
  const openFile = signal<string | undefined>(path);
  let socket: ReturnType<Room["open"]> | undefined;
  const tab = {
    name, store, openFile, browser, seen: from.seen, stop: () => {},
    get socket() { return socket; },
    get text() { return store.text(scope, path)!; },
    get file() { return store.get(scope, path)!; },
    /** Typed into the open file; false when the store refused it. */
    edit(start: number, end: number, text: string) { return store.edit({ scope, path, changes: [{ start, end, text }] }).ok; },
  };
  tab.stop = startLiveText({
    store, openFile, scope: () => scope, on: true, clock: time.clock, keeper: browser, authors: createSaveAuthors(),
    openRoom: options => (socket = room.open(options)),
    loadYjs: async () => yjs(),
    github: () => ({ sha: tab.seen, text: versions.get(tab.seen)!, newest: async () => newest(), before: async function* (sha) { yield* before(sha); } }),
    onPushed: () => heard(tab),
  });
  return tab;
}
interface Tab {
  name: string; store: ReturnType<typeof createDraftStore>; openFile: ReturnType<typeof signal<string | undefined>>; browser: ReturnType<typeof keeper>;
  seen: string; stop(): void; readonly socket: ReturnType<Room["open"]> | undefined; readonly text: string;
  readonly file: NonNullable<ReturnType<ReturnType<typeof createDraftStore>["get"]>>; edit(start: number, end: number, text: string): boolean;
}

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
 * connection back, every tab on GitHub's newest version). Returns what the end must satisfy, and the log of steps.
 */
async function play(seed: number, length: number, skip: ReadonlySet<string> = new Set()) {
  const pick = random(seed), time = fakeClock(), room = relay();
  // Yjs client ids from the seed too (Yjs picks them at random), so a seed always plays the same way: each share of a
  // page (one Yjs load) draws from a stream of its own, named by its tab and how often that tab shared. One stream for
  // the whole run moved every later tab's id whenever the code made one scratch copy more or less (a version's text read
  // apart), and the same seed played another run.
  const shares = new Map<string, number>();
  const yjsFor = (name: string) => {
    const count = (shares.get(name) ?? 0) + 1;
    shares.set(name, count);
    const ids = random(seed ^ 0x5bd1e995 ^ fnv(`${name}/${count}`));
    class SeededDoc extends Y.Doc { constructor(options?: ConstructorParameters<typeof Y.Doc>[0]) { super(options); this.clientID = Math.floor(ids.next() * 2 ** 32) >>> 0; } }
    return { ...Y, Doc: SeededDoc } as typeof Y;
  };
  const log: string[] = [];
  const say = (line: string) => { log.push(line); };
  let github: Github = { text: START, sha: shaOf(START) };
  /** Every version of the file GitHub had, by blob sha. */
  const versions = new Map<string, string>([[github.sha, github.text]]);
  /** GitHub's history of the file, oldest first: the versions before one are those before its latest occurrence here. */
  const history = [github.sha], commits = new Map<string, Github>([[github.sha, github]]);
  const older = (sha: string) => history.slice(0, Math.max(history.lastIndexOf(sha), 0)).reverse().map(made => commits.get(made)!);
  let words = 0, browsers = 0;
  /** Every word typed, by whom, and the words someone deleted: those may be gone. */
  const typed = new Map<string, string>(), gone = new Set<string>();
  /** Words a tab took out in a clash (an outside change replaced the words around them), each with its tab's Undo step. */
  const settled = new Map<string, string>();
  /** Folds into a shared copy that did not take: each is a fault. */
  const failures: string[] = [];
  /** Each browser's tab, open or closed (its draft is what it shows on coming back). */
  type Entry = { tab: Tab; open: boolean };
  const tabs: Entry[] = [];
  const open = () => tabs.filter(entry => entry.open).map(entry => entry.tab);
  const word = (by: string) => { const made = `«${++words}»`; typed.set(made, by); return made; };

  /**
   * The tab checks GitHub's head (src/controllers/save-publish-controller.ts `checkHead`): it reads the newest commit,
   * whichever notice or focus asked. A page shared live folds it into the room's copy (src/outside-merge.ts `foldIn`); a
   * page not shared folds it into its draft. Either way its workspace sees the new version.
   */
  const hear = (tab: Tab, why: string) => {
    const was = tab.seen, next = github;
    if (was === next.sha || !open().includes(tab)) return;
    tab.seen = next.sha;
    if (tab.openFile.peek() !== path && tab.file.baseSha !== was) return;
    /** Alone, the commit folds into the draft; a clash shows the latest version, its words one Undo away in this tab. */
    const intoDraft = () => {
      const before = new Set(tab.text.match(WORD) ?? []);
      foldFile(tab.store, scope, path, undefined, next.text, next.sha, () => draftKey(scope, path), "Sam · GitHub");
      const out = [...before].filter(made => !tab.text.includes(made));
      for (const made of out) settled.set(made, tab.name);
      if (out.length) latest.set(tab.name, out);
    };
    if (liveState(tab.store, tab.file.key).shared) {
      say(`  ${tab.name} hears ${next.sha.slice(0, 7)} (${why}) and folds it into the room's copy`);
      void liveFold(tab.store, tab.file.key, { ...next, author: "Sam · GitHub" }).then(took => {
        say(`    ${tab.name}'s fold of ${next.sha.slice(0, 7)}: ${took === undefined ? "not shared" : took ? `taken, base ${tab.file.baseSha?.slice(0, 7)}` : "refused"}`);
        if (took === undefined && open().includes(tab) && tab.file.baseSha === was) intoDraft();
        // Refused (a save's note did not come in time, or the copy could not take it): the branch loads again, as
        // src/controllers/save-publish-controller.ts `checkHead` does, and the page comes back with its draft.
        else if (took === false) { const entry = tabs.find(item => item.tab === tab); if (entry?.open) reopen(entry, true); }
      }, error => failures.push(`${tab.name}: ${error}`));
      return;
    }
    say(`  ${tab.name} hears ${next.sha.slice(0, 7)} (${why}) and folds it into its draft`);
    intoDraft();
  };
  /** Words a tab's own clash step took out (src/live-text.ts: the latest version shows, the typist's words one Undo away). */
  const watch = (tab: Tab) => tab.store.subscribe(event => {
    if (event.type !== "text" || event.origin === "shared" || event.origin === "external") return;
    if (!tab.store.peek(draftKey(scope, path), "undo")?.endsWith("'s change")) return;
    const now = new Set(event.text.match(WORD) ?? []), out = [...watched.get(tab) ?? []].filter(made => !now.has(made));
    for (const made of out) settled.set(made, tab.name);
    latest.set(tab.name, out);
  });
  /** The words each tab's latest clash step took out: its Undo brings these back. */
  const latest = new Map<string, string[]>();
  /** Each tab's words before its latest change, for `watch`. */
  const watched = new Map<Tab, Set<string>>();
  const make = (name: string, browser: ReturnType<typeof keeper>, from: Parameters<typeof openTab>[4]) => {
    const tab = openTab(room, time, name, browser, from, pushed => hear(pushed, "push notice"), versions, () => github, older, () => yjsFor(name));
    const unwatch = watch(tab);
    const before = tab.store.subscribe(event => { if (event.type === "text") watched.set(tab, new Set(event.text.match(WORD) ?? [])); });
    const stop = tab.stop;
    tab.stop = () => { unwatch(); before(); stop(); };
    watched.set(tab, new Set(tab.text.match(WORD) ?? []));
    return tab;
  };

  const join = (draft: boolean) => {
    const name = `t${++browsers}`, extra = draft ? `<p>${word(name)}</p>\n` : "";
    const tab = make(name, keeper(), { base: github.text, sha: github.sha, text: github.text + extra, seen: github.sha });
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
  /** The same browser opens the page again, its draft kept over the version it started from (src/workspace-boot.ts
   * `loadSnapshot`) and its kept copy: on coming back to it, its workspace is on the version it last read (its next head
   * check reads GitHub's newest); on a reload, the page reads GitHub's newest version as it loads. */
  const reopen = (entry: Entry, reload: boolean) => {
    const was = entry.tab, file = was.file;
    if (entry.open) was.stop();
    entry.tab = make(was.name, was.browser, { base: file.base, sha: file.baseSha!, text: was.text, seen: reload ? github.sha : was.seen });
    entry.open = true;
    say(`${was.name} ${reload ? "reloads" : "opens the page again"}`);
  };
  const away = (tab: Tab) => { tab.openFile.value = "about.html"; say(`${tab.name} opens another page`); };
  const back = (tab: Tab) => { tab.openFile.value = path; say(`${tab.name} comes back to the page`); };
  /** A commit on the branch (this tab's save, or one made outside): the relay tells every socket, each in its turn. */
  const commit = (next: Github) => {
    github = next;
    versions.set(next.sha, next.text);
    commits.set(next.sha, next);
    history.push(next.sha);
    room.push(next.sha);
  };
  /** A tab saves its draft over GitHub's newest version (a save over an older one is refused): through the room, so the
   * others take the commit as the copy's own text. As the publish menu does, it first waits for a page just opened again
   * to catch up with the room (Lex's choice A), then reads its draft; a tab closed or moved on meanwhile saves nothing. */
  const save = (tab: Tab) => {
    const can = () => open().includes(tab) && tab.openFile.peek() === path && shaOf(tab.text) !== github.sha && tab.file.baseSha === github.sha && tab.seen === github.sha;
    if (!can()) return;
    const wait = liveSaves.ready!(scope, [path], tab.store);
    if (!wait) { saveNow(tab); return; }
    say(`${tab.name} saves: waits until the page caught up`);
    void wait.then(() => { if (can()) saveNow(tab); else say(`${tab.name}'s save is called off`); });
  };
  const saveNow = (tab: Tab) => {
    const text = tab.text, sha = shaOf(text);
    const copies = liveSaves.note!(scope, [{ path, content: text }], tab.store);
    tab.store.markSaved(scope, path, { baseSha: sha, original: text });
    tab.seen = sha;
    say(`${tab.name} saves ${sha.slice(0, 7)}${copies.length ? ` from copy ${copies[0].slice(0, 7)}` : ""}`);
    commit({ text, sha, ...(copies.length ? { copies } : {}) });
  };
  const outside = () => {
    const at = pick.pick(gaps(github.text)), made = word("github");
    const text = `${github.text.slice(0, at)}${made} ${github.text.slice(at)}`;
    say(`a commit made outside adds ${made} at ${at} (${shaOf(text).slice(0, 7)})`);
    commit({ text, sha: shaOf(text) });
  };
  /** An outside commit that replaces a word a tab may be typing around (a clash, when someone typed next to it). */
  const rewrite = () => {
    const present = github.text.match(WORD) ?? [];
    if (!present.length) { outside(); return; }
    const target = pick.pick(present), made = word("github");
    const text = github.text.replace(target, made);
    gone.add(target);
    say(`a commit made outside replaces ${target} with ${made} (${shaOf(text).slice(0, 7)})`);
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
    ["rewrite", 1, () => true, () => rewrite()],
    ["focus", 3, live => live.length > 0, live => hear(pick.pick(live), "focus")],
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
  // Random bytes from the seed too: an agent's Yjs client id is drawn from them (src/live-text.ts `agentAuthor`), and Yjs
  // orders two words put in at one place by client id, so a random one played the same seed differently now and then.
  const bytes = random(seed ^ 0x2545f491), randomValues = Object.getOwnPropertyDescriptor(crypto, "getRandomValues");
  Object.defineProperty(crypto, "getRandomValues", { configurable: true, writable: true, value: <T extends ArrayBufferView | null>(array: T) => {
    if (array) { const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength); for (let index = 0; index < view.length; index++) view[index] = bytes.int(256); }
    return array;
  } });
  /** Every queue delivered, every timer run, every connection back. */
  const quiet = async () => {
    for (let round = 0; round < 400; round++) {
      for (const member of room.members) if (member.dropped && !member.closed) room.reconnect(member);
      const pending = room.pending();
      if (pending.length) { for (const member of pending) member.queue.shift()!(); await settle(); continue; }
      if (time.timers.size) { time.advance(5_000); await settle(); continue; }
      break;
    }
  };
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
    await quiet();
    // Every tab checks GitHub's head once more (a focus), and the room settles again.
    for (const tab of open()) hear(tab, "focus");
    await settle();
    await quiet();
    const end = () => open().map(tab => ({ name: tab.name, text: tab.text, base: tab.file.baseSha!, copy: liveState(tab.store, tab.file.key).copy }));
    const before = end();
    for (const tab of open()) say(`${tab.name} on ${tab.file.baseSha?.slice(0, 7)}, copy ${liveState(tab.store, tab.file.key).copy?.slice(0, 7)}: ${liveState(tab.store, tab.file.key).versions
      .map(edge => `${edge.from.slice(0, 7) || "birth"}→${edge.to.slice(0, 7)}${edge.client === undefined ? " (save)" : ""}`).join(", ")}`);
    const settledBefore = new Set(settled.keys());
    // The Undo check: a tab whose latest step took words out in a clash takes it back, and its words are back everywhere.
    const undone: { tab: string; words: string[] }[] = [];
    for (const tab of open()) {
      if (!tab.store.peek(draftKey(scope, path), "undo")?.endsWith("'s change")) continue;
      const mine = (latest.get(tab.name) ?? []).filter(made => !tab.text.includes(made) && !gone.has(made));
      const label = tab.store.peek(draftKey(scope, path), "undo"), was = tab.text;
      const undid = await tab.store.undo(draftKey(scope, path));
      say(`${tab.name} undid ${label} from ${JSON.stringify(was)}`);
      if (!undid.ok) { say(`${tab.name} cannot undo the clash: ${undid.error}`); continue; }
      say(`${tab.name} undoes the clash, for ${mine.join(" ") || "nothing"}: ${JSON.stringify(tab.text)}`);
      undone.push({ tab: tab.name, words: mine.filter(made => !tab.text.includes(made)) });
      for (const made of mine) settled.delete(made);
      // One tab's Undo reaches the others before the next tab takes its own back.
      await settle();
      await quiet();
    }
    await quiet();
    return { log, tabs: before, after: end(), undone, typed, gone, settled: settledBefore, settledAfter: new Set(settled.keys()), github, failures };
  } finally {
    for (const tab of open()) tab.stop();
    Reflect.deleteProperty(subtle, "digest");
    if (randomValues) Object.defineProperty(crypto, "getRandomValues", randomValues); else Reflect.deleteProperty(crypto, "getRandomValues");
  }
}

/** What one end must satisfy; undefined when it does. `undone`: after the Undo check, where a clash's Undo brought the
 * tab's words back instead of GitHub's there (src/outside-merge.ts `foldFile`), so GitHub's words may be gone. */
function wrongAt(end: Awaited<ReturnType<typeof play>>, tabs: typeof end.tabs, undone = false) {
  const settled = undone ? end.settledAfter : end.settled;
  if (end.failures.length) return end.failures[0];
  if (new Set(tabs.map(tab => tab.copy)).size > 1)
    return `the tabs are on ${new Set(tabs.map(tab => tab.copy)).size} copies: ${tabs.map(tab => `${tab.name} ${tab.copy?.slice(0, 7)}`).join(", ")}`;
  if (new Set(tabs.map(tab => tab.text)).size > 1) return `the tabs differ:\n${tabs.map(tab => `  ${tab.name}: ${JSON.stringify(tab.text)}`).join("\n")}`;
  // A tab alone with the page shares nothing: a draft it reloaded over an older version stays so, as without a room.
  const solo = tabs.length === 1 && tabs[0].copy === undefined;
  const stale = solo ? [] : tabs.filter(tab => tab.base !== end.github.sha);
  if (stale.length) return `not on GitHub's newest version: ${stale.map(tab => tab.name).join(" ")}`;
  const seen = new Set<string>();
  for (const { name, text } of tabs) {
    const counts = new Map<string, number>();
    for (const made of text.match(WORD) ?? []) { counts.set(made, (counts.get(made) ?? 0) + 1); seen.add(made); }
    const doubled = [...counts].filter(([, count]) => count > 1).map(([made]) => made);
    if (doubled.length) return `doubled at ${name}: ${doubled.join(" ")} in ${JSON.stringify(text)}`;
    if ((text.match(/[«»]/g) ?? []).length !== 2 * [...counts.values()].reduce((sum, count) => sum + count, 0)) return `a word cut apart at ${name}: ${JSON.stringify(text)}`;
    // Every word of GitHub's newest text is there, unless someone deleted it since.
    const missing = undone || solo ? [] : (end.github.text.match(WORD) ?? []).filter(made => !text.includes(made) && !end.gone.has(made) && !settled.has(made));
    if (missing.length) return `GitHub's ${missing.join(" ")} missing at ${name}: ${JSON.stringify(text)}`;
  }
  // Words typed (by a tab or an agent) and never deleted: each is on the tabs, unless its own tab took it out in a clash.
  // GitHub's own words are checked against its newest text above.
  // After the Undo check, a clash's Undo may have taken out the words of GitHub's text there, whoever typed them.
  const github = new Set(undone ? end.github.text.match(WORD) ?? [] : []);
  const lost = [...end.typed.keys()].filter(made => !end.gone.has(made) && !settled.has(made) && !seen.has(made) && end.typed.get(made) !== "github" && !github.has(made));
  if (lost.length) return `lost: ${lost.map(made => `${made} (${end.typed.get(made)})`).join(" ")} in ${JSON.stringify(tabs.map(tab => tab.text))}`;
  return undefined;
}
/** What every run must end with; undefined when it does: one copy, one text, before and after the Undo check, whose
 * words come back. */
function fault(end: Awaited<ReturnType<typeof play>>) {
  const before = wrongAt(end, end.tabs);
  if (before) return before;
  for (const { tab, words } of end.undone) if (words.length) return `${tab}'s Undo of the clash did not bring back ${words.join(" ")}`;
  const after = wrongAt(end, end.after, true);
  return after && `after the Undo check: ${after}\n  before it: ${JSON.stringify(end.tabs.map(tab => tab.text))}`;
}

const SEEDS = Number(process.env.LIVE_SEEDS ?? 150), STEPS = Number(process.env.LIVE_STEPS ?? 60);
/** Seeds past the first SEEDS that once failed, played every time: a commit landing on a tab still joining the room;
 * 348: a commit that rewrites the one before it, which two tabs took in from different versions; 288: a save right after
 * a page opened again (Save waits until it caught up, Lex's choice A). 1370 is out until TOOLS-216: since a save waits,
 * its run ends on a tab coming back to the page with what it typed elsewhere (the returning-tab case). */
const FOUND = [288, 348, 819, 1722];
/** Steps left out of every run (`LIVE_SKIP=save,outside`), to narrow down what a failing seed needs. */
const SKIP = new Set((process.env.LIVE_SKIP ?? "").split(",").filter(Boolean));

test("typing together, in seeded random order: every run ends with every tab on one copy and one text, nothing doubled or lost", async () => {
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
