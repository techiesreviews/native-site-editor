import type { AudioQuality } from "./audio-prepare";
import { mediaAddingCancellable, mediaAddingFailedReason, mediaAddingReviewable, type MediaAddingState } from "./media-adding-rules";
import { basename } from "./media-library-filter";
import type { MediaImportRequest } from "./media-picker";
import type { MediaWorkspaceContext } from "./media-workspace";
import type { MediaImageQuality } from "./media-optimise";

export interface FilesAddingEntry {
  quality?: MediaImageQuality; file: File; state: MediaAddingState; error?: string; note?: string; path?: string;
  request?: MediaImportRequest; work?: AbortController;
}
/** One drop on Files (or one Upload files…): the repository it was made in and where it goes. */
export interface FilesAddingHost {
  /** The drop's repository and branch, even once another is shown (ticket 23): the files land there. */
  context(): Promise<MediaWorkspaceContext>;
  announce(text: string): void;
  error(error: unknown): void;
  /** Today's Optimise sheet with its before/after review, in Media, for pictures not added yet. */
  review?(files: File[], folder: string, reasons: string[]): void;
}
export interface FilesAddition { folder: string; host: FilesAddingHost; entries: FilesAddingEntry[] }
export interface FilesAddingDeps {
  prepare(file: File, key: string, folder: string, signal: AbortSignal, quality?: MediaImageQuality, keepOriginal?: boolean, videoQuality?: import("./video-prepare").VideoQuality, audio?: AudioQuality): Promise<{ request: MediaImportRequest; warning?: string }>;
  /** The site's remembered image, video and audio quality and Keep original (Adding settings), read once per addition. */
  settings?(ctx: MediaWorkspaceContext): Promise<{ image: MediaImageQuality; video?: import("./video-prepare").VideoQuality; audio?: AudioQuality; keepOriginal: boolean }>;
  save(ctx: MediaWorkspaceContext, context: () => Promise<MediaWorkspaceContext>, requests: MediaImportRequest[]): Promise<string[]>;
  paint(): void;
}

const problem = (error: unknown) => error instanceof Error ? error.message : "The file could not be added.";

/** Adding from Files (ticket 07, slice 31): it starts at once, one file at a time, each with its
 * progress and Cancel; the files of one drop that are ready are saved together into the folder
 * chosen (one Undo step). A drop made meanwhile, in this repository or another, waits its turn as
 * its own addition; a switch stops none (ticket 23): each saves into the repository and branch it
 * was dropped in. Failures keep their reason and advice for Retry; Large download notes stay with
 * their files. */
export function createFilesAdding(deps: FilesAddingDeps) {
  let additions: FilesAddition[] = [], queue: Promise<unknown> = Promise.resolve();
  const entries = () => additions.flatMap(addition => addition.entries);
  const running = () => entries().some(entry => mediaAddingCancellable(entry.state) || entry.state === "adding");
  function set(entry: FilesAddingEntry, state: MediaAddingState) { entry.state = state; deps.paint(); }
  function stop(entry: FilesAddingEntry) {
    if (!mediaAddingCancellable(entry.state)) return;
    entry.work?.abort(); entry.state = "cancelled";
  }
  /** Its workspace cannot take it (its context failed): the addition goes, with the reason. */
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
    let ctx: MediaWorkspaceContext, quality: MediaImageQuality | undefined, keepOriginal = false, videoQuality: import("./video-prepare").VideoQuality | undefined, audio: AudioQuality = "balanced";
    try {
      ctx = await host.context();
      const settings = await deps.settings?.(ctx);
      quality = settings?.image; videoQuality = settings?.video; audio = settings?.audio ?? "balanced"; keepOriginal = settings?.keepOriginal === true;
    } catch (error) { drop(addition, error); return []; }
    for (const entry of addition.entries) {
      if (entry.state !== "waiting") continue;
      const work = entry.work = new AbortController();
      entry.quality = quality;
      set(entry, "preparing");
      try {
        const prepared = await deps.prepare(entry.file, ctx.key, addition.folder, work.signal, quality, keepOriginal, videoQuality, audio);
        // Cancelled meanwhile: the file is left alone.
        if (work.signal.aborted) continue;
        entry.request = prepared.request; entry.note = prepared.warning;
        set(entry, "ready");
      } catch (error) {
        if (!work.signal.aborted) { entry.error = problem(error); set(entry, "failed"); }
      }
    }
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
      // A save that failed added nothing: its reason (usually "Nothing was added") still holds.
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
        if (!again.length) continue;
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
      const reasons = taken.filter(entry => entry.state === "failed").map(entry => mediaAddingFailedReason(basename(entry.file.name), entry.error));
      for (const entry of taken) { entry.work?.abort(); entry.state = "cancelled"; }
      deps.paint();
      addition.host.review!(taken.map(entry => entry.file), addition.folder, reasons);
    },
    dismiss() { if (!running()) { additions = []; deps.paint(); } },
  };
}
