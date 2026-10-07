import {expect,test,type Page} from '@playwright/test';
import { storedDraft } from './drafts';
test.beforeEach(async({page,baseURL})=>{await page.goto(new URL('/tests/slot-ghosts/fixture.html',baseURL!).href);});
async function harness(page:any) {
 await page.evaluate(async()=>{
  const componentPath='/src/page-builder/components.ts',structurePath='/src/components/page-structure.ts';
  const {createComponentTools}=await import(componentPath),{createPageStructure}=await import(structurePath);
  document.body.replaceChildren();const host=document.createElement('aside');host.style.cssText='width:320px;height:700px';document.body.append(host);
  const state:any=(window as any).slotHarness={source:'<project-card id="card" class="caf&eacute; cards" title="A &amp; B" data-note="old"><span slot="title">Original</span><img slot="image" src="/old.png" alt="Old"><a slot="cta" href="/before">Go</a><div slot="unknown">Keep unknown</div></project-card>',template:'<article><h2><slot name="title">Title</slot></h2><slot name="image"><img src="/fallback.png" alt="Fallback"></slot><slot name="cta"><a href="/fallback">Fallback link</a></slot><div><slot name="optional"></slot></div></article>',revision:'A',model:1,version:0,closed:0,selected:[],opened:[],notices:[]};
  const templatePath='components/project-card.html';let current='index.html';let sidebar:any;
  const item=(tag:string,node:number[],text='',slot='',children:any[]=[])=>({tag,node,text,slot,heading:'',children});
  // Paint what the page source actually parses to, as the preview would: real nodes in source order.
  const update=()=>{const doc=new DOMParser().parseFromString(state.source,'text/html');const walk=(el:Element,node:number[]):any=>item(el.localName,node,el.textContent??'',el.getAttribute('slot')??'',[...el.children].map((child,index)=>walk(child,[...node,index])));sidebar.update({path:'index.html',items:[...doc.body.children].map((el,index)=>walk(el,[index]))});};
  const editor={isMounted:()=>true,captureHistoryHost:()=>{const model=state.model;return{isCurrent:()=>state.model===model};},prepareHistorySources:()=>{const model=state.model,version=state.version;return{isCurrent:()=>state.model===model&&state.version===version,dispose:()=>{}};},replaceActiveRange:(edit:any)=>{expectSource(edit);state.source=state.source.slice(0,edit.start)+edit.text+state.source.slice(edit.end);state.version++;update();},replaceActiveRanges:(edits:any[])=>{for(const edit of [...edits].sort((a,b)=>b.start-a.start)){expectSource(edit);state.source=state.source.slice(0,edit.start)+edit.text+state.source.slice(edit.end);}state.version++;update();},closeActiveEditGroup:()=>state.closed++};
  function expectSource(edit:any){if(state.source.slice(edit.start,edit.end)!==edit.expected)throw Error('stale range');}
  state.tools=createComponentTools({structureFields:true,site:()=>({components:{'project-card':templatePath},routes:{'/':'index.html'}}),revision:()=>state.revision,sources:()=>({'index.html':state.source,[templatePath]:state.template}),editor:()=>editor,preview:()=>({flushPendingUpdate:()=>state.flushes=(state.flushes??0)+1,selectNode:(target:any)=>state.selected.push(target),selectAfterUpdate:()=>{}}),currentPath:()=>current,selection:()=>({path:'index.html',node:[0],tag:'project-card',text:'',reason:'click',selectors:[]}),openFile:async(path:string)=>{state.opened.push(path);current=path;return true;},announce:(value:string)=>state.notices.push(value),error:(error:any)=>{throw error;},images:()=>["media/suggested.png"],upload:async()=>{state.uploadCalls=(state.uploadCalls??0)+1;return await new Promise(resolve=>state.finishUpload=resolve);},links:()=>[{label:"About",value:"/about/"}],pageLabel:(path:string)=>path,createFiles:async()=>({error:'Unused'}),panelHost:host,addStrip:(element:any)=>host.append(element),codeTitle:document.createElement('div'),previewPage:()=> 'index.html'});
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
 await pencil.click();await expect(page.locator('.page-structure__row.is-editing[data-slot-editor="title"]')).toHaveCount(1);
 const field=page.getByRole('textbox',{name:'Title: Text'});await field.fill('Renamed');await field.press('Enter');
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.source)).toContain('<span slot="title">Renamed</span>');
});
// Hiding a slot leaves its row where the slot was (where Show puts it back),
// not at the end, and its Show eye fades in like every other row action.
test('a hidden slot keeps its place in the tree and its Show eye is in the faded bar',async({page})=>{
 await harness(page);
 await page.evaluate(()=>{const h=(window as any).slotHarness;const optional='<div><slot name="optional"></slot></div>';
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
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.source)).toMatch(/<span slot="optional">Optional<\/span>\s*<span slot="title">/);
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


// Real host timing: source, native preview bridge and the conditional slot all participate.
async function realConditionalSlot(page:Page,baseURL:string|undefined) {
 await page.request.post(`${baseURL}/__demo/external-edit`,{data:{path:'components/media-card/media-card.html',content:'<figure><figcaption><slot name="caption"></slot></figcaption></figure>'}});
 const about=await (await page.request.get(`${baseURL}/__demo/file?path=about%2Findex.html`)).text();
 await page.request.post(`${baseURL}/__demo/external-edit`,{data:{path:'about/index.html',content:about.replace('<section class="prose" data-key="prose">','<media-card><span slot="caption">Instant caption</span></media-card><section class="prose" data-key="prose">')}});
 await page.goto(`${baseURL}/#repo=501&branch=main&file=about%2Findex.html`);
 const preview=page.frameLocator('.native-preview-frame');
 await expect(preview.locator('media-card > [slot="caption"]')).toHaveText('Instant caption');
 const instance=page.getByRole('tree',{name:'Page structure',exact:true}).getByRole('treeitem',{name:'Media card',exact:true});
 await instance.locator('.page-structure__label').click();
 if(await instance.getAttribute('aria-expanded')==='false') await instance.locator('.page-structure__toggle').click();
 const eye=page.locator('#structure').getByRole('button',{name:'Show Caption',exact:true});
 await expect(eye).toHaveAttribute('aria-pressed','true');
 return {preview,eye};
}
// Observe the existing cross-origin postMessage call only during the synchronous
// click handler. Restore the real WindowProxy before any message can return.
async function armEyeSendProbe(eye:import('@playwright/test').Locator) {
 await eye.evaluate(element=>{
  const label=element.getAttribute('aria-label');
  const row=element.closest<HTMLElement>('[role="treeitem"]')!;
  const proof={node:row.dataset.node,slotRow:row.dataset.slotRow,slot:row.dataset.slot};
  const probe:any=(window as any).visibilitySendProbe={posts:[]};
  // Structure can repaint between arming and clicking. Match the live target,
  // then bracket its own handler; unrelated clicks must not consume this probe.
  const capture=(event:MouseEvent)=>{
   const clicked=event.target instanceof Element?event.target.closest('button'):null;
   const currentRow=clicked?.closest<HTMLElement>('[role="treeitem"]');
   if(!clicked||clicked.getAttribute('aria-label')!==label||!document.querySelector('#structure')?.contains(clicked)||!currentRow||currentRow.dataset.node!==proof.node||currentRow.dataset.slotRow!==proof.slotRow||currentRow.dataset.slot!==proof.slot)return;
   document.removeEventListener('click',capture,true);
   const frame=document.querySelector<HTMLIFrameElement>('.native-preview-frame')!,target=frame.contentWindow!;
   probe.start=performance.now();
   Object.defineProperty(frame,'contentWindow',{configurable:true,get:()=>({postMessage:(message:any,origin:string)=>{
    if(message.type==='update')probe.posts.push({at:performance.now(),id:message.id,context:message.payload.context,page:message.payload.pages['/about/']});
    target.postMessage(message,origin);
   }})});
   clicked.addEventListener('click',()=>{probe.end=performance.now();delete (frame as any).contentWindow;},{once:true});
  };
  document.addEventListener('click',capture,true);
 });
}

test('accepted real slot Hide and Show post the new source before the eye handler returns',async({page,baseURL})=>{
 const {preview,eye}=await realConditionalSlot(page,baseURL);
 await eye.locator('xpath=ancestor::*[@role="treeitem"][1]').hover();
 await armEyeSendProbe(eye);await eye.click();
 const hidden=await page.evaluate(()=>(window as any).visibilitySendProbe);
 expect(hidden.posts).toHaveLength(1);
 expect(hidden.posts[0].at).toBeLessThanOrEqual(hidden.end);
 expect(hidden.posts[0].page).not.toContain('slot="caption"');
 await expect(eye).toHaveAttribute('aria-pressed','false');
 await expect(preview.locator('media-card > [slot="caption"]')).toHaveCount(0);
 await expect(preview.locator('media-card figcaption')).toHaveCSS('display','none');
 await eye.locator('xpath=ancestor::*[@role="treeitem"][1]').hover();
 await armEyeSendProbe(eye);await eye.click();
 const shown=await page.evaluate(()=>(window as any).visibilitySendProbe);
 expect(shown.posts).toHaveLength(1);
 expect(shown.posts[0].at).toBeLessThanOrEqual(shown.end);
 expect(shown.posts[0].id).toBeGreaterThan(hidden.posts[0].id);
 expect(shown.posts[0].page).toContain('slot="caption"');
 // Show opens the caption's editor, which hides the row's actions while it edits: its eye is pressed underneath.
 await expect(page.locator('.page-structure__row.is-editing[data-slot-editor="caption"] .page-structure__slot-toggle')).toHaveAttribute('aria-pressed','true');
 await expect(preview.locator('media-card > [slot="caption"]')).toHaveCount(1);
 await expect(preview.locator('media-card figcaption')).not.toHaveCSS('display','none');
 // An ordinary editor change still waits for the existing coalesced RAF.
 const synchronousPosts=await page.evaluate(async()=>{
  const editor=await import('/src/components/code-editor.ts');
  const source=editor.getMountedSource('about/index.html')!;
  const match=/<span slot="caption">([^<]*)<\/span>/.exec(source)!;
  const start=match.index+match[0].indexOf('>')+1;
  const frame=document.querySelector<HTMLIFrameElement>('.native-preview-frame')!,target=frame.contentWindow!;
  let posts=0;
  Object.defineProperty(frame,'contentWindow',{configurable:true,get:()=>({postMessage:(message:any,origin:string)=>{if(message.type==='update')posts++;target.postMessage(message,origin);}})});
  try{editor.replaceActiveRange({path:'about/index.html',start,end:start+match[1].length,text:'Typed caption',expected:match[1]});return posts;}
  finally{delete(frame as any).contentWindow;}
 });
 expect(synchronousPosts).toBe(0);
 await expect(preview.locator('media-card > [slot="caption"]')).toHaveText('Typed caption');
});


test('rapid real slot Hide and Show keep preview, drafts and Undo/Redo on the same source',async({page,baseURL})=>{
 const {preview,eye}=await realConditionalSlot(page,baseURL);
 const source=()=>page.evaluate(async()=>(await import('/src/components/code-editor.ts')).getMountedSource('about/index.html'));
 const before=await source();
 await eye.locator('xpath=ancestor::*[@role="treeitem"][1]').hover();
 await eye.click();
 const hidden=await source();
 expect(hidden).not.toContain('slot="caption"');
 await eye.locator('xpath=ancestor::*[@role="treeitem"][1]').hover();
 await eye.click();
 const shown=await source();
 expect(shown).toContain('slot="caption"');
 // Show opens the caption's editor, which hides the row's actions while it edits: its eye is pressed underneath.
 await expect(page.locator('.page-structure__row.is-editing[data-slot-editor="caption"] .page-structure__slot-toggle')).toHaveAttribute('aria-pressed','true');
 await expect(preview.locator('media-card > [slot="caption"]')).toHaveCount(1);
 expect((await storedDraft(page,'about/index.html'))?.content).toBe(shown);
 await page.evaluate(async()=>{await(await import('/src/components/code-editor.ts')).runVisualHistory('undo','about/index.html');});
 await expect.poll(source).toBe(hidden);
 await expect(preview.locator('media-card > [slot="caption"]')).toHaveCount(0);
 await page.evaluate(async()=>{await(await import('/src/components/code-editor.ts')).runVisualHistory('undo','about/index.html');});
 await expect.poll(source).toBe(before);
 await expect(preview.locator('media-card > [slot="caption"]')).toHaveText('Instant caption');
 await page.evaluate(async()=>{await(await import('/src/components/code-editor.ts')).runVisualHistory('redo','about/index.html');});
 await expect.poll(source).toBe(hidden);
 await page.evaluate(async()=>{await(await import('/src/components/code-editor.ts')).runVisualHistory('redo','about/index.html');});
 await expect.poll(source).toBe(shown);
 await expect(preview.locator('media-card > [slot="caption"]')).toHaveCount(1);
 expect((await storedDraft(page,'about/index.html'))?.content).toBe(shown);
});

test('a stale slot transaction refuses without flushing a preview update',async({page})=>{
 await harness(page);await addOptional(page);
 await page.evaluate(()=>{const h=(window as any).slotHarness;h.flushes=0;h.source+='<!-- changed outside the old slot target -->';});
 const before=await page.evaluate(()=>(window as any).slotHarness.source);
 const eye=row(page,'0.4').getByRole('button',{name:'Show Optional',exact:true});
 await row(page,'0.4').hover();await eye.click();
 await expect(eye).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>(window as any).slotHarness.source)).toBe(before);
 expect(await page.evaluate(()=>(window as any).slotHarness.flushes)).toBe(0);
 expect(await page.evaluate(()=>(window as any).slotHarness.notices)).toContain('The instance changed; reopen its field before editing.');
});
