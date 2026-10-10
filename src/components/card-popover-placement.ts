/** Vertical boxes in pane pixels. */
interface VerticalBox { top: number; height: number }

/**
 * Where "Link to a page…" stands: hung from the card's
 * foot, below its edit bar when the bar is under the card; else above both;
 * else over the card, still clear of the bar when the view has room beside
 * it; only then clamped to the view.
 */
export function cardPopoverPlacement(card: VerticalBox, view: VerticalBox, height: number, bar?: VerticalBox) {
  const foot = card.top + card.height - 6;
  const below = Math.max(foot, bar ? bar.top + bar.height + 8 : -Infinity);
  const above = Math.min(card.top + 6, bar ? bar.top - 8 : Infinity) - height;
  const ceiling = view.top + 8;
  const floor = view.top + view.height - height - 8;
  if (below <= floor) return { top: below, below };
  if (above >= ceiling) return { top: above, below };
  const clear = bar ? [bar.top - 8 - height, bar.top + bar.height + 8].find((at) => at >= ceiling && at <= floor) : undefined;
  return { top: clear ?? Math.max(ceiling, Math.min(foot, floor)), below };
}
