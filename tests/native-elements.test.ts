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

test("all native URL inputs decode HTML5 attributes before scheme validation", () => {
  for (const value of ['javascript&colon;alert(1)', 'jav&#97script:alert(1)', 'jav&#x61script:alert(1)', 'java&Tab;script&colon;alert(1)']) {
    for (const attribute of ['href', 'src', 'action', 'formaction']) {
      assert.equal(apply('<main></main>', [0], 0, `<a ${attribute}="${value}">x</a>`), undefined, `${attribute}: ${value}`);
    }
    for (const kind of ['image', 'video', 'embed', 'link-button', 'form'] as const) {
      assert.throws(() => nativeElementMarkup(kind, { src: value, href: value, action: value }), `${kind}: ${value}`);
    }
  }
  assert.equal(nativeElementMarkup('link-button', { href: '/?a=1&amp;b=2' }), '<a href="/?a=1&amp;b=2">Learn more</a>');
  assert.ok(apply('<main></main>', [0], 0, '<a href="/?x=&notit;">x</a>'));
  assert.ok(apply('<main></main>', [0], 0, '<a href="/?x=&amp;colon;">x</a>'));
});

test("quoted fake attributes cannot satisfy sandbox, URL or form requirements", () => {
  for (const markup of [
    '<iframe title=" sandbox " src="https://example.com"></iframe>',
    '<a title=" href=safe " href="javascript:alert(1)">x</a>',
    "<a title=' href=safe ' href='javascript&colon;alert(1)'>x</a>",
    '<form title=" action=x method=post "></form>',
    '<form action="" title=" method=post "></form>',
    '<form method="post" title=" action=x "></form>',
    '<form action="" method="post extra"></form>',
  ]) assert.equal(apply('<main></main>', [0], 0, markup), undefined, markup);
  assert.ok(apply('<main></main>', [0], 0, '<form title=" action=x " action="" method="p&#111;st"></form>'));
  assert.ok(apply('<main></main>', [0], 0, '<iframe title=" sandbox " sandbox="" src="https://example.com"></iframe>'));
});

test("entity refresh metadata preserves preview child indexes", () => {
  for (const value of ['ref&#114;esh', 'ref&#114esh', 'ref&#x72;esh', 'REFRESH']) {
    const source = `<main><meta http-equiv="${value}"><section id="a"></section><section id="b"></section></main>`;
    const out = apply(source, [0, 1], 0, '<hr>')!;
    assert.ok(out.includes('<section id="a"></section><section id="b">\n  <hr>'), value);
    assert.ok(out.includes(`<meta http-equiv="${value}">`));
  }
  const source = '<main><meta title=" http-equiv=refresh " http-equiv="other"><section></section></main>';
  assert.ok(apply(source, [0, 1], 0, '<hr>'));
});

test("transparent phrasing descendants and controlled media cannot trigger browser repairs", () => {
  for (const markup of ['<p><small><div>x</div></small></p>', '<p><span><small><section>x</section></small></span></p>', '<button><small><video controls></video></small></button>', '<button><small><audio controls></audio></small></button>']) {
    assert.equal(apply('<main></main>', [0], 0, markup), undefined, markup);
    assert.equal(apply(`<main>${markup}</main>`, [0], 0, '<hr>'), undefined, markup);
  }
  assert.ok(apply('<main></main>', [0], 0, '<p><small><em>x</em></small></p>'));
});

test("native names exclude editor keys, foreign and unknown tags", () => {
  for (const name of ['native:text', 'native:heading', 'svg', 'math', 'unknown', 'x-card']) {
    assert.equal(apply('<main></main>', [0], 0, `<${name}></${name}>`), undefined, name);
  }
  for (const source of ['<main><template><p>x</p></template><section></section></main>', '<main><svg></svg><section></section></main>']) {
    assert.ok(apply(source, [0, 1], 0, '<hr>'));
    assert.equal(apply(source, [0, 0], 0, '<hr>'), undefined);
  }
});

test("insertions and moves preserve pre and raw content bytes including CRLF", () => {
  for (const content of ['A\nB', 'A\r\n  B\r\n\tC']) {
    for (const tag of ['textarea', 'pre']) {
      const markup = `<${tag}>${content}</${tag}>`;
      assert.ok(apply('<main>\r\n</main>', [0], 0, markup)!.includes(markup));
      const source = `<main>\r\n  <section>\r\n    <div>${markup}</div>\r\n  </section>\r\n  <section></section>\r\n</main>`;
      const edit = nativeMoveEdit(source, [0, 0, 0], { parent: [0, 1], index: 0 })!;
      assert.ok(applyGuardedSourceEdit(source, edit)!.includes(markup));
    }
  }
  const source = '<main><section><div><script>A\r\n  B</script><style>A\n B</style><pre><code>A\n B</code></pre></div></section><section></section></main>';
  const edit = nativeMoveEdit(source, [0, 0, 0], { parent: [0, 1], index: 0 })!;
  const out = applyGuardedSourceEdit(source, edit)!;
  for (const markup of ['<script>A\r\n  B</script>', '<style>A\n B</style>', '<pre><code>A\n B</code></pre>']) assert.ok(out.includes(markup));
});

test("raw closing delimiters fail closed and adjacent URL contexts use HTML5 decoding", () => {
  assert.equal(apply('<main><script>A</script foo><section></section></script><section></section></main>', [0, 0], 0, '<hr>'), undefined);
  assert.ok(apply('<main><script>A</scriptx>B</script><section></section></main>', [0, 0], 0, '<hr>'));
  for (const attribute of ['poster', 'cite', 'data', 'background', 'longdesc', 'manifest', 'usemap']) {
    assert.equal(apply('<main></main>', [0], 0, `<div ${attribute}="javascript&colon;x"></div>`), undefined, attribute);
  }
  for (const attribute of ['srcset', 'imagesrcset', 'ping', 'archive']) assert.equal(apply('<main></main>', [0], 0, `<img ${attribute}="safe.jpg, javascript&colon;x">`), undefined);
});

test('unrelated opaque islands retain bytes and count as one preview element each', () => {
  const islands = ['<svg viewBox="0 0 10 10"><path d="M0 0"/><foreignObject><div><p>Label</p></div></foreignObject></svg>', '<math><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></math>', '<template data-each="/notes/"><p>{title}</p><template><p>Nested</p></template></template>', '<x-card><script>ignored()</script><span>Light</span><div><p>Text</p></div></x-card>', '<noscript><div>Fallback</div></noscript>'];
  const source = '<main>' + islands.join('') + '<section id="outside"><p>Existing</p></section></main>';
  const out = apply(source, [0, islands.length], 1, '<hr>')!;
  assert.ok(out.includes('<p>Existing</p>\n<hr>'));
  for (const island of islands) assert.ok(out.includes(island), island);
  for (let index=0;index<islands.length;index++) {
    assert.deepEqual(nativeDestinations(source,'index.html',[0,index]).map(d=>d.placement), ['before','after']);
    assert.equal(apply(source,[0,index],0,'<hr>'),undefined);
    assert.equal(apply(source,[0,index,0],0,'<hr>'),undefined);
    assert.equal(nativeMoveEdit(source,[0,index],{parent:[0,islands.length],index:0}),undefined);
  }
});
test('outside moves and moves of ordinary wrappers preserve entire opaque byte ranges', () => {
  const opaque='<x-card>\r\n  <template><p>{title}</p></template>\n <svg><path d="M 1 2"/></svg>\r\n</x-card>';
  const source='<main>\r\n  <section><div>'+opaque+'</div><p>A</p></section>\r\n  <section><p>B</p></section>\r\n</main>';
  const edit=nativeMoveEdit(source,[0,0,0],{parent:[0,1],index:1})!;
  assert.ok(edit); assert.ok(applyGuardedSourceEdit(source,edit)!.includes(opaque));
  assert.equal(nativeMoveEdit(source,[0,0,0,0,0],{parent:[0,1],index:0}),undefined);
  assert.equal(nativeMoveEdit(source,[0,0,1],{parent:[0,0,0,0],index:0}),undefined);
});
test('foreign namespace integration is bounded and escaping or malformed islands fail closed', () => {
  for (const island of ['<svg><g><div>breakout</div></g></svg>', '<svg><font color="red">breakout</font></svg>', '<svg><path></svg>', '<svg><foreignObject><p><div>repair</div></p></foreignObject></svg>', '<x-card><p><div>repair</div></p></x-card>', '<x-card/>', '<template><p>x</template>', '<template><template></template>', '<math><mrow><p>breakout</p></mrow></math>']) {
    assert.equal(apply('<main>'+island+'<section></section></main>',[0,1],0,'<hr>'),undefined,island);
  }
  for(const island of ['<svg><foreignObject><div>HTML</div></foreignObject></svg>', '<math><mtext><span>HTML</span></mtext></math>', '<math><annotation-xml encoding="text/html"><div>HTML</div></annotation-xml></math>']) assert.ok(apply('<main>'+island+'<section></section></main>',[0,1],0,'<hr>'),island);
});

test('legal inline islands and inert templates do not reject unrelated ordinary targets', () => {
  for(const island of ['<p><x-label><span>Inline</span></x-label></p>', '<p><svg><path/></svg></p>', '<p><template><div>Separate content</div></template>Text</p>', '<ul><template><li>Example</li></template><li>Existing</li></ul>']) {
    assert.ok(apply('<main>'+island+'<section></section></main>',[0,1],0,'<hr>'),island);
  }
  assert.equal(apply('<main><p><x-label><div>Repair</div></x-label></p><section></section></main>',[0,1],0,'<hr>'),undefined);
});

test('foreign self-closing syntax follows attribute state rather than trailing slash appearance', () => {
  const wrongPath='<main><svg data-x=x/><section id="island"></section><div id="target"></div></main>';
  assert.equal(apply(wrongPath,[0,1],0,'<hr>'),undefined);
  assert.deepEqual(nativeDestinations(wrongPath,'index.html',[0,1]),[]);
  for(const markup of ['<svg / >','<svg data-x="x"/ >','<svg data-x=x/>']) assert.equal(apply('<main>'+markup+'<section></section></main>',[0,1],0,'<hr>'),undefined,markup);
  for(const markup of ['<svg/>','<svg data-x="x"/>','<svg data-x=x />','<svg data-x=x/><g/></svg>']) {
    const out=apply('<main>'+markup+'<section id="target"></section></main>',[0,1],0,'<hr>');
    assert.ok(out?.includes('<section id="target">\n  <hr>'),markup);
    assert.ok(out?.includes(markup));
  }
});
test('foreign integration content has local semantic validation without crossing outer phrasing boundaries', () => {
  const island='<p><svg><foreignObject><div>Label</div></foreignObject></svg></p>';
  assert.ok(apply('<main>'+island+'<section></section></main>',[0,1],0,'<hr>')?.includes(island));
  const malformed='<p><svg><foreignObject><p><div>Repair</div></p></foreignObject></svg></p>';
  assert.equal(apply('<main>'+malformed+'<section></section></main>',[0,1],0,'<hr>'),undefined);
});

test('non-HTML Unicode whitespace cannot turn an unquoted value or tag name into a self-closing flag', () => {
  for(const char of ['\u00a0','\u000b','\ufeff']) {
    for(const opening of [`<svg data-x=x${char}/>`,`<svg${char}/>`]) {
      const source=`<main>${opening}<section id="island"></section><div id="target"></div></main>`;
      assert.equal(apply(source,[0,1],0,'<hr>'),undefined,JSON.stringify(opening));
      assert.deepEqual(nativeDestinations(source,'index.html',[0,1]),[]);
    }
    const quoted=`<svg data-x="x${char}"/>`;
    assert.ok(apply(`<main>${quoted}<section id="target"></section></main>`,[0,1],0,'<hr>')?.includes(quoted));
    assert.equal(apply(`<main><svg></svg${char}><section></section></main>`,[0,1],0,'<hr>'),undefined);
  }
  for(const char of ['\t','\n','\f','\r',' ']) assert.ok(apply(`<main><svg data-x=x${char}/><section></section></main>`,[0,1],0,'<hr>'));
});
