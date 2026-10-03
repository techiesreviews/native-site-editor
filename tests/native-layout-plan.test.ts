import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planNativeLayoutInsert, type NativeLayoutInput } from '../src/page-builder/native-layout-plan';
import { nativePageStylesheets } from '../shared/native-project';
import { writeCssProperties, locateWriteRule } from '../src/page-builder/css-write';
const page='<html><head><title>Page</title></head><body><main><section><p>Keep</p></section></main></body></html>';
const point={path:'index.html',parent:[0],index:1,top:0,left:0,width:100,before:''};
function input(extra:Partial<NativeLayoutInput>={}):NativeLayoutInput {const value:NativeLayoutInput={sources:{'index.html':page,'styles/site.css':'/* keep */\n@layer base { body { color: red; } }\n'},point,kind:'grid',cssPath:'styles/site.css',...extra};if(!Object.hasOwn(extra,'files'))value.files=Object.keys(value.sources);return value;}
function good(value:NativeLayoutInput){const plan=planNativeLayoutInsert(value);if('error'in plan)assert.fail(plan.error);return plan;}
test('grid produces one guarded HTML/CSS operation, working link, selection and portable class',()=>{
 const before=input(),plan=good(before),html=plan.operation.edits.get('index.html')!,css=plan.operation.edits.get('styles/site.css')!;
 assert.equal(plan.operation.edits.size,2);assert.ok(html.includes(`<div class="${plan.className}">`));assert.equal(html.includes(' style='),false);
 assert.deepEqual(nativePageStylesheets(html,'index.html'),['styles/site.css']);assert.deepEqual(plan.selection,{path:'index.html',node:[0,1]});
 assert.ok(css.startsWith(before.sources['styles/site.css']));assert.ok(css.includes('display: grid'));assert.equal(css.includes('!important'),false);
 assert.equal(plan.operation.expectedSources.get('index.html'),page);assert.equal(plan.operation.expectedSources.get('styles/site.css'),before.sources['styles/site.css']);
 assert.deepEqual(before,input());
});
test('columns have editable class rules with low-specificity child flex and no inline layout',()=>{
 const plan=good(input({kind:'columns'})),css=plan.operation.edits.get('styles/site.css')!;
 assert.ok(css.includes(`:where(.${plan.className} > div)`));assert.ok(css.includes('flex: 1 1 16rem'));assert.equal(plan.operation.edits.get('index.html')!.includes('style='),false);
 const changed=writeCssProperties(css,{selector:`.${plan.className}`,expectedSource:css},{display:'grid'});
 assert.ok(locateWriteRule(changed,{selector:`.${plan.className}`})!.declarations.some(d=>d.property==='display'&&d.value==='grid'));
});
test('subpage existing direct stylesheet is retained and a new stylesheet links relatively',()=>{
 const sub='work/a/index.html',linked=page.replace('</head>','<link rel="stylesheet" href="../../styles/site.css"></head>');
 const existing=good(input({sources:{[sub]:linked,'styles/site.css':''},point:{...point,path:sub}}));
 assert.equal((existing.operation.edits.get(sub)!.match(/rel="stylesheet"/g)??[]).length,1);
 const fresh=good(input({sources:{[sub]:page},files:[sub],point:{...point,path:sub},cssPath:'styles/layout.css'}));
 assert.ok(fresh.operation.edits.get(sub)!.includes('href="../../styles/layout.css"'));assert.equal(fresh.operation.expectedSources.get('styles/layout.css'),undefined);assert.deepEqual(fresh.expectedFiles,[sub]);
});
test('class collisions include other pages, entity attributes and escaped CSS class names',()=>{
 const value=input();value.sources={...value.sources,'other.html':'<div class="native-grid-1 native-grid&#45;2">Other</div>','other.css':'.native-grid\\2d 3 { color: red; }'};value.files=Object.keys(value.sources);
 const plan=good(value);assert.equal(plan.className,'native-grid-4');assert.equal(plan.operation.expectedSources.get('other.css'),value.sources['other.css']);
});
test('conditional or query loads refuse instead of duplicating a stylesheet after a blue theme',()=>{
 for(const attr of ['media="screen"','title="Preferred"','media="print"','disabled','type="text/less"']){
  const html=page.replace('</head>',`<link rel="stylesheet" href="styles/site.css" ${attr}><link rel="stylesheet" href="theme.css"></head>`);
  const result=planNativeLayoutInsert(input({sources:{'index.html':html,'styles/site.css':'body { color:red; }','theme.css':'body { color:blue; }'}}));
  assert.ok('error'in result);assert.match(result.error,/Choose another stylesheet/);
 }
 const html=page.replace('</head>','<link rel="stylesheet" href="styles/site.css?v=1"></head>');
 assert.ok('error'in planNativeLayoutInsert(input({sources:{'index.html':html,'styles/site.css':''}})));
});
test('import chains and inline style imports refuse a new direct unlayered load',()=>{
 for(const head of ['<link rel="stylesheet" href="main.css">','<style>@import url(styles/site.css) layer(base);</style>']){
  const result=planNativeLayoutInsert(input({sources:{'index.html':page.replace('</head>',head+'</head>'),'main.css':'@import "middle.css" layer(base);','middle.css':'@import "styles/site.css";','styles/site.css':'body { color:red; }'}}));
  assert.ok('error'in result);assert.match(result.error,/Choose another stylesheet/);
 }
});
test('integrity on the selected or another known page refuses modifying stylesheet bytes',()=>{
 const sri='<link rel="stylesheet" href="styles/site.css" integrity="sha384-Exact">';
 for(const html of ['index.html','other.html']){
  const sources={'index.html':page,'styles/site.css':'body {color:blue}',[html]:page.replace('</head>',sri+'</head>')};
  const result=planNativeLayoutInsert(input({sources}));assert.ok('error'in result);assert.match(result.error,/integrity/);
 }
});
test('inert template/noscript links require one active fresh link, entity hrefs reuse and base refuses',()=>{
 for(const wrapper of ['template','noscript']){
  const html=page.replace('</head>',`<${wrapper}><link rel="stylesheet" href="styles/site.css"></${wrapper}></head>`);
  const plan=good(input({sources:{'index.html':html,'styles/site.css':''}}));
  assert.ok(plan.operation.edits.get('index.html')!.includes(`</${wrapper}>\n  <link rel="stylesheet" href="styles/site.css">`));
 }
 const entity=page.replace('</head>','<link rel="stylesheet" href="styles&#47;site.css" type="text/css "></head>');
 const plan=good(input({sources:{'index.html':entity,'styles/site.css':''}}));assert.equal((plan.operation.edits.get('index.html')!.match(/rel="stylesheet"/g)??[]).length,1);
 assert.ok('error'in planNativeLayoutInsert(input({sources:{'index.html':page.replace('</head>','<base href="https://cdn.example/"></head>'),'styles/site.css':''}})));
});
test('malformed CSS, unsafe paths, missing/opaque CSS and invalid HTML destinations fail whole plan',()=>{
 for(const value of [input({sources:{'index.html':page,'styles/site.css':'.x { color: "unfinished'}}),input({cssPath:'evil".css'}),input({cssPath:'../site.css'}),input({sources:{'index.html':page},files:undefined}),input({sources:{'index.html':page},files:['index.html','styles/site.css']}),input({sources:{'index.html':page.replace('<head><title>Page</title></head>',''),'styles/site.css':''}}),input({point:{...point,parent:[0,0,0],index:0}})]){
  assert.ok('error'in planNativeLayoutInsert(value));
 }
});
test('CRLF page and existing layered CSS bytes remain intact before new unlayered rule',()=>{
 const css='@layer base, theme;\r\n@layer theme { .keep { content: "{ exact }"; } }\r\n';
 const plan=good(input({sources:{'index.html':page.replaceAll('><','>\r\n<'),'styles/site.css':css}}));
 assert.ok(plan.operation.edits.get('styles/site.css')!.startsWith(css));assert.ok(plan.operation.edits.get('index.html')!.includes('\r\n  <link'));
 const rule=locateWriteRule(plan.operation.edits.get('styles/site.css')!,{selector:`.${plan.className}`})!;assert.equal(rule.parent,undefined);
});
test('Chromium preserves blue link order on refusal and recognizes the fresh link outside inert markup',async()=>{
 const {chromium}=await import('@playwright/test');const browser=await chromium.launch({headless:true});
 try{
  const tab=await browser.newPage();let html=page.replace('</head>','<link rel="stylesheet" href="styles/site.css" media="screen"><link rel="stylesheet" href="theme.css"></head>');
  let css='body { color: rgb(255, 0, 0); }';
  await tab.route('https://native-layout.test/**',route=>{
   const path=new URL(route.request().url()).pathname;
   return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/html',body:path==='/styles/site.css'?css:path==='/theme.css'?'body { color: rgb(0, 0, 255); }':html});
  });
  await tab.goto('https://native-layout.test/');assert.equal(await tab.evaluate(()=>getComputedStyle(document.body).color),'rgb(0, 0, 255)');
  const before=input({sources:{'index.html':html,'styles/site.css':css,'theme.css':'body {color:blue}'}});
  assert.ok('error'in planNativeLayoutInsert(before));assert.equal(before.sources['index.html'],html);
  for(const wrapper of ['template','noscript']){
   const original=page.replace('</head>',`<${wrapper}><link rel="stylesheet" href="styles/site.css"></${wrapper}></head>`);
   const plan=good(input({sources:{'index.html':original,'styles/site.css':css}}));html=plan.operation.edits.get('index.html')!;css=plan.operation.edits.get('styles/site.css')!;
   await tab.goto('https://native-layout.test/');
   assert.equal(await tab.evaluate(()=>document.styleSheets.length),1);
   assert.equal(await tab.locator(`.${plan.className}`).evaluate(el=>getComputedStyle(el).display),'grid');
  }
 }finally{await browser.close();}
});
test('unloaded local roots and unresolved relative roots refuse unverifiable reachability',()=>{
 for(const head of ['<link rel="stylesheet" href="missing.css">','<link rel="stylesheet" href="../x.css">']){
  const html=page.replace('</head>',head+'</head>');
  const result=planNativeLayoutInsert(input({sources:{'index.html':html},files:['index.html'],cssPath:'styles/layouts.css'}));
  assert.ok('error'in result);assert.match(result.error,/cannot be verified/);
 }
});
test('fresh stylesheet permits external fonts without modifying existing CSS or font links',()=>{
 const font='<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">';
 const html=page.replace('</head>',font+'</head>');
 const plan=good(input({sources:{'index.html':html},files:['index.html'],cssPath:'styles/layouts.css'}));
 assert.ok(plan.operation.edits.get('index.html')!.includes(font));assert.ok(plan.operation.edits.get('styles/layouts.css')!.includes('display: grid'));
 const result=planNativeLayoutInsert(input({sources:{'index.html':html,'styles/site.css':''}}));assert.ok('error'in result);
});
test('preload/onload and nonstylesheet references refuse adding another copy of the chosen sheet',()=>{
 for(const rel of ['preload','modulepreload','icon','stylesheet']){
  const html=page.replace('</head>',`<link rel="${rel}" as="style" href="styles/site.css" onload="this.rel='stylesheet'"><link rel="stylesheet" href="theme.css"></head>`);
  const result=planNativeLayoutInsert(input({sources:{'index.html':html,'styles/site.css':'body{color:red}','theme.css':'body{color:blue}'}}));
  assert.ok('error'in result);assert.match(result.error,/Choose another stylesheet/);
 }
});
test('existing CSS modifications require every HTML/HTM loaded and conservatively reject noscript SRI',()=>{
 const unloaded=planNativeLayoutInsert(input({files:['index.html','other.htm','styles/site.css']}));assert.ok('error'in unloaded);assert.match(unloaded.error,/Load other.htm/);
 const sri='<noscript><link integrity="sha384-exact" rel="stylesheet" href="styles/site.css"></noscript>';
 const result=planNativeLayoutInsert(input({sources:{'index.html':page,'other.htm':page.replace('</head>',sri+'</head>'),'styles/site.css':''}}));assert.ok('error'in result);assert.match(result.error,/other.htm.*integrity/);
});
test('published preload callback loads before blue theme and planner refuses a duplicate stylesheet',async()=>{
 const {chromium}=await import('@playwright/test');const browser=await chromium.launch({headless:true});
 try{
  const tab=await browser.newPage();const html=page.replace('</head>',`<link id="preload" rel="preload" as="style" href="styles/site.css" onload="this.rel='stylesheet';this.onload=null"><link rel="stylesheet" href="theme.css"></head>`);
  await tab.route('https://native-layout.test/**',route=>route.fulfill({contentType:route.request().url().endsWith('.css')?'text/css':'text/html',body:route.request().url().endsWith('site.css')?'body {color:rgb(255,0,0)}':route.request().url().endsWith('theme.css')?'body {color:rgb(0,0,255)}':html}));
  await tab.goto('https://native-layout.test/');await tab.waitForFunction(()=>document.querySelector('#preload')!.getAttribute('rel')==='stylesheet');
  assert.equal(await tab.evaluate(()=>getComputedStyle(document.body).color),'rgb(0, 0, 255)');assert.equal(await tab.evaluate(()=>document.styleSheets.length),2);
  assert.ok('error'in planNativeLayoutInsert(input({sources:{'index.html':html,'styles/site.css':'body{color:red}','theme.css':'body{color:blue}'}})));
 }finally{await browser.close();}
});
test('script-loaded CSS bundles traverse their import graph while favicon assets remain irrelevant',async()=>{
 const html=page.replace('</head>',`<link id="bundle" rel="preload" as="style" href="bundle.css" onload="this.rel='stylesheet';this.onload=null"><link rel="stylesheet" href="theme.css"><link rel="icon" href="icon.png"></head>`);
 const sources={'index.html':html,'bundle.css':'@import "styles/site.css";','styles/site.css':'body {color:rgb(255,0,0)}','theme.css':'body {color:rgb(0,0,255)}'};
 const result=planNativeLayoutInsert(input({sources}));assert.ok('error'in result);assert.match(result.error,/Choose another stylesheet/);
 const favicon=good(input({sources:{'index.html':page.replace('</head>','<link rel="icon" href="icon.png"></head>'),'styles/site.css':''}}));assert.ok(favicon.operation.edits.has('styles/site.css'));
 const {chromium}=await import('@playwright/test');const browser=await chromium.launch({headless:true});
 try{
  const tab=await browser.newPage();await tab.route('https://native-layout.test/**',route=>{const path=new URL(route.request().url()).pathname.slice(1);return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/html',body:sources[path as keyof typeof sources]??html});});
  await tab.goto('https://native-layout.test/');await tab.waitForFunction(()=>document.querySelector('#bundle')!.getAttribute('rel')==='stylesheet');
  assert.equal(await tab.evaluate(()=>getComputedStyle(document.body).color),'rgb(0, 0, 255)');
 }finally{await browser.close();}
});
