import test from "node:test";
import assert from "node:assert/strict";
import { blockMarkup, clickTarget, type BlockTarget } from "../src/page-builder/block-insert.ts";
import { applyGuardedSourceEdit, nativeMarkupInsertEdit } from "../src/page-builder/native-operations.ts";
import type { NativeElementKind } from "../src/page-builder/native-elements.ts";

// Body paths: <site-header> [0], <main> [1], <site-footer> [2].
const page = (main: string) => `<!doctype html><html><head><title>T</title></head><body><site-header></site-header><main class="page">${main}</main><site-footer></site-footer></body></html>`;
const home = page('<section-hero><h1 slot="title">Hi</h1></section-hero><section class="flow" id="work"><h2>Recent work</h2><p>Intro</p><div class="cards"><card-project><h3 slot="title">A</h3></card-project></div><ul><li>One</li></ul></section><section class="flow"><h2>Contact</h2></section>');
const ok = (target: BlockTarget) => { assert.ok(target.ok, target.ok ? "" : target.reason); return target; };
const at = (target: BlockTarget) => { const t = ok(target); return { parent: t.parent, index: t.index, wrap: t.wrap }; };

test("a selected Section or Div takes the block inside, at the end", () => {
  assert.deepEqual(at(clickTarget(home, "paragraph", [1, 1])), { parent: [1, 1], index: 4, wrap: false });
  assert.deepEqual(at(clickTarget(home, "div", [1, 1])), { parent: [1, 1], index: 4, wrap: false });
  assert.deepEqual(at(clickTarget(home, "heading", [1, 1, 2])), { parent: [1, 1, 2], index: 1, wrap: false });
  const target = ok(clickTarget(home, "image", [1, 2]));
  assert.equal(target.where, "Into Section “Contact” › after Heading");
  assert.deepEqual(target.select, [1, 2, 1]);
});

test("a selected leaf takes the block right after it, in its container", () => {
  const target = ok(clickTarget(home, "paragraph", [1, 1, 0]));
  assert.deepEqual([target.parent, target.index], [[1, 1], 1]);
  assert.equal(target.where, "Into Section “Recent work” › after Heading");
  // Inside a list or inline text: after the element that sits in the Section.
  assert.deepEqual(at(clickTarget(home, "button", [1, 1, 3, 0])), { parent: [1, 1], index: 4, wrap: false });
  assert.deepEqual(at(clickTarget(page('<section><p>Hi <a class="btn" href="#">Go</a></p></section>'), "image", [1, 0, 0, 0])), { parent: [1, 0], index: 1, wrap: false });
  // Blocks go only into a Section or a Div (ticket 10): a figure's image takes the block after the figure.
  assert.deepEqual(at(clickTarget(page('<section><figure><img src="/a.png" alt=""></figure><p>B</p></section>'), "paragraph", [1, 0, 0, 0])), { parent: [1, 0], index: 1, wrap: false });
});

test("a Section always goes after the selection's page band, never nested", () => {
  for (const selection of [[1, 1], [1, 1, 0], [1, 1, 2], [1, 1, 2, 0], [1, 1, 3, 0]]) {
    const target = ok(clickTarget(home, "section", selection));
    assert.deepEqual([target.parent, target.index], [[1], 2], String(selection));
    assert.equal(target.where, "Between page bands › after “Recent work”");
  }
  // A component band, its slotted content, and the page's header and footer.
  assert.deepEqual(at(clickTarget(home, "section", [1, 0, 0])), { parent: [1], index: 1, wrap: false });
  assert.equal(ok(clickTarget(home, "section", [1, 0])).where, "Between page bands › after Section hero");
  assert.deepEqual(at(clickTarget(home, "section", [0])), { parent: [1], index: 0, wrap: false });
  assert.deepEqual(at(clickTarget(home, "section", [2])), { parent: [1], index: 3, wrap: false });
  assert.equal(ok(clickTarget(home, "section", [0])).where, "Between page bands › before Section hero");
});

test("with nothing selected, a Section goes after the last band and other blocks into the last Section", () => {
  for (const selection of [undefined, [], [1], [7, 7]]) {
    assert.deepEqual(at(clickTarget(home, "section", selection)), { parent: [1], index: 3, wrap: false });
    assert.deepEqual(at(clickTarget(home, "heading", selection)), { parent: [1, 2], index: 1, wrap: false });
  }
  // The last plain Section, not a section component after it.
  assert.deepEqual(at(clickTarget(page('<section><p>A</p></section><section-hero></section-hero>'), "paragraph")), { parent: [1, 0], index: 1, wrap: false });
});

test("with no Section yet, a block comes in a new Section after the last band", () => {
  for (const main of ["", "<section-hero></section-hero>"]) {
    const source = page(main);
    const target = ok(clickTarget(source, "paragraph"));
    assert.deepEqual([target.parent, target.index, target.wrap, target.select], [[1], main ? 1 : 0, true, [1, main ? 1 : 0, 0]]);
    assert.equal(target.where, "Into a new Section › Paragraph");
    const markup = blockMarkup(source, "heading", target.parent, true);
    assert.equal(markup, '<section class="flow">\n  <h2>Heading</h2>\n</section>');
    assert.ok(nativeMarkupInsertEdit(source, target.parent, target.index, markup));
  }
  assert.equal(ok(clickTarget(page(""), "section")).where, "Between page bands › the first");
});

test("components refuse blocks with the reason; so do bands that are no Section or Div", () => {
  for (const selection of [[1, 0], [1, 0, 0], [1, 1, 2, 0], [0], [2]]) {
    const target = clickTarget(home, "paragraph", selection);
    assert.equal(target.ok, false, String(selection));
    if (!target.ok) assert.match(target.reason, /is a component: .*Select a Section or a Div\./);
  }
  const band = clickTarget(page("<article><p>Hi</p></article>"), "paragraph", [1, 0, 0]);
  assert.equal(band.ok, false);
  if (!band.ok) assert.match(band.reason, /not straight between page bands/);
  assert.equal(clickTarget("<body><section></section></body>", "paragraph").ok, false);
  assert.equal(clickTarget(page("<section><div></section>"), "paragraph").ok, false);
});

test("Heading levels follow the place: h2 in a Section, one below per Div", () => {
  assert.equal(blockMarkup(home, "heading", [1, 2]), "<h2>Heading</h2>");
  assert.equal(blockMarkup(home, "heading", [1, 1, 2]), "<h3>Heading</h3>");
  assert.equal(blockMarkup(home, "image", [1, 2]), '<img src="/images/placeholder.svg" alt="" width="640" height="400">');
});

test("clicking Section, Div, Heading, Paragraph in turn builds a nested page, selecting each", () => {
  let source = page('<section class="flow"><h2>Old</h2></section>');
  let selection: number[] | undefined;
  for (const kind of ["section", "div", "heading", "paragraph"] as NativeElementKind[]) {
    const target = ok(clickTarget(source, kind, selection));
    const edit = nativeMarkupInsertEdit(source, target.parent, target.index, blockMarkup(source, kind, target.parent, target.wrap))!;
    source = applyGuardedSourceEdit(source, edit)!;
    selection = target.select;
  }
  assert.deepEqual(selection, [1, 1, 0, 1]);
  assert.match(source.replace(/\s+(?=<)/g, ""), /<section class="flow"><h2>Old<\/h2><\/section><section class="flow"><div class="flow"><h3>Heading<\/h3><p>Text<\/p><\/div><\/section><\/main>/);
});
