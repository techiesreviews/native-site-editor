// Opening a file in the source pane: a tree entry read from the branch, or a
// draft's text, mounted in the source editor with its stylesheet beside it
// (src/controllers/linked-styles-controller.ts). The host (src/main.ts) keeps
// the workspace, the drafts, the preview and the save controls, and hands them
// in as live ports, the shared host modules (src/host-modules.ts) whole.

import type { NativeSite } from "../../shared/native-project";
import { nativePageRoute } from "../../shared/native-routes";
import type { EditorContext, SessionInfo, TreeEntry } from "../../shared/types";
import type { VariantFiles } from "../../shared/variant-lookup";
import type { AppStore } from "../app-store";
import type * as SourceEditor from "../components/source-editor";
import type { SourceFile } from "../components/source-editor";
import { draftKey, type DraftScope, type SavedDraft } from "../drafts";
import type { FileChange } from "../file-changes";
import { ApiError } from "../github-reads";
import { unreadableAsText } from "../native-boot";
import type { CssWorkspace } from "../page-builder/css-intelligence";
import { isNativeTextFile } from "../site-text-index";
import type { Notices, Preview, Repo, Session, View } from "../host-modules";
import { node } from "../ui/dom";
import { reported } from "../ui/report-failure";
import type { SessionStamp } from "../workspace-session";
import { rememberWorkspace } from "../workspace-state";
import type { createLinkedStylesController } from "./linked-styles-controller";
import type { createSavePublishController } from "./save-publish-controller";

type LinkedStyles = ReturnType<typeof createLinkedStylesController>;
type SavePublish = ReturnType<typeof createSavePublishController>;

export interface SourcePanePorts {
  // The shared host modules (src/host-modules.ts), each handed over whole; their members are read at call time.
  notices: Pick<Notices, "status" | "settleStatus" | "errorMessage">;
  session: Pick<Session, "begin" | "draftScope">;
  repo: Pick<Repo, "readFile" | "entryAt">;
  /** The view's file counter numbers file selections within one load: read, and bumped by a new selection. */
  view: Pick<View, "fileGeneration" | "setCurrentPage" | "showDirectory" | "restoreFile" | "updateAgentContext" | "updateCurrentPageLabel">;
  preview: Pick<Preview, "nativeModeActive" | "nativeRouteForPath" | "nativeComponentTagForPath" | "nativeFallbackPage" | "updateNativePreviewSources">;
  /** The workspace screen's parts (src/workspace-mount.ts): its content, explorer, code editor and the open file's context. */
  panels: {
    readonly content: Pick<HTMLElement, "replaceChildren">;
    readonly explorerDropdown: { close(): void } | undefined;
    activeFileContext: EditorContext["file"];
    openCodeEditor(file: SourceFile, beforeMount?: () => boolean): Promise<void>;
  };
  /** The page builder's host (src/page-builder-host.ts): a pending preview click, and the CSS and variant reads the editor uses. */
  pageBuilder: {
    readonly previewSelection: { replayPending(path: string): void };
    readonly nativeVariantFiles: VariantFiles;
    /** A free function: the editor calls it without a receiver. */
    readonly nativeCssWorkspace: () => CssWorkspace | undefined;
  };
  /** Pages & files (src/pages-and-files-host.ts): save and publish, the Files tree, and opening or discarding files. */
  pagesAndFiles: {
    readonly savePublish: Pick<SavePublish, "proof" | "published" | "discardAll" | "headFor" | "beginSave" | "checkHead" | "isDeleted" | "settleDeleted">;
    readonly filesTreeController: { refresh(): void };
    openAfter(path: string | undefined, keepExplorer?: boolean, quietStatus?: boolean): Promise<void>;
    discardedNewPages(paths: string[]): void;
    discardFileChange: (change: FileChange) => Promise<void>;
  };
  /** The open site (src/native-site-runtime.ts): its site, read at call time, and GitHub's texts of its files. */
  runtime: { readonly site: NativeSite | undefined; readonly base: { readonly sources: { has(path: string): boolean; set(path: string, text: string): unknown } } };
  appStore: Pick<AppStore, "openFile" | "repository" | "snapshot" | "selection">;
  editorModule: Pick<typeof SourceEditor, "isMounted" | "holdHistoryRefresh">;
  linkedStyles: Pick<LinkedStyles, "syncLinkedStyles" | "openSecondary" | "renderLinkedStyle" | "linkedPage" | "unlink" | "openDefaultLinkedStyle" | "openComponentLinkedStyle">;
  versions: { history: { refresh(): void; open(): Promise<void> } };
  /** Host state, read at call time. */
  readonly info: Pick<SessionInfo, "user">;
  readonly nativePreview: { hideEditBar(): void } | undefined;
  readonly componentTools: { refresh(): void; show(target: undefined): void } | undefined;
  readonly pageStructure: { refreshMeta(): void } | undefined;
  element(id: string): Pick<HTMLElement, "textContent">;
  draftStore(): { get(scope: DraftScope, path: string): SavedDraft | undefined };
  showDeletedFile(path: string): void;
}

export function createSourcePaneController(ports: SourcePanePorts) {
  const { appStore, linkedStyles, notices, session, repo, view, preview, panels, pageBuilder, pagesAndFiles, runtime } = ports;
  const { savePublish } = pagesAndFiles;

  async function openEntry(
    entry: TreeEntry,
    path: string,
    at: SessionStamp,
    options: { linkDefaultStyle?: boolean; keepExplorer?: boolean; quietStatus?: boolean; beforeMount?: () => boolean; retry?: () => void } = {},
  ) {
    const scope = session.draftScope();
    if (!at.holds() || !appStore.repository.value || !scope) return;
    // A file deleted in the drafts opens as a note with Restore; one renamed
    // or moved opens where it is now.
    const marker = ports.draftStore().get(scope, path);
    if (marker?.deleted) {
      if (marker.movedTo) { await pagesAndFiles.openAfter(marker.movedTo, options.keepExplorer, options.quietStatus); return; }
      ++view.fileGeneration;
      if (!options.keepExplorer) panels.explorerDropdown?.close();
      view.setCurrentPage(path);
      ports.showDeletedFile(path);
      return;
    }
    const selection = ++view.fileGeneration;
    if (!options.keepExplorer) panels.explorerDropdown?.close();
    view.setCurrentPage(path);
    if (entry.type === "commit") {
      panels.content.replaceChildren(
        node(
          "p",
          "empty-message",
          `Git submodule at ${entry.sha.slice(0, 12)}. Submodule contents are not loaded by this editor.`,
        ),
      );
      notices.status("Submodule selected.");
      return;
    }
    if ((entry.size ?? 0) > 1024 * 1024) {
      panels.content.replaceChildren(
        node(
          "p",
          "empty-message",
          "This file is larger than the 1 MB the editor opens as text.",
        ),
      );
      notices.status("Large file selected.");
      return;
    }
    panels.content.replaceChildren(node("p", "empty-message", "Loading source…"));
    if (!options.quietStatus) notices.status(`Reading ${path}…`);
    try {
      const content = await repo.readFile(appStore.repository.value.full_name, entry.sha);
      if (!at.holds() || selection !== view.fileGeneration) return;
      // A page the text index has not read yet: its text is the branch's, so
      // the preview draws it now, with what it shows (src/native-boot.ts).
      if (runtime.site && isNativeTextFile(path) && !runtime.base.sources.has(path) && repo.entryAt(path)?.sha === entry.sha) {
        runtime.base.sources.set(path, content);
        preview.updateNativePreviewSources();
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
      if (!options.quietStatus && selection === view.fileGeneration) notices.settleStatus(`Viewing ${path} at ${appStore.snapshot.value?.commit.slice(0, 7)}.`);
    } catch (error) {
      if (at.holds() && selection === view.fileGeneration) {
        const failed = node("p", "empty-message", error instanceof Error ? error.message : "Could not read this file.");
        panels.content.replaceChildren(failed);
        // A file that is not text (or too big) is said here, where it was asked for, not as a failed request.
        if (unreadableAsText(error)) notices.status(`${path}: ${error instanceof Error ? error.message : "This file cannot be read as text."}`);
        else notices.errorMessage(error, options.retry, failed);
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
    const scope = session.draftScope();
    if (!scope || !at.holds() || selection !== view.fileGeneration) return;
    const saveProof = savePublish.proof();
    await panels.openCodeEditor({
      key: draftKey(scope, path),
      scope,
      baseSha: baseSha,
      onPublished: (result, submitted) => savePublish.published(saveProof, scope, result, submitted),
      onDiscardNew: () => {
        // A discarded page no longer routes; the site shows the page's parent
        // page, else home.
        const page = Boolean(runtime.site && (preview.nativeRouteForPath(path) ?? nativePageRoute(path)));
        if (page) {
          pagesAndFiles.discardedNewPages([path]);
          ports.element("status").textContent = `Discarded the new page ${path}.`;
          const fallback = preview.nativeFallbackPage(path);
          // Opened once the discard is done; what was announced (the discard,
          // or an undo's own words) outlasts the page's loading messages.
          if (fallback)
            queueMicrotask(reported(async () => {
              const said = ports.element("status").textContent;
              const at = session.begin();
              await view.restoreFile(fallback, at);
              if (at.holds() && said) ports.element("status").textContent = said;
            }));
        }
        if (appStore.snapshot.value && ports.info.user) {
          view.showDirectory(appStore.snapshot.value);
          rememberWorkspace(ports.info.user.login, {
            repoId: scope.repoId,
            branch: scope.branch,
          });
          pagesAndFiles.filesTreeController.refresh();
          view.updateAgentContext();
        }
      },
      onContextChange: (value) => {
        panels.activeFileContext = value;
        if (value && appStore.openFile.value === value.path) linkedStyles.syncLinkedStyles(value.path, value.content);
        view.updateAgentContext();
        pagesAndFiles.filesTreeController.refresh();
        ports.versions.history.refresh();
        if (preview.nativeModeActive()) preview.updateNativePreviewSources();
        // An open template's banner counts its instances again.
        ports.componentTools?.refresh();
        // The Page fields follow the page's head (typed, undone or redone).
        if (value && preview.nativeRouteForPath(value.path)) ports.pageStructure?.refreshMeta();
        // A heading or title typed in the open file renames it in the top bar.
        view.updateCurrentPageLabel();
      },
      onHistory: () => void ports.versions.history.open().catch(notices.errorMessage),
      onDiscardAll: () => void savePublish.discardAll(),
      publishHead: () => savePublish.headFor(scope),
      // A push notice waits while this save runs (ticket am-32): its own commit's notice then loads nothing.
      publishSaving: () => savePublish.beginSave(),
      onRefused: () => void savePublish.checkHead(true),
      onDiscardChange: reported(pagesAndFiles.discardFileChange),
      deletedUpstream: savePublish.isDeleted,
      onSettleDeleted: savePublish.settleDeleted,
      cssWorkspace: pageBuilder.nativeCssWorkspace, variants: pageBuilder.nativeVariantFiles,
      ensureHistoryTarget: async (path) => {
        const opened = await linkedStyles.openSecondary(path);
        if (opened) linkedStyles.renderLinkedStyle();
        return opened;
      },
      path,
      source: source,
      readOnly: readOnly,
      onSessionExpired: () =>
        notices.errorMessage(new ApiError(401, "Your GitHub session expired. Connect again.")),
    }, options.beforeMount);
    if (options.beforeMount && !ports.editorModule?.isMounted(path)) return;
    // Another file opened over the selected page: its controls would edit the
    // wrong file, so the bar waits for the next preview click.
    if (preview.nativeModeActive() && appStore.selection.value?.path !== path) {
      ports.nativePreview?.hideEditBar();
      ports.componentTools?.show(undefined);
    }
    ports.componentTools?.refresh();
    // Checked before the file-generation guard: handling that click is what
    // superseded this open.
    pageBuilder.previewSelection.replayPending(path);
    if (!at.holds() || selection !== view.fileGeneration || !ports.info.user)
      return;
    rememberWorkspace(ports.info.user.login, {
      repoId: scope.repoId,
      branch: scope.branch,
      path,
    });
    // Another page's linked stylesheet does not carry over; a click in the
    // preview links this page's own rules.
    if (linkedStyles.linkedPage() !== path) linkedStyles.unlink();
    if (preview.nativeModeActive() && linkedStyles.linkedPage() === undefined && options.linkDefaultStyle !== false) {
      // A component opens with its own stylesheet beside it; a page with the shared one.
      const release = ports.editorModule?.holdHistoryRefresh(path);
      try {
        if (preview.nativeComponentTagForPath(path)) await linkedStyles.openComponentLinkedStyle(path);
        else await linkedStyles.openDefaultLinkedStyle(path);
      } finally { release?.(); }
    }
  }

  return { openEntry, mountSource };
}
