import type { AppStore } from "./app-store";
import type { MediaPin } from "./controllers/media-controller";
import type { DraftScope, draftStore } from "./drafts";
import type { Stamp } from "./guarded-edit";
import type { MediaDraftHost } from "./page-builder/media-draft-transaction";
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
  mediaTextSource(path: string, scope: DraftScope): string | undefined;
  entryAt(path: string): TreeEntry | undefined;
  findEntry(path: string): Promise<TreeEntry | undefined>;
  /** The repository stamp now: a pinned batch's attempt on show holds it. */
  stamp(): Stamp;
  refresh(): void;
  announce(message: string): void;
}
type Modules = Awaited<ReturnType<MediaBatchPorts["load"]>>;

/**
 * Atomic staging keeps the host's source receipts, upload rollback and single Undo step, on the page
 * open as the step commits (with none open, the page opened next: mediaHistoryHome).
 *
 * A batch holding a pin (ticket 23) finishes where it started. While its workspace is on show it goes
 * through the editor as above; once another is shown it is written to its own workspace's drafts
 * through the pin's reads, touching no editor and taking no Undo step (nothing of it is on show).
 * A page other than `opened` (the one open as the step was asked for) shown by then takes no Undo
 * step: the step lands as drafts, and an Undo there would change the page it began on.
 * Each attempt runs whole on one side; a switch either way during one, or another page opened on
 * show, rolls it back and runs it again (twice at most), proved by the batch's own reads (paths,
 * sources and assets). The first attempt holds the caller's stamp; one after its workspace was seen
 * to move away and back holds a new one. Without a pin, a switch of workspace refuses.
 */
export async function applyMediaBatch(ports: MediaBatchPorts, scope: DraftScope, stamp: Stamp, batch: MediaWorkspaceBatch, pin?: MediaPin, opened = ports.appStore.openFile.value) {
  const modules = await ports.load();
  let held = stamp;
  for (let attempt = 0; ; attempt++) {
    const here = !pin || pin.here(), page = ports.appStore.openFile.value;
    try {
      return here ? await onShow(ports, modules, scope, held, batch, pin, opened === undefined || page === opened) : await elsewhere(ports, modules, scope, batch, pin!);
    } catch (error) {
      const away = !!pin && pin.here() !== here, moved = here && ports.appStore.openFile.value !== page;
      if (attempt === 2 || !away && !moved) throw error;
      if (away && !here) held = ports.stamp();
    }
  }
}

async function onShow(ports: MediaBatchPorts, modules: Modules, scope: DraftScope, stamp: Stamp, batch: MediaWorkspaceBatch, pin: MediaPin | undefined, undoHere: boolean) {
  const [{ applyMediaWorkspaceBatch }, { mediaDraftTransaction }, { MEDIA_RECORDS_PATH }] = modules;
  const assertLive = () => { if (!stamp.holds()) throw new Error("The repository changed. Close Media and open it again."); };
  const repo = ports.appStore.repository.value, snapshot = ports.appStore.snapshot.value;
  // Without a native site (no root index.html) the batch is proved against the repository's listing.
  const listed = ports.site() || !repo || !snapshot ? undefined : await (pin ? pin.list() : ports.listRepositoryFiles(repo, snapshot));
  assertLive();
  const editor = ports.editor;
  // With no editable file open, the step waits for the next one (mediaHistoryHome). A page that
  // opens later is not proven over this step's text, so changes to page text still need one open.
  const historyPath = ports.appStore.openFile.value, historyHost = historyPath ? editor.captureHistoryHost(historyPath) : undefined;
  if (undoHere && !historyHost && [...batch.edits.keys()].some(path => path !== MEDIA_RECORDS_PATH)) throw new Error("Open a page before changing images that pages use.");
  const recordOn = (path: string, undo: () => boolean, redo: () => boolean | Promise<boolean>, dispose: () => void) => editor.recordHistoryAction(path, undo, redo, dispose);
  await applyMediaWorkspaceBatch(batch, mediaDraftTransaction({
    ...shared(ports, scope), stamp,
    paths: () => listed ? listedPaths(ports, scope, listed) : ports.nativeFiles(scope), source: path => ports.mediaTextSource(path, scope),
    assetVersion: path => { const record = ports.draftStore().get(scope, path); return record ? JSON.stringify(record) : ports.entryAt(path)?.sha; },
    entry: async path => { const entry = await ports.findEntry(path); assertLive(); return entry ? { path, sha: entry.sha, mode: entry.mode, text: ports.mediaTextSource(path, scope) } : undefined; },
    historyCurrent: undoHere && historyHost ? historyHost.isCurrent : () => stamp.holds(),
    mounted: path => editor.isMounted(path), prepareSources: edits => editor.prepareHistorySources(edits),
    history: (undo, redo, dispose) => {
      // Another page than the one it was asked on is shown: no Undo step there.
      if (!undoHere) { dispose(); return true; }
      if (historyHost && historyPath) return recordOn(historyPath, undo, redo, dispose);
      // A file that opened while the change was prepared takes it now.
      const opened = ports.appStore.openFile.value;
      return opened && editor.captureHistoryHost(opened) ? recordOn(opened, undo, redo, dispose) : ports.mediaHistoryHome.hold(stamp, undo, redo, dispose);
    },
  }));
}

// Another workspace is shown: the pin's reads, no editor model mounted, the step with no Undo.
async function elsewhere(ports: MediaBatchPorts, modules: Modules, scope: DraftScope, batch: MediaWorkspaceBatch, pin: MediaPin) {
  const [{ applyMediaWorkspaceBatch }, { mediaDraftTransaction }] = modules;
  // Its workspace shown again: the attempt stops, to run again on show.
  const away = () => !pin.here(), stamp: Stamp = { holds: away, changed: () => (away() ? undefined : "scope") };
  const listed = pin.site ? undefined : await pin.list();
  const nothing = { apply: () => true, undo: () => true, redo: () => true, isCurrent: away };
  await applyMediaWorkspaceBatch(batch, mediaDraftTransaction({
    ...shared(ports, scope), stamp,
    paths: () => listed ? listedPaths(ports, scope, listed) : pin.files(), source: path => pin.source(path),
    assetVersion: path => { const record = ports.draftStore().get(scope, path); return record ? JSON.stringify(record) : pin.entry(path)?.sha; },
    entry: async path => { const entry = await pin.find(path); return entry ? { path, sha: entry.sha, mode: entry.mode, text: pin.source(path) } : undefined; },
    historyCurrent: away, mounted: () => false, prepareSources: () => nothing,
    history: (_undo, _redo, dispose) => { dispose(); return true; },
  }));
}

// The host both sides share: the scope's drafts and bytes, its models' proofs, the refresh.
function shared(ports: MediaBatchPorts, scope: DraftScope): Pick<MediaDraftHost, "scope" | "store" | "bytes" | "modelState" | "evictModel" | "refresh" | "announce"> {
  return {
    scope, store: ports.draftStore(), bytes: ports.bytes(), modelState: path => ports.editor.captureFileModelState(scope, path),
    evictModel: (path, proof) => ports.editor.evictDraftModel(scope, path, proof),
    refresh: () => { ports.refresh(); }, announce: message => ports.announce(message),
  };
}

// The repository's listing with the scope's drafts: new files in, deleted ones out.
function listedPaths(ports: MediaBatchPorts, scope: DraftScope, listed: string[]) {
  const drafts = ports.draftStore().list(scope), gone = new Set(drafts.filter(draft => draft.deleted).map(draft => draft.path));
  return [...new Set([...listed, ...drafts.filter(draft => !draft.deleted).map(draft => draft.path)])].filter(path => !gone.has(path));
}
