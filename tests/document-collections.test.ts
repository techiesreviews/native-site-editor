import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveNativeRoutes } from '../shared/native-routes';
import { rewriteRouteLinks } from '../src/native-page-moves';
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

test('an image rename carries a clean JSON collection output, its overrides and page fields along; hand-edited cards stay edited', async () => {
  const { planDocumentMediaBatch } = await import('../src/page-builder/document-collections');
  const { makeCollectionTarget, writePageBuilderDocument, readPageBuilderDocument } = await import('../src/page-builder/page-builder-document');
  const cards = '<a><img src="/images/a.jpg">One</a>';
  const home = `<html><body><div class="cards">${cards}</div><div class="other"><b>x</b></div></body></html>`;
  const base = { pagePath: 'index.html', folders: ['/work/'], sort: '', filter: '', limit: 10, template: '<a><img src="{photo}">{label}</a>', fields: ['photo', 'label'], overrides: { 'work/one/index.html': { photo: '/images/a.jpg', label: 'Keep' } } };
  const sidecar = writePageBuilderDocument({ version: 1, pages: { 'work/one/index.html': { fields: { hero: '/images/a.jpg', mood: 'calm' } } },
    collections: { clean: { ...base, target: makeCollectionTarget(home, home.indexOf('<div class="cards">')), outputFingerprint: cards },
      edited: { ...base, target: makeCollectionTarget(home, home.indexOf('<div class="other">')), outputFingerprint: '<b>y</b>' } } } as never);
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
  const { makeCollectionTarget, writePageBuilderDocument, readPageBuilderDocument } = await import('../src/page-builder/page-builder-document');
  const home = '<html><body><main><div class="cards"></div></main></body></html>';
  const template = '<a style="background-image: url(\'../images/a.jpg?v=2#x\')"><img src="/images/a.jpg" alt=""><img src="{photo}" data-if="photo" alt=""><img src="https://cdn.example/images/a.jpg" alt=""><img src="data:image/png;base64,AA" alt=""><img src="/images/other.jpg" alt="">{label}</a>';
  const sidecar = writePageBuilderDocument({ version: 1, keep: { unknown: [1] },
    pages: { 'work/one/index.html': { fields: { hero: '../../images/a.jpg?v=3', far: 'https://x.example/images/a.jpg', mood: 'calm' } } },
    collections: { work: { pagePath: 'blog/index.html', target: makeCollectionTarget(home, home.indexOf('<div class="cards">')), folders: ['/work/'], sort: '', filter: '', limit: 10, template, fields: ['photo', 'label'],
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
  const { makeCollectionTarget, writePageBuilderDocument, readPageBuilderDocument } = await import('../src/page-builder/page-builder-document');
  const home = '<html><body><main><div class="cards"></div></main></body></html>';
  const listing = (pagePath: string) => ({ pagePath, target: makeCollectionTarget(home, home.indexOf('<div class="cards">')), folders: ['/work/'], sort: '', filter: '', limit: 10, template: '<img src="{photo}" alt="">', fields: ['photo'], overrides: {} });
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

/** Whole-page JSON metadata with native sections, page parts, fields and data the editor does not know. */
function withPageMetadata(){
 const s=canonical();
 const doc=readPageBuilderDocument(s[SIDE]) as PageBuilderDocument & Record<string,unknown>;
 const meta=(tag:string)=>({fields:{tone:tag},sections:{[`${tag}-hero`]:{kind:'hero',copyOf:'index.html'}},pageParts:{header:{shared:'site-header'}},opaque:{nested:[tag,1,true]}});
 (doc.pages as Record<string,unknown>)['work/a/index.html']=meta('a');
 (doc.pages as Record<string,unknown>)['work/b/index.html']=meta('b');
 (doc.pages as Record<string,unknown>)['about/index.html']=meta('about');
 doc.catalog={sharedSections:{'site-header':{html:'<header></header>'}}};
 const raw={...s,'about/index.html':page('About'),[SIDE]:writePageBuilderDocument(doc,s[SIDE])};
 return {raw,meta,doc:readPageBuilderDocument(raw[SIDE]) as PageBuilderDocument & Record<string,unknown>};
}
const sidecarAfter=(r:ReturnType<typeof plan>)=>{if('error'in r)assert.fail(r.error);return readPageBuilderDocument(r.operation.edits!.get(SIDE)) as PageBuilderDocument & Record<string,unknown>;};

test('moving a page carries its complete metadata and leaves other pages, catalog and collections alone',()=>{
 const {raw,meta,doc}=withPageMetadata();
 const r=plan(raw,{moves:[{from:'work/a/index.html',to:'work/z/index.html'}]});
 const after=sidecarAfter(r);
 assert.deepEqual(after.pages['work/z/index.html'],meta('a'));
 assert.equal(Object.hasOwn(after.pages,'work/a/index.html'),false);
 assert.deepEqual(after.pages['work/b/index.html'],doc.pages['work/b/index.html']);
 assert.deepEqual(after.pages['about/index.html'],doc.pages['about/index.html']);
 assert.deepEqual(after.catalog,doc.catalog);
 assert.deepEqual(Object.keys(after.collections),['work']);
 if('error'in r)return;
 assert.equal(r.operation.expectedSources.get(SIDE),raw[SIDE],'the exact JSON it was planned from is pinned');
});
test('moving a folder carries the metadata of every page inside it',()=>{
 const {raw,meta,doc}=withPageMetadata();
 const after=sidecarAfter(plan(raw,{moves:[{from:'work/a/index.html',to:'projects/a/index.html'},{from:'work/b/index.html',to:'projects/b/index.html'}],folders:[{from:'work/',to:'projects/'}]}));
 assert.deepEqual(after.pages['projects/a/index.html'],meta('a'));
 assert.deepEqual(after.pages['projects/b/index.html'],meta('b'));
 assert.deepEqual(after.pages['about/index.html'],doc.pages['about/index.html']);
 assert.deepEqual(after.catalog,doc.catalog);
});
test('deleting a page removes its whole metadata and keeps the rest',()=>{
 const {raw,doc}=withPageMetadata();
 const after=sidecarAfter(plan(raw,{deletes:['work/b/index.html']}));
 assert.equal(Object.hasOwn(after.pages,'work/b/index.html'),false);
 assert.deepEqual(after.pages['work/a/index.html'],doc.pages['work/a/index.html']);
 assert.deepEqual(after.pages['about/index.html'],doc.pages['about/index.html']);
 assert.deepEqual(after.catalog,doc.catalog);
});
test('moving a page onto leftover metadata of a missing file is refused and changes nothing',()=>{
 const {raw,meta}=withPageMetadata();
 const doc=readPageBuilderDocument(raw[SIDE]) as PageBuilderDocument & Record<string,unknown>;
 (doc.pages as Record<string,unknown>)['work/z/index.html']={...meta('orphan'),links:['keep-me']};
 const sources={...raw,[SIDE]:writePageBuilderDocument(doc,raw[SIDE])};
 const frozen=structuredClone(sources);
 const moves=[{from:'work/a/index.html',to:'work/z/index.html'}];
 const r=plan(sources,{moves});
 assert.ok('error'in r,'no operation is produced');
 assert.match(r.error,/work\/z\/index\.html/);
 assert.match(r.error,/already has page data/);
 assert.deepEqual(sources,frozen);
 assert.deepEqual(moves,[{from:'work/a/index.html',to:'work/z/index.html'}]);
});
test('a page without metadata may still move to a path with leftover metadata',()=>{
 const {raw,meta}=withPageMetadata();
 const doc=readPageBuilderDocument(raw[SIDE]) as PageBuilderDocument & Record<string,unknown>;
 delete (doc.pages as Record<string,unknown>)['work/a/index.html'];
 (doc.pages as Record<string,unknown>)['work/z/index.html']=meta('orphan');
 const after=sidecarAfter(plan({...raw,[SIDE]:writePageBuilderDocument(doc,raw[SIDE])},{moves:[{from:'work/a/index.html',to:'work/z/index.html'}]}));
 assert.deepEqual(after.pages['work/z/index.html'],meta('orphan'));
});
test('a duplicated page starts without the original page metadata or links',()=>{
 const {raw,doc}=withPageMetadata();
 const r=plan(raw,{creates:[{path:'work/c/index.html',content:raw['work/a/index.html']}]});
 const after=sidecarAfter(r);
 assert.equal(Object.hasOwn(after.pages,'work/c/index.html'),false);
 assert.deepEqual(after.pages['work/a/index.html'],doc.pages['work/a/index.html']);
});

/**
 * Shared copies whose bytes a page move's site-managed link rewrite changes: the about page's
 * section and the home page's header link /about/. Built as the Files move builds its origin:
 * the moves plus every page with links rewritten by rewriteRouteLinks.
 */
function sharedSite(){
 const head='<header class="site-header"><a href="/">S</a><a href="/about/">About</a></header>';
 const hero='<section class="hero"><h1>About</h1><a href="/about/#team">Team</a></section>';
 const sources:Record<string,string>={
  'index.html':page('Home',head+'<main><p>Hi</p></main>'),
  'about/index.html':page('About',head+`<main>${hero}</main>`),
  'work/a/index.html':page('Alpha',head.replace('>S<','>Custom<')),
 };
 const target=(path:string,needle:string)=>makeCollectionTarget(sources[path],sources[path].indexOf(needle));
 const part=(path:string)=>({kind:'native-page-part',recordId:'site-head',target:target(path,'<header'),basis:head,unknown:{kept:[1]}});
 const doc={version:1,collections:{},
  reusablePageParts:{version:1,records:{'site-head':{id:'site-head',label:'Site header',htmlPath:'.editor/page-parts/site-head.html',rootTag:'header',rootClass:'site-header',stylesheetPath:'styles/site.css'}}},
  pages:{
   'index.html':{pageParts:{'site-head-1':part('index.html')},fields:{tone:'home'}},
   'about/index.html':{sections:{'hero-1':{kind:'native-section',recordId:'about-hero',target:target('about/index.html','<section class="hero"'),basis:hero},other:{kind:'not-native',basis:'/about/'}},pageParts:{'site-head-1':part('about/index.html')},opaque:{nested:['/about/']}},
   // A customised copy: its header differs from the basis before the move.
   'work/a/index.html':{pageParts:{'site-head-1':part('work/a/index.html')}},
  }} as unknown as PageBuilderDocument;
 sources[SIDE]=writePageBuilderDocument(doc);
 return {sources,head,hero};
}
/** The Files move's origin: moves, and every page whose links the URL change rewrites. */
function urlMove(sources:Record<string,string>,from:string,to:string,extraEdits:Record<string,string>={}){
 const moves=Object.keys(sources).filter(path=>path.startsWith(from)).map(path=>({from:path,to:to+path.slice(from.length)}));
 const moved=new Map(moves.map(m=>[m.from,m.to]));
 const edits=new Map<string,string>();
 for(const [path,text] of Object.entries(sources)){
  if(path===SIDE)continue;
  const next=rewriteRouteLinks(text,`/${from}`,`/${to}`,true).text;
  if(next!==text)edits.set(moved.get(path)??path,next);
 }
 for(const [path,text] of Object.entries(extraEdits))edits.set(path,text);
 return plan(sources,{moves,folders:[{from,to}],edits});
}
const page_=(doc:PageBuilderDocument,path:string)=>doc.pages[path] as Record<string,Record<string,Record<string,unknown>>>;

test('a folder move rebases the basis of pristine shared copies whose links it rewrote, on the moved page and others',()=>{
 const {sources,head,hero}=sharedSite();
 const before=readPageBuilderDocument(sources[SIDE]);
 const after=sidecarAfter(urlMove(sources,'about/','studio/'));
 const studio=page_(after,'studio/index.html');
 assert.equal(studio.sections['hero-1'].basis,hero.replace('/about/#team','/studio/#team'));
 assert.equal(studio.pageParts['site-head-1'].basis,head.replace('/about/','/studio/'));
 assert.equal(page_(after,'index.html').pageParts['site-head-1'].basis,head.replace('/about/','/studio/'),'a pristine copy on a page that did not move');
 // Customised before the move: stays customised.
 assert.equal(page_(after,'work/a/index.html').pageParts['site-head-1'].basis,head);
 // Only bases change: unknown entries, unknown link fields, targets and other pages' data stay exactly.
 const expected=structuredClone(before) as PageBuilderDocument;
 expected.pages['studio/index.html']=expected.pages['about/index.html'];delete expected.pages['about/index.html'];
 (page_(expected,'studio/index.html').sections['hero-1']).basis=studio.sections['hero-1'].basis;
 (page_(expected,'studio/index.html').pageParts['site-head-1']).basis=studio.pageParts['site-head-1'].basis;
 (page_(expected,'index.html').pageParts['site-head-1']).basis=studio.pageParts['site-head-1'].basis;
 assert.deepEqual(after,expected);
});
test('a pristine copy the move also changes by hand, or an edit with no move, keeps its basis',()=>{
 const {sources,head}=sharedSite();
 const homeEdited=rewriteRouteLinks(sources['index.html'],'/about/','/studio/').text.replace('>S<','>Hand<');
 const after=sidecarAfter(urlMove(sources,'about/','studio/',{'index.html':homeEdited}));
 assert.equal(page_(after,'index.html').pageParts['site-head-1'].basis,head);
 // The same rewrite as a plain edit, no page moving: nothing is a site-managed URL change.
 const plain=plan(sources,{edits:new Map([['index.html',rewriteRouteLinks(sources['index.html'],'/about/','/studio/').text]])});
 if('error'in plain)assert.fail(plain.error);
 assert.equal(plain.operation.edits!.has(SIDE),false,'the JSON is not rewritten');
});
test('a malformed recognised link refuses a URL move atomically; the leftover-metadata guard still refuses',()=>{
 const {sources}=sharedSite();
 const doc=readPageBuilderDocument(sources[SIDE]);
 delete page_(doc,'index.html').pageParts['site-head-1'].basis;
 const broken={...sources,[SIDE]:writePageBuilderDocument(doc,sources[SIDE])};
 const r=urlMove(broken,'about/','studio/');
 assert.ok('error'in r);assert.match(r.error,/needs its basis/);
 const left=readPageBuilderDocument(sources[SIDE]);
 (left.pages as Record<string,unknown>)['studio/index.html']={fields:{note:'old'}};
 const leftover=urlMove({...sources,[SIDE]:writePageBuilderDocument(left,sources[SIDE])},'about/','studio/');
 assert.ok('error'in leftover);assert.match(leftover.error,/studio\/index\.html already has page data/);
});
