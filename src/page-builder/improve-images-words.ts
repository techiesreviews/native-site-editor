import type { ImproveChange, ImproveImagesRow, ImprovePicture } from "./improve-images";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** A row's second line, in plain words: where it shows, how many pictures change and what they
 * get ("On 97 pages · 4 pictures · lighter copies for phones"). Size details only count alone. */
export function improveRowLine(row: ImproveImagesRow): string {
  const changing = row.pictures.filter(picture => picture.ticked && picture.changes.length);
  const has = (...changes: ImproveChange[]) => changing.some(picture => picture.changes.some(change => changes.includes(change)));
  const what = ([
    [["bring-in"], "copies from other websites"], [["lighten"], "lighter files"], [["copies"], "lighter copies for phones"],
    [["loop", "first-frame"], "lighter GIFs"], [["player"], "videos load on tap"],
  ] as const).filter(([changes]) => has(...changes)).map(([, words]) => words as string);
  if (!what.length && has("size", "sizes", "loading")) what.push("faster loading");
  const count = new Set(changing.map(picture => picture.key)).size;
  const line = count ? `${plural(count, "picture")} · ${what.join(", ")}` : "Every picture left as it is";
  return row.kind === "component" ? `On ${plural(row.reach ?? 0, "page")} · ${line}` : line;
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
  return main || "Faster loading";
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
