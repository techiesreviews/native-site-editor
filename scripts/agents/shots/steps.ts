import { expect, type Locator, type Page } from "@playwright/test";
import { parseStep, type Edge } from "./core";
import { smallWebp } from "./output";

/** Receives a `record` step's frames; capture saves them as one strip image. */
type Recorder = (name: string, frames: Buffer[]) => Promise<void>;

const stripFrames = 8;
const expectTimeout = 5_000;

export async function runStep(page: Page, source: string, record?: Recorder) {
  const step = parseStep(source);
  const named = (name: string) => page.getByRole("button", { name })
    .or(page.getByRole("tab", { name, exact: true }))
    .or(page.getByRole("menuitem", { name, exact: true }))
    .or(page.getByRole("menuitemradio", { name, exact: true }))
    .or(page.getByRole("link", { name, exact: true }));
  switch (step.kind) {
    case "click": await named(step.name).click(); return;
    case "type": {
      const field = step.label === "search" ? page.getByRole("searchbox") : page.getByLabel(step.label, { exact: true });
      await field.fill(step.text); return;
    }
    case "hover": {
      const tiles = page.locator(".media-library__card");
      const target = typeof step.target === "string" ? named(step.target) : step.target === -1 ? tiles.last() : tiles.nth(step.target);
      await target.hover(); return;
    }
    case "press": await page.keyboard.press(step.key); return;
    case "scroll": {
      // Scroll the pane under the pointer, including an explorer phone sheet.
      const panel = page.getByRole("region", { name: "Media", exact: true });
      if (await panel.isVisible()) await panel.hover();
      await page.mouse.wheel(0, step.direction === "down" ? 600 : -600); return;
    }
    case "wait": await expect(page.getByText(step.text, { exact: true }).first()).toBeVisible(); return;
    case "drag": {
      // Rows and plain text can be dragged as well as named controls.
      const draggable = (name: string) => named(name).or(page.getByRole("treeitem", { name, exact: true })).or(page.getByText(name, { exact: true })).first();
      const from = await point(draggable(step.name), step.name);
      const to = await point(draggable(step.target), step.target, step.edge);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      // Small moves first so drag thresholds start the drag before the pointer travels.
      await page.mouse.move(from.x + 4, from.y + 4, { steps: 2 });
      await page.mouse.move(to.x, to.y, { steps: 12 });
      await page.mouse.up();
      return;
    }
    case "record": {
      const frames: Buffer[] = [];
      const start = Date.now();
      for (let frame = 0; frame < stripFrames; frame++) {
        const wait = start + frame * step.ms / (stripFrames - 1) - Date.now();
        if (wait > 0) await page.waitForTimeout(wait);
        frames.push(await page.screenshot({ animations: "allow", scale: "css" }));
      }
      await record?.(step.name, frames);
      return;
    }
    case "expect":
      try { await expect(page.getByText(step.text).or(page.getByRole("button", { name: step.text })).first()).toBeVisible({ timeout: expectTimeout }); }
      catch { throw new Error(`expect visible "${step.text}" failed: nothing visible says "${step.text}"`); }
  }
}

/** A point 3 px inside the named edge, or the centre. */
async function point(target: Locator, name: string, edge?: Edge) {
  try { await target.scrollIntoViewIfNeeded({ timeout: expectTimeout }); }
  catch { throw new Error(`drag failed: nothing visible named "${name}"`); }
  const box = await target.boundingBox();
  if (!box) throw new Error(`drag failed: "${name}" has no box`);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const inset = (size: number) => Math.min(3, size / 4);
  if (edge === "top") return { x, y: box.y + inset(box.height) };
  if (edge === "bottom") return { x, y: box.y + box.height - inset(box.height) };
  if (edge === "left") return { x: box.x + inset(box.width), y };
  if (edge === "right") return { x: box.x + box.width - inset(box.width), y };
  return { x, y };
}

/** Lay recorded frames out four to a row, numbered, as one WebP of at most 300 KB. */
export async function frameStrip(encoder: Page, frames: Buffer[]) {
  const png = await encoder.evaluate(async sources => {
    const images = await Promise.all(sources.map(async source => {
      const image = new Image();
      image.src = source;
      await image.decode();
      return image;
    }));
    const columns = Math.min(4, images.length), rows = Math.ceil(images.length / columns);
    const width = Math.min(400, images[0].naturalWidth), height = Math.round(images[0].naturalHeight * width / images[0].naturalWidth);
    const gap = 4;
    const canvas = document.createElement("canvas");
    canvas.width = columns * width + (columns - 1) * gap;
    canvas.height = rows * height + (rows - 1) * gap;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "oklch(0.5 0 0)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = "bold 16px system-ui";
    images.forEach((image, index) => {
      const x = (index % columns) * (width + gap), y = Math.floor(index / columns) * (height + gap);
      context.drawImage(image, x, y, width, height);
      context.fillStyle = "oklch(0.2 0 0)";
      context.fillRect(x, y, 28, 24);
      context.fillStyle = "oklch(1 0 0)";
      context.fillText(String(index + 1), x + 8, y + 18);
    });
    return canvas.toDataURL("image/png").split(",")[1];
  }, frames.map(frame => `data:image/png;base64,${frame.toString("base64")}`));
  return smallWebp(encoder, Buffer.from(png, "base64"), 300_001, true);
}
