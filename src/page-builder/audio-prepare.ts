import { MAX_UPLOAD_BYTES } from "../uploads";
import type { MediaAddingChoices } from "./media-settings";
import type { MediaOptimiseResult } from "./media-optimise";

export type AudioQuality = MediaAddingChoices["audio"];
export interface AudioFacts {
  codec: string | null; bitrate?: number; channels: number; size: number; container: string; duration?: number;
}

/** Codec and measured container, never the incoming extension, establish the retention exception. */
export function audioPlan(facts: AudioFacts, quality: AudioQuality, cap: number) {
  const bitrate = facts.bitrate && Number.isFinite(facts.bitrate) && facts.bitrate > 0
    ? facts.bitrate : facts.duration && Number.isFinite(facts.duration) && facts.duration > 0 ? facts.size * 8 / facts.duration : undefined;
  const codec = facts.codec?.toLowerCase() ?? "";
  if ((codec === "mp3" || codec === "aac" || codec.startsWith("mp4a.40."))
    && /^(mp3|mp4|m4a|adts|aac)$/i.test(facts.container)
    && bitrate !== undefined && bitrate < 160_000 && facts.size <= cap) return { kind: "keep" } as const;
  return { kind: "convert", bitrate: { balanced: 96_000, higher: 128_000, speech: 64_000 }[quality],
    channels: quality === "speech" ? 1 : Math.min(2, Math.max(1, facts.channels)) } as const;
}

export interface AudioPrepareDeps {
  mediabunny?: () => Promise<typeof import("mediabunny")>;
  /** Future registration point for a WASM AAC encoder; no fallback is bundled today. */
  aacFallback?: () => Promise<boolean>;
}

export async function prepareAudio(file: File, quality: AudioQuality, signal?: AbortSignal,
  deps: AudioPrepareDeps = {}): Promise<MediaOptimiseResult | undefined> {
  signal?.throwIfAborted();
  const bunny = await (deps.mediabunny ?? (() => import("mediabunny")))();
  signal?.throwIfAborted();
  const input = new bunny.Input({ source: new bunny.BlobSource(file), formats: bunny.ALL_FORMATS });
  let conversion: Awaited<ReturnType<typeof bunny.Conversion.init>> | undefined;
  const abort = () => { void conversion?.cancel().catch(() => {}); input.dispose(); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("No audio track could be read.");
    const [codec, channels, sampleRate, duration, stats, container] = await Promise.all([
      track.getCodec(), track.getNumberOfChannels(), track.getSampleRate(), track.computeDuration(),
      track.computePacketStats(), input.getFormat(),
    ]);
    signal?.throwIfAborted();
    const plan = audioPlan({ codec, channels, bitrate: stats.averageBitrate, duration, container: container.name, size: file.size }, quality, MAX_UPLOAD_BYTES);
    if (plan.kind === "keep") return;
    const options = { numberOfChannels: plan.channels, sampleRate: [44100, 48000].includes(sampleRate) ? sampleRate : 48000, bitrate: plan.bitrate };
    if (!await bunny.canEncodeAudio("aac", options) && !await deps.aacFallback?.()) throw new Error("AAC encoding is unavailable in this browser.");
    signal?.throwIfAborted();
    const target = new bunny.BufferTarget();
    const output = new bunny.Output({ format: new bunny.Mp4OutputFormat(), target });
    // Conversion copies track labels separately from tags; this input belongs only to this preparation.
    track.getName = async () => null;
    // Keep original is deliberately not applied to audio in this slice.
    conversion = await bunny.Conversion.init({ input, output, tracks: "primary", video: { discard: true },
      audio: { codec: "aac", ...options, forceTranscode: true }, tags: {} });
    if (signal?.aborted) { await conversion.cancel(); signal.throwIfAborted(); }
    if (!conversion.isValid) throw new Error("The audio could not be converted.");
    await conversion.execute();
    signal?.throwIfAborted();
    if (!target.buffer) throw new Error("No audio was encoded.");
    const blob = new Blob([target.buffer], { type: "audio/mp4" });
    return { outputs: [{ blob, extension: "m4a" }], before: file.size, after: blob.size };
  } finally {
    signal?.removeEventListener("abort", abort);
    input.dispose();
  }
}
