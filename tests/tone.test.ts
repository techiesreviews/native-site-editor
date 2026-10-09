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

// Independent raw-channel conversion: no clipping before luminance or P3 checks.
function linearRgb({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos(h * Math.PI / 180);
  const b = c * Math.sin(h * Math.PI / 180);
  const x = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const y = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const z = (l - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return {
    r: 4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z,
    g: -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z,
    b: -0.0041960863 * x - 0.7034186147 * y + 1.7076147010 * z,
  };
}

function rawLuminance(colour: Oklch): number {
  const { r, g, b } = linearRgb(colour);
  return Math.max(0, Math.min(1, 0.2126 * r + 0.7152 * g + 0.0722 * b));
}

function hueShift(a: number, b: number): number {
  return Math.abs((a - b + 540) % 360 - 180);
}

function inDisplayP3(colour: Oklch): boolean {
  const { r, g, b } = linearRgb(colour);
  // Linear sRGB -> XYZ D65 -> linear Display P3, combined matrices.
  return [
    0.8224619687 * r + 0.1775380313 * g,
    0.0331941989 * r + 0.9668058011 * g,
    0.0170826307 * r + 0.0723974407 * g + 0.9105199286 * b,
  ].every((channel) => channel >= 0 && channel <= 1);
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

test("surface formulas preserve safe chroma and hue and nudge to the nearer side", () => {
  for (const [l, expected] of [[0.2, 0.2], [0.5, 0.5], [0.6, 0.5], [0.62, 0.72], [0.9, 0.9]]) {
    const surface = brandSurface({ l, c: 0.02, h: 123 });
    close(surface.l, expected);
    close(surface.c, 0.02);
    close(surface.h, 123, 1e-4);
  }
  assert.deepEqual(accentSurface({ l: 0.2, c: 0.3, h: 123 }), { l: 0.95, c: 0.04, h: 123 });
  assert.deepEqual(accentSurface({ l: 0.8, c: 0.02, h: 234 }), { l: 0.95, c: 0.02, h: 234 });
  close(brandSurface({ l: 0.6, c: 0.02, h: 10 }, { darkMaxL: 0.4, lightMinL: 0.7 }).l, 0.7);
});

test("the luminance-keeping map reduces blue, cyan and magenta into sRGB", () => {
  for (const l of [0.50, 0.72]) for (const h of [264, 195, 328]) {
    const surface = brandSurface({ l, c: 0.37, h });
    close(rawLuminance(surface), rawLuminance({ l, c: 0.37, h }));
    // The exact luminance map is not constant-hue: saturated blue at L .72
    // shifts 12.485 degrees; cyan at L .50 shifts 8.496 degrees.
    const hueLimit = h === 264 ? (l === 0.50 ? 7 : 13) : h === 195 ? (l === 0.50 ? 9 : 5) : 2;
    assert.ok(hueShift(surface.h, h) < hueLimit, JSON.stringify(surface));
    assert.ok(surface.c > 0 && surface.c < 0.37);
    assert.ok(inSrgbGamut(surface), JSON.stringify(surface));
  }
});

test("a wide-gamut cyan brand gets an sRGB surface with AA text", () => {
  const surface = brandSurface({ l: 0.5, c: 0.37, h: 184 });
  assert.ok(surface.c < 0.12);
  assert.ok(inSrgbGamut(surface));
  for (const chooseText of [fallbackText, contrastColorText]) {
    assert.ok(contrastRatio(oklchToSrgb(surface), oklchToSrgb(chooseText(surface))) >= 4.5);
  }
});

// Hex fixtures converted with the forward OKLab matrices, independently of
// the map and inverse conversion under test. Values retain full precision.
const hexBrands: Record<string, Oklch> = {
  "#ff0000": { l: 0.6279553606145516, c: 0.2576833077361567, h: 29.233885192342633 },
  "#0066cc": { l: 0.5219661920728773, c: 0.1770895962009904, h: 255.82972617984825 },
  "#1a7f37": { l: 0.5244114042170495, c: 0.14007707041643663, h: 148.0393982517529 },
  "#ffcc00": { l: 0.865208992074219, c: 0.17682824048983725, h: 90.38155627342547 },
  "#6b21a8": { l: 0.43827937850559545, c: 0.19833283871141869, h: 303.7241460223968 },
};

function rawSurface(brand: Oklch, band: Readonly<ToneNudgeBand> = TONE_NUDGE_BAND): Oklch {
  const split = (band.darkMaxL + band.lightMinL) / 2;
  return { ...brand, l: brand.l <= split ? Math.min(brand.l, band.darkMaxL) : Math.max(brand.l, band.lightMinL) };
}

test("hex brands whose nudged surfaces are in sRGB remain unchanged", () => {
  for (const hex of ["#1a7f37", "#ffcc00", "#6b21a8"]) {
    const brand = hexBrands[hex];
    const expected = rawSurface(brand);
    assert.ok(inSrgbGamut(brand), hex);
    assert.ok(inSrgbGamut(expected), hex);
    const surface = brandSurface(brand);
    close(surface.l, expected.l);
    close(surface.h, expected.h, 1e-4);
    close(surface.c, expected.c);
    closeRgb(oklchToSrgb(surface), oklchToSrgb(expected), 2e-6);
  }
});

test("sRGB red and blue are mapped because their nudged surfaces leave sRGB", () => {
  for (const hex of ["#ff0000", "#0066cc"]) {
    const brand = hexBrands[hex];
    assert.ok(inSrgbGamut(brand), hex);
    assert.ok(!inSrgbGamut(rawSurface(brand)), hex);
    const surface = brandSurface(brand);
    assert.ok(surface.c < brand.c, hex);
    close(rawLuminance(surface), rawLuminance(rawSurface(brand)));
    assert.ok(inSrgbGamut(surface), hex);
  }
});

test("extreme lightness surfaces preserve clamped raw luminance", () => {
  for (let h = 0; h <= 360; h += 5) for (const l of [0, 1]) {
    const raw = { l, c: 0.37, h };
    const surface = brandSurface(raw);
    assert.ok(inSrgbGamut(surface));
    close(rawLuminance(surface), rawLuminance(raw));
  }
});

test("in-gamut surfaces next to black and white are left as they are", () => {
  for (const raw of [
    { l: 0.009, c: 0.001, h: 123 }, { l: 0.0005, c: 0.0001, h: 250 }, { l: 1e-7, c: 0, h: 0 },
    { l: 0.9995, c: 0.0001, h: 30 }, { l: 0.99999, c: 0, h: 0 },
  ]) {
    assert.ok(inSrgbGamut(raw, 0), JSON.stringify(raw));
    const surface = brandSurface(raw);
    close(surface.l, raw.l, 1e-6);
    close(surface.c, raw.c, 1e-6);
  }
});

test("the exact calc step leaves no intermediate surface beside the split", () => {
  for (const offset of [-1e-6, -1e-10, 0, 1e-10, 1e-6]) {
    const brand = { l: TONE_NUDGE_SPLIT_L + offset, c: 0.1, h: 185 };
    assert.ok(inSrgbGamut(brand));
    const surface = brandSurface(brand);
    close(rawLuminance(surface), rawLuminance(rawSurface(brand)));
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
  srgbBrands: number;
  reducedInside: number;
  reducedOutside: number;
  largestInsideReduction: number;
  reducedStrictInside: number;
  largestStrictInsideReduction: number;
  largestP3HueShift: number;
  worstP3HueShift?: Oklch;
  minima: Record<string, Minimum>;
  firstFailure?: string;
};

// Inclusive integer counters avoid floating-point drift at the band edges.
// 73 hues × 101 lightnesses × 38 chromas = 280,174 grid points, including
// wide-gamut brands. The map must bring every brand surface into sRGB.
function sweep(band: Readonly<ToneNudgeBand> = TONE_NUDGE_BAND): Sweep {
  const result: Sweep = {
    samples: 0, outsideSrgb: 0, failures: 0, sideMismatches: 0, minima: {},
    srgbBrands: 0, reducedInside: 0, reducedOutside: 0, largestInsideReduction: 0,
    reducedStrictInside: 0, largestStrictInsideReduction: 0, largestP3HueShift: 0,
  };
  const paths = { contrastColor: contrastColorText, fallback: fallbackText };
  for (const tone of ["brand", "accent"]) for (const path of Object.keys(paths)) {
    result.minima[`${tone}/${path}`] = {
      text: Infinity, buttonFill: Infinity, buttonLabel: Infinity, worst: { l: 0, c: 0, h: 0 },
    };
  }
  for (let h = 0; h <= 360; h += 5) for (let li = 0; li <= 100; li++) for (let ci = 0; ci <= 37; ci++) {
    const brand = { l: li / 100, c: ci / 100, h };
    const srgbBrand = inSrgbGamut(brand);
    if (srgbBrand) result.srgbBrands++;
    else result.outsideSrgb++;
    result.samples++;
    const surfaces = { brand: brandSurface(brand, band), accent: accentSurface(brand) };
    assert.ok(inSrgbGamut(surfaces.brand), `surface outside sRGB: ${JSON.stringify(surfaces.brand)}`);
    const raw = rawSurface(brand, band);
    close(rawLuminance(surfaces.brand), rawLuminance(raw));
    if (inDisplayP3(raw) && raw.c > 1e-7 && surfaces.brand.c > 1e-7) {
      const shift = hueShift(raw.h, surfaces.brand.h);
      if (shift > result.largestP3HueShift) {
        result.largestP3HueShift = shift;
        result.worstP3HueShift = brand;
      }
    }
    if (inSrgbGamut(raw, 0)) {
      close(surfaces.brand.l, raw.l, 1e-6);
      close(surfaces.brand.c, raw.c, 1e-6);
    }
    if (srgbBrand && inSrgbGamut(raw)) {
      result.largestInsideReduction = Math.max(result.largestInsideReduction, brand.c - surfaces.brand.c);
      if (inSrgbGamut(raw, 0)) {
        result.largestStrictInsideReduction = Math.max(result.largestStrictInsideReduction, brand.c - surfaces.brand.c);
      }
    }
    // Ignore forward/inverse matrix rounding when counting mapped brands.
    if (srgbBrand && surfaces.brand.c < brand.c - 1e-7) {
      if (inSrgbGamut(raw)) {
        result.reducedInside++;
        if (inSrgbGamut(raw, 0)) {
          result.reducedStrictInside++;
        }
      } else result.reducedOutside++;
    }
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
  const started = performance.now();
  const result = sweep();
  context.diagnostic(`sweep: ${result.samples} brands in ${(performance.now() - started).toFixed(0)} ms`);
  context.diagnostic(`sRGB brands: ${result.srgbBrands}; reductions > 1e-7; mapped with epsilon-accepted raw surface: ${result.reducedInside}; ` +
    `outside sRGB: ${result.reducedOutside}; largest epsilon-accepted chroma reduction: ${result.largestInsideReduction}`);
  context.diagnostic(`strict in-sRGB raw surfaces (epsilon 0): ${result.reducedStrictInside} mapped; ` +
    `largest chroma reduction: ${result.largestStrictInsideReduction}; ` +
    `${result.reducedInside - result.reducedStrictInside} reductions above were out of gamut but accepted by epsilon 1e-6`);
  assert.equal(result.samples, 280174);
  assert.equal(result.srgbBrands, 84311);
  assert.equal(result.reducedStrictInside, 0);
  assert.ok(result.largestStrictInsideReduction < 1e-7);

  context.diagnostic(`largest hue shift for raw Display P3 surfaces: ${result.largestP3HueShift} degrees; ${JSON.stringify(result.worstP3HueShift)}`);
  assert.equal(result.failures, 0, result.firstFailure);
  assert.equal(result.sideMismatches, 0);
  for (const [path, minimum] of Object.entries(result.minima)) {
    context.diagnostic(`${path}: ${JSON.stringify(minimum)} over ${result.samples} brands`);
    assert.ok(minimum.text >= 4.5, path);
    assert.ok(minimum.buttonFill >= 3, path);
    assert.ok(minimum.buttonLabel >= 4.5, path);
  }
});

test("the same sweep finds failures when the nudge band is narrowed", (context) => {
  const result = sweep({ darkMaxL: 0.55, lightMinL: 0.67 });
  assert.equal(result.samples, 280174);
  assert.ok(result.failures > 0);
  assert.ok(result.sideMismatches > 0);
  context.diagnostic(`narrowed band: ${result.failures} failures; ${result.firstFailure}`);
});
