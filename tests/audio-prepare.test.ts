import { test } from "node:test";
import assert from "node:assert/strict";
import { audioPlan, prepareAudio, type AudioFacts, type AudioQuality } from "../src/page-builder/audio-prepare";
import { prepareMediaFile, mediaFileNeedsPreparation } from "../src/page-builder/media-prepare";
import { mediaAddingPath } from "../src/page-builder/media-adding-rules";
import { MAX_UPLOAD_BYTES } from "../src/uploads";

const facts: AudioFacts = { codec: "mp3", bitrate: 159_999, channels: 2, size: 100, container: "mp3" };
test("retention requires MP3/AAC, a web container, strictly below 160k and within the cap", () => {
  for (const quality of ["balanced", "higher", "speech"] as const) {
    for (const [codec, container] of [["mp3", "mp3"], ["aac", "mp4"], ["aac", "m4a"], ["aac", "adts"], ["mp4a.40.5", "mp4"]]) {
      assert.equal(audioPlan({ ...facts, codec, container }, quality, MAX_UPLOAD_BYTES).kind, "keep");
      assert.equal(audioPlan({ ...facts, codec, container, bitrate: 160_000 }, quality, MAX_UPLOAD_BYTES).kind, "convert");
    }
  }
  for (const [codec, container] of [["alac", "m4a"], ["flac", "m4a"], ["pcm-s16", "m4a"], ["opus", "ogg"], ["vorbis", "ogg"], ["pcm", "wav"], ["aac", "matroska"]])
    assert.equal(audioPlan({ ...facts, codec, container }, "balanced", MAX_UPLOAD_BYTES).kind, "convert");
  assert.equal(audioPlan({ ...facts, bitrate: undefined }, "balanced", MAX_UPLOAD_BYTES).kind, "convert");
  assert.equal(audioPlan({ ...facts, bitrate: undefined, duration: 1 }, "balanced", MAX_UPLOAD_BYTES).kind, "keep");
  assert.equal(audioPlan({ ...facts, size: MAX_UPLOAD_BYTES + 1 }, "speech", MAX_UPLOAD_BYTES).kind, "convert");
});
test("explicit recipes preserve mono/stereo, downmix surround; only Speech makes stereo mono", () => {
  for (const [quality, bitrate] of [["balanced", 96_000], ["higher", 128_000], ["speech", 64_000]] as const)
    for (const channels of [1, 2, 6])
      assert.deepEqual(audioPlan({ ...facts, bitrate: 160_000, channels }, quality, MAX_UPLOAD_BYTES),
        { kind: "convert", bitrate, channels: quality === "speech" ? 1 : Math.min(2, channels) });
});

function fake(options: { keep?: boolean; encoder?: boolean; pending?: boolean; sampleRate?: number; channels?: number; size?: number } = {}) {
  let cancelled = 0, disposed = 0, recipe: unknown, reject: ((error: Error) => void) | undefined;
  const target = { buffer: new Uint8Array(options.size ?? 5).buffer };
  const track = {
    getName: async (): Promise<string | null> => "Private recording title",
    getCodec: async () => options.keep ? "mp3" : "pcm-s16",
    getNumberOfChannels: async () => options.channels ?? 2,
    getSampleRate: async () => options.sampleRate ?? 44100,
    computeDuration: async () => 1, computePacketStats: async () => ({ averageBitrate: 128_000 }),
  };
  const module = {
    ALL_FORMATS: [], BlobSource: class {},
    Input: class {
      getPrimaryAudioTrack = async () => track;
      getFormat = async () => ({ name: options.keep ? "MP3" : "WAVE" });
      dispose() { disposed++; }
    },
    BufferTarget: class { buffer = target.buffer; }, Mp4OutputFormat: class {}, Output: class {},
    canEncodeAudio: async () => options.encoder !== false,
    Conversion: { init: async (settings: unknown) => {
      assert.equal(await track.getName(), null);
      recipe = settings;
      return { isValid: true, execute: () => options.pending ? new Promise<void>((_, no) => { reject = no; }) : Promise.resolve(),
        cancel: async () => { cancelled++; reject?.(new DOMException("Cancelled", "AbortError")); } };
    } },
  };
  // Only the Mediabunny surface used by this module is faked; the full package has unrelated APIs.
  // eslint-disable-next-line no-restricted-syntax -- Fake only the Mediabunny APIs used by prepareAudio.
  const mediabunny = async () => module as unknown as typeof import("mediabunny");
  return { deps: { mediabunny }, recipe: () => recipe, cancelled: () => cancelled, disposed: () => disposed };
}

test("fake Mediabunny: keep bypasses encoder; conversions pass recipe, strip tags and cover tracks", async () => {
  const keep = fake({ keep: true, encoder: false });
  assert.equal(await prepareAudio(new File(["mp3"], "small.mp3"), "speech", undefined, keep.deps), undefined);
  assert.equal(keep.disposed(), 1);
  for (const [quality, bitrate] of [["balanced", 96_000], ["higher", 128_000], ["speech", 64_000]] as const) {
    const f = fake({ sampleRate: 22050 });
    const result = await prepareAudio(new File(["wav"], "sound.wav"), quality, undefined, f.deps);
    assert.equal(result?.outputs[0].extension, "m4a"); assert.equal(result?.outputs[0].blob.type, "audio/mp4");
    const recipe = f.recipe() as { audio: unknown; video: unknown; tags: unknown; tracks: string };
    assert.deepEqual(recipe.audio, { codec: "aac", bitrate, numberOfChannels: quality === "speech" ? 1 : 2, sampleRate: 48000, forceTranscode: true });
    assert.deepEqual(recipe.tags, {}); assert.deepEqual(recipe.video, { discard: true }); assert.equal(recipe.tracks, "primary");
    assert.equal(f.disposed(), 1);
  }
});
test("unavailable AAC throws; abort cancels conversion and disposes input", async () => {
  await assert.rejects(prepareAudio(new File(["wav"], "sound.wav"), "balanced", undefined, fake({ encoder: false }).deps), /AAC encoding is unavailable/);
  const f = fake({ pending: true }), work = new AbortController();
  const pending = prepareAudio(new File(["wav"], "sound.wav"), "balanced", work.signal, f.deps);
  // Allow the fake conversion to start; no browser timing is involved.
  while (!f.recipe()) await new Promise(resolve => setImmediate(resolve));
  work.abort();
  await assert.rejects(pending, /Cancelled|abort/i);
  assert.equal(f.cancelled(), 1); assert.ok(f.disposed() > 0);
});

test("shared path sends chosen quality, converts WAV name/folder and checks converted cap", async () => {
  const file = new File(["wav"], "Voice Note.WAV"), seen: AudioQuality[] = [];
  const audio = async (source: File, quality: AudioQuality, signal?: AbortSignal) => {
    seen.push(quality); return prepareAudio(source, quality, signal, fake().deps);
  };
  const prepared = await prepareMediaFile(file, "repo", undefined, undefined, undefined, undefined, undefined, "balanced", true, "balanced", undefined, "speech", { audio });
  assert.deepEqual(seen, ["speech"]); assert.equal(prepared.request.folder, "media/audio");
  assert.equal(prepared.request.result?.outputs[0].extension, "m4a"); assert.equal(prepared.request.original, undefined);
  assert.equal(mediaAddingPath(file.name), "media/audio/voice-note.m4a");
  assert.equal(await mediaFileNeedsPreparation(file), true);
  const huge = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "sound.mp3");
  const shrunk = await prepareMediaFile(huge, "repo", undefined, undefined, undefined, undefined, undefined, "balanced", false, "balanced", undefined, "higher",
    { audio: (source, quality, signal) => prepareAudio(source, quality, signal, fake({ keep: true }).deps) });
  assert.equal(shrunk.request.result?.outputs[0].extension, "m4a");
  await assert.rejects(prepareMediaFile(huge, "repo", undefined, undefined, undefined, undefined, undefined, "balanced", false, "balanced", undefined, "higher",
    { audio: (source, quality, signal) => prepareAudio(source, quality, signal, fake({ keep: true, size: MAX_UPLOAD_BYTES + 1 }).deps) }), /uploads are limited to 20 MB per file/);
});
