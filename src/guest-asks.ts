// A guest's questions to Lex's tab (TOOLS-185): each is numbered, and waits for the answer carrying its number.
// A patient question (a change, which may carry a large upload) waits from the last part Lex's tab said arrived
// (TOOLS-385), so a slow upload that does land is never told it could not be added.

import type { GuestMessage } from "./live-session";

type Waiting = { done: (value: unknown) => void; again?: () => void };

export function createGuestAsks(send: (message: GuestMessage) => void) {
  let asks = 0;
  const waiting = new Map<number, Waiting>();
  return {
    ask<T>(message: (ask: number) => GuestMessage, ms: number, patient = false) {
      const ask = ++asks;
      return new Promise<T | undefined>((resolve) => {
        const give = () => setTimeout(() => { waiting.delete(ask); resolve(undefined); }, ms);
        let timer = give();
        waiting.set(ask, {
          done: (value) => { clearTimeout(timer); waiting.delete(ask); resolve(value as T | undefined); },
          ...(patient ? { again: () => { clearTimeout(timer); timer = give(); } } : {}),
        });
        send(message(ask));
      });
    },
    answer(ask: number, value: unknown) { waiting.get(ask)?.done(value); },
    /** Lex's tab says a part of this guest's message arrived: each patient question waits its full time again. */
    heard() { for (const entry of waiting.values()) entry.again?.(); },
    close() { for (const entry of [...waiting.values()]) entry.done(undefined); },
  };
}
