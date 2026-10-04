import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveNativeRoutes } from '../shared/native-routes';
import { applyCollectionEdits, planBake } from '../src/page-builder/collection-bake';
import { planNativeCollectionOperation, nativeCollectionPlanIsCurrent, type NativeCollectionOrigin } from '../src/page-builder/native-collection-host';
const page=(title:string,body='')=>`<html><head><title>${title}</title></head><body>${body}</body></html>`;
const list=(folders='/work/')=>`<div data-each="${folders}"><template><a href="{url}">{title}</a></template><p>Old</p></div>`;
// Fixtures start as canonical baked listings: hand-edited cards are refused.
const canonical=(raw:Record<string,string>,name='Studio')=>{const baked=planBake(raw,deriveNativeRoutes(Object.keys(raw)),{name});if('error'in baked)throw Error(baked.error);return Object.fromEntries(Object.entries(raw).map(([p,t])=>[p,applyCollectionEdits(t,baked.edits[p]??[])]));};
const sources=canonical({'index.html':page('Home',list()),'other.html':page('Other',list('/work/ /news/')),'work/index.html':page('Work'),'work/a/index.html':page('First'),'news/b/index.html':page('News'),'unrelated.html':page('Unrelated')});
const rebake=(before:ReturnType<typeof snapshot>)=>{before.sources=canonical(before.sources);return before;};
const text=(plan:{operation:{edits?:Map<string,string>}},before:{sources:Record<string,string>},path:string)=>plan.operation.edits!.get(path)??before.sources[path];
const snapshot=()=>({sources:{...sources},routes:deriveNativeRoutes(Object.keys(sources)),revision:'scope:1',files:Object.keys(sources),identity:{name:'Studio'}});
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
 const plan=good({folders:[{from:'work/',to:'portfolio/'}],moves:[{from:'work/index.html',to:'portfolio/index.html'},{from:'work/a/index.html',to:'portfolio/a/index.html'}]});
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
 for(const change of [origin({creates:[{path:'index.html',content:'X'}]}),origin({moves:[{from:'work/a/index.html',to:'other.html'}]}),origin({deletes:['missing.html']}),origin({expectedSources:new Map([['index.html','stale']])}),origin({edits:new Map([['index.html',page('Bad','<div data-each="/work/"><template><a>{unknown}</a></template></div>')]])})]){
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
 const before=snapshot();Object.assign(before.sources,{'404.html':page('Not found'),'index.html':page('Home',list('/'))});before.files.push('404.html');before.routes=deriveNativeRoutes(Object.keys(before.sources));rebake(before);
 const plan=good({edits:new Map([['work/a/index.html',page('New title')]])},before);
 assert.equal(plan.operation.expectedSources.get('404.html'),page('Not found'));
 assert.equal(plan.operation.edits!.get('index.html')!.includes('href="/404.html"'),false);
 assert.equal(plan.operation.edits!.has('404.html'),false);
});
test('opaque folder members move without invented text and occupied unloaded targets reject',()=>{
 const before=snapshot();before.files.push('work/a/photo.jpg');
 const plan=good({folders:[{from:'work/',to:'portfolio/'}],moves:[{from:'work/index.html',to:'portfolio/index.html'},{from:'work/a/index.html',to:'portfolio/a/index.html'},{from:'work/a/photo.jpg',to:'portfolio/a/photo.jpg'}]},before);
 assert.equal(plan.operation.expectedSources.get('work/a/photo.jpg'),undefined);
 assert.equal(plan.operation.edits!.has('portfolio/a/photo.jpg'),false);
 assert.ok(plan.operation.edits!.get('index.html')!.includes('/portfolio/a/'));
 const occupied={...before,files:[...before.files,'portfolio/a/photo.jpg']};
 assert.ok('error'in planNativeCollectionOperation({...occupied,origin:origin({moves:[{from:'work/a/photo.jpg',to:'portfolio/a/photo.jpg'}]})}));
 assert.equal(nativeCollectionPlanIsCurrent(plan,occupied),false);
});
test('no-index folder moves rewrite mixed and nested scopes from all descendant routes',()=>{
 const before=snapshot();delete (before.sources as Record<string,string>)['work/index.html'];before.files=before.files.filter(path=>path!=='work/index.html');
 Object.assign(before.sources,{'work/2024/a/index.html':page('Year'),'index.html':page('Home',list('/work/ /news/')+list('/work/2024/'))});before.files.push('work/2024/a/index.html');before.routes=deriveNativeRoutes(before.files);rebake(before);
 const plan=good({folders:[{from:'work/',to:'portfolio/'}],moves:[{from:'work/a/index.html',to:'portfolio/a/index.html'},{from:'work/2024/a/index.html',to:'portfolio/2024/a/index.html'}]},before);
 assert.ok(plan.operation.edits!.get('index.html')!.includes('data-each="/portfolio/ /news/"'));
 assert.ok(plan.operation.edits!.get('index.html')!.includes('data-each="/portfolio/2024/"'));
 assert.ok(plan.operation.edits!.get('index.html')!.includes('/news/b/'));
});
test('index-only moves and folder pages moved to html never redirect the collection scope',()=>{
 const partial=good({moves:[{from:'work/index.html',to:'portfolio/index.html'}]});
 assert.ok(text(partial,snapshot(),'index.html').includes('data-each="/work/"'));
 assert.ok(text(partial,snapshot(),'index.html').includes('/work/a/'));
 const before=snapshot();delete (before.sources as Record<string,string>)['work/a/index.html'];before.files=before.files.filter(path=>path!=='work/a/index.html');before.routes=deriveNativeRoutes(before.files);
 rebake(before);
 const plan=good({moves:[{from:'work/index.html',to:'work.html'}]},before);
 assert.ok(text(plan,before,'index.html').includes('data-each="/work/"'));
 assert.equal(text(plan,before,'index.html').includes('data-each="/work.html"'),false);
});
test('first redirect edit creates a vacant guarded text file without changing host operation shape',()=>{
 const plan=good({edits:new Map([['_redirects','/old/ /work/a/ 301\n']])});
 assert.equal(plan.operation.edits!.get('_redirects'),'/old/ /work/a/ 301\n');
 assert.equal(plan.operation.expectedSources.get('_redirects'),undefined);
 assert.equal(plan.operation.creates!.length,0);
});
test('file graph and identity are independently checked against supplied route graph',()=>{
 const before=snapshot(),plan=good({},before);
 assert.equal(nativeCollectionPlanIsCurrent(plan,{...before,files:[...before.files,'unloaded.jpg']}),false);
 assert.equal(nativeCollectionPlanIsCurrent(plan,{...before,identity:{name:'Another'}}),false);
 assert.equal(nativeCollectionPlanIsCurrent(plan,{...before,files:[...before.files,'new/index.html'],routes:before.routes}),false);
});
test('deleting the last custom-field record aborts and names the listing inputs',()=>{
 const before=snapshot();before.sources['index.html']=page('Home',list().replace('{title}','{price}'));before.sources['work/a/index.html']=page('First').replace('</head>','<meta name="field:price" content="10"></head>');rebake(before);
 const result=planNativeCollectionOperation({...before,origin:origin({deletes:['work/a/index.html']})});
 assert.ok('error'in result);assert.match(result.error,/index\.html/);assert.match(result.error,/Unknown collection field/);
});
test('ordinary single-page moves keep scopes for occupied, deeper and empty destinations',()=>{
 const before=snapshot();delete (before.sources as Record<string,string>)['work/index.html'];before.files=before.files.filter(path=>path!=='work/index.html');before.routes=deriveNativeRoutes(before.files);
 for(const to of ['news/a/index.html','work/x/a/index.html','empty/a/index.html']){
  const plan=good({moves:[{from:'work/a/index.html',to}]},before);
  assert.ok(plan.operation.edits!.get('index.html')!.includes('data-each="/work/"'));
  assert.ok(plan.operation.edits!.get('other.html')!.includes('data-each="/work/ /news/"'));
 }
});
test('explicit folder intent is required, validates all opaque members and is not passed to host apply',()=>{
 const before=snapshot();before.files.push('work/photo.jpg');
 const moves=[{from:'work/index.html',to:'portfolio/index.html'},{from:'work/a/index.html',to:'portfolio/a/index.html'}];
 const partial=planNativeCollectionOperation({...before,origin:origin({folders:[{from:'work/',to:'portfolio/'}],moves})});
 assert.ok('error'in partial);assert.match(partial.error,/Incomplete folder relocation/);
 const plan=good({folders:[{from:'work/',to:'portfolio/'}],moves:[...moves,{from:'work/photo.jpg',to:'portfolio/photo.jpg'}]},before);
 assert.equal(Object.hasOwn(plan.operation,'folders'),false);
 for(const to of ['work/nested/','news/']){
  assert.ok('error'in planNativeCollectionOperation({...before,origin:origin({folders:[{from:'work/',to}],moves})}));
 }
});
test('legal Unicode and space filesystem folders move without collection URL restrictions',()=>{
 const before=snapshot();before.files.push('My Photos/picture.jpg');
 const plan=good({folders:[{from:'My Photos/',to:'Über/'}],moves:[{from:'My Photos/picture.jpg',to:'Über/picture.jpg'}]},before);
 assert.deepEqual(plan.operation.moves,[{from:'My Photos/picture.jpg',to:'Über/picture.jpg'}]);
 assert.equal(plan.operation.edits!.has('Über/picture.jpg'),false);
 assert.equal(plan.operation.expectedSources.get('My Photos/picture.jpg'),undefined);
 assert.equal(nativeCollectionPlanIsCurrent(plan,before),true);
});
test('noncollection hidden destination is legal but an actual collection relocation reports URL grammar',()=>{
 const before=snapshot();before.files.push('Photos/photo.jpg');
 good({folders:[{from:'Photos/',to:'_archive/'}],moves:[{from:'Photos/photo.jpg',to:'_archive/photo.jpg'}]},before);
 const result=planNativeCollectionOperation({...snapshot(),origin:origin({folders:[{from:'work/',to:'_archive/'}],moves:[{from:'work/index.html',to:'_archive/index.html'},{from:'work/a/index.html',to:'_archive/a/index.html'}]})});
 assert.ok('error'in result);assert.match(result.error,/Cannot relocate collection source \/work\/ to \/_archive\//);assert.match(result.error,/collection URLs/);
});
test('missing source folder reports the source rather than destination vacancy',()=>{
 const result=planNativeCollectionOperation({...snapshot(),origin:origin({folders:[{from:'empty/',to:'new/'}]})});
 assert.ok('error'in result);assert.match(result.error,/Source folder has no files: empty\//);assert.doesNotMatch(result.error,/destination/);
});
test('candidate identity bakes renamed titles once while guarding the before identity and graph',()=>{
 const before=snapshot(),candidateIdentity={name:'New Studio'};
 const edits=new Map([['work/a/index.html',page('Renamed | New Studio')],['news/b/index.html',page('News — New Studio')]]);
 const result=planNativeCollectionOperation({...before,candidateIdentity,origin:origin({edits})});
 if('error'in result)assert.fail(result.error);
 assert.deepEqual(result.expectedIdentity,{name:'Studio'});
 assert.equal(result.operation.edits!.size,4);
 for(const path of ['index.html','other.html']){
  const output=result.operation.edits!.get(path)!;
  assert.ok(output.includes('href="/work/a/">Renamed</a>'));
  assert.equal(output.includes('Renamed | New Studio</a>'),false);
 }
 assert.ok(result.operation.edits!.get('other.html')!.includes('href="/news/b/">News</a>'));
 assert.equal(result.operation.edits!.get('work/a/index.html'),page('Renamed | New Studio'));
 assert.equal(nativeCollectionPlanIsCurrent(result,before),true);
 for(const changed of [
  {...before,identity:{name:'New Studio'}},
  {...before,sources:{...before.sources,'work/a/index.html':page('Changed')}},
  {...before,routes:{...before.routes,'/added/':'added/index.html'}},
  {...before,files:[...before.files,'unloaded.jpg']},
  {...before,revision:'scope:2'},
 ])assert.equal(nativeCollectionPlanIsCurrent(result,changed),false);
 candidateIdentity.name='Mutated';before.identity.name='Mutated old';edits.set('work/a/index.html','Mutated');
 assert.deepEqual(result.expectedIdentity,{name:'Studio'});
 assert.ok(result.operation.edits!.get('index.html')!.includes('>Renamed</a>'));
 assert.equal(result.operation.edits!.get('work/a/index.html'),page('Renamed | New Studio'));
});
test('omitting candidate identity keeps legacy suffix baking and an already baked no-op',()=>{
 const before=snapshot();
 // A real origin change: the record's new title carries the site suffix, which the bake strips.
 const change={edits:new Map([['work/a/index.html',page('Second | Studio')]])};
 const legacy=planNativeCollectionOperation({...before,origin:origin(change)});
 if('error'in legacy)assert.fail(legacy.error);
 assert.ok(legacy.operation.edits!.get('index.html')!.includes('>Second</a>'));
 assert.equal(legacy.operation.edits!.get('index.html')!.includes('Second | Studio'),false);
 const explicit=planNativeCollectionOperation({...before,candidateIdentity:{name:'Studio'},origin:origin(change)});
 if('error'in explicit)assert.fail(explicit.error);
 assert.deepEqual(explicit,legacy);
 const baked={...before,sources:{...before.sources,...Object.fromEntries(legacy.operation.edits!)}};
 const noop=planNativeCollectionOperation({...baked,origin:origin({})});
 if('error'in noop)assert.fail(noop.error);
 assert.equal(noop.operation.edits!.size,0);
 assert.equal(nativeCollectionPlanIsCurrent(noop,baked),true);
});
test('hand-edited generated cards refuse later operations instead of being rebaked away',()=>{
 const before=snapshot();
 const edited=before.sources['index.html'].replace('>First</a>','>My own words</a>');
 assert.notEqual(edited,before.sources['index.html']);
 before.sources['index.html']=edited;
 for(const extra of [{edits:new Map([['work/a/index.html',page('Retitled')]])},{deletes:['work/a/index.html']},{creates:[{path:'work/z/index.html',content:page('Z')}]},{edits:new Map([['unrelated.html',page('Unrelated 2')]])}] as Partial<NativeCollectionOrigin>[]){
  const result=planNativeCollectionOperation({...before,origin:origin(extra)});
  assert.ok('error'in result);assert.match(result.error,/index\.html/);assert.match(result.error,/Use manual cards/);assert.match(result.error,/Rebuild cards from page data/);
 }
 assert.equal(before.sources['index.html'],edited);
});
test('only an explicit, pinned, listing-scoped acceptance rebuilds hand-edited cards',()=>{
 const before=snapshot();
 before.sources['index.html']=before.sources['index.html'].replace('>First</a>','>Mine</a>');
 const start=before.sources['index.html'].indexOf('<div data-each');
 const unpinned=planNativeCollectionOperation({...before,origin:origin({acceptGeneratedDrift:[{path:'index.html',start}]})});
 assert.ok('error'in unpinned);
 const wrong=planNativeCollectionOperation({...before,origin:origin({expectedSources:new Map([['index.html',before.sources['index.html']]]),acceptGeneratedDrift:[{path:'index.html',start:start+1}]})});
 assert.ok('error'in wrong);
 const clean=planNativeCollectionOperation({...before,origin:origin({expectedSources:new Map([['other.html',before.sources['other.html']],['index.html',before.sources['index.html']]]),acceptGeneratedDrift:[{path:'index.html',start},{path:'other.html',start:before.sources['other.html'].indexOf('<div data-each')}]})});
 assert.ok('error'in clean);assert.match(clean.error,/already match/);
 const plan=good({expectedSources:new Map([['index.html',before.sources['index.html']]]),acceptGeneratedDrift:[{path:'index.html',start}]},before);
 assert.equal(plan.operation.edits!.get('index.html'),snapshot().sources['index.html']);
 assert.equal('acceptGeneratedDrift'in plan.operation,false);
});
test('detaching hand-edited cards keeps them and drops only the recipe',()=>{
 const before=snapshot();
 before.sources['index.html']=before.sources['index.html'].replace('>First</a>','>Mine</a>');
 const start=before.sources['index.html'].indexOf('<div data-each');
 const manual=before.sources['index.html'].replace(/<div data-each="[^"]*"><template>.*?<\/template>/,'<div>');
 const plan=good({expectedSources:new Map([['index.html',before.sources['index.html']]]),acceptGeneratedDrift:[{path:'index.html',start}],edits:new Map([['index.html',manual]])},before);
 assert.equal(plan.operation.edits!.get('index.html'),manual);
 assert.ok(manual.includes('>Mine</a>'));
});
test('clean listings still rebuild on metadata changes and unbaked new recipes still bake',()=>{
 const plan=good({edits:new Map([['work/a/index.html',page('Fresh')]])});
 assert.ok(plan.operation.edits!.get('index.html')!.includes('>Fresh</a>'));
 const fresh=good({edits:new Map([['unrelated.html',page('Unrelated',list())]])});
 assert.ok(fresh.operation.edits!.get('unrelated.html')!.includes('>First</a>'));
});
test('an invalid collection elsewhere never hides hand edits in a valid listing',()=>{
 const before=snapshot();
 before.sources['index.html']=before.sources['index.html'].replace('>First</a>','>Mine</a>');
 before.sources['unrelated.html']=page('Unrelated','<div data-each="/work/"><template><a>{nope}</a></template></div>');
 // The origin fixes the broken listing; the hand-edited one must still refuse.
 const result=planNativeCollectionOperation({...before,origin:origin({edits:new Map([['unrelated.html',page('Unrelated',list())]])})});
 assert.ok('error'in result);assert.match(result.error,/index\.html were edited by hand/);
});
test('a listing that cannot be checked keeps its cards when an origin fixes its recipe',()=>{
 const before=snapshot();
 before.sources['index.html']=page('Home','<div data-each="/work/"><template><a href="{url}">{nope}</a></template><a>Hand made</a></div>');
 const fix=page('Home','<div data-each="/work/"><template><a href="{url}">{title}</a></template><a>Hand made</a></div>');
 const result=planNativeCollectionOperation({...before,origin:origin({edits:new Map([['index.html',fix]])})});
 assert.ok('error'in result);assert.match(result.error,/could not be checked/);
});
test('a listing whose cards were never built is named as not built, not hand edited',()=>{
 const before=snapshot();
 before.sources['index.html']=page('Home',list().replace('<p>Old</p>',''));
 const result=planNativeCollectionOperation({...before,origin:origin({edits:new Map([['work/a/index.html',page('Renamed')]])})});
 assert.ok('error'in result);assert.match(result.error,/have not been built/);assert.match(result.error,/Build cards from page data/);
 const start=before.sources['index.html'].indexOf('<div data-each');
 const built=good({expectedSources:new Map([['index.html',before.sources['index.html']]]),acceptGeneratedDrift:[{path:'index.html',start}]},before);
 assert.ok(built.operation.edits!.get('index.html')!.includes('>First</a>'));
});
