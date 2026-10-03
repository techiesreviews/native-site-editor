import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planNativeLayoutInsert, type NativeLayoutInput } from '../src/page-builder/native-layout-plan';
import { nativePageStylesheets } from '../shared/native-project';
import { writeCssProperties, locateWriteRule } from '../src/page-builder/css-write';
const page='<html><head><title>Page</title></head><body><main><section><p>Keep</p></section></main></body></html>';
const point={path:'index.html',parent:[0],index:1,top:0,left:0,width:100,before:''};
function input(extra:Partial<NativeLayoutInput>={}):NativeLayoutInput {return{sources:{'index.html':page,'styles/site.css':'/* keep */\n@layer base { body { color: red; } }\n'},point,kind:'grid',cssPath:'styles/site.css',...extra};}
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
 assert.ok(css.includes(`.${plan.className} > :where(div)`));assert.ok(css.includes('flex: 1 1 16rem'));assert.equal(plan.operation.edits.get('index.html')!.includes('style='),false);
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
 const value=input();value.sources={...value.sources,'other.html':'<div class="native-grid-1 native-grid&#45;2">Other</div>','other.css':'.native-grid\\2d 3 { color: red; }'};
 const plan=good(value);assert.equal(plan.className,'native-grid-4');assert.equal(plan.operation.expectedSources.get('other.css'),value.sources['other.css']);
});
test('conditional, alternate, external or query links get a fresh effective local link',()=>{
 for(const link of ['<link rel="stylesheet" href="styles/site.css?v=1">','<link rel="alternate stylesheet" href="styles/site.css">','<link rel="stylesheet" href="styles/site.css" media="print">','<link rel="stylesheet" href="https://example.com/styles/site.css">','<link rel="stylesheet" href="styles%2fsite.css">','<link rel="stylesheet" href="styles/site.css" type="text/less">','<link rel="stylesheet" href="styles/site.css" disabled>']){
  const plan=good(input({sources:{'index.html':page.replace('</head>',link+'</head>'),'styles/site.css':''}}));
  assert.ok(plan.operation.edits.get('index.html')!.includes('<link rel="stylesheet" href="styles/site.css">'));
 }
});
test('malformed CSS, unsafe paths, missing/opaque CSS and invalid HTML destinations fail whole plan',()=>{
 for(const value of [input({sources:{'index.html':page,'styles/site.css':'.x { color: "unfinished'}}),input({cssPath:'evil".css'}),input({cssPath:'../site.css'}),input({sources:{'index.html':page}}),input({sources:{'index.html':page},files:['index.html','styles/site.css']}),input({sources:{'index.html':page.replace('<head><title>Page</title></head>',''),'styles/site.css':''}}),input({point:{...point,parent:[0,0,0],index:0}})]){
  assert.ok('error'in planNativeLayoutInsert(value));
 }
});
test('CRLF page and existing layered CSS bytes remain intact before new unlayered rule',()=>{
 const css='@layer base, theme;\r\n@layer theme { .keep { content: "{ exact }"; } }\r\n';
 const plan=good(input({sources:{'index.html':page.replaceAll('><','>\r\n<'),'styles/site.css':css}}));
 assert.ok(plan.operation.edits.get('styles/site.css')!.startsWith(css));assert.ok(plan.operation.edits.get('index.html')!.includes('\r\n  <link'));
 const rule=locateWriteRule(plan.operation.edits.get('styles/site.css')!,{selector:`.${plan.className}`})!;assert.equal(rule.parent,undefined);
});
