// The Spinner part's options and how they become markup (atomic catalogue ticket 14). Plain data in, plain data out,
// so a unit test can pin it without a browser; src/ui/parts/spinner.ts draws it.

/** The sizes of the ring: beside small print, in a control, on its own above words. */
export const SPINNER_SIZES = ["small", "medium", "large"] as const;
export type SpinnerSize = (typeof SPINNER_SIZES)[number];
export const DEFAULT_SPINNER_SIZE: SpinnerSize = "medium";

/** Where it stands: inline, in the flow of its words, or an overlay, centred over what is loading with a veil on it. */
export const SPINNER_PLACES = ["inline", "overlay"] as const;
export type SpinnerPlace = (typeof SPINNER_PLACES)[number];

export const DEFAULT_SPINNER_LABEL = "Loading";

export interface SpinnerOptions {
  size?: SpinnerSize | string;
  place?: SpinnerPlace | string;
  /** What assistive technology says for it. Blank or missing: "Loading". */
  label?: string;
}

export function spinnerSize(size: SpinnerOptions["size"]): SpinnerSize {
  return SPINNER_SIZES.find((candidate) => candidate === size) ?? DEFAULT_SPINNER_SIZE;
}

export function spinnerPlace(place: SpinnerOptions["place"]): SpinnerPlace {
  return SPINNER_PLACES.find((candidate) => candidate === place) ?? "inline";
}

/** The attributes of the one element: one class, the variants as data attributes, a name for assistive technology. */
export function spinnerAttributes(options: SpinnerOptions = {}): Record<string, string> {
  return {
    class: "spinner",
    "data-size": spinnerSize(options.size),
    "data-place": spinnerPlace(options.place),
    role: "img",
    "aria-label": options.label?.trim() || DEFAULT_SPINNER_LABEL,
  };
}
