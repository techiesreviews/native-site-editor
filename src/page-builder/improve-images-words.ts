import type { ImproveImagesRow, ImprovePicture } from "./improve-images";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** A row's second line: where it shows and what would change ("On 97 pages · 2 heavy pictures"). */
export function improveRowLine(row: ImproveImagesRow): string {
  const what = row.summary.slice(row.summary.indexOf(": ", row.label.length) + 2);
  return row.kind === "component" ? `On ${plural(row.reach ?? 0, "page")} · ${what}` : what;
}

/** A picture's name in an opened row. */
export function improvePictureName(picture: ImprovePicture): string {
  if (picture.kind === "youtube") return "YouTube video";
  if (picture.kind === "vimeo") return "Vimeo video";
  if (picture.kind === "sharing") return "Sharing picture";
  return picture.path?.split("/").at(-1) ?? picture.host ?? picture.address;
}

/** What happens to one picture, in plain words. */
export function improvePictureLine(picture: ImprovePicture): string {
  const has = (change: string) => picture.changes.includes(change as ImprovePicture["changes"][number]);
  const main = has("bring-in") ? "From another website: keep a copy here"
    : has("lighten") ? "Heavy: a lighter file"
    : has("loop") ? "GIF: becomes a looping video"
    : has("first-frame") ? "GIF: sharing uses its first frame"
    : has("player") ? "Shows a picture until tapped"
    : has("copies") ? "Copies for smaller screens" : "";
  const details = ["size", "sizes", "loading"].some(has) && !has("bring-in") && !has("lighten") ? "size details" : "";
  return main && details ? `${main}, ${details}` : main || "Add size details";
}

export type ImproveRowState = "done" | "unchanged" | "failed";
/** The row's mark after a run. */
export function improveRowStatus(state: ImproveRowState | undefined, message?: string): string {
  return state === "done" ? "Done" : state === "unchanged" ? "Nothing to change" : state === "failed" ? `Not changed: ${message ?? "something went wrong"}` : "";
}

/** The run's progress line. */
export function improveProgress(index: number, total: number, label: string): string {
  return total > 1 ? `Improving ${index + 1} of ${total}: ${label}` : `Improving ${label}`;
}

/** What a finished run tells, read out once. */
export function improveRunMessage(changed: number, stopped: boolean, failed: number): string {
  const parts = [changed ? `Changed ${plural(changed, "page")}.` : "Nothing was changed."];
  if (failed) parts.push(`${plural(failed, "page")} could not be changed.`);
  if (stopped) parts.push("Stopped. The rest are still listed.");
  return parts.join(" ");
}
