import {expect,test} from '@playwright/test';
// Compact Structure: every authored row stays a native treeitem; slot fields open only on an explicit pencil, F2 or badge.
// A slot's open editor: the row edited in place (text, a link's label) and,
// for a link or an image, the card attached under it.
const EDITING_ROW='.page-structure__row.is-editing';
const OPEN_EDITOR='.page-structure__inline, .page-structure__row.is-editing';
test.beforeEach(async({page,baseURL})=>{await page.goto(new URL('/tests/slot-ghosts/fixture.html',baseURL!).href);});
async function harness(page:any) {
 await page.evaluate(async()=>{
  const componentPath='/src/page-builder/components.ts',structurePath='/src/components/page-structure.ts';
  const {createComponentTools}=await import(componentPath),{createPageStructure}=await import(structurePath);
  document.body.replaceChildren();const host=document.createElement('aside');host.style.cssText=`box-sizing:border-box;width:${(window as any).hostWidth??320}px;height:700px`;document.body.append(host);
  // The real nesting: the sidebar (.sidebar) holds the Structure host (.page-structure).
  host.className='sidebar';const structureHost=document.createElement('div');structureHost.id='structure';structureHost.className='page-structure';host.append(structureHost);
  const state:any=(window as any).slotHarness={source:'<project-card id="card" class="caf&eacute; cards" title="A &amp; B" data-note="old"><span slot="title">Original</span><div slot="body" id="rich"><button><span>Act</span></button><p>Paragraph</p></div><img slot="image" src="/old.png" alt="Old"><a slot="cta" href="/before">Go</a><div slot="unknown">Keep unknown</div></project-card>',template:'<article><slot name=body></slot><h2><slot name="title">Title</slot></h2><slot name="image"><img src="/fallback.png" alt="Fallback"></slot><slot name="cta"><a href="/fallback">Fallback link</a></slot><div><slot name="optional"></slot></div></article>',revision:'A',model:1,version:0,closed:0,movesTo:[],moves:[],selected:[],opened:[],notices:[]};
  const templatePath='components/project-card.html';let current='index.html';let sidebar:any;
  const item=(tag:string,node:number[],text='',slot='',children:any[]=[])=>({tag,node,text,slot,heading:'',children});
  const update=()=>{
   const doc=new DOMParser().parseFromString(state.source,'text/html');
   const walk=(el:Element,node:number[]):any=>item(el.localName,node,el.textContent??'',el.getAttribute('slot')??'',[...el.children].map((child,index)=>walk(child,[...node,index])));
   state.items=[...doc.body.children].map((el,index)=>walk(el,[index]));
   if(state.hold){state.held=(state.held??0)+1;return;}sidebar.update({path:'index.html',items:state.items,paintedSource:state.source});
  };
  const editor={isMounted:()=>true,captureHistoryHost:()=>{const model=state.model;return{isCurrent:()=>state.model===model};},prepareHistorySources:()=>{const model=state.model,version=state.version;return{isCurrent:()=>state.model===model&&state.version===version,dispose:()=>{}};},replaceActiveRange:(edit:any)=>{expectSource(edit);state.source=state.source.slice(0,edit.start)+edit.text+state.source.slice(edit.end);state.version++;update();},replaceActiveRanges:(edits:any[])=>{for(const edit of [...edits].sort((a,b)=>b.start-a.start)){expectSource(edit);state.source=state.source.slice(0,edit.start)+edit.text+state.source.slice(edit.end);}state.version++;update();},closeActiveEditGroup:()=>state.closed++};
  function expectSource(edit:any){if(state.source.slice(edit.start,edit.end)!==edit.expected)throw Error('stale range');}
  state.tools=createComponentTools({structureFields:true,site:()=>({components:{'project-card':templatePath},routes:{'/':'index.html'}}),revision:()=>state.revision,sources:()=>({'index.html':state.source,[templatePath]:state.template}),editor:()=>editor,preview:()=>({selectNode:(target:any)=>state.selected.push(target),selectAfterUpdate:()=>{},...(state.patcher??{})}),currentPath:()=>current,selection:()=>({path:'index.html',node:[0],tag:'project-card',text:'',reason:'click',selectors:[]}),openFile:async(path:string)=>{state.opened.push(path);current=path;return true;},announce:(value:string)=>state.notices.push(value),error:(error:any)=>{throw error;},images:()=>["media/suggested.png"],upload:async()=>{state.uploadCalls=(state.uploadCalls??0)+1;return await new Promise(resolve=>state.finishUpload=resolve);},links:()=>[{label:"About",value:"/about/"}],pageLabel:(path:string)=>path,createFiles:async()=>({error:'Unused'}),panelHost:host,addStrip:(element:any)=>host.append(element),codeTitle:document.createElement('div'),previewPage:()=> 'index.html'});
  sidebar=createPageStructure(structureHost,{pageSource:()=>state.source,announce:(value:string)=>state.notices.push(value),label:(item:any)=>({kind:item.tag==='project-card'?'Project card':item.tag,text:item.text,component:item.tag==='project-card'}),onSelect:(path:string,node:number[])=>state.selected.push({path,node}),onRowDrag:(_press:any,item:any)=>{state.movesTo.push({node:item.node,tag:item.tag});return undefined;},onMove:(path:string,item:any,direction:string)=>{state.moves.push({path,node:item.node,direction,tag:item.tag,same:item===state.items[0].children[1].children[1]});return "stayed";},componentSlots:(path:string,node:number[])=>state.tools.structure(path,node)});state.sidebar=sidebar;state.update=update;state.itemsOf=(source:string)=>{const doc=new DOMParser().parseFromString(source,'text/html');const walk=(el:Element,node:number[]):any=>item(el.localName,node,el.textContent??'',el.getAttribute('slot')??'',[...el.children].map((child,index)=>walk(child,[...node,index])));return [...doc.body.children].map((el,index)=>walk(el,[index]));};update();
 });
}

// The app's real sidebar box: 20px padding each side leaves the content width;
// .page-structure's -10px side margins widen the tree by 20px; the tree's 4px
// side padding sets the row width.
const sidebarGeometry=(page:any)=>page.evaluate(()=>{const box=(s:string)=>Math.round(document.querySelector(s)!.getBoundingClientRect().width);const side=document.querySelector('.sidebar')!,cs=getComputedStyle(side);
 return{sidebar:box('.sidebar'),content:side.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),tree:box('.page-structure__tree'),row:box('[role=treeitem][data-node="0"]')};});

const H=(page:any)=>page.evaluate(()=>(window as any).slotHarness);
const rows=(page:any)=>page.locator('[role=treeitem][data-node]').evaluateAll((list:Element[])=>list.map(row=>row.getAttribute('data-node')));
const visibleInputs=(page:any)=>page.locator('.page-structure__tree :is(input:not([type=file]):not([type=checkbox]), textarea)').evaluateAll((list:HTMLElement[])=>list.filter(input=>input.getClientRects().length).length);

test('every authored row stays a native treeitem in source order with no fields until asked',async({page})=>{
 await harness(page);
 expect(await rows(page)).toEqual(['0','0.0','0.1','0.1.0','0.1.0.0','0.1.1','0.2','0.3','0.4']);
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
 expect(await visibleInputs(page)).toBe(0);
 await expect(page.locator('[role=treeitem][data-node="0.0"] .page-structure__slot-badge')).toHaveText('Title');
 await expect(page.locator('[role=treeitem][data-node="0.1.0"] .page-structure__slot-badge')).toHaveCount(0);
 await expect(page.locator('[role=treeitem][data-node="0.4"]')).toHaveAttribute('data-slot','unknown');
 await expect(page.locator('[role=treeitem][data-node="0.4"] .page-structure__slot-badge')).toHaveCount(0);
 const missing=page.locator('.page-structure__row--empty-slot');await expect(missing).toHaveCount(1);await expect(missing).not.toHaveAttribute('data-node');await expect(missing).toHaveAttribute('role','treeitem');await expect(missing.getByRole('button',{name:'Show Optional',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Edit Title',exact:true})).toHaveCount(2);
 await page.locator('[role=treeitem][data-node="0.0"]').click();
 expect((await H(page)).selected.at(-1)).toEqual({path:'index.html',node:[0,0]});
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
 await page.locator('[role=treeitem][data-node="0.1.1"]').click();await page.locator('[role=treeitem][data-node="0.1.1"]').press('Alt+ArrowUp');
 expect((await H(page)).moves).toEqual([{path:'index.html',node:[0,1,1],direction:'up',tag:'p',same:true}]);
});

test('row pencil opens one inline editor that keeps caret, refuses foreign changes and closes to its row',async({page})=>{
 await harness(page);const title=page.locator('[role=treeitem][data-node="0.0"]');
 await title.hover();await title.locator('.page-structure__action[aria-label="Edit Title"]').click();
 // A text slot is edited in its own row: no card under it.
 await expect(page.locator('.page-structure__row.is-editing')).toHaveCount(1);await expect(page.locator('.page-structure__inline')).toHaveCount(0);
 const text=page.getByRole('textbox',{name:'Title: Text',exact:true});await expect(text).toBeFocused();
 await expect(title.locator('.page-structure__edit-field')).toHaveCount(1);
 await text.fill('First');await text.press('End');await text.press('!');
 await expect(text).toBeFocused();await expect(text).toHaveValue('First!');expect(await text.evaluate((el:HTMLInputElement)=>el.selectionStart)).toBe(6);
 expect((await H(page)).closed).toBe(0);
 await page.evaluate(()=>{(window as any).slotHarness.source+='<!-- external -->';});await text.press('!');
 await expect(text).toHaveAttribute('aria-invalid','true');const after=(await H(page)).source;expect(after).toContain('First!');expect(after).not.toContain('First!!');
 await text.press('Escape');await expect(page.locator('.page-structure__row.is-editing')).toHaveCount(0);await expect(title).toBeFocused();
 await title.press('F2');await expect(page.getByRole('textbox',{name:'Title: Text',exact:true})).toBeFocused();await expect(page.locator('.page-structure__row.is-editing')).toHaveCount(1);
 await page.locator('[role=treeitem][data-node="0.3"]').press('F2');
 await expect(page.locator(EDITING_ROW)).toHaveCount(1);
 const button=page.getByRole('textbox',{name:'Cta: Button text',exact:true});await expect(button).toBeFocused();
 await expect(page.getByRole('group',{name:'Link',exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Cta: Link / URL',exact:true})).toBeVisible();
});

test('the slot badge of a later assigned root selects the first actual root',async({page})=>{
 await harness(page);await page.evaluate(()=>{const s=(window as any).slotHarness;s.source='<project-card><a slot="cta" href="/a">A</a><p>Between</p><a slot="cta" href="/b">B</a></project-card>';s.version++;s.update();});
 expect(await rows(page)).toEqual(['0','0.0','0.1','0.2']);
 await page.locator('[role=treeitem][data-node="0.2"] .page-structure__slot-badge').press('Enter');
 expect((await H(page)).selected.at(-1)).toEqual({path:'index.html',node:[0,0]});
 await expect(page.locator('[role=treeitem][data-node="0.0"]')).toHaveAttribute('aria-selected','true');
 await expect(page.locator('[role=treeitem][data-node="0.0"]')).toBeFocused();
 // Several roots are content: no empty editor opens, and their rows stay real.
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
 expect((await H(page)).movesTo).toEqual([]);
});

test('a missing optional slot restores from its dim row and focuses its new field',async({page})=>{
 await harness(page);const show=page.getByRole('button',{name:'Show Optional',exact:true});await expect(show).toHaveAttribute('aria-pressed','false');
 await page.locator('.page-structure__row--empty-slot').hover();await show.click();
 const field=page.getByRole('textbox',{name:'Optional: Text',exact:true});await expect(field).toBeFocused();
 expect((await H(page)).source).toContain('slot="optional"');
 await expect(page.locator('.page-structure__row--empty-slot')).toHaveCount(0);
 await expect(page.locator(EDITING_ROW)).toHaveCount(1);
 const anchor=await page.locator(EDITING_ROW).getAttribute('data-edit-node');
 await expect(page.locator(`[role=treeitem][data-node="${anchor}"] .page-structure__slot-badge`)).toHaveText('Optional');
 await field.press('Escape');await expect(page.locator(`[role=treeitem][data-node="${anchor}"]`)).toBeFocused();
 const hide=page.getByRole('button',{name:'Show Optional',exact:true});await hide.focus();await page.keyboard.press('Space');expect((await H(page)).source).not.toContain('slot="optional"');
});

test('deep canvas selection reveals once without fields or focus theft, and a later render keeps a manual fold',async({page})=>{
 await harness(page);const root=page.locator('[role=treeitem][data-node="0"]');await root.focus();await root.press('ArrowLeft');
 const deep=page.locator('[role=treeitem][data-node="0.1.0.0"]');await expect(deep).toBeHidden();
 await page.evaluate(()=>{const input=document.createElement('input');input.id='canvas-caret';document.body.append(input);input.focus();(window as any).slotHarness.sidebar.select({path:'index.html',node:[0,1,0,0]});});
 await expect(deep).toBeVisible();await expect(deep).toHaveAttribute('aria-selected','true');await expect(page.locator('#canvas-caret')).toBeFocused();
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);await expect(page.locator('[role=treeitem][tabindex="0"]')).toHaveCount(1);
 await page.evaluate(()=>(window as any).slotHarness.sidebar.select({path:'index.html',node:[0,0]}));
 await expect(page.locator('[role=treeitem][data-node="0.0"]')).toHaveAttribute('aria-selected','true');await expect(page.locator('#canvas-caret')).toBeFocused();
 await root.locator('.page-structure__toggle').click();await expect(root).toHaveAttribute('aria-expanded','false');
 await page.evaluate(()=>{document.getElementById('canvas-caret')!.focus();const s=(window as any).slotHarness;s.source=s.source.replace('Paragraph','Agent');s.version++;s.update();});
 await expect(root).toHaveAttribute('aria-expanded','false');await expect(page.locator('[role=treeitem][data-node="0.0"]')).toBeHidden();await expect(page.locator('#canvas-caret')).toBeFocused();
});

test('row controls never start a drag or choose the row',async({page})=>{
 await harness(page);await page.evaluate(()=>{const s=(window as any).slotHarness;s.source='<project-card><section slot="body">A</section><section slot="body">B</section></project-card>';s.version++;s.update();});
 const before=(await H(page)).selected.length;
 // Hovered first, as a pointer reaches a badge: it has stepped aside for the row's actions.
 await page.locator('[role=treeitem][data-node="0.1"]').hover();await page.waitForTimeout(300);
 const badge=page.locator('[role=treeitem][data-node="0.1"] .page-structure__slot-badge'),box=(await badge.boundingBox())!;
 await page.mouse.move(box.x+4,box.y+4);await page.mouse.down();await page.mouse.move(box.x+4,box.y-30);await expect(page.locator('.page-structure__tree')).not.toHaveClass(/is-dragging/);await page.mouse.up();
 expect((await H(page)).movesTo).toEqual([]);
 const after=(await H(page)).selected;expect(after.length).toBeLessThanOrEqual(before+1);
});

test('a press drags the rows of blocks in main, whole instances included, never the parts inside an instance',async({page})=>{
 await harness(page);await page.evaluate(()=>{const s=(window as any).slotHarness;s.source='<main><section>A</section><project-card><section slot="body">B</section></project-card></main><footer><p>F</p></footer>';s.version++;s.update();});
 const press=async(node:string)=>{const box=(await page.locator(`[role=treeitem][data-node="${node}"]`).boundingBox())!;await page.mouse.move(box.x+70,box.y+box.height/2);await page.mouse.down();await page.mouse.up();};
 await page.locator('[role=treeitem][data-node="0.1"] .page-structure__toggle').click();
 for(const node of ['0','0.0','0.1','0.1.0','1','1.0'])await press(node);
 expect((await H(page)).movesTo).toEqual([{node:[0,0],tag:'section'},{node:[0,1],tag:'project-card'}]);
});

test('upload stale refusal is announced only after its asynchronous completion',async({page})=>{
 await harness(page);await page.evaluate(()=>{const s=(window as any).slotHarness;s.pendingUpload=s.tools.structure('index.html',[0]).openImageUpload('image').upload([new File(['image'],'image.png')]);});await page.waitForFunction(()=>{const s=(window as any).slotHarness;return s.uploadCalls===1&&typeof s.finishUpload==='function';});const before=await page.evaluate(()=>{const s=(window as any).slotHarness;s.source='<p>Replacement</p>';return [...s.notices];});expect(before).not.toContain('The instance changed while the image uploaded; it was not replaced.');const result=await page.evaluate(async()=>{const s=(window as any).slotHarness;s.finishUpload('/wrong.png');return{accepted:await s.pendingUpload,source:s.source,notices:s.notices};});expect(result.accepted).toBe(false);expect(result.source).toBe('<p>Replacement</p>');expect(result.notices).toContain('The instance changed while the image uploaded; it was not replaced.');
});

test('image editor keeps suggestions, upload and alt text inline',async({page})=>{
 await harness(page);await page.locator('[role=treeitem][data-node="0.2"]').press('F2');
 const src=page.getByRole('combobox',{name:'Image: Image',exact:true});await expect(src).toBeFocused();
 await expect(page.getByRole('button',{name:'Upload image…',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Image: Alt text',exact:true}).fill('New & exact');await page.keyboard.press('Tab');
 expect((await H(page)).source).toContain('alt="New &amp; exact"');
});

test('Attributes opens inline on request and keeps edit, add and remove',async({page})=>{
 await harness(page);const root=page.locator('[role=treeitem][data-node="0"]');await root.hover();
 await root.getByRole('button',{name:'Attributes',exact:true}).click();
 const title=page.getByRole('textbox',{name:'Attribute: id',exact:true});await expect(title).toBeFocused();
 await expect(page.getByRole('textbox',{name:'Attribute: class',exact:true})).toHaveValue('café cards');
 const t=page.getByRole('textbox',{name:'Attribute: title',exact:true});await t.fill('O"Neil & <tag>');await t.press('End');await t.press('!');await expect(t).toBeFocused();await t.press('Tab');
 await page.getByRole('button',{name:'Remove data-note',exact:true}).click();
 await page.getByRole('textbox',{name:'New attribute name',exact:true}).fill('data-mode');await page.getByRole('textbox',{name:'New attribute value',exact:true}).fill('wide & safe');await page.getByRole('button',{name:'Add attribute',exact:true}).click();
 const result=await page.evaluate(()=>{const element=new DOMParser().parseFromString((window as any).slotHarness.source,'text/html').querySelector('project-card')!;return{title:element.getAttribute('title'),mode:element.getAttribute('data-mode'),note:element.hasAttribute('data-note')};});
 expect(result).toEqual({title:'O"Neil & <tag>!',mode:'wide & safe',note:false});
 await page.getByRole('textbox',{name:'New attribute name',exact:true}).press('Escape');await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);await expect(root).toBeFocused();
});

test('root Edit opens the shared template and Disconnect stays separate',async({page})=>{
 await harness(page);const root=page.locator('[role=treeitem][data-node="0"]');const edit=root.getByRole('button',{name:'Edit component',exact:true});
 await edit.focus();await expect(edit.locator('..')).toHaveCSS('opacity','1');await page.keyboard.press('Enter');
 await expect.poll(async()=>(await H(page)).opened).toEqual(['components/project-card.html']);
 await expect(root.getByRole('button',{name:'Disconnect this instance',exact:true})).toHaveAttribute('title','Disconnect this instance');
});

test('280px Structure with an open editor stays within its sidebar',async({page})=>{
 await page.setViewportSize({width:1000,height:760});await page.evaluate(async()=>{await import('/src/theme.css');await import('/src/style.css');(window as any).hostWidth=280;});await harness(page);
 expect(await sidebarGeometry(page)).toEqual({sidebar:280,content:240,tree:260,row:252});
 await page.locator('[role=treeitem][data-node="0.3"]').press('F2');
 const d=await page.locator('aside').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));expect(d.scroll).toBeLessThanOrEqual(d.width);
 const rowBox=(await page.locator('[role=treeitem][data-node="0.3"]').boundingBox())!;expect(rowBox.width).toBeLessThanOrEqual(280);
});

const toggleBy=async(page:any,name:string)=>{const box=page.getByRole('button',{name,exact:true});await box.focus();await page.keyboard.press('Space');};

test('a text-only default fill is an editable slot row, not a missing slot',async({page})=>{
 await harness(page);await page.evaluate(()=>{const s=(window as any).slotHarness;s.template='<article><slot>Default</slot></article>';s.source='<project-card>Hello</project-card>';s.version++;s.update();});
 await expect(page.locator('.page-structure__row--empty-slot')).toHaveCount(0);
 const row=page.locator('.page-structure__row--slot-only');await expect(row).toHaveCount(1);await expect(row).toHaveAttribute('role','treeitem');await expect(row).not.toHaveAttribute('data-node');
 await expect(row).toContainText('Hello');
 await row.focus();await row.press('F2');
 const field=page.locator(`${EDITING_ROW} textarea`);await expect(field).toBeFocused();await expect(field).toHaveValue('Hello');
 await field.press('End');await field.press('!');await expect(field).toBeFocused();
 expect((await H(page)).source).toBe('<project-card>Hello!</project-card>');
 await field.press('Enter');await expect(page.locator('.page-structure__row--slot-only')).toBeFocused();
 expect((await H(page)).movesTo).toEqual([]);
});

test('a long text field wraps and grows; pasted line breaks become spaces where no break is allowed, and Enter commits',async({page})=>{
 await harness(page);await page.evaluate(()=>{const s=(window as any).slotHarness;s.template='<article><slot>Default</slot></article>';s.source='<project-card>Hello</project-card>';s.version++;s.update();});
 const row=page.locator('.page-structure__row--slot-only');await row.focus();await row.press('F2');
 const field=page.locator(`${EDITING_ROW} textarea`);await expect(field).toBeFocused();await expect(field).toHaveAttribute('rows','1');
 const one=(await field.boundingBox())!.height;expect(one).toBeLessThanOrEqual(30);
 const long='A long line of text that has to wrap onto several lines in the narrow sidebar field, so that the field grows by more than half its one-line height';
 await field.fill(long);
 await expect.poll(async()=>(await field.boundingBox())!.height).toBeGreaterThan(one*1.5);
 expect(await field.evaluate((el:HTMLTextAreaElement)=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
 await field.press('End');await page.keyboard.insertText(' one\ntwo');await expect(field).toHaveValue(`${long} one two`);
 expect((await H(page)).source).toBe(`<project-card>${long} one two</project-card>`);
 // Text straight in the instance (no element of its own) takes no line break: Shift+Enter does nothing; Enter commits.
 await field.press('Shift+Enter');await expect(field).toBeFocused();await expect(field).toHaveValue(`${long} one two`);await field.press('Enter');await expect(row).toBeFocused();
 expect((await H(page)).source).toBe(`<project-card>${long} one two</project-card>`);
});

test('an optional text-only fill hides, restores and shows again through its real toggle',async({page})=>{
 await harness(page);await page.evaluate(()=>{const s=(window as any).slotHarness;s.template='<article><slot></slot></article>';s.source='<project-card>Hello</project-card>';s.version++;s.update();});
 const model=await page.evaluate(()=>{const slot=(window as any).slotHarness.tools.structure('index.html',[0]).slots[0];return{name:slot.name,whenEmpty:slot.whenEmpty,filled:slot.filled,nodes:slot.assignedNodes.length};});
 expect(model).toEqual({name:model.name,whenEmpty:'hidden',filled:true,nodes:0});
 await expect(page.locator('.page-structure__row--empty-slot')).toHaveCount(0);
 const row=page.locator('.page-structure__row--slot-only');await expect(row).toContainText('Hello');
 const toggle=row.locator('button.page-structure__slot-toggle');await expect(toggle).toHaveCount(1);await expect(toggle).toHaveAttribute('aria-pressed','true');
 const label=await toggle.getAttribute('aria-label');
 await toggle.focus();await page.keyboard.press('Space');
 expect((await H(page)).source).toBe('<project-card></project-card>');
 const missing=page.locator('.page-structure__row--empty-slot');await expect(missing).toHaveCount(1);
 const show=missing.getByRole('button',{name:label!,exact:true});await expect(show).toBeVisible();await expect(show).toHaveAttribute('aria-pressed','false');
 await show.focus();await page.keyboard.press('Space');
 expect((await H(page)).source).toBe('<project-card>Content</project-card>');
 await expect(page.locator(EDITING_ROW)).toHaveCount(1);await expect(page.locator(`${EDITING_ROW} textarea`)).toBeFocused();
 // A manual source swap standing in for Undo/Redo (the real history journal is not used here): the earlier bytes come back without reopening an editor unasked.
 await page.evaluate(()=>{const s=(window as any).slotHarness;s.source='<project-card></project-card>';s.version++;s.update();});
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
 await page.evaluate(()=>{const s=(window as any).slotHarness;s.source='<project-card>Hello</project-card>';s.version++;s.update();});
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);await expect(page.locator('.page-structure__row--slot-only')).toContainText('Hello');
});

for (const ordering of ['stale paint of the old empty page','same path holding another node']) test(`a Show waits through a ${ordering} and settles once on the fresh paint`,async({page})=>{
 await harness(page);
 const old=(await H(page)).source;
 await page.evaluate(()=>{(window as any).slotHarness.hold=true;});
 await toggleBy(page,'Show Optional');
 const fresh=await page.evaluate(()=>{const s=(window as any).slotHarness;return{source:s.source,nodes:s.tools.structure('index.html',[0]).slots.find((slot:any)=>slot.name==='optional').assignedNodes};});
 expect(fresh.source).toContain('slot="optional"');expect(fresh.nodes).toHaveLength(1);
 await page.evaluate(()=>{const input=document.createElement('input');input.id='canvas-caret';document.body.append(input);input.focus();});
 await page.evaluate(([ordering,old,node])=>{const s=(window as any).slotHarness;
  if(ordering.startsWith('stale')) s.sidebar.update({path:'index.html',items:s.itemsOf(old),paintedSource:old});
  else{const items=s.itemsOf(s.source);const at=(node as number[]).reduce((list:any,index:number,depth:number)=>depth?list.children[index]:list[index],items);at.slot='decoy';at.tag='div';s.sidebar.update({path:'index.html',items});}
 },[ordering,old,fresh.nodes[0]] as const);
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);await expect(page.locator('#canvas-caret')).toBeFocused();
 await page.evaluate(()=>{const s=(window as any).slotHarness;s.hold=false;s.update();});
 const inline=page.locator(EDITING_ROW);await expect(inline).toHaveCount(1);await expect(inline).toHaveAttribute('data-edit-node',fresh.nodes[0].join('.'));
 await expect(page.locator(`[role=treeitem][data-node="${fresh.nodes[0].join('.')}"] .page-structure__slot-badge`)).toHaveText('Optional');
 await expect(page.locator('#canvas-caret')).toBeFocused();
 await page.evaluate(()=>{const s=(window as any).slotHarness;s.source+='<!-- later -->';s.version++;s.update();});
 await expect(inline).toHaveCount(1);await expect(page.locator('#canvas-caret')).toBeFocused();
});

test('a refused Show restores the closed state and no later render arms an editor',async({page})=>{
 await harness(page);const before=(await H(page)).source;
 await page.evaluate(()=>{(window as any).slotHarness.revision='B-stale';(window as any).slotHarness.tools.structure=(()=>{const real=(window as any).slotHarness.tools.structure;return (path:string,node:number[])=>{const model=real(path,node);return model&&{...model,setVisible:()=>false};};})();});
 await toggleBy(page,'Show Optional');
 await expect(page.getByRole('button',{name:'Show Optional',exact:true})).toHaveAttribute('aria-pressed','false');
 await page.evaluate(()=>{const s=(window as any).slotHarness;s.revision='A';s.source+='<!-- unrelated -->';s.version++;s.update();});
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
 expect(await visibleInputs(page)).toBe(0);
 expect((await H(page)).source).toBe(before+'<!-- unrelated -->');
});

test('hiding a slot with its editor open forgets the editor so a source swap standing in for Undo does not reopen it',async({page})=>{
 await harness(page);await toggleBy(page,'Show Optional');await expect(page.getByRole('textbox',{name:'Optional: Text',exact:true})).toBeFocused();
 const shown=(await H(page)).source;
 // The row's actions step aside while it edits: its eye is pressed underneath, as a Hide from elsewhere would.
 await page.getByRole('button',{name:'Show Optional',exact:true,includeHidden:true}).evaluate((el:HTMLElement)=>el.click());expect((await H(page)).source).not.toContain('slot="optional"');
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
 await page.evaluate(src=>{const s=(window as any).slotHarness;s.source=src;s.version++;s.update();},shown);
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
});

test('Enter applies a field and returns focus to its row',async({page})=>{
 await harness(page);const title=page.locator('[role=treeitem][data-node="0.0"]');await title.focus();await title.press('F2');
 const field=page.getByRole('textbox',{name:'Title: Text',exact:true});await field.fill('Done');await field.press('Enter');
 await expect(title).toBeFocused();expect((await H(page)).source).toContain('>Done<');
});

test('rich content slots select their native root without an empty editor',async({page})=>{
 await harness(page);const body=page.locator('[role=treeitem][data-node="0.1"]');
 await expect(body.locator('.page-structure__action[aria-label="Edit Body"]')).toHaveCount(0);
 await body.locator('.page-structure__slot-badge').press('Enter');
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
 expect((await H(page)).selected.at(-1)).toEqual({path:'index.html',node:[0,1]});
 await body.focus();await body.press('F2');await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
 expect(await rows(page)).toContain('0.1.0.0');
});

test('a slot named attributes keeps its own field apart from the Attributes panel',async({page})=>{
 await harness(page);await page.evaluate(()=>{const s=(window as any).slotHarness;s.template='<article><slot name="attributes">A</slot></article>';s.source='<project-card data-x="1"><span slot="attributes">Mine</span></project-card>';s.version++;s.update();});
 await page.locator('[role=treeitem][data-node="0.0"]').press('F2');const field=page.locator(`${EDITING_ROW} textarea`);await expect(field).toHaveValue('Mine');
 await field.fill('Ours');await field.press('Escape');
 const root=page.locator('[role=treeitem][data-node="0"]');await root.hover();await root.getByRole('button',{name:'Attributes',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Attribute: data-x',exact:true})).toHaveValue('1');
 expect((await H(page)).source).toBe('<project-card data-x="1"><span slot="attributes">Ours</span></project-card>');
});

// A paint proven current (its bytes equal the page source) that still lacks the
// shown slot's element at its path with the exact slot name gives the request up
// plainly (a refusal note); no later matching paint opens an editor or takes focus.
for (const shape of ['reshaped element','raw whitespace slot name']) test(`a Show on a current paint with a ${shape} drops the request and says so`,async({page})=>{
 await harness(page);
 await page.evaluate(()=>{(window as any).slotHarness.hold=true;});
 await toggleBy(page,'Show Optional');
 const node=await page.evaluate(()=>(window as any).slotHarness.tools.structure('index.html',[0]).slots.find((slot:any)=>slot.name==='optional').assignedNodes[0]);
 await page.evaluate(()=>{const input=document.createElement('input');input.id='canvas-caret';document.body.append(input);input.focus();});
 await page.evaluate(([shape,node])=>{const s=(window as any).slotHarness;const items=s.itemsOf(s.source);
  const at=(node as number[]).reduce((list:any,index:number,depth:number)=>depth?list.children[index]:list[index],items);
  if(shape==='reshaped element'){at.slot='';}else at.slot=' optional ';
  s.sidebar.update({path:'index.html',items,paintedSource:s.source});
 },[shape,node] as const);
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);await expect(page.locator('#canvas-caret')).toBeFocused();
 // A refusal (slice 83) shows its reason on screen and in #status, not through announce.
 await expect(page.locator('.refusal-note')).toHaveText('The optional slot is shown, but its element could not be found in Structure; select it on the page to edit it.');
 await page.evaluate(()=>{const s=(window as any).slotHarness;s.hold=false;s.update();});
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);await expect(page.locator('#canvas-caret')).toBeFocused();
});

// Shared row-action fade: buttons are the overlay's direct children, inert at
// rest, revealed by hover or keyboard focus over the row's own painted background.
for (const colorScheme of ['light','dark'] as const) test(`row actions use the shared fade over the row background (${colorScheme})`,async({page})=>{
 await page.emulateMedia({colorScheme});await page.setViewportSize({width:1000,height:760});await page.evaluate(async()=>{await import('/src/theme.css');await import('/src/style.css');(window as any).hostWidth=280;});
 await harness(page);
 const root=page.locator('[role=treeitem][data-node="0"]'),title=page.locator('[role=treeitem][data-node="0.0"]');
 const state=(row:any)=>row.evaluate((el:HTMLElement)=>{const overlay=el.querySelector('.row-action-overlay')!,host=overlay.parentElement!;
  const probe=document.createElement('i');probe.style.color=getComputedStyle(host).getPropertyValue('--row-action-background');document.body.append(probe);const fade=getComputedStyle(probe).color;probe.remove();
  const paint=(e:Element)=>{let at:Element|null=e;while(at){const bg=getComputedStyle(at).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')return bg;at=at.parentElement;}return 'none';};
  const first=overlay.firstElementChild as HTMLElement;
  return{direct:[...overlay.children].every(child=>child.matches('button,input')),host:host.classList.contains('row-action-host'),fade,row:paint(el),opacity:getComputedStyle(first).opacity,pointer:getComputedStyle(first).pointerEvents};});
 await page.mouse.move(0,0);
 let rest=await state(root);expect(rest).toMatchObject({direct:true,host:true,pointer:'none',opacity:'0'});expect(rest.fade).toBe(rest.row);expect(rest.fade).not.toBe('rgba(0, 0, 0, 0)');
 await root.hover();await expect.poll(async()=>(await state(root)).opacity).toBe('1');
 let shown=await state(root);expect(shown.pointer).toBe('auto');expect(shown.fade).toBe(shown.row);
 await title.hover();await expect.poll(async()=>(await state(title)).opacity).toBe('1');
 shown=await state(title);expect(shown.fade).toBe(shown.row);
 // Keyboard focus reveals at once; a selected row fades into its current colour.
 await page.mouse.move(0,0);await title.click({position:{x:4,y:4}});await title.focus();await expect(title).toHaveAttribute('aria-selected','true');
 await expect.poll(async()=>(await state(title)).opacity).toBe('1');shown=await state(title);expect(shown.fade).toBe(shown.row);
 // A press on the resting fade reaches the row, not a hidden button.
 await page.mouse.move(0,0);await root.evaluate((el:HTMLElement)=>el.blur());
 const box=(await root.locator('.row-action-overlay > button').first().boundingBox())!;
 const hit=await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.closest('button')?.getAttribute('aria-label')??'row',[box.x+box.width/2,box.y+box.height/2]);
 expect(hit).toBe('row');
});

test.describe('reduced motion',()=>{test.use({reducedMotion:'reduce'});
 test('row action fades have no transition',async({page})=>{
  await harness(page);const button=page.locator('[role=treeitem][data-node="0"] .row-action-overlay > button').first();
  expect(await button.evaluate((el:Element)=>[getComputedStyle(el).transitionDuration,getComputedStyle(el.firstElementChild!).transitionDuration,getComputedStyle(el.parentElement!,'::before').transitionDuration])).toEqual(['0s','0s','0s']);
 });
});

test.describe('coarse pointer',()=>{test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:800}});
 test('row actions sit in the row flow with 44px targets',async({page})=>{
  await harness(page);const overlay=page.locator('[role=treeitem][data-node="0"] .row-action-overlay');
  expect(await overlay.evaluate((el:Element)=>getComputedStyle(el).position)).toBe('static');
  const box=(await overlay.locator('button').first().boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(43.9);expect(box.height).toBeGreaterThanOrEqual(43.9);
  expect(await overlay.locator('button').first().evaluate((el:Element)=>getComputedStyle(el).opacity)).toBe('1');
 });
});

// The fade must end in the row's actual composited colour, opaque, over ink.
// A solid-block title runs under the actions; the pixel in the gap between two
// actions must equal the row's own plain pixel, in each theme and row state.
const INK='█'.repeat(60);
// Screenshot pixels: in the gap between the first two actions, and at the row's
// plain left padding. Both are read at the row's vertical centre.
async function samplePixels(page:any,node:string){
 const row=page.locator(`[role=treeitem][data-node="${node}"]`);
 const geo=await row.evaluate((el:HTMLElement)=>{const r=el.getBoundingClientRect(),[a,b]=[...el.querySelector('.row-action-overlay')!.children].map(c=>c.getBoundingClientRect());return{w:r.width,gap:a.right-r.x+(b.left-a.right)/2,plain:4};});
 const png=(await row.screenshot({animations:'disabled'})).toString('base64');
 return page.evaluate(async([png,geo]:any)=>{const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d')!;g.drawImage(img,0,0);const sx=img.width/geo.w,sy=Math.round(img.height/2);
  const at=(x:number)=>[...g.getImageData(Math.round(x*sx),sy,1,1).data].slice(0,3);return{gap:at(geo.gap),plain:at(geo.plain)};},[png,geo]) as Promise<{gap:number[];plain:number[]}>;
}
const distance=(p:{gap:number[];plain:number[]})=>Math.max(...p.gap.map((v,i)=>Math.abs(v-p.plain[i])));
async function gapMatchesRow(page:any,node:string){
 return expect.poll(async()=>{const p=await samplePixels(page,node);return distance(p)<=3?'match':`gap ${p.gap} plain ${p.plain}`;}).toBe('match');
}
for (const colorScheme of ['light','dark'] as const) test(`the fade ends opaque in the row's composited colour over text (${colorScheme})`,async({page})=>{
 await page.emulateMedia({colorScheme});await page.setViewportSize({width:1000,height:760});await page.evaluate(async()=>{await import('/src/theme.css');await import('/src/style.css');(window as any).hostWidth=280;});
 await harness(page);
 expect(await page.locator('aside.sidebar').evaluate((el:HTMLElement)=>{const probe=document.createElement('i');probe.style.color='var(--surface-subtle)';document.body.append(probe);const want=getComputedStyle(probe).color;probe.remove();return getComputedStyle(el).backgroundColor===want;})).toBe(true);
 await page.evaluate(ink=>{const s=(window as any).slotHarness;s.source=s.source.replace('>Original<',`>${ink}<`);s.version++;s.update();},INK);
 const root=page.locator('[role=treeitem][data-node="0"]'),title=page.locator('[role=treeitem][data-node="0.0"]');
 for(const [row,node] of [[root,'0'],[title,'0.0']] as const){
  await row.hover();await gapMatchesRow(page,node);                      // hover
 }
 // Negatives on the hovered instance row (a slot row's actions sit beside its
 // badge, over no text): without the base layer the ink shows through, and a
 // base of the wrong surface ends in the wrong colour.
 for(const [label,rule] of [['no base','display:none'],['wrong base','background:linear-gradient(to right,transparent,var(--panel-surface) 20px)']] as const){
  await page.evaluate(rule=>{const style=document.createElement('style');style.id='negative';style.textContent=`aside.sidebar .page-structure__row .row-action-overlay::after{${rule} !important}`;document.head.append(style);},rule);
  await root.hover();const p=await samplePixels(page,'0');
  expect(distance(p),`${label}: gap ${p.gap} plain ${p.plain}`).toBeGreaterThan(12);
  await page.evaluate(()=>document.getElementById('negative')!.remove());await gapMatchesRow(page,'0');
 }
 // Ink is really under the sample: at rest (actions hidden) the gap shows the row's text.
 await page.mouse.move(0,0);const atRest=await samplePixels(page,'0');
 expect(distance(atRest),`rest: gap ${atRest.gap} plain ${atRest.plain}`).toBeGreaterThan(40);
 await page.mouse.move(0,0);await root.focus();await page.keyboard.press('ArrowDown');await expect(title).toBeFocused();
 await gapMatchesRow(page,'0.0');                                          // keyboard focus
 await page.keyboard.press('ArrowUp');await expect(root).toBeFocused();await gapMatchesRow(page,'0');
 await title.locator('.page-structure__slot-badge').focus();await gapMatchesRow(page,'0.0');                 // badge keyboard focus
 await title.click({position:{x:4,y:4}});await expect(title).toHaveAttribute('aria-selected','true');
 await gapMatchesRow(page,'0.0');                                          // current, hovered
 await page.mouse.move(0,0);await gapMatchesRow(page,'0.0');               // current, focused
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
});

test('keyboard focus on a slot badge reveals the row actions without opening an editor',async({page})=>{
 await harness(page);await page.mouse.move(0,0);
 const title=page.locator('[role=treeitem][data-node="0.0"]'),pencil=title.locator('.page-structure__action[aria-label="Edit Title"]');
 await expect(pencil).toHaveCSS('opacity','0');
 await title.locator('.page-structure__slot-badge').focus();
 await expect(pencil).toHaveCSS('opacity','1');await expect(pencil).toHaveCSS('pointer-events','auto');
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
 const caret=await page.evaluate(()=>{const input=document.createElement('input');input.id='canvas-caret';document.body.append(input);input.focus();return true;});expect(caret).toBe(true);
 await title.hover();await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);await expect(page.locator('#canvas-caret')).toBeFocused();
});

test.describe('coarse pointer visibility eyes',()=>{test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:800}});
 test('filled Hide and missing Show keep a small eye inside a 44px pointer target',async({page})=>{
  await harness(page);
  const measure=(name:string)=>page.getByRole('button',{name,exact:true}).evaluate((box:HTMLElement)=>{const b=box.querySelector('svg')!.getBoundingClientRect(),h=box.getBoundingClientRect();return{box:[b.width,b.height],hit:[h.width,h.height,h.x,h.y]};});
  for(const [name,before,after] of [['Show Optional',false,true],['Show Optional',true,false]] as const){
   const m=await measure(name);expect(m.box[0]).toBeLessThanOrEqual(20.5);expect(m.box[1]).toBeLessThanOrEqual(20.5);expect(m.hit[0]).toBeGreaterThanOrEqual(43.9);expect(m.hit[1]).toBeGreaterThanOrEqual(43.9);
   const box=page.getByRole('button',{name,exact:true});if(before)await expect(box).toHaveAttribute('aria-pressed','true');else await expect(box).toHaveAttribute('aria-pressed','false');
   const selected=(await H(page)).selected.length;
   // Tap the target's corner, outside the visible eye.
   await page.mouse.click(m.hit[2]+3,m.hit[3]+3);
   await expect.poll(async()=>(await H(page)).source.includes('slot="optional"')).toBe(after);
   expect((await H(page)).selected.length).toBe(selected);
   await page.evaluate(()=>(document.activeElement as HTMLElement)?.blur());
  }
 });
});

test('a 280px link editor stacks captions above full-width fields that show the whole URL',async({page})=>{
 await page.setViewportSize({width:1000,height:760});await page.evaluate(async()=>{await import('/src/theme.css');await import('/src/style.css');(window as any).hostWidth=280;});await harness(page);
 expect(await sidebarGeometry(page)).toEqual({sidebar:280,content:240,tree:260,row:252});
 await page.evaluate(()=>{const s=(window as any).slotHarness;s.source=s.source.replace('href="/before"','href="/about/#contact"').replace('>Go<','>Get in touch<');s.version++;s.update();});
 await page.locator('[role=treeitem][data-node="0.3"]').press('F2');
 // The button text is the row's own label, edited in place; the URL is in the card under it.
 const button=page.getByRole('textbox',{name:'Cta: Button text',exact:true});await expect(button).toHaveValue('Get in touch');
 expect(await button.evaluate((el:HTMLTextAreaElement)=>({row:Boolean(el.closest('.page-structure__row.is-editing')),fits:el.scrollWidth<=el.clientWidth}))).toEqual({row:true,fits:true});
 for(const [name,value] of [['Cta: Link / URL','/about/#contact']]){
  const input=page.getByRole('combobox',{name,exact:true});await expect(input).toHaveValue(value);
  const m=await input.evaluate((el:HTMLInputElement)=>{const cap=el.closest('label')!.querySelector('.page-structure__slot-field-label')!.getBoundingClientRect(),box=el.getBoundingClientRect(),editor=el.closest('.page-structure__inline')!.getBoundingClientRect();return{capBottom:cap.bottom,top:box.top,width:box.width,editor:editor.width,fits:el.scrollWidth<=el.clientWidth};});
  expect(m.capBottom).toBeLessThanOrEqual(m.top+0.5);expect(m.width).toBeGreaterThan(m.editor*0.7);expect(m.fits).toBe(true);
 }
 const d=await page.locator('aside').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));expect(d.scroll).toBeLessThanOrEqual(d.width);
});

test('the middle-breakpoint 240px sidebar keeps an open link editor and its whole URL inside the tree',async({page})=>{
 // style.css gives the sidebar column 240px at widths up to 1050px.
 await page.setViewportSize({width:1000,height:760});await page.evaluate(async()=>{await import('/src/theme.css');await import('/src/style.css');(window as any).hostWidth=240;});await harness(page);
 expect(await sidebarGeometry(page)).toEqual({sidebar:240,content:200,tree:220,row:212});
 await page.evaluate(()=>{const s=(window as any).slotHarness;s.source=s.source.replace('href="/before"','href="/about/#contact"');s.version++;s.update();});
 await page.locator('[role=treeitem][data-node="0.3"]').press('F2');
 const url=page.getByRole('combobox',{name:'Cta: Link / URL',exact:true});await expect(url).toHaveValue('/about/#contact');
 const m=await url.evaluate((el:HTMLInputElement)=>{const tree=el.closest('.page-structure__tree')!.getBoundingClientRect(),box=el.getBoundingClientRect();return{left:box.left>=tree.left,right:box.right<=tree.right,fits:el.scrollWidth<=el.clientWidth,width:box.width};});
 expect(m).toMatchObject({left:true,right:true,fits:true});expect(m.width).toBeGreaterThanOrEqual(120);
 const tree=await page.locator('.page-structure').evaluate((el:HTMLElement)=>({scroll:el.scrollWidth,width:el.clientWidth}));expect(tree.scroll).toBeLessThanOrEqual(tree.width);
});

// A preview that records its text patches (as native-preview.ts takes them): a patch, and how it ended.
const recordPatches=(page:any)=>page.evaluate(()=>{const s=(window as any).slotHarness;s.patches=[];s.patcher={patchText:(_r:any,text:string)=>s.patches.push(['patch',text]),vouchPatch:()=>{},endPatch:(_p:string,finish:any)=>s.patches.push(['end',finish?finish.text:null])};});
const patches=async(page:any)=>(await H(page)).patches as [string,string|null][];

test('a template change while patched text waits ends the patch without its text, so the page is drawn from its source',async({page})=>{
 await harness(page);await recordPatches(page);
 const title=page.locator('[role=treeitem][data-node="0.0"]');await title.focus();await title.press('F2');
 const text=page.getByRole('textbox',{name:'Title: Text',exact:true});await expect(text).toBeFocused();
 await page.keyboard.type('New');
 await expect.poll(async()=>(await patches(page)).filter(p=>p[0]==='patch').length).toBeGreaterThan(0);
 // Before the waiting write lands, the instance's template changes (an agent, the code pane): the write is refused.
 await page.evaluate(()=>{const s=(window as any).slotHarness;s.template+='<!-- changed -->';});
 await expect(text).toHaveAttribute('aria-invalid','true');
 expect((await H(page)).source).not.toContain('New');
 // The patch ended with no text of its own: the preview draws the page again from its sources.
 expect((await patches(page)).at(-1)).toEqual(['end',null]);
 // Typing on patches nothing more.
 const count=(await patches(page)).length;await page.keyboard.type('er');await page.waitForTimeout(250);
 expect((await patches(page)).length).toBe(count);
});

test('Escape whose discard is refused, with keystrokes still waiting, says so and ends the patch without its text',async({page})=>{
 await harness(page);await recordPatches(page);
 const title=page.locator('[role=treeitem][data-node="0.0"]');await title.focus();await title.press('F2');
 const text=page.getByRole('textbox',{name:'Title: Text',exact:true});await expect(text).toBeFocused();
 await page.keyboard.type('AB');
 await expect.poll(async()=>(await H(page)).source).toContain('>AB<');
 await page.keyboard.type('C');
 await expect.poll(async()=>(await patches(page)).some(p=>p[0]==='patch'&&p[1]==='ABC')).toBe(true);
 // This harness editor cannot discard a group: Escape is refused, said so.
 await text.press('Escape');
 await expect(page.locator('.page-structure__row.is-editing')).toHaveCount(0);
 expect((await H(page)).notices.join(' ')).toContain('use Undo');
 // The waiting keystroke is never written, and the page is drawn again from its source (which holds AB).
 expect((await H(page)).source).toContain('>AB<');
 expect((await H(page)).source).not.toContain('ABC');
 expect((await patches(page)).at(-1)).toEqual(['end',null]);
});
