import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveNativeRoutes } from '../shared/native-routes';
import { planSidecarRecipe } from '../src/page-builder/collection-origins';
import { planNativeCollectionOperation, type NativeCollectionOrigin } from '../src/page-builder/native-collection-host';
import { EDITOR_PAGE_BUILDER_PATH as SIDE, readPageBuilderDocument, writePageBuilderDocument, type PageBuilderDocument } from '../src/page-builder/page-builder-document';
import { makeSectionTarget } from '../src/page-builder/source-target';

const page=(title:string,body='')=>`<html><head><title>${title}</title></head><body>${body}</body></html>`;
const home=(cards='')=>page('Home',`<section class="intro"><p>Hi</p></section><div class="cards" id="work-cards">${cards}</div>`);
const recipe=(source:string,extra:Partial<PageBuilderDocument['collections'][string]>={}):PageBuilderDocument=>({version:1,pages:{},collections:{work:{pagePath:'index.html',target:makeSectionTarget(source,source.indexOf('<div class="cards"')),folders:['/work/'],sort:'title',filter:'',limit:500,template:'<a href="{url}">{title}</a>',fields:[],overrides:{},...extra}}});
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
 doc.collections.inner={...doc.collections.work,target:makeSectionTarget(nestedSource,nestedSource.indexOf('<span class="inner">')),outputFingerprint:'x'};
 const nested=plan({...s,'index.html':nestedSource,[SIDE]:writePageBuilderDocument(doc,s[SIDE])},{edits:new Map([['work/b/index.html',page('Beta 2')]])});
 assert.ok('error'in nested);assert.match(nested.error,/overlap|edited by hand|can no longer be found/);
 // One hand-edited and one missing on the same page: refused, nothing written.
 const two=readPageBuilderDocument(s[SIDE]);
 two.collections.gone={...two.collections.work,target:{path:[9,9],tag:'div',openingTagFingerprint:'<div class="nothing">'},outputFingerprint:''};
 const twoSources={...s,'index.html':s['index.html'].replace('>Alpha<','>Mine<'),[SIDE]:writePageBuilderDocument(two,s[SIDE])};
 const r=plan(twoSources,{acceptCollections:['work'],expectedSources:pins(twoSources)});
 assert.ok('error'in r);assert.match(r.error,/can no longer be found exactly/);
});

test('an image rename carries a clean JSON collection output, its overrides and page fields along; hand-edited cards stay edited', async () => {
  const { planDocumentMediaBatch } = await import('../src/page-builder/document-collections');
  const cards = '<a><img src="/images/a.jpg">One</a>';
  const home = `<html><body><div class="cards">${cards}</div><div class="other"><b>x</b></div></body></html>`;
  const base = { pagePath: 'index.html', folders: ['/work/'], sort: '', filter: '', limit: 10, template: '<a><img src="{photo}">{label}</a>', fields: ['photo', 'label'], overrides: { 'work/one/index.html': { photo: '/images/a.jpg', label: 'Keep' } } };
  const sidecar = writePageBuilderDocument({ version: 1, pages: { 'work/one/index.html': { fields: { hero: '/images/a.jpg', mood: 'calm' } } },
    collections: { clean: { ...base, target: makeSectionTarget(home, home.indexOf('<div class="cards">')), outputFingerprint: cards },
      edited: { ...base, target: makeSectionTarget(home, home.indexOf('<div class="other">')), outputFingerprint: '<b>y</b>' } } } as never);
  const after = home.replace('/images/a.jpg', '/images/b.jpg');
  const text = planDocumentMediaBatch({ 'index.html': home }, sidecar, new Map([['index.html', after]]), [{ from: 'images/a.jpg', to: 'images/b.jpg' }]);
  assert.ok(text);
  const doc = readPageBuilderDocument(text!);
  assert.equal(doc.collections.clean.outputFingerprint, '<a><img src="/images/b.jpg">One</a>');
  assert.equal(doc.collections.edited.outputFingerprint, '<b>y</b>');
  assert.deepEqual(doc.collections.clean.overrides['work/one/index.html'], { photo: '/images/b.jpg', label: 'Keep' });
  assert.deepEqual(doc.pages['work/one/index.html'].fields, { hero: '/images/b.jpg', mood: 'calm' });
  assert.equal(planDocumentMediaBatch({ 'about.html': '<p></p>' }, sidecar, new Map([['about.html', '<p>x</p>']]), []), undefined);
  assert.equal(planDocumentMediaBatch({}, undefined, new Map(), []), undefined);
});

test('an image rename moves literal template references, relative and suffixed values, and leaves bindings, external and unrelated values alone', async () => {
  const { planDocumentMediaBatch } = await import('../src/page-builder/document-collections');
  const home = '<html><body><main><div class="cards"></div></main></body></html>';
  const template = '<a style="background-image: url(\'../images/a.jpg?v=2#x\')"><img src="/images/a.jpg" alt=""><img src="{photo}" data-if="photo" alt=""><img src="https://cdn.example/images/a.jpg" alt=""><img src="data:image/png;base64,AA" alt=""><img src="/images/other.jpg" alt="">{label}</a>';
  const sidecar = writePageBuilderDocument({ version: 1, keep: { unknown: [1] },
    pages: { 'work/one/index.html': { fields: { hero: '../../images/a.jpg?v=3', far: 'https://x.example/images/a.jpg', mood: 'calm' } } },
    collections: { work: { pagePath: 'blog/index.html', target: makeSectionTarget(home, home.indexOf('<div class="cards">')), folders: ['/work/'], sort: '', filter: '', limit: 10, template, fields: ['photo', 'label'],
      overrides: { 'work/one/index.html': { photo: '../images/a.jpg#top', label: 'images/a.jpg' } } } } } as never);
  const text = planDocumentMediaBatch({}, sidecar, new Map(), [{ from: 'images/a.jpg', to: 'images/b.jpg' }]);
  assert.ok(text);
  const doc = readPageBuilderDocument(text!);
  assert.equal(doc.collections.work.template, template.replace("../images/a.jpg?v=2#x", "/images/b.jpg?v=2#x").replace('src="/images/a.jpg"', 'src="/images/b.jpg"'));
  assert.deepEqual(doc.collections.work.overrides['work/one/index.html'], { photo: '/images/b.jpg#top', label: 'images/a.jpg' });
  assert.deepEqual(doc.pages['work/one/index.html'].fields, { hero: '/images/b.jpg?v=3', far: 'https://x.example/images/a.jpg', mood: 'calm' });
  assert.deepEqual((doc as Record<string, unknown>).keep, { unknown: [1] });
});

test('a bare relative page field is resolved where its cards are written: on every page that lists it, refusing when they disagree', async () => {
  const { planDocumentMediaBatch } = await import('../src/page-builder/document-collections');
  const home = '<html><body><main><div class="cards"></div></main></body></html>';
  const listing = (pagePath: string) => ({ pagePath, target: makeSectionTarget(home, home.indexOf('<div class="cards">')), folders: ['/work/'], sort: '', filter: '', limit: 10, template: '<img src="{photo}" alt="">', fields: ['photo'], overrides: {} });
  const routes = { '/': 'index.html', '/work/': 'work/index.html', '/work/one/': 'work/one/index.html', '/blog/': 'blog/index.html', '/about/': 'about/index.html' };
  const pages = { 'work/one/index.html': { fields: { photo: 'images/a.jpg', root: '/images/a.jpg?v=2' } }, 'about/index.html': { fields: { photo: 'images/a.jpg' } } };
  const move = [{ from: 'images/a.jpg', to: 'images/b.jpg' }];
  // Listed from the root: the card on index.html shows images/a.jpg, so the field moves to what the page rewriter writes there.
  const root = writePageBuilderDocument({ version: 1, pages, collections: { home: listing('index.html') } } as never);
  const moved = readPageBuilderDocument(planDocumentMediaBatch({}, root, new Map(), move, routes)!);
  assert.deepEqual(moved.pages['work/one/index.html'].fields, { photo: '/images/b.jpg', root: '/images/b.jpg?v=2' });
  // Listed by nothing: resolved on its own page (about/images/a.jpg is not the moved image).
  assert.deepEqual(moved.pages['about/index.html'].fields, { photo: 'images/a.jpg' });
  // Listed from the root and from /blog/: the same value means two different images, so the rename is refused.
  const both = writePageBuilderDocument({ version: 1, pages, collections: { home: listing('index.html'), blog: listing('blog/index.html') } } as never);
  assert.throws(() => planDocumentMediaBatch({}, both, new Map(), move, routes), /^Error: The page field “photo” of work\/one\/index\.html \(images\/a\.jpg\) points at different images on blog\/index\.html and index\.html, which list it, so the image was not renamed\./);
});

test('unrelated operations skip a broken JSON recipe or target without changing its page or recipe',()=>{
 for(const defect of ['sort','target','cards'] as const){
  const s:Record<string,string>={...canonical(),'unrelated.html':page('Other')};
  const doc=readPageBuilderDocument(s[SIDE]);
  if(defect==='sort')doc.collections.work.sort='unknown';
  if(defect==='target')s['index.html']=s['index.html'].replace('id="work-cards"','id="missing"');
  if(defect==='cards')s['index.html']=s['index.html'].replace('>Alpha<','>Manual<');
  s[SIDE]=writePageBuilderDocument(doc,s[SIDE]);
  const r=plan(s,{edits:new Map([['unrelated.html',page('Changed')]])});
  if('error'in r)assert.fail(`${defect}: ${r.error}`);
  assert.equal(r.operation.edits!.has('index.html'),false,defect);
  assert.equal(r.operation.edits!.has(SIDE),false,defect);
  assert.equal(r.operation.expectedSources.get(SIDE),s[SIDE]);
  assert.equal(r.skipped.length,1,defect);
  assert.equal(r.skipped[0].path,'index.html');
  for(const extra of [{edits:new Map([['work/a/index.html',page('Changed')]])},{edits:new Map([['index.html',s['index.html']+'\n']])},{creates:[{path:'work/c/index.html',content:page('New')}]}]){
   assert.ok('error'in plan(s,extra),`${defect}: touching the broken listing refuses`);
  }
 }
});

test('healthy JSON listings still bake while a distinct broken recipe and its cards stay exact',()=>{
 const s:Record<string,string>={...canonical(),'news/a/index.html':page('News')};
 const newsCards='<a href="/news/a/">News</a>';
 s['news-list.html']=home(newsCards);
 const doc=readPageBuilderDocument(s[SIDE]);
 doc.collections.news={...structuredClone(doc.collections.work),pagePath:'news-list.html',target:makeSectionTarget(s['news-list.html'],s['news-list.html'].indexOf('<div')),folders:['/news/'],outputFingerprint:newsCards};
 doc.collections.work.sort='unknown';
 s[SIDE]=writePageBuilderDocument(doc,s[SIDE]);
 const r=plan(s,{edits:new Map([['news/a/index.html',page('Updated news')]])});
 if('error'in r)assert.fail(r.error);
 assert.match(r.operation.edits!.get('news-list.html')!,/>Updated news<\/a>/);
 assert.equal(r.operation.edits!.has('index.html'),false);
 assert.deepEqual(readPageBuilderDocument(r.operation.edits!.get(SIDE)).collections.work,doc.collections.work);
 assert.equal(r.skipped.length,1);
 assert.equal(r.operation.expectedSources.get('index.html'),s['index.html']);
 const healthySave=plan(s,planSidecarRecipe(graph(s),'news-list.html',s['news-list.html'].indexOf('<div'),doc.collections.news));
 if('error'in healthySave)assert.fail(healthySave.error);
 assert.equal(healthySave.skipped.length,1);
 assert.ok('error'in plan(s,planSidecarRecipe(graph(s),'index.html',s['index.html'].indexOf('<div'),doc.collections.work)),'explicit Save of the broken recipe refuses');
 for(const extra of [
  {moves:[{from:'work/a/index.html',to:'elsewhere/a/index.html'}]},
  {deletes:['work/a/index.html']},
  {edits:new Map([[SIDE,writePageBuilderDocument({...doc,pages:{'work/a/index.html':{fields:{category:'Changed'}}}},s[SIDE])]])},
  {moves:[{from:'index.html',to:'moved-list.html'}]},
 ])assert.ok('error'in plan(s,extra),'source URL, deletion, metadata and listing moves refuse');
 const malformed=structuredClone(doc);malformed.collections.work.template='<a>{unknown}</a>';
 assert.ok('error'in plan({...s,[SIDE]:JSON.stringify(malformed)},{edits:new Map([['news/a/index.html',page('Updated news')]])}),'invalid template schema still refuses the whole document');
});


test('a broken JSON recipe refuses a Code-edited selected input using the pre-edit dependency basis',()=>{
 const s:Record<string,string>=canonical();
 const doc=readPageBuilderDocument(s[SIDE]);doc.collections.work.sort='unknown';
 s[SIDE]=writePageBuilderDocument(doc,s[SIDE]);
 const before=s['work/a/index.html'];s['work/a/index.html']=page('Changed in Code');
 const r=plan(s,{driftBasis:{path:'work/a/index.html',source:before},expectedSources:new Map([['work/a/index.html',s['work/a/index.html']]])});
 assert.ok('error'in r);assert.match(r.error,/Unknown collection field: unknown/);
});
