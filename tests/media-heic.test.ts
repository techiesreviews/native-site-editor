import assert from "node:assert/strict";
import { test } from "node:test";
import { isHeic, decodeMediaBitmap, heicFailureMessage } from "../src/page-builder/media-heic";
import { preparationFailure } from "../src/page-builder/media-limits";
import { prepareMediaFile } from "../src/page-builder/media-prepare";
import { mediaAddingPath } from "../src/page-builder/media-adding-rules";
function ftyp(major: string, ...compatible: string[]) {
  const bytes = Buffer.alloc(16 + compatible.length * 4);
  bytes.writeUInt32BE(bytes.length); bytes.write("ftyp", 4); bytes.write(major, 8);
  compatible.forEach((value, index) => bytes.write(value, 16 + index * 4));
  return bytes;
}
test("HEIC detection separates HEIC brands and generic HEIF from AVIF", () => {
  for (const brand of ["heic", "heix", "hevc", "hevx", "heim", "heis"]) assert.equal(isHeic("", "", ftyp(brand)), true);
  assert.equal(isHeic("", "", ftyp("mif1", "heic")), true);
  assert.equal(isHeic("", "", ftyp("msf1", "heix")), true);
  for (const brands of [["mif1"], ["mif1", "avif"], ["mif1", "heic", "avis"], ["avif", "heic"]]) assert.equal(isHeic("", "", ftyp(brands[0], ...brands.slice(1))), false);
  assert.equal(isHeic("photo.jpg", "image/jpeg", new Uint8Array([255, 216])), false);
  assert.equal(isHeic("photo.HEIF", "", new Uint8Array()), true);
  assert.equal(isHeic("", "image/heic-sequence", new Uint8Array()), true);
  assert.equal(isHeic("", "", ftyp("heic").subarray(0, 10)), false);
  assert.equal(mediaAddingPath("photo.heic"), "media/images/photo.webp");
  assert.equal(mediaAddingPath("Logo.SVG"), "media/images/logo.svg");
});
test("native success never loads HEIC decoder; non-HEIC native failure never loads it", async () => {
  const bitmap = { width: 2, height: 1, close() {} } satisfies Pick<ImageBitmap, "width" | "height" | "close">;
  let loads = 0;
  const load = async () => { loads++; throw new Error("unavailable"); };
  // Deliberate fake bitmap: this pure decision rule never uses browser-only bitmap methods.
  const native = async () => bitmap as ImageBitmap;
  assert.equal(await decodeMediaBitmap(new File(["x"], "photo.heic"), new Uint8Array(), native, load), bitmap);
  assert.equal(loads, 0);
  const fail = async () => { throw new Error("native decode failed"); };
  await assert.rejects(decodeMediaBitmap(new File(["x"], "photo.jpg"), new Uint8Array(), fail, load), /native decode failed/);
  assert.equal(loads, 0);
  await assert.rejects(decodeMediaBitmap(new File(["x"], "photo.heic"), new Uint8Array(), fail, load), { message: heicFailureMessage("photo.heic") });
  assert.equal(loads, 1);
  await assert.rejects(decodeMediaBitmap(new File(["x"], "photo.heic"), new Uint8Array(), fail, async () => async () => { throw new Error("bad picture"); }), /cannot open HEIC/);
});
test("HEIC preparation failure gives conversion advice and never offers unchanged bytes", async () => {
  for (const name of ["photo.heic", "photo.heif"]) {
    const file = new File(["x"], name);
    assert.deepEqual(preparationFailure(file, new Uint8Array(), true), { kind: "advice", message: heicFailureMessage(name) });
    await assert.rejects(prepareMediaFile(file, "repo", undefined, undefined, async () => { throw new Error("decode"); }, async () => { assert.fail("must never ask"); }), /cannot open HEIC/);
  }
});
