// Per-person Undo (ticket am-24). With a shared copy (src/live-text.ts), someone
// else's change no longer clears this tab's Undo: the steps over the file are
// moved past it, so Undo and Redo take back only this tab's own words and leave
// everyone else's in place, on the page and in the code pane. Loaded with the
// live-text chunk, never at boot: the draft store (src/draft-store.ts) hands
// its history in through `HistoryAccess` when a shared change arrives.
//
// - A step is moved by `rebaseChanges`: a change of theirs wholly before or
//   after one of mine moves it by its length; their typing inside a stretch
//   mine takes away splits that stretch around it. Any other overlap cannot be
//   moved: that step goes, with every step under it (Undo cannot reach them).
// - A host action (its texts are its own) or a multi-file receipt over the
//   file cannot be moved either, and goes the same way, with the steps under it.
// - A typing step moved becomes one whole step: Monaco's undo stops in it no
//   longer line up once someone else's change sits between them. A typing step
//   partly undone through those stops goes.
// - Typing still open stays open, its start moved too, so Anna's keystrokes do
//   not cut Lex's typing into pieces; it then undoes whole. An open inline
//   group closes: its next keystroke starts a new step.

import { applyChanges, diffRange, type EditInput, type EditStep, type HistoryAccess, type Step, type StepResult, type TextChange, type TypingStep } from "./draft-store";

/**
 * Moves one of this tab's steps (`mine`) past someone else's change (`theirs`), both in the same text: `mine` in the
 * text after theirs, and `theirs` in the text after mine. At the same place, theirs comes first. Undefined when they
 * overlap and cannot both stand.
 */
export function rebaseChanges(mine: readonly TextChange[], theirs: readonly TextChange[]) {
  const sorted = [...theirs].sort((a, b) => a.start - b.start);
  const parts: TextChange[] = [];
  for (const change of [...mine].sort((a, b) => a.start - b.start)) {
    let start = change.start, text = change.text;
    for (const their of sorted) if (their.start === their.end && their.start > start && their.start < change.end) {
      parts.push({ start, end: their.start, text });
      start = their.start;
      text = "";
    }
    parts.push({ start, end: change.end, text });
  }
  const delta = (change: TextChange) => change.text.length - (change.end - change.start);
  const shift = sorted.map(() => 0);
  const moved: TextChange[] = [];
  for (const part of parts) {
    let by = 0;
    for (const [index, their] of sorted.entries()) {
      if (their.end <= part.start) by += delta(their);
      else if (part.end <= their.start) shift[index] += delta(part);
      else return undefined;
    }
    moved.push({ start: part.start + by, end: part.end + by, text: part.text });
  }
  return { mine: moved, theirs: sorted.map((their, index) => ({ start: their.start + shift[index], end: their.end + shift[index], text: their.text })) };
}

/** Someone else's change moving down a stack: in `text` (at the step's `want` revision, now `revision`). */
type Level = { theirs: readonly TextChange[]; text: string; want: number; revision: number };

/**
 * Someone else's change (the draft store's `SharedRebase`): the text follows it outside history, and the steps over
 * the file are moved past it. Typing still open stays open, its start moved too; when their change overlaps it, it
 * closes as a step first (which then cannot move).
 */
export function rebaseHistory(history: HistoryAccess, input: EditInput): StepResult {
  const entry = history.entry;
  let applied: ReturnType<typeof applyChanges>;
  try {
    applied = applyChanges(entry.text, input.changes ?? [diffRange(entry.text, input.text ?? entry.text)]);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (applied.text === entry.text) return { ok: true };
  const theirs = applied.changes;
  const session = history.typing;
  let open: ReturnType<typeof rebaseChanges>, start: string | undefined;
  if (session?.start) {
    open = rebaseChanges([diffRange(entry.text, session.start.text)], theirs);
    try { if (open) start = applyChanges(applied.text, open.mine).text; } catch { open = undefined; }
    if (!open) history.commitTyping(entry.key);
  }
  // Read after the typing closed: typing that came back to its start gives the file that start's revision again.
  const was = entry.revision;
  entry.text = applied.text;
  entry.revision = history.revision();
  history.persist(entry);
  history.textEvent(entry, "shared", applied.changes);
  const now: Level = { theirs, text: entry.text, want: was, revision: entry.revision };
  let below = now;
  if (session?.start && open && start !== undefined) {
    // Monaco's stops under their change no longer line up: no version, so this typing undoes whole.
    below = { theirs: open.theirs, text: start, want: session.start.revision, revision: history.revision() };
    session.start = { text: start, revision: below.revision };
  }
  for (const [name, found] of history.journals) {
    if (![...found.undo, ...found.redo].some(step => history.keysOf(step).includes(entry.key))) continue;
    rebaseStack(history, found.undo, below, "undo");
    rebaseStack(history, found.redo, now, "redo");
    history.emitHistory(name);
  }
  return { ok: true };
}

/** Moves the steps over the file on one stack past their change, from the one Undo (or Redo) runs next. */
function rebaseStack(history: HistoryAccess, stack: Step[], level: Level, direction: "undo" | "redo") {
  for (let index = stack.length - 1; index >= 0; index--) {
    const step = stack[index];
    if (step.kind !== "action" && !history.keysOf(step).includes(history.entry.key)) continue;
    const moved = step.kind === "edit" || step.kind === "typing" ? moveStep(history, step, level, direction) : undefined;
    if (!moved) { for (const old of stack.splice(0, index + 1)) history.disposeStep(old); return; }
    stack[index] = moved.step;
    level = moved.level;
  }
}

/** One step moved past their change, as an edit step; the level under it. Undefined when it cannot move. */
function moveStep(history: HistoryAccess, step: EditStep | TypingStep, level: Level, direction: "undo" | "redo") {
  const undo = direction === "undo";
  if (step.kind === "typing" && step.at !== (undo ? step.end : step.start)) return undefined;
  const [from, to] = step.kind === "edit" ? undo ? [step.after, step.before] : [step.before, step.after]
    : undo ? [step.end.revision, step.start.revision] : [step.start.revision, step.end.revision];
  if (from !== level.want) return undefined;
  const mine = step.kind === "edit" ? undo ? step.inverse : step.changes
    : [undo ? diffRange(step.end.text, step.start.text) : diffRange(step.start.text, step.end.text)];
  const moved = rebaseChanges(mine, level.theirs);
  if (!moved) return undefined;
  let applied: ReturnType<typeof applyChanges>;
  try { applied = applyChanges(level.text, moved.mine); } catch { return undefined; }
  const revision = history.revision();
  const edit: EditStep = { kind: "edit", id: step.id, label: step.label, key: step.key, group: false, companions: step.companions,
    changes: undo ? applied.inverse : applied.changes, inverse: undo ? applied.changes : applied.inverse,
    before: undo ? revision : level.revision, after: undo ? level.revision : revision, records: { before: undefined, after: undefined } };
  return { step: edit, level: { theirs: moved.theirs, text: applied.text, want: to, revision } };
}
