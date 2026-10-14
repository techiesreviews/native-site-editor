type HistoryAction = () => boolean | Promise<boolean>;
type Recorder = (undo: HistoryAction, redo: HistoryAction) => boolean;

/**
 * Keeps media Undo steps made while no editable file is open, until the next
 * one opens and takes them, oldest first. Steps from another repository,
 * branch or generation (`identity`) are dropped; a step its file refuses
 * stays held with every later one, so their order never changes.
 */
export function createMediaHistoryHome() {
  let steps: { identity: string; undo: HistoryAction; redo: HistoryAction }[] = [];
  return {
    hold(identity: string, undo: HistoryAction, redo: HistoryAction): boolean {
      steps.push({ identity, undo, redo });
      return true;
    },
    adopt(identity: string, record: Recorder): void {
      const mine = steps.filter(step => step.identity === identity);
      const refused = mine.findIndex(step => !record(step.undo, step.redo));
      steps = refused < 0 ? [] : mine.slice(refused);
    },
  };
}
