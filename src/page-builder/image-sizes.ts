/** Widths are CSS pixels, independent of the visitor's device pixel ratio. */
export type ImageWidth = { viewport: number; width: number };
export type ImageFact = { viewport: number; viewportHeight: number; top: number; width: number; height: number; naturalWidth: number; naturalHeight: number; fit: string };
/** `large`: the target's rendered (border) box on a first screen, for loading priority. */
export type ImageReport = { facts: ImageFact[]; images?: { node: number[]; firstScreen: boolean; large: boolean }[]; large?: boolean } | { error: string };

// The first integer viewport on the upper side of `width <op> n`.
const UPPER: Record<string, (n: number) => number> = { ">": (n) => Math.floor(n) + 1, ">=": Math.ceil, "<": Math.ceil, "<=": (n) => Math.floor(n) + 1 };
const FLIP: Record<string, string> = { "<": ">", "<=": ">=", ">": "<", ">=": "<=" };
const LENGTH = String.raw`(\d+(?:\.\d+)?)\s*(px|em|rem)`;
const px = (value: string, unit: string) => Number(value) * (unit.toLowerCase() === "px" ? 1 : 16);

/** Return the first integer viewport on the upper side of each width query (`min-`/`max-width` and range syntax). */
export function imageBreakpoints(conditions: readonly string[]): number[] {
  const points = new Set<number>();
  const add = (op: string, width: number) => { if (width > 0 && Number.isFinite(width)) points.add(UPPER[op](width)); };
  for (const condition of conditions) {
    for (const m of condition.matchAll(new RegExp(String.raw`\(\s*(min|max)-width\s*:\s*${LENGTH}\s*\)`, "gi"))) add(m[1].toLowerCase() === "min" ? ">=" : "<=", px(m[2], m[3]));
    // Range syntax: `(width > 900px)`, `(900px <= width)`, `(400px < width <= 900px)`.
    for (const m of condition.matchAll(new RegExp(String.raw`(?<![\w-])width\s*([<>]=?)\s*${LENGTH}`, "gi"))) add(m[1], px(m[2], m[3]));
    for (const m of condition.matchAll(new RegExp(String.raw`${LENGTH}\s*([<>]=?)\s*width(?![\w-])`, "gi"))) add(FLIP[m[3]], px(m[1], m[2]));
  }
  return [...points].sort((a, b) => a - b);
}

/** Site breakpoints measured on both sides; beyond this many, an even sample across the range. */
export const IMAGE_BREAKPOINTS = 24;
/** The most layouts one measurement reads: three devices plus both sides of each breakpoint. */
export const IMAGE_FACTS = 3 + 2 * IMAGE_BREAKPOINTS;

export function imageViewports(points: readonly number[]): number[] {
  const widths = new Set([390, 768, 1280]);
  const valid = [...new Set(points)].filter((point) => Number.isInteger(point) && point > 320 && point <= 2560).sort((a, b) => a - b);
  const count = Math.min(IMAGE_BREAKPOINTS, valid.length);
  for (let i = 0; i < count; i++) {
    // Sample the whole stylesheet's range when there are too many queries.
    const point = valid[count === 1 ? 0 : Math.round(i * (valid.length - 1) / (count - 1))];
    widths.add(point - 1);
    widths.add(point);
  }
  return [...widths].sort((a, b) => a - b);
}

export function imageWidth(width: number, height: number, naturalWidth: number, naturalHeight: number, fit: string): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  // The box is a conservative hint for the other fit modes; only cover
  // expands the decoded image to fill a box with a different aspect ratio.
  return fit === "cover" && height > 0 && Number.isFinite(height) && naturalWidth > 0 && naturalHeight > 0 && Number.isFinite(naturalWidth) && Number.isFinite(naturalHeight)
    ? naturalWidth * Math.max(width / naturalWidth, height / naturalHeight) : width;
}

/** Close ratios (within 1%) track the viewport; everything else uses a px upper bound. */
export function imageSizes(measurements: readonly ImageWidth[]): string | undefined {
  const widths = new Map<number, number>();
  for (const { viewport, width } of measurements) {
    if (Number.isFinite(viewport) && viewport > 0 && Number.isFinite(width) && width > 0 && width <= Number.MAX_SAFE_INTEGER) widths.set(viewport, Math.max(width, widths.get(viewport) ?? 0));
  }
  const samples = [...widths].map(([viewport, width]) => ({ viewport, width })).sort((a, b) => a.viewport - b.viewport);
  if (!samples.length) return undefined;
  const value = (a: ImageWidth, b: ImageWidth) => {
    const low = Math.min(a.width / a.viewport, b.width / b.viewport), high = Math.max(a.width / a.viewport, b.width / b.viewport);
    const percent = Math.ceil(high * 100);
    return Number.isSafeInteger(percent) && a !== b && (Math.abs(a.width - b.width) > Math.max(a.width, b.width) * 0.01 || high - low <= high * 0.000001) && high - low <= high * 0.01 ? `${Math.max(1, percent)}vw` : `${Math.ceil(Math.max(a.width, b.width))}px`;
  };
  const ranges: { end: number; value: string }[] = [];
  const add = (end: number, hint: string) => {
    if (ranges.at(-1)?.value === hint) ranges[ranges.length - 1].end = end;
    else ranges.push({ end, value: hint });
  };
  // A one-pixel breakpoint pair separates ranges; never interpolate across
  // its jump. The lower measured width is the inclusive max-width. Thus
  // 899.5px already uses the upper range when the boundary is 899px.
  let start = 0;
  for (let end = 0; end < samples.length; end++) {
    if (end + 1 < samples.length && (samples[end + 1].viewport - samples[end].viewport > 1 || Math.abs(samples[end + 1].width - samples[end].width) <= Math.max(samples[end + 1].width, samples[end].width) * 0.01)) continue;
    if (end === start) add(samples[end].viewport, value(samples[end], samples[end]));
    else {
      let added = false;
      for (let i = start; i < end; i++) {
        if (end > start + 1 && samples[i + 1].viewport - samples[i].viewport <= 1) continue;
        add(samples[i + 1].viewport, value(samples[i], samples[i + 1]));
        added = true;
      }
      // A run made only of one-pixel steps still needs its range.
      if (!added) add(samples[end].viewport, value(samples[start], samples[end]));
    }
    ranges[ranges.length - 1].end = samples[end].viewport;
    start = end + 1;
  }
  return ranges.map((range, i) => i === ranges.length - 1 ? range.value : `(max-width: ${range.end}px) ${range.value}`).join(", ");
}

/** An image whose top is on either baseline device's first screen loads first. */
export function imageFirstScreen(facts: readonly { viewport: number; viewportHeight: number; top: number }[]): boolean {
  return facts.some(({ viewport, viewportHeight, top }) => (viewport === 390 || viewport === 1280) && Number.isFinite(top) && Number.isFinite(viewportHeight) && viewportHeight > 0 && top >= 0 && top < viewportHeight);
}

export function imageResult(facts: readonly ImageFact[]): { sizes: string | undefined; widths: ImageWidth[]; firstScreen: boolean; large: boolean } {
  const widths = facts.map((fact) => ({ viewport: fact.viewport, width: imageWidth(fact.width, fact.height, fact.naturalWidth, fact.naturalHeight, fact.fit) }));
  return { sizes: imageSizes(widths), widths, firstScreen: imageFirstScreen(facts), large: facts.some(fact => imageFirstScreen([fact]) && fact.width * fact.height >= 50000) };
}
