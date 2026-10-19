import type { Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { contactSheets, initialEncoding, nextEncoding, type Encoding, type Shot } from "./core";

/** Encode only inside Chromium; callers receive bytes, never log image data. */
export async function smallWebp(page: Page, png: Buffer, limit: number, contact = false) {
  const source = `data:image/png;base64,${png.toString("base64")}`;
  const dimensions = await page.evaluate(async source => {
    const image = new Image();
    image.src = source;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, source);
  // WebP's format limit is 16383 pixels on either axis; sheets have stricter bounds.
  let encoding: Encoding | null = initialEncoding(dimensions.width, dimensions.height, contact);
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

/** Render every bounded sheet with the same geometry used by the pure layout tests. */
export async function writeContacts(page: Page, shots: Shot[], out: string) {
  const files: { path: string; bytes: number }[] = [];
  for (const sheet of contactSheets(shots)) {
    const htmlPath = sheet.path.replace(/\.webp$/, ".html");
    await writeFile(join(out, htmlPath), sheet.html);
    files.push({ path: htmlPath, bytes: Buffer.byteLength(sheet.html) });
    await page.setViewportSize({ width: sheet.width, height: sheet.height });
    await page.goto(pathToFileURL(join(out, htmlPath)).href);
    await page.evaluate(() => document.fonts.ready.then(() => {}));
    await page.locator("img").evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
    const webp = await smallWebp(page, await page.screenshot({ animations: "disabled" }), 300_001, true);
    await writeFile(join(out, sheet.path), webp);
    files.push({ path: sheet.path, bytes: webp.length });
  }
  return files;
}
