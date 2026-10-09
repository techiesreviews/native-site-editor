import assert from "node:assert/strict";
import test from "node:test";
import { composite, sampleContrast } from "./native-save/tone-contrast.ts";

test("transparent layers preserve the surface; translucent layers compose nearest first", () => {
  assert.deepEqual(composite([1, 0, 0, 0], [0, 0, 1, 1]), [0, 0, 1, 1]);
  assert.deepEqual(composite([1, 0, 0, 0.5], [0, 0, 1, 0.5]), [2 / 3, 0, 1 / 3, 0.75]);
  assert.deepEqual(composite([1, 0, 0, 0], [0, 0, 1, 0]), [0, 0, 0, 0]);
  const result = sampleContrast({
    foreground: { colour: "black", rgba: [0, 0, 0, 1] },
    backgrounds: [
      { colour: "half red", rgba: [1, 0, 0, 0.5] },
      { colour: "half blue", rgba: [0, 0, 1, 0.5] },
      { colour: "white", rgba: [1, 1, 1, 1] },
    ],
  });
  assert.deepEqual(result.background, { r: 0.75, g: 0.25, b: 0.5 });
});

test("contrast uses the painted foreground, including its alpha, and needs an opaque canvas", () => {
  const white = { colour: "white", rgba: [1, 1, 1, 1] as [number, number, number, number] };
  assert.equal(sampleContrast({ foreground: { colour: "black", rgba: [0, 0, 0, 1] }, backgrounds: [white] }).ratio, 21);
  const translucent = sampleContrast({ foreground: { colour: "half black", rgba: [0, 0, 0, 0.5] }, backgrounds: [white] });
  assert.deepEqual(translucent.foreground, { r: 0.5, g: 0.5, b: 0.5 });
  assert.ok(Math.abs(translucent.ratio - 3.976653) < 0.000001);
  assert.throws(() => sampleContrast({ foreground: white, backgrounds: [] }), /opaque canvas/);
});
