import { startTags } from "../../shared/html-source";
import { locateNativeElementRange, readPage } from "../native-source-location";
import { mediaAttributes, mediaImageMarkup, mediaPlacement, mediaPriority, mediaUrl, type MediaImage, type MediaMeasured } from "./media-markup";
import { mediaAttribute } from "./media-attributes";
import { decodeHtmlEntities } from "./html-entities";
import type { MediaControllerPorts } from "../controllers/media-controller";
import type { Stamp } from "../guarded-edit";
import type { MediaHeldFiles, MediaPathPlacement } from "./media-picker";

/** Other page images only change priority; a new holder also becomes eager. */
export function mediaPageEdits(source: string, measured: MediaMeasured | undefined, target: number[], locate: NonNullable<MediaControllerPorts["locateElement"]> = locateNativeElementRange) {
  // The page list uses the rendered border box; download sizing uses the content box.
  const own = measured?.images.find(image => JSON.stringify(image.node) === JSON.stringify(target));
  const firstScreen = own?.firstScreen ?? measured?.firstScreen ?? false;
  const large = own?.large ?? measured?.large ?? false;
  const images = measured ? [...measured.images.filter(item => JSON.stringify(item.node) !== JSON.stringify(target)), { node: target, firstScreen, large }] : [];
  const holder = mediaPriority(images);
  const high = (node: number[]) => holder !== undefined && JSON.stringify(holder) === JSON.stringify(node);
  const edits = (measured?.images ?? []).flatMap(item => {
    if (JSON.stringify(item.node) === JSON.stringify(target)) return [];
    const other = locate(source, item.node);
    if (!other || other.tag.name !== "img") return [];
    const existing = source.slice(other.tag.start, other.tag.end);
    const attrs: Record<string, string | undefined> = { fetchpriority: high(item.node) ? "high" : undefined };
    if (high(item.node)) {
      attrs.loading = undefined;
      const sizes = mediaAttribute(existing, startTags(existing)[0], "sizes");
      if (sizes) attrs.sizes = decodeHtmlEntities(sizes.value, true).replace(/^\s*auto\s*,\s*/i, "");
    }
    const text = mediaAttributes(existing, attrs);
    return text === existing ? [] : [{ start: other.tag.start, end: other.tag.end, text }];
  });
  return { edits, placement: mediaPlacement(measured && { sizes: measured.sizes, firstScreen }, high(target)) };
}

/** Slot pickers write page <img> elements; attribute-only fields keep their own address contract. */
export async function prepareMediaPath(ports: Pick<MediaControllerPorts, "measureImage">, place: MediaPathPlacement, image: MediaImage) {
  const proposed = place.edit(mediaUrl(image.path));
  // Component templates own their fallback, never an ordinary page place.
  if (/^components\//.test(place.path)) return (picked: MediaImage) => place.edit(mediaUrl(picked.path));
  const tree = readPage(proposed), previous = readPage(place.source);
  const target = tree.elements().find(element => tree.view.name(element) === "img" && tree.attribute(element, "src")?.value === mediaUrl(image.path)
    && (() => {
      const old = previous.at(tree.path(element)), before = old && previous.range(old), after = tree.range(element);
      return after && (!before || place.source.slice(before.tag.start, before.tag.end) !== proposed.slice(after.tag.start, after.tag.end));
    })());
  if (!target) return (picked: MediaImage) => place.edit(mediaUrl(picked.path));
  const node = tree.path(target);
  let measured: MediaMeasured | undefined;
  try { measured = await ports.measureImage?.(place.path, node, image); } catch { /* A newly filled slot may have no image to measure yet. */ }
  return (picked: MediaImage) => {
    const page = place.edit(mediaUrl(picked.path)), range = locateNativeElementRange(page, node);
    if (!range || range.tag.name !== "img") throw new Error(place.stale ?? "The image place changed.");
    const { edits, placement } = mediaPageEdits(page, measured, node);
    edits.push({ start: range.tag.start, end: range.tag.end, text: mediaImageMarkup(picked, page.slice(range.tag.start, range.tag.end), placement, true) });
    let result = page;
    for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    return result;
  };
}

/** The address picker loads placement orchestration only when Use is pressed. */
export async function placeMediaPath(
  ports: MediaControllerPorts, stamp: Stamp, placement: MediaPathPlacement | undefined,
  image: MediaImage, cancelled: () => boolean, held: MediaHeldFiles | undefined,
  resolve: (value: string | undefined) => void,
) {
  if (!stamp.holds()) throw new Error("The repository changed. Choose an image again.");
  if (cancelled()) { resolve(undefined); return; }
  let transform: ((picked: MediaImage) => string) | undefined;
  if (placement) {
    if (!stamp.holds() || ports.source(placement.path) !== placement.source) {
      const message = placement.stale ?? "The image place changed.";
      ports.announce(message); throw new Error(message);
    }
    transform = await prepareMediaPath(ports, placement, image);
    if (!stamp.holds() || ports.source(placement.path) !== placement.source) {
      const message = placement.stale ?? "The image place changed.";
      ports.announce(message); throw new Error(message);
    }
    if (cancelled()) { resolve(undefined); return; }
  }
  if (!held) {
    if (placement && transform) {
      const page = transform(image);
      if (!ports.change(placement.path, placement.source, [{ start: 0, end: placement.source.length, text: page }], placement.node ?? [], "Image replaced")) throw new Error("The image could not be replaced.");
      placement.placed = true;
    }
    resolve(mediaUrl(image.path)); return;
  }
  // Files added in the picker are saved with the value's placement: one Undo step.
  const saved = await held.save(placement && { path: placement.path, source: placement.source, stale: placement.stale,
    live: () => !cancelled() && stamp.holds(), apply: paths => transform!(held.image(paths)) });
  if (placement && saved.placed) placement.placed = true;
  if (saved.note) ports.announce(saved.note.trim());
  // Cancelled while saving: the files are added, the value keeps what it had.
  resolve(cancelled() && !saved.placed ? undefined : mediaUrl(held.image(saved.paths).path));
}
