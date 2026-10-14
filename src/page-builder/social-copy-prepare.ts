import type { MediaTrim } from "../../shared/media-records";
import { optimiseMedia } from "./media-optimise";
import { SOCIAL_IMAGE_OPTIONS } from "./social-image";

/** An explicit trim lets the Social popup move the frame without changing the saving API. */
export async function prepareSocialCopy(blob: Blob, name: string, trim?: MediaTrim, signal?: AbortSignal, encode = optimiseMedia) {
  return encode(new File([blob], name, { type: blob.type }), { ...SOCIAL_IMAGE_OPTIONS, sharing: true }, signal, trim);
}
