// Takes the picture of a mock-up that the mock-ups page (vite-mockups.ts) shows once its feature is released
// (label Live or On preview): `docs/wayfinder/<map>/prototypes/agreed/<name>.webp`, the page as it opens, 1280 × 800,
// light, scaled to 480 × 300. The picture is committed, so it keeps the mock-up as it was when released, whatever the file becomes later.
//
//   node scripts/mockup-pictures.mjs                  every released mock-up that has no picture yet
//   node scripts/mockup-pictures.mjs <map>/<file>…    those mock-ups, replacing a picture that exists
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { buildTickets, isReleased, mockupFiles, mockupPicturePath, mockupShipping } from "../vite-mockups.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = mockupFiles(root).filter(({ file }) => file.endsWith(".html"));
const shipping = mockupShipping(files, buildTickets(root, files));
const named = process.argv.slice(2);
const wanted = files.filter(({ map, file }) => named.length
  ? named.includes(`${map}/${file}`)
  : isReleased(shipping.get(`${map}/${file}`)?.label) && !mockupPicturePath(root, { map, file }).exists);
for (const name of named) if (!files.some(({ map, file }) => `${map}/${file}` === name)) throw new Error(`No mock-up named ${name}`);

const browser = await chromium.launch();
try {
  for (const mockup of wanted) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block" });
    try {
      const page = await context.newPage();
      await page.goto(pathToFileURL(mockup.path).href, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      // Entrance animations and the first module imports (some mock-ups load Yjs from esm.sh) settle after load.
      await page.waitForTimeout(500);
      const png = (await page.screenshot()).toString("base64");
      const encoder = await context.newPage();
      const webp = await encoder.evaluate(async source => {
        const image = new Image();
        image.src = `data:image/png;base64,${source}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 300;
        const drawing = canvas.getContext("2d");
        drawing.imageSmoothingQuality = "high";
        drawing.drawImage(image, 0, 0, 480, 300);
        return canvas.toDataURL("image/webp", 0.8).split(",")[1];
      }, png);
      const { path } = mockupPicturePath(root, mockup);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, Buffer.from(webp, "base64"));
      console.log(`picture: ${mockup.map}/${mockup.file}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(`RESULT: ok pictures ${wanted.length}`);
