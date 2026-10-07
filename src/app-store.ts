import { batch, computed, signal } from "@preact/signals-core";
import type { Repository, Snapshot } from "../shared/types";
import type { NativePreviewSelection } from "./components/native-preview";
import type { DraftTextStore } from "./draft-store";

/** Shared application state. Controllers keep their own requests and UI state. */
export function createAppStore(draftStore: DraftTextStore) {
  const repository = signal<Repository | undefined>(undefined);
  const snapshot = signal<Snapshot | undefined>(undefined);
  const branch = signal<string | undefined>(undefined);
  const selection = signal<NativePreviewSelection | undefined>(undefined);
  const openFile = signal<string | undefined>(undefined);
  const draftRevision = signal(0);
  let disposed = false;
  const refreshDrafts = () => {
    if (!disposed) draftRevision.value++;
  };
  const unsubscribe = draftStore.subscribe(refreshDrafts);
  const drafts = {
    store: draftStore,
    revision: computed(() => draftRevision.value),
    changed: computed(() => { draftRevision.value; return draftStore.changed(); }),
    unpersisted: computed(() => { draftRevision.value; return draftStore.unpersisted(); }),
    hasHistory: computed(() => { draftRevision.value; return draftStore.hasHistory(); }),
    // clear() intentionally emits no event; the host refreshes after a workspace reset.
    refresh: refreshDrafts,
  };
  return {
    repository, branch, snapshot, selection, openFile, drafts,
    /** Navigation resets publish one coherent state to subscribers. */
    reset(repositoryValue?: Repository) {
      batch(() => {
        repository.value = repositoryValue;
        branch.value = undefined;
        snapshot.value = undefined;
        selection.value = undefined;
        openFile.value = undefined;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
    },
  };
}
export type AppStore = ReturnType<typeof createAppStore>;
