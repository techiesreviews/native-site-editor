import { prepareAudio, type AudioQuality } from "./audio-prepare";

// Mediabunny stays in this worker's own bundle: on the page it would reshape the boot chunks.
self.onmessage = async (event: MessageEvent<{ file: File; quality: AudioQuality }>) => {
  try {
    self.postMessage({ result: await prepareAudio(event.data.file, event.data.quality) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "The audio could not be prepared." });
  }
};
