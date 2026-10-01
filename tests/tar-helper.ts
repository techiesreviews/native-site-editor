// A tiny ustar writer for tests: GitHub's tarballs are one top-level
// `<owner>-<repo>-<sha>/` folder holding the repository's files.
import { gzipSync } from "node:zlib";

const encoder = new TextEncoder();

/** One tar entry: a 512-byte header, then the body padded to 512. */
export function tarEntry(name: string, body: Uint8Array | string = "", type = "0", sizeField?: string): Uint8Array[] {
  const bytes = typeof body === "string" ? encoder.encode(body) : body;
  const header = new Uint8Array(512);
  const put = (text: string, at: number) => header.set(encoder.encode(text), at);
  put(name, 0);
  put("0000644\0", 100);
  put("0000000\0", 108);
  put("0000000\0", 116);
  put(sizeField ?? bytes.length.toString(8).padStart(11, "0") + "\0", 124);
  put("00000000000\0", 136);
  put("        ", 148);
  put(type, 156);
  put("ustar\0" + "00", 257);
  const sum = header.reduce((total, byte) => total + byte, 0);
  put(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  const padded = new Uint8Array(Math.ceil(bytes.length / 512) * 512);
  padded.set(bytes);
  return [header, padded];
}

export function tar(entries: Uint8Array[][]): Uint8Array {
  const parts = [...entries.flat(), new Uint8Array(1024)];
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** A gzipped tarball of `files` under one top folder, as codeload serves it. */
export function tarball(files: Record<string, string | Uint8Array>, top = "techiesreviews-native-site-editor-starter-abc123"): Uint8Array {
  return gzipSync(
    tar([
      tarEntry("pax_global_header", "52 comment=abc\n", "g"),
      tarEntry(`${top}/`, "", "5"),
      ...Object.entries(files).map(([path, body]) => tarEntry(`${top}/${path}`, body)),
    ]),
  );
}
