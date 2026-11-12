// Free placement on the catalogue board (TOOLS-215): each card can be dragged by its title. It keeps its place in its
// area's flow and moves by an offset from there (a `translate`, so dragging one card never lays out another), which
// this browser remembers. While it moves it snaps to the edges and centres of the other cards, with a guide drawn
// along each edge it meets.

export interface Point { x: number; y: number }
export interface Box { x: number; y: number; w: number; h: number }
/** A guide along `axis` at `at` (board units), spanning both cards it joins from `from` to `to` on the other axis. */
export interface Guide { axis: "x" | "y"; at: number; from: number; to: number }
type Store = Pick<Storage, "getItem" | "setItem">;

export const PLACES_KEY = "catalogue:places";

/** The stored text as offsets; broken or hand-edited entries are left out, so the card stays in its flow. */
export function parsePlaces(text: string | null): Map<string, Point> {
  const places = new Map<string, Point>();
  let data: unknown;
  try { data = JSON.parse(text ?? "{}"); } catch { return places; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return places;
  for (const [id, value] of Object.entries(data)) {
    const place = value as Partial<Point> | null;
    if (place && typeof place.x === "number" && typeof place.y === "number" && Number.isFinite(place.x) && Number.isFinite(place.y))
      places.set(id, { x: Math.round(place.x), y: Math.round(place.y) });
  }
  return places;
}

/** Offsets in name order (a card back in its flow is left out), so the stored text only changes when a place does. */
export function serialisePlaces(places: ReadonlyMap<string, Point>): string {
  const kept = [...places].filter(([, place]) => place.x || place.y).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(Object.fromEntries(kept));
}

/** This browser's places; none when it keeps no storage for the page (a private window, blocked site data). */
export function readPlaces(storage: Store): Map<string, Point> {
  try { return parsePlaces(storage.getItem(PLACES_KEY)); } catch { return new Map(); }
}

/** Remembers the places; a browser that refuses keeps them for this visit only. */
export function writePlaces(storage: Store, places: ReadonlyMap<string, Point>) {
  try { storage.setItem(PLACES_KEY, serialisePlaces(places)); } catch { /* Kept until the page closes. */ }
}

/** The smallest box around every box; none for no boxes. */
export function boundsOf(boxes: readonly Box[]): Box | undefined {
  if (!boxes.length) return undefined;
  const x = Math.min(...boxes.map((box) => box.x)), y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w)), bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * Where `moving` lands: on each axis, the nearest of its start, centre and end within `reach` of another box's start,
 * centre or end moves onto it (else it stays where the pointer put it), with a guide along each edge it meets.
 */
export function snapMove(moving: Box, others: readonly Box[], reach: number): Point & { guides: Guide[] } {
  const lines = (start: number, size: number) => [start, start + size / 2, start + size];
  const nearest = (axis: "x" | "y") => {
    const size = axis === "x" ? "w" : "h";
    let best: { d: number; shift: number; at: number; other: Box } | undefined;
    for (const other of others)
      for (const mine of lines(moving[axis], moving[size]))
        for (const theirs of lines(other[axis], other[size])) {
          const d = Math.abs(theirs - mine);
          if (d <= reach && (!best || d < best.d)) best = { d, shift: theirs - mine, at: theirs, other };
        }
    return best;
  };
  const sx = nearest("x"), sy = nearest("y");
  const x = moving.x + (sx?.shift ?? 0), y = moving.y + (sy?.shift ?? 0);
  const guides: Guide[] = [];
  if (sx) guides.push({ axis: "x", at: sx.at, from: Math.min(y, sx.other.y), to: Math.max(y + moving.h, sx.other.y + sx.other.h) });
  if (sy) guides.push({ axis: "y", at: sy.at, from: Math.min(x, sy.other.x), to: Math.max(x + moving.w, sy.other.x + sy.other.w) });
  return { x, y, guides };
}
