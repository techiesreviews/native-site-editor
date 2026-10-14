import { test } from "node:test";
import assert from "node:assert/strict";
import { trimPlace, type PlaceTrimPorts } from "../src/page-builder/place-trim";
import type { MediaWorkspaceContext } from "../src/page-builder/media-workspace";

// The trim is cut from the revision the popup showed: a changed or missing original refuses
// before any bytes are read or prepared, and nothing is written.
test("a trim refuses when the original changed since the popup read it, or is not in the site", async () => {
  const page = '<img src="/media/images/desk.webp">';
  let reads = 0, announced = 0;
  const ports = {
    source: () => page, openFile: () => "index.html", restoreFile: async () => undefined,
    measureImage: async () => undefined, announce: () => { announced++; },
  } satisfies PlaceTrimPorts;
  const versions: Record<string, string> = { "media/images/desk.webp": "sha-new" };
  const ctx = {
    assertLive: () => {}, assetVersion: (path: string) => versions[path],
    blob: async () => { reads++; return new Blob(); }, read: async () => { reads++; return undefined; },
  };
  // eslint-disable-next-line no-restricted-syntax -- trimPlace refuses before it uses more of the context than these four members.
  const context = async () => ctx as unknown as MediaWorkspaceContext;
  const proof = { stamp: { holds: () => true, changed: () => undefined }, epoch: 1, source: page, expected: page };
  const target = { path: "index.html", node: [0] };
  const trim = { x: 0, y: 0, width: 0.5, height: 1 };
  await assert.rejects(trimPlace(ports, context, target, { source: "media/images/desk.webp", sourceVersion: "sha-old", trim }, proof, () => true),
    /media\/images\/desk\.webp changed while it was being trimmed\. Nothing was saved\./);
  await assert.rejects(trimPlace(ports, context, target, { source: "media/images/gone.webp", sourceVersion: undefined, trim }, proof, () => true),
    /is not in the site/);
  assert.equal(reads, 0);
  assert.equal(announced, 0);
});
