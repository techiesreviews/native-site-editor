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
