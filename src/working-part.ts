/**
 * Where the user is working (ticket 52): the element they type in on the page or in a Page Structure
 * field (`node`, its element-child path in `path`, as the preview counts it), or the lines they type
 * in in the code pane (from 1). Agents are told it (src/agent-site.ts), and their change to that part
 * waits until it is left (src/agent-tools-edit.ts): the user leaves it, or pauses typing for
 * WORK_PAUSE_MS. A stand-in until multiplayer, kept in this one place so it can be replaced whole.
 */
export type WorkingPart = { path: string; node: readonly number[] } | { path: string; lines: { start: number; end: number } };

/** A pause in typing this long leaves the part. */
const WORK_PAUSE_MS = 5000;

let part: WorkingPart | undefined;
let pause: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function set(next: WorkingPart | undefined) {
  clearTimeout(pause);
  pause = next && setTimeout(() => set(undefined), WORK_PAUSE_MS);
  if (same(part, next)) return;
  part = next;
  for (const listener of [...listeners]) listener();
}

export const workingPart = {
  now: () => part,
  /** The user typed in `next`. */
  typed: (next: WorkingPart) => set(next),
  /**
   * The user left the part at `at` (the element at its node, else the lines they typed in the code
   * pane; any part when omitted), once `settled` is: what they typed there is written by then.
   */
  left(at?: { path: string; node?: readonly number[] }, settled: Promise<unknown> = Promise.resolve()) {
    const was = part;
    if (!was || at && (was.path !== at.path || !same("node" in was ? was.node : undefined, at.node))) return;
    const leave = () => { if (part === was) set(undefined); };
    void settled.then(leave, leave);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
