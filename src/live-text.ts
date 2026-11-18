// The open file's shared copy (ADR 0003, ticket am-21). While someone else
// has the same file open, both tabs hold it as a Yjs text over the plain
// source and send each other their changes through the file's live room
// (src/live-room.ts); each tab's draft follows the shared copy. Loaded after
// the first paint; Yjs itself loads only once someone else is in the room.
//
// - A tab alone with a file holds the room socket (so others can find it) and
//   no Yjs. It sends only the relay's auto-answered ping, never a frame the
//   relay is woken for.
// - The starting text: GitHub's text enters under a client id derived from its
//   blob sha, and a draft's changes over it under one derived from the sha and
//   the draft's text, so two tabs that start from the same text make the very
//   same Yjs items. Each copy has an id of its own (its birth time, then random
//   bytes, TOOLS-216): two copies of a room that meet are never taken for one;
//   the older caught-up one stays and the other's tabs join it (`meet`, src/live-text-copy.ts).
// - Who starts it: a tab that has been alone in the room starts from its own
//   draft. A tab that found others there waits for one of them to catch it up
//   (nothing is stored on the server), then keeps the room's copy; its own
//   unsaved changes join it only when they are not the room's already.
// - Coming back (TOOLS-216, Lex's choice B): a tab keeps the copy it shared
//   (its Yjs state, in this browser only: memory, and IndexedDB for a reload),
//   and while it is not taking part its own copy goes on taking what its draft
//   takes (typing, agents, commits, its own saves) as Yjs items. Opening the
//   file again it starts from the room's copy and adds only its own new words:
//   it resumes its copy when that is still the room's (Yjs merges the two), and
//   otherwise joins the room's copy and carries over only its own words, placed
//   by their Yjs ids (`carryIn`, src/live-text-drafts.ts), never by comparing texts. A save's commit
//   names the copy's state as saved (its `Live-Copy` record, shared/live-copy.ts),
//   so a tab coming back knows exactly which of its own words another tab saved.
// - After a new room key or a reconnect, every tab asks again for what it is
//   missing, so frames lost meanwhile are made good.
// - Discard takes this tab out of the shared copy: the others keep their
//   changes, and this tab shows GitHub's text until it opens the file again.
// - Per-person Undo (ticket am-24): someone else's change moves this tab's
//   Undo and Redo past it (src/shared-undo.ts) instead of clearing them. The
//   name-tag Undo (`LiveText.undoAuthor`) takes back one author's latest change
//   for everyone; carets call it from slices 22, 23 and 25.
// - Carets (ticket am-22): each tab tells the room where its caret is, through
//   the room's presence (src/live-room.ts), as Yjs relative positions, so a
//   caret stays by the same words while others type. Others' carets are read
//   in this tab's text and drawn in the code pane (src/components/live-carets.ts,
//   loaded with Yjs, only once someone else is in the room, or an agent wrote
//   while this tab is alone, TOOLS-219). A synced session's guests' carets come
//   through src/session-carets.ts and are drawn with them; the session reads
//   this tab's caret and the room's from there for its guests' pages.
// - Agents join the merge (ticket am-25): an agent's change is written into the
//   drafts of the tab that receives its commands (src/live-author.ts says whose
//   it is). That tab puts the text change into the copy as the smallest change,
//   under a Yjs client id of the agent's own, and sends it under that id, so in
//   every tab its words are the agent's: its name tag's Undo takes back only
//   them. The receiving tab says where the agent's caret is (at its latest
//   change) along with its own, and draws it too.
// - Saving names everyone (ticket am-26): who changed a file is noted for its
//   commit (src/save-authors.ts). Others' text in the copy is matched, by the
//   Yjs client ids it carries, to the names the room's presence gives (a tab's
//   own id, the id its draft's changes entered under, the agents it wrote for);
//   an agent writing into this tab's drafts is noted whether sharing is on or not.
//
// Frames (inside the room's encryption): a kind byte, whether the sender is
// caught up, the 20-byte id of the sender's copy (all zero before it has one),
// a 4-byte Yjs client id (the sender's; in a REPLY, the tab whose request it
// answers), then a Yjs state vector or update. A frame from another copy of
// the room makes the two meet (`meet`, src/live-text-copy.ts), and a tab counts as caught up only by a
// REPLY to its own request: one to someone else's holds only what they lacked.
//
// Live sharing is on for every signed-in tab (`liveSharingOn`; Lex, 2026-10-31:
// "Yes, switch it on for everyone"), so GitHub collaborators on the same
// repository and branch meet on the page with no link (slice am-31). A tab
// alone with a file holds one quiet room socket; nothing is stored on the server.
//
// The parts (TOOLS-330): this file holds the share of the open file (`shareFile`: the room, who is here, commits and
// saves waiting for the copy, pages kept apart) and the switch for the open file (`startLiveText`). The copy itself is
// src/live-text-copy.ts (`makeCopy`: frames, catching up, starting this tab's part), with one module per job: the kept
// copy and the save record (src/live-text-kept.ts), changes from GitHub (src/live-text-github.ts), this tab's draft,
// adopted drafts and words carried over (src/live-text-drafts.ts), and carets and who wrote what
// (src/live-text-carets.ts).

import { effect, untracked, type ReadonlySignal } from "@preact/signals-core";
import type { DraftScope } from "./drafts";
import { openLiveRoom, type LiveClock, type LivePeer, type LiveRoomOptions } from "./live-room";
import { liveAuthor, type LiveAuthor } from "./live-author";
import { agentKey } from "./participant";
import { saveAuthors, type SaveAuthors } from "./save-authors";
import { sessionCarets, type FileCarets } from "./session-carets";
import { browserKeeper, keptSaves, liveSaveReady, onLiveSave, type CopyKeeper } from "./live-text-kept";
import { AGENT_CARETS, cut } from "./live-text-carets";
import { INBOX_LIMIT, makeCopy, sameTag } from "./live-text-copy";
import { changesBetween, LIVE_TEXT_CATCH_UP_MS, type AuthorUndo, type Room, type ShareContext, type Store, type Yjs } from "./live-text-shared";

/** A version of a file on GitHub: its blob sha and text. */
export interface LiveVersion {
  sha: string; text: string;
  /** The live copies whose save made it, as hex (the commit's `Live-Copy` lines, worker/publish.ts): a tab of such a
   * copy takes it as that save, waiting for its note, and never as an outside change. */
  copies?: readonly string[];
}
/** GitHub's file as a share reads it (`LiveTextPorts.github`). */
export interface LiveGithub extends LiveVersion {
  newest?: () => Promise<LiveVersion | undefined>;
  /** The versions before `sha` on the branch, newest first (from the commit that made its latest occurrence back):
   * nothing after the file's first version; it throws when GitHub's history cannot be read. */
  before?: (sha: string) => AsyncIterable<LiveVersion>;
}

export interface LiveTextPorts {
  store: Store;
  /** The file on show; its draft store entry is the one shared. */
  openFile: ReadonlySignal<string | undefined>;
  /** The drafts' scope on show; none on the overview or while a load runs. */
  scope(): DraftScope | undefined;
  /** Tests: the room (src/live-room.ts `openLiveRoom` by default), Yjs, the kept copies and the clock. */
  openRoom?: (options: LiveRoomOptions) => Room;
  loadYjs?: () => Promise<Yjs>;
  keeper?: CopyKeeper;
  clock?: LiveClock;
  /** Live sharing switched on (`liveSharingOn` by default). */
  on?: boolean;
  /** Draws others' carets once a copy is shared (src/components/live-carets.ts by default, in a browser). */
  loadCarets?: () => Promise<(share: CaretShare) => () => void>;
  /** Who changed each file, for the commit (src/save-authors.ts `saveAuthors` by default). */
  authors?: SaveAuthors;
  /** GitHub's version of the file (its blob sha and text) as the workspace read it, and GitHub's history of it (ticket
   * am-59). `newest`: the branch's newest version, read now. `before`: the versions before one, newest first. Every version enters the room's
   * copy on top of the one before it, so the copy holds GitHub's versions in GitHub's order whichever tab heard which
   * commit first; a history that cannot be read (a rate limit, a rewritten branch) enters nothing, and the caller falls
   * back to loading the branch again. */
  github?: (scope: DraftScope, path: string) => LiveGithub | undefined;
  /** The Undo list a clash's step goes in (the file's own by default): the latest version shows, this tab's words one Undo away. */
  history?: (scope: DraftScope, path: string) => string;
  /** A GitHub push moved the shared file's branch to `commit` (ticket am-32): the open file's room heard it from the relay. */
  onPushed?(scope: DraftScope, commit: string): void;
}

/** Someone else's caret in the open file, in this tab's text (ticket am-22). `author`: the Yjs client id their own changes
 * carry, which the name-tag Undo takes; `agent`: the program an agent works in (`clientInfo.name`; for an agent whose text
 * a tab wrote into the copy, ticket am-25, the name its commands carry), none for a person.
 * Name and author are what each participant says of itself (the relay vouches for neither): `contested` marks an author
 * id another participant here also claims, or this tab's own, whose name tag offers no Undo. `who`: an agent this tab
 * writes for, by its connection, so its caret is drawn as its outline and pin are (src/participant.ts); never sent.
 * `guest`: a synced session's guest (TOOLS-219, src/live-session-carets.ts), by the colour Lex's tab gave them; their
 * `author` is a number of their own below zero, which no Yjs client id is, so their tag offers no Undo. */
export interface LiveCaret { peer: string; author: number; name: string; agent?: string; who?: LiveAuthor; guest?: number; anchor: number; head: number; contested?: boolean }
/** A caret as offsets in this tab's text: where the selection began and where the caret is. */
export interface CaretSelection { anchor: number; head: number }
/** The open file's carets as the code pane draws them (src/components/live-carets.ts). */
export interface CaretShare {
  scope: DraftScope;
  path: string;
  /** Everyone else here now with a caret in this file. */
  carets(): LiveCaret[];
  /** Called when a caret may have moved: someone moved theirs, typed, came or left. Returns its unsubscribe. */
  onCarets(listener: () => void): () => void;
  /** Where this tab's own caret is: read (as offsets in its text) each time the room is told, so a caret placed before
   * the copy caught up is told where it is in the shared text; none takes it away. */
  own(selection: (() => CaretSelection | undefined) | undefined): void;
  canUndo(author: number): boolean;
  undo(author: number, history?: string): boolean;
  onAuthorUndo(listener: () => void): () => void;
}

let pageKeeper: CopyKeeper | undefined;

const systemClock: LiveClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

/** A commit GitHub has now for a shared file: its blob sha, its text, and who made it (for the clash's Undo step). */
export interface LiveCommit extends LiveVersion { author?: string }
/** The open file's share, as src/outside-merge.ts and tests reach it. */
interface Share {
  shared(): boolean;
  fold(next: LiveCommit): Promise<boolean | undefined>;
  copy(): string | undefined;
  versions(): { from: string; to: string; client?: number }[];
}
/** The files each draft store shares with someone else right now, by key. */
const liveFiles = new WeakMap<object, Map<string, Share>>();
/** Whether `store`'s file under `key` is shared in a live room now: another tab is in, its copy is loading, a copy is
 * made (it stays while the file is open, also after the others left), or the room has not said who is here yet (for at
 * most LIVE_TEXT_CATCH_UP_MS after the file opened). An outside change to it folds into the room's copy (`liveFold`). */
const liveShared = (store: object, key: string) => liveFiles.get(store)?.get(key)?.shared() ?? false;
/**
 * A commit GitHub has now (`next`) for `store`'s file under `key`, shared in a live room (ticket am-59): it enters the
 * room's one copy as one more participant, once, whichever tab takes it first; this tab's draft follows the copy, and
 * its base becomes the commit's text. A save from the room enters as text the copy holds already. Undefined when the
 * file is not shared after all (the room said this tab is alone before a copy was made): the caller folds the commit
 * into the draft. False when its copy could not take it (it did not catch up in time): the caller loads the branch again.
 */
export function liveFold(store: object, key: string, next: LiveCommit): Promise<boolean | undefined> {
  return liveFiles.get(store)?.get(key)?.fold(next) ?? Promise.resolve(undefined);
}
/** Tests: `store`'s file under `key` in its live room: whether it is shared now (`liveShared`), the room copy it is on
 * (as hex; none before it has one), and the versions of GitHub's text its copy holds, as edges (src/live-versions.ts). */
export function liveState(store: object, key: string) {
  const share = liveFiles.get(store)?.get(key);
  return { shared: liveShared(store, key), copy: share?.copy(), versions: share?.versions() ?? [] };
}
/** The copy a room's tabs agreed on when two met (`meet`), per draft store and key: a tab starting again joins that one. */
const preferredCopies = new WeakMap<object, Map<string, Uint8Array>>();

/** Shares one file while it is open; returns its stop, its name-tag Undo and its carets. `ended`: this tab left the copy
 * (Discard), or must start it again (another copy of the room won, `meet`). `authorsChanged`: what the name-tag Undo can
 * take back changed. `copied`: the copy is made (someone else is here), so carets can be drawn. */
function shareFile(ports: LiveTextPorts, scope: DraftScope, path: string, ended: (why: "left" | "again") => void, authorsChanged: () => void, copied: () => void) {
  const store = ports.store, clock = ports.clock ?? systemClock, keeper = ports.keeper ?? (pageKeeper ??= browserKeeper());
  const start = store.get(scope, path)!;
  let stopped = false, editors = 0, discarded = false, heard = false;
  /** This share stops for another share of the same page to take over (another copy of the room won, `meet`; or the page
   * kept apart shows again, `stop(true)`): what waits on it (a commit heard, a save) waits on the next one. */
  let restarting = false;
  /** Another page shows (`away`): the room is closed, and the copy goes on taking the draft's changes and commits. */
  let apart = false;
  let copy: ReturnType<typeof makeCopy> | undefined, loading = false;
  const inbox: Uint8Array[] = [];
  // Until the room says who is here, the file may be shared: a tab coming back to a page it typed on with others would
  // otherwise fold an outside change into a draft that holds the room's words, and the room's copy would take them twice.
  // A room that never answers (the relay out of reach) stops counting after the catch-up wait, so outside changes fold again.
  // A copy kept from before still runs then, as when alone (`onMembers`): a commit goes into it, not apart from it into the draft.
  const unheard = clock.setTimeout(() => { heard = true; if (!editors && !copy && !loading) void load(!unplaced.size); foldsReady(); }, LIVE_TEXT_CATCH_UP_MS);
  const shared = () => !stopped && (!heard || editors > 0 || loading || copy !== undefined);
  let live = liveFiles.get(store);
  if (!live) liveFiles.set(store, live = new Map());
  const preferred = preferredCopies.get(store) ?? new Map<string, Uint8Array>();
  preferredCopies.set(store, preferred);
  /** Commits heard before the copy could take them: each tries again once it can (true once it settled or started). */
  const waitingFolds: (() => boolean)[] = [];
  const share: Share = {
    shared,
    copy: () => copy?.id(),
    versions: () => copy?.versions() ?? [],
    fold: next => new Promise<boolean | undefined>(resolve => {
      let done = false, timer: unknown;
      const finish = (took: boolean | undefined) => { if (done) return; done = true; clock.clearTimeout(timer); resolve(took); };
      // True once it settled or started: the copy is caught up, or the file turned out not to be shared (the room said
      // this tab is alone before any copy was made, or the file closed): then the commit folds into the draft as for any file.
      const attempt = () => {
        if (done) return true;
        // Starting again on another copy: the commit goes to the share that follows, once it is there.
        if (stopped && restarting) { queueMicrotask(() => { liveFold(store, start.key, next).then(finish, () => finish(false)); }); return true; }
        if (stopped || !shared()) { finish(undefined); return true; }
        if (!copy?.ready()) return false;
        copy.fold(next).then(finish, () => finish(false));
        return true;
      };
      if (attempt()) return;
      // The copy is still catching up (a reconnect, or this tab joining): the commit waits for it, as long as a catch-up may take.
      waitingFolds.push(attempt);
      timer = clock.setTimeout(() => { if (!attempt()) finish(false); }, 2 * LIVE_TEXT_CATCH_UP_MS);
    }),
  };
  live.set(start.key, share);
  const foldsReady = () => { for (const attempt of waitingFolds.splice(0)) if (!attempt()) waitingFolds.push(attempt); };
  /** A save waits for this (`liveSaveReady`): the copy caught up, or the file not shared after all, or the wait is over. */
  const caughtUp = () => {
    const key = start.key, now = () => stopped || !shared() || copy?.ready() === true;
    if (now()) return undefined;
    return new Promise<void>(resolve => {
      /** `over`: the wait ran out; `start`: it ran out while the copy was starting, so the save waits for that start. */
      let over = false, start = false, timer: unknown;
      const done = () => over || now() || (start && !copy?.starting());
      timer = clock.setTimeout(() => {
        // No one caught the copy up in time and it is starting on its own this very moment: that takes a moment more.
        if (copy?.starting()) { start = true; timer = clock.setTimeout(() => { over = true; foldsReady(); }, LIVE_TEXT_CATCH_UP_MS); }
        else over = true;
        foldsReady();
      }, LIVE_TEXT_CATCH_UP_MS);
      waitingFolds.push(() => {
        if (!done()) return false;
        clock.clearTimeout(timer);
        // Starting again on another copy: the save waits for the share that follows.
        if (stopped && restarting) queueMicrotask(() => { void Promise.resolve(liveSaveReady(key, store)).then(() => resolve()); });
        else resolve();
        return true;
      });
    });
  };
  const stopSaves = onLiveSave(store, start.key, text => copy?.noteSave(text), caughtUp);
  /** This tab's saves made while its copy was not taking part, by blob sha: their text is the draft's, not GitHub's change. */
  const ownSaves = keptSaves.get(store)?.get(start.key) ?? new Map<string, string>();
  if (!keptSaves.has(store)) keptSaves.set(store, new Map());
  keptSaves.get(store)!.set(start.key, ownSaves);
  /** `kept` (a kept copy's saves, blob sha and text one after the other) with this tab's own (`ownSaves`) after them, each
   * save once: the latest twenty. */
  const savesWith = (kept: readonly string[] = []) => {
    const out: string[] = [];
    for (let at = 0; at + 1 < kept.length; at += 2) if (!ownSaves.has(kept[at])) out.push(kept[at], kept[at + 1]);
    return [...out, ...[...ownSaves].flat()].slice(-20);
  };
  /** Others here, as the room's presence says; this tab's own caret (offsets in its text) and whoever draws carets. */
  let peers: ReadonlyMap<string, LivePeer> = new Map(), selection: (() => CaretSelection | undefined) | undefined;
  const caretWatchers = new Set<() => void>();
  const caretsMoved = () => { for (const watcher of [...caretWatchers]) try { watcher(); } catch { /* A caret must not break sharing. */ } };
  /** Agents whose text went into the draft before this tab's copy took part (alone with an agent, no copy kept: TOOLS-219),
   * by connection: where their latest change ended, in the draft's text. The copy places their carets there once it takes
   * part, so an agent working with Lex alone shows its caret too. Their words are this tab's own in the copy, as the draft's. */
  const unplaced = new Map<string, { who: LiveAuthor; index: number }>();
  let draftText = store.text(scope, path);
  // Discard is this tab's own, from the moment it shares the file (alone, loading Yjs, or with a copy): it leaves the
  // shared copy rather than taking everyone's changes away, and drops its kept copy so nothing brings them back.
  const unwatch = store.subscribe(event => {
    if (event.type === "file" && event.key === start.key && event.change === "saved") {
      // Saved before the copy took part (it is starting): the copy notes it once it does.
      const file = store.get(scope, path);
      if (!copy?.ready() && file?.baseSha) {
        ownSaves.set(file.baseSha, file.base);
        // No copy yet: kept with the copy kept from before too, for a reload.
        // Still no copy once the read is back (a copy made meanwhile keeps its own state, saves and all). Every save this tab
        // made goes with it: another save's read, from before this one's write, may write after it.
        if (!copy) void keeper.read(start.key).then(kept => { if (kept && !copy && !stopped && !discarded) keeper.write(start.key, { ...kept, saves: savesWith(kept.saves) }); });
      }
      copy?.saved();
      return;
    }
    if (event.type !== "text" || event.key !== start.key) return;
    const was = draftText;
    draftText = event.text;
    const changes = unplaced.size || liveAuthor() ? changesBetween(was ?? "", event.text, event.changes).sort((a, b) => a.start - b.start) : [];
    // Carets waiting to be placed move with the text that changes before them (from the end back, so each change's
    // offsets still hold): one inside a replaced range goes to the end of what took its place. They move until the copy
    // places them, also while it takes part and the draft follows the room's text it caught up with (`begin`).
    if (unplaced.size) for (const waiting of unplaced.values()) {
      for (let at = changes.length - 1; at >= 0; at--) {
        const { start, end, text } = changes[at];
        if (waiting.index >= end) waiting.index += text.length - (end - start);
        else if (waiting.index > start) waiting.index = start + text.length;
      }
    }
    const agent = liveAuthor();
    if (agent && !discarded && !stopped && !copy?.taking() && was !== undefined && event.origin !== "shared" && event.origin !== "discard" && event.origin !== "external") {
      // The first changed range, as `writeAgent` places a caret: at its end.
      const first = changes[0];
      if (first) {
        const key = agentKey(agent);
        unplaced.delete(key);
        unplaced.set(key, { who: { grant: agent.grant, name: agent.name }, index: first.start + first.text.length });
        while (unplaced.size > AGENT_CARETS) unplaced.delete(unplaced.keys().next().value!);
        // Alone with no copy: one is made now (Yjs loads), so the agent's caret can be drawn.
        if (heard && !editors && !copy && !loading) void load();
      }
    }
    if (event.origin !== "discard" || discarded) return;
    discarded = true;
    keeper.write(start.key, undefined);
    ended("left");
  });
  /** What the copy reads of this share (src/live-text-shared.ts): what stays, and what changes while it runs, live. */
  const context: ShareContext = {
    ports, store, clock, keeper, scope, path, start, preferred, ownSaves, unplaced, savesWith, caretsMoved, authorsChanged, ended, foldsReady,
    get room() { return room; },
    get stopped() { return stopped; }, get discarded() { return discarded; }, get editors() { return editors; }, get apart() { return apart; },
    get peers() { return peers; }, get selection() { return selection; },
    get restarting() { return restarting; }, set restarting(on) { restarting = on; },
  };

  const room: Room = (ports.openRoom ?? openLiveRoom)({
    repo: scope.repo, branch: scope.branch, file: path, ...(ports.clock ? { clock: ports.clock } : {}),
    onMessage(bytes) {
      if (copy) copy.receive(bytes);
      else if (inbox.length < INBOX_LIMIT) inbox.push(Uint8Array.from(bytes));
    },
    // Only other tabs count here: an agent's text joins the copy through the tab that receives its commands (am-25).
    onMembers(members) {
      heard = true;
      clock.clearTimeout(unheard);
      editors = [...members.values()].filter(access => access === "editor").length;
      // Alone with a copy kept from before, it runs that copy still, so a save or a commit is noted in it as with others.
      if (!editors) { if (copy) void copy.startOwn(); else if (!loading) void load(!unplaced.size); }
      else if (!copy && !loading) void load();
      foldsReady();
    },
    onKey: () => copy?.again(),
    onPeers(next) { peers = next; caretsMoved(); copy?.nameAuthors(); },
    onPushed: commit => ports.onPushed?.(scope, commit),
  });

  /** Loads Yjs and makes the copy; `keptOnly`: only to resume a copy kept from before (alone in the room). */
  async function load(keptOnly = false) {
    loading = true;
    try {
      // Alone, the kept copy is read first: without one, Yjs is not loaded (unless an agent wrote meanwhile: `unplaced`).
      const first = keptOnly ? await keeper.read(start.key) : undefined;
      if (stopped || discarded || (keptOnly && (!first || first.base === undefined || editors))) return;
      const Y = await (ports.loadYjs ?? (() => import("yjs")))();
      const kept = keptOnly ? first : await keeper.read(start.key);
      if (stopped || discarded) return;
      // A copy this tab shared before: kept unless the room agreed on another copy meanwhile; then this tab joins that
      // one and carries its own words of the kept copy over (`carryIn`).
      // So is a copy whose draft took a commit in apart from it (folded into the draft while the copy was not running):
      // what the draft holds then is read by words against that copy, not guessed from the texts.
      const now = store.get(scope, path), wanted = preferred.get(start.key);
      const usable = kept && kept.base !== undefined && now ? kept : undefined;
      const resume = usable && (!wanted || sameTag(wanted, usable.tag)) ? usable : undefined;
      if (kept && !usable) keeper.write(start.key, undefined);
      try { copy = makeCopy(context, Y, resume, resume ? undefined : usable); }
      catch (error) {
        // A kept state Yjs cannot apply (damaged, from another Yjs version, or from before copies held their versions):
        // dropped, and this tab joins as a fresh joiner.
        if (!usable) throw error;
        keeper.write(start.key, undefined);
        copy = makeCopy(context, Y, undefined);
      }
      for (const bytes of inbox.splice(0)) copy.receive(bytes);
      copied();
      // With others here, it asks first: a copy of the room catches it up, or (none having one yet) one tab starts it (`receive`).
      if (!editors) await copy.startOwn(); else copy.hello();
    } catch { /* Yjs did not load, or starting the copy failed: this tab keeps its own draft, as before, until the room changes again. */ }
    finally {
      loading = false;
      // Others came meanwhile: they are joined now. An agent that wrote while this read only for a kept copy (and found
      // none) has its copy made now, so its caret is drawn. Commits that waited for this copy fold now (or into the draft).
      if (!copy && !stopped && !discarded && (editors || (keptOnly && unplaced.size))) void load();
      foldsReady();
    }
  }

  const authors: AuthorUndo = {
    undo: (author, history) => copy?.authors.undo(author, history) ?? false,
    can: author => copy?.authors.can(author) ?? false,
  };
  const carets = {
    list: () => copy?.carets() ?? [],
    on: (watcher: () => void) => { caretWatchers.add(watcher); return () => { caretWatchers.delete(watcher); }; },
    own: (next: (() => CaretSelection | undefined) | undefined) => { selection = next; copy?.tellCaret(); },
    /** This tab's own caret now, as offsets in its text. */
    ownNow: () => selection?.(),
  };
  /** `handover`: the page shows again and a new share of it takes over from this one, kept apart (`away`): a commit or a
   * save waiting on this one waits on that one, so the draft never takes a commit in apart from the copy it comes back to. */
  const stop = (handover = false) => {
    restarting ||= handover;
    stopped = true;
    clock.clearTimeout(unheard);
    if (live.get(start.key) === share) live.delete(start.key);
    stopSaves();
    unwatch();
    room.close();
    copy?.destroy();
    copy = undefined;
    for (const attempt of waitingFolds.splice(0)) attempt();
    caretsMoved();
    caretWatchers.clear();
  };
  /** Another page shows: a caught-up copy stays, out of the room (TOOLS-216), so what the draft takes on meanwhile (typing,
   * an agent's change, a commit folded in, `liveFold`) goes into it as it happens, and coming back resumes it with nothing
   * to guess. False when there is no such copy: the share stops. */
  const away = () => {
    if (stopped || discarded) return false;
    apart = true;
    editors = 0;
    heard = true;
    clock.clearTimeout(unheard);
    // Its saves still note the copy and name it with their record: the room takes them by that record (`take`).
    room.close();
    // Not caught up yet: alone from now on, it starts its part on its own (a copy loading still does, once made, `load`).
    // No copy yet: a copy kept from before runs, as when alone (none: a commit folds into the draft, as for any file).
    if (copy && !copy.ready() && !copy.starting()) void copy.startOwn();
    else if (!copy && !loading) void load(true);
    caretsMoved();
    return true;
  };
  return { stop, away, authors, carets };
}

/** The switch for live sharing: on unless this browser's localStorage holds `native-site-editor:live-sharing` = `off`
 * (tests pass `on`). On by default since slice am-31 (Lex, 2026-10-31); `off` keeps a browser out of every room. */
export const LIVE_SHARING_KEY = "native-site-editor:live-sharing";
function liveSharingOn() {
  try { return globalThis.localStorage?.getItem(LIVE_SHARING_KEY) !== "off"; } catch { return true; }
}

/**
 * Live sharing as it runs: calling it stops it. Its name-tag Undo (ticket am-24; carets call it from slices 22, 23 and
 * 25) takes back the latest text change of `author`, the Yjs client id a caret names, in the open file's shared copy.
 */
export interface LiveText {
  (): void;
  /**
   * Takes back `author`'s latest text change in the open file; false when there is none to take back. It is this tab's
   * own step in `history` (the Undo list of the page or pane the name tag is on; the file's own by default), so its
   * Undo puts their words back and its Redo takes them again.
   */
  undoAuthor(author: number, history?: string): boolean;
  /** Whether `author` has a text change in the open file the name tag can take back. */
  canUndoAuthor(author: number): boolean;
  /** Called when what the name tags can take back may have changed; returns its unsubscribe. */
  onAuthorUndo(listener: () => void): () => void;
}

/** The most pages kept apart while another page shows (`away`): each holds a copy and folds its commits. */
const AWAY_LIMIT = 10;
/** Shares the open file while it is open in the draft store, for as long as this runs; calling the result stops it. */
export function startLiveText(ports: LiveTextPorts): LiveText {
  type Share = { key: string; at: { scope: DraftScope; path: string }; stop(handover?: boolean): void; away?(): boolean; authors?: AuthorUndo; drawing?: boolean; undraw?: () => void;
    draw?(): void; carets?(): FileCarets };
  let current: Share | undefined;
  /** Files shared before that another page replaced, by key: their copies take the drafts' changes until they show again.
   * At most AWAY_LIMIT, the oldest stopped first (its copy is kept for the next opening). */
  const aways = new Map<string, Share>();
  const listeners = new Set<() => void>();
  const changed = () => { for (const listener of [...listeners]) try { listener(); } catch { /* A name tag must not break sharing. */ } };
  const port = (stop: () => void): LiveText => Object.assign(stop, {
    undoAuthor: (author: number, history?: string) => current?.authors?.undo(author, history) ?? false,
    canUndoAuthor: (author: number) => current?.authors?.can(author) ?? false,
    onAuthorUndo(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
  // Who changed each file, for the commit (ticket am-26): an agent writing into this tab's drafts is named; a file whose
  // draft went, or is back to its saved text (Undo, Discard, a save here or elsewhere), has no authors.
  const fileAuthors = ports.authors ?? saveAuthors();
  const stopAgents = ports.store.subscribe(event => {
    if (event.type === "history") return;
    if (event.type === "file" && event.change === "dropped") { fileAuthors.forget(event.key); return; }
    if (event.type === "file" && event.change !== "saved" && event.change !== "base") return;
    const file = ports.store.get(event.scope, event.path);
    if (!file || file.baseSha === undefined) return;
    if (!file.changed) { fileAuthors.forget(event.key); return; }
    const agent = event.type === "text" && event.origin !== "shared" && event.origin !== "discard" && event.origin !== "external" ? liveAuthor() : undefined;
    if (agent) fileAuthors.note(event.key, file.baseSha, { name: cut(agent.name), agent: true });
  });
  if (!(ports.on ?? liveSharingOn())) return port(() => { stopAgents(); listeners.clear(); });
  const loadCarets = ports.loadCarets ?? (typeof document === "undefined" ? undefined
    : () => import("./components/live-carets").then(module => module.startCarets));
  /** The file this tab discarded while sharing: it stays out of the copy until another file shows. */
  let left: string | undefined;
  const check = () => {
    const scope = ports.scope(), path = ports.openFile.peek();
    const file = scope && path && scope.repoId > 0 ? ports.store.get(scope, path) : undefined;
    // A file GitHub's text is unknown for, or a deleted, opaque or uploaded one, has no text to share.
    const shareable = (file: ReturnType<typeof ports.store.get>) => file && file.baseSha !== undefined && !file.flags?.deleted && !file.flags?.opaque && !file.flags?.upload;
    const key = shareable(file) && file!.key !== left ? file!.key : undefined;
    // A file away that can no longer be shared (its draft went: sign-out, another workspace) is let go.
    for (const [away, share] of aways) if (!shareable(ports.store.get(share.at.scope, share.at.path))) { aways.delete(away); share.stop(); }
    if (current?.key === key) return;
    // The page showing again is no longer kept apart (taken out first, so it does not count against the limit); the share
    // made for it below takes over what waited on the one kept apart.
    if (key) { aways.get(key)?.stop(true); aways.delete(key); }
    // Its name tags take nothing back from now on: they are told so.
    if (current?.away?.()) {
      aways.set(current.key, current);
      current = undefined;
      for (const [away, share] of aways) { if (aways.size <= AWAY_LIMIT) break; aways.delete(away); share.stop(); }
      changed();
    } else current?.stop();
    if (!key) { current = undefined; return; }
    const at = { scope: file!.scope, path: file!.path };
    const share: Share = { key, at, stop: () => undefined };
    current = share;
    // Someone else is here (the copy is made), or a synced session runs (its guests' carets, and this tab's own for them):
    // the carets are drawn (loaded once) for as long as this file is shared. A session's guests are drawn with the room's.
    const draw = () => {
      if (current !== share || share.drawing || !loadCarets) return;
      share.drawing = true;
      void loadCarets().then(start => {
        if (current !== share) return;
        share.undraw = start({
          ...at, carets: () => [...shared.carets.list(), ...sessionCarets.guests(at.path)],
          onCarets: listener => { const room = shared.carets.on(listener), guests = sessionCarets.watchGuests(listener); return () => { room(); guests(); }; },
          own: read => { shared.carets.own(read); sessionCarets.fileMoved(); },
          canUndo: author => shared.authors.can(author), undo: (author, history) => shared.authors.undo(author, history),
          onAuthorUndo: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        });
      }).catch(() => { share.drawing = false; });
    };
    const shared = shareFile(ports, at.scope, at.path, why => {
      if (aways.get(key) === share) { aways.delete(key); share.stop(); return; }
      if (current !== share) return;
      if (why === "left") left = key;
      share.stop();
      current = undefined;
      check();
    }, () => { if (current === share) changed(); }, draw);
    share.draw = draw;
    share.carets = () => ({ path: at.path, own: shared.carets.ownNow(), others: shared.carets.list() });
    // Someone's caret in the room moved: a session's guests are told.
    shared.carets.on(sessionCarets.fileMoved);
    if (sessionCarets.on()) draw();
    sessionCarets.fileMoved();
    share.stop = handover => { share.undraw?.(); share.undraw = undefined; shared.stop(handover); sessionCarets.fileMoved(); };
    share.away = () => { share.undraw?.(); share.undraw = undefined; share.drawing = false; return shared.away(); };
    share.authors = shared.authors;
  };
  const stopEffect = effect(() => { void ports.openFile.value; untracked(() => { left = undefined; check(); }); });
  // A synced session starting draws the open file's carets (its guests', and this tab's own for them); the session reads
  // the file's carets from here.
  const stopSession = sessionCarets.watchGuests(() => { if (sessionCarets.on()) current?.draw?.(); });
  sessionCarets.offerFile(() => current?.carets?.());
  const stopStore = ports.store.subscribe(event => { if (event.type === "file") check(); });
  // `clear` (sign-out, another workspace) says nothing per file: any settled change looks again, which is cheap.
  const stopState = ports.store.subscribeState(check);
  return port(() => {
    stopAgents(); stopEffect(); stopStore(); stopState(); stopSession(); current?.stop(); current = undefined; listeners.clear();
    sessionCarets.offerFile(undefined);
    for (const share of aways.values()) share.stop();
    aways.clear();
  });
}
