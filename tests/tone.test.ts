import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accentSurface, brandSurface, contrastColorText, contrastRatio, fallbackText,
  inSrgbGamut, invertedButton, oklchToSrgb, relativeLuminance,
  TONE_NUDGE_BAND, TONE_NUDGE_SPLIT_L,
  type Oklch, type Rgb, type ToneNudgeBand,
} from "../shared/tone.ts";

function close(actual: number, expected: number, tolerance = 1e-7): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function closeRgb(actual: Rgb, expected: Rgb, tolerance = 1e-7): void {
  close(actual.r, expected.r, tolerance);
  close(actual.g, expected.g, tolerance);
  close(actual.b, expected.b, tolerance);
}

test("OKLCH converts black, white, a neutral and sRGB red", () => {
  closeRgb(oklchToSrgb({ l: 0, c: 0, h: 0 }), { r: 0, g: 0, b: 0 });
  closeRgb(oklchToSrgb({ l: 1, c: 0, h: 123 }), { r: 1, g: 1, b: 1 });
  closeRgb(oklchToSrgb({ l: 0.5, c: 0, h: 0 }), {
    r: 0.3885728590463344, g: 0.3885728590463344, b: 0.3885728590463344,
  });
  // Standard sRGB red expressed in OKLCH; tolerance covers rounded matrices.
  closeRgb(oklchToSrgb({ l: 0.6279553606, c: 0.2576833077, h: 29.23388519 }),
    { r: 1, g: 0, b: 0 }, 2e-6);
});

test("out-of-gamut channels are clipped independently", () => {
  const blue = oklchToSrgb({ l: 0.5, c: 0.37, h: 260 });
  closeRgb(blue, { r: 0, g: 0, b: 1 });
  const cyan = oklchToSrgb({ l: 0.5, c: 0.37, h: 185 });
  assert.equal(cyan.r, 0);
  assert.ok(cyan.g > 0 && cyan.g < 1);
  assert.ok(cyan.b > 0 && cyan.b < 1);
});

test("the sRGB gamut check accepts hex-expressible colours and rejects wide ones", () => {
  assert.ok(inSrgbGamut({ l: 0.6279553606, c: 0.2576833077, h: 29.23388519 }));
  assert.ok(inSrgbGamut({ l: 1, c: 0, h: 0 }));
  assert.ok(!inSrgbGamut({ l: 0.5, c: 0.37, h: 184 }));
});

test("WCAG luminance and contrast use gamma-decoded sRGB", () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 1, g: 1, b: 1 };
  assert.equal(relativeLuminance(black), 0);
  assert.equal(relativeLuminance(white), 1);
  close(relativeLuminance({ r: 0.5, g: 0.5, b: 0.5 }), 0.21404114048223255);
  close(relativeLuminance({ r: 0.02, g: 0.02, b: 0.02 }), 0.02 / 12.92);
  assert.equal(contrastRatio(black, white), 21);
  assert.equal(contrastRatio(white, black), 21);
  assert.equal(contrastRatio(white, white), 1);
});

test("surface formulas preserve hue; brand preserves chroma and nudges to the nearer side", () => {
  for (const [l, expected] of [[0.2, 0.2], [0.5, 0.5], [0.6, 0.5], [0.62, 0.72], [0.9, 0.9]]) {
    const surface = brandSurface({ l, c: 0.3, h: 123 });
    close(surface.l, expected);
    assert.equal(surface.c, 0.3);
    assert.equal(surface.h, 123);
  }
  assert.deepEqual(accentSurface({ l: 0.2, c: 0.3, h: 123 }), { l: 0.95, c: 0.04, h: 123 });
  assert.deepEqual(accentSurface({ l: 0.8, c: 0.02, h: 234 }), { l: 0.95, c: 0.02, h: 234 });
  close(brandSurface({ l: 0.6, c: 0.2, h: 10 }, { darkMaxL: 0.4, lightMinL: 0.7 }).l, 0.7);
});

test("the exact calc step leaves no intermediate surface beside the split", () => {
  for (const offset of [-1e-6, -1e-10, 0, 1e-10, 1e-6]) {
    const brand = { l: TONE_NUDGE_SPLIT_L + offset, c: 0.1, h: 185 };
    assert.ok(inSrgbGamut(brand));
    const surface = brandSurface(brand);
    close(surface.l, offset <= 0 ? 0.5 : 0.72);
    const fallback = fallbackText(surface);
    const automatic = contrastColorText(surface);
    assert.equal(fallback.l > 0.5, automatic.l > 0.5);
    assert.ok(contrastRatio(oklchToSrgb(surface), oklchToSrgb(fallback)) >= 4.5);
  }
});

test("text paths choose the contrasting side and buttons invert the band", () => {
  for (const [l, automaticL, fallbackL] of [[0.3, 1, 0.99], [0.9, 0, 0.01]]) {
    const surface = { l, c: 0, h: 0 };
    const text = fallbackText(surface);
    assert.equal(contrastColorText(surface).l, automaticL);
    close(text.l, fallbackL);
    assert.deepEqual(invertedButton(surface, text), { fill: text, label: surface });
  }
});

type Minimum = { text: number; buttonFill: number; buttonLabel: number; worst: Oklch };
type Sweep = {
  samples: number;
  outsideSrgb: number;
  failures: number;
  sideMismatches: number;
  minima: Record<string, Minimum>;
  firstFailure?: string;
};

// Inclusive integer counters avoid floating-point drift at the band edges.
// 73 hues × 101 lightnesses × 38 chromas = 280,174 grid points; brands outside
// sRGB are skipped (see inSrgbGamut), the nudged surfaces are not.
function sweep(band: Readonly<ToneNudgeBand> = TONE_NUDGE_BAND): Sweep {
  const result: Sweep = { samples: 0, outsideSrgb: 0, failures: 0, sideMismatches: 0, minima: {} };
  const paths = { contrastColor: contrastColorText, fallback: fallbackText };
  for (const tone of ["brand", "accent"]) for (const path of Object.keys(paths)) {
    result.minima[`${tone}/${path}`] = {
      text: Infinity, buttonFill: Infinity, buttonLabel: Infinity, worst: { l: 0, c: 0, h: 0 },
    };
  }
  for (let h = 0; h <= 360; h += 5) for (let li = 0; li <= 100; li++) for (let ci = 0; ci <= 37; ci++) {
    const brand = { l: li / 100, c: ci / 100, h };
    if (!inSrgbGamut(brand)) {
      result.outsideSrgb++;
      continue;
    }
    result.samples++;
    const surfaces = { brand: brandSurface(brand, band), accent: accentSurface(brand) };
    if ((contrastColorText(surfaces.brand).l > 0.5) !== (fallbackText(surfaces.brand).l > 0.5)) {
      result.sideMismatches++;
    }
    for (const [tone, surface] of Object.entries(surfaces)) {
      const background = oklchToSrgb(surface);
      for (const [path, chooseText] of Object.entries(paths)) {
        const text = chooseText(surface);
        const button = invertedButton(surface, text);
        const textContrast = contrastRatio(oklchToSrgb(text), background);
        const fillContrast = contrastRatio(oklchToSrgb(button.fill), background);
        const labelContrast = contrastRatio(oklchToSrgb(button.label), oklchToSrgb(button.fill));
        const minimum = result.minima[`${tone}/${path}`];
        if (textContrast < minimum.text) minimum.worst = brand;
        minimum.text = Math.min(minimum.text, textContrast);
        minimum.buttonFill = Math.min(minimum.buttonFill, fillContrast);
        minimum.buttonLabel = Math.min(minimum.buttonLabel, labelContrast);
        if (!(textContrast >= 4.5 && fillContrast >= 3 && labelContrast >= 4.5)) {
          result.failures++;
          result.firstFailure ??= `${tone}/${path} ${JSON.stringify(brand)}: ${textContrast}`;
        }
      }
    }
  }
  return result;
}

test("tone sweep meets AA for both text paths, both surfaces and inverted buttons", (context) => {
  const result = sweep();
  assert.equal(result.samples + result.outsideSrgb, 280174);
  assert.ok(result.samples > 20000, `only ${result.samples} sRGB brands swept`);
  assert.equal(result.failures, 0, result.firstFailure);
  assert.equal(result.sideMismatches, 0);
  for (const [path, minimum] of Object.entries(result.minima)) {
    context.diagnostic(`${path}: ${JSON.stringify(minimum)} over ${result.samples} sRGB brands`);
    assert.ok(minimum.text >= 4.5, path);
    assert.ok(minimum.buttonFill >= 3, path);
    assert.ok(minimum.buttonLabel >= 4.5, path);
  }
});

test("the same sweep finds failures when the nudge band is narrowed", (context) => {
  const result = sweep({ darkMaxL: 0.55, lightMinL: 0.67 });
  assert.equal(result.samples + result.outsideSrgb, 280174);
  assert.ok(result.samples > 20000, `only ${result.samples} sRGB brands swept`);
  assert.ok(result.failures > 0);
  assert.ok(result.sideMismatches > 0);
  context.diagnostic(`narrowed band: ${result.failures} failures; ${result.firstFailure}`);
});
