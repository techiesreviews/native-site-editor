// The "Live-Copy" lines of a save's commit (ticket am-59). A save of a page typed on together in a live room names the
// room's copy in its commit message (worker/publish.ts), and GitHub's history gives the names back per commit
// (worker/history.ts): the other tabs of that room then wait for the save's note in the copy instead of taking the
// commit in as an outside change (src/live-text.ts).
//
// Each line also carries the save's record (TOOLS-216, Lex's choice A): the Yjs snapshot of the copy as it was saved
// (its state vector and the characters taken out by then), in base64url, after the copy id. A tab coming back with a
// copy of its own knows from it exactly which of its own words that commit holds, by their Yjs ids, never by their text.

/** A copy id as hex: 20 bytes. */
const COPY = /^[a-f0-9]{40}$/;
/** A save's record: a Yjs snapshot in base64url, at most this long as a tab writes it and a commit line keeps it (a larger
 * one is left out; the copy id still goes). */
export const MAX_LIVE_RECORD = 4_000;
/** Records written before TOOLS-224 run to 8,000 characters: a save asking with one (a page opened before) still saves, its
 * line naming only the copy, and a commit line with one still reads whole. */
export const MAX_READ_LIVE_RECORD = 8_000;
const ENTRY = new RegExp(`^[a-f0-9]{40}(?: [A-Za-z0-9_-]{1,${MAX_READ_LIVE_RECORD}})?$`);
/** Copies one commit names: one per page typed on together, well inside the files of one save. */
export const MAX_LIVE_COPIES = 50;
/** The records of one commit, together, at most this long (TOOLS-224): GitHub's history reads 20 commits a page within
 * 1 MiB (worker/history.ts), so no page of it grows past what it can read. A line past it names only its copy. */
export const MAX_LIVE_RECORDS = 12_000;

/** Each entry: a copy id, or a copy id, a space and its save's record. */
export const validLiveCopies = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_LIVE_COPIES && value.every((copy) => typeof copy === "string" && ENTRY.test(copy));

/** The lines naming `copies`, one per copy (its first entry), in the commit's last paragraph: each record of at most
 * MAX_LIVE_RECORD goes whole while the ones before it leave room within MAX_LIVE_RECORDS; another line names only its copy. */
export function liveCopyLines(copies: readonly string[]) {
  const named = new Set<string>(), lines: string[] = [];
  let room = MAX_LIVE_RECORDS;
  for (const entry of copies) {
    const id = entry.slice(0, 40), record = entry.slice(41);
    if (named.has(id)) continue;
    named.add(id);
    const fits = record.length > 0 && record.length <= MAX_LIVE_RECORD && record.length <= room;
    if (fits) room -= record.length;
    lines.push(`Live-Copy: ${fits ? entry : id}`);
  }
  return lines;
}

/** The copies a commit message names (its `Live-Copy` lines), each with its record when the line has one. */
export function liveCopiesOf(message: string): string[] {
  const copies = new Map<string, string>();
  for (const line of message.split("\n")) {
    const entry = /^Live-Copy: (\S+(?: \S+)?)\s*$/.exec(line)?.[1];
    const id = entry?.slice(0, 40);
    // A record past what is read leaves the copy named all the same.
    if (entry && id && COPY.test(id) && !copies.has(id)) {
      if (ENTRY.test(entry)) copies.set(id, entry);
      else if (/^[a-f0-9]{40} [A-Za-z0-9_-]+$/.test(entry)) copies.set(id, id);
    }
    if (copies.size >= MAX_LIVE_COPIES) break;
  }
  return [...copies.values()];
}
