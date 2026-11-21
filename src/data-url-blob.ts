// A data URL back to its bytes (TOOLS-185: a guest's upload). Its own module so the guest bar does not tie
// src/native-assets.ts, which the first screen loads, to the guest code.

/** A data URL's bytes, base64 or written out (as UTF-8); nothing when `url` is not one. */
export function blobOfDataUrl(url: string): Blob | undefined {
  const comma = url.indexOf(","), head = url.slice(0, comma);
  if (!url.startsWith("data:") || comma < 0) return undefined;
  const type = /^data:([^;,]*)/.exec(head)?.[1] ?? "", body = url.slice(comma + 1);
  const bytes = head.endsWith(";base64") ? Uint8Array.from(atob(body), (char) => char.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(body));
  return new Blob([bytes], { type });
}
