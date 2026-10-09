import { test } from "node:test";
import assert from "node:assert/strict";
import { editBarSources } from "../src/components/edit-bar-sources.ts";

const pages = ["index.html", "about/index.html"];
const sources = {
  "index.html": "<h1>Home</h1>",
  "about/index.html": "",
  "components/card.html": "<h2>Card</h2>",
  "styles/site.css": "h1 { color: red; }",
};

test("loading or editing another page does not invalidate the selected page's edit bar", () => {
  const before = editBarSources(sources, pages, "index.html", "index.html");
  for (const content of ["<h1>About</h1>", "<h1>Changed about</h1>"]) {
    assert.deepEqual(editBarSources({ ...sources, "about/index.html": content }, pages, "index.html", "index.html"), before);
  }
});

test("selected source, component templates and styles still invalidate the edit bar", () => {
  const before = editBarSources(sources, pages, "index.html", "index.html");
  for (const path of ["index.html", "components/card.html", "styles/site.css"]) {
    assert.notDeepEqual(editBarSources({ ...sources, [path]: "changed" }, pages, "index.html", "index.html"), before);
  }
});

test("a template selection retains the shown page and its own source", () => {
  assert.deepEqual(editBarSources(sources, pages, "components/card.html", "index.html"), {
    "index.html": sources["index.html"],
    "components/card.html": sources["components/card.html"],
    "styles/site.css": sources["styles/site.css"],
  });
  const before = editBarSources(sources, pages, "components/card.html", "index.html");
  assert.notDeepEqual(editBarSources({ ...sources, "index.html": "changed instance" }, pages, "components/card.html", "index.html"), before);
});

test("a selected page stays relevant even when another page is shown", () => {
  assert.deepEqual(editBarSources(sources, pages, "about/index.html", "index.html"), sources);
});

test("a model without a source target keeps all source invalidation", () => {
  assert.deepEqual(editBarSources(sources, pages, undefined, "index.html"), sources);
});
