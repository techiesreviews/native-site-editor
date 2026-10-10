// Slice 82: any element moves anywhere HTML's content rules allow.
import assert from "node:assert/strict";
import test from "node:test";
import { applyGuardedSourceEdit, nativeMoveEdit, nativeMoveRefusal } from "../src/page-builder/native-operations.ts";
import { templateKeyMove } from "../src/page-builder/native-move-choices.ts";
import { templateSlotRefusal } from "../src/page-builder/native-elements.ts";

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

test("Alt+arrows on a template's part move its slot with it, by the template's rule (slice 82)", () => {
  const template = '<section><slot name="eyebrow"><p>E</p></slot><slot name="title"><h1>T</h1></slot><div class="actions"><a href="/x">X</a></div><p>Last</p></section>';
  const run = (at: number[], direction: "up" | "down" | "out" | "in") => {
    const result = templateKeyMove(template, at, direction);
    return result.status === "moved" ? { html: applyGuardedSourceEdit(template, result.edit)!.replace(/\s+(?=<)/g, ""), selection: result.selection } : result;
  };
  assert.deepEqual(run([0, 0, 0], "down"), { html: '<section><slot name="title"><h1>T</h1></slot><slot name="eyebrow"><p>E</p></slot><div class="actions"><a href="/x">X</a></div><p>Last</p></section>', selection: [0, 1, 0] });
  assert.deepEqual(run([0, 0, 0], "up"), { status: "stayed", reason: "edge" });
  // Into the Div above, at its end; out of it again, after it.
  assert.deepEqual(run([0, 3], "in"), { html: '<section><slot name="eyebrow"><p>E</p></slot><slot name="title"><h1>T</h1></slot><div class="actions"><a href="/x">X</a><p>Last</p></div></section>', selection: [0, 2, 1] });
  assert.equal((run([0, 2, 0], "out") as { html: string }).html, '<section><slot name="eyebrow"><p>E</p></slot><slot name="title"><h1>T</h1></slot><div class="actions"></div><a href="/x">X</a><p>Last</p></section>');
  // Never into a named slot, out of the template's element, or for the root.
  assert.deepEqual(run([0, 2], "in"), { status: "refused", error: templateSlotRefusal("title") });
  assert.deepEqual(run([0, 2], "out"), { status: "refused", error: "Parts go inside the template's element, not beside it." });
  assert.equal(run([0], "down").status, "refused");
});

test("restricted containers refuse what they can't hold, descendants included", () => {
  const source = '<main><address><p>a</p></address><picture><img src="a.png" alt=""></picture><dl><dt>t</dt></dl><h2>H</h2><div><h3>In</h3></div><span>s</span><section><p>x</p></section></main>';
  assert.equal(nativeMoveRefusal(source, [0, 3], [0, 0]), "An <h2> can't go inside an <address>.");
  assert.equal(nativeMoveRefusal(source, [0, 4], [0, 0]), "An <h3> can't go inside an <address>.");
  assert.equal(nativeMoveRefusal(source, [0, 5], [0, 1]), "A <span> can't go inside a <picture>.");
  assert.equal(nativeMoveRefusal(source, [0, 6], [0, 2, 0]), "A <section> can't go inside a <dt>.");
  assert.equal(nativeMoveRefusal(source, [0, 5], [0, 0]), undefined);
  assert.equal(nativeMoveRefusal(source, [0, 0], [0, 6]), undefined);
});

test("into a paragraph written over several lines, the link stays on the text's line", () => {
  const source = '<main>\n  <p>\n    Text\n  </p>\n  <div>\n    <a href="/x">X</a>\n  </div>\n</main>';
  const edit = nativeMoveEdit(source, [0, 1, 0], { parent: [0, 0], index: 0 })!;
  assert.equal(applyGuardedSourceEdit(source, edit), '<main>\n  <p>\n    Text <a href="/x">X</a>\n  </p>\n  <div>\n  </div>\n</main>');
});
