import assert from "node:assert/strict";
import test from "node:test";
import { nativeElementChoices, nativeElementMarkup, nativeChoiceMarkup } from "../src/page-builder/native-elements.ts";
import { addCatalog, filterCatalog } from "../src/page-builder/add-catalog.ts";
import { applyGuardedSourceEdit, nativeDestinations, nativeMarkupInsertEdit, nativeMoveEdit, nativeMoveToEdit } from "../src/page-builder/native-operations.ts";
const apply = (source: string, parent: number[], index: number, markup: string) => {
  const edit = nativeMarkupInsertEdit(source, parent, index, markup);
  return edit && applyGuardedSourceEdit(source, edit);
};
test("native catalogue joins components, searches groups, and writes portable escaped HTML", () => {
  const groups = addCatalog([{ tag: "feature-block", label: "Feature block" }, ...nativeElementChoices]);
  assert.deepEqual(groups.map((group) => group.name), ["Elements", "Forms", "Layout", "More sections"]);
  assert.equal(filterCatalog(groups, "Forms")[0].items.length, 6);
  assert.equal(nativeChoiceMarkup("missing"), undefined);
  assert.equal(nativeElementMarkup("heading", { text: '<img onerror="x"> &', className: 'site" onclick="x' }), '<h2 class="site&quot; onclick=&quot;x">&lt;img onerror=&quot;x&quot;&gt; &amp;</h2>');
  assert.equal(nativeElementMarkup("link-button", { href: "/contact", className: "site-cta" }), '<a class="site-cta" href="/contact">Learn more</a>');
  assert.throws(() => nativeElementMarkup("image", { src: "java\nscript:alert(1)" }));
  assert.throws(() => nativeElementMarkup("embed", { src: "data:text/html,x" }));
  assert.match(nativeElementMarkup("form"), /action="" method="post"/);
  assert.match(nativeElementMarkup("form", { action: "/send?a=1&b=2", method: "get" }), /action="\/send\?a=1&amp;b=2" method="get"/);
  for (const choice of nativeElementChoices) {
    const markup = nativeChoiceMarkup(choice.tag)!;
    assert.ok(apply("<main></main>", [0], 0, markup), choice.tag);
    assert.doesNotMatch(markup, /data-native|data-key|<script/);
  }
});
test("markup insertion preserves text, comments, neighbours and exact bounds", () => {
  const source = '<main><section>intro <!--keep--><p>A</p> between <p>B</p> tail</section></main>';
  assert.equal(apply(source, [0, 0], 1, '<hr>'), '<main><section>intro <!--keep--><p>A</p> between <hr>\n<p>B</p> tail</section></main>');
  const empty = '<main><section>text <!--keep--> </section></main>';
  assert.equal(apply(empty, [0, 0], 0, '<p>New</p>'), '<main><section>text <!--keep--> \n  <p>New</p>\n</section></main>');
  const edit = nativeMarkupInsertEdit(source, [0, 0], 1, '<hr>')!;
  assert.equal(edit.start, source.indexOf('<p>B'));
  assert.equal(edit.end, edit.start);
  assert.equal(edit.original, '');
  assert.equal(applyGuardedSourceEdit(source + ' ', edit), undefined);
});
test("CRLF and neighbour indentation survive multiline insertions", () => {
  const source = '<main>\r\n\t<section>\r\n\t\t<p>A</p>\r\n\t</section>\r\n</main>';
  const out = apply(source, [0, 0], 1, '<ul>\n  <li>New</li>\n</ul>')!;
  assert.equal(out, '<main>\r\n\t<section>\r\n\t\t<p>A</p>\r\n\t\t<ul>\r\n\t\t  <li>New</li>\r\n\t\t</ul>\r\n\t</section>\r\n</main>');
  assert.equal(/[^\r]\n/.test(out), false);
});
test("destinations use body-relative InsertPoint paths and readable placement", () => {
  const source = '<!doctype html><html><head><title>Page</title></head><body><main><section><p>Hi</p></section></main></body></html>';
  const points = nativeDestinations(source, 'index.html', [0, 0]);
  assert.deepEqual(points.map(({ point }) => [point.parent, point.index]), [[[0], 0], [[0], 1], [[0, 0], 1]]);
  assert.equal(points[2].description, 'Inside section, at the end');
  assert.ok(apply(source, points[2].point.parent, points[2].point.index, '<hr>'));
  assert.equal(nativeDestinations('<main><img src="x"></main>', 'x', [0, 0]).length, 2);
  assert.equal(nativeDestinations('<x-card></x-card>', 'x', [0]).length, 0);
});
test("invalid, repaired and incomplete HTML fails closed", () => {
  for (const source of ['<main><p>x</main>', '<main><p><div>x</div></p></main>', '<main><!--unclosed</main>', '<main><form><form></form></form></main>', '<html><main></main></html>', '<main foo="oops></main>', '<main><a><button>x</button></a></main>']) {
    assert.equal(apply(source, [0], 0, '<hr>'), undefined, source);
    assert.deepEqual(nativeDestinations(source, 'x', [0]), [], source);
  }
  for (const markup of ['<p>unclosed', '<div/>', '<p><div>x</div></p>', '<script>x</script>', '<form><form></form></form>', '<a><span><button>x</button></span></a>', '<a href="jav&#97;script:alert(1)">x</a>', '<iframe src="https://example.com"></iframe>', '<x-card></x-card>', '<html><body><p>x</p></body></html>']) assert.equal(apply('<main></main>', [0], 0, markup), undefined, markup);
  for (const container of ['p', 'h2', 'img', 'textarea', 'iframe', 'button', 'a', 'x-card']) {
    const source = container === 'img' ? '<main><img></main>' : `<main><${container}></${container}></main>`;
    assert.equal(apply(source, [0, 0], 0, '<p>x</p>'), undefined, container);
  }
  assert.equal(apply('<main><ul></ul></main>', [0, 0], 0, '<p>x</p>'), undefined);
  assert.equal(apply('<main><form><div></div></form></main>', [0, 0, 0], 0, '<form></form>'), undefined);
  assert.equal(apply('<main><form><ul></ul></form></main>', [0, 0, 0], 0, '<li><form action="" method="post"></form></li>'), undefined);
  assert.equal(apply('<main></main>', [0], 9, '<hr>'), undefined);
  assert.equal(apply('<main></main>', [0], -1, '<hr>'), undefined);
});
test("moves are one guarded edit, preserve site classes/comments and reject cycles", () => {
  const source = '<main><section class="a"><p class="site">A</p><!--keep--><p>B</p></section><section class="b"><p>C</p></section></main>';
  const edit = nativeMoveEdit(source, [0, 0, 0], { parent: [0, 1], index: 1 })!;
  assert.equal(applyGuardedSourceEdit(source, edit), '<main><section class="a"><!--keep--><p>B</p></section><section class="b"><p>C</p>\n<p class="site">A</p></section></main>');
  assert.equal(edit.original, source.slice(edit.start, edit.end));
  assert.equal(nativeMoveEdit(source, [0, 0], { parent: [0, 0], index: 1 }), undefined);
  assert.equal(nativeMoveEdit(source, [0, 0, 0], { parent: [0, 0], index: 1 }), undefined);
  assert.equal(nativeMoveEdit(source, [0, 1], { parent: [0, 0, 0], index: 0 }), undefined);
  const back = nativeMoveEdit(source, [0, 1, 0], { parent: [0, 0], index: 0 })!;
  assert.equal(applyGuardedSourceEdit(source, back), '<main><section class="a"><p>C</p>\n<p class="site">A</p><!--keep--><p>B</p></section><section class="b"></section></main>');
});

test("source paths mirror preview script removal, and same-parent move directions remain exact", () => {
  const source = '<main><script>if (a < b) run()</script><section><p>A</p><p>B</p><p>C</p></section></main>';
  assert.equal(nativeDestinations(source, 'x', [0, 0])[2].description, 'Inside section, at the end');
  const forward = nativeMoveToEdit(source, [0, 0, 0], [0, 0, 2], 'after')!;
  assert.equal(applyGuardedSourceEdit(source, forward), '<main><script>if (a < b) run()</script><section><p>B</p><p>C</p>\n<p>A</p></section></main>');
  const backward = nativeMoveToEdit(source, [0, 0, 2], [0, 0, 0], 'before')!;
  assert.equal(applyGuardedSourceEdit(source, backward), '<main><script>if (a < b) run()</script><section><p>C</p>\n<p>A</p><p>B</p></section></main>');
  assert.equal(apply('<main></main>', [0], 0, '<p>x</p><script>alert(1)</script>'), undefined);
});
test("cross-parent moves reindent multiline CRLF without changing site strings", () => {
  const source = '<main>\r\n  <section>\r\n    <div class="site">\r\n      <p>A</p>\r\n    </div>\r\n  </section>\r\n  <section></section>\r\n</main>';
  const edit = nativeMoveToEdit(source, [0, 0, 0], [0, 1], 'inside')!;
  const out = applyGuardedSourceEdit(source, edit)!;
  assert.ok(out.includes('<section>\r\n    <div class="site">\r\n      <p>A</p>\r\n    </div>\r\n  </section>'));
  assert.equal(/[^\r]\n/.test(out), false);
});
