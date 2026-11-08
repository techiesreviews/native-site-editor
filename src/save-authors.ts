// Who changed each file, for the commit that saves it (ticket am-26, ADR 0003 decision 6). Whoever presses Save to
// GitHub saves everyone's changes in those files, and the commit names every author besides the one saving: other
// people whose changes reached this tab's shared copy (src/live-text.ts), and agents whose changes this tab wrote into
// its drafts (src/live-author.ts). Kept in this tab's memory by draft key; a save or a discard of the file forgets it.
// Names are what each participant says of itself (the relay vouches for none), so no address is ever made from one:
// they go into the commit message by name (worker/publish.ts `commitMessage`).

import type { SaveAuthor } from "../shared/types";

/** The most authors one file keeps: names past it are dropped, not the earliest. */
const FILE_LIMIT = 50;
const byKey = new Map<string, SaveAuthor[]>();
const same = (a: SaveAuthor, b: SaveAuthor) => a.name.toLowerCase() === b.name.toLowerCase() && !a.agent === !b.agent;

/** `author` changed the file under draft key `key`. */
export function recordAuthor(key: string, author: SaveAuthor) {
  const name = author.name.trim();
  if (!name) return;
  const found = byKey.get(key) ?? [];
  const entry: SaveAuthor = author.agent ? { name, agent: true } : { name };
  if (found.some(known => same(known, entry)) || found.length >= FILE_LIMIT) return;
  found.push(entry);
  byKey.set(key, found);
}

/** Everyone who changed the files under `keys`, each once, in the order first heard, but `account` (the one saving). */
export function authorsOf(keys: Iterable<string>, account: string): SaveAuthor[] {
  const out: SaveAuthor[] = [];
  const self = account.toLowerCase();
  for (const key of keys)
    for (const author of byKey.get(key) ?? [])
      if ((author.agent || author.name.toLowerCase() !== self) && !out.some(known => same(known, author))) out.push(author);
  return out;
}

/** The file under `key` was saved or discarded: its authors are GitHub's history now, or gone with the changes. */
export function forgetAuthors(key: string) {
  byKey.delete(key);
}
