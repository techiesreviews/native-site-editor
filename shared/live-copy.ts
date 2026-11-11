// The "Live-Copy" lines of a save's commit (ticket am-59). A save of a page typed on together in a live room names the
// room's copy in its commit message (worker/publish.ts), and GitHub's history gives the names back per commit
// (worker/history.ts): the other tabs of that room then wait for the save's note in the copy instead of taking the
// commit in as an outside change (src/live-text.ts).

/** A copy id as hex: 20 bytes. */
const COPY = /^[a-f0-9]{40}$/;
/** Copies one commit names: one per page typed on together, well inside the files of one save. */
export const MAX_LIVE_COPIES = 50;

export const validLiveCopies = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_LIVE_COPIES && value.every((copy) => typeof copy === "string" && COPY.test(copy));

/** The lines naming `copies`, one each, in the commit's last paragraph. */
export const liveCopyLines = (copies: readonly string[]) => [...new Set(copies)].map((copy) => `Live-Copy: ${copy}`);

/** The copies a commit message names (its `Live-Copy` lines). */
export function liveCopiesOf(message: string): string[] {
  const copies = new Set<string>();
  for (const line of message.split("\n")) {
    const match = /^Live-Copy: ([a-f0-9]{40})\s*$/.exec(line);
    if (match) copies.add(match[1]);
    if (copies.size >= MAX_LIVE_COPIES) break;
  }
  return [...copies];
}
