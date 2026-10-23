// History and the version on show: the History panel's wiring
// (src/controllers/history-controller.ts), an earlier version of the open
// file chosen there, and its restore. The host (src/main.ts) keeps the
// workspace session, the drafts, the preview and the editor, and hands them
// in as live ports.

import type { FileRevision, HistoryCommit, RestoreResult } from "../shared/types";
import type { AppStore } from "./app-store";
import type { createCommitHistory } from "./components/commit-history";
import type { createConfirmDialog } from "./components/confirm-dialog";
import type { VersionCompare } from "./components/source-editor";
import { createHistoryController } from "./controllers/history-controller";
import type { DraftScope, SavedDraft } from "./drafts";
import { ApiError } from "./github-reads";
import type { Stamp } from "./guarded-edit";
import { button, node } from "./ui/dom";
import type { SessionStamp } from "./workspace-session";

type ConfirmDialog = Pick<ReturnType<typeof createConfirmDialog>, "root" | "ask">;

export interface VersionViewPorts {
  appStore: Pick<AppStore, "openFile" | "repository" | "snapshot">;
  workspaceSession: { begin(): SessionStamp };
  guardedEdits: { stamp(over: "repository"): Stamp };
  editorModule: { compareVersion(path: string, version: VersionCompare | undefined): void };
  /** Host state, read at call time. */
  readonly nativePreview: { setViewing(bar: HTMLElement | undefined): void } | undefined;
  currentLoad(): number;
  setupScope(): string;
  draftScope(): DraftScope | undefined;
  draftStore(): { get(scope: DraftScope, path: string): SavedDraft | undefined };
  nativeEffectiveSource(path: string): string | undefined;
  updateNativePreviewSources(): void;
  loadHistory(): Promise<{ createCommitHistory: typeof createCommitHistory }>;
  loadConfirmDialog(): Promise<{ createConfirmDialog: (id: string) => ConfirmDialog }>;
  api<T>(path: string, params?: Record<string, string>): Promise<T>;
  postApi<T>(path: string, params: Record<string, string>, body: unknown): Promise<T>;
  restoreFile(path: string, at: SessionStamp, options: { keepExplorer: boolean }): Promise<void>;
  loadSnapshot(path: string): Promise<void>;
  status(message: string): void;
  errorMessage(error: unknown): void;
  refuse(message: string): void;
}

export function createVersionView(ports: VersionViewPorts) {
  const historyController = createHistoryController({
    capture: () => {
      const scope = ports.draftScope(), snapshot = ports.appStore.snapshot.value;
      if (!scope || !snapshot) return undefined;
      const at = ports.workspaceSession.begin(), path = ports.appStore.openFile.value;
      return {
        key: JSON.stringify([at.load, scope.account, scope.repoId, snapshot.commit, scope.branch, path]),
        repo: scope.repo, branch: scope.branch, path, empty: Boolean(snapshot.empty),
        isCurrent: site => at.holds() && (site || ports.appStore.openFile.value === path),
        hasDraft: () => Boolean(path && ports.draftStore().get(scope, path)),
        viewing: () => { const view = versionView; return view && view.path === path && view.key === versionKey() ? view.commit.sha : undefined; },
      };
    },
    panel: () => document.getElementById("changes") ?? undefined,
    anchor: () => document.getElementById("history-button") ?? undefined,
    loadHistory: () => ports.loadHistory(),
    emptyMessage: () => node("p", "muted commit-history__message", "No commits yet. Publishing makes the first one."),
    viewport: () => ({ width: innerWidth, height: innerHeight }),
    onResize: callback => { window.addEventListener("resize", callback); return () => window.removeEventListener("resize", callback); },
    openFile: (file, commit, head) => void openFileVersion(file, commit, head),
    view: (commit, head, latest) => latest ? endVersionView() : void viewVersion(commit, head),
    restored: async (path, result) => { endVersionView(false); await afterRestore(path, result); },
    restoreSkipped: (path, result, hasDraft) => ports.status(`${result.unchanged
      ? "This file already matches that version; reload before saving."
      : `Restored ${path} in a new commit; reload before saving.`}${hasDraft ? " Your draft was kept." : ""}`),
    expired: () => ports.errorMessage(new ApiError(401, "Your GitHub session expired. Connect again.")),
    onError: error => ports.errorMessage(error),
  });

  // A file from the site's history: it opens, showing its version from that
  // commit unless that is the branch's latest.
  async function openFileVersion(path: string, commit: HistoryCommit, head: string) {
    const at = ports.workspaceSession.begin();
    if (ports.appStore.openFile.value !== path) await ports.restoreFile(path, at, { keepExplorer: false });
    if (!at.holds() || ports.appStore.openFile.value !== path) return;
    if (commit.sha === head) endVersionView();
    else await viewVersion(commit, head);
  }

  async function afterRestore(path: string, result: RestoreResult) {
    historyController.destroy();
    if (!result.unchanged) await ports.loadSnapshot(path);
    ports.status(result.unchanged ? "This file already matches that version." : `Restored ${path} in a new commit. Other files are unchanged.`);
  }

  // An earlier version of the open file on show, chosen in History: the
  // preview renders it (nothing on it can be selected), the code pane shows
  // it beside the current one, and a bar over the preview offers Back to
  // latest and Restore. It ends there, on a restore, on another file or
  // repository, or once the file's current source changes.
  type VersionView = { key: string; path: string; commit: HistoryCommit; head: string; content: string; latest: string | undefined };
  let versionView: VersionView | undefined;
  let versionRequest = 0;
  let versionDialog: ConfirmDialog | undefined;
  const versionKey = () => `${ports.currentLoad()}:${ports.setupScope()}`;
  const versionLabel = (commit: HistoryCommit) => {
    const date = new Date(commit.date);
    return Number.isNaN(date.getTime())
      ? commit.sha.slice(0, 7)
      : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  async function viewVersion(commit: HistoryCommit, head: string) {
    const path = ports.appStore.openFile.value;
    if (!path || !ports.appStore.repository.value) return;
    const request = ++versionRequest;
    const key = versionKey();
    try {
      const revision = await ports.api<FileRevision>("file-at", { repo: ports.appStore.repository.value.full_name, commit: commit.sha, path });
      if (request !== versionRequest || key !== versionKey() || ports.appStore.openFile.value !== path) return;
      ports.nativePreview?.setViewing(undefined);
      versionView = { key, path, commit, head, content: revision.content, latest: ports.nativeEffectiveSource(path) };
      ports.nativePreview?.setViewing(versionBar(versionView));
      ports.editorModule?.compareVersion(path, { content: revision.content, label: versionLabel(commit) });
      ports.updateNativePreviewSources();
      historyController.mark();
    } catch (error) {
      if (request === versionRequest) ports.status(error instanceof Error ? error.message : "That version could not be loaded. Try again.");
    }
  }

  function endVersionView(refresh = true) {
    versionRequest++;
    const view = versionView;
    if (!view) return;
    versionView = undefined;
    ports.nativePreview?.setViewing(undefined);
    ports.editorModule?.compareVersion(view.path, undefined);
    historyController.mark();
    if (refresh) ports.updateNativePreviewSources();
  }

  // The version on show ends once it no longer belongs to what is open.
  function checkVersionView() {
    const view = versionView;
    if (view && (view.key !== versionKey() || ports.appStore.openFile.value !== view.path || ports.nativeEffectiveSource(view.path) !== view.latest))
      endVersionView(false);
  }

  function versionBar(view: VersionView) {
    const bar = node("div", "version-bar");
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Earlier version");
    const text = node("p", "version-bar__text");
    text.append(node("strong", "", `Viewing ${versionLabel(view.commit)}`), node("span", "version-bar__message", view.commit.message));
    text.title = `${view.commit.message} (${view.commit.sha.slice(0, 7)})`;
    bar.append(
      text,
      button("Back to latest", () => endVersionView(), "button secondary"),
      button("Restore this version", () => void restoreVersion(view), "button primary"),
    );
    return bar;
  }

  async function restoreVersion(view: VersionView) {
    const scope = ports.draftScope();
    if (!ports.appStore.repository.value || !ports.appStore.snapshot.value || versionView !== view) return;
    if (scope && ports.draftStore().get(scope, view.path)) {
      ports.refuse("Publish or discard this file’s draft before restoring. Other files’ drafts are kept.");
      return;
    }
    const since = ports.guardedEdits.stamp("repository");
    const { createConfirmDialog } = await ports.loadConfirmDialog();
    if (!since.holds() || versionView !== view) return;
    if (!versionDialog) {
      versionDialog = createConfirmDialog("version-dialog");
      document.body.append(versionDialog.root);
    }
    const confirmed = await versionDialog.ask({
      title: "Restore this version?",
      notes: [
        `${view.path} on ${ports.appStore.snapshot.value.branch} goes back to how it was on ${versionLabel(view.commit)} (${view.commit.message}).`,
        "This creates a new commit. Other files stay unchanged.",
      ],
      action: "Restore version",
    });
    if (!confirmed || versionView !== view || !ports.appStore.repository.value || !ports.appStore.snapshot.value) return;
    ports.status("Restoring file…");
    try {
      const result = await ports.postApi<RestoreResult>("restore", { repo: ports.appStore.repository.value.full_name }, {
        branch: ports.appStore.snapshot.value.branch, path: view.path, target: view.commit.sha, expectedHead: view.head,
      });
      if (versionView !== view) return;
      endVersionView(false);
      await afterRestore(view.path, result);
    } catch (error) {
      if (versionView === view) ports.status(error instanceof Error ? error.message : "Restore failed. Your files are unchanged.");
    }
  }

  return { history: historyController, get view() { return versionView; }, end: endVersionView, check: checkVersionView };
}
