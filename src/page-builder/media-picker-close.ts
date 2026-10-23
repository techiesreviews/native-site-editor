/**
 * A picker's close as its Use sees it (ticket 27): Cancel, Escape or the workspace closing cancel a
 * Use under way; a close because another workspace was opened (`leave(true)`) does not, so the Use
 * lands in the picker's own workspace and counts as used (`onClose` does not answer it with nothing).
 */
export function pickerClose() {
  let closed = false, switched = false;
  return {
    leave(away: boolean) { switched = away; },
    closed() { closed = true; },
    cancelled: () => closed && !switched,
    used: () => !closed || switched,
  };
}
