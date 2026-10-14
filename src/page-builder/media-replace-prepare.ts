import type { AddingSettings } from "../../shared/media-records";
import { uploadImageType } from "../uploads";
import { mediaFamilyOf } from "./media-families";
import { prepareMediaFile } from "./media-prepare";
import { mediaAddingSettings } from "./media-settings";

/** Shared lazy preparation for File details and agents choosing a picture already in Media. */
export async function prepareMediaReplacement(input: {
  path: string; paths: string[]; key: string; adding?: Partial<AddingSettings>;
  blob(path: string): Promise<Blob>;
  ask: NonNullable<Parameters<typeof prepareMediaFile>[5]>;
  assertLive?(): void;
}) {
  const { path, paths, key, ask } = input;
  const name = path.split("/").pop()!;
  const data = await input.blob(path); input.assertLive?.();
  const { image, video, keepOriginal } = mediaAddingSettings(input.adding);
  const { request, warning } = await prepareMediaFile(new File([data], name, { type: data.type || uploadImageType(path) }),
    key, undefined, undefined, undefined, ask, undefined, image, keepOriginal, video);
  input.assertLive?.();
  const main = request.result?.outputs.find(output => output.variantWidth === undefined);
  if (!request.result || !main) throw new Error(`${name} could not be prepared. Choose another picture.`);
  const kept = mediaFamilyOf(path, paths)?.originals[0];
  const original = kept ? { blob: await input.blob(kept), extension: kept.split(".").pop()!.toLowerCase() } : request.original;
  input.assertLive?.();
  return { result: request.result, main, original, warning };
}
