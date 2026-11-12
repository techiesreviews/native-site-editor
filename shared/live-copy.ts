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
/** A save's record: a Yjs snapshot in base64url, at most this long (a larger one is left out; the copy id still goes). */
export const MAX_LIVE_RECORD = 8_000;
const ENTRY = new RegExp(`^[a-f0-9]{40}(?: [A-Za-z0-9_-]{1,${MAX_LIVE_RECORD}})?$`);
/** Copies one commit names: one per page typed on together, well inside the files of one save. */
export const MAX_LIVE_COPIES = 50;

/** Each entry: a copy id, or a copy id, a space and its save's record. */
export const validLiveCopies = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_LIVE_COPIES && value.every((copy) => typeof copy === "string" && ENTRY.test(copy));

/** The lines naming `copies`, one each, in the commit's last paragraph. */
export const liveCopyLines = (copies: readonly string[]) => [...new Set(copies)].map((copy) => `Live-Copy: ${copy}`);

/** The copies a commit message names (its `Live-Copy` lines), each with its record when the line has one. */
export function liveCopiesOf(message: string): string[] {
  const copies = new Map<string, string>();
  for (const line of message.split("\n")) {
    const entry = /^Live-Copy: (\S+(?: \S+)?)\s*$/.exec(line)?.[1];
    const id = entry?.slice(0, 40);
    if (entry && id && ENTRY.test(entry) && COPY.test(id) && !copies.has(id)) copies.set(id, entry);
    if (copies.size >= MAX_LIVE_COPIES) break;
  }
  return [...copies.values()];
}
