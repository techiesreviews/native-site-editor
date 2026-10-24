/**
 * Where the user is working (ticket 52): the element they type in on the page or in a Page Structure
 * field (`node`, its element-child path in `path`, as the preview counts it), or the lines they type
 * in in the code pane (from 1). Agents are told it (src/agent-site.ts), and their change to that part
 * waits until it is left (src/agent-tools-edit.ts). A stand-in until multiplayer, kept in this one
 * place so it can be replaced whole.
 *
 * An element is left only when the user leaves it: until then what they typed on the page is not
 * written (it is, on leaving), and a field's edit is still open, so a change let go sooner would land
 * under their caret. Code pane lines are written as they are typed: a pause of WORK_PAUSE_MS leaves them.
 */
export type WorkingPart = { path: string; node: readonly number[] } | { path: string; lines: { start: number; end: number } };

/** A pause in typing this long leaves the code pane's lines. */
const WORK_PAUSE_MS = 5000;

let part: WorkingPart | undefined;
// Counts typing: leaving a part holds only while no typing came since (the same part typed in again stays).
let typings = 0;
let pause: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function set(next: WorkingPart | undefined) {
  clearTimeout(pause);
  pause = next && "lines" in next ? setTimeout(() => set(undefined), WORK_PAUSE_MS) : undefined;
  if (same(part, next)) return;
  part = next;
  for (const listener of [...listeners]) listener();
}

/** The line (from 1) of `text` at `offset`. */
export function lineOf(text: string, offset: number) {
  let line = 1;
  for (let at = text.indexOf("\n"); at >= 0 && at < offset; at = text.indexOf("\n", at + 1)) line++;
  return line;
}

export const workingPart = {
  now: () => part,
  /** The user typed in `next` (on the page, an element's place again after a render moved it). */
  typed(next: WorkingPart) { typings++; set(next); },
  /** The user typed in the code pane: `change` (its start, and the text it put there) made `text` of `path`. */
  typedLines(path: string, text: string, change: { start: number; text: string }) {
    typings++;
    set({ path, lines: { start: lineOf(text, change.start), end: lineOf(text, change.start + change.text.length) } });
  },
  /**
   * The user left the part at `at` (the element at its node, else the lines they typed in the code
   * pane; any part when omitted), once `settled` is: what they typed there is written by then.
   */
  left(at?: { path: string; node?: readonly number[] }, settled: Promise<unknown> = Promise.resolve()) {
    const was = part, typed = typings;
    if (!was || at && (was.path !== at.path || !same("node" in was ? was.node : undefined, at.node))) return;
    const leave = () => { if (typings === typed) set(undefined); };
    void settled.then(leave, leave);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
