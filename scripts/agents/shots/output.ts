import type { Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { nextEncoding, type Encoding } from "./core";

/** Encode only inside Chromium; callers receive bytes, never log image data. */
export async function smallWebp(page: Page, png: Buffer, limit: number) {
  const source = `data:image/png;base64,${png.toString("base64")}`;
  const dimensions = await page.evaluate(async source => {
    const image = new Image();
    image.src = source;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, source);
  // WebP's format limit is 16383 pixels on either axis, even when a PNG fits.
  const scale = Math.min(1, 16000 / dimensions.width, 16000 / dimensions.height);
  let encoding: Encoding | null = { width: Math.max(1, Math.floor(dimensions.width * scale)), height: Math.max(1, Math.floor(dimensions.height * scale)), quality: 85 };
  while (encoding) {
    const base64 = await page.evaluate(async ({ source, encoding }) => {
      const image = new Image(); image.src = source; await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = encoding.width; canvas.height = encoding.height;
      canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/webp", encoding.quality / 100);
      if (!url.startsWith("data:image/webp;base64,")) throw new Error("Chromium WebP encoding unavailable");
      return url.split(",")[1];
    }, { source, encoding });
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length < limit) return bytes;
    encoding = nextEncoding(encoding);
  }
  throw new Error(`Cannot encode WebP below ${limit} bytes`);
}

export async function writeIndex(path: string, index: object) {
  await writeFile(path, `${JSON.stringify(index, null, 2)}\n`);
}
