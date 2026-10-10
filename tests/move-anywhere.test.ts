// Slice 82: any element moves anywhere HTML's content rules allow.
import assert from "node:assert/strict";
import test from "node:test";
import { applyGuardedSourceEdit, nativeMoveEdit, nativeMoveRefusal } from "../src/page-builder/native-operations.ts";

const page = `<main>
  <section>
    <h2>Title</h2>
    <p>One <a href="/a">link</a> here.</p>
    <p>Two</p>
    <div class="flow"><p>Inside</p></div>
  </section>
</main>`;

test("the content model allows a heading into <main>, a link into a paragraph, a paragraph into a Div", () => {
  assert.equal(nativeMoveRefusal(page, [0, 0, 0], [0]), undefined);
  assert.equal(nativeMoveRefusal(page, [0, 0, 1, 0], [0, 0, 2]), undefined);
  assert.equal(nativeMoveRefusal(page, [0, 0, 2], [0, 0, 3]), undefined);
});

test("the content model refuses with its reason", () => {
  assert.equal(nativeMoveRefusal(page, [0, 0, 3], [0, 0, 1]), "A <div> can't go inside a <p>.");
  assert.equal(nativeMoveRefusal(page, [0, 0, 0], [0, 0, 2]), "An <h2> can't go inside a <p>.");
  assert.equal(nativeMoveRefusal(page, [0, 0, 1], [0, 0, 2]), "A <p> can't go inside a <p>.");
  const links = '<main><p><a href="/x">x</a></p><a href="/y">y</a></main>';
  assert.equal(nativeMoveRefusal(links, [0, 1], [0, 0, 0]), "An <a> can't go inside an <a>.");
  const list = "<main><ul><li>a</li></ul><p>p</p><div></div></main>";
  assert.equal(nativeMoveRefusal(list, [0, 0, 0], [0, 1]), "A <li> can't go inside a <p>.");
  assert.equal(nativeMoveRefusal(list, [0, 1], [0, 0]), "A <p> can't go inside a <ul>.");
  assert.equal(nativeMoveRefusal(list, [0, 0, 0], [0, 2]), "A <li> can't go inside a <div>.");
  assert.equal(nativeMoveRefusal(page, [0, 0], [0, 0, 3]), "A block cannot go inside itself.");
  assert.equal(nativeMoveRefusal('<main><img src="a.png"><p>t</p></main>', [0, 1], [0, 0]), "A <p> can't go inside an <img>.");
});

test("a component's parts stay sealed; its instance moves whole into a paragraph's parent only", () => {
  const source = '<main><card-x><h3 slot="title">T</h3></card-x><div></div></main>';
  assert.equal(nativeMoveRefusal(source, [0, 1], [0, 0]), "Its parts belong to the component: open it to change them.");
  assert.equal(nativeMoveRefusal(source, [0, 0], [0, 1]), undefined);
});

test("a move into a line of text stays on that line, a space apart", () => {
  const into = nativeMoveEdit(page, [0, 0, 1, 0], { parent: [0, 0, 2], index: 0 })!;
  assert.match(applyGuardedSourceEdit(page, into)!, /<p>One {2}here\.<\/p>\n {4}<p>Two <a href="\/a">link<\/a><\/p>/);
  const before = nativeMoveEdit('<main><p>A <em>b</em></p><p><a href="/x">x</a></p></main>', [0, 1, 0], { parent: [0, 0], index: 0 })!;
  assert.equal(applyGuardedSourceEdit(before.source, before), '<main><p>A <a href="/x">x</a> <em>b</em></p><p></p></main>');
  const after = nativeMoveEdit('<main><p>A <em>b</em></p><p><a href="/x">x</a></p></main>', [0, 1, 0], { parent: [0, 0], index: 1 })!;
  assert.equal(applyGuardedSourceEdit(after.source, after), '<main><p>A <em>b</em> <a href="/x">x</a></p><p></p></main>');
  // Out of the text into a Div: a line of its own again.
  const out = nativeMoveEdit(page, [0, 0, 1, 0], { parent: [0, 0, 3], index: 1 })!;
  assert.match(applyGuardedSourceEdit(page, out)!, /<p>Inside<\/p>\n<a href="\/a">link<\/a><\/div>/);
});
