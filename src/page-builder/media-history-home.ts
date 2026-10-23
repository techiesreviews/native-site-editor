import type { Stamp } from "../guarded-edit";

type HistoryAction = () => boolean | Promise<boolean>;
type Recorder = (undo: HistoryAction, redo: HistoryAction, dispose?: () => void) => boolean;

/**
 * Keeps media Undo steps made while no editable file is open, until the next
 * one opens and takes them, oldest first. A step whose stamp no longer holds
 * (another repository, branch or load: src/workspace-session.ts) is dropped;
 * a step its file refuses stays held with every later one, so their order
 * never changes.
 */
export function createMediaHistoryHome() {
  let steps: { stamp: Pick<Stamp, "holds">; undo: HistoryAction; redo: HistoryAction; dispose?: () => void }[] = [];
  // Drops the steps of another workspace or load; the rest stay in order.
  function keep() {
    for (const step of steps) if (!step.stamp.holds()) step.dispose?.();
    return steps.filter(step => step.stamp.holds());
  }
  return {
    hold(stamp: Pick<Stamp, "holds">, undo: HistoryAction, redo: HistoryAction, dispose?: () => void): boolean {
      steps = keep();
      steps.push({ stamp, undo, redo, dispose });
      return true;
    },
    clear(): void {
      for (const step of steps) step.dispose?.();
      steps = [];
    },
    adopt(record: Recorder): void {
      const mine = keep();
      const refused = mine.findIndex(step => !record(step.undo, step.redo, step.dispose));
      steps = refused < 0 ? [] : mine.slice(refused);
    },
  };
}
