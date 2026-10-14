import type { MediaOptimiseResult, MediaOutput } from "./media-optimise";
import { createMediaEncoder } from "./media-encoders";
import { preparationFailure } from "./media-limits";

export type VideoQuality = "smaller" | "balanced" | "higher";
export function videoTargetSize(quality: VideoQuality, width: number, height: number) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error("Video dimensions must be positive finite numbers.");
  const long = quality === "smaller" ? 1280 : 1920, short = quality === "smaller" ? 720 : 1080;
  const scale = quality === "higher" ? 1 : Math.min(1, (width >= height ? long : short) / width, (width >= height ? short : long) / height);
  return { width: Math.max(2, Math.floor(width * scale / 2) * 2), height: Math.max(2, Math.floor(height * scale / 2) * 2) };
}
type Bunny = typeof import("mediabunny");
export const loadVideoTools = () => import("mediabunny");
interface GifDecoder {
  completed: Promise<void>;
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }>;
  close(): void;
}
export interface VideoPrepareDeps {
  load(): Promise<Bunny>;
  canvas(width: number, height: number): OffscreenCanvas;
  encode: ReturnType<typeof createMediaEncoder>;
  gif?: (file: File) => Promise<GifDecoder>;
  supported(): boolean;
}
/** Browsers play GIF delays of 10 ms or less (and missing ones) at 100 ms; the video keeps that pace. */
export const gifFrameSeconds = (microseconds: number | null | undefined) => (microseconds && microseconds > 10_000 ? microseconds : 100_000) / 1_000_000;
class GifDecodingUnavailable extends Error {}
const defaults: VideoPrepareDeps = {
  load: loadVideoTools, canvas: (width, height) => new OffscreenCanvas(width, height),
  encode: createMediaEncoder(), supported: () => typeof VideoEncoder !== "undefined",
  gif: async file => {
    const Decoder = (globalThis as typeof globalThis & { ImageDecoder?: new (options: { data: ArrayBuffer; type: string }) => GifDecoder }).ImageDecoder;
    if (!Decoder) throw new GifDecodingUnavailable("GIF decoding is unavailable.");
    return new Decoder({ data: await file.arrayBuffer(), type: "image/gif" });
  },
};
const cancelled = () => new DOMException("Video preparation cancelled.", "AbortError");
function unchanged(file: File, gif: boolean): MediaOptimiseResult {
  const failure = preparationFailure(file, new Uint8Array(), true);
  if (failure.kind === "advice") throw new Error(failure.message);
  return { outputs: [{ blob: file, extension: file.name.split(".").pop()!.toLowerCase() }], before: file.size, after: file.size,
    // The browser-cannot-encode exception (research 02): no question, but never silent.
    note: gif ? `This browser cannot turn animated GIFs into videos, so ${file.name} was added as it is.`
      : `This browser cannot prepare videos, so ${file.name} was added as it is.` };
}
async function still(canvas: OffscreenCanvas, deps: VideoPrepareDeps): Promise<MediaOutput> {
  const blob = await deps.encode(canvas, "image/webp", 80);
  if (blob.type !== "image/webp") throw new Error("The video still could not be prepared as WebP.");
  return { blob, extension: "webp", width: canvas.width, height: canvas.height };
}
/** Imported only when adding a video or animated GIF; WebCodecs and codecs never enter boot. */
export async function prepareVideo(file: File, quality: VideoQuality = "balanced", signal?: AbortSignal, gif = false,
  deps: VideoPrepareDeps = defaults): Promise<MediaOptimiseResult> {
  signal?.throwIfAborted();
  if (!deps.supported()) return unchanged(file, gif);
  const bunny = await deps.load();
  signal?.throwIfAborted();
  const encodingQuality = quality === "higher" ? bunny.QUALITY_HIGH : bunny.QUALITY_MEDIUM;
  if (gif) return prepareGif(file, quality, signal, deps, bunny, encodingQuality);
  const input = new bunny.Input({ source: new bunny.BlobSource(file), formats: bunny.ALL_FORMATS });
  let conversion: Awaited<ReturnType<Bunny["Conversion"]["init"]>> | undefined;
  const abort = () => { void conversion?.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track was found.");
    const size = videoTargetSize(quality, await track.getDisplayWidth(), await track.getDisplayHeight());
    signal?.throwIfAborted();
    const supported = await bunny.canEncodeVideo("avc", { ...size, quality: encodingQuality });
    signal?.throwIfAborted();
    if (!supported) return unchanged(file, false);
    const target = new bunny.BufferTarget(), output = new bunny.Output({ format: new bunny.Mp4OutputFormat(), target });
    const audio = await input.getAudioTracks();
    const encodeAudio = audio.length > 0 && await bunny.canEncodeAudio("aac");
    if (!encodeAudio && (await Promise.all(audio.map(track => track.getCodec()))).some(codec => codec !== "aac")) throw new Error("This browser cannot keep the sound in this video.");
    conversion = await bunny.Conversion.init({ input, output, tags: () => ({}), showWarnings: false,
      video: { ...size, fit: "fill", codec: "avc", quality: encodingQuality, forceTranscode: true, allowTransformationMetadata: false },
      audio: encodeAudio ? { codec: "aac", quality: new bunny.Quality({ bitrate: 128_000 }), forceTranscode: true } : {} });
    if (signal?.aborted) { await conversion.cancel(); throw cancelled(); }
    if (!conversion.isValid || conversion.discardedTracks.length) throw new Error("This browser could not keep every video and sound track.");
    await conversion.execute();
    signal?.throwIfAborted();
    const start = Math.max(0, await track.getFirstTimestamp()), duration = Math.max(0, await track.computeDuration() - start);
    const frame = await new bunny.CanvasSink(track, { ...size, fit: "fill" }).getCanvas(start + (duration < 2 ? duration / 2 : 1));
    if (!frame) throw new Error("The video still could not be decoded.");
    const canvas = deps.canvas(size.width, size.height);
    canvas.getContext("2d")!.drawImage(frame.canvas, 0, 0, size.width, size.height);
    const picture = await still(canvas, deps);
    signal?.throwIfAborted();
    const blob = new Blob([target.buffer!], { type: "video/mp4" });
    return { outputs: [{ blob, extension: "mp4", ...size }], still: picture, duration, before: file.size, after: blob.size };
  } catch (error) {
    if (conversion) await conversion.cancel();
    if (signal?.aborted) throw cancelled();
    throw error;
  } finally { signal?.removeEventListener("abort", abort); input.dispose(); }
}
async function prepareGif(file: File, quality: VideoQuality, signal: AbortSignal | undefined, deps: VideoPrepareDeps, bunny: Bunny, encodingQuality: typeof bunny.QUALITY_MEDIUM) {
  let decoder: GifDecoder;
  try { if (!deps.gif) return unchanged(file, true); decoder = await deps.gif(file); }
  catch (error) { signal?.throwIfAborted(); if (error instanceof GifDecodingUnavailable) return unchanged(file, true); throw error; }
  let output: InstanceType<Bunny["Output"]> | undefined;
  const abort = () => { void output?.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await decoder.completed;
    await decoder.tracks.ready;
    const count = decoder.tracks.selectedTrack?.frameCount ?? 0;
    if (!count) throw new Error("No GIF frames were found.");
    let canvas: OffscreenCanvas | undefined, source: InstanceType<Bunny["CanvasSource"]> | undefined, picture: MediaOutput | undefined;
    const target = new bunny.BufferTarget();
    let timestamp = 0;
    for (let index = 0; index < count; index++) {
      signal?.throwIfAborted();
      const { image } = await decoder.decode({ frameIndex: index });
      try {
        if (!canvas) {
          const size = videoTargetSize(quality, image.displayWidth, image.displayHeight);
          const supported = await bunny.canEncodeVideo("avc", { ...size, quality: encodingQuality });
          signal?.throwIfAborted();
          if (!supported) return unchanged(file, true);
          canvas = deps.canvas(size.width, size.height);
          source = new bunny.CanvasSource(canvas, { codec: "avc", quality: encodingQuality });
          output = new bunny.Output({ format: new bunny.Mp4OutputFormat(), target });
          output.addVideoTrack(source);
          await output.start();
        }
        // Each decoded GIF frame is whole; H.264 has no transparency, so clear areas show white, not black or the last frame.
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        if (index === 0) picture = await still(canvas, deps);
        const duration = gifFrameSeconds(image.duration);
        await source!.add(timestamp, duration); timestamp += duration;
      } finally { image.close(); }
    }
    source!.close(); await output!.finalize(); signal?.throwIfAborted();
    const blob = new Blob([target.buffer!], { type: "video/mp4" });
    return { outputs: [{ blob, extension: "mp4", width: canvas!.width, height: canvas!.height }], still: picture, fromGif: true as const, duration: timestamp, before: file.size, after: blob.size };
  } catch (error) { await output?.cancel(); if (signal?.aborted) throw cancelled(); throw error; }
  finally { signal?.removeEventListener("abort", abort); decoder.close(); }
}
