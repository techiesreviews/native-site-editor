// The production adapter of the guarded edit module's seam (src/guarded-edit.ts):
// the editor's state, drafts, branch reads and source editor primitives, built
// in main.ts from its closures. The commit's rules live in the module
// (src/guarded-edit/commit.ts); this adapter only reaches the editor.

import type { DraftScope } from "./drafts";
import type { DraftAccess, MovableFile } from "./file-changes";
import type { NativeSite } from "../shared/native-project";
import type { EditorWorkspace, NodeRef } from "./guarded-edit";
import type { HistoryCompanion, HistorySourceEdit, HistorySourceReceipt } from "./components/source-editor";

type Range = { path: string; start: number; end: number; expected: string; text: string };
type Proof = { isCurrent(): boolean };
/** The source editor's calls this adapter makes (src/components/source-editor.ts). */
export interface WorkspaceEditor {
  isMounted(path: string): boolean;
  getMountedSource(path: string): string | undefined;
  captureFileModelState(scope: DraftScope, path: string, persistent?: boolean): Proof;
  /** The exact mounted pane, document and history session of `path`. */
  captureHistoryHost(path: string): Proof | undefined;
  retainFileModel(scope: DraftScope, path: string): () => void;
  evictDraftModel(scope: DraftScope, path: string, proof: Proof): Proof | undefined;
  prepareHistorySources(edits: HistorySourceEdit[], persistent?: boolean): HistorySourceReceipt | undefined;
  replaceActiveRanges(edits: Range[], companion?: HistoryCompanion): void;
  replaceActiveRange(edit: Range, group?: boolean, companion?: HistoryCompanion): void;
  closeActiveEditGroup(path: string): void;
  recordHistoryAction(path: string, undo: () => boolean, redo: () => boolean, dispose: () => void): boolean;
  holdHistoryRefresh(path: string): () => void;
}
export interface WorkspaceHost {
  generation(): number;
  /** The setup key (account, repository, branch). */
  setupScope(): string;
  draftScope(): DraftScope | undefined;
  versionView(): boolean;
  route(): string | undefined;
  editModeEntry(): object | undefined;
  agentActing(): boolean;
  site(): NativeSite | undefined;
  /** nativeFiles */
  files(): string[];
  store(): DraftAccess & { error: string | null };
  /** nativeEffectiveSource */
  source(path: string): string | undefined;
  /** nativePathExists, and the tree's paths in a plain repository */
  exists(path: string): boolean;
  /** nativeBaseSources */
  base(path: string): string | undefined;
  branchText(path: string): Promise<{ sha: string; text: string } | undefined>;
  entry(path: string): Promise<MovableFile | undefined>;
  createProblem(path: string): Promise<string | undefined>;
  openFile(): string | undefined;
  /** restoreFile for the page whose history takes a step (`beforeMount`: its editor mounts only while that holds). */
  restore(path: string, epoch: number, beforeMount?: () => boolean): Promise<void>;
  readonly editor: WorkspaceEditor;
  shareHistory(paths: string[], anchor: string): () => void;
  onMount(listener: (path: string, pane: boolean) => void): void;
  paneFile(): string | undefined;
  closePane(): void;
  afterFileChanges(): void;
  /** openAfter, quietly */
  openAfter(path: string | undefined, keepExplorer: boolean): Promise<void>;
  showRow(focus: { file?: string; route?: string } | undefined): void;
  status(): string;
  select(request: (NodeRef & { source?: string }) | undefined, reveal?: boolean): void;
  flash(request: NodeRef): void;
  announce(message: string): void;
  refuse(message: string, history?: "undo" | "redo"): void;
  error(error: unknown): void;
}

export function createEditorWorkspace(host: WorkspaceHost): EditorWorkspace {
  const { editor } = host;
  const scoped = <T>(use: (scope: DraftScope) => T, otherwise: T) => { const scope = host.draftScope(); return scope ? use(scope) : otherwise; };
  const model = (path: string) => {
    const scope = host.draftScope();
    return scope && editor.isMounted(path) ? editor.captureFileModelState(scope, path, true) : undefined;
  };
  return {
    scope: () => host.setupScope(),
    draftScope: () => host.draftScope(),
    generation: () => host.generation(),
    versionView: () => host.versionView(),
    route: () => host.route(),
    editModeEntry: () => host.editModeEntry(),
    agentActing: () => host.agentActing(),
    site: () => host.site(),
    files: () => host.files(),
    get store() { return host.store(); },
    source: path => host.source(path),
    exists: path => host.exists(path),
    base: path => host.base(path),
    branchText: path => host.branchText(path),
    entry: path => host.entry(path),
    createProblem: path => host.createProblem(path),
    modelState: model,
    model: path => scoped(scope => editor.captureFileModelState(scope, path, true), { isCurrent: () => false }),
    mounted: path => editor.isMounted(path),
    mountedSource: path => editor.getMountedSource(path),
    openFile: () => host.openFile(),
    open: (path, beforeMount) => host.restore(path, host.generation(), beforeMount),
    // The open page in this very pane and history session (a pane mounted again over the same
    // kept document is another one: its history did not see the open), at this revision.
    anchor(path) {
      const epoch = host.generation(), state = host.openFile() === path ? model(path) : undefined, pane = state && editor.captureHistoryHost(path);
      return pane && { isCurrent: () => epoch === host.generation() && host.openFile() === path && pane.isCurrent() && state.isCurrent() };
    },
    retainModel: path => scoped(scope => editor.retainFileModel(scope, path), () => {}),
    evictModel: (path, proof) => scoped(scope => editor.evictDraftModel(scope, path, proof), undefined),
    prepareSources: edits => editor.prepareHistorySources(edits, true),
    replaceRanges(path, edits, group, hooks) {
      const ranges = edits.map(edit => ({ path, ...edit }));
      // The hooks run on Undo and Redo before the text moves, so the preview selects in its new render;
      // one set per step: a keystroke joining the open typing group adds none (the store keeps the first).
      const companion = hooks && { undo: () => { hooks.undo(); }, redo: () => { hooks.redo(); }, perStep: true };
      if (group && ranges.length === 1) editor.replaceActiveRange(ranges[0], true, companion);
      else if (group) throw new Error("A typing group takes one range at a time.");
      else editor.replaceActiveRanges(ranges, companion);
    },
    closeGroup: path => editor.closeActiveEditGroup(path),
    recordHistory: (path, undo, redo, dispose) => editor.recordHistoryAction(path, undo, redo, dispose),
    holdRefresh: path => editor.holdHistoryRefresh(path),
    shareHistory: (paths, anchor) => host.shareHistory(paths, anchor),
    onMount: listener => host.onMount(listener),
    paneFile: () => host.paneFile(),
    closePane: () => host.closePane(),
    afterFileChanges: () => host.afterFileChanges(),
    openAfter: (path, keepExplorer) => host.openAfter(path, keepExplorer),
    showRow: focus => host.showRow(focus),
    // A macrotask: the history accepts the move under way first.
    later: task => { setTimeout(task, 0); },
    status: () => host.status(),
    select(request, flash, reveal) {
      host.select(request, reveal);
      if (request && flash) host.flash(request);
    },
    announce: message => host.announce(message),
    refuse: (message, history) => host.refuse(message, history),
    error: error => host.error(error),
  };
}
