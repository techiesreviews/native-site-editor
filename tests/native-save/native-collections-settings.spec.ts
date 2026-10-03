import { test, expect, type Page } from '@playwright/test';
async function mount(page:Page,baseURL:string|undefined,settings=true){
 await page.goto(baseURL!);
 await page.evaluate(async settings=>{
  const {mountCollectionsPanel}=await import('/src/components/collections-panel.ts');
  const {applyCollectionEdits}=await import('/src/page-builder/collection-bake.ts');
  const host=document.createElement('div');document.body.replaceChildren(host);
  const source='<html><head><title>Home</title><meta name="date" content="2025-01-01"><meta name="field:category" content="Clay"></head><body><div><a href="/old/">Old</a></div></body></html>';
  const state={sources:{'index.html':source,'work/one/index.html':'<html><head><title>One</title></head><body></body></html>'} as Record<string,string>,routes:{'/':'index.html','/work/one/':'work/one/index.html'},identity:{name:'Studio'},revision:'scope-A',calls:0,pending:false,refreshOnApply:false,messages:[] as string[],resolve:undefined as undefined|(()=>void),opened:[] as string[]};
  const panel=mountCollectionsPanel(host,{sources:()=>state.sources,routes:()=>state.routes,identity:()=>state.identity,revision:()=>state.revision,page:()=>'index.html',apply:async(plan,revision)=>{
   state.calls++;if(state.pending)await new Promise<void>(resolve=>state.resolve=resolve);
   if(revision!==state.revision||Object.entries(plan.expectedSources).some(([path,source])=>state.sources[path]!==source))return false;
   for(const [path,edits]of Object.entries(plan.edits))state.sources[path]=applyCollectionEdits(state.sources[path],edits);
   if(state.refreshOnApply)panel.update();
   return true;
  },openPage:path=>state.opened.push(path),announce:message=>state.messages.push(message)},{settings});
  Object.assign(window,{collectionSettings:{panel,state,start:source.indexOf('<div>')}});
 },settings);
}
test('Settings fields stage Date and custom values onto the supplied candidate without writes',async({page,baseURL})=>{
 await mount(page,baseURL);
 await expect(page.getByLabel('Date',{exact:true})).toBeVisible();
 for(const label of ['Title','Description','Image'])await expect(page.getByLabel(label,{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Apply page fields'})).toHaveCount(0);
 await expect(page.locator('.collections-panel form')).toHaveCount(0);
 await page.getByLabel('Date',{exact:true}).fill('2026-10-03');
 await page.getByLabel('Category',{exact:true}).fill('Clay & "glaze" <new>');
 const proof=await page.evaluate(()=>{const h=(window as any).collectionSettings;const candidate=h.state.sources['index.html'].replace('<title>Home</title>','<title>Candidate metadata</title>');return{dirty:h.panel.pageFieldsDirty(),source:h.panel.pageFieldSource(candidate),calls:h.state.calls};});
 expect(proof.dirty).toBe(true);expect(proof.calls).toBe(0);expect(proof.source).toContain('<title>Candidate metadata</title>');expect(proof.source).toContain('content="2026-10-03"');expect(proof.source).toContain('Clay &amp; &quot;glaze&quot; &lt;new&gt;');
 for(const name of ['title','url','Bad name','category']){
  await page.getByLabel('New custom field name').fill(name);
  expect(await page.evaluate(()=>{const h=(window as any).collectionSettings;try{h.panel.pageFieldSource(h.state.sources['index.html']);return '';}catch(error){return String(error);}})).toMatch(/built-in field|valid editable page field|already exists/);
 }
 await page.evaluate(()=>{const h=(window as any).collectionSettings;h.panel.openGrid('index.html',h.start);});
 await expect(page.getByRole('status')).toHaveText('Select a grid and open its collection settings.');
 expect(await page.evaluate(()=>(window as any).collectionSettings.state.calls)).toBe(0);
});
test('dirty update preserves input and caret and refuses stale source, routes, identity and revision',async({page,baseURL})=>{
 for(const change of ['source','routes','identity','revision']){
  await mount(page,baseURL);
  const date=page.getByLabel('Date',{exact:true});await date.fill('typing');await date.evaluate((el:HTMLInputElement)=>el.setSelectionRange(2,2));
  await page.evaluate(change=>{const h=(window as any).collectionSettings;if(change==='source')h.state.sources['index.html']+='<!-- agent -->';if(change==='routes')h.state.routes['/new/']='new.html';if(change==='identity')h.state.identity.name='Changed';if(change==='revision')h.state.revision='scope-B';h.panel.update();},change);
  await expect(date).toHaveValue('typing');await expect(date).toBeFocused();expect(await date.evaluate((el:HTMLInputElement)=>el.selectionStart)).toBe(2);
  expect(await page.evaluate(()=>{const h=(window as any).collectionSettings;try{h.panel.pageFieldSource(h.state.sources['index.html']);return '';}catch(error){return String(error);}})).toContain('Reopen');
 }
});
test('input typed while an async standalone apply waits remains visible and cannot silently rebase',async({page,baseURL})=>{
 await mount(page,baseURL,false);
 await page.getByLabel('Date',{exact:true}).fill('2026-01-01');
 await page.evaluate(()=>{const h=(window as any).collectionSettings;h.state.pending=true;h.state.refreshOnApply=true;});
 await page.getByRole('button',{name:'Apply page fields'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).collectionSettings.state.calls)).toBe(1);
 const date=page.getByLabel('Date',{exact:true});await date.fill('newer typing');
 await page.evaluate(()=>(window as any).collectionSettings.state.resolve());
 await expect(page.getByRole('status')).toContainText('Newer input was kept');
 await expect(date).toHaveValue('newer typing');await expect(date).toBeFocused();
 expect(await page.evaluate(()=>(window as any).collectionSettings.state.messages.some((message:string)=>message.startsWith('The page or repository changed')))).toBe(false);
 await page.getByRole('button',{name:'Apply page fields'}).click();
 await expect(page.getByRole('status')).toContainText('Reopen');
 expect(await page.evaluate(()=>(window as any).collectionSettings.state.calls)).toBe(1);
});
test('grid keeps common source controls visible while Advanced opens by keyboard and applies real template HTML',async({page,baseURL})=>{
 await mount(page,baseURL,false);
 await page.evaluate(()=>{const h=(window as any).collectionSettings;h.panel.openGrid('index.html',h.start);});
 await expect(page.getByLabel('Card template HTML')).toBeHidden();
 await expect(page.getByRole('checkbox',{name:'/work/'})).toBeVisible();
 await expect(page.getByLabel('Maximum items (1–500)')).toBeVisible();
 const summary=page.locator('.collections-panel__advanced > summary');await summary.focus();await page.keyboard.press('Enter');
 await page.getByLabel('Card template HTML').fill('<article><a href="{url}">{title}</a></article>');
 await expect(page.getByRole('status').first()).toContainText('1 matching page');
 await page.getByRole('button',{name:'Make collection',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Grid made into a collection');
 const proof=await page.evaluate(()=>{const h=(window as any).collectionSettings;return{source:h.state.sources['index.html'],calls:h.state.calls};});
 expect(proof.calls).toBe(1);expect(proof.source).toContain('<article><a href="/work/one/">One</a></article>');
});

test('untouched Settings fields pass a changed metadata candidate through and offer no page navigation',async({page,baseURL})=>{
 await mount(page,baseURL);
 await page.evaluate(()=>{const h=(window as any).collectionSettings;h.state.sources['index.html']=h.state.sources['index.html'].replace('<div>','<div data-each="/work/"><template><a href="{url}">{title}</a></template>');h.panel.update();});
 await expect(page.getByRole('region',{name:'Collections and page fields'})).toContainText('1 matching page');
 const proof=await page.evaluate(()=>{const h=(window as any).collectionSettings;h.state.revision='new-session';h.state.sources['index.html']+='<!-- metadata apply -->';const candidate='<html><head><title>General draft</title></head><body></body></html>';return{dirty:h.panel.pageFieldsDirty(),result:h.panel.pageFieldSource(candidate),candidate};});
 expect(proof.dirty).toBe(false);expect(proof.result).toBe(proof.candidate);
 await expect(page.getByRole('button',{name:/Edit page:|Edit card design in source/})).toHaveCount(0);
});
