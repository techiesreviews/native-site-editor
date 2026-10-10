import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { nativeDestinations, nativeMarkupInsertEdit, nativeMoveEdit, nativeMoveDestinationValid, nativeMovableBlock, nativeEditInside, applyGuardedSourceEdit } from "../src/page-builder/native-operations.ts";
import { nativeElementMovePlan } from "../src/page-builder/block-move-rules.ts";

test("definition-item auto-closing cannot turn preview paths into different source targets", async () => {
  const source = '<dl><dt><dd></dd></dt><dd><main></main></dd><dd><div></div></dd><dd><div></div></dd></dl>';
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(); await page.setContent(source);
    const proof = await page.locator('dl').evaluate(el => ({children:Array.from(el.children).map(child=>child.localName), target:el.children[2].children[0].localName}));
    assert.deepEqual(proof, {children:['dt','dd','dd','dd','dd'],target:'main'});
    assert.deepEqual(nativeDestinations(source, 'index.html', [0,2,0]), []);
    assert.equal(nativeMarkupInsertEdit(source,[0,2,0],0,'<h2>New</h2>'),undefined);
    for(const names of [['dt','dt'],['dt','dd'],['dd','dt'],['dd','dd']]) {
      const invalid=`<main><dl><${names[0]}><div><${names[1]}>Nested</${names[1]}></div></${names[0]}></dl><section></section></main>`;
      assert.equal(nativeMarkupInsertEdit(invalid,[0],1,'<section>New</section>'),undefined);
    }
  } finally {await browser.close();}
});

test("nested definition lists retain their separate item scope and exact surrounding bytes", async () => {
  const source='<main><dl><dt>Outer term</dt><dd><dl><dt>Inner term</dt><dd>Inner value</dd></dl></dd></dl><section>After</section></main>';
  const edit=nativeMarkupInsertEdit(source,[0],1,'<section>New</section>');assert.ok(edit);
  const output=applyGuardedSourceEdit(source,edit)!;assert.ok(output.includes('<dl><dt>Outer term</dt><dd><dl><dt>Inner term</dt><dd>Inner value</dd></dl></dd></dl>'));
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage();await page.setContent(output);
    assert.equal(await page.locator('main > section').first().textContent(),'New');
    assert.equal(await page.locator('main > dl > dd > dl > dd').textContent(),'Inner value');
    assert.equal(await page.locator('main > section').last().textContent(),'After');
  }finally{await browser.close();}
});

test("moving or inserting a wrapped definition item cannot auto-close the destination item", async () => {
  const source='<main><dl><dt id="target"></dt></dl><div><dt>Moved term</dt></div></main>';
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage();await page.setContent(source);
    assert.deepEqual(await page.locator('main').evaluate(el=>Array.from(el.children).map(child=>child.localName)),['dl','div']);
    assert.equal(await page.locator('main > div > dt').textContent(),'Moved term');
    // Show the repair that an unsafe accepted operation would cause.
    await page.setContent('<main><dl><dt id="target"><div><dt>Moved term</dt></div></dt></dl></main>');
    assert.equal(await page.locator('#target dt').count(),0);
    assert.equal(await page.locator('dl > dt').count(),2);
    assert.equal(nativeMoveEdit(source,[0,1],{parent:[0,0,0],index:0}),undefined);
    assert.equal(nativeMarkupInsertEdit(source,[0,0,0],0,'<div><dt>Nested</dt></div>'),undefined);
    const nested='<div><dl><dt>Inner term</dt><dd>Inner value</dd></dl></div>';
    const inserted=nativeMarkupInsertEdit(source,[0,0,0],0,nested);assert.ok(inserted);
    await page.setContent(applyGuardedSourceEdit(source,inserted)!);
    assert.equal(await page.locator('#target > div > dl > dt').textContent(),'Inner term');
    assert.equal(await page.locator('#target > div > dl > dd').textContent(),'Inner value');
    const movable='<main><dl><dd id="target"><div></div></dd></dl>'+nested+'</main>';
    const moved=nativeMoveEdit(movable,[0,1],{parent:[0,0,0,0],index:0});assert.ok(moved);
    await page.setContent(applyGuardedSourceEdit(movable,moved)!);
    assert.equal(await page.locator('#target > div > div > dl > dt').textContent(),'Inner term');
    assert.equal(await page.locator('main > div').count(),0);
  }finally{await browser.close();}
});

test("shared move destination gate distinguishes safe no-ops from metadata and invalid containment", () => {
  const source='<main><link rel=x><p>a</p><div><p>b</p></div></main>';
  assert.equal(nativeMoveDestinationValid(source,[0,0],{parent:[0],index:0}),false);
  for(const index of [1,2]) {
    assert.equal(nativeMoveDestinationValid(source,[0,1],{parent:[0],index}),true);
    assert.equal(nativeMoveEdit(source,[0,1],{parent:[0],index}),undefined);
  }
  assert.equal(nativeMoveDestinationValid(source,[0,1],{parent:[0,2],index:1}),true);
  assert.ok(nativeMoveEdit(source,[0,1],{parent:[0,2],index:1}));
  for(const index of [-1,4,0.5]) assert.equal(nativeMoveDestinationValid(source,[0,1],{parent:[0],index}),false);
  assert.equal(nativeMoveDestinationValid(source,[0,2],{parent:[0,2],index:0}),false);
  assert.equal(nativeMoveDestinationValid(source,[],{parent:[0],index:0}),false);
  assert.equal(nativeMoveDestinationValid('<main><template><p>t</p></template></main>',[0,0],{parent:[0],index:0}),false);
  // A component instance moves whole.
  assert.equal(nativeMoveDestinationValid('<main><x-card></x-card></main>',[0,0],{parent:[0],index:0}),true);
  assert.equal(nativeMoveDestinationValid('<main><dl><dt></dt></dl><div><dt>Term</dt></div></main>',[0,1],{parent:[0,0,0],index:0}),false);
});

test("table parts outside their explicit table parents cannot misalign native paths",async()=>{
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage();
  const source='<main><caption>c</caption><section></section></main>';
  await page.setContent(source);
  assert.equal(await page.locator('caption').count(),0);
  assert.equal(await page.locator('main').evaluate(el=>el.children[0].localName),'section');
  assert.deepEqual(nativeDestinations(source,'index.html',[0,0]),[]);
  assert.equal(nativeMarkupInsertEdit(source,[0],1,'<section>New</section>'),undefined);
  for(const part of ['caption','colgroup','col','thead','tbody','tfoot']) {
   const invalid=`<main><${part}></${part}><section></section></main>`;
   assert.equal(nativeMarkupInsertEdit(invalid,[0],1,'<section>New</section>'),undefined,part);
  }
 }finally{await browser.close();}
});
test("valid table parts cannot move into ordinary containers while adjacent native insertion remains valid",async()=>{
 const source='<main><table><caption>Title</caption><colgroup><col></colgroup><thead><tr><th>Head</th></tr></thead><tbody><tr><td>Body</td></tr></tbody><tfoot><tr><td>Foot</td></tr></tfoot></table><div></div></main>';
 for(const from of [[0,0,0],[0,0,1],[0,0,1,0],[0,0,2],[0,0,3],[0,0,4]]) {
  assert.equal(nativeMoveDestinationValid(source,from,{parent:[0,1],index:0}),false);
  assert.equal(nativeMoveEdit(source,from,{parent:[0,1],index:0}),undefined);
 }
 for(const markup of ['<caption>Bad</caption>','<colgroup><col></colgroup>','<col>']) assert.equal(nativeMarkupInsertEdit(source,[0,1],0,markup),undefined);
 const inserted=nativeMarkupInsertEdit(source,[0],1,'<section>New</section>');assert.ok(inserted);
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage();await page.setContent(applyGuardedSourceEdit(source,inserted)!);
  assert.deepEqual(await page.locator('main').evaluate(el=>Array.from(el.children).map(child=>child.localName)),['table','section','div']);
  assert.equal(await page.locator('table > caption').textContent(),'Title');
  assert.equal(await page.locator('table > tbody > tr > td').textContent(),'Body');
  await page.setContent('<main><table></table><div><caption>Title</caption></div></main>');
  assert.equal(await page.locator('div > caption').count(),0);
 }finally{await browser.close();}
});

test("ignored nested document wrappers cannot shift native preview selection paths",async()=>{
 const source='<main><head><meta name=x></head><section></section></main>';
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage();await page.setContent(source);
  assert.deepEqual(await page.locator('main').evaluate(el=>Array.from(el.children).map(child=>child.localName)),['meta','section']);
  // Preview section path [0,1] formerly selected the same source section, but the preceding wrapper path disagreed.
  assert.equal(await page.locator("main").evaluate(el=>el.children[0].localName), "meta");
  assert.deepEqual(nativeDestinations(source,"index.html",[0,0]),[]);
  assert.deepEqual(nativeDestinations(source,'index.html',[0,1]),[]);
  assert.equal(nativeMarkupInsertEdit(source,[0],1,'<section>New</section>'),undefined);
  for(const wrapper of ['html','head','body']) {
   const invalid=`<main><${wrapper}><section>Inner</section></${wrapper}><section>After</section></main>`;
   await page.setContent(invalid);
   assert.deepEqual(await page.locator("main").evaluate(el=>Array.from(el.children).map(child=>child.localName)),["section","section"]);
   assert.deepEqual(nativeDestinations(invalid,'index.html',[0,1]),[]);
   assert.equal(nativeMarkupInsertEdit(invalid,[0],0,'<section>New</section>'),undefined);
  }
  const full='<!doctype html><html><head><title>Keep</title><meta name="x" content="y"></head><body><main><section>Old</section></main></body></html>';
  const edit=nativeMarkupInsertEdit(full,[0],1,'<section>New</section>');assert.ok(edit);
  const output=applyGuardedSourceEdit(full,edit)!;assert.ok(output.includes('<head><title>Keep</title><meta name="x" content="y"></head>'));
  await page.setContent(output);
  assert.deepEqual(await page.locator('main > section').allTextContents(),['Old','New']);
 }finally{await browser.close();}
});

test("colgroup character tokens and nested ruby annotations refuse repaired source paths", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const text of ['x', '&#120;', '&nbsp;']) {
      const source = `<main><table><colgroup>${text}<col></colgroup><tbody><tr><td><div>A</div></td></tr></tbody><tbody><tr><td><div>B</div></td></tr></tbody></table></main>`;
      await page.setContent(source);
      assert.deepEqual(await page.locator('table').evaluate(el => Array.from(el.children).map(child => child.localName)), ['colgroup', 'colgroup', 'tbody', 'tbody']);
      assert.equal(await page.locator('table').evaluate(el => el.children[2].children[0].children[0].children[0].textContent), 'A');
      assert.deepEqual(nativeDestinations(source, 'index.html', [0,0,2,0,0,0]), []);
      assert.equal(nativeMarkupInsertEdit(source, [0], 1, '<section>New</section>'), undefined);
    }
    const ruby = '<main><ruby><rt><rp></rp></rt><rt><div>A</div></rt><rt><div>B</div></rt></ruby></main>';
    await page.setContent(ruby);
    assert.deepEqual(await page.locator('ruby').evaluate(el => Array.from(el.children).map(child => child.localName)), ['rt','rp','rt','rt']);
    assert.equal(await page.locator('ruby').evaluate(el => el.children[2].children[0].textContent), 'A');
    assert.deepEqual(nativeDestinations(ruby, 'index.html', [0,0,2,0]), []);
    for (const outer of ['rt','rp','rb','rtc']) for (const inner of ['rt','rp','rb','rtc']) {
      const source = `<main><ruby><${outer}><${inner}>A</${inner}></${outer}></ruby></main>`;
      assert.equal(nativeMarkupInsertEdit(source, [0], 1, '<section>New</section>'), undefined);
    }
    const valid = '<main><table><colgroup>\r\n<!-- keep -->&#32;<col>\t</colgroup><tbody><tr><td>A</td></tr></tbody></table><ruby>字<rp>(</rp><rt>reading</rt><rp>)</rp></ruby><ruby><rt><ruby>字<rt>inner</rt></ruby></rt></ruby></main>';
    const edit = nativeMarkupInsertEdit(valid, [0], 3, '<section>New</section>'); assert.ok(edit);
    await page.setContent(applyGuardedSourceEdit(valid, edit)!);
    assert.equal(await page.locator('main > section').textContent(), 'New');
    assert.equal(await page.locator('table > colgroup > col').count(), 1);
    assert.equal(await page.locator('main > ruby').count(), 2);
  } finally { await browser.close(); }
});

test("abrupt structural comments refuse browser path shifts without rejecting literal markers", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const marker of ['<!-->', '<!--->']) {
      const source = `<main>${marker}<section>S</section>--><div>D</div></main>`;
      await page.setContent(source);
      assert.deepEqual(await page.locator('main').evaluate(el => Array.from(el.children).map(child => child.localName)), ['section','div']);
      assert.deepEqual(nativeDestinations(source, 'index.html', [0,0]), []);
      assert.equal(nativeMarkupInsertEdit(source, [0], 0, '<section>New</section>'), undefined);
      assert.equal(nativeMoveDestinationValid(source, [0,0], {parent:[0],index:1}), false);
      const table = `<main><table><colgroup>${marker}x--><col></colgroup><tbody><tr><td>A</td></tr></tbody></table></main>`;
      await page.setContent(table);
      assert.deepEqual(await page.locator('table').evaluate(el => Array.from(el.children).map(child => child.localName)), ['colgroup','colgroup','tbody']);
      assert.equal(nativeMarkupInsertEdit(table, [0], 1, '<section>New</section>'), undefined);
    }
    const valid = '<main><!-- ordinary --><script>const marker = "<!--> <!--->";</script><div>D</div><textarea><!--> <!---></textarea><table><colgroup><!-- ordinary --><col></colgroup><tbody><tr><td>A</td></tr></tbody></table></main>';
    const edit = nativeMarkupInsertEdit(valid, [0], 3, '<section>New</section>'); assert.ok(edit);
    const output = applyGuardedSourceEdit(valid, edit)!;
    assert.ok(output.includes('<script>const marker = "<!--> <!--->";</script>'));
    await page.setContent(output);
    assert.equal(await page.locator('main > section').textContent(), 'New');
    // Quoted angle brackets are already outside this strict tokenizer's bounds.
    // The structural-comment rule does not broaden that existing refusal.
    for (const title of ['<', '<!-->', '<!--->']) {
      assert.equal(nativeMarkupInsertEdit(`<main><div title="${title}">D</div></main>`, [0], 1, '<section>New</section>'), undefined);
    }
    assert.equal(await page.locator('textarea').textContent(), '<!--> <!--->');
    assert.equal(await page.locator('colgroup > col').count(), 1);
  } finally { await browser.close(); }
});

test("comment syntax matrix keeps canonical paths and refuses alternate or nested forms", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const cases = [
      { comment: '<!-- ordinary -->', accepted: true },
      { comment: '<!-- ok -- still -->', accepted: true },
      { comment: '<!---->', accepted: true },
      { comment: '<!-- ordinary --->', accepted: true },
      { comment: '<!-- a --!><section>S</section>-->', accepted: false },
      { comment: '<!-->', accepted: false },
      { comment: '<!--->', accepted: false },
      { comment: '<!-- outer <!-- inner -->', accepted: false },
      { comment: '<!-- outer <!--> inner -->', accepted: false },
    ];
    for (const {comment, accepted} of cases) {
      const source = `<main>${comment}<div>D</div></main>`;
      await page.setContent(source);
      const children = await page.locator('main').evaluate(el => Array.from(el.children).map(child => child.localName));
      if (accepted) assert.deepEqual(children, ['div'], comment);
      if (comment.includes('--!>')) assert.deepEqual(children, ['section','div']);
      const edit = nativeMarkupInsertEdit(source, [0], 0, '<section>New</section>');
      assert.equal(!!edit, accepted, comment);
      if (edit) {
        await page.setContent(applyGuardedSourceEdit(source, edit)!);
        assert.deepEqual(await page.locator('main').evaluate(el => Array.from(el.children).map(child => child.localName)), ['section','div']);
      }
    }
    const table = '<main><table><colgroup><!-- a --!>x--><col></colgroup><tbody><tr><td>A</td></tr></tbody></table></main>';
    await page.setContent(table);
    assert.deepEqual(await page.locator('table').evaluate(el => Array.from(el.children).map(child => child.localName)), ['colgroup','colgroup','tbody']);
    assert.equal(nativeMarkupInsertEdit(table, [0], 1, '<section>New</section>'), undefined);
    const raw = '<main><script>const markers = "--!> <!-- nested <!-->";</script><textarea>--!> <!-- nested <!--></textarea><div>D</div><!-- canonical -->--!></main>';
    const edit = nativeMarkupInsertEdit(raw, [0], 2, '<section>New</section>'); assert.ok(edit);
    await page.setContent(applyGuardedSourceEdit(raw, edit)!);
    assert.equal(await page.locator('textarea').textContent(), '--!> <!-- nested <!-->');
    assert.equal(await page.locator('main > section').textContent(), 'New');
  } finally { await browser.close(); }
});

test("a component instance moves whole, its bytes kept, and cards reorder sideways", () => {
  const card = '<card-project>\n      <h3 slot="title">Fern</h3>\n    </card-project>';
  const source = `<main>\n  <section>\n    <div class="cards">\n      <card-project><h3 slot="title">A</h3></card-project>\n      ${card}\n    </div>\n  </section>\n</main>`;
  const edit = nativeMoveEdit(source, [0, 0, 0, 1], { parent: [0, 0, 0], index: 0 })!;
  assert.ok(edit);
  const out = applyGuardedSourceEdit(source, edit)!;
  assert.ok(out.indexOf(card) >= 0 && out.indexOf(card) < out.indexOf('<h3 slot="title">A</h3>'));
  // Nothing inside an instance moves, and nothing moves into one.
  assert.equal(nativeMoveEdit(source, [0, 0, 0, 1, 0], { parent: [0, 0], index: 0 }), undefined);
  assert.equal(nativeMoveEdit(source, [0, 0, 0, 0], { parent: [0, 0, 0, 1], index: 0 }), undefined);
});

test("only blocks inside <main> that no instance holds are movable", () => {
  const source = '<site-header></site-header><header><p>Top</p></header><main><section><h2>A</h2><card-x><p>In</p></card-x></section><section-hero></section-hero></main><footer><p>End</p></footer>';
  assert.equal(nativeMovableBlock(source, [2, 0]), true);
  assert.equal(nativeMovableBlock(source, [2, 0, 0]), true);
  assert.equal(nativeMovableBlock(source, [2, 0, 1]), true);
  assert.equal(nativeMovableBlock(source, [2, 1]), true);
  for (const path of [[0], [1], [1, 0], [2], [2, 0, 1, 0], [3, 0], [], [9]]) assert.equal(nativeMovableBlock(source, path), false, path.join("."));
  assert.equal(nativeMovableBlock('<main><template><p>t</p></template><svg></svg></main>', [0, 0]), false);
  assert.equal(nativeMovableBlock('<main><template><p>t</p></template><svg></svg></main>', [0, 1]), false);
});

test("an edit inside one element's content keeps its path; anything else does not", () => {
  const before = '<main><p>Lead</p><h2>Work</h2><img src="a.png"></main>';
  assert.equal(nativeEditInside(before, before, [0, 0]), true);
  assert.equal(nativeEditInside(before, before.replace("Lead", "Lead, typed"), [0, 0]), true);
  assert.equal(nativeEditInside(before, before.replace("<p>Lead</p>", "<p>Lead<b>!</b></p>"), [0, 0]), true);
  assert.equal(nativeEditInside(before, before.replace("Work", "Play"), [0, 0]), false);
  assert.equal(nativeEditInside(before, before.replace("<p>Lead", "<p class=x>Lead"), [0, 0]), false);
  assert.equal(nativeEditInside(before, before.replace("<p>Lead</p>", "<p>Lead</p><p>New</p>"), [0, 0]), false);
  assert.equal(nativeEditInside(before, before.replace("a.png", "b.png"), [0, 2]), false);
  assert.equal(nativeEditInside(before, before.replace("Lead", "x"), [9]), false);
});

test("a move into an instance's items slot carries the slot's name; other slots refuse", () => {
  const items = (tag: string, slot: string) => tag === "x-work" && ["", "more"].includes(slot);
  const source = '<main><p>Note</p><p slot="more">Odd</p><x-work><h2 slot="title">T</h2></x-work></main>';
  const named = nativeMoveEdit(source, [0, 0], { parent: [0, 2], index: 1 }, items, "more")!;
  assert.match(applyGuardedSourceEdit(source, named)!, /<h2 slot="title">T<\/h2>\s*<p slot="more">Note<\/p><\/x-work>/);
  const unnamed = nativeMoveEdit(source, [0, 0], { parent: [0, 2], index: 0 }, items, "")!;
  assert.match(applyGuardedSourceEdit(source, unnamed)!, /<x-work><p>Note<\/p>\s*<h2 slot="title">/);
  assert.equal(nativeMoveEdit(source, [0, 0], { parent: [0, 2], index: 1 }, items, "title"), undefined);
  assert.equal(nativeMoveEdit(source, [0, 0], { parent: [0, 2], index: 1 }), undefined);
  const assigned = nativeMoveEdit(source, [0, 1], { parent: [0, 2], index: 1 }, items, "more")!;
  assert.match(applyGuardedSourceEdit(source, assigned)!, /<p slot="more">Odd<\/p>/);
});

const workItems = (tag: string, slot: string) => tag === "section-work" && ["", "items", "more"].includes(slot);
const compactMove = (source: string, from: number[], parent: number[], index: number, slot = "") => {
  const edit = nativeMoveEdit(source, from, { parent, index }, workItems, slot);
  assert.ok(edit);
  return applyGuardedSourceEdit(source, edit)!.replace(/>\s+</g, "><");
};

test("items reorder inside unnamed and named slots, preserving their assignment bytes and no-ops", () => {
  for (const slot of ["", "items"]) {
    const assignment = slot ? " SLOT = 'items'" : "";
    const first = `<card-project${assignment}><h3 slot="title">A</h3></card-project>`;
    const second = `<card-project${assignment}><h3 slot="title">B</h3></card-project>`;
    const source = `<main><section-work>${first}${second}</section-work></main>`;
    assert.equal(compactMove(source, [0, 0, 0], [0, 0], 2, slot), `<main><section-work>${second}${first}</section-work></main>`);
    assert.equal(nativeMoveDestinationValid(source, [0, 0, 0], { parent: [0, 0], index: 0 }, workItems, slot), true);
    for (const index of [0, 1]) assert.equal(nativeMoveEdit(source, [0, 0, 0], { parent: [0, 0], index }, workItems, slot), undefined);
  }
});

test("moves between instances rewrite or remove the old slot and preserve card parts", () => {
  const source = '<main><section-work><card-project slot="items" data-id="a"><h3 slot="title">A</h3></card-project></section-work><section-work></section-work><div></div></main>';
  for (const slot of ["", "items", "more"]) {
    const output = compactMove(source, [0, 0, 0], [0, 1], 0, slot);
    const assignment = slot ? ` slot="${slot}"` : "";
    assert.equal(output, `<main><section-work></section-work><section-work><card-project${assignment} data-id="a"><h3 slot="title">A</h3></card-project></section-work><div></div></main>`);
    assert.equal((output.match(/slot=/g) ?? []).length, slot ? 2 : 1);
  }
  assert.equal(compactMove(source, [0, 0, 0], [0, 2], 0), '<main><section-work></section-work><section-work></section-work><div><card-project data-id="a"><h3 slot="title">A</h3></card-project></div></main>');
  const page = '<main><div><p slot="old">Page block</p></div><section-work></section-work></main>';
  assert.equal(compactMove(page, [0, 0, 0], [0, 1], 0, "items"), '<main><div></div><section-work><p slot="items">Page block</p></section-work></main>');
  assert.equal(compactMove(page, [0, 0, 0], [0, 1], 0), '<main><div></div><section-work><p>Page block</p></section-work></main>');
  // Between plain containers the page's own bytes stay as written.
  assert.equal(compactMove('<main><div><p slot="old">Kept</p></div><div></div></main>', [0, 0, 0], [0, 1], 0), '<main><div></div><div><p slot="old">Kept</p></div></main>');
});

test("beside itself into another items slot of the same instance is a move, not a stay", () => {
  const source = '<main><section-work><card-project slot="items">A</card-project><p slot="more">B</p></section-work></main>';
  for (const index of [0, 1]) {
    assert.equal(compactMove(source, [0, 0, 0], [0, 0], index, "more"), '<main><section-work><card-project slot="more">A</card-project><p slot="more">B</p></section-work></main>');
    const plan = nativeElementMovePlan(source, [0, 0, 0], { parent: [0, 0], index, slot: "more" }, workItems);
    assert.equal(plan.status, "moved");
    if (plan.status === "moved") assert.deepEqual(plan.selection, [0, 0, 0]);
    assert.deepEqual(nativeElementMovePlan(source, [0, 0, 0], { parent: [0, 0], index, slot: "items" }, workItems), { status: "stayed", reason: "already-position" });
  }
});

test("items paths open at every items boundary while non-items, card parts and template content stay sealed", () => {
  const source = '<main><section-work><h2 slot="title">Title</h2><section-work slot="items"><card-project><h3 slot="title">A</h3></card-project></section-work><template><p>Fixed</p></template></section-work><div></div></main>';
  assert.equal(compactMove(source, [0, 0, 1, 0], [0, 1], 0), '<main><section-work><h2 slot="title">Title</h2><section-work slot="items"></section-work><template><p>Fixed</p></template></section-work><div><card-project><h3 slot="title">A</h3></card-project></div></main>');
  for (const path of [[0, 0, 1], [0, 0, 1, 0]]) {
    assert.equal(nativeMovableBlock(source, path, workItems), true);
    assert.equal(nativeMovableBlock(source, path), false);
    assert.equal(nativeMoveEdit(source, path, { parent: [0, 1], index: 0 }), undefined);
  }
  for (const path of [[0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 2], [0, 0, 2, 0]]) {
    assert.equal(nativeMovableBlock(source, path, workItems), false);
    assert.equal(nativeMoveEdit(source, path, { parent: [0, 1], index: 0 }, workItems), undefined);
  }
  const outside = '<header><section-work><p>Outside</p></section-work></header><main></main>';
  assert.equal(nativeMovableBlock(outside, [0, 0, 0], workItems), false);
});

function assertNoNewBlankLines(source: string, output: string) {
  const blanks = (text: string) => text.split(/\r?\n/).filter(line => /^[ \t]*$/.test(line)).length;
  assert.equal(blanks(output), blanks(source), "moving preserves existing blank lines without adding any");
}

function exactMove(source: string, from: number[], parent: number[], index: number, expected: string, newBlanks = 0) {
  const edit = nativeMoveEdit(source, from, { parent, index });
  assert.ok(edit);
  assert.equal(edit.source, source);
  assert.equal(edit.original, source.slice(edit.start, edit.end));
  const output = applyGuardedSourceEdit(source, edit)!;
  assert.equal(output, expected);
  if (!newBlanks) assertNoNewBlankLines(source, output);
  assert.equal(applyGuardedSourceEdit(source + " ", edit), undefined);
}

const moveBlockLines = (name: string, depth: number) => {
  const indent = "  ".repeat(depth);
  return [`${indent}<div id="${name}">`, `${indent}  <p>${name}</p>`, `${indent}</div>`];
};
const moveContainerLines = (names: string[], nested: boolean) => [
  "  <section>",
  ...(nested ? ["    <div>"] : []),
  ...names.flatMap(name => moveBlockLines(name, nested ? 3 : 2)),
  ...(nested ? ["    </div>"] : []),
  "  </section>",
];

test("first, middle and last multiline children move both directions at deeper and shallower depths without blank lines", () => {
  for (const nestedSource of [false, true]) for (const destinationFirst of [false, true]) {
    for (const child of [0, 1, 2]) for (const destinationIndex of [0, 1, 2]) {
      const sourceNames = ["A", "B", "C"];
      const destinationNames = ["D", "E"];
      const render = () => {
        const origin = moveContainerLines(sourceNames, nestedSource);
        const target = moveContainerLines(destinationNames, !nestedSource);
        return ["<main>", ...(destinationFirst ? [...target, ...origin] : [...origin, ...target]), "</main>"].join("\n");
      };
      const source = render();
      const sourceParent = [0, destinationFirst ? 1 : 0, ...(nestedSource ? [0] : [])];
      const destinationParent = [0, destinationFirst ? 0 : 1, ...(!nestedSource ? [0] : [])];
      destinationNames.splice(destinationIndex, 0, sourceNames.splice(child, 1)[0]);
      exactMove(source, [...sourceParent, child], destinationParent, destinationIndex, render());
    }
  }
});

test("standalone children reorder within one parent in both directions", () => {
  const render = (names: string[]) => ["<main>", ...moveContainerLines(names, false), "</main>"].join("\n");
  for (const [child, index, names] of [[0, 3, ["B", "C", "A"]], [2, 0, ["C", "A", "B"]]] as const) {
    exactMove(render(["A", "B", "C"]), [0, 0, child], [0, 0], index, render([...names]));
  }
});

test("moving the only child into empty inline and multiline parents leaves no blank lines", () => {
  for (const target of ["  <section></section>", "  <section>\n  </section>"]) {
    const source = ['<main>', '  <section>', ...moveBlockLines("A", 2), '  </section>', target, '</main>'].join("\n");
    const expected = ['<main>', '  <section>', '  </section>', ...moveContainerLines(["A"], false), '</main>'].join("\n");
    exactMove(source, [0, 0, 0], [0, 1], 0, expected);
  }
});

test("standalone removal takes tabs and trailing spaces while retaining CRLF and existing blank lines", () => {
  const source = '<main>\r\n\t<section>\r\n\t\t<div>\r\n\t\t\t<p>A</p>\r\n\t\t</div> \t\r\n\t\t<p>B</p>\r\n\t</section>\r\n\r\n\t<section>\r\n\t\t\t<div>\r\n\t\t\t\t<p>C</p>\r\n\t\t\t</div>\r\n\t</section>\r\n</main>';
  const expected = '<main>\r\n\t<section>\r\n\t\t<p>B</p>\r\n\t</section>\r\n\r\n\t<section>\r\n\t\t\t<div>\r\n\t\t\t\t<p>A</p>\r\n\t\t\t</div>\r\n\t\t\t<div>\r\n\t\t\t\t<p>C</p>\r\n\t\t\t</div>\r\n\t</section>\r\n</main>';
  exactMove(source, [0, 0, 0], [0, 1], 0, expected);
  assert.equal(/(?<!\r)\n/.test(expected), false);
});

test("first-line and final-line standalone elements remove their own line cleanly", () => {
  exactMove('  <div>A</div> \t\n<main>\n  <div>B</div>\n</main>', [0], [1], 0,
    '<main>\n  <div>A</div>\n  <div>B</div>\n</main>');
  exactMove('<main>\n  <div>B</div>\n</main>\n  <div>A</div> \t', [1], [0], 1,
    '<main>\n  <div>B</div>\n  <div>A</div>\n</main>');
});

test("text and adjacent elements on the moving line keep the exact element-only removal", () => {
  exactMove('<main>\n  <div><p>A</p> <p>B</p></div>\n  <div><p>C</p></div>\n</main>', [0, 0, 0], [0, 1], 1,
    '<main>\n  <div> <p>B</p></div>\n  <div><p>C</p>\n<p>A</p></div>\n</main>');
  exactMove('<main>\n  <div>Lead <p>A</p> tail</div>\n  <div><p>C</p></div>\n</main>', [0, 0, 0], [0, 1], 0,
    '<main>\n  <div>Lead  tail</div>\n  <div><p>A</p>\n<p>C</p></div>\n</main>');
});

test("beside itself into another items slot rewrites only element bytes at the same indentation", () => {
  const source = '<main>\n  <section-work>\n    <div slot="items">\n      <p>A</p>\n    </div> \t\n    <p slot="more">B</p>\n  </section-work>\n</main>';
  const expected = source.replace('slot="items"', 'slot="more"');
  for (const index of [0, 1]) {
    const edit = nativeMoveEdit(source, [0, 0, 0], { parent: [0, 0], index }, workItems, "more");
    assert.ok(edit);
    assert.equal(edit.start, source.indexOf('<div'));
    assert.equal(edit.end, source.indexOf('</div>') + '</div>'.length);
    assert.equal(applyGuardedSourceEdit(source, edit), expected);
    assertNoNewBlankLines(source, expected);
  }
});

test("moving out of and back into the same container preserves exact indentation", () => {
  const source = '<main>\n  <section>\n    <div>\n      <p>A</p>\n      <p>B</p>\n      <p>C</p>\n    </div>\n  </section>\n</main>';
  for (const child of [0, 1, 2]) for (const before of [true, false]) {
    const names = ["A", "B", "C"];
    const moved = names.splice(child, 1)[0];
    const inner = ['    <div>', ...names.map(name => `      <p>${name}</p>`), '    </div>'];
    const outer = `    <p>${moved}</p>`;
    const expected = ['<main>', '  <section>', ...(before ? [outer, ...inner] : [...inner, outer]), '  </section>', '</main>'].join("\n");
    exactMove(source, [0, 0, 0, child], [0, 0], before ? 0 : 1, expected);
    exactMove(expected, [0, 0, before ? 0 : 1], [0, 0, before ? 1 : 0], child, source);
  }
});

test("structural lines change depth while pre, textarea, script, style and opaque content keeps every byte", () => {
  const protectedMarkup = [
    '<pre>raw\n  keep\r\n\tbytes</pre>',
    '<textarea>raw\n  keep\r\n\tbytes</textarea>',
    '<script>raw\n  keep\r\n\tbytes</script>',
    '<style>raw\n  keep\r\n\tbytes</style>',
    '<x-card>\n  <p>Keep</p>\n</x-card>',
    '<svg>\n  <text>Keep</text>\n</svg>',
    '<template>\n  <p>Keep</p>\n</template>',
  ];
  const source = ['<main>', '  <section>', '    <div>', ...protectedMarkup.map(markup => `      ${markup}`), '    </div>', '  </section>', '  <section>', '    <div>', '      <p>Neighbour</p>', '    </div>', '  </section>', '</main>'].join("\r\n");
  const expected = ['<main>', '  <section>', '  </section>', '  <section>', '    <div>', '      <p>Neighbour</p>', '      <div>', ...protectedMarkup.map(markup => `        ${markup}`), '      </div>', '    </div>', '  </section>', '</main>'].join("\r\n");
  exactMove(source, [0, 0, 0], [0, 1, 0], 1, expected);
});

test("inside a pre the moved element's line breaks stay as content", () => {
  exactMove('<main>\n  <pre>\n  <b>A</b>\n</pre>\n  <div>\n    <p>B</p>\n  </div>\n</main>', [0, 0, 0], [0, 1], 1,
    '<main>\n  <pre>\n  \n</pre>\n  <div>\n    <p>B</p>\n    <b>A</b>\n  </div>\n</main>', 1);
});
