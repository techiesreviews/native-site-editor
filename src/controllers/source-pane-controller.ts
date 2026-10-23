// Opening a file in the source pane: a tree entry read from the branch, or a
// draft's text, mounted in the source editor with its stylesheet beside it
// (src/controllers/linked-styles-controller.ts). The host (src/main.ts) keeps
// the workspace, the drafts, the preview and the save controls, and hands them
// in as live ports.

import type { NativeSite } from "../../shared/native-project";
import { nativePageRoute } from "../../shared/native-routes";
import type { Directory, EditorContext, SessionInfo, TreeEntry } from "../../shared/types";
import type { VariantFiles } from "../../shared/variant-lookup";
import type { AppStore } from "../app-store";
import type * as SourceEditor from "../components/source-editor";
import type { SourceFile } from "../components/source-editor";
import { draftKey, type DraftScope, type SavedDraft } from "../drafts";
import type { FileChange } from "../file-changes";
import { ApiError } from "../github-reads";
import { unreadableAsText } from "../native-boot";
import type { CssWorkspace } from "../page-builder/css-intelligence";
import { node } from "../ui/dom";
import { reported } from "../ui/report-failure";
import type { SessionStamp } from "../workspace-session";
import { rememberWorkspace } from "../workspace-state";
import type { createLinkedStylesController } from "./linked-styles-controller";
import type { createSavePublishController } from "./save-publish-controller";

type LinkedStyles = ReturnType<typeof createLinkedStylesController>;
type SavePublish = ReturnType<typeof createSavePublishController>;

export interface SourcePanePorts {
  appStore: Pick<AppStore, "openFile" | "repository" | "snapshot" | "selection">;
  workspaceSession: { begin(): SessionStamp };
  editorModule: Pick<typeof SourceEditor, "isMounted" | "holdHistoryRefresh">;
  linkedStyles: Pick<LinkedStyles, "syncLinkedStyles" | "openSecondary" | "renderLinkedStyle" | "linkedPage" | "unlink" | "openDefaultLinkedStyle" | "openComponentLinkedStyle">;
  savePublish: Pick<SavePublish, "proof" | "published" | "discardAll" | "headFor" | "checkHead" | "isDeleted" | "settleDeleted">;
  versions: { history: { refresh(): void; open(): Promise<void> } };
  previewSelection: { replayPending(path: string): void };
  nativeBaseSources: { has(path: string): boolean; set(path: string, text: string): unknown };
  nativeVariantFiles: VariantFiles;
  /** Host state, read at call time. */
  readonly info: Pick<SessionInfo, "user">;
  readonly content: Pick<HTMLElement, "replaceChildren">;
  readonly explorerDropdown: { close(): void } | undefined;
  readonly nativeSite: NativeSite | undefined;
  readonly nativePreview: { hideEditBar(): void } | undefined;
  readonly componentTools: { refresh(): void; show(target: undefined): void } | undefined;
  readonly pageStructure: { refreshMeta(): void } | undefined;
  /** File selections within one load: read, and bumped by a new selection. */
  fileGeneration(): number;
  nextFileGeneration(): number;
  setActiveFileContext(value: EditorContext["file"]): void;
  openCodeEditor(file: SourceFile, beforeMount?: () => boolean): Promise<void>;
  element(id: string): Pick<HTMLElement, "textContent">;
  status(message: string): void;
  settleStatus(message: string): void;
  errorMessage: (error: unknown, retry?: () => void) => void;
  readFile(repo: string, sha: string): Promise<string>;
  entryAt(path: string): TreeEntry | undefined;
  draftScope(): DraftScope | undefined;
  draftStore(): { get(scope: DraftScope, path: string): SavedDraft | undefined };
  openAfter(path: string | undefined, keepExplorer?: boolean, quietStatus?: boolean): Promise<void>;
  setCurrentPage(path?: string): void;
  showDeletedFile(path: string): void;
  isNativeTextFile(path: string): boolean;
  nativeModeActive(): boolean;
  nativeRouteForPath(path: string | undefined): string | undefined;
  nativeComponentTagForPath(path: string): string | undefined;
  nativeFallbackPage(path: string): string | undefined;
  /** A free function: the editor calls it without a receiver. */
  nativeCssWorkspace: () => CssWorkspace | undefined;
  updateNativePreviewSources(): void;
  discardedNewPages(paths: string[]): void;
  restoreFile(path: string, at: SessionStamp): Promise<void>;
  showDirectory(directory: Directory): void;
  refreshFiles(): void;
  updateAgentContext(): void;
  updateCurrentPageLabel(): void;
  discardFileChange: (change: FileChange) => Promise<void>;
}

export function createSourcePaneController(ports: SourcePanePorts) {
  const { appStore, linkedStyles, savePublish } = ports;

  async function openEntry(
    entry: TreeEntry,
    path: string,
    at: SessionStamp,
    options: { linkDefaultStyle?: boolean; keepExplorer?: boolean; quietStatus?: boolean; beforeMount?: () => boolean; retry?: () => void } = {},
  ) {
    const scope = ports.draftScope();
    if (!at.holds() || !appStore.repository.value || !scope) return;
    // A file deleted in the drafts opens as a note with Restore; one renamed
    // or moved opens where it is now.
    const marker = ports.draftStore().get(scope, path);
    if (marker?.deleted) {
      if (marker.movedTo) { await ports.openAfter(marker.movedTo, options.keepExplorer, options.quietStatus); return; }
      ports.nextFileGeneration();
      if (!options.keepExplorer) ports.explorerDropdown?.close();
      ports.setCurrentPage(path);
      ports.showDeletedFile(path);
      return;
    }
    const selection = ports.nextFileGeneration();
    if (!options.keepExplorer) ports.explorerDropdown?.close();
    ports.setCurrentPage(path);
    if (entry.type === "commit") {
      ports.content.replaceChildren(
        node(
          "p",
          "empty-message",
          `Git submodule at ${entry.sha.slice(0, 12)}. Submodule contents are not loaded by this editor.`,
        ),
      );
      ports.status("Submodule selected.");
      return;
    }
    if ((entry.size ?? 0) > 1024 * 1024) {
      ports.content.replaceChildren(
        node(
          "p",
          "empty-message",
          "This file is larger than the 1 MB the editor opens as text.",
        ),
      );
      ports.status("Large file selected.");
      return;
    }
    ports.content.replaceChildren(node("p", "empty-message", "Loading source…"));
    if (!options.quietStatus) ports.status(`Reading ${path}…`);
    try {
      const content = await ports.readFile(appStore.repository.value.full_name, entry.sha);
      if (!at.holds() || selection !== ports.fileGeneration()) return;
      // A page the text index has not read yet: its text is the branch's, so
      // the preview draws it now, with what it shows (src/native-boot.ts).
      if (ports.nativeSite && ports.isNativeTextFile(path) && !ports.nativeBaseSources.has(path) && ports.entryAt(path)?.sha === entry.sha) {
        ports.nativeBaseSources.set(path, content);
        ports.updateNativePreviewSources();
      }
      await mountSource(
        path,
        content,
        entry.sha,
        entry.mode === "120000",
        at,
        selection,
        options,
      );
      // A file opened while this one's editor loaded has the last word.
      if (!options.quietStatus && selection === ports.fileGeneration()) ports.settleStatus(`Viewing ${path} at ${appStore.snapshot.value?.commit.slice(0, 7)}.`);
    } catch (error) {
      if (at.holds() && selection === ports.fileGeneration()) {
        ports.content.replaceChildren(
          node(
            "p",
            "empty-message",
            error instanceof Error ? error.message : "Could not read this file.",
          ),
        );
        // A file that is not text (or too big) is said here, where it was asked for, not as a failed request.
        if (unreadableAsText(error)) ports.status(`${path}: ${error instanceof Error ? error.message : "This file cannot be read as text."}`);
        else ports.errorMessage(error, options.retry);
      }
    }
  }

  async function mountSource(
    path: string,
    source: string,
    baseSha: string | null,
    readOnly: boolean,
    at: SessionStamp,
    selection: number,
    options: { linkDefaultStyle?: boolean; beforeMount?: () => boolean } = {},
  ) {
    const scope = ports.draftScope();
    if (!scope || !at.holds() || selection !== ports.fileGeneration()) return;
    const saveProof = savePublish.proof();
    await ports.openCodeEditor({
      key: draftKey(scope, path),
      scope,
      baseSha: baseSha,
      onPublished: (result, submitted) => savePublish.published(saveProof, scope, result, submitted),
      onDiscardNew: () => {
        // A discarded page no longer routes; the site shows the page's parent
        // page, else home.
        const page = Boolean(ports.nativeSite && (ports.nativeRouteForPath(path) ?? nativePageRoute(path)));
        if (page) {
          ports.discardedNewPages([path]);
          ports.element("status").textContent = `Discarded the new page ${path}.`;
          const fallback = ports.nativeFallbackPage(path);
          // Opened once the discard is done; what was announced (the discard,
          // or an undo's own words) outlasts the page's loading messages.
          if (fallback)
            queueMicrotask(reported(async () => {
              const said = ports.element("status").textContent;
              const at = ports.workspaceSession.begin();
              await ports.restoreFile(fallback, at);
              if (at.holds() && said) ports.element("status").textContent = said;
            }));
        }
        if (appStore.snapshot.value && ports.info.user) {
          ports.showDirectory(appStore.snapshot.value);
          rememberWorkspace(ports.info.user.login, {
            repoId: scope.repoId,
            branch: scope.branch,
          });
          ports.refreshFiles();
          ports.updateAgentContext();
        }
      },
      onContextChange: (value) => {
        ports.setActiveFileContext(value);
        if (value && appStore.openFile.value === value.path) linkedStyles.syncLinkedStyles(value.path, value.content);
        ports.updateAgentContext();
        ports.refreshFiles();
        ports.versions.history.refresh();
        if (ports.nativeModeActive()) ports.updateNativePreviewSources();
        // An open template's banner counts its instances again.
        ports.componentTools?.refresh();
        // The Page fields follow the page's head (typed, undone or redone).
        if (value && ports.nativeRouteForPath(value.path)) ports.pageStructure?.refreshMeta();
        // A heading or title typed in the open file renames it in the top bar.
        ports.updateCurrentPageLabel();
      },
      onHistory: () => void ports.versions.history.open().catch(ports.errorMessage),
      onDiscardAll: () => void savePublish.discardAll(),
      publishHead: () => savePublish.headFor(scope),
      onRefused: () => void savePublish.checkHead(true),
      onDiscardChange: reported(ports.discardFileChange),
      deletedUpstream: savePublish.isDeleted,
      onSettleDeleted: savePublish.settleDeleted,
      cssWorkspace: ports.nativeCssWorkspace, variants: ports.nativeVariantFiles,
      ensureHistoryTarget: async (path) => {
        const opened = await linkedStyles.openSecondary(path);
        if (opened) linkedStyles.renderLinkedStyle();
        return opened;
      },
      path,
      source: source,
      readOnly: readOnly,
      onSessionExpired: () =>
        ports.errorMessage(new ApiError(401, "Your GitHub session expired. Connect again.")),
    }, options.beforeMount);
    if (options.beforeMount && !ports.editorModule.isMounted(path)) return;
    // Another file opened over the selected page: its controls would edit the
    // wrong file, so the bar waits for the next preview click.
    if (ports.nativeModeActive() && appStore.selection.value?.path !== path) {
      ports.nativePreview?.hideEditBar();
      ports.componentTools?.show(undefined);
    }
    ports.componentTools?.refresh();
    // Checked before the file-generation guard: handling that click is what
    // superseded this open.
    ports.previewSelection.replayPending(path);
    if (!at.holds() || selection !== ports.fileGeneration() || !ports.info.user)
      return;
    rememberWorkspace(ports.info.user.login, {
      repoId: scope.repoId,
      branch: scope.branch,
      path,
    });
    // Another page's linked stylesheet does not carry over; a click in the
    // preview links this page's own rules.
    if (linkedStyles.linkedPage() !== path) linkedStyles.unlink();
    if (ports.nativeModeActive() && linkedStyles.linkedPage() === undefined && options.linkDefaultStyle !== false) {
      // A component opens with its own stylesheet beside it; a page with the shared one.
      const release = ports.editorModule.holdHistoryRefresh(path);
      try {
        if (ports.nativeComponentTagForPath(path)) await linkedStyles.openComponentLinkedStyle(path);
        else await linkedStyles.openDefaultLinkedStyle(path);
      } finally { release(); }
    }
  }

  return { openEntry, mountSource };
}
