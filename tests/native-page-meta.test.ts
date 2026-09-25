import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { editNativePageMeta, type NativePageMetaField } from "../src/native-page-meta.ts";
import { parseNativeManifest } from "../src/native-manifest.ts";

const fixture = readFileSync(resolve("fixtures/native-starter/.astro-editor/native.json"), "utf8");

function edit(text: string, route: string, field: NativePageMetaField, value: string) {
  const result = editNativePageMeta(text, route, field, value);
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  if (!result.ok) throw new Error(result.error);
  // The returned edit and the returned text agree.
  if (result.edit) assert.equal(text.slice(0, result.edit.start) + result.edit.text + text.slice(result.edit.end), result.text);
  else assert.equal(result.text, text);
  return result;
}

function pages(text: string) {
  const parsed = parseNativeManifest(text);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  return parsed.ok ? parsed.manifest.pages : {};
}

test("a first title turns the bare route into the object form, and only that line changes", () => {
  const result = edit(fixture, "/about/", "title", "About");
  assert.deepEqual(pages(result.text), { "/about/": { title: "About" } });
  assert.equal(result.text.split("\n").length, fixture.split("\n").length);
  assert.ok(result.text.includes('    "/about/": { "file": "src/pages/about.html", "title": "About" }\n'));
  assert.ok(result.text.startsWith(fixture.slice(0, fixture.indexOf('"/about/"'))));
  // An empty value on a bare route is nothing to do.
  assert.equal(edit(fixture, "/about/", "description", "").edit, null);
});

test("an existing string is replaced in place, with JSON escaping", () => {
  const first = edit(fixture, "/", "title", "Home").text;
  const result = edit(first, "/", "title", 'Say "hi" \\ there');
  assert.deepEqual(pages(result.text)["/"], { title: 'Say "hi" \\ there' });
  assert.equal(result.edit?.text, JSON.stringify('Say "hi" \\ there'));
  // The same value again is nothing to do.
  assert.equal(edit(result.text, "/", "title", 'Say "hi" \\ there').edit, null);
});

test("a second field joins the object; title goes after file, description at the end", () => {
  const withDescription = edit(fixture, "/", "description", "The home page").text;
  const both = edit(withDescription, "/", "title", "Home").text;
  assert.ok(both.includes('"/": { "file": "src/pages/index.html", "title": "Home", "description": "The home page" }'));
  const other = edit(edit(fixture, "/", "title", "Home").text, "/", "description", "The home page").text;
  assert.equal(other, both);
});

test("emptying a field removes it; emptying the last one restores the bare route", () => {
  const both = edit(edit(fixture, "/about/", "title", "About").text, "/about/", "description", "More").text;
  const noTitle = edit(both, "/about/", "title", "");
  assert.ok(noTitle.text.includes('"/about/": { "file": "src/pages/about.html", "description": "More" }'));
  assert.deepEqual(pages(noTitle.text), { "/about/": { description: "More" } });
  const bare = edit(noTitle.text, "/about/", "description", "");
  assert.equal(bare.text, fixture);
  assert.deepEqual(pages(bare.text), {});
  // Removing the first of two fields also leaves clean JSON.
  const noDescription = edit(both, "/about/", "description", "");
  assert.ok(noDescription.text.includes('"/about/": { "file": "src/pages/about.html", "title": "About" }'));
  // A field that is not there is nothing to do.
  assert.equal(edit(fixture, "/", "title", "").edit, null);
});

test("a route written one member per line keeps its indentation and key order", () => {
  const text = [
    "{",
    "\t\"version\": 1,",
    "\t\"routes\": {",
    "\t\t\"/\": \"src/pages/index.html\",",
    "\t\t\"/about/\": {",
    "\t\t\t\"description\": \"Old\",",
    "\t\t\t\"file\": \"src/pages/about.html\"",
    "\t\t}",
    "\t}",
    "}",
    "",
  ].join("\n");
  const titled = edit(text, "/about/", "title", "About").text;
  assert.ok(titled.includes("\t\t\t\"file\": \"src/pages/about.html\",\n\t\t\t\"title\": \"About\"\n\t\t}"));
  assert.deepEqual(pages(titled)["/about/"], { title: "About", description: "Old" });
  const changed = edit(titled, "/about/", "description", "New").text;
  assert.ok(changed.includes("\t\t\t\"description\": \"New\",\n"));
  const dropped = edit(changed, "/about/", "description", "").text;
  assert.ok(dropped.includes("\t\t\"/about/\": {\n\t\t\t\"file\": \"src/pages/about.html\",\n\t\t\t\"title\": \"About\"\n\t\t}"));
  assert.equal(edit(dropped, "/about/", "title", "").text, text.replace("{\n\t\t\t\"description\": \"Old\",\n\t\t\t\"file\": \"src/pages/about.html\"\n\t\t}", "\"src/pages/about.html\""));
});

test("unreadable manifests are reported, not guessed", () => {
  const broken = editNativePageMeta("{ \"routes\": { \"/\": ", "/", "title", "x");
  assert.equal(broken.ok, false);
  const number = editNativePageMeta("{ \"routes\": { \"/\": 3 } }", "/", "title", "x");
  assert.equal(number.ok, false);
  const list = editNativePageMeta("{ \"version\": 1, \"routes\": [] }", "/", "title", "x");
  assert.equal(list.ok, false);
});

test("a derived route with no entry gets a metadata-only one, and loses it when emptied", () => {
  const titled = edit(fixture, "/work/fern-and-kettle/", "title", "Fern & Kettle");
  assert.ok(titled.text.includes('    "/about/": "src/pages/about.html",\n    "/work/fern-and-kettle/": { "title": "Fern & Kettle" }\n  },'));
  const files = ["src/pages/index.html", "src/pages/about.html", "src/pages/work/fern-and-kettle.html"];
  const parsed = parseNativeManifest(titled.text, files);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.manifest.pages, { "/work/fern-and-kettle/": { title: "Fern & Kettle" } });
  assert.equal(parsed.manifest.routes["/work/fern-and-kettle/"], "src/pages/work/fern-and-kettle.html");
  const both = edit(titled.text, "/work/fern-and-kettle/", "description", "A café.").text;
  assert.ok(both.includes('"/work/fern-and-kettle/": { "title": "Fern & Kettle", "description": "A café." }'));
  const noTitle = edit(both, "/work/fern-and-kettle/", "title", "").text;
  assert.ok(noTitle.includes('"/work/fern-and-kettle/": { "description": "A café." }'));
  assert.equal(edit(noTitle, "/work/fern-and-kettle/", "description", "").text, fixture);
  // An empty value for a route with no entry is nothing to do.
  assert.equal(edit(fixture, "/work/", "description", "").edit, null);
});

test("a manifest without routes gets a routes object; an empty routes object gets the entry", () => {
  const bare = '{\n  "version": 1,\n  "styles": ["src/styles/site.css"]\n}\n';
  const titled = edit(bare, "/", "title", "Home").text;
  assert.equal(titled, '{\n  "version": 1,\n  "routes": { "/": { "title": "Home" } },\n  "styles": ["src/styles/site.css"]\n}\n');
  assert.equal(edit(titled, "/", "title", "").text, '{\n  "version": 1,\n  "routes": {},\n  "styles": ["src/styles/site.css"]\n}\n');
  assert.equal(edit('{ "version": 1, "routes": {} }', "/about/", "title", "About").text, '{ "version": 1, "routes": { "/about/": { "title": "About" } } }');
});

test("an object route with no members takes the field", () => {
  assert.equal(edit('{ "routes": { "/": {} } }', "/", "title", "x").text, '{ "routes": { "/": { "title": "x" } } }');
  // Removing from it has nothing to do.
  assert.equal(edit('{ "routes": { "/": {} } }', "/", "title", "").edit, null);
});

test("a manifest written with CRLF gets CRLF between new members", () => {
  const crlf = '{\r\n  "routes": {\r\n    "/": {\r\n      "file": "src/pages/index.html",\r\n      "description": "d"\r\n    }\r\n  }\r\n}\r\n';
  const result = edit(crlf, "/", "title", "Home");
  assert.equal(
    result.text,
    '{\r\n  "routes": {\r\n    "/": {\r\n      "file": "src/pages/index.html",\r\n      "title": "Home",\r\n      "description": "d"\r\n    }\r\n  }\r\n}\r\n',
  );
  assert.equal(result.text.includes("\n"), true);
  assert.equal(/[^\r]\n/.test(result.text), false);
});
