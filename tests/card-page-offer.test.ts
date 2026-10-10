import assert from "node:assert/strict";
import test from "node:test";
import { createPageOffer, pageChoices } from "../src/page-builder/page-choices.ts";

const routes = { "/": "index.html", "/work/old/": "work/old/index.html" };
const input = { routes, pages: [{ route: "/work/old/", file: "work/old/index.html", title: "Old page" }], folders: ["/", "/work/", "/work/old/"], inGrid: ["/work/old/"], exists: () => false };
const offer = (query: string) => createPageOffer({ ...input, query });

test("a title goes under the cards' folder, then the default folder, then root", () => {
  assert.equal(offer(" Hello there ")?.route, "/work/hello-there/");
  assert.equal(createPageOffer({ ...input, inGrid: [], folder: "/work/", query: "Hello" })?.route, "/work/hello/");
  assert.equal(createPageOffer({ ...input, inGrid: [], query: "Hello there" })?.route, "/hello-there/");
});
test("a typed address stays as typed, lowercased, including its slug", () => {
  assert.deepEqual(offer("/WORK/HELLO_THERE///"), { title: "Hello there", route: "/work/hello_there/", request: { title: "Hello there", parent: "/work/", slug: "hello_there" } });
});
test("one new folder is allowed; two new levels explain the refusal", () => {
  assert.deepEqual(offer("/work/new/hello")?.request, { title: "Hello", parent: "/work/", newFolder: "new", slug: "hello" });
  assert.equal(offer("/work/new/deep/hello")?.error, "Choose an existing folder or add one folder inside it.");
});
test("taken addresses and existing titles have no offer, including trimmed case-insensitive input", () => {
  for (const query of ["Old", "/work/old", "/WORK/OLD/", " old PAGE ", ""]) assert.equal(offer(query), undefined);
  assert.equal(createPageOffer({ ...input, query: "Hello", exists: path => path === "work/hello" }), undefined);
});
test("a title that gives no URL has a disabled offer with the reason", () => {
  assert.equal(offer("!!!")?.error, "The title gives no URL: add letters or digits.");
});

test("a taken planned address stays in search results even when the typed title has punctuation", () => {
  assert.equal(offer("Old!!!"), undefined);
  assert.equal(pageChoices({ ...input, own: "index.html", query: "Old!!!" })[0].route, "/work/old/");
  assert.equal(pageChoices({ pages: [{ route: "/about.html", title: "About", file: "about.html" }], own: "index.html", inGrid: [], query: "/about.html/" })[0].route, "/about.html");
});

test("an occupied new folder keeps its disabled reason when the page address is still free", () => {
  const result = createPageOffer({ ...input, query: "/work/new/hello", exists: path => path === "work/new" });
  assert.match(result?.error ?? "", /is taken/);
  assert.equal(result?.route, "/work/new/hello/");
});
