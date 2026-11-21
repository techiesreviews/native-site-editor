// A guest's questions to Lex's tab (TOOLS-185): each is numbered, and waits for the answer carrying its number.
// A patient question (a change, which may carry a large upload) waits again from each part Lex's tab said arrived
// (TOOLS-385), so a slow upload that does land is never told it could not be added.

import { GUEST_NOT_KEPT, GUEST_REASON_CHARS, type GuestChange } from "./guest-changes";
import type { GuestMessage } from "./live-session";

/** Why a guest's change was not written when Lex's tab never answered (gone, or the session ended). */
export const GUEST_NO_ANSWER = "No answer from Lex's editor. Try again.";

/** How long a change of one part waits for Lex's tab to write it. */
const ANSWER_MS = 60_000;
/** How long one 512 KiB part of a message (src/live-wire.ts) may take to arrive: about 3 KB/s. */
const PART_MS = 180_000;

type Waiting = { done: (value: unknown) => void; again?: () => void };

export function createGuestAsks(send: (message: GuestMessage) => void) {
  let asks = 0;
  // Uploads still waiting for their answer.
  let uploads = 0;
  const waiting = new Map<number, Waiting>();
  const ask = <T>(message: (ask: number) => GuestMessage, ms: number, part?: number) => {
    const number = ++asks;
    return new Promise<T | undefined>((resolve) => {
      const give = (wait: number) => setTimeout(() => { waiting.delete(number); resolve(undefined); }, wait);
      let timer = give(ms);
      waiting.set(number, {
        done: (value) => { clearTimeout(timer); waiting.delete(number); resolve(value as T | undefined); },
        ...(part === undefined ? {} : { again: () => { clearTimeout(timer); timer = give(part); } }),
      });
      send(message(number));
    });
  };
  return {
    /** Waits `ms` for the answer; or, given `part`, is patient: then `part` again from each part Lex's tab says arrived. */
    ask,
    /** A change made on render `seen`: nothing once Lex's tab wrote it, else why not. An upload's first part leaves with
     * the bytes queued before it, so an upload, or a change sent while one still waits, has a part's time from the start;
     * any change waits a part's time from each part that arrives, as one queued behind an upload is written only once
     * that upload is. */
    async change(change: GuestChange, seen: number): Promise<string | undefined> {
      const upload = change.kind === "upload";
      if (upload) uploads++;
      try {
        const answer = await ask<{ done?: unknown; why?: unknown }>((number) => ({ t: "change", change, ask: number, seen }),
          upload || uploads > 0 ? PART_MS : ANSWER_MS, PART_MS);
        if (answer === undefined) return GUEST_NO_ANSWER;
        if (answer.done === true) return undefined;
        return typeof answer.why === "string" && answer.why ? answer.why.slice(0, GUEST_REASON_CHARS) : GUEST_NOT_KEPT;
      } finally {
        if (upload) uploads--;
      }
    },
    answer(number: number, value: unknown) { waiting.get(number)?.done(value); },
    /** Lex's tab says a part of this guest's message arrived: each patient question waits a part's time again. A part
     * does not say which message it is of, so each patient one does: a change his tab dropped unanswered waits on while
     * another upload of this guest's still arrives, and then gives up as before. */
    heard() { for (const entry of waiting.values()) entry.again?.(); },
    close() { for (const entry of [...waiting.values()]) entry.done(undefined); },
  };
}
