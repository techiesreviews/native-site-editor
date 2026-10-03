import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MEDIA_OPTIMISE, mediaChooseEncoding, mediaDimensions, mediaResponsiveWidths, mediaSavings, mediaUntouched, optimiseMedia, validateMediaOptimiseOptions } from "../src/page-builder/media-optimise";

test("optimisation retains aspect ratio, never upscales, and picks only smaller transparent PNG", () => {
  assert.deepEqual(mediaDimensions(4000, 3000, 2400), { width: 2400, height: 1800 });
  assert.deepEqual(mediaDimensions(100, 50, 2400), { width: 100, height: 50 });
  assert.deepEqual(mediaResponsiveWidths(1600), [480, 960]);
  const webp = new Blob(["large"]), png = new Blob(["a"]);
  assert.equal(mediaChooseEncoding(webp, png), png); assert.equal(mediaChooseEncoding(png, webp), png);
  assert.equal(mediaSavings(100, 60), 40); assert.equal(mediaSavings(100, 120), -20);
  assert.equal(mediaUntouched("animated.GIF"), true); assert.equal(mediaUntouched("logo.svg"), true);
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
