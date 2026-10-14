const text = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const join = (parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
};

/** Unknown or malformed orientation cannot safely lose its metadata. */
function upright(bytes: Uint8Array): boolean {
  if (text(bytes, 0, 6) === "Exif\0\0") bytes = bytes.subarray(6);
  if (bytes.length < 8) return false;
  const little = text(bytes, 0, 2) === "II", data = view(bytes);
  if (!little && text(bytes, 0, 2) !== "MM") return false;
  if (data.getUint16(2, little) !== 42) return false;
  const offset = data.getUint32(4, little);
  if (offset < 8 || offset + 2 > bytes.length) return false;
  const count = data.getUint16(offset, little);
  if (offset + 2 + count * 12 + 4 > bytes.length) return false;
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    if (data.getUint16(entry, little) !== 0x112) continue;
    if (data.getUint16(entry + 2, little) !== 3 || data.getUint32(entry + 4, little) !== 1 || data.getUint16(entry + 8, little) !== 1) return false;
  }
  return true;
}

export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | undefined {
  if (bytes[0] !== 255 || bytes[1] !== 216) return;
  const parts = [bytes.subarray(0, 2)], data = view(bytes);
  let offset = 2, image = false;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 255) return;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217) return image && offset === bytes.length ? join([...parts, bytes.subarray(start, offset)]) : undefined;
    if (marker === undefined || marker === 0 || marker === 216 || offset + 2 > bytes.length) return;
    const length = data.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) return;
    const end = offset + length;
    if (marker === 225 && text(bytes, offset + 2, 6) === "Exif\0\0" && !upright(bytes.subarray(offset + 2, end))) return;
    if (![225, 237, 254].includes(marker)) parts.push(bytes.subarray(start, end));
    offset = end;
    if (marker !== 218) continue;
    image = true;
    const scan = offset;
    while (offset < bytes.length) {
      if (bytes[offset] !== 255) { offset++; continue; }
      const next = bytes[offset + 1];
      if (next === 0 || next !== undefined && next >= 208 && next <= 215) { offset += 2; continue; }
      break;
    }
    parts.push(bytes.subarray(scan, offset));
  }
}

function pngChunks(bytes: Uint8Array) {
  if (text(bytes, 0, 8) !== "\x89PNG\r\n\x1a\n") return;
  const chunks: { type: string; start: number; end: number }[] = [], data = view(bytes);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = data.getUint32(offset), end = offset + length + 12;
    if (end > bytes.length) return;
    const type = text(bytes, offset + 4, 4);
    chunks.push({ type, start: offset, end }); offset = end;
    if (type === "IEND") return length === 0 && end === bytes.length && chunks[0]?.type === "IHDR" ? chunks : undefined;
  }
}
export function stripPngMetadata(bytes: Uint8Array): Uint8Array | undefined {
  const chunks = pngChunks(bytes);
  if (!chunks || chunks.some(chunk => chunk.type === "eXIf" && !upright(bytes.subarray(chunk.start + 8, chunk.end - 4)))) return;
  return join([bytes.subarray(0, 8), ...chunks.filter(chunk => !["eXIf", "tEXt", "zTXt", "iTXt", "tIME"].includes(chunk.type)).map(chunk => bytes.subarray(chunk.start, chunk.end))]);
}
function webpChunks(bytes: Uint8Array) {
  if (text(bytes, 0, 4) !== "RIFF" || text(bytes, 8, 4) !== "WEBP" || bytes.length < 12 || view(bytes).getUint32(4, true) !== bytes.length - 8) return;
  const chunks: { type: string; start: number; end: number; length: number }[] = [], data = view(bytes);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = data.getUint32(offset + 4, true), end = offset + 8 + length + (length % 2);
    if (end > bytes.length) return;
    const type = text(bytes, offset, 4);
    if (type === "VP8X" && length !== 10) return;
    chunks.push({ type, start: offset, end, length }); offset = end;
  }
  return offset === bytes.length ? chunks : undefined;
}
export function stripWebpMetadata(bytes: Uint8Array): Uint8Array | undefined {
  const chunks = webpChunks(bytes);
  if (!chunks || !chunks.some(chunk => ["VP8 ", "VP8L"].includes(chunk.type)) || chunks.some(chunk => chunk.type === "EXIF" && !upright(bytes.subarray(chunk.start + 8, chunk.start + 8 + chunk.length)))) return;
  const parts = chunks.filter(chunk => !["EXIF", "XMP "].includes(chunk.type)).map(chunk => {
    const part = bytes.slice(chunk.start, chunk.end);
    if (chunk.type === "VP8X") part[8] &= ~0x0c;
    return part;
  });
  const result = join([bytes.subarray(0, 12), ...parts]); view(result).setUint32(4, result.length - 8, true);
  return result;
}
export function strippedImageSource(bytes: Uint8Array, type: string, sameDimensions: boolean) {
  if (!sameDimensions) return;
  if (type === "image/jpeg") return stripJpegMetadata(bytes);
  if (type === "image/png") return stripPngMetadata(bytes);
  if (type === "image/webp") return stripWebpMetadata(bytes);
}
export function pngIsAnimated(bytes: Uint8Array) { return pngChunks(bytes)?.some(chunk => chunk.type === "acTL") ?? false; }
export function webpIsAnimated(bytes: Uint8Array) {
  return webpChunks(bytes)?.some(chunk => chunk.type === "ANIM" || chunk.type === "VP8X" && !!(bytes[chunk.start + 8] & 2)) ?? false;
}
export function gifIsAnimated(bytes: Uint8Array) {
  if (!["GIF87a", "GIF89a"].includes(text(bytes, 0, 6)) || bytes.length < 13) return false;
  let offset = 13 + (bytes[10] & 128 ? 3 * (2 ** ((bytes[10] & 7) + 1)) : 0), images = 0;
  const skip = () => {
    while (offset < bytes.length) {
      const length = bytes[offset++];
      if (!length) return true;
      offset += length;
    }
    return false;
  };
  while (offset < bytes.length) {
    const block = bytes[offset++];
    if (block === 59) return images > 1;
    if (block === 33) { offset++; if (!skip()) return false; }
    else if (block === 44) {
      if (offset + 9 > bytes.length) return false;
      const packed = bytes[offset + 8]; offset += 9;
      if (packed & 128) offset += 3 * (2 ** ((packed & 7) + 1));
      offset++;
      if (!skip()) return false;
      if (++images > 1) return true;
    } else return false;
  }
  return false;
}
