import { test } from "node:test";
import assert from "node:assert/strict";
import { createMediaEncoder, mediaEncoderFor, type MediaEncoderLoaders } from "../src/page-builder/media-encoders";

function fixture(nativeType = "image/webp", failure?: "load" | "encode") {
  const native: string[] = [], encoded: { quality: number; speed?: number }[] = [];
  const loaded = { webp: 0, avif: 0 };
  const pixels = { data: new Uint8ClampedArray([10, 20, 30, 255]), width: 1, height: 1, colorSpace: "srgb" } satisfies ImageData;
  const canvas = {
    width: 1, height: 1,
    // Deliberately provide only the 2D methods the encoder uses.
    getContext: () => ({ getImageData: () => pixels }) as OffscreenCanvasRenderingContext2D,
    convertToBlob: async ({ type }: ImageEncodeOptions) => {
      native.push(type!);
      return new Blob(["native"], { type: type === "image/webp" ? nativeType : type });
    },
  } satisfies Parameters<ReturnType<typeof createMediaEncoder>>[0];
  const loaders = {
    webp: async () => {
      loaded.webp++;
      if (failure === "load") throw new Error("download failed");
      return async (data, options) => {
        assert.equal(data, pixels); encoded.push(options);
        if (failure === "encode") throw new Error("encoding failed");
        return new ArrayBuffer(2);
      };
    },
    avif: async () => {
      loaded.avif++;
      if (failure === "load") throw new Error("download failed");
      return async (data, options) => {
        assert.equal(data, pixels); encoded.push(options);
        if (failure === "encode") throw new Error("encoding failed");
        return new ArrayBuffer(3);
      };
    },
  } satisfies MediaEncoderLoaders;
  return { canvas, loaded, native, encoded, encode: createMediaEncoder(loaders) };
}

test("encoder choice follows the requested format and native WebP result", () => {
  assert.equal(mediaEncoderFor("image/webp", "image/png"), "webp-wasm");
  assert.equal(mediaEncoderFor("image/webp", "image/webp"), "native");
  assert.equal(mediaEncoderFor("image/avif", "image/avif"), "avif-wasm");
  assert.equal(mediaEncoderFor("image/png", "image/png"), "native");
  assert.equal(mediaEncoderFor("image/jpeg", "image/jpeg"), "native");
});

test("Safari checks native WebP once, loads once, and reuses the encoder for copies", async () => {
  const f = fixture("image/png");
  for (let copy = 0; copy < 4; copy++) assert.equal((await f.encode(f.canvas, "image/webp", 70)).type, "image/webp");
  assert.deepEqual(f.native, ["image/webp"]);
  assert.deepEqual(f.loaded, { webp: 1, avif: 0 });
  assert.deepEqual(f.encoded, Array.from({ length: 4 }, () => ({ quality: 70 })));
});

test("AVIF always uses WASM with the recipe quality and speed, cached for copies", async () => {
  const f = fixture();
  for (let copy = 0; copy < 4; copy++) assert.equal((await f.encode(f.canvas, "image/avif", 50, 8)).type, "image/avif");
  assert.deepEqual(f.native, []);
  assert.deepEqual(f.loaded, { webp: 0, avif: 1 });
  assert.deepEqual(f.encoded, Array.from({ length: 4 }, () => ({ quality: 50, speed: 8 })));
  await f.encode(f.canvas, "image/avif", 61, 6);
  assert.deepEqual(f.encoded.at(-1), { quality: 61, speed: 6 });
});

test("native WebP, PNG and JPEG never load either encoder", async () => {
  const f = fixture();
  for (const type of ["image/webp", "image/png", "image/jpeg"]) assert.equal((await f.encode(f.canvas, type, 90)).type, type);
  assert.deepEqual(f.loaded, { webp: 0, avif: 0 });
  assert.deepEqual(f.encoded, []);
});

for (const failure of ["load", "encode"] as const) {
  test(`failed WebP ${failure} keeps native PNG, notes the fallback, and never repeats the WebP check`, async () => {
    const f = fixture("image/png", failure), notes: string[] = [];
    for (let copy = 0; copy < 2; copy++) assert.equal((await f.encode(f.canvas, "image/webp", 80, undefined, text => notes.push(text))).type, "image/png");
    assert.deepEqual(f.native, ["image/webp", "image/png"]);
    assert.deepEqual(f.loaded, { webp: 1, avif: 0 });
    assert.ok(notes.every(text => text === "WebP could not be used in this browser. Used PNG instead."));
    assert.equal(notes.length, 2);
  });
  test(`failed AVIF ${failure} uses Balanced WebP with a plain note`, async () => {
    const f = fixture("image/webp", failure), notes: string[] = [];
    assert.equal((await f.encode(f.canvas, "image/avif", 50, 8, text => notes.push(text))).type, "image/webp");
    assert.deepEqual(f.native, ["image/webp"]);
    assert.deepEqual(f.loaded, { webp: 0, avif: 1 });
    assert.deepEqual(notes, ["Smallest files (slower) could not be used in this browser. Used Balanced WebP instead."]);
  });
}
