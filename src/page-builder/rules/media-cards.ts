// Media cards placed from Media (slices 61, 62, 68): a link that stands for a
// download or an Online video. One rule for the edit bar and Page structure
// (native-structure.ts) and the canvas's hover tag (the preview runtime),
// tested in tests/rules-media-cards.test.ts.

const hasClass = (className: string, name: string) => className.split(/\s+/).includes(name);

/** What a media card is called ("Download", "Video"), or undefined for any other element. */
export function mediaCardLabel(tag: string, className = ""): string | undefined {
  if (tag !== "a") return undefined;
  if (hasClass(className, "download-card")) return "Download";
  if (hasClass(className, "online-video")) return "Video";
  return undefined;
}

/**
 * The name of the media card `chain` lies in: `chain` runs from an element up
 * through its ancestors ({ tag, className } each). Any part of a card (its
 * picture, name or size line) takes the card's name.
 */
export function mediaCardLabelOf(chain: Iterable<{ tag: string; className?: string }>): string | undefined {
  for (const item of chain) {
    const label = mediaCardLabel(item.tag, item.className);
    if (label) return label;
  }
  return undefined;
}
