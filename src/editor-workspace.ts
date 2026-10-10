// The production adapter of the guarded edit module's seam (src/guarded-edit.ts):
// the editor's state and its write paths, built in main.ts from today's closures.
//
// Slice 10: the writes are today's. `change` makes applyNativeChange's editor
// calls (replace the mounted file's ranges as its own step, status text), with
// the typing group the inline fields use; `operation` is applyNativeOperation.
// Slice 17 moves applyNativeOperation's body behind this seam.

import type { DraftScope } from "./drafts";
import type { NativeSite } from "../shared/native-project";
import type { EditorWorkspace, NodeRef, OperationRequest } from "./guarded-edit";

type Range = { path: string; start: number; end: number; expected: string; text: string };
/** The source editor's calls this adapter makes (src/components/source-editor.ts). */
export interface WorkspaceEditor {
  isMounted(path: string): boolean;
  captureFileModelState(scope: DraftScope, path: string, persistent?: boolean): { isCurrent(): boolean };
  replaceActiveRanges(edits: Range[]): void;
  replaceActiveRange(edit: Range, group?: boolean): void;
  closeActiveEditGroup(path: string): void;
}
export interface WorkspaceHost {
  generation(): number;
  /** The setup key (account, repository, branch). */
  setupScope(): string;
  draftScope(): DraftScope | undefined;
  versionView(): boolean;
  route(): string | undefined;
  editModeEntry(): object | undefined;
  site(): NativeSite | undefined;
  /** nativeEffectiveSource */
  source(path: string): string | undefined;
  /** nativePathExists */
  exists(path: string): boolean;
  openFile(): string | undefined;
  /** restoreFile for the page whose history takes a step. */
  restore(path: string, epoch: number): Promise<void>;
  readonly editor: WorkspaceEditor;
  select(request: (NodeRef & { source?: string }) | undefined): void;
  flash(request: NodeRef): void;
  announce(message: string): void;
  /** applyNativeOperation */
  operation(request: OperationRequest): Promise<string | undefined>;
}

export function createEditorWorkspace(host: WorkspaceHost): EditorWorkspace {
  const { editor } = host;
  const model = (path: string) => {
    const scope = host.draftScope();
    return scope && editor.isMounted(path) ? editor.captureFileModelState(scope, path, true) : undefined;
  };
  return {
    scope: () => host.setupScope(),
    generation: () => host.generation(),
    versionView: () => host.versionView(),
    route: () => host.route(),
    editModeEntry: () => host.editModeEntry(),
    site: () => host.site(),
    source: path => host.source(path),
    exists: path => host.exists(path),
    modelState: model,
    openFile: () => host.openFile(),
    open: path => host.restore(path, host.generation()),
    anchor(path) {
      const epoch = host.generation(), state = host.openFile() === path ? model(path) : undefined;
      return state && { isCurrent: () => epoch === host.generation() && host.openFile() === path && editor.isMounted(path) && state.isCurrent() };
    },
    change(path, edits, group) {
      const ranges = edits.map(edit => ({ path, ...edit }));
      if (group && ranges.length === 1) editor.replaceActiveRange(ranges[0], true);
      else if (group) throw new Error("A typing group takes one range at a time.");
      else editor.replaceActiveRanges(ranges);
    },
    closeGroup: path => editor.closeActiveEditGroup(path),
    operation: request => host.operation(request),
    select(request, flash) {
      host.select(request);
      if (request && flash) host.flash(request);
    },
    announce: message => host.announce(message),
  };
}
