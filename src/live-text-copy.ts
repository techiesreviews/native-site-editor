// One open file's live copy (ADR 0003; the overview is in src/live-text.ts): a Yjs text over the plain source, its
// frames to and from the room (catch-up, updates, two copies meeting), and the start of this tab's part in it (`begin`).
// Its parts each own one job (TOOLS-330): the kept copy and the save record (src/live-text-kept.ts), changes from
// GitHub (src/live-text-github.ts), this tab's draft, adopted drafts and words carried over (src/live-text-drafts.ts),
// and carets and who wrote what (src/live-text-carets.ts). They read what they share through one CopyContext
// (src/live-text-shared.ts).

import type { TextChange } from "./draft-store";
import { rebaseHistory } from "./shared-undo";
import { LIVE_MESSAGE_LIMIT } from "../shared/live-room";
import { birthUpdate, clientOf, draftUpdate, edgeTo as edgeFor, edges, metaOf, occurrenceOn, shaOf, versionsOf } from "./live-versions";
import { hex, makeNotes, type KeptCopy } from "./live-text-kept";
import { makeGithub, versionOf } from "./live-text-github";
import { makeDrafts } from "./live-text-drafts";
import { makeCarets } from "./live-text-carets";
import { changesBetween, LIVE_TEXT_CATCH_UP_MS, LOCAL, OUTSIDE, REMOTE, START, type AuthorUndo, type CopyContext, type Doc, type ShareContext,
  type Yjs } from "./live-text-shared";

const HELLO = 1, ASK = 2, REPLY = 3, UPDATE = 4, GITHUB = 5;
const HEAD = 2 + 20 + 4;
/** A start that cannot bring its versions together or carry its words over (GitHub's history unread) is tried again until
 * this many rounds failed, for as long as its copy runs: 5 s after the first, twice as long after each one since, at most
 * 40 s. Only the first failure and a retry's start a round; other starts that fail in between (more answers to its
 * request, a reconnect) are not counted, and the wait starts again from them. */
const START_TRIES = 6;
/** Frames that arrive while Yjs loads wait, up to this many. */
export const INBOX_LIMIT = 500;
/** The room closes a socket over its limit: a larger copy is not sent (the room's own framing needs a little room). */
const FRAME_LIMIT = LIVE_MESSAGE_LIMIT - 1024;
export const sameTag = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, index) => byte === b[index]);
const NO_COPY = new Uint8Array(20);

/** A Yjs text event's delta as changes in the text before it. */
function deltaChanges(delta: { retain?: number; insert?: unknown; delete?: number }[]) {
  const changes: TextChange[] = [];
  let at = 0;
  for (const op of delta) {
    if (op.retain) { at += op.retain; continue; }
    const last = changes.at(-1);
    const open = last && last.end === at ? last : undefined;
    if (typeof op.insert === "string") { if (open) open.text += op.insert; else changes.push({ start: at, end: at, text: op.insert }); }
    if (op.delete) { if (open) open.end += op.delete; else changes.push({ start: at, end: at + op.delete, text: "" }); at += op.delete; }
  }
  return changes;
}

/** Makes the open file's copy: `resume` a copy kept from before, `carry` one the room left (this tab's words in it are
 * carried over). */
export function makeCopy(s: ShareContext, Y: Yjs, resume: KeptCopy | undefined, carry?: KeptCopy) {
  const { store, scope, path, clock, start, room, preferred, ownSaves, unplaced, caretsMoved, authorsChanged, ended, foldsReady } = s;
  // Every item stays (no garbage collection): the copy as it was at each of GitHub's versions is made again from a snapshot.
  const doc: Doc = new Y.Doc({ gc: false });
  const text = doc.getText("source"), meta = metaOf(doc);
  /** The room copy this one is: from a kept copy, the first answer to this tab's request, or its own birth. */
  let copyId: Uint8Array | undefined;
  let synced = false, starting = false, waiting: unknown;
  /** Rounds of starts that failed (`begin`): the next waits longer, up to START_TRIES. `retrying`: the next start is the
   * retry's, which begins a new round. */
  let failures = 0, retrying = false;
  /** Resumed from its kept copy with no one in the room catching it up, or caught up by such a copy (TOOLS-224): its frames
   * say so, and in a meet it gives way to any copy of the room that is caught up (`meet`). It is the room's copy once
   * another tab on it has been heard from for as long as a catch-up may take with no other copy coming (`roomHeard`), or
   * someone on it says it is (a caught-up frame naming it). */
  let alone = false, roomHeard: unknown;
  /** After a new room key or a reconnect: frames may have been lost, so a commit waits until a catch-up answer came. */
  let catching = false, caught: unknown;
  /** Whether the text changed in the update being applied (`receive`); set by the text's observer. */
  let textChanged = false;
  /** The Yjs client id this tab's draft changes entered the copy under (`begin`), told to the room so they carry its name. */
  let startClient: number | undefined;
  // Someone else's own changes (their UPDATE frames), each under its author's origin, for the name-tag Undo. Catch-up
  // answers carry everyone's text and stay under REMOTE.
  const authors = new Map<number, { origin: object; undo: import("yjs").UndoManager }>();
  const theirs = new WeakSet<object>();
  /** The agents whose text this tab wrote into the copy (ticket am-25), by the origin of their changes: the client id
   * those changes carry and that their frames name. */
  const agentIds = new WeakMap<object, number>();
  const authorOrigin = (author: number, agent = false) => {
    let found = authors.get(author);
    if (!found) {
      const origin = {};
      if (agent) agentIds.set(origin, author); else theirs.add(origin);
      const undo = new Y.UndoManager(text, { trackedOrigins: new Set([origin]) });
      for (const event of ["stack-item-added", "stack-item-popped", "stack-cleared"] as const) undo.on(event, authorsChanged);
      authors.set(author, found = { origin, undo });
    }
    return found.origin;
  };
  /** Client ids whose words are this browser's own (its tabs, their drafts, the agents they wrote for): the clash rule
   * takes only these out in this tab, and keeps them with the copy for when the file opens again. */
  const ownClients = new Set<number>((resume ?? carry)?.mine ?? []);
  // Its own earlier copy. What the draft took on after that copy was kept goes in when this tab starts its part (`begin`).
  if (resume) {
    Y.applyUpdate(doc, resume.update, START);
    if (!edges(Y, doc).some(edge => !edge.from)) throw new Error("A kept copy without its versions");
    copyId = resume.tag;
  }
  /** A copy of the room this browser shared before, which the room left for this one: this tab's own words in it go
   * into this copy once it caught this tab up (`carryIn`). */
  const carried = carry;
  /** The characters a kept copy's typing took out, as a delete set. */
  const tookOf = (ids: readonly number[] = []) => {
    const set = Y.createDeleteSet();
    for (let at = 0; at + 2 < ids.length; at += 3) set.clients.set(ids[at], [...set.clients.get(ids[at]) ?? [], { clock: ids[at + 1], len: ids[at + 2] } as never]);
    return Y.mergeDeleteSets([set]);
  };
  /** The characters this browser's typing took out of the copy (its own, or the agents it wrote for): GitHub's words the
   * clash rule may put back, and what a carry takes out of the room's other copy. Kept with the copy. */
  let took = tookOf((resume ?? carry)?.took);
  /** The clash rule is putting GitHub's words back (`settle`): the draft takes them with the rule's own step. */
  let quiet = false;
  /** `took` and what `transaction` took out. Copied: merging joins ranges in place, and the transaction's own are Yjs' to keep. */
  const plus = (took: ReturnType<Yjs["createDeleteSet"]>, transaction: import("yjs").Transaction) => {
    const copy = Y.createDeleteSet();
    for (const [client, ranges] of transaction.deleteSet.clients) copy.clients.set(client, ranges.map(({ clock, len }) => ({ clock, len }) as typeof ranges[number]));
    return Y.mergeDeleteSets([took, copy]);
  };
  doc.on("afterTransaction", (transaction: import("yjs").Transaction) => {
    const origin = transaction.origin;
    if (transaction.deleteSet.clients.size && (origin === LOCAL || origin === START || agentIds.has(origin as object))) took = plus(took, transaction);
  });
  let keptBase: string | undefined;
  /** This tab is leaving this copy for another of the room (`meet`): it is not kept. */
  let leaving = false;
  /** Catch-up requests that came before this copy could answer: answered once it can. */
  let asked: { kind: number; theirs: boolean; from: number; vector: Uint8Array }[] = [];
  /** This copy's id in frames: a REPLY naming it answers this tab's own request. It is the Yjs client id its own
   * changes carry, which carets name (slices 22 and 23), so a name tag's Undo finds that author's changes. Read once: should
   * Yjs ever give this doc a new client id (it does on a clash, very rarely), carets must keep naming this one. */
  const me = doc.clientID;
  /** What its parts read: what stays, and the state more than one of them reads, live. */
  const c: CopyContext = {
    s, Y, doc, text, meta, me, resume, carried, ownClients, authors, agentIds, authorOrigin, applyText, follow, plus,
    get copyId() { return copyId; }, get synced() { return synced; }, get leaving() { return leaving; },
    get keptBase() { return keptBase; }, set keptBase(base) { keptBase = base; },
    get took() { return took; }, set took(next) { took = next; },
    get quiet() { return quiet; }, set quiet(on) { quiet = on; },
    get startClient() { return startClient; }, set startClient(client) { startClient = client; },
    get notes() { return notes; }, get github() { return github; }, get drafts() { return drafts; }, get carets() { return caretPart; },
  };
  const github = makeGithub(c), notes = makeNotes(c);
  const { versions, settle, bringBase, fold, weighed, weighedVersions } = github;
  const { keep, noteCopy, noteSave, saved } = notes;
  ownClients.add(me);
  // This tab's own copy until it takes part, made from the copy kept from before.
  const drafts = makeDrafts(c);
  const { joinOwn, carryIn } = drafts;
  const caretPart = makeCarets(c);
  const { agents, agentAuthor, tellCaret, carets, nameAuthors, heardFrom } = caretPart;
  /** `changes`, ordered from the end of the text back, applied to the copy's text (or `into`). */
  function applyText(changes: readonly TextChange[], into = text) {
    for (const change of changes) {
      if (change.end > change.start) into.delete(change.start, change.end - change.start);
      if (change.text) into.insert(change.start, change.text);
    }
  }

  const frame = (kind: number, payload: Uint8Array, id: number) => {
    const out = new Uint8Array(HEAD + payload.length), view = new DataView(out.buffer);
    out[0] = kind;
    // Not caught up (0), caught up (1), or resumed alone (2, `alone`).
    out[1] = synced ? (alone ? 2 : 1) : 0;
    out.set(copyId ?? NO_COPY, 2);
    view.setUint32(22, id);
    out.set(payload, HEAD);
    return out;
  };
  const send = (kind: number, payload: Uint8Array, id = me) => {
    if (s.stopped || HEAD + payload.length > FRAME_LIMIT) return Promise.resolve(false);
    return room.send(frame(kind, payload, id)).catch(() => false);
  };
  /** The draft now follows the shared copy (outside history: someone else's change). */
  /** A name-tag Undo running in this tab: this tab's own step, recorded in `history`. */
  let taking: { undo: import("yjs").UndoManager; history: string | undefined } | undefined;
  function follow(changes?: TextChange[], own?: { history: string | undefined }) {
    const now = text.toString(), draft = store.text(scope, path);
    if (draft === undefined || draft === now) return;
    const between = changesBetween(draft, now, changes);
    // A name-tag Undo is this tab's own step: its Undo puts their words back (as this tab's), its Redo takes them again.
    if (own && store.edit({ scope, path, history: own.history, label: "Undo their change", changes: between }).ok) return;
    store.edit({ scope, path, changes: between, record: false, origin: "shared", rebase: rebaseHistory });
  }

  // A reload or a closed tab keeps the newest copy too.
  const page = typeof window === "undefined" ? undefined : window;
  const hidden = () => { if (document.visibilityState === "hidden") keep(); };
  page?.addEventListener("pagehide", keep);
  page?.document.addEventListener("visibilitychange", hidden);
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    // Alone, nothing goes out: whoever joins next is caught up by HELLO and REPLY.
    // An agent's change goes out under its own client id (ticket am-25), the tab's own under the tab's. The outside
    // participant's words, and the copy taking out words of a way into a version it does not keep, are no one's.
    if (origin === OUTSIDE) { if (s.editors) void send(GITHUB, update); }
    else if (origin !== REMOTE && !theirs.has(origin as object) && s.editors)
      void send(UPDATE, update, typeof origin === "object" && origin ? agentIds.get(origin) ?? me : me);
    if (synced) notes.keepSoon();
  });
  text.observe((event, transaction) => {
    textChanged = true;
    if (synced && transaction.origin !== LOCAL && !quiet)
      follow(deltaChanges(event.delta as { retain?: number; insert?: unknown; delete?: number }[]), taking && transaction.origin === taking.undo ? taking : undefined);
    // Any change can make someone's change undoable or not (their words removed since): the name tags look again.
    if (authors.size) authorsChanged();
    // Others' carets stay by their words: they are read again in the new text.
    if (synced && (s.peers.size || agents.size)) caretsMoved();
  });
  /** Whether undoing `item` changes the text: some of the words it added are still there, or it removed words
   * (other than its own) that Yjs can put back. Yjs itself skips items that change nothing. */
  const undoable = (item: import("yjs").UndoManager["undoStack"][number]) => {
    for (const [client, ranges] of item.deletions.clients) for (const { clock, len } of ranges)
      for (let at = clock; at < clock + len; at++) if (!Y.isDeleted(item.insertions, Y.createID(client, at))) return true;
    if (!item.insertions.clients.size) return false;
    const gone = Y.createDeleteSetFromStructStore(doc.store);
    for (const [client, ranges] of item.insertions.clients) for (const { clock, len } of ranges)
      for (let at = clock; at < clock + len; at++) if (!Y.isDeleted(gone, Y.createID(client, at))) return true;
    return false;
  };
  const unsubscribe = store.subscribe(drafts.draftChanged);

  /**
   * Starts this tab's part in the copy: alone (`caught` false), or no one caught it up, its own draft
   * goes in; caught up by a tab that was, it keeps the room's copy and adds its own changes only when
   * they are not the room's text already. Its draft's changes over its version of GitHub's text enter under the id
   * every tab with the same draft uses. Remote changes wait in the copy meanwhile; the draft follows after.
   */
  async function begin(caught: boolean) {
    if (synced || starting) return;
    starting = true;
    clock.clearTimeout(waiting);
    /** This start is the retry's (`START_TRIES`). */
    const retry = retrying;
    retrying = false;
    /** A copy of the room caught this tab up while it was starting its own: it joins that one once this start ends. */
    let joined = false;
    /** Its versions could not be brought together, or its words carried over (GitHub's history unread): it tries again. */
    let failed = false;
    try {
      if (!copyId) {
        // No copy of the room came to this tab: it starts one, from its own version of GitHub's text.
        const file = store.get(scope, path);
        if (!file) return;
        const version = await versionOf(file.baseSha, file.base), birth = await birthUpdate(Y, version, file.base);
        // A copy id of its own (TOOLS-216): two copies born from one version with different histories are never taken for
        // one. It starts with the time of its birth, so when two copies meet the older one stays (`meet`): a copy started
        // later (a tab whose catch-up got lost) does not take the room from the one its tabs typed in.
        const id = crypto.getRandomValues(new Uint8Array(20)), now = Math.max(0, Math.floor(clock.now()));
        new DataView(id.buffer).setUint32(0, Math.floor(now / 65_536));
        new DataView(id.buffer).setUint16(4, now % 65_536);
        if (s.stopped) return;
        if (copyId) { joined = true; return; }
        Y.applyUpdate(doc, birth, OUTSIDE);
        copyId = id;
      }
      // Resumed: its own copy goes in first (with the saves it made meanwhile, noted in it), so its versions are the
      // copy's; what the draft takes on while the versions are brought together goes in at the end.
      if (resume) joinOwn();
      // A save or a commit can move the draft's version while it goes in: the versions are brought together again.
      versions: for (let round = 0; round < 5; round++) {
        const at = await bringBase();
        if (!at || s.stopped) { failed = !at; return; }
        keptBase = at.base;
        // Resumed from its own kept copy: what the draft took on after the copy was kept goes in, unless the copy has it now.
        if (resume) { joinOwn(); synced = true; if (!caught) alone = true; break; }
        // Back with a copy the room left: its own words of that copy go in, told apart by their Yjs ids. Not placed, the
        // copy is not joined (no doubled page, no lost words): the draft stays as it is.
        // The room's copy is the one it was kept from after all (it answered first): the own copy goes in as Yjs updates.
        if (carried && copyId && sameTag(copyId, carried.tag)) {
          joinOwn();
          // Its version moves as a resumed copy's does (`bringBase`): the draft follows the copy, over that version.
          if (store.get(scope, path)?.baseSha !== shaOf(at.base)) store.acceptBase(scope, path, { text: at.text, baseSha: shaOf(at.base) });
          synced = true;
          break;
        }
        if (carried) {
          const over = store.get(scope, path)?.baseSha;
          const went = await carryIn(at.base);
          if (!went || s.stopped) { failed = went === false; return; }
          // A save landed meanwhile and moved the draft's version: the versions are brought together again (what this
          // carry put in is not put in twice, `firstOf`).
          if (store.get(scope, path)?.baseSha !== over) continue versions;
          store.acceptBase(scope, path, { text: at.text, baseSha: shaOf(at.base) });
          synced = true;
          break;
        }
        for (;;) {
          const own = store.text(scope, path), base = store.get(scope, path)?.base;
          const adds = (now: string | undefined) => now !== undefined && now !== base && (!caught || now !== text.toString());
          const edge = edgeFor(versions(), at.base);
          if (!edge || base !== at.text) continue versions;
          // `runs`: the draft goes in word by word (`wordRuns`) over the copy as it was at its version.
          const client = adds(own) ? await clientOf(`runs\n${at.base}\n${edge.id}\n${own}`) : undefined;
          if (s.stopped) return;
          // Typed meanwhile, or the room's copy caught up with it: decide again on the text as it is now.
          if (store.text(scope, path) !== own || adds(own) !== (client !== undefined)) continue;
          if (store.get(scope, path)?.base !== at.text) continue versions;
          if (client !== undefined) { Y.applyUpdate(doc, draftUpdate(Y, doc, edge, at.text, own!, client), START); startClient = client; ownClients.add(client); }
          synced = true;
          break versions;
        }
      }
    } finally {
      starting = false;
      // The answer to its request came during the start (`receive` could not begin then): it begins as caught up now.
      if (joined && !s.stopped) void begin(true);
      // Not joined (no doubled page, no lost words), and not left so: it starts its part again later, waiting longer each
      // time, until START_TRIES failed. Then the draft stays as it is, apart from the room's copy, until the room catches it
      // up again (a new key or a reconnect asks, `again`) or the page opens again.
      else if (failed && !s.stopped && !synced) {
        if (retry || !failures) failures++;
        clock.clearTimeout(waiting);
        if (failures < START_TRIES) waiting = clock.setTimeout(() => { retrying = true; void begin(caught); }, Math.min(2 ** (failures - 1), 8) * LIVE_TEXT_CATCH_UP_MS);
      }
      // A save waiting for this start goes on (`caughtUp`); a commit tries again (and waits on). So on every way out.
      if (!synced) foldsReady();
    }
    if (!synced) return;
    // Saved while the copy was starting: the draft went in over the copy's version, and the copy, holding the saved text
    // now, is noted as the save, so its words do not come in again as GitHub's change.
    for (const [sha, saved] of ownSaves) {
      const node = keptBase && occurrenceOn(versions(), keptBase, sha);
      if (!keptBase || !node || versionsOf(versions()).has(node) || text.toString() !== saved || store.get(scope, path)?.text !== saved) continue;
      noteCopy(keptBase, node);
      store.acceptBase(scope, path, { text: saved, baseSha: sha });
      keptBase = node;
      break;
    }
    follow();
    for (const request of asked.splice(0)) answer(request.kind, request.theirs, request.from, request.vector);
    keep();
    // Commits that came in before this tab took part are not weighed for a clash: its own words came after them. A
    // resumed copy's words came before the commits it did not hold yet: those are weighed.
    if (!resume) for (const edge of versions()) { weighed.add(edge.id); weighedVersions.add(edge.to); }
    settle();
    // Changes others sent while this tab was catching up can be taken back from now on.
    if (authors.size) authorsChanged();
    // Agents that wrote before this copy took part: their carets where their latest change ended.
    for (const { who, index } of unplaced.values()) agentAuthor(who).at = Y.createRelativePositionFromTypeIndex(text, Math.min(index, text.length));
    unplaced.clear();
    // Its caret and theirs are in the shared text from now on.
    tellCaret();
    caretsMoved();
    // Caught up, it asks the others for what only it has (a resumed copy, its own changes); starting its own
    // copy, it tells the room, in case another did the same meanwhile.
    hello();
    foldsReady();
  }

  function hello() {
    if (s.stopped) return;
    void send(HELLO, Y.encodeStateVector(doc)).then(sent => {
      if (!sent || synced || s.stopped) return;
      clock.clearTimeout(waiting);
      waiting = clock.setTimeout(() => { void begin(false); }, LIVE_TEXT_CATCH_UP_MS);
    });
  }
  /** After a new room key or a reconnect: every tab asks again for what it is missing, and a commit waits for the answer. */
  function again() {
    if (synced) {
      catching = true;
      clock.clearTimeout(caught);
      caught = clock.setTimeout(() => { catching = false; foldsReady(); }, LIVE_TEXT_CATCH_UP_MS);
    }
    hello();
  }
  // Every caught-up copy answers every request, and after a new key every copy asks: frames grow with the square of the
  // people in the room, fine for the 2-5 this is for (ADR 0003, join traffic).
  function answer(kind: number, theirs: boolean, from: number, vector: Uint8Array) {
    void send(REPLY, Y.encodeStateAsUpdate(doc, vector), from);
    if (kind === HELLO && theirs) void send(ASK, Y.encodeStateVector(doc));
  }
  /** Copies this one told of itself, after meeting them (`meet`). */
  const toldCopies = new Set<string>();
  /**
   * Two copies of one room met (a tab started its own while another's was out of reach, or came back with a copy kept
   * from before the others started theirs): the one with the lower id stays (an order that never changes as copies
   * merge, so tabs never bounce between them) and the tabs of the other join it, each carrying its own words over
   * (`carryIn`). A copy no one has caught up with yet (a tab back with a copy kept from before, not started yet or
   * resumed alone, `alone`) never takes the room from one that is caught up: it joins that one whatever the ids. Every
   * tab decides the same from the frames alone (`state`: the other copy's frame says not caught up, 0; caught up, 1;
   * resumed alone, 2).
   */
  function meet(other: Uint8Array, state: number) {
    if (!copyId) return;
    const lower = [...other].findIndex((byte, index) => byte !== copyId![index]), older = lower >= 0 && other[lower] < copyId[lower];
    // A copy this tab joined (an answer to its request) is caught up, as one it started is: only an older one takes it.
    const mine = !synced && !joined ? 0 : alone ? 2 : 1;
    if (state && (!mine || (state === 1 && mine === 2) || (state === mine && older))) {
      preferred.set(start.key, Uint8Array.from(other));
      // Kept as it is now (a copy not caught up yet stays as it was kept), to carry this tab's words over from.
      keep();
      leaving = true;
      s.restarting = true;
      ended("again");
      return;
    }
    const name = hex(other);
    if (toldCopies.has(name)) return;
    toldCopies.add(name);
    hello();
  }
  /** A caught-up copy of the room has been heard from: this tab joins it rather than starting one. So it has when this
   * tab left its copy for another of the room (`meet`): that one is there to join. */
  let heardCopy = preferred.has(start.key);
  /** This copy is one this tab joined: a caught-up copy answered its request. */
  let joined = false;
  function receive(bytes: Uint8Array) {
    if (bytes.length < HEAD) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset), kind = bytes[0], state = bytes[1], theirs = state !== 0;
    const tag = bytes.subarray(2, 22), id = view.getUint32(22), payload = bytes.subarray(HEAD);
    const none = sameTag(tag, NO_COPY);
    if (theirs && !none) heardCopy = true;
    // Someone caught up is on the copy this tab resumed alone: it is the room's copy now. So it is once another tab on it
    // has been heard from for a catch-up's time with no caught-up copy of the room taking this tab (`meet`).
    if (alone && copyId && sameTag(tag, copyId)) {
      if (state === 1) { alone = false; clock.clearTimeout(roomHeard); }
      else if (synced && roomHeard === undefined) roomHeard = clock.setTimeout(() => { alone = false; }, LIVE_TEXT_CATCH_UP_MS);
    }
    try {
      if (kind === HELLO || kind === ASK) {
        // Tabs that have no caught-up copy yet ask one another: the one with a copy of its own (kept from before), else
        // the lower id, starts the room's copy at once, and the others are caught up by it, so a room starts one copy.
        // Two tabs back with the same kept copy, neither caught up: the lower id starts. A tab that heard from a caught-up
        // copy of the room waits for it instead, as does one whose copy lost a meet (`preferred`) until it joined that one.
        if (kind === HELLO && !theirs && !synced && !starting && (none ? copyId || (me < id && !heardCopy) : copyId && sameTag(tag, copyId) && me < id)) void begin(false);
        // A request from a tab with no copy, while this one has none either: answered once this one has (it starts the
        // room's copy, or is caught up), so a joiner is not left waiting for the fallback.
        if (!copyId) {
          if (none) { if (asked.length < INBOX_LIMIT) asked.push({ kind, theirs, from: id, vector: Uint8Array.from(payload) }); }
          // A caught-up copy says it is here (after a reconnect, its request lost before): this tab asks it, rather than
          // waiting out the fallback and starting a copy of its own.
          else if (kind === HELLO && theirs && !synced && !starting) void send(HELLO, Y.encodeStateVector(doc));
          return;
        }
        // A request from another copy of the room: the two meet. One from a tab with no copy yet is answered.
        if (!none && !sameTag(tag, copyId)) { meet(tag, state); return; }
        // Only a copy that is caught up answers: a seed alone would tell a waiting tab the room is empty.
        if (synced && !starting) answer(kind, theirs, id, payload);
        else if (asked.length < INBOX_LIMIT) asked.push({ kind, theirs, from: id, vector: Uint8Array.from(payload) });
        return;
      }
      if (kind !== REPLY && kind !== UPDATE && kind !== GITHUB) return;
      if (none) return;
      if (!copyId) {
        // Joining: the first answer to this tab's own request from any caught-up copy makes this copy that one. When two
        // copies met and this is not the one they agreed on (`preferred`), the next frame of the other makes them meet again.
        if (kind !== REPLY || !theirs || id !== me) return;
        copyId = Uint8Array.from(tag);
        joined = true;
        // Caught up by a copy resumed alone: so is this one, until that copy is the room's.
        if (state === 2) alone = true;
        // Joined the copy two met on: later openings ask the room afresh.
        const wanted = preferred.get(start.key);
        if (wanted && sameTag(wanted, tag)) preferred.delete(start.key);
      } else if (!sameTag(tag, copyId)) { meet(tag, state); return; }
      // A frame naming an agent whose text this tab writes is not that agent's here: only this tab writes under its id.
      const local = authors.get(id), agentHere = local !== undefined && agentIds.has(local.origin);
      const before = Y.decodeStateVector(Y.encodeStateVector(doc)), theirChange = kind === UPDATE && id !== me && !agentHere;
      textChanged = false;
      Y.applyUpdate(doc, payload, theirChange ? authorOrigin(id) : REMOTE);
      heardFrom(before, theirChange && textChanged ? id : undefined);
      // Caught up only by an answer to its own request: one to another tab's holds only what that tab lacked.
      if (kind === REPLY && theirs && id === me) {
        if (!synced) { if (state === 2) alone = true; void begin(true); }
        else if (catching) { catching = false; clock.clearTimeout(caught); foldsReady(); }
      }
      settle();
    } catch { /* A broken update is dropped; the next catch-up brings what it lacked. */ }
  }
  return {
    receive, hello, again, tellCaret, carets, nameAuthors, fold, noteSave, saved,
    id: () => copyId && hex(copyId),
    versions: () => versions().map(({ from, to, client }) => ({ from, to, ...(client === undefined ? {} : { client }) })),
    /** Whether a commit can enter now: caught up, and not catching up again after a reconnect. */
    ready: () => synced && !catching && !starting,
    /** Taking part: the draft's changes go into this copy as they happen (an agent's with its caret, `writeAgent`). */
    taking: () => synced,
    starting: () => starting,
    /** Alone in the room (first in, or everyone else left before catching this tab up): its own draft starts the copy. */
    startOwn: () => begin(false),
    /** The name-tag Undo: `author`'s latest change that still changes the text (its UPDATE frames, grouped as Yjs groups
     * typing), taken back in the copy, which everyone follows, and recorded as this tab's own step in `history`.
     * Changes it has taken back are not counted; a change whose words someone removed since is skipped. */
    authors: {
      undo(author, history) {
        const found = authors.get(author);
        if (!synced || s.discarded || !found) return false;
        taking = { undo: found.undo, history };
        try { return found.undo.undo() !== null; } finally { taking = undefined; }
      },
      can: author => synced && !s.discarded && Boolean(authors.get(author)?.undo.undoStack.some(undoable)),
    } satisfies AuthorUndo,
    destroy() {
      clock.clearTimeout(waiting); caretPart.stop(); clock.clearTimeout(caught); clock.clearTimeout(roomHeard); keep(); unsubscribe();
      notes.stop(); page?.removeEventListener("pagehide", keep); page?.document.removeEventListener("visibilitychange", hidden);
      // Gone before anyone hears it: a name tag asking now finds nothing to take back.
      const had = authors.size > 0;
      for (const { undo } of authors.values()) undo.destroy();
      authors.clear();
      doc.destroy();
      if (had) authorsChanged();
    },
  };
}
