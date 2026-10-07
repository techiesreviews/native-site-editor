import type { createCommitHistory } from "../components/commit-history";
import type { HistoryCommit, RestoreResult } from "../../shared/types";

type HistoryOptions = Parameters<typeof createCommitHistory>[0];
export interface HistoryContext {
  key: string;
  repo: string;
  branch: string;
  path?: string;
  empty: boolean;
  isCurrent(site?: boolean): boolean;
  hasDraft(): boolean;
  viewing(): string | undefined;
}
export interface HistoryPorts {
  capture(): HistoryContext | undefined;
  panel(): HTMLElement | undefined;
  anchor(): HTMLElement | undefined;
  loadHistory(): Promise<{ createCommitHistory: typeof createCommitHistory }>;
  emptyMessage(): HTMLElement;
  viewport(): { width: number; height: number };
  onResize(callback: () => void): () => void;
  openFile(path: string, commit: HistoryCommit, head: string): void;
  view(commit: HistoryCommit, head: string, latest: boolean): void;
  restored(path: string, result: RestoreResult): Promise<void>;
  expired(): void;
  onError(error: unknown): void;
}

/** Lazy History presentation with request proofs; version transactions stay in the host. */
export function createHistoryController(ports: HistoryPorts) {
  let history: ReturnType<typeof createCommitHistory> | undefined;
  let scope: "file" | "site" = "file";
  let epoch = 0;
  // Closing invalidates presentation, while an accepted restore keeps its file ownership.
  // Replacing the mounted panel or destroying the controller ends both lifetimes.
  let lifetime = 0;
  let pending: { key: string; promise: Promise<void> } | undefined;
  let unsubscribe: (() => void) | undefined;
  function position(panel = ports.panel(), anchor = ports.anchor()) {
    if (!panel || !anchor) return;
    const { width, height } = ports.viewport();
    const rect = anchor.getBoundingClientRect();
    const top = Math.max(16, Math.min(rect.bottom + 6, height - 100));
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `min(70vh, ${Math.max(0, height - top - 16)}px)`;
    panel.showPopover();
    const maxRight = Math.max(16, width - panel.getBoundingClientRect().width - 16);
    panel.style.right = `${Math.min(maxRight, Math.max(16, width - rect.right))}px`;
  }
  function close() {
    epoch++;
    pending = undefined;
    const panel = ports.panel();
    if (panel?.matches(":popover-open")) panel.hidePopover();
  }
  function destroy() {
    lifetime++;
    close();
    history?.destroy(); history = undefined;
    unsubscribe?.(); unsubscribe = undefined;
  }
  function open(force = false) {
    const context = ports.capture(), panel = ports.panel(), anchor = ports.anchor();
    if (!context || !panel || !anchor) return Promise.resolve();
    const key = JSON.stringify([context.key, scope, force]);
    if (pending?.key === key) return pending.promise;
    let owner = lifetime;
    const generation = ++epoch, site = scope === "site" || !context.path;
    let mounted = false;
    const live = () => generation === epoch && panel === ports.panel() && context.isCurrent(mounted && site);
    const restoreCurrent = () => owner === lifetime && panel === ports.panel() && context.isCurrent(false) && !context.hasDraft();
    const promise = ports.loadHistory().then(({ createCommitHistory }) => {
      if (!live()) return;
      if (!unsubscribe) unsubscribe = ports.onResize(() => { if (ports.panel()?.matches(":popover-open")) position(); });
      if (!force && panel.matches(":popover-open")) { close(); return; }
      owner = ++lifetime;
      history?.destroy(); history = undefined;
      if (context.empty) { panel.replaceChildren(ports.emptyMessage()); position(panel); return; }
      mounted = true;
      const options: HistoryOptions = {
        repo: context.repo, branch: context.branch, path: context.path,
        scope: site ? "site" : "file", isCurrent: live,
        isRestoreCurrent: restoreCurrent,
        onScope: next => { if (!live()) return; scope = next; void open(true).catch(ports.onError); },
        onOpenFile: (file, commit, head) => { if (live()) ports.openFile(file, commit, head); },
        hasDraft: () => live() && context.hasDraft(),
        onExpired: () => { if (live()) ports.expired(); },
        onRestored: async result => { if (restoreCurrent() && context.path) await ports.restored(context.path, result); },
        onView: (commit, head, latest) => { if (live()) ports.view(commit, head, latest); },
        viewing: () => live() ? context.viewing() : undefined,
      };
      history = createCommitHistory(options);
      panel.replaceChildren(history.root);
      position(panel);
    }).finally(() => { if (pending?.promise === promise) pending = undefined; });
    pending = { key, promise };
    return promise;
  }
  return { open, position, close, destroy, mark: () => history?.mark(), refresh: () => history?.refresh() };
}
