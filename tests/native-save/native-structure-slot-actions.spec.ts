import {expect,test} from '@playwright/test';
test.beforeEach(async({page,baseURL})=>{await page.goto(new URL('/tests/slot-ghosts/fixture.html',baseURL!).href);});
async function harness(page:any) {
 await page.evaluate(async()=>{
  const componentPath='/src/page-builder/components.ts',structurePath='/src/components/page-structure.ts';
  const {createComponentTools}=await import(componentPath),{createPageStructure}=await import(structurePath);
  document.body.replaceChildren();const host=document.createElement('aside');host.style.cssText='width:320px;height:700px';document.body.append(host);
  const state:any=(window as any).slotHarness={source:'<project-card id="card" class="caf&eacute; cards" title="A &amp; B" data-note="old"><span slot="title">Original</span><img slot="image" src="/old.png" alt="Old"><a slot="cta" href="/before">Go</a><div slot="unknown">Keep unknown</div></project-card>',template:'<article><h2><slot name="title">Title</slot></h2><slot name="image"><img src="/fallback.png" alt="Fallback"></slot><slot name="cta"><a href="/fallback">Fallback link</a></slot><div data-if="optional"><slot name="optional"><p>Optional</p></slot></div></article>',revision:'A',model:1,version:0,closed:0,selected:[],opened:[],notices:[]};
  const templatePath='components/project-card.html';let current='index.html';let sidebar:any;
  const item=(tag:string,node:number[],text='',slot='',children:any[]=[])=>({tag,node,text,slot,heading:'',children});
  // Paint what the page source actually parses to, as the preview would: real nodes in source order.
  const update=()=>{const doc=new DOMParser().parseFromString(state.source,'text/html');const walk=(el:Element,node:number[]):any=>item(el.localName,node,el.textContent??'',el.getAttribute('slot')??'',[...el.children].map((child,index)=>walk(child,[...node,index])));sidebar.update({path:'index.html',items:[...doc.body.children].map((el,index)=>walk(el,[index]))});};
  const editor={isMounted:()=>true,captureHistoryHost:()=>{const model=state.model;return{isCurrent:()=>state.model===model};},prepareHistorySources:()=>{const model=state.model,version=state.version;return{isCurrent:()=>state.model===model&&state.version===version,dispose:()=>{}};},replaceActiveRange:(edit:any)=>{expectSource(edit);state.source=state.source.slice(0,edit.start)+edit.text+state.source.slice(edit.end);state.version++;update();},replaceActiveRanges:(edits:any[])=>{for(const edit of [...edits].sort((a,b)=>b.start-a.start)){expectSource(edit);state.source=state.source.slice(0,edit.start)+edit.text+state.source.slice(edit.end);}state.version++;update();},closeActiveEditGroup:()=>state.closed++};
  function expectSource(edit:any){if(state.source.slice(edit.start,edit.end)!==edit.expected)throw Error('stale range');}
  state.tools=createComponentTools({structureFields:true,site:()=>({components:{'project-card':templatePath},routes:{'/':'index.html'}}),revision:()=>state.revision,sources:()=>({'index.html':state.source,[templatePath]:state.template}),editor:()=>editor,preview:()=>({selectNode:(target:any)=>state.selected.push(target),selectAfterUpdate:()=>{}}),currentPath:()=>current,selection:()=>({path:'index.html',node:[0],tag:'project-card',text:'',reason:'click',selectors:[]}),openFile:async(path:string)=>{state.opened.push(path);current=path;return true;},announce:(value:string)=>state.notices.push(value),error:(error:any)=>{throw error;},images:()=>["media/suggested.png"],upload:async()=>{state.uploadCalls=(state.uploadCalls??0)+1;return await new Promise(resolve=>state.finishUpload=resolve);},links:()=>[{label:"About",value:"/about/"}],pageLabel:(path:string)=>path,createFiles:async()=>({error:'Unused'}),panelHost:host,addStrip:(element:any)=>host.append(element),codeTitle:document.createElement('div'),previewPage:()=> 'index.html'});
  sidebar=createPageStructure(host,{announce:(value:string)=>state.notices.push(value),label:(item:any)=>({kind:item.tag==='project-card'?'Project card':item.tag,text:item.text,component:item.tag==='project-card'}),onSelect:(path:string,node:number[])=>state.selected.push({path,node}),componentSlots:(path:string,node:number[])=>state.tools.structure(path,node)});state.sidebar=sidebar;state.update=update;update();
 });
}
// Native Structure baseline: every assigned root is a real treeitem; one inline
// editor opens only on an explicit F2, pencil or badge.
const row=(page:any,node:string)=>page.locator(`[role=treeitem][data-node="${node}"]`);
// Slot row actions sit at the row's far right, after the badge, never over it.
test('slot actions reveal at the far right after the badge without overflow',async({page})=>{
 await harness(page);
 const title=row(page,'0.0');
 await expect(title).toHaveClass(/page-structure__row--slot-host/);
 const badge=title.locator('.page-structure__slot-badge'),pencil=title.getByRole('button',{name:'Edit Title',exact:true}).last();
 const before=(await badge.boundingBox())!;
 await title.hover();await expect(pencil).toHaveCSS('opacity','1');await page.waitForTimeout(300);
 const geo=await title.evaluate((el:HTMLElement)=>{const r=el.getBoundingClientRect(),o=el.querySelector('.page-structure__slot-actions')!,b=el.querySelector('.page-structure__slot-badge')!.getBoundingClientRect(),kids=[...o.children].map(c=>c.getBoundingClientRect());return{right:r.right,last:kids[kids.length-1].right,first:kids[0].left,badge:b.right,overflow:el.scrollWidth-el.clientWidth,tree:el.closest('[role=tree]')!.scrollWidth-el.closest('[role=tree]')!.clientWidth};});
 expect(geo.right-geo.last).toBeLessThanOrEqual(6);
 expect(geo.badge).toBeLessThanOrEqual(geo.first);
 expect(geo.overflow).toBeLessThanOrEqual(0);expect(geo.tree).toBeLessThanOrEqual(0);
 // The badge steps aside but stays clickable; one click opens its inline field.
 const moved=(await badge.boundingBox())!;expect(moved.x).toBeLessThan(before.x);
 await badge.click();await expect(page.locator('.page-structure__inline[data-slot-editor="title"]')).toHaveCount(1);
 await page.keyboard.press('Escape');await expect(page.locator('.page-structure__inline')).toHaveCount(0);
 // Hand off from badge to pencil keeps the actions shown, and the pencil edits.
 await badge.hover();await pencil.hover();await expect(pencil).toHaveCSS('opacity','1');
 await pencil.click();await expect(page.locator('.page-structure__inline[data-slot-editor="title"]')).toHaveCount(1);
 const field=page.getByRole('textbox',{name:'Title: Text'});await field.fill('Renamed');await field.press('Enter');
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.source)).toContain('<span slot="title">Renamed</span>');
});
test('slot visibility toggle at the row edge hides the slot and resting rows stay compact',async({page})=>{
 await harness(page);
 await page.evaluate(()=>{const h=(window as any).slotHarness;h.source=h.source.replace('</project-card>','<p slot="optional">Extra</p></project-card>');h.update();});
 const image=row(page,'0.4');const toggle=image.getByRole('checkbox',{name:/^Show /});
 await expect(toggle).toHaveCSS('opacity','0');
 const rest=await image.evaluate((el:HTMLElement)=>el.getBoundingClientRect().height);expect(rest).toBeLessThan(40);
 await image.hover();await expect(toggle).toHaveCSS('opacity','1');await toggle.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.source)).not.toContain('slot="optional"');
});
test('keyboard focus on a slot row reveals its actions at once and Tab reaches them',async({page})=>{
 await harness(page);
 const title=row(page,'0.0');await title.focus();
 const pencil=title.getByRole('button',{name:'Edit Title',exact:true}).last();
 await expect(pencil).toHaveCSS('opacity','1');
 await page.keyboard.press('Tab');await expect(title.locator('.page-structure__slot-badge')).toBeFocused();
 await page.keyboard.press('Tab');await expect(pencil).toBeFocused();
});
test.describe('reduced motion',()=>{test.use({reducedMotion:'reduce'});
 test('badge shift has no transition',async({page})=>{await harness(page);
  await expect(row(page,'0.0').locator('.page-structure__slot-badge')).toHaveCSS('transition-duration','0s');});});
