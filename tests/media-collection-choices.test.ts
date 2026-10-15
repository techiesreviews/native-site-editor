import { test } from "node:test";
import assert from "node:assert/strict";
import { detailCollections, filesLabel, mediaCollectionNameMessage, mediaCollectionSizes, mediaSelectionActions } from "../src/page-builder/media-collection-choices";

test("a collection name must be filled in and not taken by another collection, ignoring case", () => {
  const collections = ["Logos", "Brand"];
  assert.equal(mediaCollectionNameMessage(collections, "Team"), undefined);
  assert.equal(mediaCollectionNameMessage(collections, "  "), "Enter a name for the collection.");
  assert.equal(mediaCollectionNameMessage(collections, " brand "), "\"brand\" is already taken by another collection. Choose another name.");
  // Renaming may keep its own name or change only its case; never take another's.
  assert.equal(mediaCollectionNameMessage(collections, "Logos", "Logos"), undefined);
  assert.equal(mediaCollectionNameMessage(collections, "LOGOS", "Logos"), undefined);
  assert.match(mediaCollectionNameMessage(collections, "Brand", "Logos")!, /already taken/);
});

test("collection sizes count one tile per Image family, in the library's order, empty ones too", () => {
  const sizes = mediaCollectionSizes({
    collections: ["Logos", "Empty", "Brand"],
    items: ["images/logos/a.png", "images/logos/a-480w.png", "images/brand/b.svg", "images/c.jpg"].map(path => ({ path })),
    metadata: {
      "images/logos/a.png": { tags: ["Logos", "Brand"], alt: "" },
      "images/logos/a-480w.png": { tags: ["Logos"], alt: "" },
      "images/brand/b.svg": { tags: ["Brand", "Gone"], alt: "" },
      "images/c.jpg": { tags: [], alt: "" },
    },
  });
  assert.deepEqual([...sizes], [["Logos", 1], ["Empty", 0], ["Brand", 2]]);
});

test("the selection bar offers Take out only inside a collection, and Remove file separately", () => {
  assert.deepEqual(mediaSelectionActions(1, ""), { count: "1 selected", remove: "Remove file" });
  assert.deepEqual(mediaSelectionActions(3, "Logos"), { count: "3 selected", takeOut: "Take out of Logos", remove: "Remove files" });
  assert.equal(filesLabel(1), "1 file"); assert.equal(filesLabel(0), "0 files");
});

test("details keep the ticked collections and add a new one only when its name is free", () => {
  const collections = ["Logos", "Brand"];
  assert.deepEqual(detailCollections(collections, ["Brand"], ""), { tags: ["Brand"] });
  assert.deepEqual(detailCollections(collections, ["Brand", "Logos"], " Team "), { tags: ["Logos", "Brand", "Team"], created: "Team" });
  assert.deepEqual(detailCollections(collections, [], "logos"), { problem: "\"logos\" is already taken by another collection. Choose another name." });
  // A name no longer in the library is not kept by a stale tick.
  assert.deepEqual(detailCollections(collections, ["Old"], ""), { tags: [] });
});


test("collection sizes exclude copied online stills but count chosen own pictures", () => {
  const sizes = mediaCollectionSizes({
    collections: ["Films"], items: ["media/film.webp", "media/film-480.webp", "media/own.jpg"].map(path => ({ path })),
    metadata: { "media/film.webp": { tags: ["Films"], alt: "" }, "media/own.jpg": { tags: ["Films"], alt: "" } },
    onlineVideos: [
      { key: "online:youtube:film", service: "youtube", id: "film", still: "media/film.webp", stillCopied: true, uses: [] },
      { key: "online:vimeo:42", service: "vimeo", id: "42", still: "media/own.jpg", uses: [] },
    ],
  });
  assert.equal(sizes.get("Films"), 1);
});
