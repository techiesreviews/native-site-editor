import { test } from "node:test";
import assert from "node:assert/strict";
import { POPUP_SHAPES, keepsPopupChanges, focusApplies, frameBadge, frameChange, nudgeFocus, placePopup, popupMessage, pictureHint, placeShapeOf, seenHints, shapeLabel, shapeRatio, sheetScroll, squareFocus } from "../src/page-builder/image-popup-rules";
import { readPlaceFrame, writePlaceFrame } from "../src/page-builder/place-frame";
import type { MediaRecords } from "../shared/media-records";

test("the shape menu lists the prototype's shapes in order; Free follows for pictures that can be trimmed", () => {
  assert.deepEqual(POPUP_SHAPES.map(shape => shape.label), ["Original", "Square", "4:3", "16:9", "Tall 4:5"]);
  assert.equal(shapeLabel("4:5"), "Tall 4:5");
  assert.equal(shapeLabel("free"), "Free");
  assert.equal(shapeRatio("free"), undefined);
  // A Free trim's copy carries its own shape: the place keeps Original.
  assert.equal(placeShapeOf("free"), "original");
  assert.deepEqual(frameChange({ shape: "square", focus: undefined }, { shape: "free", focus: { x: 50, y: 50 } }), { shape: "original" });
  assert.equal(pictureHint("free"), "Drag the corners to trim.");
  assert.equal(pictureHint("original", true), "Drag the square to what matters most.");
  assert.equal(shapeLabel({ kind: "other", value: " 3 / 2 " }), "Custom (3 / 2)");
});

test("shape ratios: Original has none, a hand-written ratio is read, nonsense is none", () => {
  assert.equal(shapeRatio("original"), undefined);
  assert.equal(shapeRatio("square"), 1);
  assert.equal(shapeRatio("16:9"), 16 / 9);
  assert.equal(shapeRatio({ kind: "other", value: "3 / 2" }), 1.5);
  assert.equal(shapeRatio({ kind: "other", value: "2" }), 2);
  assert.equal(shapeRatio({ kind: "other", value: "auto" }), undefined);
  assert.equal(focusApplies("original"), false);
  assert.equal(focusApplies("4:3"), true);
});

test("the badge says Trimmed for a trimmed copy, else the shape", () => {
  assert.equal(frameBadge({ shape: "original", trimmed: false }), "Original");
  assert.equal(frameBadge({ shape: "square", trimmed: false }), "Square");
  assert.equal(frameBadge({ shape: { kind: "other", value: "3 / 2" }, trimmed: false }), "Custom");
  assert.equal(frameBadge({ shape: "square", trimmed: true }), "Trimmed");
  const tag = writePlaceFrame('<img src="/media/desk-crop.webp">', { shape: "16:9" });
  assert.equal(frameBadge(readPlaceFrame(tag, undefined, "index.html")), "16:9");
  const records = { version: 2, collections: [], files: { "media/desk-crop.webp": { trimmedFrom: { source: "media/desk.webp", trim: { x: 0, y: 0, width: 1, height: 1 } } } } } satisfies MediaRecords;
  assert.equal(frameBadge(readPlaceFrame(tag, records, "index.html")), "Trimmed");
});

test("arrow keys move the focus 2 %, Shift 10 %, within the picture; other keys do nothing", () => {
  assert.deepEqual(nudgeFocus({ x: 72, y: 40 }, "ArrowLeft"), { x: 70, y: 40 });
  assert.deepEqual(nudgeFocus({ x: 72, y: 40 }, "ArrowDown", true), { x: 72, y: 50 });
  assert.deepEqual(nudgeFocus({ x: 1, y: 99 }, "ArrowLeft"), { x: 0, y: 99 });
  assert.deepEqual(nudgeFocus({ x: 50, y: 95 }, "ArrowDown", true), { x: 50, y: 100 });
  assert.equal(nudgeFocus({ x: 50, y: 50 }, "Enter"), undefined);
  // A square as tall as the picture moves only across, as a drag does; one filling both ways stays.
  assert.deepEqual(nudgeFocus({ x: 50, y: 50 }, "ArrowUp", true, { w: 0.45, h: 1 }), { x: 50, y: 50 });
  assert.deepEqual(nudgeFocus({ x: 50, y: 50 }, "ArrowLeft", false, { w: 0.45, h: 1 }), { x: 48, y: 50 });
  assert.deepEqual(nudgeFocus({ x: 37, y: 61 }, "ArrowRight", false, { w: 1, h: 1 }), { x: 37, y: 61 });
});

test("the square centred on a point gives the object-position that shows it, in whole percentages kept on the picture", () => {
  // A square half the picture's width, its full height: only the focus across moves.
  const area = { w: 0.5, h: 1 }, was = { x: 50, y: 30 };
  assert.deepEqual(squareFocus(area, { x: 0.25, y: 0.9 }, was), { x: 0, y: 30 });
  assert.deepEqual(squareFocus(area, { x: 0.5, y: 0.5 }, was), { x: 50, y: 30 });
  assert.deepEqual(squareFocus(area, { x: 0.6, y: 0.5 }, was), { x: 70, y: 30 });
  assert.deepEqual(squareFocus(area, { x: 2, y: -1 }, was), { x: 100, y: 30 });
  // Zoomed in (a quarter each way), both move; the square's left edge sits at (1 − w) × focus.
  assert.deepEqual(squareFocus({ w: 0.25, h: 0.25 }, { x: 0.125, y: 0.875 }, was), { x: 0, y: 100 });
  assert.deepEqual(squareFocus({ w: 0.25, h: 0.25 }, { x: 0.35, y: 0.5 }, was), { x: 30, y: 50 });
  // A square that fills the picture both ways keeps the focus it had.
  assert.deepEqual(squareFocus({ w: 1, h: 1 }, { x: 0.1, y: 0.9 }, { x: 37, y: 61 }), { x: 37, y: 61 });
});

test("the message is blue for this spot only, yellow when a new picture is saved", () => {
  assert.deepEqual([popupMessage({ newPicture: false }).tone, popupMessage({ newPicture: false }).text], ["info", "Only changes this spot"]);
  assert.deepEqual([popupMessage({ newPicture: true }).tone, popupMessage({ newPicture: true }).text], ["new", "Saves a new picture for this spot"]);
  assert.equal(popupMessage({ newPicture: true, recrop: true }).text, "Updates this spot's trimmed picture");
  assert.equal(pictureHint("square"), "Drag the square to what matters most.");
  assert.equal(pictureHint("original"), "The whole picture shows.");
});

test("Done writes only what changed", () => {
  const start = { shape: "original" as const, focus: { x: 50, y: 50 } };
  assert.equal(frameChange(start, { shape: "original", focus: { x: 50, y: 50 } }), undefined);
  assert.deepEqual(frameChange(start, { shape: "square", focus: { x: 50, y: 50 } }), { shape: "square" });
  assert.deepEqual(frameChange(start, { shape: "square", focus: { x: 72, y: 40 } }), { shape: "square", focus: { x: 72, y: 40 } });
  assert.deepEqual(frameChange({ shape: "4:3", focus: { x: 20, y: 50 } }, { shape: "4:3", focus: { x: 30, y: 50 } }), { focus: { x: 30, y: 50 } });
  assert.deepEqual(frameChange({ shape: "4:3", focus: { x: 20, y: 50 } }, { shape: "original", focus: { x: 30, y: 50 } }), { shape: "original" });
  // A hand-written ratio stays unless another shape is chosen; its focus can still move.
  const other = { kind: "other" as const, value: "3 / 2" };
  assert.equal(frameChange({ shape: other, focus: { x: 50, y: 50 } }, { shape: { ...other }, focus: { x: 50, y: 50 } }), undefined);
  assert.deepEqual(frameChange({ shape: other, focus: { x: 50, y: 50 } }, { shape: other, focus: { x: 60, y: 50 } }), { focus: { x: 60, y: 50 } });
  // An unreadable focus (lengths) is kept unless the dot moved from the middle.
  assert.equal(frameChange({ shape: "square", focus: undefined }, { shape: "square", focus: { x: 50, y: 50 } }), undefined);
  // A replacement writes the centred focus even when unmoved; Original has none to write.
  assert.deepEqual(frameChange({ shape: "square", focus: { x: 20, y: 20 } }, { shape: "square", focus: { x: 50, y: 50 } }, true), { focus: { x: 50, y: 50 } });
  assert.equal(frameChange(start, { shape: "original", focus: { x: 50, y: 50 } }, true), undefined);
});

test("the popup stands left of the picture, else right, else below the bar, inside the window", () => {
  const size = { width: 328, height: 400 }, view = { width: 1280, height: 800 };
  const bar = { left: 700, top: 100, right: 1000, bottom: 140 };
  assert.deepEqual(placePopup({ left: 700, top: 150, right: 1100, bottom: 450 }, bar, size, view), { side: "left", left: 358, top: 100 });
  assert.deepEqual(placePopup({ left: 100, top: 150, right: 600, bottom: 450 }, { ...bar, left: 100, right: 400 }, size, view), { side: "right", left: 614, top: 100 });
  assert.deepEqual(placePopup({ left: 100, top: 150, right: 1100, bottom: 450 }, { ...bar, left: 100, right: 400 }, size, view), { side: "below", left: 100, top: 148 });
  // Kept inside the window at the bottom and right.
  assert.deepEqual(placePopup({ left: 100, top: 650, right: 1100, bottom: 790 }, { left: 1100, top: 600, right: 1270, bottom: 640 }, size, view), { side: "below", left: 944, top: 392 });
});

test("on a phone the page scrolls so the picture sits above the sheet", () => {
  assert.equal(sheetScroll({ left: 0, top: 100, right: 390, bottom: 300 }, 500, 60), 0);
  assert.equal(sheetScroll({ left: 0, top: 400, right: 390, bottom: 600 }, 500, 60), 108);
  // Taller than the room: its top shows.
  assert.equal(sheetScroll({ left: 0, top: 200, right: 390, bottom: 900 }, 500, 60), 132);
  // Scrolled above the frame: back down, just above the sheet.
  assert.equal(sheetScroll({ left: 0, top: 0, right: 390, bottom: 100 }, 500, 60), -392);
});

test("component shape opens first, crops at its ratio, names the badge and notes other choices", async () => {
  const { componentFrame, componentShapeEntry, componentShapeNotice } = await import("../src/page-builder/component-shapes");
  const component = { label: "Photo card", shape: { value: "4 / 3", ratio: 4 / 3, label: "4:3" } };
  const entry = componentShapeEntry(component)!;
  assert.equal(entry.label, "Photo card's shape (4:3)");
  const initial = componentFrame('<img style="object-position:20% 30%">', undefined, "index.html", component);
  assert.deepEqual(initial.shape, entry.id);
  assert.equal(componentFrame('<img style="/* own */ aspect-ratio:auto">', undefined, "index.html", component).shape, "original");
  assert.deepEqual(componentFrame('<img style="--note: \'aspect-ratio:auto\'">', undefined, "index.html", component).shape, entry.id);
  assert.equal(shapeLabel(initial.shape), entry.label);
  assert.equal(shapeRatio(initial.shape), 4 / 3);
  assert.equal(focusApplies(initial.shape), true);
  assert.equal(frameBadge(initial), "Photo card's shape");
  assert.equal(componentShapeNotice(initial.shape, component), undefined);
  assert.equal(componentShapeNotice("square", component), "This Photo card will look different from the others.");
  assert.equal(frameBadge(componentFrame('<img style="aspect-ratio:1;object-fit:cover">', undefined, "index.html", component)), "Square");
  assert.deepEqual(frameChange({ shape: "square", focus: initial.focus }, { shape: entry.id, focus: { x: 20, y: 30 }, component }), { shape: "component" });
  assert.deepEqual(frameChange(initial, { shape: "original", focus: { x: 20, y: 30 }, component }), { shape: "original", originalUnderComponent: true });
  assert.deepEqual(frameChange(initial, { shape: entry.id, focus: { x: 50, y: 50 }, component }, true), { focus: { x: 50, y: 50 } });
  assert.equal(componentFrame('<img style="aspect-ratio:auto;object-fit:contain">', undefined, "index.html", component).shape, "original");
  // An inline cover alone repeats the component's own fit: the component's shape still shows.
  assert.deepEqual(componentFrame('<img style="object-fit: cover">', undefined, "index.html", component).shape, entry.id);
  assert.notDeepEqual(componentFrame('<img style="object-fit: contain">', undefined, "index.html", component).shape, entry.id);
});

test("each hint under the picture shows only the first time: the stored list is read safely", () => {
  assert.deepEqual([...seenHints(null)], []);
  assert.deepEqual([...seenHints(JSON.stringify(["Drag the square to what matters most.", 3, null]))], ["Drag the square to what matters most."]);
  assert.deepEqual([...seenHints("{not json")], []);
  assert.deepEqual([...seenHints(JSON.stringify({ hint: "x" }))], []);
});

// Ticket 27: the popup's changes are kept on its page across a switch, away or away and back.
test("a pinned popup keeps its changes when closed away, or after leaving and coming back (a new load)", () => {
  const at = { pinned: true, here: true, sameLoad: true, owned: true, sameBytes: true, viewingVersion: false };
  assert.equal(keepsPopupChanges(at), true, "on show, as before");
  assert.equal(keepsPopupChanges({ ...at, here: false, sameLoad: false, owned: false }), true, "another workspace shown");
  assert.equal(keepsPopupChanges({ ...at, sameLoad: false, owned: false }), true, "left and shown again: a new load, its bytes prove it");
  assert.equal(keepsPopupChanges({ ...at, owned: false }), false, "a later press owns the bar on the same load: it only closes");
  assert.equal(keepsPopupChanges({ ...at, sameLoad: false, sameBytes: false }), false, "its page changed meanwhile");
  assert.equal(keepsPopupChanges({ ...at, viewingVersion: true }), false, "an earlier version shown");
});

test("a popup with no pin keeps its changes only on the load it opened on, still owned", () => {
  const at = { pinned: false, here: true, sameLoad: true, owned: true, sameBytes: true, viewingVersion: false };
  assert.equal(keepsPopupChanges(at), true);
  assert.equal(keepsPopupChanges({ ...at, sameLoad: false }), false);
  assert.equal(keepsPopupChanges({ ...at, owned: false }), false);
});

