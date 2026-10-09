import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { DropContainer } from "../src/page-builder/drop-report";
import { dropLabel } from "../src/page-builder/drop-target";
import { sectionSnap, snapIndex } from "../src/page-builder/section-snap";

const bands = [{ index: 0, top: 100, height: 200 }, { index: 1, top: 300, height: 400 }];
const main: DropContainer = {
  path: [1], kind: "main", tag: "main", cls: "page",
  rect: { left: 0, top: 100, width: 800, height: 600 },
  count: bands.length,
  children: bands.map(band => ({ index: band.index, tag: "section", cls: "flow",
    rect: { left: 0, top: band.top, width: 800, height: band.height } })),
  layout: { display: "block", cols: 0, dir: "row", wrap: "nowrap" },
  empty: false, axis: "column",
};

test("a band's upper and lower halves pick before and after, with the midpoint picking before", () => {
  assert.equal(snapIndex(bands, 150), 0);
  assert.equal(snapIndex(bands, 200), 0);
  assert.equal(snapIndex(bands, 250), 1);
  assert.equal(snapIndex(bands, 400), 1);
  assert.equal(snapIndex(bands, 600), 2);
});

test("a nested element resolves through its band's full span, including an open Structure subtree", () => {
  // A nested row at y=400 lies in the second band's upper half; its own box is irrelevant.
  assert.equal(snapIndex(bands, 400), 1);
  assert.equal(sectionSnap(main, 400).index, 1);
});

test("the header picks the first gap and the footer the last", () => {
  assert.equal(snapIndex(bands, 50), 0);
  assert.equal(snapIndex(bands, 800), 2);
});

test("an empty main picks index zero", () => {
  assert.equal(snapIndex([], 500), 0);
  assert.equal(sectionSnap({ ...main, count: 0, children: [], empty: true }, 500).index, 0);
});

test("zero-height bands are skipped while shown bands retain their source indices", () => {
  const spans = [{ index: 0, top: 0, height: 0 }, { index: 1, top: 100, height: 200 },
    { index: 2, top: 300, height: 0 }, { index: 3, top: 300, height: 400 }, { index: 4, top: 700, height: 0 }];
  assert.equal(snapIndex(spans, 50), 1);
  assert.equal(snapIndex(spans, 250), 2);
  assert.equal(snapIndex(spans, 800), 4);
  assert.equal(snapIndex([{ index: 3, top: 0, height: 0 }], 800), 0);
});

test("sectionSnap returns an allowed main target that dropLabel names, including a moved band staying", () => {
  const section = { kind: "new", block: "section" } as const;
  const target = sectionSnap(main, 250);
  assert.deepEqual(target, { container: main, index: 1, level: 0, ok: true });
  assert.equal(dropLabel(target, section), "Between page bands › after Section");
  assert.equal(dropLabel(sectionSnap(main, 50), section), "Between page bands › before Section");
  const moved = { kind: "move", path: [1, 0], band: true } as const;
  assert.equal(dropLabel(sectionSnap(main, 150), moved), "Stays where it is");
  assert.equal(dropLabel(target, moved), "Stays where it is");
});
