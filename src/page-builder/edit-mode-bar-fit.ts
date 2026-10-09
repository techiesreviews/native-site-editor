/** Widths include the mode controls, Done, device tools and their gaps. */
export const EDIT_MODE_FITS = ["full", "note", "used"] as const;
export type EditModeFit = typeof EDIT_MODE_FITS[number] | "wrap";

/** Prefer words until they no longer fit; wrapping is the last resort. */
export function editModeBarFit(available: number, needed: Readonly<Record<typeof EDIT_MODE_FITS[number], number>>): EditModeFit {
  return EDIT_MODE_FITS.find((stage) => needed[stage] <= available) ?? "wrap";
}
