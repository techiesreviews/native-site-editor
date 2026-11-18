// This tab's draft and the copy (TOOLS-216, TOOLS-330): until the copy takes part, its own copy (the copy kept from
// before) takes what the draft takes on; another tab's saved draft adopted here (`external`) is the room's words, not
// this tab's typing; taking part, the draft's typing goes into the copy (an agent's under its own id); and coming back
// with a copy the room left, this tab's own words are carried over by their Yjs ids (`carryIn`). The overview is in
// src/live-text.ts.

import { applyChanges, diffRange, type DraftEvent, type TextChange } from "./draft-store";
import { liveAuthor } from "./live-author";
import { mergeText, runChanges } from "./text-merge";
import { edgeTo as edgeFor, edges, items, metaOf, occurrenceOn, shaOf, textAt, versionsOf, wordRuns } from "./live-versions";
import { noteKey, type KeptCopy } from "./live-text-kept";
import { changesBetween, LOCAL, START, type CopyContext, type Doc, type Yjs } from "./live-text-shared";

/**
 * What was typed since a share began (`began` to `own`), as one change on the kept copy's text (`kept`). Where the
 * kept copy and `began` differ (`stale`), that range is left as the copy has it; a change clear of it moves by its
 * length. Found by characters first; where the typing and the stale range touch there, by words (`runChanges`), so a
 * word deleted beside a word the copy lacks is not taken for typing; across them still, the whole difference from the
 * copy.
 */
export function typedSince(kept: string, began: string, own: string): TextChange | undefined {
  if (own === began) return undefined;
  if (kept === began) return diffRange(began, own);
  return moveClear(kept, [diffRange(began, kept)], [diffRange(began, own)])
    ?? moveClear(kept, runChanges(began, kept), runChanges(began, own)) ?? diffRange(kept, own);
}
/** `typed` (changes on a text, in order) moved past `stale` (changes on the same text, in order) onto `kept`, as one
 * change; none when one of them crosses a stale range. */
function moveClear(kept: string, stale: readonly TextChange[], typed: readonly TextChange[]) {
  const moved: TextChange[] = [];
  for (const change of typed) {
    let shift = 0;
    for (const range of stale) {
      if (change.end <= range.start) break;
      if (change.start < range.end) return undefined;
      shift += range.text.length - (range.end - range.start);
    }
    moved.push({ start: change.start + shift, end: change.end + shift, text: change.text });
  }
  return diffRange(kept, applyChanges(kept, moved).text);
}

/** The draft's side of the copy (part of `makeCopy`, src/live-text-copy.ts): the own copy (`own`, made here from the
 * copy kept from before), the draft's changes (`draftChanged`), and the words carried over (`joinOwn`, `carryIn`). */
export function makeDrafts(c: CopyContext) {
  const { s, Y, doc, text, meta, me, resume, carried, ownClients, applyText, follow, plus } = c;
  const { ports, store, scope, path, start, ownSaves, ended } = s;
  /** A copy kept from before, read apart: its state, as a doc of its own. */
  const keptDoc = (kept: KeptCopy) => {
    const apartDoc = new Y.Doc({ gc: false });
    Y.applyUpdate(apartDoc, kept.update);
    if (!edges(Y, apartDoc).some(edge => !edge.from)) { apartDoc.destroy(); throw new Error("A kept copy without its versions"); }
    return apartDoc;
  };

  /**
   * This tab's own copy until it takes part (TOOLS-216): the copy kept from before (resumed, or carried over to the
   * room's), with what the draft takes on meanwhile (typing, an agent's change, a save) put in as it happens, under ids
   * of this tab's own. Taking part, it joins the room's copy as Yjs updates (`begin`, `carryIn`), never by comparing texts. Its
   * text is the draft's; a draft that took on more after the copy was kept (a reload kept one write and lost the other,
   * or the tab closed before it took part) has that typing put in first, read against the draft as kept.
   */
  const kept = resume ?? carried, own = kept && keptDoc(kept);
  /** The version of GitHub's text the draft is over in the own copy: the kept copy's, or a save it made meanwhile. */
  let ownBase = kept?.base;
  /** What the own copy took from the draft when it was made, read by comparing the draft with the draft as kept (a reload
   * kept the draft's last write and lost the copy's): that range of the kept copy's text (`from`, `to`, on its characters),
   * what it held there (`was`) and the text put in (`put`, the own copy's characters `client`/`clock` on, `len` of them).
   * The draft may have followed someone else's change there rather than been typed: joining a copy that holds that text
   * at that place already, those characters go again (`joinOwn`). */
  const guessed: { from: import("yjs").RelativePosition; to: import("yjs").RelativePosition; was: string; put: string; client: number; clock: number; len: number }[] = [];
  if (own) {
    // An id of its own: this copy writes notes under `me` before it takes part, and two writers under one id break Yjs.
    // Its words carry this tab's name all the same (`startClient`, told to the room).
    let id: number;
    do id = crypto.getRandomValues(new Uint32Array(1))[0];
    while (id === me || own.store.clients.has(id) || doc.store.clients.has(id));
    own.clientID = c.startClient = id;
    ownClients.add(id);
    own.on("afterTransaction", (transaction: import("yjs").Transaction) => {
      if (transaction.deleteSet.clients.size && transaction.local) c.took = plus(c.took, transaction);
    });
    const ownText = own.getText("source"), file = store.get(scope, path), draft = store.text(scope, path);
    /** What was typed from `began` to `upTo`, put into the own copy (`typedSince`: its text is `began`'s, and the copy's). */
    const typeOwn = (began: string, upTo: string) => {
      // The draft is the own copy's text already: nothing was typed apart from it.
      const was = ownText.toString(), change = was === upTo ? undefined : typedSince(was, began, upTo);
      if (!change) return;
      const from = Y.createRelativePositionFromTypeIndex(ownText, change.start, -1), to = Y.createRelativePositionFromTypeIndex(ownText, change.end);
      const clock = Y.getState(own.store, own.clientID);
      own.transact(() => {
        for (const run of wordRuns(was, change)) {
          if (run.end > run.start) ownText.delete(run.start, run.end - run.start);
          if (run.text) ownText.insert(run.start, run.text);
        }
      });
      const len = Y.getState(own.store, own.clientID) - clock;
      if (change.text && len) guessed.push({ from, to, was: was.slice(change.start, change.end), put: change.text, client: own.clientID, clock, len });
    };
    // Saved before the copy loaded (`ownSaves`): the typing up to the save goes in, the own copy is noted as the save,
    // then the typing since.
    const keptSaves = kept.saves ?? [], at = file?.baseSha ? keptSaves.lastIndexOf(file.baseSha) : -1;
    const saved = file?.baseSha && file.baseSha !== (kept.base && shaOf(kept.base)) ? ownSaves.get(file.baseSha) ?? (at >= 0 && at % 2 === 0 ? keptSaves[at + 1] : undefined) : undefined;
    if (draft !== undefined && saved !== undefined && file?.base === saved) {
      typeOwn(kept.draft ?? ownText.toString(), saved);
      noteOwn(file.baseSha!, saved);
      typeOwn(saved, draft);
    } else if (draft !== undefined) {
      let began = kept.draft ?? ownText.toString();
      // A commit the draft took in apart from the copy (it folded into the draft): the draft as kept, merged onto it as that fold did.
      const keptOver = kept.base === undefined ? undefined : textAt(Y, own, edges(Y, own), kept.base);
      if (keptOver !== undefined && file && keptOver !== file.base) began = mergeText(keptOver, began, file.base).text;
      typeOwn(began, draft);
    }
  }
  /** The draft as the own copy last took it: another tab's draft adopted meanwhile (`external`) is not this tab's typing. */
  let draftSeen = store.text(scope, path);
  /** The own copy, holding `text`, noted as GitHub's version `sha`, a save this tab made before it took part: the copy it
   * joins takes that commit as these words, not as GitHub's words a second time. */
  function noteOwn(sha: string, saved: string) {
    const all = own && edges(Y, own);
    if (!own || !all || !ownBase || !versionsOf(all).has(ownBase) || own.getText("source").toString() !== saved) return;
    const node = occurrenceOn(all, ownBase, sha);
    if (versionsOf(all).has(node)) return;
    const noted = noteKey(ownBase, saved), snapshot = Y.encodeSnapshot(Y.snapshot(own)), notes = metaOf(own);
    own.transact(() => { notes.set(`s:${noted}`, snapshot); notes.set(`t:${noted}`, ownBase!); notes.set(`g:${node}`, noted); });
    ownBase = node;
  }
  /** What the draft took on while the own copy stands for it (`changes`, from the end back), put into it: an agent's change
   * under the agent's id. */
  const writeOwn = (changes: TextChange[]) => {
    const agent = liveAuthor(), was = own!.clientID;
    if (agent) own!.clientID = c.carets.agentAuthor(agent).author;
    try { own!.transact(() => { applyText(changes, own!.getText("source")); }); }
    finally { own!.clientID = was; }
  };
  /** The own copy's update this copy lacks, put in as this tab's own change. */
  const joinOwn = () => {
    if (!own) return;
    // What the draft took on unseen (`guessed`), where this copy holds another text than the kept copy did and that text
    // has it: the draft followed it there, so it goes again (the copy's words stay, once).
    const followed = guessed.splice(0).filter(guess => {
      const at = Y.createAbsolutePositionFromRelativePosition(guess.from, doc)?.index, till = Y.createAbsolutePositionFromRelativePosition(guess.to, doc)?.index;
      const between = at === undefined || till === undefined || till < at ? undefined : text.toString().slice(at, till);
      return between !== undefined && between !== guess.was && between.includes(guess.put);
    });
    doc.transact(() => {
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(own, Y.encodeStateVector(doc)));
      const gone = followed.flatMap(guess => Array.from({ length: guess.len }, (_, index) =>
        Y.createRelativePositionFromJSON({ tname: "source", item: Y.createID(guess.client, guess.clock + index) })));
      for (const at of gone) {
        const index = Y.createAbsolutePositionFromRelativePosition(at, doc)?.index;
        if (index !== undefined && Y.compareIDs(Y.createRelativePositionFromTypeIndex(text, index).item, at.item)) text.delete(index, 1);
      }
    }, START);
  };

  /** The draft changed: what it took on goes into the own copy (not taking part yet) or the copy, as this tab's own or an
   * agent's; a draft adopted from another tab of this browser is followed rather than sent. */
  function draftChanged(event: DraftEvent) {
    if (event.type !== "text" || event.key !== start.key) return;
    const seen = draftSeen;
    draftSeen = event.text;
    if (s.discarded || event.origin === "shared" || event.origin === "discard") return;
    // Not taking part yet: the own copy takes it (an own copy's text is the draft's).
    if (!c.synced) {
      const was = own?.getText("source").toString();
      if (was === undefined || was === event.text) return;
      // Another tab of this browser's saved draft, adopted (`reload`): its words are the room's, which this tab follows
      // once it takes part, not its own typing.
      if (event.origin === "external") return;
      // The draft holds such words: only what was typed since goes in.
      if (seen !== undefined && seen !== was) {
        const change = typedSince(was, seen, event.text);
        if (change) writeOwn(wordRuns(was, change));
        return;
      }
      writeOwn(changesBetween(was, event.text, event.changes).sort((a, b) => a.start - b.start).reverse());
      return;
    }
    const now = text.toString();
    // On another page, the copy hears nothing of the room: another tab's draft adopted there holds the room's words this
    // copy lacks. The page stops being kept apart: its copy is kept with the adopted draft as the draft it was kept with,
    // so when the page shows again only what the draft took on after the adoption goes in as its own (`typeOwn`), and the
    // adopted words come with the room's copy.
    if (s.apart && event.origin === "external") { ended("again"); return; }
    // Another tab of this browser's saved draft, adopted (`reload`): it may lag behind this copy, so the draft
    // follows the copy again rather than sending that text to everyone as this tab's edit.
    if (event.origin === "external") { follow(); return; }
    if (event.text === now) return;
    // From the end back; two put in at one place go in the later one first, so they stay in the draft's order
    // (src/draft-store.ts `applyChanges` keeps the given order at one place).
    const changes = changesBetween(now, event.text, event.changes).sort((a, b) => a.start - b.start).reverse();
    // An agent's change written into this tab's drafts (ticket am-25) joins the copy as the agent's.
    const agent = liveAuthor();
    if (agent) c.carets.writeAgent(agent, changes);
    else doc.transact(() => { applyText(changes); }, LOCAL);
  }

  /**
   * Back with a copy of the room the room left (kept from before, or the copy this tab ran until another won, `meet`):
   * each word goes into the room's copy only from the tab that typed it, and only when the room's copy cannot hold it
   * yet, told apart by its Yjs id, never by its text. The own copy (which holds what the draft took on since it was kept)
   * catches up, apart, along GitHub's history to `version`, a version both copies hold: a save of the old copy enters by
   * its record (`recordOf`: the copy as saved, so the old copy knows which of its own words it holds), any other commit
   * as the outside participant. Its own words that `version` does not show, and the characters of `version` its typing
   * took out, then go into this copy at the same places in `version`'s text, which is the same in both (`placeOwn`). True
   * once they went in; false when they could not be placed (GitHub's history unread, or the two copies do not hold the
   * same text at `version`); undefined when the file closed.
   */
  async function carryIn(version: string): Promise<boolean | undefined> {
    const target = textAt(Y, doc, c.github.versions(), version);
    if (!own || target === undefined) return undefined;
    // `version` as GitHub's history has it, with the copies its commit names (and their records).
    const latest = await ports.github?.(scope, path)?.newest?.().catch(() => undefined);
    const sha = shaOf(version);
    const found = latest?.sha === sha ? latest : latest && (await c.github.history(latest.sha, before => before.sha === sha))?.find(before => before.sha === sha);
    if (s.stopped) return undefined;
    const old = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(old, Y.encodeStateAsUpdate(own));
      // A later occurrence of a text (a revert) the old copy lacks enters as one there too.
      const there = versionsOf(c.github.versions(old)).has(version) ? version
        : await c.github.enter(found?.text === target ? found : { sha, text: target }, old, version.length > 40);
      if (!there) return s.stopped ? undefined : false;
      if (s.stopped) return undefined;
      // What the draft took on meanwhile, as the own copy's items.
      Y.applyUpdate(old, Y.encodeStateAsUpdate(own, Y.encodeStateVector(old)));
      const placed = placeOwn(old, ownClients, c.took, version, there);
      return placed;
    } finally { old.destroy(); }
  }
  /** Whether the character `client`/`clock` shows in the copy at `snapshot`. */
  const shows = (snapshot: import("yjs").Snapshot, client: number, clock: number) =>
    clock < (snapshot.sv.get(client) ?? 0) && !Y.isDeleted(snapshot.ds, Y.createID(client, clock));
  /**
   * Where each carried character came from (`placeOwn`), in a copy's `meta` (`o:` keys: a run of characters written
   * under a client from a clock on, and the character it was typed as first: its client and clock): a character as
   * typed, by its own Yjs id, wherever carries took it. Returns the first id of `client`/`clock`, as "client:clock".
   */
  const firstOf = (of: Doc) => {
    const runs = new Map<number, { clock: number; len: number; client: number; first: number }[]>();
    for (const [key, value] of metaOf(of).entries()) {
      const at = /^o:([\da-f]{8}):(\d+)$/.exec(key), was = typeof value === "string" ? value.split(":").map(Number) : [];
      if (!at || was.length !== 3 || !was.every(Number.isSafeInteger)) continue;
      const client = parseInt(at[1], 16);
      runs.set(client, [...runs.get(client) ?? [], { clock: Number(at[2]), client: was[0], first: was[1], len: was[2] }]);
    }
    return (client: number, clock: number) => {
      const run = runs.get(client)?.find(run => clock >= run.clock && clock < run.clock + run.len);
      return run ? `${run.client}:${run.first + clock - run.clock}` : `${client}:${clock}`;
    };
  };
  /**
   * `old`'s own words (`mine`) that `version` does not show, and the characters of `version` its typing took out
   * (`gone`), put into this copy at the same places in `version`'s text: after the character of `version` before each.
   * Characters this copy holds already (the same character as typed, `firstOf`: the two are one copy, or a carry took it
   * here before) are not put in again; those the old copy's typing took out go here too. Each character put in notes
   * where it came from. False when the two copies do not hold the same text at `version`.
   */
  function placeOwn(old: Doc, mine: ReadonlySet<number>, gone: ReturnType<Yjs["createDeleteSet"]>, version: string, oldVersion = version) {
    type Id = import("yjs").ID;
    const there = Y.decodeSnapshot(edgeFor(c.github.versions(old), oldVersion)!.snapshot), here = Y.decodeSnapshot(edgeFor(c.github.versions(doc), version)!.snapshot);
    /** `version`'s characters in this copy, in order; and every character this copy holds, by the character it was typed as. */
    const marks: { ch: string; id: Id }[] = [], held = new Map<string, Id>(), firstHere = firstOf(doc), firstThere = firstOf(old);
    for (const item of items(doc)) for (let index = 0; index < item.text.length; index++) {
      const id = Y.createID(item.client, item.clock + index);
      held.set(firstHere(id.client, id.clock), id);
      if (shows(here, id.client, id.clock)) marks.push({ ch: item.text[index], id });
    }
    /** At each place (the count of `version`'s characters before it), the own text `old` holds there, each character with
     * the one it was typed as; and what goes. */
    const puts = new Map<number, { ch: string; first: string }[]>(), drops: Id[] = [];
    /** Places where the old copy held someone else's characters that `version` does not show (taken out since). */
    const others = new Set<number>();
    let at = 0, oldMarks = "";
    for (const item of items(old)) for (let index = 0; index < item.text.length; index++) {
      const clock = item.clock + index, id = Y.createID(item.client, clock), ch = item.text[index];
      if (shows(there, item.client, clock)) {
        oldMarks += ch;
        if (item.deleted && Y.isDeleted(gone, id) && at < marks.length) drops.push(marks[at].id);
        at++;
        continue;
      }
      if (!mine.has(item.client)) { others.add(at); continue; }
      const first = firstThere(item.client, clock), here = held.get(first);
      if (here) { if (item.deleted && Y.isDeleted(gone, id)) drops.push(here); continue; }
      if (item.deleted) continue;
      const put = puts.get(at);
      if (put) put.push({ ch, first }); else puts.set(at, [{ ch, first }]);
    }
    if (oldMarks !== marks.map(mark => mark.ch).join("")) return false;
    // A place inside a word of `version` where the old copy had someone else's characters taken out since (its words were
    // beside those, not inside this word): the word's edge, before it for words that end with white space, else after
    // it, so no word is cut apart here. Typing inside a word itself ("Fresh" to "French") stays where it was typed.
    const inside = (index: number) => index > 0 && index < marks.length && !/\s/.test(marks[index - 1].ch) && !/\s/.test(marks[index].ch)
      && marks[index - 1].ch !== ">" && marks[index].ch !== "<";
    for (const [index, put] of [...puts]) {
      if (!inside(index) || !others.has(index)) continue;
      let edge = index;
      if (/\s/.test(put.at(-1)!.ch)) while (inside(edge)) edge--; else while (inside(edge)) edge++;
      puts.delete(index);
      const there = puts.get(edge);
      if (there) for (const char of put) there.push(char); else puts.set(edge, put);
    }
    // Each place as a Yjs relative position, so the changes before it do not move it: after the character before it.
    // The start of an empty version is the start of the text (a position with no item and no lean reads as its end).
    const place = (index: number) => Y.createRelativePositionFromJSON(index ? { tname: "source", item: marks[index - 1].id, assoc: -1 } : marks.length ? { tname: "source", item: marks[0].id } : { tname: "source", assoc: -1 });
    const deleted = Y.createDeleteSetFromStructStore(doc.store);
    const changes = [...[...puts].map(([index, put]) => ({ at: place(index), put })),
      ...drops.filter(id => !Y.isDeleted(deleted, id)).map(id => ({ at: Y.createRelativePositionFromJSON({ tname: "source", item: id }), put: undefined }))];
    doc.transact(() => {
      /** The characters put in, by their clock here, with the one each was typed as. */
      const wrote: { clock: number; first: string }[] = [];
      for (const change of changes) {
        const index = Y.createAbsolutePositionFromRelativePosition(change.at, doc)?.index;
        if (index === undefined) continue;
        if (!change.put) { text.delete(index, 1); continue; }
        const from = Y.getState(doc.store, doc.clientID);
        text.insert(index, change.put.map(char => char.ch).join(""));
        change.put.forEach((char, offset) => wrote.push({ clock: from + offset, first: char.first }));
      }
      // One note per run of characters typed one after another.
      for (let index = 0; index < wrote.length;) {
        const [client, first] = wrote[index].first.split(":").map(Number);
        let len = 1;
        while (index + len < wrote.length && wrote[index + len].clock === wrote[index].clock + len && wrote[index + len].first === `${client}:${first + len}`) len++;
        meta.set(`o:${doc.clientID.toString(16).padStart(8, "0")}:${wrote[index].clock}`, `${client}:${first}:${len}`);
        index += len;
      }
    }, START);
    return true;
  }
  return { own, kept, get ownBase() { return ownBase; }, noteOwn, writeOwn, joinOwn, draftChanged, carryIn };
}
export type Drafts = ReturnType<typeof makeDrafts>;
