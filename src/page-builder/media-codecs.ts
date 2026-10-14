/** Each codec stays behind a worker-only import and can be replaced in worker tests. */
export type HeicDecoder = (bytes: Uint8Array) => Promise<ImageData>;
/** No HEIC decoder ships yet (its licence and HEVC patent question await a decision): browsers that cannot open
 * HEIC themselves give the HEIC advice. The decoder, when approved, plugs in here. */
export const loadHeicDecoder = async (): Promise<HeicDecoder> => { throw new Error("The HEIC decoder is not available."); };
export const loadPngSqueezer = async () => (await import("./media-png")).squeezePng;
export const loadSvgCleaner = async () => await import("./media-svg");
export type MediaCodecs = {
  loadHeicDecoder: typeof loadHeicDecoder;
  loadPngSqueezer: typeof loadPngSqueezer;
  loadSvgCleaner: typeof loadSvgCleaner;
};
