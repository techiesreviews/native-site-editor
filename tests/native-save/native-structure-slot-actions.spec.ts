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
// Slot rows use the same faded bar as every Structure row, at the row's end:
// it fades in over the badge, which stays exactly where it is, and nothing
// widens the tree.
test('slot actions fade in over the badge, which stays where it is',async({page})=>{
 await harness(page);
 const title=row(page,'0.0');
 await expect(title).toHaveClass(/row-action-host/);
 await expect(title.locator(':scope > .row-action-overlay')).toHaveCount(1);
 const pencil=title.locator('.row-action-overlay').getByRole('button',{name:'Edit Title',exact:true});
 const badge=title.locator('.page-structure__slot-badge');
 await page.mouse.move(0,0);await expect(pencil).toHaveCSS('opacity','0');
 const rest=(await badge.boundingBox())!;
 await title.hover();await expect(pencil).toHaveCSS('opacity','1');await page.waitForTimeout(300);
 const hovered=(await badge.boundingBox())!;
 expect(hovered.x).toBe(rest.x);
 const geo=await title.evaluate((el:HTMLElement)=>{const r=el.getBoundingClientRect(),o=el.querySelector(':scope > .row-action-overlay')!,ob=o.getBoundingClientRect(),kids=[...o.children].map(c=>c.getBoundingClientRect());return{right:r.right,last:kids[kids.length-1].right,barLeft:ob.left,fade:getComputedStyle(o,'::before').opacity,overflow:el.scrollWidth-el.clientWidth,tree:el.closest('[role=tree]')!.scrollWidth-el.closest('[role=tree]')!.clientWidth};});
 // The bar reaches the row's end and covers the badge.
 expect(geo.right-geo.last).toBeLessThanOrEqual(6);
 expect(geo.barLeft).toBeLessThanOrEqual(hovered.x);
 expect(geo.fade).toBe('1');
 expect(geo.overflow).toBeLessThanOrEqual(0);expect(geo.tree).toBeLessThanOrEqual(0);
 await pencil.click();await expect(page.locator('.page-structure__inline[data-slot-editor="title"]')).toHaveCount(1);
 const field=page.getByRole('textbox',{name:'Title: Text'});await field.fill('Renamed');await field.press('Enter');
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.source)).toContain('<span slot="title">Renamed</span>');
});
// Hiding a slot leaves its row where the slot was (where Show puts it back),
// not at the end, and its Show eye fades in like every other row action.
test('a hidden slot keeps its place in the tree and its Show eye is in the faded bar',async({page})=>{
 await harness(page);
 await page.evaluate(()=>{const h=(window as any).slotHarness;const optional='<div data-if="optional"><slot name="optional"><p>Optional</p></slot></div>';
  h.template=h.template.replace(optional,'').replace('<article>','<article>'+optional);h.source=h.source.replace('<span slot="title">','<p slot="optional">Extra</p><span slot="title">');h.version++;h.update();});
 const order=()=>page.locator('[role=treeitem]').evaluateAll((els:HTMLElement[])=>els.map(e=>e.dataset.slotRow?'hidden':e.dataset.slot??'host'));
 expect(await order()).toEqual(['host','optional','title','image','cta','unknown']);
 await row(page,'0.0').hover();await row(page,'0.0').getByRole('button',{name:'Show Optional',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.source)).not.toContain('slot="optional"');
 expect(await order()).toEqual(['host','hidden','title','image','cta','unknown']);
 const hidden=page.locator('.page-structure__row--empty-slot');
 await expect(hidden).toHaveClass(/row-action-host/);
 const eye=hidden.locator(':scope > .row-action-overlay').getByRole('button',{name:'Show Optional',exact:true});
 await page.mouse.move(0,0);await expect(eye).toHaveCSS('opacity','0');
 await hidden.hover();await expect(eye).toHaveCSS('opacity','1');
 await eye.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.source)).toMatch(/<p slot="optional">Optional<\/p>\s*<span slot="title">/);
});
test('slot visibility toggle at the row edge hides the slot and resting rows stay compact',async({page})=>{
 await harness(page);
 await page.evaluate(()=>{const h=(window as any).slotHarness;h.source=h.source.replace('</project-card>','<p slot="optional">Extra</p></project-card>');h.update();});
 const image=row(page,'0.4');const toggle=image.getByRole('button',{name:/^Show /});
 await expect(toggle).toHaveCSS('opacity','0');
 const rest=await image.evaluate((el:HTMLElement)=>el.getBoundingClientRect().height);expect(rest).toBeLessThan(40);
 await image.hover();await expect(toggle).toHaveCSS('opacity','1');await toggle.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.source)).not.toContain('slot="optional"');
});
test('keyboard focus on a slot row reveals its actions at once and Tab reaches them',async({page})=>{
 await harness(page);
 const title=row(page,'0.0');await title.focus();
 const pencil=title.locator('.row-action-overlay').getByRole('button',{name:'Edit Title',exact:true});
 await expect(pencil).toHaveCSS('opacity','1');
 await page.keyboard.press('Tab');await expect(title.locator('.page-structure__slot-badge')).toBeFocused();
 // Edit precedes the trailing visibility/reset control.
 await page.keyboard.press('Tab');await expect(pencil).toBeFocused();
 await page.keyboard.press('Tab');await expect(title.getByRole('button',{name:'Reset Title to default',exact:true})).toBeFocused();
});
test.describe('reduced motion',()=>{test.use({reducedMotion:'reduce'});
 test('the row bar has no transition',async({page})=>{await harness(page);
  await expect(row(page,'0.0').locator('.row-action-overlay > *').first()).toHaveCSS('transition-duration','0s');});});
// Visibility is an eye toggle: open while shown, closed while hidden.
const addOptional=(page:any)=>page.evaluate(()=>{const h=(window as any).slotHarness;h.source=h.source.replace('</project-card>','<p slot="optional">Extra</p></project-card>');h.update();});
test('the visibility eye shows state, hides and shows by keyboard, and leaves no checkbox behind',async({page})=>{
 await harness(page);await addOptional(page);
 await expect(page.locator('.page-structure__tree input[type=checkbox]')).toHaveCount(0);
 // A fallback slot keeps Reset to default and never wears an eye.
 await expect(row(page,'0.0').getByRole('button',{name:'Reset Title to default',exact:true})).toHaveCount(1);
 await expect(row(page,'0.0').locator('.page-structure__slot-toggle')).toHaveCount(0);
 const optional=row(page,'0.4');
 const actions=optional.locator(':scope > .row-action-overlay > button');
 await expect(actions).toHaveCount(2);
 expect(await actions.evaluateAll((buttons:HTMLButtonElement[])=>buttons.map(button=>button.getAttribute('aria-label')))).toEqual(['Edit Optional','Show Optional']);
 await optional.focus();await page.keyboard.press('Tab');await expect(optional.locator('.page-structure__slot-badge')).toBeFocused();
 await page.keyboard.press('Tab');await expect(actions.nth(0)).toBeFocused();
 await page.keyboard.press('Tab');await expect(actions.nth(1)).toBeFocused();
 const pencilBox=(await actions.nth(0).boundingBox())!,eyeBox=(await actions.nth(1).boundingBox())!;
 expect(eyeBox.x).toBeGreaterThanOrEqual(pencilBox.x+pencilBox.width);
 const eye=optional.getByRole('button',{name:'Show Optional',exact:true});
 await expect(eye).toHaveAttribute('aria-pressed','true');await expect(eye).toHaveAttribute('title','Hide Optional');
 await eye.focus();await page.keyboard.press('Enter');
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.source)).not.toContain('slot="optional"');
 const closed=page.locator('.page-structure__row--empty-slot').getByRole('button',{name:'Show Optional',exact:true});
 await expect(closed).toHaveAttribute('aria-pressed','false');await expect(closed).toHaveAttribute('title','Show Optional');await expect(closed).toBeVisible();
 await closed.focus();await page.keyboard.press('Space');
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.source)).toContain('slot="optional"');
 await expect(page.getByRole('textbox',{name:'Optional: Text',exact:true})).toBeFocused();
});
test('a refused Show restores the closed eye and arms no editor',async({page})=>{
 await harness(page);
 await page.evaluate(()=>{const s=(window as any).slotHarness,real=s.tools.structure.bind(s.tools);s.tools.structure=(path:string,node:number[])=>{const model=real(path,node);if(!model)return model;const copy=Object.create(model);copy.setVisible=()=>false;return copy;};s.update();});
 const before=await page.evaluate(()=>(window as any).slotHarness.source);
 const closed=page.locator('.page-structure__row--empty-slot').getByRole('button',{name:'Show Optional',exact:true});
 await page.locator('.page-structure__row--empty-slot').hover();await closed.click();
 await expect(closed).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('.page-structure__inline')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).slotHarness.source)).toBe(before);
 await page.evaluate(()=>(window as any).slotHarness.update());await expect(page.locator('.page-structure__inline')).toHaveCount(0);
});
// Touch: the bar takes its own room in the label (no hover to reveal it). A
// slot row as full as an instance that fills a slot (five buttons) keeps
// every button reachable, none clipped, in a narrow sidebar.
test.describe('touch',()=>{test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:800}});
 test('a full slot-row bar keeps every action reachable in a narrow sidebar',async({page})=>{
  await harness(page);
  await page.evaluate(()=>{document.querySelector('aside')!.style.width='240px';});
  const title=row(page,'0.0');
  // As many buttons as an instance filling a slot carries: Attributes, Edit, Disconnect, pencil, Reset.
  await title.evaluate((el:HTMLElement)=>{const bar=el.querySelector('.row-action-overlay')!;const first=bar.querySelector('button')!;for(const name of ['Attributes','Edit component','Disconnect this instance']){const b=first.cloneNode(true) as HTMLElement;b.setAttribute('aria-label',name);bar.prepend(b);}});
  expect(await title.locator('.row-action-overlay button').count()).toBe(5);
  const clipped=await title.evaluate((el:HTMLElement)=>[...el.querySelectorAll<HTMLElement>('.row-action-overlay button')].filter(b=>{const r=b.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !(hit&&b.contains(hit));}).map(b=>b.getAttribute('aria-label')));
  expect(clipped).toEqual([]);
  const badge=(await title.locator('.page-structure__slot-badge').boundingBox())!,rowBox=(await title.boundingBox())!;
  expect(badge.x+badge.width).toBeLessThanOrEqual(rowBox.x+rowBox.width+1);
  // On touch the bar takes its own room: no button sits on the badge.
  const overlapping=await title.evaluate((el:HTMLElement)=>{const b=el.querySelector('.page-structure__slot-badge')!.getBoundingClientRect();return [...el.querySelectorAll<HTMLElement>('.row-action-overlay button')].filter(x=>{const r=x.getBoundingClientRect();return r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top;}).length;});
  expect(overlapping).toBe(0);
 });
});
