import assert from "node:assert/strict";
import test from "node:test";
import { PLACES_KEY, boundsOf, parsePlaces, readPlaces, serialisePlaces, snapMove, writePlaces, type Box } from "../src/catalogue/places.ts";

// Free placement on the catalogue board (TOOLS-215): a card dragged by its title moves by an offset from its place in
// the areas' flow, snaps to the edges and centres of the other cards, and its offset is remembered in this browser.

function memoryStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
    items,
  };
}

test("places read back what was written, and a moved-back card is left out", () => {
  const storage = memoryStorage();
  writePlaces(storage, new Map([["button", { x: 120, y: -40 }], ["badge", { x: 0, y: 0 }]]));
  assert.deepEqual(JSON.parse(storage.items.get(PLACES_KEY)!), { button: { x: 120, y: -40 } });
  assert.deepEqual([...readPlaces(storage)], [["button", { x: 120, y: -40 }]]);
});

test("broken, hand-edited or missing places read as none, keeping only the good entries", () => {
  assert.equal(parsePlaces(null).size, 0);
  assert.equal(parsePlaces("{not json").size, 0);
  assert.equal(parsePlaces("[1,2]").size, 0);
  const places = parsePlaces(JSON.stringify({ button: { x: 10.4, y: 3.6 }, badge: { x: "1", y: 2 }, key: null, icon: { x: Infinity, y: 0 } }));
  assert.deepEqual([...places], [["button", { x: 10, y: 4 }]]);
});

test("a browser that refuses storage leaves the board in its flow, and a refused write is no error", () => {
  const refusing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(readPlaces(refusing).size, 0);
  assert.doesNotThrow(() => writePlaces(refusing, new Map([["button", { x: 1, y: 1 }]])));
});

test("places serialise in name order, so the stored text is stable", () => {
  assert.equal(serialisePlaces(new Map([["z", { x: 1, y: 2 }], ["a", { x: 3, y: 4 }]])), '{"a":{"x":3,"y":4},"z":{"x":1,"y":2}}');
});

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

test("a card near another's left edge snaps to it and draws one guide along that edge", () => {
  const moving = box(103, 400, 200, 100), other = box(100, 0, 300, 200);
  const snapped = snapMove(moving, [other], 6);
  assert.deepEqual({ x: snapped.x, y: snapped.y }, { x: 100, y: 400 });
  assert.deepEqual(snapped.guides, [{ axis: "x", at: 100, from: 0, to: 500 }]);
});

test("centres and far edges snap too, on both axes at once", () => {
  const other = box(0, 0, 400, 200);
  // The moving card's centre (x + 50) lands on the other's centre (200); its bottom lands on the other's bottom.
  const snapped = snapMove(box(148, 97, 100, 100), [other], 6);
  assert.deepEqual({ x: snapped.x, y: snapped.y }, { x: 150, y: 100 });
  assert.equal(snapped.guides.length, 2);
});

test("nothing within reach leaves the card where the pointer put it, with no guides", () => {
  const snapped = snapMove(box(1000, 1000, 50, 50), [box(0, 0, 100, 100)], 6);
  assert.deepEqual(snapped, { x: 1000, y: 1000, guides: [] });
});

test("the nearest edge wins when two are within reach", () => {
  const snapped = snapMove(box(205, 500, 100, 100), [box(0, 0, 200, 50), box(207, 100, 50, 50)], 6);
  assert.equal(snapped.x, 207);
});

test("bounds hold every box, and none is no bounds", () => {
  assert.equal(boundsOf([]), undefined);
  assert.deepEqual(boundsOf([box(10, 20, 100, 50), box(-40, 300, 20, 20)]), { x: -40, y: 20, w: 150, h: 300 });
});
