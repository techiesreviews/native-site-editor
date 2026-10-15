import type { AppStore } from "./app-store";
import type { DraftScope, draftStore } from "./drafts";
import type { Stamp } from "./guarded-edit";
import type { MediaWorkspaceBatch } from "./page-builder/media-workspace";
import type { NativeSite } from "../shared/native-project";
import type { Repository, Snapshot, TreeEntry } from "../shared/types";

export interface MediaBatchPorts {
  appStore: AppStore;
  editor: typeof import("./components/source-editor");
  mediaHistoryHome: ReturnType<typeof import("./page-builder/media-history-home").createMediaHistoryHome>;
  site(): NativeSite | undefined;
  load(): Promise<[typeof import("./page-builder/media-workspace"), typeof import("./page-builder/media-draft-transaction"), typeof import("../shared/media-records")]>;
  listRepositoryFiles(repo: Repository, snapshot: Snapshot): Promise<string[]>;
  nativeFiles(scope: DraftScope): string[];
  draftStore: typeof draftStore;
  bytes: typeof import("./uploads").uploadBytes;
  mediaIdentity(): string;
  mediaTextSource(path: string, scope: DraftScope): string | undefined;
  entryAt(path: string): TreeEntry | undefined;
  findEntry(path: string): Promise<TreeEntry | undefined>;
  refresh(): void;
  announce(message: string): void;
}

/** Atomic staging keeps the host's source receipts, upload rollback and single Undo step. */
// Undo is recorded on the page open when the batch was asked for (`openAtStart`); a switch while loading refuses.
export async function applyMediaBatch(ports: MediaBatchPorts, scope: DraftScope, stamp: Stamp, batch: MediaWorkspaceBatch, openAtStart: string | undefined) {
  const [{ applyMediaWorkspaceBatch }, { mediaDraftTransaction }, { MEDIA_RECORDS_PATH }] = await ports.load();
  const assertLive = () => { if (!stamp.holds()) throw new Error("The repository changed. Close Media and open it again."); };
  const repo = ports.appStore.repository.value, snapshot = ports.appStore.snapshot.value;
  // Without a native site (no root index.html) the batch is proved against the repository's listing.
  const listed = ports.site() || !repo || !snapshot ? undefined : await ports.listRepositoryFiles(repo, snapshot);
  assertLive();
  if (ports.appStore.openFile.value !== openAtStart) throw new Error("The open page changed. No image changes were applied.");
  const editor = ports.editor;
  // With no editable file open, the step waits for the next one (mediaHistoryHome). A page that
  // opens later is not proven over this step's text, so changes to page text still need one open.
  const historyPath = ports.appStore.openFile.value, historyHost = historyPath ? editor.captureHistoryHost(historyPath) : undefined;
  if (!historyHost && [...batch.edits.keys()].some(path => path !== MEDIA_RECORDS_PATH)) throw new Error("Open a page before changing images that pages use.");
  const identity = ports.mediaIdentity();
  const batchPaths = () => {
    if (!listed) return ports.nativeFiles(scope);
    const drafts = ports.draftStore().list(scope), gone = new Set(drafts.filter(draft => draft.deleted).map(draft => draft.path));
    return [...new Set([...listed, ...drafts.filter(draft => !draft.deleted).map(draft => draft.path)])].filter(path => !gone.has(path));
  };
  const recordOn = (path: string, undo: () => boolean, redo: () => boolean | Promise<boolean>, dispose: () => void) => editor.recordHistoryAction(path, undo, redo, dispose);
  await applyMediaWorkspaceBatch(batch, mediaDraftTransaction({
    scope, store: ports.draftStore(), bytes: ports.bytes(), stamp,
    paths: batchPaths, source: path => ports.mediaTextSource(path, scope),
    assetVersion: path => { const record = ports.draftStore().get(scope, path); return record ? JSON.stringify(record) : ports.entryAt(path)?.sha; },
    entry: async path => { const entry = await ports.findEntry(path); assertLive(); return entry ? { path, sha: entry.sha, mode: entry.mode, text: ports.mediaTextSource(path, scope) } : undefined; },
    modelState: path => editor.captureFileModelState(scope, path), evictModel: (path, proof) => editor.evictDraftModel(scope, path, proof), historyCurrent: historyHost ? historyHost.isCurrent : () => stamp.holds(),
    mounted: path => editor.isMounted(path), prepareSources: edits => editor.prepareHistorySources(edits),
    history: (undo, redo, dispose) => {
      if (historyHost && historyPath) return recordOn(historyPath, undo, redo, dispose);
      // A file that opened while the change was prepared takes it now.
      const opened = ports.appStore.openFile.value;
      return opened && editor.captureHistoryHost(opened) ? recordOn(opened, undo, redo, dispose) : ports.mediaHistoryHome.hold(identity, undo, redo, dispose);
    },
    refresh: () => { ports.refresh(); },
    announce: message => ports.announce(message),
  }));
}
