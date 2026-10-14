import { stripJpegMetadata, stripPngMetadata, stripWebpMetadata, strippedImageSource, gifIsAnimated, pngIsAnimated, webpIsAnimated } from "../src/page-builder/media-image-bytes";
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MEDIA_OPTIMISE, mediaImageRecipe, mediaTransparentOptions, mediaSmallerMain, mediaCopyIsSmaller, mediaChooseEncoding, mediaDimensions, mediaResponsiveWidths, mediaSavings, mediaUntouched, optimiseMedia, validateMediaOptimiseOptions } from "../src/page-builder/media-optimise";

test("optimisation retains aspect ratio, never upscales, and picks only smaller transparent PNG", () => {
  assert.deepEqual(mediaDimensions(4000, 3000, 2400), { width: 2400, height: 1800 });
  assert.deepEqual(mediaDimensions(100, 50, 2400), { width: 100, height: 50 });
  assert.deepEqual(mediaResponsiveWidths(1600), [480, 960]);
  const webp = new Blob(["large"]), png = new Blob(["a"]);
  assert.equal(mediaChooseEncoding(webp, png), png); assert.equal(mediaChooseEncoding(png, webp), png);
  assert.equal(mediaSavings(100, 60), 40); assert.equal(mediaSavings(100, 120), -20);
  assert.equal(mediaUntouched("still.GIF"), false); assert.equal(mediaUntouched("logo.svg"), true);
  assert.throws(() => mediaDimensions(0, 10, 20)); assert.throws(() => mediaDimensions(10, Infinity, 20));
});
test("invalid encoding options fail before launching a worker", async () => {
  assert.throws(() => validateMediaOptimiseOptions({ ...DEFAULT_MEDIA_OPTIMISE, quality: NaN }));
  await assert.rejects(optimiseMedia(new File(["x"], "x.png"), { ...DEFAULT_MEDIA_OPTIMISE, maxWidth: 0 }), /supported image format/);
});
test("abort terminates the optimisation worker and does not accept a late result", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  let instance: FakeWorker | undefined;
  class FakeWorker {
    terminated = false;
    onmessage?: (event: { data: unknown }) => void;
    onerror?: () => void;
    constructor() { instance = this; }
    postMessage() {}
    terminate() { this.terminated = true; }
  }
  Object.defineProperty(globalThis, "Worker", { value: FakeWorker, configurable: true, writable: true });
  try {
    const controller = new AbortController();
    const pending = optimiseMedia(new File(["x"], "x.png"), DEFAULT_MEDIA_OPTIMISE, controller.signal);
    controller.abort(); await assert.rejects(pending, { name: "AbortError" });
    assert.equal(instance?.terminated, true);
    instance?.onmessage?.({ data: { result: { outputs: [], before: 0, after: 0 } } });
  } finally { previous ? Object.defineProperty(globalThis, "Worker", previous) : Reflect.deleteProperty(globalThis, "Worker"); }
});

test("image recipes map exact encoder settings, including unlimited Higher quality", () => {
  const cases = [
    ["smaller", 1600, 70, "webp", undefined], ["balanced", 2400, 80, "webp", undefined],
    ["higher", null, 90, "webp", undefined], ["smallest", 2400, 50, "avif", 8],
  ] as const;
  for (const [quality, maxWidth, value, format, speed] of cases) {
    const recipe = mediaImageRecipe(quality);
    assert.deepEqual([recipe.maxWidth, recipe.quality, recipe.format, recipe.speed, recipe.responsive, recipe.keepOriginal], [maxWidth, value, format, speed, true, false]);
    validateMediaOptimiseOptions(recipe);
  }
  assert.deepEqual(mediaImageRecipe(), DEFAULT_MEDIA_OPTIMISE);
  assert.deepEqual(mediaDimensions(6000, 4000, null), { width: 6000, height: 4000 });
  assert.deepEqual(mediaDimensions(200, 100, null), { width: 200, height: 100 });
  for (const format of ["webp", "png", "jpeg"] as const) validateMediaOptimiseOptions({ ...DEFAULT_MEDIA_OPTIMISE, format });
  assert.throws(() => validateMediaOptimiseOptions({ ...mediaImageRecipe("smallest"), speed: 11 }));
});
test("transparent recipes compare ordinary WebP quality against lossless PNG, including AVIF", () => {
  for (const quality of ["smaller", "balanced", "higher", "smallest"] as const) {
    const options = mediaTransparentOptions(mediaImageRecipe(quality));
    assert.equal(options.format, "webp");
    assert.equal(options.quality, quality === "smallest" ? 80 : mediaImageRecipe(quality).quality);
    const small = new Blob(["a"]), large = new Blob(["larger"]);
    assert.equal(mediaChooseEncoding(small, large), small);
    assert.equal(mediaChooseEncoding(large, small), small);
  }
});
test("main keeps the smaller suitable version; copies must be below main width and bytes", async () => {
  const sized = (size: number, type: string) => new Blob([new Uint8Array(size)], { type });
  const encoded: string[] = [];
  const encoder = (sizes: Record<string, number>) => async (type: "image/jpeg" | "image/png") => { encoded.push(type); return sized(sizes[type], type); };
  const webp = sized(100, "image/webp");
  // Smaller than the raw source: no extra encodes.
  assert.equal(await mediaSmallerMain(webp, { size: 150, transparent: false, lossless: false }, encoder({})), webp);
  assert.deepEqual(encoded, []);
  // Stripped JPEG < WebP < raw JPEG: the stripped source is the comparison and wins.
  const stripped = sized(30, "image/jpeg");
  assert.equal(await mediaSmallerMain(webp, { size: 150, stripped, transparent: false, lossless: false }, encoder({ "image/jpeg": 60 })), stripped);
  // No eligible source: an opaque JPEG encode at the chosen size.
  assert.equal((await mediaSmallerMain(webp, { size: 80, transparent: false, lossless: false }, encoder({ "image/jpeg": 60 }))).type, "image/jpeg");
  // Resized opaque PNG: lossless PNG < raw source < WebP < JPEG, so PNG wins.
  encoded.length = 0;
  assert.equal((await mediaSmallerMain(webp, { size: 90, transparent: false, lossless: true }, encoder({ "image/jpeg": 120, "image/png": 50 }))).type, "image/png");
  assert.deepEqual(encoded, ["image/jpeg", "image/png"]);
  // Transparent pictures already compared PNG; no JPEG (no transparency) and no second PNG.
  encoded.length = 0;
  assert.equal(await mediaSmallerMain(webp, { size: 80, transparent: true, lossless: true }, encoder({})), webp);
  assert.deepEqual(encoded, []);
  // Every candidate larger: the main stays.
  assert.equal(await mediaSmallerMain(webp, { size: 80, stripped: sized(120, "image/jpeg"), transparent: false, lossless: false }, encoder({ "image/jpeg": 110 })), webp);
  assert.deepEqual(mediaResponsiveWidths(2400), [480, 960, 1600]);
  assert.deepEqual(mediaResponsiveWidths(480), []);
  assert.equal(mediaCopyIsSmaller(new Blob(["a"]), new Blob(["aa"])), true);
  assert.equal(mediaCopyIsSmaller(new Blob(["aa"]), new Blob(["aa"])), false);
});

const ascii = (value: string) => Buffer.from(value, "latin1");
function exif(orientation = 1) {
  const bytes = Buffer.alloc(26); bytes.write("II"); bytes.writeUInt16LE(42, 2); bytes.writeUInt32LE(8, 4);
  bytes.writeUInt16LE(1, 8); bytes.writeUInt16LE(0x112, 10); bytes.writeUInt16LE(3, 12); bytes.writeUInt32LE(1, 14); bytes.writeUInt16LE(orientation, 18);
  return Buffer.concat([ascii("Exif\0\0"), bytes, ascii("GPS camera location")]);
}
function jpegSegment(marker: number, payload: Uint8Array) {
  const header = Buffer.from([255, marker, 0, 0]); header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}
function jpeg(orientation = 1) {
  return Buffer.concat([Buffer.from([255, 216]), jpegSegment(224, ascii("JFIF")), jpegSegment(225, exif(orientation)),
    jpegSegment(225, ascii("XMP GPS")), jpegSegment(237, ascii("IPTC camera")), jpegSegment(254, ascii("comment")),
    jpegSegment(226, ascii("ICC profile")), jpegSegment(238, ascii("Adobe")), jpegSegment(218, new Uint8Array()), Buffer.from([1, 2, 255, 0, 3, 255, 217])]);
}
function pngChunk(type: string, payload = new Uint8Array()) {
  const header = Buffer.alloc(8); header.writeUInt32BE(payload.length); header.write(type, 4);
  return Buffer.concat([header, payload, Buffer.alloc(4)]);
}
function png(chunks: Buffer[] = []) {
  return Buffer.concat([ascii("\x89PNG\r\n\x1a\n"), pngChunk("IHDR", new Uint8Array(13)), ...chunks, pngChunk("IDAT"), pngChunk("IEND")]);
}
function webpChunk(type: string, payload = new Uint8Array()) {
  const header = Buffer.alloc(8); header.write(type); header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, Buffer.alloc(payload.length % 2)]);
}
function webp(chunks: Buffer[]) {
  const result = Buffer.concat([ascii("RIFF\0\0\0\0WEBP"), ...chunks]); result.writeUInt32LE(result.length - 8, 4); return result;
}
test("JPEG strips EXIF GPS, XMP, IPTC and comments, preserves colour segments and scan bytes", () => {
  const bytes = jpeg(), stripped = stripJpegMetadata(bytes)!;
  assert.ok(stripped);
  const value = Buffer.from(stripped).toString("latin1");
  for (const privateText of ["Exif", "GPS", "XMP", "IPTC", "comment", "camera"]) assert.ok(!value.includes(privateText));
  for (const kept of ["JFIF", "ICC profile", "Adobe"]) assert.ok(value.includes(kept));
  assert.deepEqual([...stripped.slice(-7)], [1, 2, 255, 0, 3, 255, 217]);
  assert.equal(stripJpegMetadata(jpeg(6)), undefined);
  assert.equal(strippedImageSource(bytes, "image/jpeg", false), undefined);
  assert.deepEqual(strippedImageSource(bytes, "image/jpeg", true), stripped);
});
test("PNG strips personal chunks, retains ICC; malformed or rotated source is ineligible", () => {
  const chunks = [pngChunk("eXIf", exif().subarray(6)), ...["tEXt", "zTXt", "iTXt", "tIME"].map(type => pngChunk(type, ascii("GPS camera"))), pngChunk("iCCP", ascii("ICC profile"))];
  const bytes = png(chunks), stripped = stripPngMetadata(bytes)!;
  assert.ok(stripped); const value = Buffer.from(stripped).toString("latin1");
  for (const type of ["eXIf", "tEXt", "zTXt", "iTXt", "tIME", "GPS"]) assert.ok(!value.includes(type));
  assert.ok(value.includes("ICC profile"));
  assert.equal(stripPngMetadata(png([pngChunk("eXIf", exif(8).subarray(6))])), undefined);
  assert.deepEqual(strippedImageSource(bytes, "image/png", true), stripped);
});
test("WebP removes EXIF and XMP, clears flags and repairs RIFF size, preserves ICC and pixels", () => {
  const bytes = webp([webpChunk("VP8X", Uint8Array.from([0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0])), webpChunk("ICCP", ascii("ICC")), webpChunk("VP8 ", ascii("pixels")), webpChunk("EXIF", exif()), webpChunk("XMP ", ascii("GPS"))]);
  const stripped = stripWebpMetadata(bytes)!; assert.ok(stripped);
  const value = Buffer.from(stripped).toString("latin1");
  assert.ok(!value.includes("EXIF")); assert.ok(!value.includes("XMP ")); assert.ok(!value.includes("GPS"));
  assert.ok(value.includes("ICC")); assert.ok(value.includes("pixels")); assert.equal(stripped[20], 0x20);
  assert.equal(new DataView(stripped.buffer, stripped.byteOffset).getUint32(4, true), stripped.length - 8);
  assert.equal(stripWebpMetadata(webp([webpChunk("VP8 "), webpChunk("EXIF", exif(3))])), undefined);
  assert.deepEqual(strippedImageSource(bytes, "image/webp", true), stripped);
  assert.equal(strippedImageSource(bytes, "image/avif", true), undefined);
});
test("invalid or truncated source is never eligible for metadata stripping", () => {
  for (const [strip, valid] of [[stripJpegMetadata, jpeg()], [stripPngMetadata, png()], [stripWebpMetadata, webp([webpChunk("VP8 ")])]] as const) {
    assert.equal(strip(ascii("invalid")), undefined);
    assert.equal(strip(valid.subarray(0, valid.length - 1)), undefined);
  }
});
test("animation detection walks GIF blocks and checks APNG and WebP container flags", () => {
  const header = ascii("GIF89a\x01\0\x01\0\0\0\0"), frame = Buffer.from([44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 44, 44, 0]);
  const extension = Buffer.from([33, 254, 3, 44, 44, 44, 0]);
  const still = Buffer.concat([header, extension, frame, Buffer.from([59])]);
  const animated = Buffer.concat([header, extension, frame, frame, Buffer.from([59])]);
  assert.equal(gifIsAnimated(still), false); assert.equal(gifIsAnimated(animated), true);
  assert.equal(mediaUntouched("animated.gif", animated), true); assert.equal(mediaUntouched("still.gif", still), false);
  assert.equal(gifIsAnimated(animated.subarray(0, 15)), false);
  assert.equal(pngIsAnimated(png()), false); assert.equal(pngIsAnimated(png([pngChunk("acTL", new Uint8Array(8))])), true);
  assert.equal(webpIsAnimated(webp([webpChunk("VP8 ")])), false);
  assert.equal(webpIsAnimated(webp([webpChunk("ANIM", new Uint8Array(6))])), true);
  assert.equal(webpIsAnimated(webp([webpChunk("VP8X", Uint8Array.from([2, 0, 0, 0, 0, 0, 0, 0, 0, 0]))])), true);
  assert.equal(pngIsAnimated(ascii("acTL")), false); assert.equal(webpIsAnimated(ascii("ANIM")), false);
});

test("worker encodes only needed fallbacks, keeps copies in the chosen format, and falls back from AVIF", async () => {
  const names = ["self", "OffscreenCanvas", "createImageBitmap"];
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  let transparent = false, mainSize = 80, pngSize = 40, jpegSize = 50, closed = 0;
  const calls: { width: number; type: string; quality?: number }[] = [];
  let result: import("../src/page-builder/media-optimise").MediaOptimiseResult | undefined;
  const scope = {
    onmessage: undefined as undefined | ((event: { data: { file: File; options: import("../src/page-builder/media-optimise").MediaOptimiseOptions } }) => Promise<void>),
    postMessage(value: { result?: typeof result; error?: string }) { assert.equal(value.error, undefined); result = value.result; },
  };
  class Canvas {
    constructor(readonly width: number, readonly height: number) {}
    getContext() { return { drawImage() {}, getImageData() { return { data: Uint8Array.from([0, 0, 0, transparent ? 128 : 255]) }; } }; }
    async convertToBlob(options: { type: string; quality?: number }) {
      calls.push({ width: this.width, ...options });
      const size = this.width === 2000 ? options.type === "image/png" ? pngSize : options.type === "image/jpeg" ? jpegSize : mainSize : this.width === 960 ? 200 : 20;
      return new Blob([new Uint8Array(size)], { type: options.type === "image/avif" ? "image/png" : options.type });
    }
  }
  Object.defineProperty(globalThis, "self", { configurable: true, value: scope });
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: Canvas });
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: async () => ({ width: 2000, height: 1000, close() { closed++; } }) });
  try {
    await import("../src/page-builder/image-optimise.worker");
    const run = async (file = new File([new Uint8Array(100)], "photo.jpg"), options = mediaImageRecipe()): Promise<import("../src/page-builder/media-optimise").MediaOptimiseResult> => {
      calls.length = 0; result = undefined;
      await scope.onmessage!({ data: { file, options } });
      assert.ok(result); return result;
    };
    const ordinary = await run();
    assert.deepEqual(ordinary.outputs.map(output => output.variantWidth), [undefined, 480, 1600]);
    assert.ok(calls.every(call => call.type === "image/webp" && call.quality === 0.8));
    mainSize = 120;
    const jpegFallback = await run();
    assert.ok(jpegFallback.outputs.every(output => output.extension === "jpg"));
    assert.deepEqual(calls.map(call => call.type), ["image/webp", "image/jpeg", "image/jpeg", "image/jpeg", "image/jpeg"]);
    transparent = true;
    const pngFallback = await run(undefined, mediaImageRecipe("smallest"));
    assert.equal(pngFallback.outputs[0].blob.size, 40);
    assert.ok(pngFallback.outputs.every(output => output.extension === "png"));
    assert.equal(calls[0].type, "image/webp"); assert.equal(calls[0].quality, 0.8);
    assert.ok(calls.every(call => call.type !== "image/avif" && call.type !== "image/jpeg"));
    transparent = false; mainSize = 80;
    const unavailable = await run(undefined, mediaImageRecipe("smallest"));
    assert.match(unavailable.note!, /AVIF is not available yet/);
    assert.equal(calls[0].type, "image/avif");
    assert.ok(calls.slice(1).every(call => call.type === "image/webp" && call.quality === 0.8));
    mainSize = 1000; jpegSize = 500;
    const source = await run(new File([jpeg()], "source.jpg"));
    assert.equal(source.outputs[0].extension, "jpg");
    assert.deepEqual(new Uint8Array(await source.outputs[0].blob.arrayBuffer()), stripJpegMetadata(jpeg()));
    assert.ok(source.outputs.slice(1).every(output => output.blob.type === "image/jpeg"));
    assert.equal(closed, 5);
  } finally {
    names.forEach((name, index) => { const descriptor = descriptors[index]; if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  }
});
