import { test } from "node:test";
import assert from "node:assert/strict";
import { gifFrameSeconds, prepareVideo, videoTargetSize, type VideoPrepareDeps } from "../src/page-builder/video-prepare";

test("preset boxes respect landscape, portrait, square, small and odd display sizes", () => {
  for (const [quality, landscape, portrait, square] of [
    ["smaller", [1280, 720], [720, 1280], [720, 720]],
    ["balanced", [1920, 1080], [1080, 1920], [1080, 1080]],
    ["higher", [3840, 2160], [2160, 3840], [3000, 3000]],
  ] as const) {
    assert.deepEqual(Object.values(videoTargetSize(quality, 3840, 2160)), landscape);
    assert.deepEqual(Object.values(videoTargetSize(quality, 2160, 3840)), portrait);
    assert.deepEqual(Object.values(videoTargetSize(quality, 3000, 3000)), square);
    assert.deepEqual(videoTargetSize(quality, 321, 241), { width: 320, height: 240 });
    assert.deepEqual(videoTargetSize(quality, 1, 1), { width: 2, height: 2 });
  }
  assert.throws(() => videoTargetSize("balanced", NaN, 200));
});
function fake(options: { video?: boolean; audio?: string[]; aac?: boolean; discarded?: boolean; valid?: boolean; wait?: boolean; duration?: number; start?: number } = {}) {
  let conversionOptions: import("mediabunny").ConversionOptions | undefined;
  let canvasTime = -1, cancelled = 0, disposed = 0, decoded = 0, closedFrames = 0, closedDecoder = 0;
  const fills: number[][] = [], frames: number[] = [], encoded: number[] = [], draws: unknown[] = [], encodedFrames: unknown[] = [];
  const track = { getDisplayWidth: async () => 2160, getDisplayHeight: async () => 3840, computeDuration: async () => options.duration ?? 1, getFirstTimestamp: async () => options.start ?? 0 };
  const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: "", fillRect: (..._args: number[]) => fills.push(_args), drawImage: (image: unknown) => draws.push(image) }) };
  const conversion = { isValid: options.valid !== false, discardedTracks: options.discarded ? [{}] : [],
    execute: async () => { if (options.wait) await new Promise<void>(resolve => { release = resolve; }); },
    cancel: async () => { cancelled++; release?.(); } };
  let release: (() => void) | undefined;
  const bunny = {
    QUALITY_MEDIUM: "medium", QUALITY_HIGH: "high", ALL_FORMATS: [],
    Quality: class { constructor(public options: unknown) {} },
    Input: class { getPrimaryVideoTrack = async () => track; getAudioTracks = async () => (options.audio ?? []).map(codec => ({ getCodec: async () => codec })); dispose() { disposed++; } },
    BlobSource: class {}, BufferTarget: class { buffer = new ArrayBuffer(4); }, Mp4OutputFormat: class {},
    Output: class { addVideoTrack() {} async start() {} async finalize() {} async cancel() { cancelled++; } },
    CanvasSource: class { async add(timestamp: number, duration: number) { frames.push(timestamp, duration); } close() {} },
    CanvasSink: class { async getCanvas(time: number) { canvasTime = time; return { canvas }; } },
    Conversion: { init: async (settings: import("mediabunny").ConversionOptions) => { conversionOptions = settings; return conversion; } },
    canEncodeVideo: async () => options.video !== false, canEncodeAudio: async () => options.aac !== false,
  };
  // These fakes implement only the public members exercised by preparation; library classes have private internals.
  const deps: VideoPrepareDeps = {
    // eslint-disable-next-line no-restricted-syntax -- Fake covers public API only; Mediabunny classes have private state.
    load: async () => bunny as unknown as typeof import("mediabunny"), supported: () => true,
    // eslint-disable-next-line no-restricted-syntax -- Node canvas fake implements only drawing used by preparation.
    canvas: (width, height) => { canvas.width = width; canvas.height = height; return canvas as unknown as OffscreenCanvas; },
    encode: async (_canvas, type, quality) => { encoded.push(quality); encodedFrames.push(draws.at(-1)); return new Blob(["still"], { type }); },
    gif: async () => ({ completed: Promise.resolve(), tracks: { ready: Promise.resolve(), selectedTrack: { frameCount: 2 } },
      decode: async ({ frameIndex }) => {
        decoded++;
        // VideoFrame cannot be constructed without WebCodecs in Node.
        // eslint-disable-next-line no-restricted-syntax -- Node has no WebCodecs VideoFrame; fake owns only read properties and close.
        return { image: { displayWidth: 640, displayHeight: 480, duration: 200_000, index: frameIndex, close() { closedFrames++; } } as unknown as VideoFrame };
      }, close() { closedDecoder++; } }),
  };
  return { deps, fills, frames, encoded, draws, encodedFrames, get closedFrames() { return closedFrames; }, get closedDecoder() { return closedDecoder; }, get settings() { return conversionOptions!; }, get canvasTime() { return canvasTime; }, get cancelled() { return cancelled; }, get disposed() { return disposed; }, get decoded() { return decoded; } };
}
const file = (name = "clip.mp4") => new File(["source"], name);
test("rotation uses display size, medium video, middle still, AAC 128 kbps and empty metadata", async () => {
  const f = fake({ audio: ["opus"] });
  const result = await prepareVideo(file(), "balanced", undefined, false, f.deps);
  assert.deepEqual(f.settings.video, { width: 1080, height: 1920, fit: "fill", codec: "avc", quality: "medium", forceTranscode: true, allowTransformationMetadata: false });
  const audio = f.settings.audio as { codec: string; quality: { options: unknown }; forceTranscode: boolean };
  assert.equal(audio.codec, "aac"); assert.equal(audio.forceTranscode, true);
  // Mediabunny refuses a bare number here: the bitrate must be a Quality.
  assert.equal(audio.quality.constructor.name, "Quality"); assert.deepEqual(audio.quality.options, { bitrate: 128_000 });
  const tags = f.settings.tags;
  assert.equal(typeof tags, "function");
  if (typeof tags === "function") assert.deepEqual(await tags({ title: "phone location" }), {});
  assert.equal(f.canvasTime, 0.5); assert.deepEqual(f.encoded, [80]); assert.equal(result.still?.extension, "webp"); assert.equal(f.disposed, 1);
});
test("Higher keeps display resolution with high quality; silence stays silent", async () => {
  const f = fake(); const result = await prepareVideo(file(), "higher", undefined, false, f.deps);
  assert.equal(result.outputs[0].width, 2160); assert.equal(result.outputs[0].height, 3840);
  assert.deepEqual(f.settings.audio, {});
  assert.equal(Array.isArray(f.settings.video), false);
  assert.ok(f.settings.video && typeof f.settings.video === "object" && "quality" in f.settings.video && f.settings.video.quality === "high");
});
test("without AAC encoding existing AAC copies; other sound fails", async () => {
  const f = fake({ audio: ["aac"], aac: false });
  await prepareVideo(file(), "balanced", undefined, false, f.deps); assert.deepEqual(f.settings.audio, {});
  await assert.rejects(prepareVideo(file(), "balanced", undefined, false, fake({ audio: ["opus"], aac: false }).deps), /keep the sound/);
});
test("discarded tracks and invalid conversions fail", async () => {
  for (const options of [{ discarded: true }, { valid: false }]) await assert.rejects(prepareVideo(file(), "balanced", undefined, false, fake(options).deps), /every video and sound/);
});
test("GIF encodes timed silent MP4 with a first-frame WebP and fromGif", async () => {
  const f = fake(); const result = await prepareVideo(file("loop.gif"), "balanced", undefined, true, f.deps);
  assert.equal(result.fromGif, true); assert.equal(result.outputs[0].extension, "mp4"); assert.equal(result.still?.extension, "webp");
  assert.deepEqual(f.frames, [0, 0.2, 0.2, 0.2]); assert.deepEqual(f.encoded, [80]); assert.equal(f.decoded, 2);
  assert.equal(f.settings, undefined);
  assert.equal(f.encodedFrames[0], f.draws[0]); assert.notEqual(f.encodedFrames[0], f.draws[1]);
  assert.equal(f.closedFrames, 2); assert.equal(f.closedDecoder, 1);
  // Each frame is drawn on a cleared white canvas, so transparent GIFs leave no trail of earlier frames.
  assert.deepEqual(f.fills, [[0, 0, 640, 480], [0, 0, 640, 480]]);
});
test("GIF delays of 10 ms or less play at 100 ms, as browsers show them", () => {
  assert.equal(gifFrameSeconds(0), 0.1); assert.equal(gifFrameSeconds(10_000), 0.1); assert.equal(gifFrameSeconds(null), 0.1);
  assert.equal(gifFrameSeconds(20_000), 0.02); assert.equal(gifFrameSeconds(200_000), 0.2);
});
test("unsupported encoding retains suitable bytes with a note, advises MOV; GIF remains GIF", async () => {
  const f = fake({ video: false }), source = file();
  const result = await prepareVideo(source, "balanced", undefined, false, f.deps);
  assert.equal(result.outputs[0].blob, source); assert.match(result.note!, /cannot prepare videos/);
  await assert.rejects(prepareVideo(file("clip.mov"), "balanced", undefined, false, f.deps), /Export it as MP4/);
  const gif = file("loop.gif"), kept = await prepareVideo(gif, "balanced", undefined, true, f.deps);
  assert.equal(kept.outputs[0].blob, gif); assert.match(kept.note!, /cannot turn animated GIFs into videos, so loop\.gif was added as it is/);
  const missing = fake(); missing.deps.gif = undefined;
  const undecoded = await prepareVideo(gif, "balanced", undefined, true, missing.deps);
  assert.equal(undecoded.outputs[0].extension, "gif"); assert.match(undecoded.note!, /animated GIFs/);
  f.deps.supported = () => false;
  assert.equal((await prepareVideo(source, "balanced", undefined, false, f.deps)).outputs[0].blob, source);
  await assert.rejects(prepareVideo(new File([new Uint8Array(20 * 1024 * 1024 + 1)], "big.mp4"), "balanced", undefined, false, f.deps), /limit is 20 MB/);
});
test("cancel stops conversion and throws AbortError", async () => {
  const f = fake({ wait: true }), controller = new AbortController();
  const work = prepareVideo(file(), "balanced", controller.signal, false, f.deps);
  // Wait for the observable conversion execution, rather than an elapsed delay.
  while (!f.settings) await new Promise(resolve => setImmediate(resolve));
  controller.abort(); await assert.rejects(work, { name: "AbortError" }); assert.ok(f.cancelled > 0); assert.equal(f.disposed, 1);
});


test("long clips use one second from their first visible timestamp", async () => {
  const f = fake({ duration: 12, start: 3 });
  await prepareVideo(file(), "balanced", undefined, false, f.deps);
  assert.equal(f.canvasTime, 4);
});
test("GIF cancellation stops output and closes decoder and decoded frames", async () => {
  const f = fake(), controller = new AbortController();
  const encode = f.deps.encode;
  f.deps.encode = async (...args) => { controller.abort(); return encode(...args); };
  await assert.rejects(prepareVideo(file("loop.gif"), "balanced", controller.signal, true, f.deps), { name: "AbortError" });
  assert.ok(f.cancelled > 0); assert.equal(f.closedFrames, 1); assert.equal(f.closedDecoder, 1);
});
test("broken GIF decoding fails rather than taking the unsupported-browser exception", async () => {
  const f = fake(); f.deps.gif = async () => { throw new Error("broken GIF"); };
  await assert.rejects(prepareVideo(file("loop.gif"), "balanced", undefined, true, f.deps), /broken GIF/);
});
