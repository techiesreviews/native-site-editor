import assert from "node:assert/strict";
import test from "node:test";
import { blobOfDataUrl } from "../src/data-url-blob";
import { dataUrlOf } from "../src/native-assets";

test("a data address turns back into its bytes, base64 or written out, non-Latin text included (TOOLS-185)", async () => {
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>€ Привет 日本 🎂</text></svg>";
  const written = blobOfDataUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)!;
  assert.equal(written.type, "image/svg+xml");
  assert.equal(await written.text(), svg);
  const bytes = new Uint8Array([0, 1, 127, 128, 200, 255]);
  const base64 = blobOfDataUrl(await dataUrlOf(new Blob([bytes]), "image/png"))!;
  assert.equal(base64.type, "image/png");
  assert.deepEqual(new Uint8Array(await base64.arrayBuffer()), bytes);
  assert.equal(blobOfDataUrl("images/a.png"), undefined);
  assert.equal(blobOfDataUrl("data:image/png;base64"), undefined);
});
