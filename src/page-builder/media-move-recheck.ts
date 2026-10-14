import { readSource } from "./source-tree";
import type { GuardedEdits } from "../guarded-edit";
import { mediaAttributes, mediaPriority, type MediaMeasured } from "./media-markup";
import { decodeHtmlEntities } from "./html-entities";

const within = (node: number[], root: number[]) => root.every((step, i) => node[i] === step);

/** Moved images get new sizes; every placed image follows its new first-screen fact. */
export function mediaMoveEdits(source: string, measured: MediaMeasured, moved: { node: number[]; sizes?: string }[]) {
  const tree = readSource(source, { page: true }), holder = mediaPriority(measured.images);
  return measured.images.flatMap(image => {
    const element = tree.at(image.node), range = element && tree.range(element);
    if (!element || !range || tree.view.name(element) !== "img") return [];
    const existing = source.slice(range.tag.start, range.tag.end), sizes = tree.attribute(element, "sizes");
    const high = JSON.stringify(holder) === JSON.stringify(image.node);
    const attrs: Record<string, string | undefined> = { fetchpriority: high ? "high" : undefined };
    if (sizes || high) {
      const eager = high || image.firstScreen;
      attrs.loading = eager ? undefined : "lazy";
      if (sizes) {
        const fresh = moved.find(item => JSON.stringify(item.node) === JSON.stringify(image.node))?.sizes;
        const bare = (fresh || decodeHtmlEntities(sizes.value, true)).replace(/^\s*auto\s*,\s*/i, "");
        attrs.sizes = eager ? bare : `auto, ${bare}`;
      }
    }
    const text = mediaAttributes(existing, attrs);
    return text === existing ? [] : [{ start: range.tag.start, end: range.tag.end, text }];
  });
}

export interface MoveRecheckPorts {
  edits: Pick<GuardedEdits, "now">;
  current(): boolean;
  painted(): string | undefined;
  measure(node: number[]): Promise<MediaMeasured>;
  close(): void;
}

/**
 * Never holds up the move: its step is written before this starts. Settle matrix (each row
 * ends with the group closed, the timer cleared and the move a complete step of its own):
 * - the moved bytes paint, every measurement resolves while nothing else changed: one rewrite joins the move's step;
 * - they never paint, or a measurement never settles: the 10 s timeout ends it, no rewrite, a late reply writes nothing;
 * - a measurement rejects: no rewrite;
 * - another edit, Undo or Redo, a page or scope change, or other bytes painted before the rewrite: no rewrite.
 */
export async function recheckMove(ports: MoveRecheckPorts, path: string, source: string, root: number[], tag: string) {
  let ended = false, timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => !ended && ports.current();
  const work = async () => {
    // Rendering may still be waiting for styles or media. Only the moved bytes count.
    while (current() && ports.painted() !== source) await new Promise(resolve => setTimeout(resolve, 16));
    if (!current()) return;
    const tree = readSource(source, { page: true });
    const images = tree.elements().filter(element => tree.view.name(element) === "img"), placed = images.filter(element => tree.attribute(element, "sizes"));
    const targets = placed.filter(element => within(tree.path(element), root));
    // Moved placed images each get their own sizes; any page image carries the page list.
    const nodes = (targets.length ? targets : [placed[0] ?? images[0]].filter(Boolean)).map(element => tree.path(element));
    let page: MediaMeasured | undefined;
    const moved: { node: number[]; sizes?: string }[] = [];
    for (const node of nodes) {
      const measured = await ports.measure(node);
      if (!current() || ports.painted() !== source) return;
      page ??= measured;
      if (targets.length) moved.push({ node, sizes: measured.sizes });
    }
    if (!page || !current()) return;
    const edits = mediaMoveEdits(source, page, moved);
    if (edits.length) ports.edits.now(r => {
      if (r.source(path) !== source) return { refuse: "The moved page changed." };
      return { edits: new Map([[path, edits]]), done: "", undone: "" };
    }, { anchor: path, group: tag, guard: current });
  };
  try {
    await Promise.race([work(), new Promise<void>(resolve => { timer = setTimeout(() => { ended = true; resolve(); }, 10000); })]);
  } catch { /* Failed measurement leaves the move as its own step. */ }
  finally { ended = true; clearTimeout(timer); ports.close(); }
}
