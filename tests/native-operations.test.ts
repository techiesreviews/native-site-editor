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
