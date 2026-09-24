import assert from "node:assert/strict";
import test from "node:test";
import { startTags, type ElementRange } from "../src/native-source-location.ts";
import { altFromPath, duplicateEdit, previousHeadingLevel, removeEdit, setAttributeEdit, swapEdits } from "../src/native-structure.ts";

const apply = (source: string, edits: { start: number; end: number; text: string }[]) =>
  [...edits].sort((a, b) => b.start - a.start).reduce((out, edit) => out.slice(0, edit.start) + edit.text + out.slice(edit.end), source);

// The outer range of the `index`-th start tag, closed by the next end tag of its name (or void).
function rangeAt(source: string, index: number): ElementRange {
  const tag = startTags(source)[index];
  const closeAt = source.indexOf(`</${tag.name}>`, tag.end);
  if (tag.name === "img" || closeAt < 0) return { tag, start: tag.start, end: tag.end };
  const close = { start: closeAt, end: closeAt + tag.name.length + 3 };
  return { tag, start: tag.start, end: close.end, close };
}

const page = `<main>
  <section class="a" data-key="a">
    <h2>A</h2>
  </section>
  <section class="b" data-key="b"><p>B</p></section>
  <img src="x.png" alt="">
</main>`;

test("remove takes the element's own lines", () => {
  const a = rangeAt(page, 1);
  assert.equal(apply(page, [removeEdit(page, a)]), `<main>\n  <section class="b" data-key="b"><p>B</p></section>\n  <img src="x.png" alt="">\n</main>`);
  const inline = `<p><b>x</b><i>y</i></p>`;
  const b = rangeAt(inline, 1);
  assert.equal(apply(inline, [removeEdit(inline, b)]), `<p><i>y</i></p>`);
});

test("duplicate copies the element after itself with a fresh data-key", () => {
  const a = rangeAt(page, 1);
  assert.equal(
    apply(page, [duplicateEdit(page, a)]),
    `<main>\n  <section class="a" data-key="a">\n    <h2>A</h2>\n  </section>\n  <section class="a" data-key="a-2">\n    <h2>A</h2>\n  </section>\n  <section class="b" data-key="b"><p>B</p></section>\n  <img src="x.png" alt="">\n</main>`,
  );
  const inline = `<p><b>x</b></p>`;
  assert.equal(apply(inline, [duplicateEdit(inline, rangeAt(inline, 1))]), `<p><b>x</b>\n<b>x</b></p>`);
});

test("swap exchanges two siblings and keeps what lies between", () => {
  const a = rangeAt(page, 1);
  const b = rangeAt(page, 3);
  const swapped = apply(page, swapEdits(page, a, b));
  assert.equal(swapped, `<main>\n  <section class="b" data-key="b"><p>B</p></section>\n  <section class="a" data-key="a">\n    <h2>A</h2>\n  </section>\n  <img src="x.png" alt="">\n</main>`);
  assert.deepEqual(swapEdits(page, a, a), []);
});

test("attributes are set, added, quoted and removed on the start tag", () => {
  const img = rangeAt(page, 5);
  assert.equal(apply(page, [setAttributeEdit(page, img.tag, "src", "y.jpg")]).includes(`<img src="y.jpg" alt="">`), true);
  assert.equal(apply(page, [setAttributeEdit(page, img.tag, "alt", `A "quoted" & thing`)]).includes(`alt="A &quot;quoted&quot; &amp; thing"`), true);
  assert.equal(apply(page, [setAttributeEdit(page, img.tag, "alt", undefined)]).includes(`<img src="x.png">`), true);
  assert.equal(apply(page, [setAttributeEdit(page, img.tag, "loading", "lazy")]).includes(`<img src="x.png" alt="" loading="lazy">`), true);
  const bare = `<img src="x.png" alt>`;
  assert.equal(apply(bare, [setAttributeEdit(bare, rangeAt(bare, 0).tag, "alt", "Hi")]), `<img src="x.png" alt="Hi">`);
  const closed = `<img src="x.png" />`;
  assert.equal(apply(closed, [setAttributeEdit(closed, rangeAt(closed, 0).tag, "alt", "Hi")]), `<img src="x.png" alt="Hi" />`);
});

test("alt text from a file name, and the heading level before a point", () => {
  assert.equal(altFromPath("src/images/studio-desk@2x.jpg"), "Studio desk");
  assert.equal(altFromPath("https://x.test/a/team_photo.png?x=1"), "Team photo");
  assert.equal(altFromPath(""), "");
  const source = `<h1>a</h1><p>x</p><h2>b</h2><h4>c</h4>`;
  assert.equal(previousHeadingLevel(source, source.indexOf("<h4")), 2);
  assert.equal(previousHeadingLevel(source, 0), 0);
});
