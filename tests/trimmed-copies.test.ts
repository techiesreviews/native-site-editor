import { test } from "node:test";
import assert from "node:assert/strict";
import { type MediaRecords, type MediaTrim } from "../shared/media-records";
import { isTrim, validTrim, trimGeometry, trimStart, trimmedCopyPath, planTrimmedCopy } from "../src/page-builder/trimmed-copies";
import { prepareTrimmedCopy } from "../src/page-builder/trimmed-copy-prepare";
import { mediaImageRecipe } from "../src/page-builder/media-optimise";

const full: MediaTrim = { x: 0, y: 0, width: 1, height: 1 };
const trim: MediaTrim = { x: .1, y: .2, width: .5, height: .6 };
const source = "images/Studio Lights.jpg", previous = "media/images/studio-lights-crop.webp";
const name = (paths: string[] = [], old?: string) => trimmedCopyPath({ source, extension: "webp", copies: [480, 960], paths, previous: old });

test("trim names tidy the source, use the new folder and reserve the entire family", () => {
  assert.equal(name(), previous);
  assert.equal(trimmedCopyPath({ source, extension: "WEBP", copies: [], paths: [] }), previous);
  assert.equal(name([previous]), "media/images/studio-lights-crop-2.webp");
  for (const conflict of ["media/images/studio-lights-crop-480.webp", "media/images/STUDIO-LIGHTS-CROP.JPG", "media/originals/studio-lights-crop.png"]) {
    assert.equal(name([conflict]), "media/images/studio-lights-crop-2.webp");
  }
  assert.equal(trimmedCopyPath({ source: "media/images/studio-lights.webp", extension: "png", copies: [], paths: [] }), "media/images/studio-lights-crop.png");
  assert.equal(trimmedCopyPath({ source: "images/東京 Tower.JPG", extension: "webp", copies: [], paths: [] }), "media/images/東京-tower-crop.webp");
});
test("every re-trim is fresh even when earlier addresses were removed", () => {
  assert.equal(name([], previous), "media/images/studio-lights-crop-2.webp");
  assert.equal(name([], "media/images/studio-lights-crop-7.jpg"), "media/images/studio-lights-crop-8.webp");
  assert.equal(name(["media/images/studio-lights-crop-8-960.webp"], "media/images/studio-lights-crop-7.webp"), "media/images/studio-lights-crop-9.webp");
  assert.equal(name([], "media/images/other-crop-7.webp"), previous);
  assert.equal(name([], "media/images/studio-lights-crop-19.webp"), "media/images/studio-lights-crop-20.webp");
});
const records: MediaRecords = { version: 2, collections: ["Studio"], files: {
  [source]: { description: { text: "Source", byAgent: true }, alwaysKeep: true, collections: ["Studio"], places: { "index.html": { decorative: true } } },
  [previous]: { trimmedFrom: { source, trim }, description: { text: "Previous", byAgent: true }, decorative: true, collections: ["Studio"], places: { "index.html": { agentText: "Own" } } },
  "media/images/studio-lights-crop-480.webp": { description: { text: "Small" } },
} };
test("re-trimming restores the full source and earlier rectangle, or treats an orphan as original", () => {
  assert.deepEqual(trimStart(records, previous, [source, previous]), { source, trim, previous });
  assert.deepEqual(trimStart(records, previous, [previous]), { source: previous });
  assert.deepEqual(trimStart(records, source, [source]), { source });
});
test("new record carries only description, agent mark, Decorative and provenance", () => {
  const before = structuredClone(records);
  const path = name([], previous);
  const first = planTrimmedCopy({ records, source, trim, path: previous + ".new", previousStillUsed: false });
  assert.deepEqual(first.records.files[previous + ".new"], { description: { text: "Source", byAgent: true }, trimmedFrom: { source, trim } });
  const shared = planTrimmedCopy({ records, source, trim, path, previous, previousStillUsed: true });
  assert.deepEqual(shared.removes, []);
  assert.deepEqual(shared.records.files[path], { description: { text: "Previous", byAgent: true }, decorative: true, trimmedFrom: { source, trim } });
  assert.deepEqual(shared.records.files[previous], records.files[previous]);
  const removed = planTrimmedCopy({ records, source, trim, path, previous, previousStillUsed: false });
  assert.deepEqual(removed.removes, [previous, "media/images/studio-lights-crop-480.webp"]);
  assert.equal(removed.records.files[previous], undefined);
  assert.equal(removed.records.files["media/images/studio-lights-crop-480.webp"], undefined);
  assert.deepEqual(removed.records.files[source], records.files[source]);
  assert.deepEqual(records, before);
  for (const kept of [previous, "media/images/studio-lights-crop-480.webp"]) {
    const marked: MediaRecords = { ...records, files: { ...records.files, [kept]: { ...records.files[kept], alwaysKeep: true } } };
    assert.deepEqual(planTrimmedCopy({ records: marked, source, trim, path, previous, previousStillUsed: false }).removes, []);
  }
});
test("fractional rectangles become pixels, including subpixel trims", () => {
  assert.deepEqual(trimGeometry(200, 100, trim), { width: 100, height: 60, matrix: [1, 0, 0, 1, -20, -20] });
  assert.deepEqual(trimGeometry(400, 200, trim), { width: 200, height: 120, matrix: [1, 0, 0, 1, -40, -40] });
  assert.equal(trimGeometry(3, 2, { ...trim, width: .01, height: .01 }).width, 1);
});
test("non-square geometry turns clockwise, flipping in source orientation before turning", () => {
  const cases = [
    [0, 200, 100, [1, 0, 0, 1, 0, 0]],
    [90, 100, 200, [0, 1, -1, 0, 100, 0]],
    [180, 200, 100, [-1, 0, 0, -1, 200, 100]],
    [270, 100, 200, [0, -1, 1, 0, 0, 200]],
  ] as const;
  const clean = (values: readonly number[]) => values.map(value => value === 0 ? 0 : value);
  for (const [turn, width, height, matrix] of cases) {
    const result = trimGeometry(200, 100, { ...full, turn });
    assert.deepEqual([result.width, result.height, clean(result.matrix)], [width, height, matrix]);
  }
  assert.deepEqual(clean(trimGeometry(200, 100, { ...full, flipX: true }).matrix), [-1, 0, 0, 1, 200, 0]);
  assert.deepEqual(clean(trimGeometry(200, 100, { ...full, flipY: true }).matrix), [1, 0, 0, -1, 0, 100]);
  assert.deepEqual(clean(trimGeometry(200, 100, { ...full, turn: 90, flipX: true }).matrix), [0, -1, -1, 0, 100, 200]);
  assert.deepEqual(clean(trimGeometry(200, 100, { ...full, turn: 270, flipY: true }).matrix), [0, -1, -1, 0, 100, 200]);
  assert.deepEqual(clean(trimGeometry(200, 100, { ...full, turn: 180, flipX: true, flipY: true }).matrix), [1, 0, 0, 1, 0, 0]);
});
test("straighten rotates about the turned centre without enlarging its frame", () => {
  for (const straighten of [-30, 30]) {
    const result = trimGeometry(200, 100, { ...full, turn: 90, straighten });
    assert.deepEqual([result.width, result.height], [100, 200]);
    const [a, b, c, d, e, f] = result.matrix;
    assert.ok(Math.abs(a*100+c*50+e - 50) < 1e-9);
    assert.ok(Math.abs(b*100+d*50+f - 100) < 1e-9);
    const angle = straighten * Math.PI/180;
    assert.ok(Math.abs(a + Math.sin(angle)) < 1e-9);
    assert.ok(Math.abs(b - Math.cos(angle)) < 1e-9);
  }
});
test("invalid rectangles and rotations refuse; unchanged pictures are not trims", async () => {
  for (const change of [{ width: 0 }, { height: -1 }, { x: -.01 }, { y: 1 }, { width: 2 }, { x: NaN }, { height: Infinity }, { straighten: 46 }, { straighten: -46 }]) {
    assert.throws(() => validTrim({ ...full, ...change }));
  }
  const empty = { ...full };
  Reflect.deleteProperty(empty, "x");
  assert.throws(() => validTrim(empty), /finite numbers/);
  const invalidTurn = { ...full };
  Reflect.set(invalidTurn, "turn", 45);
  assert.throws(() => validTrim(invalidTurn), /Turn the picture/);
  assert.throws(() => trimGeometry(0, 100, trim));
  assert.equal(validTrim({ ...full, x: -1e-10 }), true);
  assert.equal(isTrim(full), false);
  for (const change of [trim, { ...full, turn: 90 as const }, { ...full, flipX: true as const }, { ...full, straighten: 1 }]) assert.equal(isTrim(change), true);
  await assert.rejects(prepareTrimmedCopy(new Blob(["source"]), "source.jpg", full), /has not been trimmed/);
});
test("trim preparation passes recipe, pixels request and cancellation to the encoder", async () => {
  const signal = new AbortController().signal;
  const blob = new Blob(["source"], { type: "image/jpeg" });
  const result = { outputs: [], before: 6, after: 1 };
  assert.equal(await prepareTrimmedCopy(blob, "original.jpg", trim, "higher", signal, async (file, options, cancellation, rectangle) => {
    assert.equal(await file.text(), "source");
    assert.equal(file.name, "original.jpg");
    assert.deepEqual(options, mediaImageRecipe("higher"));
    assert.equal(cancellation, signal);
    assert.deepEqual(rectangle, trim);
    return result;
  }), result);
});

test("all turn and flip combinations map non-square source corners in the specified order", () => {
  for (const turn of [0, 90, 180, 270] as const) for (const flipX of [false, true]) for (const flipY of [false, true]) {
    const transformed = trimGeometry(200, 100, { ...full, turn, ...(flipX ? { flipX: true } : {}), ...(flipY ? { flipY: true } : {}) });
    const [a, b, c, d, e, f] = transformed.matrix;
    for (const [x, y] of [[0, 0], [200, 0], [0, 100], [200, 100]]) {
      const fx = flipX ? 200 - x : x, fy = flipY ? 100 - y : y;
      const expected = turn === 0 ? [fx, fy] : turn === 90 ? [100 - fy, fx] : turn === 180 ? [200 - fx, 100 - fy] : [fy, 200 - fx];
      assert.deepEqual([a*x+c*y+e, b*x+d*y+f].map(value => value === 0 ? 0 : value), expected);
    }
  }
});
test("a shared copy's branches never reuse an address another branch used and removed", () => {
  // Places A and B share -crop; A is re-cropped to -2, -3, -4, each predecessor removed (B keeps -crop).
  let a = previous;
  const paths = new Set([previous]);
  for (const expected of [2, 3, 4]) {
    const next = name([...paths], a);
    assert.equal(next, `media/images/studio-lights-crop-${expected}.webp`);
    if (a !== previous) paths.delete(a);
    paths.add(next); a = next;
  }
  // B re-crops from -crop: -2 and -3 were removed, -4 is A's; B gets -5.
  assert.equal(name([...paths], previous), "media/images/studio-lights-crop-5.webp");
  // A removed address on the records' removed list counts too.
  assert.equal(name([previous, "media/images/studio-lights-crop-9.webp"], previous), "media/images/studio-lights-crop-10.webp");
  // Responsive copies and other folders are not chain numbers.
  assert.equal(name(["media/images/studio-lights-crop-480.webp", "images/studio-lights-crop-7.webp"], previous), "media/images/studio-lights-crop-2.webp");
});
