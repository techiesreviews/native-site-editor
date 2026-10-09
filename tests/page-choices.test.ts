import test from "node:test";
import assert from "node:assert/strict";
import { cardFolder, pageChoiceGroups, type SitePage } from "../src/page-builder/page-choices.ts";

// The starter's pages, in site order, plus a draft under /work/ and a page in another folder.
const pages: SitePage[] = [
  { route: "/", file: "index.html", title: "Home" },
  { route: "/about/", file: "about/index.html", title: "About" },
  { route: "/work/", file: "work/index.html", title: "Work" },
  { route: "/work/fern-and-kettle/", file: "work/fern-and-kettle/index.html", title: "Fern & Kettle" },
  { route: "/work/harbour-lane-pottery/", file: "work/harbour-lane-pottery/index.html", title: "Harbour Lane Pottery" },
  { route: "/work/orchard-bakery/", file: "work/orchard-bakery/index.html", title: "Orchard Bakery" },
  { route: "/notes/kiln-day/", file: "notes/kiln-day/index.html", title: "Kiln day" },
  { route: "/404.html", file: "404.html", title: "Page not found" },
];
const titles = (groups: ReturnType<typeof pageChoiceGroups>) => groups.map((group) => [group.label, group.pages.map((page) => page.title)]);

test("the cards' folder is the most common parent of the pages they link to", () => {
  assert.equal(cardFolder(["/work/a/", "/notes/b/", "/work/c/"]), "/work/");
  assert.equal(cardFolder([undefined, "/work/a/"]), "/work/");
  // A tie goes to the first folder seen; top-level pages have no folder.
  assert.equal(cardFolder(["/notes/b/", "/work/a/"]), "/notes/");
  assert.equal(cardFolder(["/about/", "/", undefined]), undefined);
  assert.equal(cardFolder([]), undefined);
  // Deeper pages: their own parent.
  assert.equal(cardFolder(["/work/2025/a/", "/work/2025/b/"]), "/work/2025/");
});

test("pages under the inferred folder come first, then Other pages; the grid's own page and 404 are left out", () => {
  const groups = pageChoiceGroups({ pages, own: "index.html", inGrid: ["/work/fern-and-kettle/", "/work/harbour-lane-pottery/"] });
  assert.deepEqual(titles(groups), [
    ["Under /work/", ["Fern & Kettle", "Harbour Lane Pottery", "Orchard Bakery"]],
    ["Other pages", ["About", "Work", "Kiln day"]],
  ]);
  // On another page, the home page is offered and that page is not.
  const elsewhere = pageChoiceGroups({ pages, own: "about/index.html", inGrid: ["/work/fern-and-kettle/"] });
  assert.deepEqual(elsewhere[1].pages.map((page) => page.route), ["/", "/work/", "/notes/kiln-day/"]);
});

test("pages a card of the grid links to are marked In this grid", () => {
  const [under] = pageChoiceGroups({ pages, own: "index.html", inGrid: ["/work/fern-and-kettle/", "/work/harbour-lane-pottery/"] });
  assert.deepEqual(under.pages.map((page) => [page.title, page.inGrid]), [["Fern & Kettle", true], ["Harbour Lane Pottery", true], ["Orchard Bakery", false]]);
});

test("without a folder (no card links anywhere yet) every page is one group", () => {
  const groups = pageChoiceGroups({ pages, own: "index.html", inGrid: [] });
  assert.deepEqual(titles(groups), [["Pages", ["About", "Work", "Fern & Kettle", "Harbour Lane Pottery", "Orchard Bakery", "Kiln day"]]]);
});

test("search covers every page, by title or address, and drops empty groups", () => {
  const inGrid = ["/work/fern-and-kettle/"];
  assert.deepEqual(titles(pageChoiceGroups({ pages, own: "index.html", inGrid, query: "  KILN " })), [["Other pages", ["Kiln day"]]]);
  assert.deepEqual(titles(pageChoiceGroups({ pages, own: "index.html", inGrid, query: "orchard-b" })), [["Under /work/", ["Orchard Bakery"]]]);
  assert.deepEqual(titles(pageChoiceGroups({ pages, own: "index.html", inGrid, query: "o" })), [
    ["Under /work/", ["Fern & Kettle", "Harbour Lane Pottery", "Orchard Bakery"]],
    ["Other pages", ["About", "Work", "Kiln day"]],
  ]);
  // The left-out pages stay out of a search.
  assert.deepEqual(pageChoiceGroups({ pages, own: "index.html", inGrid, query: "not found" }), []);
  assert.deepEqual(pageChoiceGroups({ pages, own: "index.html", inGrid, query: "home" }), []);
});
