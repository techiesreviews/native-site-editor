import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { nativeDestinations, nativeMarkupInsertEdit, nativeMoveToEdit, nativeMoveEdit, nativeMoveDestinationValid, applyGuardedSourceEdit } from "../src/page-builder/native-operations.ts";

test("definition-item auto-closing cannot turn preview paths into different source targets", async () => {
  const source = '<dl><dt><dd></dd></dt><dd><main></main></dd><dd><div></div></dd><dd><div></div></dd></dl>';
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(); await page.setContent(source);
    const proof = await page.locator('dl').evaluate(el => ({children:Array.from(el.children).map(child=>child.localName), target:el.children[2].children[0].localName}));
    assert.deepEqual(proof, {children:['dt','dd','dd','dd','dd'],target:'main'});
    assert.deepEqual(nativeDestinations(source, 'index.html', [0,2,0]), []);
    assert.equal(nativeMarkupInsertEdit(source,[0,2,0],0,'<h2>New</h2>'),undefined);
    assert.equal(nativeMoveToEdit(source,[0,3,0],[0,2,0],'inside'),undefined);
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
  assert.equal(nativeMoveDestinationValid('<main><x-card></x-card></main>',[0,0],{parent:[0],index:0}),false);
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
