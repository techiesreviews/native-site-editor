import { test } from "node:test";
import assert from "node:assert/strict";
import { trimPlace } from "../src/page-builder/place-trim";
import type { MediaControllerPorts } from "../src/controllers/media-controller";
import type { MediaWorkspaceContext } from "../src/page-builder/media-workspace";

// The image popup (slice 41) trims the revision its preview showed: a changed or unknown original
// refuses before any bytes are read or prepared, and nothing is written.
test("a popup trim refuses when the original changed since the popup read it, or has no revision", async () => {
  const page = '<img src="/media/images/desk.webp">';
  let reads = 0, announced = 0;
  const ports = {
    source: (path: string) => path === "index.html" ? page : undefined, openFile: () => "index.html", viewingVersion: () => false,
    restoreFile: async () => undefined, measureImage: async () => undefined, announce: () => { announced++; },
    locateElement: () => ({ tag: { name: "img", start: 0, end: page.length } }),
  };
  const ctx = {
    assertLive: () => {}, items: [{ path: "media/images/desk.webp" }], paths: ["index.html", "media/images/desk.webp"],
    assetVersion: (path: string) => path === "media/images/desk.webp" ? "sha-new" : undefined,
    read: async () => undefined, blob: async () => { reads++; return new Blob(); },
  };
  // eslint-disable-next-line no-restricted-syntax -- trimPlace refuses before it uses more of the ports than these.
  const fakePorts = ports as unknown as MediaControllerPorts;
  // eslint-disable-next-line no-restricted-syntax -- trimPlace refuses before it uses more of the context than these.
  const context = async () => ctx as unknown as MediaWorkspaceContext;
  const proof = { stamp: { holds: () => true, changed: () => undefined }, epoch: 1, source: page, expected: page };
  const target = { path: "index.html", node: [0] };
  const trim = { x: 0, y: 0, width: 0.5, height: 1 };
  for (const sourceVersion of ["sha-old", undefined])
    await assert.rejects(trimPlace(fakePorts, context, target, { trim, source: "media/images/desk.webp", sourceVersion }, proof),
      /changed while trimming\. Nothing was saved\./);
  assert.equal(reads, 0);
  assert.equal(announced, 0);
});
