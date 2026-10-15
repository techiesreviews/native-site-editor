import { node } from "../ui/dom";
import { createMediaAddingSummary } from "./media-adding-summary";
import { mediaAddingCancellable } from "./media-adding-rules";
import { createFilesAdding, type FilesAddingEntry, type FilesAddingHost } from "./media-files-adding-runs";
import { askToAddUnchanged, importPreparedMedia, prepareMediaFile } from "./media-prepare";
import { readMediaAddingSettings } from "./media-settings";

let section: HTMLElement | undefined;
let summary: ReturnType<typeof createMediaAddingSummary> | undefined;
let runs: ReturnType<typeof createFilesAdding> | undefined;

function paint() {
  if (!summary || !runs) return;
  summary.paint({
    entries: runs.entries().map(entry => ({ quality: entry.quality, key: entry, name: entry.file.name, state: entry.state, error: entry.error, note: entry.note, cancel: () => cancel(entry) })),
    review: Boolean(runs.reviewable()),
  });
}
/** A row's Cancel: focus moves to the next file still being added, or to the summary's actions. */
function cancel(entry: FilesAddingEntry) {
  const open = runs!.entries().filter(other => other === entry || mediaAddingCancellable(other.state));
  const next = open[open.indexOf(entry) + 1] ?? open[open.indexOf(entry) - 1];
  runs!.cancel(entry);
  summary!.focus(next);
}

/** Files dropped on a Files folder, or chosen with its Upload files…: adding starts at once, with
 * the shared progress summary at the foot of the Files panel (`mount`). Resolves to the paths added. */
export function addFilesTo(mount: HTMLElement, folder: string, files: File[], host: FilesAddingHost) {
  if (!section) {
    section = node("section", "media-library__adding media-files-adding"); section.hidden = true;
    // The summary is pinned to the foot of the Files panel: the toast sits above it, never over Retry.
    section.dataset.toastAvoid = "";
    section.setAttribute("aria-label", "Files being added");
    runs = createFilesAdding({
      prepare: (file, key, into, signal, quality, keepOriginal, videoQuality, audio) => prepareMediaFile(file, key, into, signal, undefined, askToAddUnchanged, undefined, quality, keepOriginal, videoQuality, undefined, audio),
      settings: ctx => readMediaAddingSettings(path => ctx.read(path)),
      save: (ctx, context, requests) => importPreparedMedia(ctx, context, requests),
      paint,
    });
    summary = createMediaAddingSummary(section, {
      cancel: () => { runs!.cancelAll(); summary!.focus(); },
      retry: () => { runs!.retry(); summary!.focus(); },
      dismiss: () => runs!.dismiss(),
      review: () => runs!.review(),
    }, true);
  }
  if (section.parentElement !== mount) mount.append(section);
  return runs!.start(folder, files, host);
}
