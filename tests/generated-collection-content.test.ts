import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveNativeRoutes } from '../shared/native-routes';
import { applyCollectionEdits, planBake } from '../src/page-builder/collection-bake';
import { editTouchesGenerated, generatedCardRecord, generatedRegionAt, generatedRegions, manualCardsSource } from '../src/page-builder/generated-collection-content';

const page=(title:string,body='')=>`<html><head><title>${title}</title></head><body>${body}</body></html>`;
const raw={'index.html':page('Home','<section class="s"><div class="grid" id="g" data-each="/work/" data-sort="title" data-limit="5" aria-label="Work">\n  <template><a class="card" href="{url}">{title}</a></template>\n</div><p>After</p></section>'),'work/a/index.html':page('Alpha'),'work/b/index.html':page('Beta')};
const routes=deriveNativeRoutes(Object.keys(raw));
const baked=planBake(raw,routes,{name:'S'});if('error'in baked)throw Error(baked.error);
const source=applyCollectionEdits(raw['index.html'],baked.edits['index.html']);
const fresh=planBake({...raw,'index.html':source},routes,{name:'S'});if('error'in fresh)throw Error(fresh.error);

test('regions cover only the generated cards, not the template or host',()=>{
 const [region]=generatedRegions(source);
 assert.ok(source.slice(region.start,region.end).includes('>Alpha</a>'));
 assert.equal(source.slice(region.start,region.end).includes('<template'),false);
 assert.equal(generatedRegionAt(source,source.indexOf('{title}')),undefined);
 assert.ok(generatedRegionAt(source,source.indexOf('Alpha')));
});
test('edits inside cards are refused; whole-listing and outside edits are not',()=>{
 const at=source.indexOf('Alpha');
 assert.ok(editTouchesGenerated(source,[{start:at,end:at+5}]));
 const [region]=generatedRegions(source);
 assert.ok(editTouchesGenerated(source,[{start:region.end,end:region.end}]),'append into listing');
 assert.equal(editTouchesGenerated(source,[{start:region.host,end:region.hostEnd}]),undefined);
 const after=source.indexOf('After');
 assert.equal(editTouchesGenerated(source,[{start:after,end:after+5}]),undefined);
 const tpl=source.indexOf('{title}');
 assert.equal(editTouchesGenerated(source,[{start:tpl,end:tpl+7}]),undefined,'template edits stay allowed');
 const tplStart=source.indexOf('<template>');
 assert.ok(editTouchesGenerated(source,[{start:tplStart,end:tplStart}]),'insert before the template is rebaked away too');
});
test('card provenance names the source page only when the listing is canonical',()=>{
 const [region]=generatedRegions(source);
 const preview=fresh.collections[0];
 assert.deepEqual(generatedCardRecord(source,region,preview,source.indexOf('Beta')),{path:'work/b/index.html',url:'/work/b/'});
 const drifted=source.replace('>Alpha<','>Mine<');
 assert.equal(generatedCardRecord(drifted,generatedRegions(drifted)[0],preview,drifted.indexOf('Beta')),undefined);
 const multi=raw['index.html'].replace('<template><a class="card" href="{url}">{title}</a></template>','<template><a href="{url}">{title}</a><p>{title}</p></template>');
 const mb=planBake({...raw,'index.html':multi},routes,{name:'S'});if('error'in mb)throw Error(mb.error);
 const ms=applyCollectionEdits(multi,mb.edits['index.html']);
 assert.equal(generatedCardRecord(ms,generatedRegions(ms)[0],mb.collections[0],ms.indexOf('Beta')),undefined,'multi-root templates never guess a page');
});
test('manual cards keep cards and unknown attributes, drop only the recipe',()=>{
 const manual=manualCardsSource(source,generatedRegions(source)[0].host);
 assert.equal(generatedRegions(manual).length,0);
 assert.ok(manual.includes('<div class="grid" id="g" aria-label="Work">'));
 assert.ok(manual.includes('>Alpha</a>')&&manual.includes('>Beta</a>'));
 assert.equal(/template|data-each|data-sort|data-limit/.test(manual),false);
 assert.ok(manual.includes('<p>After</p></section>'));
});

// A JSON collection on a grid with no id: found by its exact opening tag.
{
 const { planDocumentTargetEdit } = await import('../src/page-builder/generated-collection-content');
 const { writePageBuilderDocument, readPageBuilderDocument } = await import('../src/page-builder/page-builder-document'); const { makeSectionTarget } = await import('../src/page-builder/source-target');
 const home = page('Home', '<main><div class="cards"><a>One</a></div><p>Other</p></main>');
 const grid = home.indexOf('<div class="cards">');
 const recipe = { pagePath: 'index.html', target: makeSectionTarget(home, grid), folders: ['/work/'], sort: '', filter: '', limit: 10, template: '<a>{title}</a>', fields: [], overrides: {}, outputFingerprint: '<a>One</a>' };
 const sidecar = writePageBuilderDocument({ version: 1, pages: { 'index.html': { fields: { mood: 'calm' } } }, collections: { work: recipe, other: { ...recipe, pagePath: 'about/index.html' } } } as never);
 const classAt = home.indexOf('cards"') + 5;
 test('a class added to a JSON grid moves its stored target with the edit, keeping everything else', () => {
  const result = planDocumentTargetEdit(home, 'index.html', sidecar, [{ start: classAt, end: classAt, text: ' wide' }]);
  assert.ok('sidecar' in result && result.sidecar);
  const before = readPageBuilderDocument(sidecar), after = readPageBuilderDocument(result.sidecar!);
  assert.equal(after.collections.work.target.openingTagFingerprint, '<div class="cards wide">');
  assert.deepEqual(after.collections.work.target.path, before.collections.work.target.path);
  assert.deepEqual({ ...after.collections.work, target: null }, { ...before.collections.work, target: null });
  assert.deepEqual(after.collections.other, before.collections.other);
  assert.deepEqual(after.pages, before.pages);
 });
 test('an edit that keeps every grid findable leaves the JSON alone', () => {
  const at = home.indexOf('Other');
  assert.deepEqual(planDocumentTargetEdit(home, 'index.html', sidecar, [{ start: at, end: at + 5, text: 'Else' }]), {});
  assert.deepEqual(planDocumentTargetEdit(home, 'about/index.html', sidecar, [{ start: 0, end: 0, text: '' }]), {});
 });
 test('duplicating the grid, pasting an identical opening tag or deleting it refuses with the reason', () => {
  const end = home.indexOf('<p>');
  const copy = home.slice(grid, end);
  for (const edit of [{ start: end, end, text: copy }, { start: end, end, text: '<div class="cards"></div>' }, { start: grid, end, text: '' }]) {
   const result = planDocumentTargetEdit(home, 'index.html', sidecar, [edit]);
   assert.ok('error' in result);
   assert.match(result.error, /^This change would leave a collection on index\.html without one exact grid to fill \(Collection target is missing or ambiguous\.\), so nothing was changed\. Give the grid a unique id in the Source editor/);
  }
 });
 test('a class edit that would make the grid identical to another element refuses', () => {
  const twin = page('Home', '<main><div class="cards"><a>One</a></div><div class="wide"></div></main>');
  const twinSidecar = writePageBuilderDocument({ version: 1, pages: {}, collections: { work: { ...recipe, target: makeSectionTarget(twin, twin.indexOf('<div class="cards">')) } } } as never);
  const at = twin.indexOf('"cards"') + 1;
  const result = planDocumentTargetEdit(twin, 'index.html', twinSidecar, [{ start: at, end: at + 5, text: 'wide' }]);
  assert.ok('error' in result);
 });
}
