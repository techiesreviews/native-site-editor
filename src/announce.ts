// What the editor says: #status, and the toast beside it (loaded on first
// use) with the Undo that takes back the step it names.

import { refuse } from "./components/refusal-note";
import type { AnnounceAs } from "./components/toast-rules";
import type { ToastAction } from "./components/toast";
import type * as sourceEditor from "./components/source-editor";

export interface AnnouncePorts {
  element: <T extends HTMLElement>(id: string) => T;
  editorModule: Pick<typeof sourceEditor, "latestUndo" | "runVisualHistory">;
}

export function createAnnounce(ports: AnnouncePorts) {
  const { element, editorModule } = ports;
  type Toast = typeof import("./components/toast");
  let toast: Toast | undefined, toastLoad: Promise<Toast> | undefined;
  // Said in #status and shown as the toast (slice 105, loaded on first use).
  function announce(text: string, as?: AnnounceAs) {
    element("status").textContent = text;
    if (as === "quiet") return;
    showToast(text, as?.undo === undefined ? undefined : undoAction(as.undo));
  }
  // Shows `text` (already said in #status) as the toast with `action`.
  function showToast(text: string, action?: ToastAction) {
    if (toast) toast.showToast(text, action);
    else void (toastLoad ??= import("./components/toast")).then(loaded => {
      toast = loaded;
      // Said over meanwhile (a refusal, a newer announcement): not shown.
      if (element("status").textContent === text) loaded.showToast(text, action);
    });
  }
  // The toast's Undo takes back the step it names, the newest one: once another is newer, it refuses.
  function undoAction(path: string) {
    const step = editorModule.latestUndo(path);
    return step === undefined ? undefined : { label: "Undo", run() {
      if (editorModule.latestUndo(path) === step) void editorModule.runVisualHistory("undo", path);
      else refuse("Newer changes came after this one. Use Undo at the top to take them back first.");
    } };
  }
  return { announce, showToast, undoAction };
}
