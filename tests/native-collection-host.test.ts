import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveNativeRoutes } from '../shared/native-routes';
import { planNativeCollectionOperation, nativeCollectionPlanIsCurrent, type NativeCollectionOrigin } from '../src/page-builder/native-collection-host';
const page=(title:string,body='')=>`<html><head><title>${title}</title></head><body>${body}</body></html>`;
const list=(folders='/work/')=>`<div data-each="${folders}"><template><a href="{url}">{title}</a></template><p>Old</p></div>`;
const sources={'index.html':page('Home',list()),'other.html':page('Other',list('/work/ /news/')),'work/index.html':page('Work'),'work/a/index.html':page('First'),'news/b/index.html':page('News'),'unrelated.html':page('Unrelated')};
const snapshot=()=>({sources:{...sources},routes:deriveNativeRoutes(Object.keys(sources)),revision:'scope:1'});
const origin=(extra:Partial<NativeCollectionOrigin>):NativeCollectionOrigin=>({done:'Done',undone:'Undone',...extra});
function good(extra:Partial<NativeCollectionOrigin>,before=snapshot()){
 const result=planNativeCollectionOperation({...before,identity:{name:'Studio'},origin:origin(extra)});
 if('error'in result)assert.fail(result.error);return result;
}
test('create bakes multiple listings in one operation and guards all unchanged route inputs',()=>{
 const before=snapshot(),plan=good({creates:[{path:'work/new/index.html',content:page('New')}]},before);
 assert.equal(plan.operation.creates!.length,1);assert.equal(plan.operation.edits!.size,2);
 assert.ok(plan.operation.edits!.get('index.html')!.includes('href="/work/new/">New'));
 assert.equal(plan.operation.expectedSources.get('work/new/index.html'),undefined);
 assert.equal(plan.operation.expectedSources.get('unrelated.html'),sources['unrelated.html']);
 assert.equal(nativeCollectionPlanIsCurrent(plan,before),true);
 assert.equal(nativeCollectionPlanIsCurrent(plan,{...before,sources:{...before.sources,'unrelated.html':page('Changed')}}),false);
 assert.equal(nativeCollectionPlanIsCurrent(plan,{...before,routes:{...before.routes,'/future/':'future/index.html'}}),false);
 assert.equal(nativeCollectionPlanIsCurrent(plan,{...before,revision:'scope:2'}),false);
 assert.deepEqual(before,snapshot());
});
test('created listing bakes its own content without an edit against nonexistent source',()=>{
 const plan=good({creates:[{path:'new.html',content:page('New listing',list())}]});
 assert.ok(plan.operation.creates![0].content.includes('href="/work/a/">First'));
 assert.equal(plan.operation.edits!.has('new.html'),false);
});
test('metadata and template edits combine with dependent listings',()=>{
 const plan=good({edits:new Map([['work/a/index.html',page('Renamed')],['index.html',page('Home',list().replace('{title}','Title: {title}'))]])});
 assert.ok(plan.operation.edits!.get('index.html')!.includes('Title: Renamed'));
 assert.ok(plan.operation.edits!.get('other.html')!.includes('Renamed'));
 assert.equal(plan.operation.edits!.get('work/a/index.html'),page('Renamed'));
});
test('file move changes URL, retains source, and guards old and vacant new paths',()=>{
 const plan=good({moves:[{from:'work/a/index.html',to:'work/renamed/index.html'}]});
 assert.deepEqual(plan.operation.moves,[{from:'work/a/index.html',to:'work/renamed/index.html'}]);
 assert.ok(plan.operation.edits!.get('index.html')!.includes('href="/work/renamed/">First'));
 assert.equal(plan.operation.expectedSources.get('work/a/index.html'),sources['work/a/index.html']);
 assert.equal(plan.operation.expectedSources.get('work/renamed/index.html'),undefined);
 assert.equal(plan.operation.edits!.has('work/renamed/index.html'),false);
});
test('whole-folder rename updates mixed collection scopes while preserving unrelated scope',()=>{
 const plan=good({moves:[{from:'work/index.html',to:'portfolio/index.html'},{from:'work/a/index.html',to:'portfolio/a/index.html'}]});
 assert.ok(plan.operation.edits!.get('other.html')!.includes('data-each="/portfolio/ /news/"'));
 assert.ok(plan.operation.edits!.get('other.html')!.includes('href="/portfolio/a/">First'));
 assert.ok(plan.operation.edits!.get('other.html')!.includes('href="/news/b/">News'));
});
test('deletion removes records from all dependent listings in the same operation',()=>{
 const plan=good({deletes:['work/a/index.html']});
 assert.deepEqual(plan.operation.deletes,['work/a/index.html']);
 assert.equal(plan.operation.edits!.get('index.html')!.includes('href="/work/a/"'),false);
 assert.equal(plan.operation.edits!.get('other.html')!.includes('href="/work/a/"'),false);
});
test('conflicting origin, missing source, stale graph, bake failure abort the whole plan',()=>{
 const before=snapshot();
 for(const change of [origin({creates:[{path:'index.html',content:'X'}]}),origin({moves:[{from:'work/a/index.html',to:'other.html'}]}),origin({deletes:['missing.html']}),origin({edits:new Map([['missing.html','X']])}),origin({expectedSources:new Map([['index.html','stale']])}),origin({edits:new Map([['index.html',page('Bad','<div data-each="/work/"><template><a>{unknown}</a></template></div>')]])})]){
  assert.ok('error'in planNativeCollectionOperation({...before,identity:{name:'Studio'},origin:change}));
 }
 assert.ok('error'in planNativeCollectionOperation({...before,routes:{'/':'index.html'},identity:{name:'Studio'},origin:origin({})}));
 assert.deepEqual(before,snapshot());
});
test('moving a listing merges its metadata and generated changes at the destination',()=>{
 const before=snapshot(),source=before.sources['other.html'].replace('Other','Moved listing');
 const plan=good({moves:[{from:'other.html',to:'lists/index.html'}],edits:new Map([['lists/index.html',source]])},before);
 assert.ok(plan.operation.edits!.get('lists/index.html')!.includes('<title>Moved listing</title>'));
 assert.ok(plan.operation.edits!.get('lists/index.html')!.includes('href="/work/a/">First'));
 assert.equal(plan.operation.edits!.has('other.html'),false);
 assert.equal(plan.operation.expectedSources.get('lists/index.html'),undefined);
 assert.equal(plan.operation.expectedSources.get('other.html'),before.sources['other.html']);
});
test('new target collision invalidates a prepared plan; snapshots and origin containers are copied',()=>{
 const before=snapshot(),creates=[{path:'work/new/index.html',content:page('New')}],edits=new Map([['unrelated.html',page('Updated')]]);
 const plan=good({creates,edits},before);
 creates[0].content='mutated';edits.set('unrelated.html','mutated');
 assert.equal(plan.operation.creates![0].content,page('New'));
 assert.equal(plan.operation.edits!.get('unrelated.html'),page('Updated'));
 const collision={...before,sources:{...before.sources,'work/new/index.html':page('Other draft')}};
 assert.equal(nativeCollectionPlanIsCurrent(plan,collision),false);
 before.routes['/injected/']='injected/index.html';
 assert.equal(Object.hasOwn(plan.expectedRoutes,'/injected/'),false);
});
test('root 404 remains guarded and is excluded from collection records',()=>{
 const before=snapshot();Object.assign(before.sources,{'404.html':page('Not found'),'index.html':page('Home',list('/'))});before.routes=deriveNativeRoutes(Object.keys(before.sources));
 const plan=good({edits:new Map([['work/a/index.html',page('New title')]])},before);
 assert.equal(plan.operation.expectedSources.get('404.html'),page('Not found'));
 assert.equal(plan.operation.edits!.get('index.html')!.includes('href="/404.html"'),false);
 assert.equal(plan.operation.edits!.has('404.html'),false);
});
