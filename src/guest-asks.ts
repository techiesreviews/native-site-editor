// A guest's questions to Lex's tab (TOOLS-185): each is numbered, and waits for the answer carrying its number.
// A patient question (a change, which may carry a large upload) waits from the last part Lex's tab said arrived
// (TOOLS-385), so a slow upload that does land is never told it could not be added.

import type { GuestMessage } from "./live-session";

type Waiting = { done: (value: unknown) => void; again?: () => void };

export function createGuestAsks(send: (message: GuestMessage) => void) {
  let asks = 0;
  const waiting = new Map<number, Waiting>();
  return {
    /** Waits `ms` for the answer; or, given `first`, is patient: `first` for the first part to arrive (it leaves with
     * the bytes queued before it), then `ms` again from each part Lex's tab says arrived. */
    ask<T>(message: (ask: number) => GuestMessage, ms: number, first?: number) {
      const ask = ++asks;
      return new Promise<T | undefined>((resolve) => {
        const give = (wait: number) => setTimeout(() => { waiting.delete(ask); resolve(undefined); }, wait);
        let timer = give(first ?? ms);
        waiting.set(ask, {
          done: (value) => { clearTimeout(timer); waiting.delete(ask); resolve(value as T | undefined); },
          ...(first === undefined ? {} : { again: () => { clearTimeout(timer); timer = give(ms); } }),
        });
        send(message(ask));
      });
    },
    answer(ask: number, value: unknown) { waiting.get(ask)?.done(value); },
    /** Lex's tab says a part of this guest's message arrived: each patient question waits its full time again. A part
     * does not say which message it is of, so each patient one does: a change his tab dropped unanswered waits on while
     * another upload of this guest's still arrives, and then gives up as before. */
    heard() { for (const entry of waiting.values()) entry.again?.(); },
    close() { for (const entry of [...waiting.values()]) entry.done(undefined); },
  };
}
