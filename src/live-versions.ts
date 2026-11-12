// GitHub's versions of a file inside its live room's one shared copy (ticket am-59; src/live-text.ts). A commit made
// outside the editor enters the copy as one more participant whose changes every tab makes the very same way, so
// whichever tab takes it first, the others find it there and Yjs takes it once.
//
// - The copy is born from one version of GitHub's text, written under a client id derived from that version, and keeps
//   every Yjs item (no garbage collection), so the copy as it was at any version can be made again from a snapshot.
// - An edge turns one version's text into the next: the outside participant's changes (the words that differ, as
//   `wordRuns` writes them) made on the copy as it was at the older version, under a client id derived from both
//   versions and that snapshot, so every tab writes the same items. Its record (`e:` and `b:` in the copy's `meta` map:
//   the two versions, and the snapshot after it) is written by that client in the same update.
// - A save from the room is no outside change: the saving tab notes the copy as saved (`s:` and `t:`, keyed by a hash
//   of the text), and a tab hearing the commit takes the note as the new version (`g:`), with no text entering.
// - Two edges into one version (two tabs folding from different versions at once, or a save folded in as an outside
//   change before its note arrived): the copy keeps one way there and every tab takes the other's words out
//   (`superseded`), so each word of GitHub's text shows once. Kept is a save; else the edge that came by more versions;
//   else, from the same version, the lowest client id.
// - A version is GitHub's blob sha, the same for the same text: a commit bringing back an earlier text exactly (a revert,
//   A to B to A, often a save) is another occurrence of it, `<sha>~<n>` after n earlier ones on the way to it
//   (`occurrenceOn`), so the copy's versions stay in GitHub's order and a tab back on A is not taken on to B.
// - Every version enters on top of the one right before it on GitHub (src/live-text.ts `enter`, from GitHub's history of
//   the file), so the copy holds GitHub's versions in GitHub's order whichever tab heard which commit first.
// - The clash rule (ticket 09, as src/outside-merge.ts): the latest version shows. Where GitHub's change replaced the
//   words around a tab's own change, that change is undone whole (`clashes`, matched against src/text-merge.ts
//   `mergeText`): the tab's own words go, as one Undo step of its own, and GitHub's words it took out come back, written
//   the same way by every tab. Taking out without putting back glued words together or lost one (lead, 2026-11-11).
//
// Loaded with src/live-text.ts, never at boot.

import { applyChanges, diffRange, type TextChange } from "./draft-store";
import { mergeText, runChanges, splitWords, wordChanges } from "./text-merge";

type Yjs = typeof import("yjs");
type Doc = import("yjs").Doc;

/** One way from a version of GitHub's text to another: an edge's `client` writes its words; a save's has none. */
export interface Edge {
  /** Its key in `meta`, unique per edge. */
  id: string;
  /** The version it starts from ("" for the copy's birth) and the one it makes, as 40 hex digits (src/live-text.ts
   * `versionOf`), with `~<n>` for a later occurrence of the same text (`occurrenceOn`). */
  from: string;
  to: string;
  /** The Yjs client id its words carry; none for a save. */
  client?: number;
  /** The copy as it is at `to`: a Yjs snapshot (`Y.encodeSnapshot`). */
  snapshot: Uint8Array;
}

const utf8 = new TextEncoder();
const hexOf = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
/** SHA-256 of `text` as hex. */
export async function digestHex(text: string | Uint8Array) {
  return hexOf(new Uint8Array(await crypto.subtle.digest("SHA-256", typeof text === "string" ? utf8.encode(text) : Uint8Array.from(text))));
}
/** A Yjs client id derived from `text`: every tab derives the same. */
export async function clientOf(text: string) {
  return parseInt((await digestHex(text)).slice(0, 8), 16) >>> 0;
}
const clientKey = (client: number) => client.toString(16).padStart(8, "0");

/**
 * `change` on `text` as whole words, from the end of the text back: widened to the white space around it, then split
 * where it keeps runs of the text (words between white space), so the words it kept are not written again. Inside a run
 * it changes, only the parts (words, white space, single other characters) it changes are written, as long as nothing
 * goes in strictly inside a word: white space taken out between two words, or a word taken out of `<p>…</p>`, writes
 * nothing again, and a word put right against another leaves that one as it is. Written into a shared copy, a part
 * taken out and put in again by two tabs at once would show twice, and a single range would take others' words in it
 * away and type its own again (sweep 2026-11-10 item 1).
 */
export function wordRuns(text: string, change: TextChange): TextChange[] {
  let begin = change.start, end = change.end;
  while (begin > 0 && !/\s/.test(text[begin - 1])) begin--;
  while (end < text.length && !/\s/.test(text[end])) end++;
  const kept = text.slice(begin, end), parts = wordChanges(kept, text.slice(begin, change.start) + change.text + text.slice(change.end, end));
  // Text put in strictly inside a word (between two characters of it that stay): the runs it touches are written whole.
  // A tag's edge is a word's edge too: a word put in right before `</p>` or after `<p>` leaves the tag as it is.
  const edge = (at: number) => at === 0 || at === kept.length || /\s/.test(kept[at - 1]) || /\s/.test(kept[at]) || kept[at - 1] === ">" || kept[at] === "<";
  if (parts.every(part => !part.text || edge(part.start) || edge(part.end))) return parts.map(part => ({ start: begin + part.start, end: begin + part.end, text: part.text })).reverse();
  const out: TextChange[] = [];
  for (const run of runChanges(kept, text.slice(begin, change.start) + change.text + text.slice(change.end, end))) out.push({ start: begin + run.start, end: begin + run.end, text: run.text });
  return out.reverse();
}

/** Changes that turn `from` into `to` as whole words (`wordRuns` over the range between them), else that one range: text
 * put in beside a word starting with the same character is not taken for text put in inside that word, which would split
 * Undo steps around it and cut words apart when they are undone (src/shared-undo.ts). */
export function wordDiff(from: string, to: string): TextChange[] {
  const range = diffRange(from, to), words = wordRuns(from, range);
  try { if (applyChanges(from, words).text === to) return words; } catch { /* The one range, then. */ }
  return [range];
}

/** `changes`, ordered from the end of the text back, made on `text`. What replaces a word goes in inside it, after its
 * first character, and the rest of it goes: words someone else puts in right before or right after that word keep
 * their side of it, as in src/text-merge.ts `mergeText`. Put in where the word was, Yjs would order the two by its own
 * rule, and they would glue ("Saturdaydaily"). */
function apply(text: import("yjs").Text, changes: readonly TextChange[]) {
  for (const { start, end, text: put } of changes) {
    if (end === start) { if (put) text.insert(start, put); continue; }
    if (put) text.insert(start + 1, put);
    if (end > start + 1) text.delete(start + 1 + put.length, end - start - 1);
    text.delete(start, 1);
  }
}

/** The copy's record of its versions. */
export const metaOf = (doc: Doc) => doc.getMap<unknown>("meta");

/** Every edge the copy holds whose snapshot it can make again now (its items all arrived). */
export function edges(Y: Yjs, doc: Doc): Edge[] {
  const meta = metaOf(doc), out: Edge[] = [];
  for (const [key, value] of meta.entries()) {
    if (key.startsWith("e:") && typeof value === "string") {
      const snapshot = meta.get(`b:${key.slice(2)}`), [from, to] = value.split(" ");
      if (snapshot instanceof Uint8Array && to && ready(Y, doc, snapshot))
        out.push({ id: key, from: from === "-" ? "" : from, to, client: parseInt(key.slice(2), 16) >>> 0, snapshot });
    } else if (key.startsWith("g:") && typeof value === "string") {
      const snapshot = meta.get(`s:${value}`), from = meta.get(`t:${value}`);
      if (snapshot instanceof Uint8Array && typeof from === "string" && ready(Y, doc, snapshot)) out.push({ id: key, from, to: key.slice(2), snapshot });
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Whether every item `snapshot` names has reached `doc`. */
function ready(Y: Yjs, doc: Doc, snapshot: Uint8Array) {
  try {
    const { sv } = Y.decodeSnapshot(snapshot);
    for (const [client, clock] of sv) if (Y.getState(doc.store, client) < clock) return false;
    return true;
  } catch { return false; }
}

/** The versions `edges` reach, each with the versions that came before it. */
function ancestry(all: readonly Edge[]) {
  const parents = new Map<string, Set<string>>();
  for (const edge of all) { if (!parents.has(edge.to)) parents.set(edge.to, new Set()); if (edge.from) parents.get(edge.to)!.add(edge.from); }
  const memo = new Map<string, Set<string>>();
  const before = (version: string): Set<string> => {
    const known = memo.get(version);
    if (known) return known;
    const out = new Set<string>();
    memo.set(version, out);
    for (const parent of parents.get(version) ?? []) { out.add(parent); for (const older of before(parent)) out.add(older); }
    return out;
  };
  return before;
}

/** Edges whose words the copy takes out: another way into the same version is kept (see the header). */
export function superseded(all: readonly Edge[]) {
  const before = ancestry(all), out = new Set<Edge>();
  for (const edge of all) {
    if (edge.client === undefined) continue;
    for (const other of all) {
      if (other === edge || other.to !== edge.to) continue;
      if (other.client === undefined || (other.from === edge.from ? other.id < edge.id : before(other.from).has(edge.from))) { out.add(edge); break; }
    }
  }
  return out;
}

/** The edge that stands for `version`: a save, else one not superseded, the lowest id first. */
export function edgeTo(all: readonly Edge[], version: string) {
  const into = all.filter(edge => edge.to === version);
  if (!into.length) return undefined;
  const gone = superseded(all);
  return into.find(edge => edge.client === undefined) ?? into.find(edge => !gone.has(edge)) ?? into[0];
}

/** The versions the copy holds. */
export const versionsOf = (all: readonly Edge[]) => new Set(all.map(edge => edge.to));

/** GitHub's blob sha of the copy's version `version` (one of its occurrences). */
export const shaOf = (version: string) => version.slice(0, 40);

/** The copy's version for GitHub's `sha` entering on top of its version `from`: `from` itself when it is that text;
 * else `sha`, or `sha~<n>` when n occurrences of that text came before (`from` and the versions before it): a revert. */
export function occurrenceOn(all: readonly Edge[], from: string, sha: string) {
  if (shaOf(from) === sha) return from;
  let count = 0;
  for (const version of [from, ...ancestry(all)(from)]) if (shaOf(version) === sha) count++;
  return count ? `${sha}~${count}` : sha;
}

/** The copy's latest occurrence of GitHub's `sha` (the one most occurrences on), if it holds one. */
export function newestOf(all: readonly Edge[], sha: string) {
  let out: string | undefined, most = -1;
  for (const { to } of all) {
    if (shaOf(to) !== sha) continue;
    const count = to.length > 40 ? Number(to.slice(41)) : 0;
    if (count > most) { most = count; out = to; }
  }
  return out;
}

/** The newest version reached from `version`: the one most versions on (the lowest key on a tie). */
export function tipOf(all: readonly Edge[], version: string) {
  const depth = new Map<string, number>([[version, 0]]);
  // Longest way on; a round per edge at most, so a loop (which no tab makes) cannot hold it.
  for (let round = 0; round <= all.length; round++) {
    let grew = false;
    for (const edge of all) {
      const at = depth.get(edge.from);
      if (at === undefined || edge.to === version || (depth.get(edge.to) ?? -1) >= at + 1) continue;
      depth.set(edge.to, at + 1);
      grew = true;
    }
    if (!grew) break;
  }
  return [...depth].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
}

/** The newest version the copy holds: the tip from its birth. */
export function headOf(all: readonly Edge[]) {
  const birth = all.find(edge => !edge.from);
  return birth && tipOf(all, birth.to);
}

/** The copy as it was at `snapshot`, made again (a doc of its own, without garbage collection). */
export function copyAt(Y: Yjs, doc: Doc, snapshot: Uint8Array) {
  return Y.createDocFromSnapshot(doc, Y.decodeSnapshot(snapshot), new Y.Doc({ gc: false }));
}

/** GitHub's text at `version`, as the copy holds it; none when it does not hold it. */
export function textAt(Y: Yjs, doc: Doc, all: readonly Edge[], version: string) {
  const edge = edgeTo(all, version);
  if (!edge) return undefined;
  const at = copyAt(Y, doc, edge.snapshot);
  try { return at.getText("source").toString(); } finally { at.destroy(); }
}

/** The update that starts a copy at `version` with GitHub's `text`: every tab starting there makes the very same. */
export async function birthUpdate(Y: Yjs, version: string, text: string) {
  const client = await clientOf(`base\n${version}`);
  const doc = new Y.Doc({ gc: false });
  doc.clientID = client;
  doc.transact(() => { if (text) doc.getText("source").insert(0, text); });
  const snapshot = Y.encodeSnapshot(Y.snapshot(doc));
  doc.transact(() => { metaOf(doc).set(`e:${clientKey(client)}`, `- ${version}`); metaOf(doc).set(`b:${clientKey(client)}`, snapshot); });
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

/** Writes `edits` on the copy as it was at `snapshot` under `client`, then `record` (meta keys) under it too; returns
 * the update holding only what it wrote, and the snapshot after the edits (before the record). */
function writeOn(Y: Yjs, doc: Doc, snapshot: Uint8Array, client: number, edits: (text: import("yjs").Text) => void, record?: (meta: import("yjs").Map<unknown>, after: Uint8Array) => void) {
  const at = copyAt(Y, doc, snapshot);
  try {
    at.clientID = client;
    const before = Y.encodeStateVector(at), text = at.getText("source");
    at.transact(() => edits(text));
    const after = Y.encodeSnapshot(Y.snapshot(at));
    if (record) at.transact(() => record(metaOf(at), after));
    return { update: Y.encodeStateAsUpdate(at, before), text: text.toString() };
  } finally { at.destroy(); }
}

/** The client id an edge from `from` (its snapshot `snapshot`) to `to` writes under. */
export async function edgeClient(from: string, to: string, snapshot: Uint8Array) {
  return clientOf(`outside\n${from}\n${to}\n${await digestHex(snapshot)}`);
}

/**
 * The outside participant's update turning the copy's `from` into `to` (GitHub's `text`): its words written on the copy
 * as it was at `from`, and its record. `client`: `edgeClient` for these. Identical, byte for byte, in every tab whose
 * copy holds `from` the same way. None when the copy does not hold `from`.
 */
export function edgeUpdate(Y: Yjs, doc: Doc, from: Edge, to: string, text: string, client: number) {
  const made = writeOn(Y, doc, from.snapshot, client, source => {
    const old = source.toString();
    if (old !== text) apply(source, wordRuns(old, diffRange(old, text)));
  }, (meta, after) => { meta.set(`e:${clientKey(client)}`, `${from.to} ${to}`); meta.set(`b:${clientKey(client)}`, after); });
  return made.text === text ? made.update : undefined;
}

/** A draft's changes over GitHub's `version` (its text `base`), as the update a tab with that very draft makes too:
 * written word by word on the copy as it was at that version, under `client`. */
export function draftUpdate(Y: Yjs, doc: Doc, at: Edge, base: string, draft: string, client: number) {
  return writeOn(Y, doc, at.snapshot, client, source => { apply(source, wordRuns(base, diffRange(base, draft))); }).update;
}

/** The items of `doc`'s text in order: their client, whether deleted, and their text. */
function items(doc: Doc) {
  const out: { client: number; clock: number; deleted: boolean; text: string }[] = [];
  for (let item = doc.getText("source")._start; item; item = item.right) {
    if (!item.countable) continue;
    const content = item.content as { str?: unknown };
    if (typeof content.str === "string") out.push({ client: item.id.client, clock: item.id.clock, deleted: item.deleted, text: content.str });
  }
  return out;
}

/** The copy's text with only the words `keep` keeps (by each item's client id and clock). */
export function textWith(doc: Doc, keep: (client: number, clock: number) => boolean) {
  let out = "";
  for (const item of items(doc)) if (!item.deleted && keep(item.client, item.clock)) out += item.text;
  return out;
}

/** The changes, in the copy's text now (from the end back), that take out the words `edge` wrote: the copy keeps another way. */
export function wordsOf(doc: Doc, client: number): TextChange[] {
  const out: TextChange[] = [];
  let at = 0;
  for (const item of items(doc)) {
    if (item.deleted) continue;
    if (item.client === client) {
      const last = out.at(-1);
      if (last && last.end === at) last.end += item.text.length; else out.push({ start: at, end: at + item.text.length, text: "" });
    }
    at += item.text.length;
  }
  return out.reverse();
}


/** What the clash rule does in this tab once an edge came in (`clashes`). */
export interface Clash {
  /** This tab's change: its own words that go, GitHub's words it took out that come back, in the copy's text now, from
   * the end back. One Undo step of its own. */
  out: TextChange[];
  /** GitHub's words coming back as the outside participant writes them, which every tab putting back the same word
   * writes the very same (Yjs takes it once); `out` then finds them in the copy. */
  back?: Uint8Array;
  /** Whether GitHub's change and the typists' clashed (src/text-merge.ts `mergeText`). Without a clash, `out` only takes
   * out what the copy holds twice (a word typed and saved here that came in again as GitHub's): no one's change, no
   * Undo step, as src/outside-merge.ts `foldFile` makes none. */
  clashed?: boolean;
}

/** How well a change's end sits between characters `left` and `right`: a line, white space, a tag's or the text's edge. */
const edgeFit = (left: string | undefined, right: string | undefined) =>
  left === undefined || right === undefined || left === "\n" || right === "\n" || /\s/.test(left) || /\s/.test(right) || left === ">" || right === "<" ? 1 : 0;

/**
 * Each change of `changes` (on `text`, in order) that only takes out characters of this tab's own (`own`, by index in
 * `text`) moved sideways along the same characters, as far as only its own go, to where its ends sit at word edges:
 * the text it makes is the same. Its Undo step is moved past others' changes by offsets (src/shared-undo.ts), so a
 * step from inside one word to inside the next ("16» «" for "«16» ") is undone a character off, cutting a word apart.
 */
function alignWords(text: string, changes: TextChange[], own: (index: number) => boolean) {
  changes.forEach((change, at) => {
    if (change.text || change.end <= change.start) return;
    const low = at ? changes[at - 1].end : 0, high = at + 1 < changes.length ? changes[at + 1].start : text.length;
    const fit = (start: number, end: number) => edgeFit(text[start - 1], text[start]) + edgeFit(text[end - 1], text[end]);
    let start = change.start, end = change.end, best = { start, end, score: fit(start, end) };
    while (start > low && text[start - 1] === text[end - 1] && own(start - 1)) {
      start--; end--;
      if (fit(start, end) > best.score) best = { start, end, score: fit(start, end) };
    }
    start = change.start; end = change.end;
    while (end < high && text[start] === text[end] && own(end)) {
      start++; end++;
      if (fit(start, end) > best.score) best = { start, end, score: fit(start, end) };
    }
    change.start = best.start; change.end = best.end;
  });
}

/** A 32-bit FNV-1a hash of `text`: the client id a word put back is written under, the same in every tab. */
function hashClient(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return hash >>> 0;
}

/** Past this many cells (the clash's characters in the copy times those of the merged text) the clash is left as it is. */
const MATCH_LIMIT = 1_000_000;
/** The cost of a character the copy cannot show or hide as the merged text has it: matched only when nothing else can be. */
const MISS = 1024;
/** How far a clash is looked at beside the first and last characters that differ, at most. */
const WIDEN = 400;

/**
 * The clash rule for this tab once `edge` came in (ticket 09, as src/outside-merge.ts): the copy's text becomes the
 * one src/text-merge.ts `mergeText` gives a draft (from `edge`'s older version: the typists' words, GitHub's), as far as
 * this tab's own part allows. Where the latest version shows GitHub's words, this tab's change there is undone whole:
 * its own words (`mine`: whether a client id is this tab's) go, and GitHub's words it took out (`took`: whether this tab
 * took out the character with that id) come back, as one change of this tab's own (one Undo brings its words back).
 * Half of it, words taken out but none put back, glued the words on both sides ("Saturdayrye") or lost one. The words
 * coming back are written first as the outside participant's (`back`: each word of the older version again whole, in
 * its place, under a client id derived from it and the edge), so two tabs putting back the same word show it once.
 * None when the copy shows the merged text, or this tab's part cannot make it (words merely put in another order stay).
 */
export function clashes(Y: Yjs, doc: Doc, all: readonly Edge[], edge: Edge, mine: (client: number) => boolean, took: (client: number, clock: number) => boolean): Clash {
  const none: Clash = { out: [] };
  if (edge.client === undefined || !edge.from) return none;
  const from = edgeTo(all, edge.from);
  if (!from) return none;
  const was = Y.decodeSnapshot(from.snapshot), now = Y.decodeSnapshot(edge.snapshot);
  const versions = all.map(other => Y.decodeSnapshot(other.snapshot).ds);
  const shows = (at: import("yjs").Snapshot, client: number, clock: number) => clock < (at.sv.get(client) ?? 0) && !Y.isDeleted(at.ds, Y.createID(client, clock));
  // Each character of the copy: the older version's text, GitHub's, the copy as the typists made it (without the edge:
  // its words left out and the words it took out kept), and the copy now. `kind`: shown and stays (0), this tab's own
  // shown (1), GitHub's taken out by this tab (2), else (3).
  const list: { ch: string; kind: number; client: number; clock: number; old: number; new: number }[] = [];
  let base = "", ours = "", theirs = "", current = "";
  for (const item of items(doc)) for (let index = 0; index < item.text.length; index++) {
    const ch = item.text[index], client = item.client, clock = item.clock + index, id = Y.createID(client, clock);
    const old = shows(was, client, clock) ? base.length : -1, made = shows(now, client, clock) ? theirs.length : -1;
    if (old >= 0) base += ch;
    if (made >= 0) theirs += ch;
    if (client !== edge.client && (!item.deleted || (Y.isDeleted(now.ds, id) && !Y.isDeleted(was.ds, id) && !took(client, clock)))) ours += ch;
    if (!item.deleted) current += ch;
    const kind = !item.deleted ? (mine(client) ? 1 : 0) : old >= 0 && made >= 0 && took(client, clock) && !versions.some(ds => Y.isDeleted(ds, id)) ? 2 : 3;
    list.push({ ch, kind, client, clock, old, new: made });
  }
  const merged = mergeText(base, ours, theirs), target = merged.text;
  if (target === current) return none;
  // This tab's part cannot make the merged text (its words and others' put in another order, say): where GitHub's words
  // show, its own whole words that the latest version no longer has go, and nothing comes back.
  const ownWords = (): Clash => {
    if (!merged.clashed) return none;
    const owners = list.filter(char => char.kind < 2).map(char => char.kind === 1), changes = runChanges(current, target);
    const added = changes.map(change => change.text).join(""), out: TextChange[] = [];
    for (const change of changes) {
      // A word moved (taken out here, put in elsewhere) is not a clash.
      if (change.end <= change.start || added.includes(current.slice(change.start, change.end).trim())) continue;
      for (let index = change.start; index < change.end; index++) {
        if (!owners[index]) continue;
        const last = out.at(-1);
        if (last && last.end === index) last.end++; else out.push({ start: index, end: index + 1, text: "" });
      }
    }
    return { out: out.reverse(), clashed: true };
  };
  const shown: number[] = [];
  list.forEach((char, index) => { if (char.kind < 2) shown.push(index); });
  const out: TextChange[] = [], back: number[] = [];
  const change = (index: number, gone: number, put: string) => {
    const last = out.at(-1);
    if (last && last.end === index) { last.end += gone; last.text += put; } else out.push({ start: index, end: index + gone, text: put });
  };
  /** The cheapest way to show the merged text in one stretch: the copy from `head` to `end` (offsets in its text) showing
   * the merged text from `from` to `to`. False when it cannot (too large, or this tab's part cannot make it). */
  const region = (head: number, end: number, from: number, to: number) => {
    // Widened to the whole line (within WIDEN characters, text both have): the same text can be taken out in several
    // places, and the cheapest way (this tab's own words) may lie beside the first difference.
    const wider = head && Math.min(head - Math.max(current.lastIndexOf("\n", head - 1) + 1, head - WIDEN), from);
    head -= wider; from -= wider;
    const line = current.indexOf("\n", end), after = Math.min((line < 0 ? current.length : line) - end, WIDEN, target.length - to);
    end += after; to += after;
    const lo = head ? shown[head - 1] + 1 : 0, hi = end < shown.length ? shown[end] : list.length;
    const want = target.slice(from, to), n = hi - lo, m = want.length;
    if ((n + 1) * (m + 1) > MATCH_LIMIT) return false;
    // cost[i][j], the copy's characters from i on showing `want` from j on. A shown character stays (or, this tab's own,
    // goes for 1); one taken out stays out (or, GitHub's taken by this tab, comes back for 1); what cannot match costs MISS.
    const cost = new Int32Array((n + 1) * (m + 1)), at = (i: number, j: number) => i * (m + 1) + j;
    for (let j = m - 1; j >= 0; j--) cost[at(n, j)] = cost[at(n, j + 1)] + MISS;
    const steps = (i: number, j: number) => {
      const { ch, kind } = list[lo + i], match = j < m && want[j] === ch;
      return {
        skip: cost[at(i + 1, j)] + (kind === 0 ? MISS : kind === 1 ? 1 : 0),
        take: match && kind !== 3 ? cost[at(i + 1, j + 1)] + (kind === 2 ? 1 : 0) : Infinity,
        miss: j < m ? cost[at(i, j + 1)] + MISS : Infinity,
      };
    };
    for (let i = n - 1; i >= 0; i--) for (let j = m; j >= 0; j--) { const step = steps(i, j); cost[at(i, j)] = Math.min(step.skip, step.take, step.miss); }
    if (cost[0] >= MISS) return false;
    for (let i = 0, j = 0, index = head; i < n;) {
      const step = steps(i, j), { ch, kind } = list[lo + i], best = cost[at(i, j)];
      if (step.take === best) {
        if (kind === 2) { change(index, 0, ch); back.push(lo + i); }
        else index++;
        i++; j++;
      } else if (step.skip === best) {
        if (kind === 1) change(index, 1, "");
        if (kind < 2) index++;
        i++;
      } else j++;
    }
    return true;
  };
  // Only where the copy and the merged text differ: each stretch of differences on its own (two clashes far apart on one
  // page are two small matches, not one too large), stretches closer than twice WIDEN as one.
  const stretches: { head: number; end: number; from: number; to: number }[] = [];
  let shift = 0;
  for (const part of [...runChanges(current, target)].sort((a, b) => a.start - b.start)) {
    const from = part.start + shift, last = stretches.at(-1);
    if (last && part.start - last.end < 2 * WIDEN) { last.end = part.end; last.to = from + part.text.length; }
    else stretches.push({ head: part.start, end: part.end, from, to: from + part.text.length });
    shift += part.text.length - (part.end - part.start);
  }
  if (!stretches.length || !stretches.every(part => region(part.head, part.end, part.from, part.to))) return ownWords();
  alignWords(current, out, index => list[shown[index]].kind === 1);
  out.reverse();
  // The merged text is read from the copy, the typists' part guessed where others took out what GitHub took out too: a
  // change making a word neither the copy, GitHub nor the older version has (a word cut apart, two glued) is not made.
  const runs = new Set(`${current} ${theirs} ${base}`.split(/\s+/));
  if (out.reduce((text, change) => text.slice(0, change.start) + change.text + text.slice(change.end), current).split(/\s+/).some(run => !runs.has(run))) return ownWords();
  if (!back.length) return { out, clashed: merged.clashed };
  // Each word of the older version with a character coming back, written again whole as GitHub's version has it, in its
  // own place (as `apply` replaces a word), its own characters taken out: one way per word, the same in every tab.
  const starts: number[] = [];
  let offset = 0;
  for (const part of splitWords(base)) { starts.push(offset); offset += part.length; }
  const wordOf = (old: number) => { let low = 0, high = starts.length - 1; while (low < high) { const mid = (low + high + 1) >> 1; if (starts[mid] <= old) low = mid; else high = mid - 1; } return low; };
  const words = new Set(back.map(index => wordOf(list[index].old))), updates: Uint8Array[] = [];
  for (const word of words) {
    const chars = list.filter(char => char.old >= 0 && char.new >= 0 && wordOf(char.old) === word), start = chars[0].new;
    if (chars.at(-1)!.new - start + 1 !== chars.length) continue;
    const client = hashClient(`back\n${edge.id}\n${chars[0].client}:${chars[0].clock}`);
    updates.push(writeOn(Y, doc, edge.snapshot, client, source => apply(source, [{ start, end: start + chars.length, text: chars.map(char => char.ch).join("") }])).update);
  }
  return updates.length ? { out, back: Y.mergeUpdates(updates), clashed: merged.clashed } : { out, clashed: merged.clashed };
}
