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
//   else, from the same version, the lowest client id. Edges from versions neither of which came before the other stay
//   both (a known limit: two tabs that each skipped a different commit of a burst).
// - The clash rule (ticket 09, as src/outside-merge.ts): the latest version shows. A tab takes its own words out where
//   GitHub's change replaced the words around them (`clashes`, matched against src/text-merge.ts `mergeText`), as one
//   Undo step of its own.
//
// Loaded with src/live-text.ts, never at boot.

import { diffRange, type TextChange } from "./draft-store";
import { mergeText, runChanges } from "./text-merge";

type Yjs = typeof import("yjs");
type Doc = import("yjs").Doc;

/** One way from a version of GitHub's text to another: an edge's `client` writes its words; a save's has none. */
export interface Edge {
  /** Its key in `meta`, unique per edge. */
  id: string;
  /** The version it starts from ("" for the copy's birth) and the one it makes, as 40 hex digits (src/live-text.ts `versionOf`). */
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
 * where it keeps runs of the text, so the words it kept are not written again. Written into a shared copy, a single
 * range would take others' words in it away and type its own again (sweep 2026-11-10 item 1).
 */
export function wordRuns(text: string, change: TextChange): TextChange[] {
  let begin = change.start, end = change.end;
  while (begin > 0 && !/\s/.test(text[begin - 1])) begin--;
  while (end < text.length && !/\s/.test(text[end])) end++;
  return runChanges(text.slice(begin, end), text.slice(begin, change.start) + change.text + text.slice(change.end, end))
    .map(run => ({ start: begin + run.start, end: begin + run.end, text: run.text })).reverse();
}

/** `changes`, ordered from the end of the text back, made on `text`. */
function apply(text: import("yjs").Text, changes: readonly TextChange[]) {
  for (const change of changes) {
    if (change.end > change.start) text.delete(change.start, change.end - change.start);
    if (change.text) text.insert(change.start, change.text);
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

/** Whether `older` came before `version` in the copy (or is it). */
export function reaches(all: readonly Edge[], older: string, version: string) {
  return older === version || ancestry(all)(version).has(older);
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

/**
 * The clash rule for this tab's own words (`mine`: whether a client id is this tab's) once `edge` came in: the copy's
 * text merged as src/text-merge.ts merges a draft with GitHub's change (`mergeText`, from `edge`'s older version), and
 * where the latest version shows GitHub's words, this tab's own words there go. Returned as deletions in the copy's text
 * now, from the end back; none when nothing clashed. Words merely put in another order are left.
 */
export function clashes(Y: Yjs, doc: Doc, all: readonly Edge[], edge: Edge, mine: (client: number) => boolean): TextChange[] {
  if (edge.client === undefined || !edge.from) return [];
  const from = edgeTo(all, edge.from);
  if (!from) return [];
  const old = copyAt(Y, doc, from.snapshot), now = copyAt(Y, doc, edge.snapshot);
  let base: string, theirs: string;
  try { base = old.getText("source").toString(); theirs = now.getText("source").toString(); } finally { old.destroy(); now.destroy(); }
  const was = Y.decodeSnapshot(from.snapshot).ds, after = Y.decodeSnapshot(edge.snapshot).ds;
  // The copy as the typists made it, without the edge: its words left out and the words it took out kept.
  const list = items(doc);
  let ours = "", current = "";
  const owners: boolean[] = [];
  for (const item of list) {
    const id = Y.createID(item.client, item.clock);
    const takenByEdge = item.deleted && Y.isDeleted(after, id) && !Y.isDeleted(was, id);
    if (item.client !== edge.client && (!item.deleted || takenByEdge)) ours += item.text;
    if (!item.deleted) { current += item.text; for (let index = 0; index < item.text.length; index++) owners.push(mine(item.client)); }
  }
  const merged = mergeText(base, ours, theirs);
  if (!merged.clashed || merged.text === current) return [];
  const changes = runChanges(current, merged.text);
  const added = changes.map(change => change.text).join("");
  const out: TextChange[] = [];
  for (const change of changes) {
    // A word moved (taken out here, put in elsewhere) is not a clash: only words the latest version no longer has go.
    if (change.end <= change.start || added.includes(current.slice(change.start, change.end).trim())) continue;
    for (let index = change.start; index < change.end; index++) {
      if (!owners[index]) continue;
      const last = out.at(-1);
      if (last && last.end === index) last.end++; else out.push({ start: index, end: index + 1, text: "" });
    }
  }
  return out.reverse();
}
