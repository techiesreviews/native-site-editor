// The Icon part's options and how they become markup (atomic catalogue ticket 10). Pure text in, text out, so a unit
// test can pin it without a browser; src/ui/parts/icon.ts draws it. One way to draw a Phosphor Regular icon: the
// markup of any icon (src/icons.ts or a lazy chunk) goes through iconSvg, whatever file it comes from
// (once the editor's own copies move over, ticket 30).

/** The sizes an icon is drawn at, in px: beside small print, in a control, in a larger control, alone above words. */
export const ICON_SIZES = [12, 16, 20, 24] as const;
export type IconSize = (typeof ICON_SIZES)[number];
export const DEFAULT_ICON_SIZE: IconSize = 16;

/** Where the icon stands: on its own (centred in its control), before words or after them. */
export const ICON_PLACES = ["alone", "before", "after"] as const;
export type IconPlace = (typeof ICON_PLACES)[number];

export interface IconOptions {
  size?: IconSize | number | string;
  place?: IconPlace | string;
}

/** The size in the set: the asked one when it is in the set, otherwise the default. */
export function iconSize(size: IconOptions["size"]): IconSize {
  const wanted = Number(size);
  return ICON_SIZES.find((candidate) => candidate === wanted) ?? DEFAULT_ICON_SIZE;
}

export function iconPlace(place: IconOptions["place"]): IconPlace {
  return ICON_PLACES.find((candidate) => candidate === place) ?? "alone";
}

/**
 * Phosphor SVG markup made into the Icon part: one class, `icon`, the size in the markup and as `data-size`, the place
 * as `data-place` (only when it stands beside words), hidden from assistive technology (the control around it, or
 * the words beside it, carry the name).
 */
export function iconSvg(svg: string, options: IconOptions = {}): string {
  const size = iconSize(options.size);
  const place = iconPlace(options.place);
  const attributes = [`class="icon"`, `width="${size}"`, `height="${size}"`, `data-size="${size}"`];
  if (place !== "alone") attributes.push(`data-place="${place}"`);
  attributes.push(`aria-hidden="true"`, `focusable="false"`);
  return svg.replace("<svg ", `<svg ${attributes.join(" ")} `);
}
