/**
 * A picker's close as its Use sees it (ticket 27). Cancel, Escape or the workspace closing cancel a
 * Use under way, and `onClose` answers at once. A close because another workspace was opened
 * (`leave(true)`) does not cancel it: the Use lands in the picker's own workspace, and `onClose`
 * waits for it, answering only when it did not land (it failed), so a caller waiting for the chosen
 * path (`choosePath`) is never answered with nothing first.
 */
export function pickerClose(onClose?: () => void) {
  let closed = false, switched = false, picking = false, used = false, deferred = false;
  const answer = () => { if (!used) onClose?.(); };
  return {
    leave(away: boolean) { switched = away; },
    closed() {
      closed = true;
      if (switched && picking) deferred = true; else answer();
    },
    /** Runs a Use; it counts as used once it finished with the picker open, or closed by a switch. */
    async pick(run: () => Promise<void>) {
      picking = true;
      try { await run(); used = !closed || switched; }
      finally { picking = false; if (deferred) { deferred = false; answer(); } }
    },
    cancelled: () => closed && !switched,
  };
}
