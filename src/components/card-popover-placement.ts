/** Vertical boxes in pane pixels. */
interface VerticalBox { top: number; height: number }

/** Hang from the card's foot, clear of the edit bar; flip above, else clamp. */
export function cardPopoverPlacement(card: VerticalBox, view: VerticalBox, height: number, bar?: VerticalBox) {
  const below = Math.max(card.top + card.height - 6, bar ? bar.top + bar.height + 8 : -Infinity);
  const above = Math.min(card.top + 6, bar ? bar.top - 8 : Infinity) - height;
  const ceiling = view.top + 8;
  const floor = view.top + view.height - height - 8;
  const top = below <= floor ? below : above >= ceiling ? above : Math.max(ceiling, Math.min(below, floor));
  return { top, below };
}
