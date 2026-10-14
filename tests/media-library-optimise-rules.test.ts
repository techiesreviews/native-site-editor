import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMediaImportRequests, mediaOptimiseStart } from "../src/page-builder/media-library-optimise-rules";
import type { MediaOptimiseResult } from "../src/page-builder/media-optimise";
import type { MediaImportRequest } from "../src/page-builder/media-picker";
import type { MediaMetadataMap } from "../src/page-builder/media-metadata";

const file = new File(["original"], "photos/sub/portrait.png", { type: "image/png" });
const result = {
  outputs: [{ blob: new Blob(["copy"], { type: "image/webp" }), extension: "webp" }],
  before: 8, after: 4,
} satisfies MediaOptimiseResult;
const prepared = [{ file, result }] satisfies Pick<MediaImportRequest, "file" | "result">[];
const metadata = { [file.name]: { alt: "Portrait", tags: ["people"], decorative: false } } satisfies MediaMetadataMap;
const receipts = new Map([[file.name, "receipt-version"]]);

test("new uploads trim destination slashes and omit existing-file metadata and replacement", () => {
  const requests = buildMediaImportRequests(prepared, false, " ///uploads/sub/// ", metadata, true, receipts);
  assert.deepEqual(requests, [{
    file, result, folder: "uploads/sub", metadata: undefined, replaceFrom: undefined,
    expectedAssetVersion: "receipt-version",
  }]);
  assert.equal(buildMediaImportRequests(prepared, false, " / ", {}, false, new Map())[0].folder, "");
});

test("existing images use their original folder, metadata and preview receipt", () => {
  const [request] = buildMediaImportRequests(prepared, true, "ignored/../destination", metadata, true, receipts);
  assert.deepEqual(request, {
    file, result, folder: "photos/sub", metadata: metadata[file.name], replaceFrom: file.name,
    expectedAssetVersion: "receipt-version",
  });
  assert.equal(buildMediaImportRequests(prepared, true, "ignored", metadata, false, receipts)[0].replaceFrom, undefined);
  const root = [{ file: new File(["root"], "root.png"), result }] satisfies Pick<MediaImportRequest, "file" | "result">[];
  assert.deepEqual(buildMediaImportRequests(root, true, "ignored", metadata, true, new Map()), [{
    ...root[0], folder: "", metadata: undefined, replaceFrom: "root.png", expectedAssetVersion: undefined,
  }]);
});

test("imports refuse dot segments and backslashes in destination or existing-file folders", () => {
  for (const destination of [".", "..", "photos/./sub", "photos/../sub", "photos\\sub"])
    assert.throws(() => buildMediaImportRequests(prepared, false, destination, {}, false, receipts),
      { message: "Choose a repository folder without . or .. segments." });
  for (const name of ["./image.png", "../image.png", "photos/../image.png", "photos\\sub/image.png"]) {
    const files = [{ file: new File(["invalid"], name), result }] satisfies Pick<MediaImportRequest, "file" | "result">[];
    assert.throws(() => buildMediaImportRequests(files, true, "images", {}, false, new Map()));
  }
  assert.deepEqual(buildMediaImportRequests([], false, "..", {}, false, receipts), []);
});

test("new files join the viewed collection; existing files and All collections join none", () => {
  assert.equal(buildMediaImportRequests(prepared, false, "images", metadata, true, new Map(), "Studio picks")[0].collection, "Studio picks");
  assert.equal("collection" in buildMediaImportRequests(prepared, false, "images", metadata, true, new Map(), "")[0], false);
  assert.equal("collection" in buildMediaImportRequests(prepared, true, "images", metadata, true, receipts, "Studio picks")[0], false);
});

test("the Optimise sheet starts from the site's Adding settings, not stored browser defaults", () => {
  assert.deepEqual(mediaOptimiseStart(undefined), { maxWidth: 2400, quality: 80, format: "webp", responsive: true, keepOriginal: false });
  assert.deepEqual(mediaOptimiseStart({ image: "higher", keepOriginal: true }), { maxWidth: null, quality: 90, format: "webp", responsive: true, keepOriginal: true });
  assert.deepEqual(mediaOptimiseStart({ image: "smallest" }), { maxWidth: 2400, quality: 50, format: "avif", speed: 8, responsive: true, keepOriginal: false });
  assert.deepEqual(mediaOptimiseStart({ image: "smaller", video: "higher", audio: "speech" }), { maxWidth: 1600, quality: 70, format: "webp", responsive: true, keepOriginal: false });
});
