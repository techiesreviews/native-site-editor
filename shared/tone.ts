// Tone formulas for data-tone bands (ticket 08 §3). The starter copies the
// constants and the CSS in the comments; tests/tone.test.ts sweeps them for AA.

export type Oklch = { l: number; c: number; h: number };
export type Rgb = { r: number; g: number; b: number };
export type ToneNudgeBand = { darkMaxL: number; lightMinL: number };

export const TONE_NUDGE_DARK_MAX_L = 0.50;
export const TONE_NUDGE_LIGHT_MIN_L = 0.72;
export const TONE_NUDGE_SPLIT_L = (TONE_NUDGE_DARK_MAX_L + TONE_NUDGE_LIGHT_MIN_L) / 2;
export const TONE_ACCENT_L = 0.95;
export const TONE_ACCENT_MAX_C = 0.04;
export const TONE_TEXT_LIGHT_L = 0.99;
export const TONE_TEXT_DARK_L = 0.01;
export const TONE_NUDGE_BAND: Readonly<ToneNudgeBand> = Object.freeze({
  darkMaxL: TONE_NUDGE_DARK_MAX_L,
  lightMinL: TONE_NUDGE_LIGHT_MIN_L,
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// CSS: calc(1 - clamp(0, 1 / (var(--tone-split-l) - l), 1)).
// For L in [0, 1], this is an exact step, including the dark-side tie at split.
// CSS calc supports division by zero (positive infinity), clamped here to 1:
// https://www.w3.org/TR/css-values-4/#calc-ieee
// A steep multiplication ramp would leave a tiny inaccessible middle band.
function lightSide(l: number, split: number): number {
  return 1 - clamp(1 / (split - l), 0, 1);
}

export function brandSurface(
  brand: Oklch,
  band: Readonly<ToneNudgeBand> = TONE_NUDGE_BAND,
): Oklch {
  const split = (band.darkMaxL + band.lightMinL) / 2;
  const side = lightSide(brand.l, split);
  const dark = Math.min(brand.l, band.darkMaxL);
  const light = Math.max(brand.l, band.lightMinL);
  // CSS (default constants):
  // oklch(from var(--brand) calc(
  //   min(l, 0.50) * clamp(0, 1 / (0.61 - l), 1) +
  //   max(l, 0.72) * (1 - clamp(0, 1 / (0.61 - l), 1))) c h)
  return { l: dark * (1 - side) + light * side, c: brand.c, h: brand.h };
}

export function accentSurface(brand: Oklch): Oklch {
  // CSS: oklch(from var(--brand) 0.95 min(c, 0.04) h).
  return { l: TONE_ACCENT_L, c: Math.min(brand.c, TONE_ACCENT_MAX_C), h: brand.h };
}

export function fallbackText(surface: Oklch): Oklch {
  const side = lightSide(surface.l, TONE_NUDGE_SPLIT_L);
  // CSS: oklch(from var(--surface)
  //   calc(0.99 + (0.01 - 0.99) * (1 - clamp(0, 1 / (0.61 - l), 1))) 0 0).
  return { l: TONE_TEXT_LIGHT_L + (TONE_TEXT_DARK_L - TONE_TEXT_LIGHT_L) * side, c: 0, h: 0 };
}

export function contrastColorText(surface: Oklch): Oklch {
  // CSS: contrast-color(var(--surface)); the luminance comparison models the
  // browser primitive, rather than a formula the fallback CSS must reproduce.
  const rgb = oklchToSrgb(surface);
  const white = contrastRatio(rgb, { r: 1, g: 1, b: 1 });
  const black = contrastRatio(rgb, { r: 0, g: 0, b: 0 });
  return { l: white >= black ? 1 : 0, c: 0, h: 0 };
}

export function invertedButton(surface: Oklch, text: Oklch): { fill: Oklch; label: Oklch } {
  // CSS: background-color: var(--tone-text); color: var(--surface).
  return { fill: text, label: surface };
}

// The guarantee covers brand colours inside sRGB: anything written as hex,
// rgb() or hsl(). A brand outside it (for example oklch(0.5 0.37 184)) is
// clipped by the browser before the band is drawn and can fall below AA.
export function inSrgbGamut(colour: Oklch): boolean {
  const epsilon = 1e-6;
  return Object.values(oklchToLinearSrgb(colour)).every((channel) => channel >= -epsilon && channel <= 1 + epsilon);
}

export function oklchToSrgb(colour: Oklch): Rgb {
  const { r, g, b } = oklchToLinearSrgb(colour);
  // Per-channel clipping models today's browser relative-colour rendering in
  // sRGB; this is not perceptual gamut mapping.
  return { r: gammaEncode(clamp(r, 0, 1)), g: gammaEncode(clamp(g, 0, 1)), b: gammaEncode(clamp(b, 0, 1)) };
}

function oklchToLinearSrgb({ l, c, h }: Oklch): Rgb {
  // OKLCH -> OKLab -> linear sRGB: Björn Ottosson's 2021 matrices.
  // https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
  const radians = h * Math.PI / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const x = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const y = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const z = (l - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return {
    r: 4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z,
    g: -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z,
    b: -0.0041960863 * x - 0.7034186147 * y + 1.7076147010 * z,
  };
}

// Conversion and WCAG formulas model browser colour math; only the surface
// and fallback formulas above are copied into relative-colour CSS by slice 60.
function gammaEncode(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function gammaDecode(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

// WCAG 2: https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * gammaDecode(r) + 0.7152 * gammaDecode(g) + 0.0722 * gammaDecode(b);
}

export function contrastRatio(first: Rgb, second: Rgb): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
