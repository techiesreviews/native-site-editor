import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveNativeRoutes } from '../shared/native-routes';
import { planNativeCollectionOperation, type NativeCollectionOrigin } from '../src/page-builder/native-collection-host';
import { EDITOR_PAGE_BUILDER_PATH as SIDE, makeCollectionTarget, readPageBuilderDocument, writePageBuilderDocument, type PageBuilderDocument } from '../src/page-builder/page-builder-document';

const page=(title:string,body='')=>`<html><head><title>${title}</title></head><body>${body}</body></html>`;
const home=(cards='')=>page('Home',`<section class="intro"><p>Hi</p></section><div class="cards" id="work-cards">${cards}</div>`);
const recipe=(source:string,extra:Partial<PageBuilderDocument['collections'][string]>={}):PageBuilderDocument=>({version:1,pages:{},collections:{work:{pagePath:'index.html',target:makeCollectionTarget(source,source.indexOf('<div class="cards"')),folders:['/work/'],sort:'title',filter:'',limit:500,template:'<a href="{url}">{title}</a>',fields:[],overrides:{},...extra}}});
const origin=(extra:Partial<NativeCollectionOrigin>):NativeCollectionOrigin=>({done:'Done',undone:'Undone',...extra});
function graph(sources:Record<string,string>){return{sources,routes:deriveNativeRoutes(Object.keys(sources)),revision:'r',files:Object.keys(sources),identity:{name:'S'}};}
/** A canonical site: cards baked and recorded by the editor itself. */
function canonical(){
 const raw={'index.html':home(),'work/a/index.html':page('Alpha'),'work/b/index.html':page('Beta'),[SIDE]:writePageBuilderDocument(recipe(home()))};
 const built=planNativeCollectionOperation({...graph(raw),origin:origin({acceptCollections:['work'],expectedSources:new Map([['index.html',raw['index.html']],[SIDE,raw[SIDE]]])})});
 if('error'in built)throw Error(built.error);
 return {...raw,...Object.fromEntries(built.operation.edits!)};
}
const pins=(s:Record<string,string>)=>new Map<string,string|undefined>([['index.html',s['index.html']],[SIDE,s[SIDE]]]);
const plan=(sources:Record<string,string>,extra:Partial<NativeCollectionOrigin>)=>planNativeCollectionOperation({...graph(sources),origin:origin(extra)});

test('sidecar recipes bake clean HTML and record the exact output in JSON only',()=>{
 const s=canonical();
 assert.equal(s['index.html'],home('<a href="/work/a/">Alpha</a>\n<a href="/work/b/">Beta</a>'));
 assert.doesNotMatch(s['index.html'],/template|data-each|data-sort|\{title\}/);
 assert.equal(readPageBuilderDocument(s[SIDE]).collections.work.outputFingerprint,'<a href="/work/a/">Alpha</a>\n<a href="/work/b/">Beta</a>');
 const created=plan(s,{creates:[{path:'work/c/index.html',content:page('Gamma')}]});
 if('error'in created)assert.fail(created.error);
 assert.ok(created.operation.edits!.get('index.html')!.includes('<a href="/work/c/">Gamma</a>'));
 assert.ok(readPageBuilderDocument(created.operation.edits!.get(SIDE)).collections.work.outputFingerprint!.includes('Gamma'));
 assert.equal(created.operation.expectedSources.get(SIDE),s[SIDE]);
});
test('a title change on a listed page rebuilds the card and fingerprint in the same operation',()=>{
 const s=canonical();
 const r=plan(s,{edits:new Map([['work/a/index.html',page('Alpha 2')]])});
 if('error'in r)assert.fail(r.error);
 assert.ok(r.operation.edits!.get('index.html')!.includes('>Alpha 2</a>'));
 assert.equal(r.operation.edits!.get('work/a/index.html'),page('Alpha 2'));
 assert.ok(r.operation.edits!.has(SIDE));
});
test('hand-edited cards refuse every later operation; only an explicit id rebuilds; dropping the recipe keeps them',()=>{
 const s=canonical();
 const edited={...s,'index.html':s['index.html'].replace('>Alpha<','>Mine<')};
 for(const extra of [{edits:new Map([['work/a/index.html',page('X')]])},{deletes:['work/b/index.html']},{creates:[{path:'work/z/index.html',content:page('Z')}]}] as Partial<NativeCollectionOrigin>[]){
  const r=plan(edited,extra);assert.ok('error'in r);assert.match(r.error,/index\.html were edited by hand/);
 }
 const rebuilt=plan(edited,{acceptCollections:['work'],expectedSources:pins(edited)});
 const unpinned=plan(edited,{acceptCollections:['work']});assert.ok('error'in unpinned);assert.match(unpinned.error,/Pin/);
 if('error'in rebuilt)assert.fail(rebuilt.error);
 assert.equal(rebuilt.operation.edits!.get('index.html'),s['index.html']);
 const clean=plan(s,{acceptCollections:['work'],expectedSources:pins(s)});assert.ok('error'in clean);assert.match(clean.error,/already match/);
 const doc=readPageBuilderDocument(s[SIDE]);delete (doc.collections as Record<string,unknown>).work;
 const manual=plan(edited,{edits:new Map([[SIDE,writePageBuilderDocument(doc,s[SIDE])]])});
 if('error'in manual)assert.fail(manual.error);
 assert.equal(manual.operation.edits!.has('index.html'),false,'the hand-edited cards stay exactly');
});
test('missing or ambiguous targets and invalid JSON refuse without writes',()=>{
 const s=canonical();
 const missing=plan({...s,'index.html':s['index.html'].replace('id="work-cards"','id="other"')},{edits:new Map([['work/a/index.html',page('X')]])});
 assert.ok('error'in missing);assert.match(missing.error,/can no longer be found/);
 const invalid=plan({...s,[SIDE]:'{"version":2}'},{edits:new Map([['work/a/index.html',page('X')]])});
 assert.ok('error'in invalid);assert.match(invalid.error,/page-builder\.json is not valid/);
 const notJson=plan({...s,[SIDE]:'{'},{});assert.ok('error'in notJson);
});
test('a shifted but unique target rebinds in the same operation',()=>{
 const s=canonical();
 const shifted={...s,'index.html':s['index.html'].replace('<section class="intro"><p>Hi</p></section>','<section class="intro"><p>Hi</p></section><aside>New</aside>')};
 const r=plan(shifted,{edits:new Map([['work/a/index.html',page('Alpha 3')]])});
 if('error'in r)assert.fail(r.error);
 assert.ok(r.operation.edits!.get('index.html')!.includes('<aside>New</aside>'));
 assert.ok(r.operation.edits!.get('index.html')!.includes('>Alpha 3</a>'));
 assert.notDeepEqual(readPageBuilderDocument(r.operation.edits!.get(SIDE)).collections.work.target.path,readPageBuilderDocument(s[SIDE]).collections.work.target.path);
});
test('moving and deleting pages carry their JSON metadata; deleting the sidecar leaves the cards',()=>{
 const s=canonical();
 const doc=readPageBuilderDocument(s[SIDE]);doc.pages['work/a/index.html']={fields:{tone:'warm'}};doc.collections.work.fields=['tone'];doc.collections.work.overrides={'work/a/index.html':{tone:'hot'}};
 const withMeta={...s,[SIDE]:writePageBuilderDocument(doc,s[SIDE])};
 const moved=plan(withMeta,{moves:[{from:'work/a/index.html',to:'work/aa/index.html'}]});
 if('error'in moved)assert.fail(moved.error);
 const after=readPageBuilderDocument(moved.operation.edits!.get(SIDE));
 assert.deepEqual(after.pages['work/aa/index.html'],{fields:{tone:'warm'}});
 assert.deepEqual(after.collections.work.overrides,{'work/aa/index.html':{tone:'hot'}});
 const gone=plan(s,{deletes:[SIDE]});
 if('error'in gone)assert.fail(gone.error);
 assert.deepEqual(gone.operation.deletes,[SIDE]);
 assert.equal(gone.operation.edits!.has('index.html'),false);
});
test('a new sidecar is created in the same operation and its absence is pinned',()=>{
 const raw={'index.html':home(),'work/a/index.html':page('Alpha')};
 const text=writePageBuilderDocument(recipe(home()));
 const r=plan(raw,{creates:[{path:SIDE,content:text}],acceptCollections:[]});
 if('error'in r)assert.fail(r.error);
 assert.equal(r.operation.expectedSources.get(SIDE),undefined);
 assert.ok(r.operation.edits!.get('index.html')!.includes('>Alpha</a>'));
 assert.ok(readPageBuilderDocument(r.operation.creates!.find(c=>c.path===SIDE)!.content).collections.work.outputFingerprint);
});
test('same-page collections are located together: nested, duplicate or missing targets refuse the whole operation',()=>{
 const s=canonical();
 const doc=readPageBuilderDocument(s[SIDE]);
 // A second collection whose target is nested inside the first.
 const nestedSource=s['index.html'].replace('<a href="/work/a/">','<span class="inner"><a href="/work/a/">').replace('Alpha</a>','Alpha</a></span>');
 doc.collections.inner={...doc.collections.work,target:makeCollectionTarget(nestedSource,nestedSource.indexOf('<span class="inner">')),outputFingerprint:'x'};
 const nested=plan({...s,'index.html':nestedSource,[SIDE]:writePageBuilderDocument(doc,s[SIDE])},{edits:new Map([['work/b/index.html',page('Beta 2')]])});
 assert.ok('error'in nested);assert.match(nested.error,/overlap|edited by hand|can no longer be found/);
 // One hand-edited and one missing on the same page: refused, nothing written.
 const two=readPageBuilderDocument(s[SIDE]);
 two.collections.gone={...two.collections.work,target:{path:[9,9],tag:'div',openingTagFingerprint:'<div class="nothing">'},outputFingerprint:''};
 const twoSources={...s,'index.html':s['index.html'].replace('>Alpha<','>Mine<'),[SIDE]:writePageBuilderDocument(two,s[SIDE])};
 const r=plan(twoSources,{acceptCollections:['work'],expectedSources:pins(twoSources)});
 assert.ok('error'in r);assert.match(r.error,/can no longer be found exactly/);
});
