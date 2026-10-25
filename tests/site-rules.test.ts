import { strict as assert } from "node:assert";
import { test } from "node:test";
import { componentSourceProblem, fileInTheWay, folderProblem, foldersAbove, makeComponentProblem, pageAddressProblem, parentProblem, toPageAddress, toPageRoute } from "../shared/site-rules.ts";

const ADDRESS = "Use lowercase letters, digits and dashes in the URL, at most 80, starting with a letter or digit.";

test("a new page address is lowercase letters, digits and dashes, at most 80, starting with a letter or digit", () => {
  for (const slug of ["about", "my-first-video", "2026", "a", "x-", "a".repeat(80)]) assert.equal(pageAddressProblem(slug), undefined, slug);
  for (const slug of ["", "About_Us.v2", "About", "about_us", "a.b", "-x", "a b", "a/b", "é", "a".repeat(81)]) assert.equal(pageAddressProblem(slug), ADDRESS, slug);
});

test("a typed address is converted to the rule, not refused", () => {
  assert.equal(toPageAddress("About Us!"), "about-us");
  assert.equal(toPageAddress("Café Menü"), "cafe-menu");
  assert.equal(toPageAddress("  --Hello__World--  "), "hello-world");
  assert.equal(toPageAddress("a".repeat(100)), "a".repeat(80));
  assert.equal(toPageAddress("!!!"), "");
  assert.equal(toPageAddress("  Crème brûlée — 2026!  "), "creme-brulee-2026");
  assert.equal(toPageAddress("Fern & Kettle"), "fern-kettle");
  assert.equal(toPageAddress("Straße Ærø"), "strasse-aero");
  assert.equal(toPageAddress("日本語"), "");
  assert.equal(toPageAddress("About_Us.v2"), "about-us-v2");
  // Whatever it gives meets the rule.
  for (const text of ["About Us!", "Café Menü", "a".repeat(100), "x".repeat(79) + " y"]) assert.equal(pageAddressProblem(toPageAddress(text)), undefined, text);
  // While typing, a separator at the end waits as a dash for the next word; none at the start.
  assert.equal(toPageAddress("About ", { typing: true }), "about-");
  assert.equal(toPageAddress("About  -_", { typing: true }), "about-");
  assert.equal(toPageAddress("-", { typing: true }), "");
  assert.equal(toPageAddress("!!!", { typing: true }), "");
  assert.equal(toPageAddress("About!", { typing: true }), "about");
});

test("a typed URL is converted part by part; the parts of the URL now stay", () => {
  assert.equal(toPageRoute("/Notes/About Us/"), "/notes/about-us/");
  assert.equal(toPageRoute("/notes/About_Us.v2/"), "/notes/about-us-v2/");
  assert.equal(toPageRoute("/Old Notes.HTML"), "/old-notes.html");
  assert.equal(toPageRoute("/notes/hello-/"), "/notes/hello/");
  assert.equal(toPageRoute("/!!!/"), "//");
  // A folder already named against the rule is not renamed by typing under it.
  assert.equal(toPageRoute("/Old_Folder/New Page/", { kept: "/Old_Folder/page/".split("/") }), "/Old_Folder/new-page/");
  // While typing: a dash at the end of a part, and the start of .html at the end.
  assert.equal(toPageRoute("/notes/about ", { typing: true }), "/notes/about-");
  assert.equal(toPageRoute("/notes -/x", { typing: true }), "/notes-/x");
  for (const end of [".", ".h", ".ht", ".htm", ".html"]) assert.equal(toPageRoute(`/notes${end}`, { typing: true }), `/notes${end}`);
  assert.equal(toPageRoute("/notes.", {}), "/notes");
});

test("make component checks the name, then the element, with one wording each", () => {
  assert.equal(makeComponentProblem(undefined, "section-intro", []), undefined);
  assert.equal(makeComponentProblem(undefined, "", []), "Type a name with a dash, such as section-intro.");
  assert.equal(makeComponentProblem(undefined, "1-x", []), "A component's name starts with a lowercase letter.");
  assert.equal(makeComponentProblem(undefined, "section", []), "A component's name has a dash in it, such as section-intro.");
  assert.equal(makeComponentProblem(undefined, "section--hero", []), "Use lowercase letters, digits and single dashes between words.");
  assert.equal(makeComponentProblem(undefined, "font-face", []), "font-face is reserved by HTML.");
  assert.equal(makeComponentProblem(undefined, "feature-block", ["feature-block"]), "There is a component <feature-block> already.");
  assert.equal(makeComponentProblem({ tag: "main" }, "section-x", []), "A <main> cannot be a component.");
  assert.equal(makeComponentProblem({ tag: "BODY" }, "section-x", []), "A <body> cannot be a component.");
  assert.equal(makeComponentProblem({ tag: "site-header" }, "section-x", []), "<site-header> is the site's header component already.");
  assert.equal(makeComponentProblem({ tag: "site-footer" }, "section-x", []), "<site-footer> is the site's footer component already.");
  assert.equal(makeComponentProblem({ tag: "card-note" }, "section-x", []), "<card-note> is a component already.");
  assert.equal(makeComponentProblem({ tag: "section" }, "section-x", []), undefined);
  // The name is checked first.
  assert.equal(makeComponentProblem({ tag: "main" }, "section", []), "A component's name has a dash in it, such as section-intro.");
  assert.equal(componentSourceProblem({ tag: "div" }), undefined);
});

test("a file in the way of a new path is refused with one wording at each depth", () => {
  const files = (...paths: string[]) => (path: string) => paths.includes(path);
  assert.deepEqual(foldersAbove("a/b/c.html"), ["a", "a/b"]);
  assert.deepEqual(foldersAbove("index.html"), []);
  assert.equal(fileInTheWay("notes.html"), "notes.html is a file, so nothing can go in it.");
  // Direct parent, then grandparent.
  assert.equal(parentProblem("a/b/c.html", files("a/b")), "a/b is a file, so nothing can go in it.");
  assert.equal(parentProblem("a/b/c.html", files("a")), "a is a file, so nothing can go in it.");
  assert.equal(parentProblem("a/b/c.html", files("a/b/c.html", "b")), undefined);
  assert.equal(parentProblem("index.html", files("index.html")), undefined);
});

test("nothing can go in a folder that is a file, or sits in one", () => {
  const files = (...paths: string[]) => (path: string) => paths.includes(path);
  assert.equal(folderProblem("media/images", files("media/images")), "media/images is a file, so nothing can go in it.");
  assert.equal(folderProblem("media/images", files("media")), "media is a file, so nothing can go in it.");
  assert.equal(folderProblem("media/images", files("images")), undefined);
  assert.equal(folderProblem("", files("")), undefined);
});
