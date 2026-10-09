import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const fixture = resolve('fixtures/native-starter');
const paths = ['index.html','styles/site.css','components/site-header/site-header.html','components/site-footer/site-footer.html','components/project-card/project-card.html'];
const sources = Object.fromEntries(paths.map(path=>[path,readFileSync(resolve(fixture,path),'utf8')]));
const islands = '<svg id="opaque-svg" viewBox="0 0 10 10"><path d="M 0 0"/><foreignObject><div>SVG label</div></foreignObject></svg>\n<template id="opaque-template" data-each="/notes/"><p>{title}</p><template><p>Nested</p></template></template>\n<noscript><p>No scripts</p></noscript>\n';
const source = sources['index.html'].replace('<main class="page" data-key="main">','<main class="page" data-key="main">'+islands);
test.beforeEach(async ({page})=>{
  await page.goto('/tests/fixtures/native-elements-compat.html');
  await page.evaluate(async ({sources,source})=>{
    const ops = await import('/src/page-builder/native-operations.ts');
    const code = await import('/src/components/code-editor.ts');
    const {createNativePreview} = await import('/src/components/native-preview.ts');
    const {resolveNativeProject} = await import('/shared/native-project.ts');
    const state:any={source,structure:undefined};
    const live={...sources,'index.html':source};
    const preview=createNativePreview(document.querySelector('#preview') as HTMLElement,{onStructure:structure=>state.structure=structure});
    const site=resolveNativeProject(Object.keys(live));if(!site.ok)throw new Error(site.error);
    preview.activate(site.site);preview.update({sources:live});
    code.mountCodeEditor(document.querySelector('#code') as HTMLElement,{key:'compat-editor',historyScope:'compat',path:'index.html',source,onContextChange:file=>{if(file){state.source=file.content;live['index.html']=file.content;preview.update({sources:live});}}});
    code.clearHistory();
    const harness={state,ops,code,
      insert(parent:number[],index:number,markup:string){const edit=ops.nativeMarkupInsertEdit(state.source,parent,index,markup);if(!edit)return false;code.replaceActiveRange({path:'index.html',start:edit.start,end:edit.end,expected:edit.original,text:edit.text});return true;},
      move(from:number[],parent:number[],index:number){const edit=ops.nativeMoveEdit(state.source,from,{parent,index});if(!edit)return false;code.replaceActiveRange({path:'index.html',start:edit.start,end:edit.end,expected:edit.original,text:edit.text});return true;},
      history(direction:'undo'|'redo'){return code.runVisualHistory(direction,'index.html');},
    };Object.assign(window,{elementCompat:harness});
  },{sources,source});
  await expect(page.frameLocator('.native-preview-frame').getByRole('heading',{name:'A native browser preview'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).elementCompat.state.structure?.items.length)).toBe(3);
});
test('real starter indexes include islands while template content stays outside element children; outside insertion has one Undo/Redo',async({page})=>{
  const structure=await page.evaluate(()=>(window as any).elementCompat.state.structure);
  expect(structure.items.map((item:any)=>item.tag)).toEqual(['site-header','main','site-footer']);
  const main=structure.items[1];
  expect(main.children.map((item:any)=>item.tag)).toEqual(['svg','template','noscript','section','section','section']);
  expect(main.children[1].children).toEqual([]);
  expect(main.children[3].node).toEqual([1,3]);
  expect(main.children[4].children[0].tag).toBe('project-card');
  expect(main.children[4].children[0].children.map((item:any)=>item.node)).toEqual([[1,4,0,0],[1,4,0,1]]);
  expect(await page.evaluate(()=>(window as any).elementCompat.insert([1,3],2,'<p id="added-native">Added outside islands</p>'))).toBe(true);
  await expect(page.frameLocator('.native-preview-frame').locator('#added-native')).toBeVisible();
  const changed=await page.evaluate(()=>(window as any).elementCompat.state.source);
  expect(changed).toContain(islands);expect(changed).toContain('<site-header data-key="header"></site-header>');
  expect(await page.evaluate(()=>(window as any).elementCompat.history('undo'))).toBe(true);
  expect(await page.evaluate(()=>(window as any).elementCompat.state.source)).toBe(source);
  await expect(page.frameLocator('.native-preview-frame').locator('#added-native')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).elementCompat.history('redo'))).toBe(true);
  expect(await page.evaluate(()=>(window as any).elementCompat.state.source)).toBe(changed);
});
test('ordinary section containing components moves across islands without changing native bytes, then undoes exactly',async({page})=>{
  const cardBytes=source.slice(source.indexOf('<section class="cards"'),source.indexOf('  <section class="filler"')).trimEnd();
  expect(await page.evaluate(()=>(window as any).elementCompat.move([1,4],[1],0))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).elementCompat.state.structure?.items[1].children[0].children[0]?.tag)).toBe('project-card');
  const changed=await page.evaluate(()=>(window as any).elementCompat.state.source);
  for(const match of source.matchAll(/<project-card\b[^>]*>[\s\S]*?<\/project-card>/g)) expect(changed).toContain(match[0]);
  expect(changed).toContain(islands);
  expect(cardBytes).toContain('<project-card');
  expect(await page.evaluate(()=>(window as any).elementCompat.history('undo'))).toBe(true);
  expect(await page.evaluate(()=>(window as any).elementCompat.state.source)).toBe(source);
});
test('inside and partial island paths refuse insertion/move and leave source/history untouched',async({page})=>{
  const result=await page.evaluate(()=>{const h=(window as any).elementCompat;return {insertions:[[1,0],[1,0,0],[1,1],[1,1,0],[1,4,0],[1,4,0,1]].map(path=>h.insert(path,0,'<p>Text</p>')),moves:[h.move([1,0],[1],6),h.move([1,4,0,1],[1,3],0),h.move([1,3,0],[1,4,0],0)],source:h.state.source};});
  expect(result.insertions).toEqual([false,false,false,false,false,false]);expect(result.moves).toEqual([false,false,false]);expect(result.source).toBe(source);
  expect(await page.evaluate(()=>(window as any).elementCompat.history('undo'))).toBe(false);
});
test('inline custom/foreign islands and inert list templates preserve real browser parent boundaries',async({page})=>{
  const inline='<p id="inline-islands"><x-label><span>Inline</span></x-label><svg><path/></svg><math><mi>x</mi></math><template><div>Separate content</div></template></p><ul id="template-list"><template><li>Example</li></template><li>Existing</li></ul>';
  await page.evaluate(inline=>{const h=(window as any).elementCompat;const before=h.state.source;const after=before.replace('  <section class="hero"',inline+'  <section class="hero"');h.code.replaceActiveRange({path:'index.html',start:0,end:before.length,expected:before,text:after});},inline);
  const frame=page.frameLocator('.native-preview-frame');
  await expect(frame.locator('#inline-islands')).toBeVisible();
  expect(await frame.locator('#inline-islands').evaluate(el=>({parent:el.parentElement?.tagName,children:[...el.children].map(child=>child.localName),templateChildren:el.querySelector('template')?.children.length}))).toEqual({parent:'MAIN',children:['x-label','svg','math','template'],templateChildren:0});
  expect(await frame.locator('#template-list').evaluate(el=>[...el.children].map(child=>child.localName))).toEqual(['template','li']);
  expect(await page.evaluate(()=>(window as any).elementCompat.insert([1,5],0,'<p id="inline-proof">Outside remains editable</p>'))).toBe(true);
  await expect(frame.locator('#inline-proof')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).elementCompat.state.source)).toContain(inline);
});

test('a slash consumed by an unquoted foreign attribute cannot cause a wrong-path source edit',async({page})=>{
  const malformed='<main><svg data-x=x/><section id="island"></section><div id="target">Target</div></main>';
  await page.evaluate(malformed=>{const h=(window as any).elementCompat;const before=h.state.source;h.code.replaceActiveRange({path:'index.html',start:0,end:before.length,expected:before,text:malformed});},malformed);
  await expect(page.frameLocator('.native-preview-frame').locator('#target')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).elementCompat.state.structure?.items[0].children.map((item:any)=>item.tag))).toEqual(['svg','div']);
  const actualPath=await page.evaluate(()=>(window as any).elementCompat.state.structure.items[0].children[1].node);
  expect(actualPath).toEqual([0,1]);
  expect(await page.evaluate(path=>(window as any).elementCompat.insert(path,0,'<p>Text</p>'),actualPath)).toBe(false);
  expect(await page.evaluate(()=>(window as any).elementCompat.state.source)).toBe(malformed);
  await expect(page.frameLocator('.native-preview-frame').locator('#island p')).toHaveCount(0);
});
test('valid inline SVG foreignObject block content leaves the following section editable',async({page})=>{
  const valid='<main><p><svg><foreignObject><div>Label</div></foreignObject></svg></p><section id="target">Target</section></main>';
  await page.evaluate(valid=>{const h=(window as any).elementCompat;const before=h.state.source;h.code.replaceActiveRange({path:'index.html',start:0,end:before.length,expected:before,text:valid});},valid);
  await expect(page.frameLocator('.native-preview-frame').locator('#target')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).elementCompat.state.structure?.items[0].children.map((item:any)=>item.tag))).toEqual(['p','section']);
  expect(await page.evaluate(()=>(window as any).elementCompat.insert([0,1],0,'<p id="outside-proof">Text</p>'))).toBe(true);
  await expect(page.frameLocator('.native-preview-frame').locator('#target #outside-proof')).toHaveCount(1);
  expect(await page.evaluate(()=>(window as any).elementCompat.state.source)).toContain('<p><svg><foreignObject><div>Label</div></foreignObject></svg></p>');
});

for(const [name,char] of [['NBSP','\u00a0'],['VT','\u000b'],['BOM','\ufeff']]) test(`HTML token whitespace excludes ${name} in unquoted values and tag names`,async({page})=>{
  const frame=page.frameLocator('.native-preview-frame');
  for(const opening of [`<svg data-x=x${char}/>`,`<svg${char}/>`]) {
    const malformed=`<main>${opening}<section id="island">Island</section><div id="target">Target</div></main>`;
    await page.evaluate(malformed=>{const h=(window as any).elementCompat;const before=h.state.source;h.code.replaceActiveRange({path:'index.html',start:0,end:before.length,expected:before,text:malformed});},malformed);
    await expect(frame.locator('#target')).toHaveCount(1);
    await expect.poll(()=>frame.locator('#page > main > :first-child').evaluate(el=>el.localName)).toBe(opening.startsWith('<svg data-')?'svg':`svg${char}`);
    const live=await page.evaluate(()=>(window as any).elementCompat.state.source);
    // Monaco preserves these value/name characters; the operation must fail closed.
    expect(live).toBe(malformed);
    expect(await page.evaluate(()=>(window as any).elementCompat.insert([0,1],0,'<p id="wrong-edit">Text</p>'))).toBe(false);
    expect(await page.evaluate(()=>(window as any).elementCompat.state.source)).toBe(malformed);
    await expect(frame.locator('#wrong-edit')).toHaveCount(0);
  }
});

test('six catalogue blocks insert into the real starter and undo exactly; placeholder parses as SVG', async ({ page }) => {
  const blocks = await page.evaluate(async () => {
    const { nativeElementChoices, nativeChoiceMarkup, placeholderImageSvg, PLACEHOLDER_IMAGE_PATH, PLACEHOLDER_IMAGE_WIDTH, PLACEHOLDER_IMAGE_HEIGHT } = await import('/src/page-builder/native-elements.ts');
    const svg = new DOMParser().parseFromString(placeholderImageSvg, 'image/svg+xml');
    if (svg.querySelector('parsererror')) throw new Error('Invalid placeholder SVG');
    const root = svg.documentElement;
    if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg' || root.getAttribute('width') !== String(PLACEHOLDER_IMAGE_WIDTH) || root.getAttribute('height') !== String(PLACEHOLDER_IMAGE_HEIGHT) || root.getAttribute('viewBox') !== `0 0 ${PLACEHOLDER_IMAGE_WIDTH} ${PLACEHOLDER_IMAGE_HEIGHT}`) throw new Error('Placeholder dimensions or namespace mismatch');
    const image = new DOMParser().parseFromString(nativeChoiceMarkup('native:image')!, 'text/html').querySelector('img')!;
    if (image.getAttribute('src') !== `/${PLACEHOLDER_IMAGE_PATH}` || image.width !== PLACEHOLDER_IMAGE_WIDTH || image.height !== PLACEHOLDER_IMAGE_HEIGHT || image.alt !== '') throw new Error('Image placeholder mismatch');
    return nativeElementChoices.map(choice => ({ key: choice.tag, markup: nativeChoiceMarkup(choice.tag)! }));
  });
  expect(blocks.map(block => block.key)).toEqual(['native:section', 'native:div', 'native:heading', 'native:paragraph', 'native:image', 'native:button']);
  for (const block of blocks) {
    expect(await page.evaluate(markup => (window as any).elementCompat.insert([1], 6, markup), block.markup)).toBe(true);
    const last = page.frameLocator('.native-preview-frame').locator('#page > main > :last-child');
    await expect(last).toHaveCount(1);
    await expect.poll(() => last.evaluate(element => element.outerHTML)).toBe(block.markup);
    expect(await page.evaluate(() => (window as any).elementCompat.state.source)).toContain(islands);
    expect(await page.evaluate(() => (window as any).elementCompat.history('undo'))).toBe(true);
    expect(await page.evaluate(() => (window as any).elementCompat.state.source)).toBe(source);
    await expect(page.frameLocator('.native-preview-frame').locator('#page > main > *')).toHaveCount(6);
  }
});
