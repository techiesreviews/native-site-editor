import { test } from "node:test";
import assert from "node:assert/strict";
import { placeMediaPath } from "../src/page-builder/media-page-markup.ts";
import type { MediaControllerPorts } from "../src/controllers/media-controller.ts";
import type { MediaPathPlacement } from "../src/page-builder/media-picker.ts";
import type { Stamp } from "../src/guarded-edit.ts";
import type { MediaImage } from "../src/page-builder/media-markup.ts";

// A picked image whose place changed while it was prepared: the placement is refused with the
// reason as the error the picker reports, never as a second message in the status line (no toast).
// The fixture names only what the placement reads of a picked image.
const image = { path: "images/a.webp", width: 10, height: 10 } as MediaImage;
const placement = (stale?: string) => ({ path: "components/site-card/site-card.html", source: "before", ...stale ? { stale } : {}, edit: (address: string) => `<img src="${address}">` }) satisfies MediaPathPlacement;

async function place(current: string, stale?: string, holds = [true, true]) {
  const said: string[] = [], resolved: unknown[] = [];
  const checks = [...holds];
  // Only the two ports a refused placement reaches.
  const ports = { source: () => current, announce: (text: string) => { said.push(text); } } satisfies Partial<MediaControllerPorts> as MediaControllerPorts;
  const stamp: Stamp = { holds: () => checks.length > 1 ? checks.shift()! : checks[0] ?? true };
  const error = await placeMediaPath(ports, stamp, placement(stale), image, () => false, undefined, value => resolved.push(value), async () => { throw new Error("no workspace"); })
    .then(() => undefined, (thrown: Error) => thrown.message);
  return { error, said, resolved };
}

test("a place that changed before the image was prepared is refused with the reason as the error, said nowhere else", async () => {
  assert.deepEqual(await place("after"), { error: "The image place changed.", said: [], resolved: [] });
  assert.deepEqual(await place("after", "The slot changed meanwhile."), { error: "The slot changed meanwhile.", said: [], resolved: [] });
});

test("a place that changed while the picture was prepared is refused the same way", async () => {
  // The stamp holds at the start and fails at the second look: the repository moved on meanwhile.
  const out = await place("before", undefined, [true, true, false]);
  assert.deepEqual(out, { error: "The image place changed.", said: [], resolved: [] });
});
