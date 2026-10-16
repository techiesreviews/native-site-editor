import { heicImageTypes, heicImages } from "../../shared/media-kinds-policies";
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis"]);
/** Generic HEIF brands alone also describe AVIF, so inspect compatible brands. */
export function isHeic(name: string, type: string, bytes: Uint8Array): boolean {
  if (heicImages.test(name) || heicImageTypes.test(type)) return true;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const brand = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset);
    if (size < 8 || offset + size > bytes.length) return false;
    if (brand(offset + 4) === "ftyp") {
      if (size < 16) return false;
      const major = brand(offset + 8);
      if (HEIC_BRANDS.has(major)) return true;
      const compatible: string[] = [];
      for (let at = offset + 16; at + 4 <= offset + size; at += 4) compatible.push(brand(at));
      return ["mif1", "msf1"].includes(major) && compatible.some(value => HEIC_BRANDS.has(value))
        && !compatible.some(value => value === "avif" || value === "avis");
    }
    offset += size;
  }
  return false;
}
export const heicFailureMessage = (name: string) => `${name} could not be prepared. This browser cannot open HEIC photos. Save it as JPEG and add it again.`;

/** Native decoding wins; only a failed HEIC decode downloads the fallback. */
export async function decodeMediaBitmap(file: File, bytes: Uint8Array,
  native: (source: File | ImageData) => Promise<ImageBitmap>,
  load: () => Promise<(bytes: Uint8Array) => Promise<ImageData>>): Promise<ImageBitmap> {
  try { return await native(file); }
  catch (error) {
    if (!isHeic(file.name, file.type, bytes)) throw error;
    try { return await native(await (await load())(bytes)); }
    catch { throw new Error(heicFailureMessage(file.name)); }
  }
}
