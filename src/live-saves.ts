// Saves through a live room (ticket am-59). A save of a file typed on together notes, in the room's copy, the copy as it
// is when saved (src/live-text.ts): the others then take the commit as text the copy already holds instead of folding
// it in as an outside change. The publish menu calls `noteLiveSave` before it sends; the open file's share answers it.
// Kept apart from src/live-text.ts so the save path does not load the live chunk.

type Note = { store: object; note(text: string): void };
const savers = new Map<string, Set<Note>>();

/** The file under draft key `key` is about to be saved as `text` (from `store`, the page's own by default): its live
 * copy, if it has one, notes it. */
export function noteLiveSave(key: string, text: string, store?: object) {
  for (const saver of savers.get(key) ?? []) {
    if (store && saver.store !== store) continue;
    try { saver.note(text); } catch { /* A note is best effort: the others then fold the commit in as an outside change. */ }
  }
}

/** Live text: `note` answers saves of the file under `key` in `store` while it is shared; returns its removal. */
export function onLiveSave(store: object, key: string, note: (text: string) => void) {
  const saver = { store, note };
  let notes = savers.get(key);
  if (!notes) savers.set(key, notes = new Set());
  notes.add(saver);
  return () => { notes.delete(saver); if (!notes.size && savers.get(key) === notes) savers.delete(key); };
}
