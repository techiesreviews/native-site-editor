// One control, two gestures (the slot chip, slot-chip.ts): a click acts after
// a short wait, so a double-click never acts as a click too. The browser sends
// a double-click as click (detail 1), click (detail 2), dblclick: the second
// click drops the waiting one and the double-click acts alone. A click from
// the keyboard (detail 0) can't be the start of a double-click, so it acts at
// once.

/** How long a click waits for a second one. */
export const CLICK_WAIT_MS = 240;

export interface ClickTiming {
  /** A click, with the event's `detail` (how many clicks in a row; 0 from the keyboard). */
  click(detail: number): void;
  doubleClick(): void;
  /** Drops a click still waiting (the control went away). */
  cancel(): void;
}

export function clickTiming(onClick: () => void, onDoubleClick: () => void, wait = CLICK_WAIT_MS): ClickTiming {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return {
    click(detail) {
      cancel();
      if (detail === 0) onClick();
      else if (detail === 1) timer = setTimeout(() => { timer = undefined; onClick(); }, wait);
    },
    doubleClick() {
      cancel();
      onDoubleClick();
    },
    cancel,
  };
}
