// Drafts that open without GitHub's file: a new draft in the source pane, an
// uploaded file with its picture and Discard, and a deleted file with
// Restore. The host (src/main.ts) keeps the workspace's screen and the file
// selection count, and hands them in as live ports.

import type { AppStore } from "./app-store";
import type { SavedDraft, DraftScope } from "./drafts";
import { isImagePath } from "./native-structure";
import { button, node } from "./ui/dom";
import { formatBytes, uploadBytes, uploadDataUrl } from "./uploads";
import type { SessionStamp, WorkspaceSession } from "./workspace-session";

export interface DraftViewsPorts {
  appStore: Pick<AppStore, "repository" | "snapshot">;
  workspaceSession: Pick<WorkspaceSession, "begin">;
  /** Host state, read at call time. */
  readonly workspace: { readonly content: HTMLElement; readonly explorerDropdown?: { close(): void } };
  fileGeneration: number;
  draftScope: () => DraftScope | undefined;
  status: (text: string) => void;
  setCurrentPage: (path?: string) => void;
  discardUpload: (path: string) => Promise<unknown>;
  openAfter: (path: string | undefined) => Promise<void>;
  undoFileChanges: (what: { restore?: string[] }) => void;
  mountSource: (path: string, source: string, baseSha: string | null, readOnly: boolean, at: SessionStamp, selection: number,
    options?: { linkDefaultStyle?: boolean; beforeMount?: () => boolean }) => Promise<unknown>;
}

export function createDraftViews(ports: DraftViewsPorts) {
  // Consts and functions main.ts never reassigns, read once; its `let` state and later consts stay `ports.` reads.
  const { appStore, workspaceSession, draftScope, status, setCurrentPage } = ports;

  async function openNewDraft(draft: SavedDraft, options: { keepExplorer?: boolean; linkDefaultStyle?: boolean; beforeMount?: () => boolean } = {}) {
    if (
      !appStore.snapshot.value ||
      !appStore.repository.value ||
      draft.repoId !== appStore.repository.value.id ||
      draft.branch !== appStore.snapshot.value.branch
    )
      return;
    const at = workspaceSession.begin(),
      selection = ++ports.fileGeneration;
    if (!options.keepExplorer) ports.workspace.explorerDropdown?.close();
    setCurrentPage(draft.path);
    // A binary or large file moved or copied here: its text is not held.
    if (draft.upload) {
      showUpload(draft);
      return;
    }
    if (draft.opaque) {
      ports.workspace.content.replaceChildren(node("p", "empty-message", `${draft.path} is ${draft.movedFrom ? `${draft.movedFrom} moved here` : "a copy of another file"}. Its content is not shown in the editor; publish to keep the change.`));
      status(`Selected ${draft.path}.`);
      return;
    }
    await ports.mountSource(draft.path, "", null, false, at, selection, options);
  }

  // An uploaded file, opened: the image itself when it is one, and Discard.
  function showUpload(draft: SavedDraft) {
    const panel = node("section", "directory-summary upload-summary");
    const name = draft.path.split("/").pop() ?? draft.path;
    panel.append(
      node("span", "badge", "Uploaded"),
      node("h1", "", name),
      node("p", "intro", `${draft.path} (${formatBytes(draft.upload?.size ?? 0)}) is kept in this browser until you save it to GitHub.`),
    );
    const scope = draftScope();
    if (isImagePath(draft.path) && scope) {
      const image = node("img", "upload-summary__image");
      image.alt = name;
      void uploadDataUrl(uploadBytes(), scope, draft).then((url) => { if (url) image.src = url; });
      panel.append(image);
    }
    const discard = button("Discard", () => { void ports.discardUpload(draft.path).then(() => ports.openAfter(undefined)); }, "button secondary");
    discard.setAttribute("aria-label", `Discard ${draft.path}`);
    panel.append(discard);
    ports.workspace.content.replaceChildren(panel);
    status(`Selected ${draft.path}.`);
  }

  // A file deleted in the drafts, opened (from the changes window, a link or a
  // reload): what happens to it, and Restore.
  function showDeletedFile(path: string) {
    const panel = node("section", "directory-summary");
    panel.append(
      node("span", "badge", "Deleted"),
      node("h1", "", path.split("/").pop() ?? path),
      node("p", "intro", `${path} is deleted in your changes. It is removed from GitHub when you save.`),
    );
    const restore = button("Restore", () => ports.undoFileChanges({ restore: [path] }), "button primary");
    restore.setAttribute("aria-label", `Restore ${path}`);
    panel.append(restore);
    ports.workspace.content.replaceChildren(panel);
    status(`${path} is deleted in your changes.`);
  }

  return { openNewDraft, showDeletedFile };
}
