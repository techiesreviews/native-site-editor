// Where a spotlight's callout goes: pure geometry, tested without a browser
// (tests/spotlight.test.ts). The callout sits beside the highlighted target
// (right, below, left, then above: the first side with room) with an arrow
// pointing at it; a target that is missing or off-screen gets a centred
// callout and no highlight.

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface Size {
  width: number;
  height: number;
}
export type Side = "right" | "below" | "left" | "above";

export type SpotlightLayout =
  | {
      mode: "target";
      /** The highlighted area: the target plus padding, kept inside the viewport. */
      hole: Box;
      side: Side;
      left: number;
      top: number;
      /** How far along the callout's edge the arrow points, in px from its left or top. */
      arrow: number;
    }
  | { mode: "centered"; left: number; top: number };

export interface LayoutOptions {
  /** Space between the target and the highlight's edge. */
  pad?: number;
  /** Space between the highlight and the callout (room for the arrow). */
  gap?: number;
  /** The least space kept between the callout and the viewport's edge. */
  margin?: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));

/** A target is usable when it has a size and at least half of it is in the viewport. */
export function targetIsVisible(target: Box | null | undefined, viewport: Size): target is Box {
  if (!target || !(target.width > 0) || !(target.height > 0)) return false;
  const width = Math.min(target.left + target.width, viewport.width) - Math.max(target.left, 0);
  const height = Math.min(target.top + target.height, viewport.height) - Math.max(target.top, 0);
  if (width <= 0 || height <= 0) return false;
  return (width * height) / (target.width * target.height) >= 0.5;
}

export function spotlightLayout(target: Box | null | undefined, callout: Size, viewport: Size, options: LayoutOptions = {}): SpotlightLayout {
  const { pad = 6, gap = 16, margin = 12 } = options;
  const centered: SpotlightLayout = {
    mode: "centered",
    left: Math.max(margin, Math.round((viewport.width - callout.width) / 2)),
    top: Math.max(margin, Math.round((viewport.height - callout.height) / 2)),
  };
  if (!targetIsVisible(target, viewport)) return centered;

  const left = Math.max(target.left - pad, 0);
  const top = Math.max(target.top - pad, 0);
  const hole: Box = {
    left,
    top,
    width: Math.min(target.left + target.width + pad, viewport.width) - left,
    height: Math.min(target.top + target.height + pad, viewport.height) - top,
  };
  const centerX = hole.left + hole.width / 2;
  const centerY = hole.top + hole.height / 2;
  const fitsX = (value: number) => value >= margin && value + callout.width <= viewport.width - margin;
  const fitsY = (value: number) => value >= margin && value + callout.height <= viewport.height - margin;
  const roomAcross = callout.height <= viewport.height - 2 * margin;
  const roomDown = callout.width <= viewport.width - 2 * margin;
  const middleY = clamp(centerY - callout.height / 2, margin, viewport.height - callout.height - margin);
  const middleX = clamp(centerX - callout.width / 2, margin, viewport.width - callout.width - margin);

  const attempts: Record<Side, () => { left: number; top: number } | undefined> = {
    right: () => {
      const x = hole.left + hole.width + gap;
      return fitsX(x) && roomAcross ? { left: x, top: middleY } : undefined;
    },
    below: () => {
      const y = hole.top + hole.height + gap;
      return fitsY(y) && roomDown ? { left: middleX, top: y } : undefined;
    },
    left: () => {
      const x = hole.left - gap - callout.width;
      return fitsX(x) && roomAcross ? { left: x, top: middleY } : undefined;
    },
    above: () => {
      const y = hole.top - gap - callout.height;
      return fitsY(y) && roomDown ? { left: middleX, top: y } : undefined;
    },
  };
  for (const side of ["right", "below", "left", "above"] as const) {
    const place = attempts[side]();
    if (!place) continue;
    const vertical = side === "left" || side === "right";
    const arrow = clamp(vertical ? centerY - place.top : centerX - place.left, 18, (vertical ? callout.height : callout.width) - 18);
    return { mode: "target", hole, side, left: Math.round(place.left), top: Math.round(place.top), arrow: Math.round(arrow) };
  }
  return centered;
}
