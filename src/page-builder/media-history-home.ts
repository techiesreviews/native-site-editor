type HistoryAction = () => boolean | Promise<boolean>;
type Recorder = (undo: HistoryAction, redo: HistoryAction, dispose?: () => void) => boolean;

/**
 * Keeps media Undo steps made while no editable file is open, until the next
 * one opens and takes them, oldest first. Steps from another repository,
 * branch or generation (`identity`) are dropped; a step its file refuses
 * stays held with every later one, so their order never changes.
 */
export function createMediaHistoryHome() {
  let steps: { identity: string; undo: HistoryAction; redo: HistoryAction; dispose?: () => void }[] = [];
  return {
    hold(identity: string, undo: HistoryAction, redo: HistoryAction, dispose?: () => void): boolean {
      for (const step of steps) if (step.identity !== identity) step.dispose?.();
      steps = steps.filter(step => step.identity === identity);
      steps.push({ identity, undo, redo, dispose });
      return true;
    },
    clear(): void {
      for (const step of steps) step.dispose?.();
      steps = [];
    },
    adopt(identity: string, record: Recorder): void {
      for (const step of steps) if (step.identity !== identity) step.dispose?.();
      const mine = steps.filter(step => step.identity === identity);
      const refused = mine.findIndex(step => !record(step.undo, step.redo, step.dispose));
      steps = refused < 0 ? [] : mine.slice(refused);
    },
  };
}
