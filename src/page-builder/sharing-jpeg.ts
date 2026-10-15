import { startTagAttribute, type StartTag } from "../../shared/html-source";
import { uploadImageType } from "../uploads";
import { decodeHtmlEntities } from "./html-entities";
import type { MediaOptimiseOptions, optimiseMedia } from "./media-optimise";

export const isSharingImage = (name: string) => /^(?:og:image(?::url|:secure_url)?|twitter:image)$/.test(name);
export const sharingJpegPath = (main: string) => main.replace(/\.[^./]+$/, "-sharing.jpg");
export const sharingMetaName = (source: string, tag: StartTag) =>
  decodeHtmlEntities(startTagAttribute(source, tag, "property")?.value ?? startTagAttribute(source, tag, "name")?.value ?? "", true).toLowerCase();

export function sharingImageDetail(name: string, image: { width: number; height: number; type?: string }) {
  if (!/^og:image:(?:type|width|height)$/.test(name)) return undefined;
  return name.endsWith(":type") ? image.type ?? "image/jpeg" : String(name.endsWith(":width") ? image.width : image.height);
}

/** Shared encoding contract; callers own collision checks, savings policy and transaction proofs. */
export async function encodeSharingJpeg(input: {
  blob: Blob; source: string; width: number; height: number; maxWidth: MediaOptimiseOptions["maxWidth"];
  encode: typeof optimiseMedia; signal?: AbortSignal; guard(): void; error: string;
}) {
  const encoded = await input.encode(new File([input.blob], input.source.split("/").at(-1)!, { type: input.blob.type || uploadImageType(input.source) }),
    { maxWidth: input.maxWidth, quality: 82, format: "jpeg", plainJpeg: true, responsive: false, keepOriginal: false }, input.signal);
  input.guard();
  const jpeg = encoded.outputs.find(output => output.variantWidth === undefined);
  if (!jpeg || jpeg.extension !== "jpg" || jpeg.blob.type !== "image/jpeg" || jpeg.width !== input.width || jpeg.height !== input.height)
    throw new Error(input.error);
  return jpeg;
}
