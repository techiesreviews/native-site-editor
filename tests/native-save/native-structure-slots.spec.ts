import {expect,test} from '@playwright/test';
test.beforeEach(async({page,baseURL})=>{await page.goto(new URL('/tests/slot-ghosts/fixture.html',baseURL!).href);});
async function harness(page:any) {
 await page.evaluate(async()=>{
  const componentPath='/src/page-builder/components.ts',structurePath='/src/components/page-structure.ts';
  const {createComponentTools}=await import(componentPath),{createPageStructure}=await import(structurePath);
  document.body.replaceChildren();const host=document.createElement('aside');host.style.cssText='width:320px;height:700px';document.body.append(host);
  const state:any=(window as any).slotHarness={source:'<project-card><span slot="title">Original</span><img slot="image" src="/old.png" alt="Old"><a slot="cta" href="/before">Go</a><div slot="unknown">Keep unknown</div></project-card>',template:'<article><h2><slot name="title">Title</slot></h2><slot name="image"><img src="/fallback.png" alt="Fallback"></slot><slot name="cta"><a href="/fallback">Fallback link</a></slot><div data-if="optional"><slot name="optional"><p>Optional</p></slot></div></article>',revision:'A',model:1,version:0,closed:0,selected:[],opened:[],notices:[]};
  const templatePath='components/project-card.html';let current='index.html';let sidebar:any;
  const item=(tag:string,node:number[],text='',slot='',children:any[]=[])=>({tag,node,text,slot,heading:'',children});
  const update=()=>sidebar.update({path:'index.html',items:[item('project-card',[0],state.source,'',[item('span',[0,0],'Original','title'),item('img',[0,1],'','image'),item('a',[0,2],'Go','cta'),item('div',[0,3],'Keep unknown','unknown')])]});
  const editor={isMounted:()=>true,captureHistoryHost:()=>{const model=state.model;return{isCurrent:()=>state.model===model};},prepareHistorySources:()=>{const model=state.model,version=state.version;return{isCurrent:()=>state.model===model&&state.version===version,dispose:()=>{}};},replaceActiveRange:(edit:any)=>{expectSource(edit);state.source=state.source.slice(0,edit.start)+edit.text+state.source.slice(edit.end);state.version++;update();},replaceActiveRanges:(edits:any[])=>{for(const edit of [...edits].sort((a,b)=>b.start-a.start)){expectSource(edit);state.source=state.source.slice(0,edit.start)+edit.text+state.source.slice(edit.end);}update();},closeActiveEditGroup:()=>state.closed++};
  function expectSource(edit:any){if(state.source.slice(edit.start,edit.end)!==edit.expected)throw Error('stale range');}
  state.tools=createComponentTools({site:()=>({components:{'project-card':templatePath},routes:{'/':'index.html'}}),revision:()=>state.revision,sources:()=>({'index.html':state.source,[templatePath]:state.template}),editor:()=>editor,preview:()=>({selectNode:(target:any)=>state.selected.push(target),selectAfterUpdate:()=>{}}),currentPath:()=>current,selection:()=>({path:'index.html',node:[0],tag:'project-card',text:'',reason:'click',selectors:[]}),openFile:async(path:string)=>{state.opened.push(path);current=path;return true;},announce:(value:string)=>state.notices.push(value),error:(error:any)=>{throw error;},images:()=>[],upload:async()=>undefined,links:()=>[],pageLabel:(path:string)=>path,createFiles:async()=>({error:'Unused'}),panelHost:host,addStrip:(element:any)=>host.append(element),codeTitle:document.createElement('div'),previewPage:()=> 'index.html'});
  sidebar=createPageStructure(host,{label:(item:any)=>({kind:item.tag==='project-card'?'Project card':item.tag,text:item.text,component:item.tag==='project-card'}),onSelect:(path:string,node:number[])=>state.selected.push({path,node}),componentSlots:(path:string,node:number[])=>state.tools.structure(path,node)});state.sidebar=sidebar;update();
 });
}
test('slot fields live in Structure once, keep caret and own typing while refusing external changes',async({page})=>{
 await harness(page);
 await expect(page.locator('.component-panel')).toBeHidden();
 await expect(page.locator('.page-structure__slot')).toHaveCount(4);
 await expect(page.getByRole('treeitem',{name:/^span/})).toHaveCount(0);
 await expect(page.getByRole('treeitem',{name:/^div Keep unknown/})).toBeVisible();
 const text=page.getByRole('textbox',{name:'Title: Text',exact:true});await text.fill('First');await text.press('End');await text.press('!');
 await expect(text).toBeFocused();await expect(text).toHaveValue('First!');expect(await text.evaluate(el=>(el as HTMLInputElement).selectionStart)).toBe(6);
 expect(await page.evaluate(()=>(window as any).slotHarness.closed)).toBe(0);
 await page.evaluate(()=>{(window as any).slotHarness.source+='<!-- external -->';});await text.press('!');
 await expect(text).toHaveAttribute('aria-invalid','true');expect(await page.evaluate(()=>(window as any).slotHarness.source)).toContain('First!');expect(await page.evaluate(()=>(window as any).slotHarness.source)).not.toContain('First!!');
 await text.press('Tab');expect(await page.evaluate(()=>(window as any).slotHarness.closed)).toBe(1);
});
test('link and image detail fields use exact instance sources and ordinary selection stays on the page',async({page})=>{
 await harness(page);await page.locator('.page-structure__slot[data-slot-name="image"] summary').click();
 await page.getByRole('textbox',{name:'Image: Alt text',exact:true}).fill('New & exact');await page.keyboard.press('Tab');
 await page.locator('.page-structure__slot[data-slot-name="cta"] summary').click();await page.getByRole('textbox',{name:'Cta: Link / URL',exact:true}).fill('/after?a=1&b=2');await page.keyboard.press('Tab');
 const source=await page.evaluate(()=>(window as any).slotHarness.source);const values=await page.evaluate(()=>{const dom=new DOMParser().parseFromString((window as any).slotHarness.source,'text/html');return{alt:dom.querySelector('img')!.getAttribute('alt'),href:dom.querySelector('a')!.getAttribute('href')};});expect(values).toEqual({alt:'New & exact',href:'/after?a=1&b=2'});expect(source).toContain('alt="New &amp; exact"');expect(source).toContain('href="/after?a=1&amp;b=2"');
 await page.getByRole('button',{name:'Title',exact:true}).click();expect(await page.evaluate(()=>(window as any).slotHarness.selected.at(-1))).toEqual({path:'index.html',node:[0,0]});expect(await page.evaluate(()=>(window as any).slotHarness.opened)).toEqual([]);
});
test('field sessions reject scope and template changes, and shadow selections require true host proof',async({page})=>{
 await harness(page);
 const result=await page.evaluate(()=>{const state=(window as any).slotHarness,tools=state.tools;const field=tools.structure('index.html',[0]).openField('title','text');state.template+='<!-- new -->';const changedTemplate=field.write('Wrong');const replacement=tools.structure('index.html',[0]).openField('title','text');state.model++;const changedModel=replacement.write('Wrong');const second=tools.structure('index.html',[0]).openField('title','text');state.revision='B';const changedScope=second.write('Wrong');const shadow={path:'components/project-card.html',node:[0,0],tag:'h2',text:'',reason:'click',selectors:[],host:{path:'index.html',node:[0],tag:'project-card',selector:'project-card'}};return {changedTemplate,changedScope,changedModel,valid:tools.instanceSelection(shadow),invalid:tools.instanceSelection({...shadow,host:{...shadow.host,node:[9]}}),scope:tools.editingScope(),source:state.source};});
 expect(result.changedTemplate).toBe(false);expect(result.changedScope).toBe(false);expect(result.changedModel).toBe(false);expect(result.source).toContain('Original');expect(result.valid.path).toBe('index.html');expect(result.valid.node).toEqual([0]);expect(result.invalid).toBeUndefined();expect(result.scope).toBeUndefined();
});

test('optional visibility and root actions remain explicit and keyboard reachable',async({page})=>{
 await harness(page);
 const visible=page.getByRole('checkbox',{name:'Show Optional',exact:true});await expect(visible).not.toBeChecked();await visible.check();await expect(visible).toBeChecked();
 expect(await page.evaluate(()=>(window as any).slotHarness.source)).toContain('slot="optional"');await visible.uncheck();expect(await page.evaluate(()=>(window as any).slotHarness.source)).not.toContain('slot="optional"');
 await page.getByRole('treeitem',{name:/^Project card/}).click();expect(await page.evaluate(()=>(window as any).slotHarness.opened)).toEqual([]);
 const edit=page.getByRole('button',{name:'Edit component',exact:true});await edit.focus();await expect(edit.locator('..')).toHaveCSS('opacity','1');await page.keyboard.press('Enter');
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.opened)).toEqual(['components/project-card.html']);
 expect(await page.evaluate(()=>(window as any).slotHarness.tools.editingScope())).toEqual({path:'components/project-card.html',revision:'A'});
 await page.evaluate(()=>{(window as any).slotHarness.revision='next';});expect(await page.evaluate(()=>(window as any).slotHarness.tools.editingScope())).toBeUndefined();
});

test('slot URL writes reject executable protocols without double decoding literal attribute input',async({page})=>{
 await harness(page);
 const result=await page.evaluate(()=>{const state=(window as any).slotHarness,tools=state.tools;const bad=tools.structure('index.html',[0]).openField('cta','href').write('java\tscript:alert(1)');const data=tools.structure('index.html',[0]).openField('image','src').write('data:text/html,x');const literal=tools.structure('index.html',[0]).openField('cta','href').write('/search?q=java&#x73;cript:');return{bad,data,literal,source:state.source};});
 expect(result.bad).toBe(false);expect(result.data).toBe(false);expect(result.literal).toBe(true);expect(result.source).toContain('href="/search?q=java&amp;#x73;cript:"');
});

test('390px Structure details stay within their sidebar',async({page})=>{
 await page.setViewportSize({width:390,height:760});await harness(page);
 await page.locator('.page-structure__slot[data-slot-name="image"] summary').click();await page.locator('.page-structure__slot[data-slot-name="cta"] summary').click();
 const dimensions=await page.locator('aside').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
});
