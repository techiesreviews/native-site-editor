// What the editor says: the #status live region, for screen readers (it shows
// nothing on screen), and the Undo that takes back the step a control names.

import { refuse } from "./components/refusal-note";
import type * as sourceEditor from "./components/source-editor";

/** `live`: false once the step the action takes back is no longer the newest (an action with none is always live). */
export interface UndoAction { label: string; run(): void; live?(): boolean }

export interface AnnouncePorts {
  element: <T extends HTMLElement>(id: string) => T;
  editorModule: Pick<typeof sourceEditor, "latestUndo" | "runVisualHistory">;
}

export function createAnnounce(ports: AnnouncePorts) {
  const { element, editorModule } = ports;
  // Said in #status only: the change shows where it happened, and the top bar's Undo takes it back.
  function announce(text: string) {
    element("status").textContent = text;
  }
  // The Undo of the newest step in `path`'s history, bound to that step now: once another is newer, it refuses.
  function undoAction(path: string): UndoAction | undefined {
    const step = editorModule.latestUndo(path);
    const live = () => editorModule.latestUndo(path) === step;
    return step === undefined ? undefined : { label: "Undo", live, run() {
      if (live()) void editorModule.runVisualHistory("undo", path);
      else refuse("Newer changes came after this one. Use Undo at the top to take them back first.");
    } };
  }
  return { announce, undoAction };
}
