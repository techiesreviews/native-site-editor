import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readMediaOptimiseDefaults, writeMediaOptimiseDefaults, buildMediaImportRequests,
} from "../src/page-builder/media-library-optimise-rules";
import { DEFAULT_MEDIA_OPTIMISE } from "../src/page-builder/media-optimise";
import type { MediaOptimiseOptions, MediaOptimiseResult } from "../src/page-builder/media-optimise";
import type { MediaImportRequest } from "../src/page-builder/media-picker";
import type { MediaMetadataMap } from "../src/page-builder/media-metadata";

function storage(initial: string | null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set("native-site-editor:media-optimise:repo", initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } satisfies Pick<Storage, "getItem" | "setItem">;
}

test("missing and malformed defaults fall back; partial defaults merge", () => {
  for (const value of [null, "{broken", "null"])
    assert.deepEqual(readMediaOptimiseDefaults("repo", () => storage(value)), DEFAULT_MEDIA_OPTIMISE);
  assert.deepEqual(readMediaOptimiseDefaults("repo", () => storage('{"quality":65,"responsive":false}')), {
    ...DEFAULT_MEDIA_OPTIMISE, quality: 65, responsive: false,
  });
});

test("defaults round-trip under the repository-specific storage key", () => {
  const store = storage(null);
  const settings = {
    maxWidth: 1200, quality: 70, format: "png", responsive: false, keepOriginal: true,
  } satisfies MediaOptimiseOptions;
  writeMediaOptimiseDefaults("repo", settings, () => store);
  assert.equal(store.getItem("native-site-editor:media-optimise:repo"), JSON.stringify(settings));
  assert.deepEqual(readMediaOptimiseDefaults("repo", () => store), settings);
  assert.deepEqual(readMediaOptimiseDefaults("other-repo", () => store), DEFAULT_MEDIA_OPTIMISE);
});

test("storage access and methods may throw without preventing optimisation", () => {
  const throwing = {
    getItem: () => { throw new Error("unavailable"); },
    setItem: () => { throw new Error("quota"); },
  } satisfies Pick<Storage, "getItem" | "setItem">;
  const inaccessible = () => { throw new Error("denied"); };
  assert.deepEqual(readMediaOptimiseDefaults("repo", () => throwing), DEFAULT_MEDIA_OPTIMISE);
  assert.deepEqual(readMediaOptimiseDefaults("repo", inaccessible), DEFAULT_MEDIA_OPTIMISE);
  assert.doesNotThrow(() => writeMediaOptimiseDefaults("repo", DEFAULT_MEDIA_OPTIMISE, () => throwing));
  assert.doesNotThrow(() => writeMediaOptimiseDefaults("repo", DEFAULT_MEDIA_OPTIMISE, inaccessible));
});

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
