// Changes from GitHub (ticket am-59): GitHub's versions of the file as edges of the room's copy, in GitHub's order
// whichever tab heard which commit first. A commit enters the copy as the outside participant along GitHub's history
// (`enter`), or as a save from the room by its note; the clash rule weighs each new version against this tab's own words
// (`settle`); a tab joining brings its version and the copy's together first (`bringBase`). The overview is in
// src/live-text.ts.

import { applyChanges } from "./draft-store";
import { rebaseHistory } from "./shared-undo";
import { mergeText, runChanges } from "./text-merge";
import { clashes, edgeClient, edgeTo as edgeFor, edgeUpdate, edges, headOf, metaOf, newestOf, occurrenceAfter, occurrenceOn, shaOf,
  superseded, type Edge, textAt, tipOf, versionsOf, wordsOf } from "./live-versions";
import type { LiveCommit, LiveVersion } from "./live-text";
import { hex, namesCopy, recordOf } from "./live-text-kept";
import { changesBetween, META, OUTSIDE, type CopyContext, type Doc } from "./live-text-shared";

/** The most versions of GitHub's history one commit brings into a copy with it (the versions before it the copy lacks):
 * one page of the file's history (worker/history.ts). Past it, the branch loads again. */
const HISTORY_LIMIT = 20;

const utf8 = new TextEncoder();
async function digest(text: string) { return new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(text))); }
/** A version of GitHub's text, as 40 hex digits: its blob sha, or (a file not on GitHub) a hash of the text. */
export async function versionOf(baseSha: string | null | undefined, base: string) {
  return baseSha && /^[a-f\d]{40}$/.test(baseSha) ? baseSha : hex((await digest(`new\n${base}`)).subarray(0, 20));
}

/** The copy's versions of GitHub's text and the commits coming in (part of `makeCopy`, src/live-text-copy.ts). */
export function makeGithub(c: CopyContext) {
  const { s, Y, doc, text, meta, ownClients, resume, carried, applyText } = c;
  const { ports, store, scope, path, ownSaves } = s;
  /** The edges whose clash this tab weighed (or that came before it took part): each is weighed once, as it comes in. */
  const weighed = new Set(edges(Y, doc).map(edge => edge.id)), weighedVersions = new Set(edges(Y, doc).map(edge => edge.to));
  /** The edges the copy (or `of`) holds now. */
  const versions = (of = doc) => edges(Y, of);
  /** Whether the copy (or `of`) holds any occurrence of GitHub's `sha`. */
  const holds = (sha: string, of = doc) => newestOf(versions(of), sha) !== undefined;
  /** The copy's version for GitHub's `sha` that this tab is on: its own when it is that text, else the latest
   * occurrence the copy (or `of`) holds (`sha` when it holds none). */
  const nodeOf = (sha: string, of = doc) =>
    (of === doc && c.keptBase && shaOf(c.keptBase) === sha && versionsOf(versions()).has(c.keptBase) ? c.keptBase : newestOf(versions(of), sha) ?? sha);
  /**
   * After any change from outside this tab's typing: words of a way into a version the copy does not keep go (every
   * tab does the same, so it is done once in effect), and each edge that just came in is weighed for a clash with this
   * tab's own words (the latest version shows; one Undo of this tab brings its words back).
   */
  function settle() {
    if (!c.copyId) return;
    const all = versions(), gone = superseded(all);
    for (const edge of gone) {
      const out = wordsOf(doc, edge.client!);
      if (out.length) doc.transact(() => { applyText(out); }, OUTSIDE);
    }
    if (!c.synced) return;
    for (const edge of all) {
      if (weighed.has(edge.id)) continue;
      weighed.add(edge.id);
      // A clash is weighed once per version of GitHub's text: a second way into it (`joinVersions`) is the same commit.
      if (weighedVersions.has(edge.to)) continue;
      weighedVersions.add(edge.to);
      if (edge.client === undefined || gone.has(edge)) continue;
      const { out, back, clashed } = clashes(Y, doc, all, edge, client => ownClients.has(client), (client, clock) => Y.isDeleted(c.took, Y.createID(client, clock)));
      if (!out.length) continue;
      // No clash: what this tab holds twice goes as no one's change (the draft follows it outside history).
      if (!clashed) {
        // GitHub's words coming back first, as every tab writes them (an update Yjs applies as someone else's), then
        // what the copy still lacks of the text the rule makes: written in one with them, this tab's own characters
        // would count as someone else's, and Yjs would give this copy a new client id.
        const want = applyChanges(text.toString(), [...out].reverse()).text;
        if (back) Y.applyUpdate(doc, back, OUTSIDE);
        const rest = text.toString() === want ? [] : changesBetween(text.toString(), want).sort((a, b) => a.start - b.start).reverse();
        if (rest.length) doc.transact(() => { applyText(rest); }, OUTSIDE);
        continue;
      }
      // GitHub's words coming back go into the copy first, as every tab writes them (the draft does not follow them:
      // they are part of this tab's step below, whose change then writes only what the copy still lacks).
      if (back) { c.quiet = true; try { Y.applyUpdate(doc, back, OUTSIDE); } finally { c.quiet = false; } }
      const author = meta.get(`n:${edge.to}`), who = typeof author === "string" && author ? author.split(" · ")[0] : "Someone";
      store.edit({ scope, path, history: ports.history?.(scope, path), label: `${who}'s change`, changes: out });
    }
    moveBase(all);
  }
  /** Another tab brought a newer version of GitHub's text into the copy (its fold, or its workspace read it): this tab's
   * draft, which follows the copy and so holds that version's words, is over that version from now on. */
  function moveBase(all: readonly Edge[]) {
    const file = store.get(scope, path);
    if (!c.keptBase || !file || file.baseSha !== shaOf(c.keptBase) || !versionsOf(all).has(c.keptBase)) return;
    const tip = tipOf(all, c.keptBase);
    if (tip === c.keptBase) return;
    const tipText = textAt(Y, doc, all, tip);
    if (tipText === undefined) return;
    store.acceptBase(scope, path, { text: tipText, baseSha: shaOf(tip) });
    c.keptBase = tip;
  }

  /** Writes the outside participant's edge from `from` to GitHub's `to` (its text `toText`) into the copy (or `into`),
   * unless it holds `to` already. */
  async function edgeTo(from: string, to: string, toText: string, into = doc) {
    const at = edgeFor(versions(into), from);
    if (!at) return false;
    const client = await edgeClient(from, to, at.snapshot);
    if (s.stopped) return false;
    if (versionsOf(versions(into)).has(to)) return true;
    // The snapshot its client id was derived from: another tab deriving the same id writes the very same items.
    const update = edgeUpdate(Y, into, at, to, toText, client);
    if (!update) return false;
    Y.applyUpdate(into, update, OUTSIDE);
    return true;
  }

  /** The versions before `sha` on the branch, newest first, until `enough` says so (at most HISTORY_LIMIT); none when
   * GitHub's history could not be read (a rate limit, the network) or is not there. */
  async function history(sha: string, enough: (version: LiveVersion) => boolean) {
    const before = ports.github?.(scope, path)?.before;
    if (!before) return undefined;
    const out: LiveVersion[] = [];
    try {
      for await (const version of before(sha)) {
        if (s.stopped) return undefined;
        out.push(version);
        if (enough(version) || out.length >= HISTORY_LIMIT) break;
      }
    } catch { return undefined; }
    return s.stopped ? undefined : out;
  }
  /** The version right before `sha` on the branch. */
  const parentOf = async (sha: string) => (await history(sha, () => true))?.[0];
  /**
   * Brings GitHub's version `version` into the copy (or `into`) along GitHub's history of the file: it enters on top of
   * the version right before it, and that one first, on top of its own, when the copy lacks it, back to a version the
   * copy holds as that very occurrence of its text (`occurrenceAfter`: a revert's text the copy holds only from before
   * is read past). Every tab bringing the same versions writes the same items, so they enter once and in GitHub's
   * order, whichever tab heard which commit first. A page going back and forth (A B A B A) that this tab missed more
   * than one turn of can look like a turn it holds, and so can the copy's first version: it then enters on that one,
   * and the copy, holding two ways into the version, keeps the one that came by more versions (`superseded`). Telling
   * them apart needs GitHub's commit ids. The copy's version it is now; none when the history could not be read or
   * does not reach a version the copy holds within HISTORY_LIMIT versions. `again`: GitHub's newest brings back a
   * text the copy holds (a revert), which enters as its next occurrence.
   */
  async function enter(version: LiveVersion, into = doc, again = false): Promise<string | undefined> {
    if (!again && holds(version.sha, into)) return newestOf(versions(into), version.sha);
    /** The copy's version the chain starts from, and a version read that the copy holds some occurrence of. */
    let from: string | undefined, held: LiveVersion | undefined;
    const older = await history(version.sha, before => {
      // The version before a held one tells which occurrence of its text it is.
      if (held) from = occurrenceAfter(versions(into), held.sha, before.sha, holds(before.sha, into));
      held = from || !holds(before.sha, into) ? undefined : before;
      return from !== undefined;
    });
    if (!older?.length) return undefined;
    // Read only to tell the occurrence; or the file's first version (or the history's limit): its latest occurrence.
    if (from) older.pop();
    else if (held && held === older.at(-1)) from = newestOf(versions(into), held.sha);
    if (!from) return undefined;
    const chain = [version, ...older];
    for (let index = chain.length - 2; index >= 0; index--) {
      const entered = await take(from, chain[index], into);
      if (!entered) return undefined;
      from = entered;
    }
    return s.stopped ? undefined : from;
  }
  /** `version` enters on top of the copy's (or `into`'s) version `from`: a save from this room as its note says
   * (waiting for the note when the commit says it was this room's, while the copy is in the room), else as the outside
   * participant. The copy's version it is now. */
  async function take(from: string, version: LiveVersion, into = doc) {
    const at = () => occurrenceOn(versions(into), from, version.sha);
    if (versionsOf(versions(into)).has(at())) return at();
    // The copy `into` is: this one, or the own copy read apart (`carryIn`), the copy it was kept from.
    const tag = into === doc ? c.copyId : c.drafts.kept?.tag, named = tag !== undefined && namesCopy(version, tag), ours = into === doc && !s.apart && named;
    // A save of this copy whose record names only items this copy holds: noted from the record, with no wait.
    const record = named ? recordOf(version, tag) : undefined;
    const noted = (record && c.notes.noteRecord(version, from, record, into)) || (ours ? await c.notes.noteFor(version, from) : c.notes.noteOf(version, from, into));
    if (s.stopped) return undefined;
    const node = at();
    if (versionsOf(versions(into)).has(node)) return node;
    if (noted) { into.transact(() => { metaOf(into).set(`g:${node}`, noted); }, META); return node; }
    // A save of this copy that names items this copy lacks (read apart: its other tabs typed after this one left; or a tab
    // of this copy on another page, whose note never reaches the room): the record says which of the copy's items the
    // save holds; the rest of the saved text, words this copy never had, enters over them as the outside participant.
    if (record) return await recordEdge(from, node, version, record, into) ? node : undefined;
    // This room's save whose note never came (its tab left before it could note it): the branch loads again.
    return !ours && await edgeTo(from, node, version.text, into) ? node : undefined;
  }
  /** `version` (the copy's version `to`, over `from`) enters the copy `into` as the outside participant over the items of
   * its save's record (`snapshot`) that `into` holds: their text, which lacks only the words `into` never had, becomes
   * `version`'s. */
  async function recordEdge(from: string, to: string, version: LiveVersion, snapshot: Uint8Array, into: Doc) {
    let view: Uint8Array;
    try {
      const saved = Y.decodeSnapshot(snapshot), sv = new Map<number, number>();
      for (const [client, clock] of saved.sv) sv.set(client, Math.min(clock, Y.getState(into.store, client)));
      view = Y.encodeSnapshot(Y.createSnapshot(saved.ds, sv));
    } catch { return false; }
    const client = await edgeClient(from, to, view);
    if (s.stopped) return false;
    if (versionsOf(versions(into)).has(to)) return true;
    const update = edgeUpdate(Y, into, { id: "", from: "", to: from, snapshot: view }, to, version.text, client);
    if (!update) return false;
    Y.applyUpdate(into, update, OUTSIDE);
    return true;
  }

  /**
   * Brings this tab's version of GitHub's text and the copy's together before its draft goes in. GitHub's newest
   * version (or, unread, the one the tab's workspace read), when the copy lacks it, enters along GitHub's history
   * (`enter`). Then the draft moves onto the newest version the copy holds from there (or from its own version; a draft
   * over a version the copy never held moves onto the copy's newest), merged as a fold into a draft merges it
   * (src/outside-merge.ts).
   */
  async function bringBase() {
    /** Versions asked about once: noted as a save, or brought in. */
    const checked = new Set<string>();
    /** GitHub's newest version could not be brought in (its history unread): a version the copy lacks may be newer. */
    let unread = false;
    for (let round = 0; round < 5; round++) {
      const file = store.get(scope, path);
      if (!file) return undefined;
      const base = await versionOf(file.baseSha, file.base), shown = ports.github?.(scope, path);
      if (s.stopped) return undefined;
      if (store.get(scope, path)?.base !== file.base) continue;
      const all = versions(), head = headOf(all);
      if (!head) return undefined;
      // This tab's version is the copy's text exactly (its own save, noted before it could take part): the copy holds
      // it, on top of the version before it.
      if (!holds(base) && file.baseSha && text.toString() === file.base && !checked.has(base)) {
        checked.add(base);
        // GitHub's history unread: on top of the copy's newest, as its very text says.
        const older = await history(base, () => true);
        if (s.stopped) return undefined;
        const from = older === undefined ? headOf(versions()) : older[0] && nodeOf(older[0].sha);
        if (from && versionsOf(versions()).has(from) && text.toString() === file.base) c.notes.noteCopy(from, base);
        continue;
      }
      if (shown && !checked.has(shown.sha)) {
        checked.add(shown.sha);
        const latest = await shown.newest?.().catch(() => undefined) ?? shown;
        if (s.stopped) return undefined;
        // Not brought in (its history unread): the draft moves onto the copy's newest, and a later fold loads the branch.
        if (!holds(latest.sha) && !await enter(latest)) unread = true;
        if (s.stopped) return undefined;
        continue;
      }
      const node = nodeOf(base), target = shown && holds(shown.sha) ? tipOf(all, nodeOf(shown.sha)) : holds(base) ? tipOf(all, node) : head;
      if (!holds(base) && unread && ownSaves.get(base) === file.base) {
        // This tab's own save, made while the copy was starting, that GitHub's history could not place: its words are the
        // draft's own, over the copy's version (noted as the save once they went in, `begin`). With the history read,
        // the save enters as GitHub's version (`enter`) and the draft adds nothing over it.
        store.acceptBase(scope, path, { text: textAt(Y, doc, all, target)!, baseSha: shaOf(target) });
        continue;
      }
      // A version the copy lacks that may be newer than its own: moved back, the draft would lose that version's words.
      // The copy is not joined (no doubled page, no lost words); a commit then loads the branch again.
      if (!holds(base) && unread) return undefined;
      if (target !== node) {
        const theirs = textAt(Y, doc, all, target)!;
        // A carried copy brings this tab's words by position over that version (`carryIn`); the draft moves once they went in.
        if (carried) return { base: target, text: theirs };
        // A resumed copy holds this tab's words already: only its base moves; the clash rule runs in the copy (`settle`).
        if (resume) { store.acceptBase(scope, path, { text: theirs, baseSha: shaOf(target) }); continue; }
        const merged = mergeText(file.base, file.text, theirs);
        if (merged.mine !== file.text) store.edit({ scope, path, text: merged.mine, record: false, origin: "shared", rebase: rebaseHistory });
        store.acceptBase(scope, path, { text: theirs, baseSha: shaOf(target) });
        // By whole words, so its Undo puts whole words back into the copy too.
        if (merged.clashed) store.edit({ scope, path, history: ports.history?.(scope, path), label: "GitHub's change", changes: runChanges(merged.mine, merged.text) });
        continue;
      }
      return { base: node, text: file.base };
    }
    return undefined;
  }

  /** Commits taken one at a time, in the order this tab heard them. */
  let folding: Promise<unknown> = Promise.resolve();
  function fold(next: LiveCommit) {
    const run = folding.then(() => foldOne(next));
    folding = run.catch(() => undefined);
    return run;
  }
  /**
   * A commit GitHub has now (ticket am-59). GitHub's newest version, read now, is the one taken (a notice heard late
   * names an older one). Already in the copy (another tab took it first), it only moves this tab's base; a save from the
   * room (its note, `noteSave`) is taken as the new version with no text entering; otherwise it enters as the outside
   * participant along GitHub's history (`enter`): on top of the version right before it, that one first when the copy
   * lacks it. A version older than one the copy holds enters nothing.
   */
  async function foldOne(heard: LiveCommit) {
    if (!c.copyId) return false;
    /** The draft's version as the fold began (and the copy's occurrence of it): a save landing meanwhile moves it on,
     * also back to an earlier text, and the fold leaves it there. */
    const began = store.get(scope, path)?.baseSha, beganAt = c.keptBase;
    const latest = await ports.github?.(scope, path)?.newest?.().catch(() => undefined);
    if (s.stopped) return false;
    // The notice names no live copies; GitHub's history does (the commit's `Live-Copy` lines). A newer commit than the
    // notice's is labelled with the notice's author, a guess (GitHub's newest names none), for the clash step's label.
    const next: LiveCommit = latest && latest.sha !== heard.sha ? { ...latest, ...(heard.author ? { author: heard.author } : {}) } : { ...heard, copies: heard.copies ?? latest?.copies };
    const file = store.get(scope, path);
    if (!file) return false;
    const base = await versionOf(file.baseSha, file.base);
    if (s.stopped) return false;
    const all = versions(), from = nodeOf(base);
    /** The copy's version for it: an occurrence of its text on the way to this tab's version makes it a later one. */
    const node = occurrenceOn(all, from, next.sha), again = node !== from && node !== next.sha;
    if (next.author) doc.transact(() => { if (meta.get(`n:${node}`) !== next.author) meta.set(`n:${node}`, next.author!); }, META);
    if (!versionsOf(all).has(from)) return false;
    if (again && !versionsOf(all).has(node)) {
      // A version this tab's came after: a notice that waited behind a newer one (nothing to do).
      if (latest?.sha !== next.sha) return true;
      // GitHub's newest brings back an earlier text exactly (a revert): a save from this room enters as its next
      // occurrence, as its note says; an outside one loads the branch again.
      if (!namesCopy(next, c.copyId) && !c.notes.noteOf(next, from)) return false;
    }
    // A save whose note did not come and whose commit does not say it was this room's (its tab was catching up, or
    // saved outside the publish menu), while the copy still holds its very text.
    if (!again && !holds(next.sha) && !c.notes.noteOf(next) && !namesCopy(next, c.copyId) && next.text === text.toString()) {
      const parent = await parentOf(next.sha);
      if (s.stopped) return false;
      if (parent && holds(parent.sha) && !holds(next.sha) && next.text === text.toString()) c.notes.noteCopy(nodeOf(parent.sha), next.sha);
    }
    const at = versionsOf(versions()).has(node) ? node : await enter(next, doc, again);
    if (!at || s.stopped) return false;
    // GitHub's answer was of an earlier moment (it came late): the version it names came before this tab's.
    if (again && at !== node) return true;
    const now = store.get(scope, path);
    // A save that landed during the fold moved the draft on to a newer version: it stays there (`saved`).
    if (now && ((now.baseSha === began && (beganAt === undefined || c.keptBase === beganAt)) || now.baseSha === next.sha)) {
      if (now.base !== next.text || now.baseSha !== next.sha) store.acceptBase(scope, path, { text: next.text, baseSha: next.sha });
      c.keptBase = at;
    }
    // A version the copy holds after it (a save noted meanwhile): the draft moves on to it (`moveBase`).
    settle();
    c.notes.keep();
    return true;
  }
  return { versions, holds, nodeOf, settle, history, enter, bringBase, fold, weighed, weighedVersions };
}
export type Github = ReturnType<typeof makeGithub>;
