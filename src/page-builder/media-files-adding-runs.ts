import { mediaAddingCancellable, mediaAddingReviewable, type MediaAddingState } from "./media-adding-rules";
import type { MediaImportRequest } from "./media-picker";
import type { MediaWorkspaceContext } from "./media-workspace";
import type { MediaImageQuality } from "./media-optimise";

export interface FilesAddingEntry {
  file: File; state: MediaAddingState; error?: string; note?: string; path?: string;
  request?: MediaImportRequest; work?: AbortController;
}
/** One drop on Files (or one Upload files…): the repository it was made in and where it goes. */
export interface FilesAddingHost {
  /** The drop's repository and branch; throws once they changed. */
  context(): Promise<MediaWorkspaceContext>;
  live(): boolean;
  announce(text: string): void;
  error(error: unknown): void;
  /** Today's Optimise sheet with its before/after review, in Media, for pictures not added yet. */
  review?(files: File[], folder: string): void;
}
export interface FilesAddition { folder: string; host: FilesAddingHost; entries: FilesAddingEntry[] }
export interface FilesAddingDeps {
  prepare(file: File, key: string, folder: string, signal: AbortSignal, quality?: MediaImageQuality): Promise<{ request: MediaImportRequest; warning?: string }>;
  /** The site's remembered image quality (Adding settings), read once per addition. */
  quality?(ctx: MediaWorkspaceContext): Promise<MediaImageQuality>;
  save(ctx: MediaWorkspaceContext, context: () => Promise<MediaWorkspaceContext>, requests: MediaImportRequest[]): Promise<string[]>;
  paint(): void;
}

const CHANGED = "The repository or branch changed while adding files. Nothing was added.";
const problem = (error: unknown) => error instanceof Error ? error.message : "The file could not be added.";

/** Adding from Files (ticket 07, slice 31): it starts at once, one file at a time, each with its
 * progress and Cancel; the files of one drop that are ready are saved together into the folder
 * chosen (one Undo step). A drop made meanwhile waits its turn as its own addition. Failures keep
 * their reason and advice for Retry; Large download notes stay with their files. */
export function createFilesAdding(deps: FilesAddingDeps) {
  let additions: FilesAddition[] = [], queue: Promise<unknown> = Promise.resolve();
  const entries = () => additions.flatMap(addition => addition.entries);
  const running = () => entries().some(entry => mediaAddingCancellable(entry.state) || entry.state === "adding");
  function set(entry: FilesAddingEntry, state: MediaAddingState) { entry.state = state; deps.paint(); }
  function stop(entry: FilesAddingEntry) {
    if (!mediaAddingCancellable(entry.state)) return;
    entry.work?.abort(); entry.state = "cancelled";
  }
  /** Another repository or branch: the addition goes, saying so once. */
  function drop(addition: FilesAddition, error: unknown) {
    addition.entries.forEach(stop);
    additions = additions.filter(other => other !== addition);
    deps.paint(); addition.host.error(error);
  }
  function enqueue(addition: FilesAddition) {
    const done = queue.then(() => run(addition));
    queue = done.catch(() => undefined);
    return done;
  }
  async function run(addition: FilesAddition): Promise<string[]> {
    const { host } = addition;
    if (!addition.entries.some(entry => entry.state === "waiting")) return [];
    let ctx: MediaWorkspaceContext, quality: MediaImageQuality | undefined;
    try {
      if (!host.live()) throw new Error(CHANGED);
      ctx = await host.context();
      quality = await deps.quality?.(ctx);
    } catch (error) { drop(addition, error); return []; }
    for (const entry of addition.entries) {
      if (entry.state !== "waiting") continue;
      if (!host.live()) { drop(addition, new Error(CHANGED)); return []; }
      const work = entry.work = new AbortController();
      set(entry, "preparing");
      try {
        const prepared = await deps.prepare(entry.file, ctx.key, addition.folder, work.signal, quality);
        // Cancelled meanwhile: the file is left alone.
        if (work.signal.aborted) continue;
        entry.request = prepared.request; entry.note = prepared.warning;
        set(entry, "ready");
      } catch (error) {
        if (!work.signal.aborted) { entry.error = problem(error); set(entry, "failed"); }
      }
    }
    if (!host.live()) { drop(addition, new Error(CHANGED)); return []; }
    const ready = addition.entries.filter(entry => entry.state === "ready");
    if (!ready.length) return [];
    ready.forEach(entry => { entry.state = "adding"; });
    deps.paint();
    try {
      const paths = await deps.save(ctx, () => host.context(), ready.map(entry => entry.request!));
      ready.forEach((entry, index) => { entry.path = paths[index]; entry.state = "added"; });
      host.announce([`Added ${paths.join(", ")}.`, ...ready.flatMap(entry => entry.note ?? [])].join(" "));
      return paths;
    } catch (error) {
      if (!host.live()) { drop(addition, error); return []; }
      ready.forEach(entry => { entry.error = problem(error); entry.state = "failed"; });
      return [];
    } finally { deps.paint(); }
  }
  /** The pictures of one addition not added yet (the earliest with any) go to the Optimise sheet. */
  const reviewable = () => additions.find(addition =>
    addition.host.review && addition.entries.some(entry => mediaAddingReviewable(entry.file.name, entry.state)));
  return {
    additions: () => additions,
    entries,
    running,
    /** Files dropped into `folder`; resolves to the paths added. A finished summary is replaced. */
    start(folder: string, files: File[], host: FilesAddingHost) {
      if (!running()) additions = [];
      // Another repository's additions go, and their preparation stops so this one starts at once.
      for (const addition of additions) if (!addition.host.live()) addition.entries.forEach(stop);
      additions = additions.filter(addition => addition.host.live());
      const addition: FilesAddition = { folder, host, entries: files.map(file => ({ file, state: "waiting" })) };
      additions.push(addition); deps.paint();
      return enqueue(addition);
    },
    cancel(entry: FilesAddingEntry) { stop(entry); deps.paint(); },
    cancelAll() { entries().forEach(stop); deps.paint(); },
    /** Files that could not be added go round again, each in its own addition and folder. */
    retry() {
      if (running()) return;
      for (const addition of additions) {
        const again = addition.entries.filter(entry => entry.state === "failed");
        if (!again.length || !addition.host.live()) continue;
        for (const entry of again) { entry.state = "waiting"; entry.error = entry.note = entry.request = entry.work = undefined; }
        void enqueue(addition);
      }
      deps.paint();
    },
    reviewable,
    review() {
      const addition = reviewable();
      if (!addition) return;
      const taken = addition.entries.filter(entry => mediaAddingReviewable(entry.file.name, entry.state));
      for (const entry of taken) { entry.work?.abort(); entry.state = "cancelled"; }
      deps.paint();
      addition.host.review!(taken.map(entry => entry.file), addition.folder);
    },
    dismiss() { if (!running()) { additions = []; deps.paint(); } },
  };
}
