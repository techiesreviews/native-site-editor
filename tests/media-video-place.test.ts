import { test } from "node:test";
import assert from "node:assert/strict";
import { createVideoPlaces, type VideoPlacePorts } from "../src/page-builder/media-video-place";
import type { MediaWorkspaceBatch, MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import type { MediaImage } from "../src/page-builder/media-markup";
import { elementEnd, startTags } from "../shared/html-source";

const page = '<html><head><link rel="stylesheet" href="/styles/media-player.css"><script type="module" src="/scripts/media-player.js"></script></head><body>\n<section>\n  <h2>Hi</h2>\n</section>\n</body></html>';
const player = ["styles/media-player.css", "scripts/media-player.js", "scripts/media-online.js"];

/** A background chosen in the picker; `between` runs while the media records are read. */
async function chooseBackground(between: (assets: Map<string, string>) => void) {
  const assets = new Map([["media/clip.mp4", "sha-1"]]), batches: MediaWorkspaceBatch[] = [], errors: unknown[] = [];
  // eslint-disable-next-line no-restricted-syntax -- background placement reads only these; the rest of a context is the browser's media workspace
  const ctx = {
    paths: ["index.html", ...player, ...assets.keys()], assertLive() {},
    assetVersion: (path: string) => assets.get(path),
    read: async () => { between(assets); return undefined; },
    applyBatch: async (batch: MediaWorkspaceBatch) => { batches.push(batch); },
  } as unknown as MediaWorkspaceContext;
  const ports: VideoPlacePorts = {
    stamp: () => ({ holds: () => true }) as ReturnType<VideoPlacePorts["stamp"]>, generation: () => 1, source: () => page, viewingVersion: () => false,
    openFile: () => "index.html",
    locateElement: (source: string) => { const tags = startTags(source); return elementEnd(source, tags, tags.findIndex(tag => tag.name === "section"), source.length); },
    restoreFile: async () => undefined, error: (error: unknown) => { errors.push(error); }, announce() {},
  };
  let picked: Promise<void> | undefined;
  const load = async () => ({ openMediaPicker: async (options: { onPick?: (image: MediaImage, cancelled: () => boolean) => void | Promise<void> }) => {
    picked = Promise.resolve(options.onPick!({ path: "media/clip.mp4", alt: "" }, () => false));
  } });
  const places = createVideoPlaces(ports, async () => ctx, load);
  await places.chooseBackground({ path: "index.html", node: [1, 0] }, page);
  const outcome = await picked!.then(() => undefined, (error: unknown) => error);
  return { batches, outcome, errors };
}

test("a background video removed while it is being placed is refused; nothing is written", async () => {
  const { batches, outcome } = await chooseBackground(assets => assets.delete("media/clip.mp4"));
  assert.match(String(outcome), /changed while it was being placed/);
  assert.equal(batches.length, 0);
});

test("a background video replaced at the same path while placing is refused", async () => {
  const { batches, outcome } = await chooseBackground(assets => assets.set("media/clip.mp4", "sha-2"));
  assert.match(String(outcome), /changed while it was being placed/);
  assert.equal(batches.length, 0);
});

test("an unchanged background video is placed in one batch that guards its revision", async () => {
  const { batches, outcome } = await chooseBackground(() => {});
  assert.equal(outcome, undefined);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].label, "Background video set");
  assert.equal(batches[0].expectedAssets.get("media/clip.mp4"), "sha-1");
  assert.match(batches[0].edits.get("index.html")!, /<section>\n  <video data-background src="\/media\/clip.mp4" muted loop playsinline preload="none"><\/video>\n  <h2>/);
});
