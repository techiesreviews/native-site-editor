import type { FrameBox } from "./card-grid-controls";

/** The least height of a ghost below a grid: its button, and a little more. */
export const STRIP = 32;

/**
 * The ghost's box as drawn in a frame `frameHeight` tall, or null when it is
 * out of view. A ghost below its grid (not `beside` the item) that runs past
 * the frame's bottom while its item is in view is cut at that edge, never
 * shorter than a strip, so its button stays in the frame (`clipped`); the
 * layer would hide whatever lies past the edge.
 */
export function ghostInView(box: FrameBox, frameHeight: number, item: FrameBox | undefined, beside: boolean): { box: FrameBox; clipped: boolean } | null {
  if (box.top + box.height < 0) return null;
  const itemInView = !!item && item.top < frameHeight && item.top + item.height > 0;
  if (!beside && itemInView && box.top + box.height > frameHeight) {
    const top = Math.min(box.top, frameHeight - STRIP);
    return { box: { ...box, top, height: frameHeight - top }, clipped: true };
  }
  return box.top > frameHeight ? null : { box, clipped: false };
}
