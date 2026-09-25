import assert from "node:assert/strict";
import test from "node:test";
import { startTags, type ElementRange } from "../src/native-source-location.ts";
import { altFromPath, duplicateEdit, moveEdit, nativeKindLabel, previousHeadingLevel, removeEdit, setAttributeEdit, structureLabel, swapEdits } from "../src/native-structure.ts";

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

test("moveEdit carries an element's lines to another gap among its siblings", () => {
  // Siblings of <main>: section a (0), section b (1), img (2); start-tag indexes 1, 3 and 5.
  const sibling = (at: number) => [1, 3, 5][at] === undefined ? undefined : rangeAt(page, [1, 3, 5][at]);
  const a = sibling(0)!;
  const img = sibling(2)!;
  // A to the end (gap 3): one removal, one insertion, ascending, not overlapping.
  const down = moveEdit(page, a, 0, 3, sibling);
  assert.equal(down.length, 2);
  assert.ok(down[0].end <= down[1].start);
  assert.equal(apply(page, down), `<main>\n  <section class="b" data-key="b"><p>B</p></section>\n  <img src="x.png" alt="">\n  <section class="a" data-key="a">\n    <h2>A</h2>\n  </section>\n</main>`);
  // The image to the front (gap 0).
  assert.equal(apply(page, moveEdit(page, img, 2, 0, sibling)), `<main>\n  <img src="x.png" alt="">\n  <section class="a" data-key="a">\n    <h2>A</h2>\n  </section>\n  <section class="b" data-key="b"><p>B</p></section>\n</main>`);
  // A to gap 2 (between b and the image) is the same as one step down.
  assert.equal(apply(page, moveEdit(page, a, 0, 2, sibling)), apply(page, swapEdits(page, a, sibling(1)!)));
  // Its own gap, the gap right after it, a gap that is not there: nothing moves.
  assert.deepEqual(moveEdit(page, a, 0, 0, sibling), []);
  assert.deepEqual(moveEdit(page, a, 0, 1, sibling), []);
  assert.deepEqual(moveEdit(page, a, 0, 4, sibling), []);
  assert.deepEqual(moveEdit(page, img, 2, 3, sibling), []);
  // Indentation travels with the element, and a neighbour that ends its line
  // without a newline gets the newline before the moved block.
  const tight = `<div>\n    <p>one</p>\n    <p>two</p></div>`;
  const tightSibling = (at: number) => rangeAt(tight, at + 1);
  assert.equal(apply(tight, moveEdit(tight, tightSibling(0), 0, 2, tightSibling)), `<div>\n    <p>two</p>\n    <p>one</p></div>`);
  const inline = `<p><b>x</b><i>y</i><u>z</u></p>`;
  const inlineSibling = (at: number) => rangeAt(inline, at + 1);
  assert.equal(apply(inline, moveEdit(inline, inlineSibling(2), 2, 0, inlineSibling)), `<p><u>z</u><b>x</b><i>y</i></p>`);
});

test("moveEdit keeps lines apart when the moved block has no newline of its own", () => {
  // The last element at the end of the file without a final newline.
  const eof = `<section>A</section>\n<section>B</section>\n<section>C</section>`;
  const eofSibling = (at: number) => rangeAt(eof, at);
  assert.equal(apply(eof, moveEdit(eof, eofSibling(2), 2, 0, eofSibling)), `<section>C</section>\n<section>A</section>\n<section>B</section>`);
  assert.equal(apply(eof, moveEdit(eof, eofSibling(2), 2, 1, eofSibling)), `<section>A</section>\n<section>C</section>\n<section>B</section>`);
  // The last child on the same line as the parent's end tag.
  const closed = `<main>\n  <section>A</section>\n  <section>B</section>\n  <section>C</section></main>`;
  const closedSibling = (at: number) => rangeAt(closed, at + 1);
  assert.equal(apply(closed, moveEdit(closed, closedSibling(2), 2, 0, closedSibling)), `<main>\n  <section>C</section>\n  <section>A</section>\n  <section>B</section></main>`);
  // And back: the first child to the end lands before the end tag, as before.
  const moved = `<main>\n  <section>C</section>\n  <section>A</section>\n  <section>B</section></main>`;
  const movedSibling = (at: number) => rangeAt(moved, at + 1);
  assert.equal(apply(moved, moveEdit(moved, movedSibling(0), 0, 3, movedSibling)), closed);
  // CRLF sources keep their line endings.
  const crlf = `<main>\r\n  <section>A</section>\r\n  <section>B</section>\r\n  <section>C</section></main>`;
  const crlfSibling = (at: number) => rangeAt(crlf, at + 1);
  assert.equal(apply(crlf, moveEdit(crlf, crlfSibling(2), 2, 0, crlfSibling)), `<main>\r\n  <section>C</section>\r\n  <section>A</section>\r\n  <section>B</section></main>`);
  assert.equal(apply(crlf, moveEdit(crlf, crlfSibling(0), 0, 3, crlfSibling)), `<main>\r\n  <section>B</section>\r\n  <section>C</section>\r\n  <section>A</section></main>`);
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

test("nativeKindLabel names elements in the user's words and leaves other tags as they are", () => {
  assert.equal(nativeKindLabel("h3"), "Heading");
  assert.equal(nativeKindLabel("p"), "Paragraph");
  assert.equal(nativeKindLabel("section"), "Section");
  assert.equal(nativeKindLabel("project-card"), "project-card");
});

test("structureLabel names a container by its first heading and an atom by its own text", () => {
  const none = { length: 0 };
  assert.deepEqual(structureLabel({ tag: "section", text: "Intro Hello there", heading: "Intro", children: { length: 2 } }, false), { kind: "Section", text: "Intro" });
  assert.deepEqual(structureLabel({ tag: "section", text: "Only text", heading: "", children: { length: 1 } }, false), { kind: "Section", text: "" });
  assert.deepEqual(structureLabel({ tag: "p", text: "Hello there", heading: "", children: none }, false), { kind: "Paragraph", text: "Hello there" });
  // A component instance is a container even without slotted children.
  assert.deepEqual(structureLabel({ tag: "project-card", text: "Reusable cards", heading: "Reusable cards", children: none }, true), { kind: "Project card", text: "Reusable cards" });
  assert.deepEqual(structureLabel({ tag: "site-header", text: "", heading: "", children: none }, true), { kind: "Site header", text: "" });
  // Long text is cut with an ellipsis.
  const long = "x".repeat(70);
  assert.equal(structureLabel({ tag: "p", text: long, heading: "", children: none }, false).text, `${"x".repeat(59)}…`);
});
