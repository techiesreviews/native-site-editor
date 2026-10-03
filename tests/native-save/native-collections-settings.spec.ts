import { test, expect, type Page } from '@playwright/test';
async function mount(page:Page,baseURL:string|undefined,settings=true){
 await page.goto(baseURL!);
 await page.evaluate(async settings=>{
  const {mountCollectionsPanel}=await import('/src/components/collections-panel.ts');
  const {applyCollectionEdits}=await import('/src/page-builder/collection-bake.ts');
  const host=document.createElement('div');document.body.replaceChildren(host);
  const source='<html><head><title>Home</title><meta name="date" content="2025-01-01"><meta name="field:category" content="Clay"></head><body><div><a href="/old/">Old</a></div></body></html>';
  const state={sources:{'index.html':source,'work/one/index.html':'<html><head><title>One</title></head><body></body></html>'} as Record<string,string>,routes:{'/':'index.html','/work/one/':'work/one/index.html'},identity:{name:'Studio'},revision:'scope-A',calls:0,pending:false,resolve:undefined as undefined|(()=>void),opened:[] as string[]};
  const panel=mountCollectionsPanel(host,{sources:()=>state.sources,routes:()=>state.routes,identity:()=>state.identity,revision:()=>state.revision,page:()=>'index.html',apply:async(plan,revision)=>{
   state.calls++;if(state.pending)await new Promise<void>(resolve=>state.resolve=resolve);
   if(revision!==state.revision||Object.entries(plan.expectedSources).some(([path,source])=>state.sources[path]!==source))return false;
   for(const [path,edits]of Object.entries(plan.edits))state.sources[path]=applyCollectionEdits(state.sources[path],edits);
   return true;
  },openPage:path=>state.opened.push(path),announce:()=>{}},{settings});
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
 for(const name of ['title','url','Bad name']){
  await page.getByLabel('New custom field name').fill(name);
  expect(await page.evaluate(()=>{const h=(window as any).collectionSettings;try{h.panel.pageFieldSource(h.state.sources['index.html']);return '';}catch(error){return String(error);}})).toMatch(/built-in field|valid editable page field/);
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
 await page.evaluate(()=>(window as any).collectionSettings.state.pending=true);
 await page.getByRole('button',{name:'Apply page fields'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).collectionSettings.state.calls)).toBe(1);
 const date=page.getByLabel('Date',{exact:true});await date.fill('newer typing');
 await page.evaluate(()=>(window as any).collectionSettings.state.resolve());
 await expect(page.getByRole('status')).toContainText('Newer input was kept');
 await expect(date).toHaveValue('newer typing');await expect(date).toBeFocused();
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
