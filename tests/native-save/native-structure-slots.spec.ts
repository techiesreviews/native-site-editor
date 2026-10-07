import {expect,test} from '@playwright/test';
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
  state.tools=createComponentTools({structureFields:true,site:()=>({components:{'project-card':templatePath},routes:{'/':'index.html'}}),revision:()=>state.revision,sources:()=>({'index.html':state.source,[templatePath]:state.template}),editor:()=>editor,preview:()=>({selectNode:(target:any)=>state.selected.push(target),selectAfterUpdate:()=>{}}),currentPath:()=>current,selection:()=>({path:'index.html',node:[0],tag:'project-card',text:'',reason:'click',selectors:[]}),openFile:async(path:string)=>{state.opened.push(path);current=path;return true;},announce:(value:string)=>state.notices.push(value),error:(error:any)=>{throw error;},images:()=>["media/suggested.png"],upload:async()=>{state.uploadCalls=(state.uploadCalls??0)+1;return await new Promise(resolve=>state.finishUpload=resolve);},links:()=>[{label:"About",value:"/about/"}],pageLabel:(path:string)=>path,createFiles:async()=>({error:'Unused'}),panelHost:host,addStrip:(element:any)=>host.append(element),codeTitle:document.createElement('div'),previewPage:()=> 'index.html'});
  sidebar=createPageStructure(host,{announce:(value:string)=>state.notices.push(value),label:(item:any)=>({kind:item.tag==='project-card'?'Project card':item.tag,text:item.text,component:item.tag==='project-card'}),onSelect:(path:string,node:number[])=>state.selected.push({path,node}),componentSlots:(path:string,node:number[])=>state.tools.structure(path,node)});state.sidebar=sidebar;state.update=update;update();
 });
}
// Native Structure baseline: every assigned root is a real treeitem; one inline
// editor opens only on an explicit F2, pencil or badge.
const row=(page:any,node:string)=>page.locator(`[role=treeitem][data-node="${node}"]`);
// A slot's open editor: the row edited in place and, for a link or an image, the card attached under it.
const OPEN_EDITOR='.page-structure__inline, .page-structure__row.is-editing';
const edit=async(page:any,node:string)=>{await row(page,node).press('F2');await expect(page.locator(`.page-structure__row.is-editing[data-edit-node="${node}"]`)).toHaveCount(1);};
const openAttributes=async(page:any)=>{const root=row(page,'0');await root.hover();await root.getByRole('button',{name:'Attributes',exact:true}).click();await expect(page.getByRole('textbox',{name:'New attribute name',exact:true})).toBeVisible();};
test('slot fields live in Structure once, keep caret and own typing while refusing external changes',async({page})=>{
 await harness(page);
 await expect(page.locator('.component-panel')).toBeHidden();
 await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);await expect(page.getByRole('textbox',{name:'Title: Text',exact:true})).toHaveCount(0);
 await expect(page.getByRole('treeitem',{name:/^span/})).toHaveCount(1);await edit(page,'0.0');
 await expect(page.getByRole('treeitem',{name:/^div Keep unknown/})).toBeVisible();
 const text=page.getByRole('textbox',{name:'Title: Text',exact:true});await text.fill('First');await text.press('End');await text.press('!');
 await expect(text).toBeFocused();await expect(text).toHaveValue('First!');expect(await text.evaluate(el=>(el as HTMLInputElement).selectionStart)).toBe(6);
 expect(await page.evaluate(()=>(window as any).slotHarness.closed)).toBe(0);
 await page.evaluate(()=>{(window as any).slotHarness.source+='<!-- external -->';});await text.press('!');
 await expect(text).toHaveAttribute('aria-invalid','true');expect(await page.evaluate(()=>(window as any).slotHarness.source)).toContain('First!');expect(await page.evaluate(()=>(window as any).slotHarness.source)).not.toContain('First!!');
 await text.press('Tab');expect(await page.evaluate(()=>(window as any).slotHarness.closed)).toBe(0);
});
test('link and image detail fields use exact instance sources and ordinary selection stays on the page',async({page})=>{
 await harness(page);await edit(page,'0.1');
 await page.getByRole('textbox',{name:'Image: Alt text',exact:true}).fill('New & exact');await expect(page.getByRole('textbox',{name:'Image: Alt text',exact:true})).toBeFocused();await page.keyboard.press('Tab');
 await edit(page,'0.2');await page.getByRole('combobox',{name:'Cta: Link / URL',exact:true}).fill('/after?a=1&b=2');await expect(page.getByRole('combobox',{name:'Cta: Link / URL',exact:true})).toBeFocused();await page.keyboard.press('Tab');
 // Tab out of the editing block commits it once the focus has settled.
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.closed)).toBe(2);
 const source=await page.evaluate(()=>(window as any).slotHarness.source);const values=await page.evaluate(()=>{const dom=new DOMParser().parseFromString((window as any).slotHarness.source,'text/html');return{alt:dom.querySelector('img')!.getAttribute('alt'),href:dom.querySelector('a')!.getAttribute('href')};});expect(values).toEqual({alt:'New & exact',href:'/after?a=1&b=2'});expect(source).toContain('alt="New &amp; exact"');expect(source).toContain('href="/after?a=1&amp;b=2"');
 await row(page,'0.0').click();expect(await page.evaluate(()=>(window as any).slotHarness.selected.at(-1))).toEqual({path:'index.html',node:[0,0]});await expect(page.locator('.page-structure__row.is-editing[data-edit-node="0.0"]')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).slotHarness.opened)).toEqual([]);
});
test('field sessions reject scope and template changes, and shadow selections require true host proof',async({page})=>{
 await harness(page);
 const result=await page.evaluate(()=>{const state=(window as any).slotHarness,tools=state.tools;const field=tools.structure('index.html',[0]).openField('title','text');state.template+='<!-- new -->';const changedTemplate=field.write('Wrong');const replacement=tools.structure('index.html',[0]).openField('title','text');state.model++;const changedModel=replacement.write('Wrong');const second=tools.structure('index.html',[0]).openField('title','text');state.revision='B';const changedScope=second.write('Wrong');const shadow={path:'components/project-card.html',node:[0,0],tag:'h2',text:'',reason:'click',selectors:[],host:{path:'index.html',node:[0],tag:'project-card',selector:'project-card'}};return {changedTemplate,changedScope,changedModel,valid:tools.instanceSelection(shadow),invalid:tools.instanceSelection({...shadow,host:{...shadow.host,node:[9]}}),scope:tools.editingScope(),closed:state.closed,source:state.source};});
 expect(result.closed).toBe(0);expect(result.changedTemplate).toBe(false);expect(result.changedScope).toBe(false);expect(result.changedModel).toBe(false);expect(result.source).toContain('Original');expect(result.valid.path).toBe('index.html');expect(result.valid.node).toEqual([0]);expect(result.invalid).toBeUndefined();expect(result.scope).toBeUndefined();
});

test('optional visibility and root actions remain explicit and keyboard reachable',async({page})=>{
 await harness(page);
 const visible=page.getByRole('button',{name:'Show Optional',exact:true});await expect(visible).toHaveAttribute('aria-pressed','false');await visible.locator('xpath=ancestor::*[@role="treeitem"]').hover();await visible.click();await expect(page.locator('.page-structure__row.is-editing[data-slot-editor="optional"] .page-structure__slot-toggle')).toHaveAttribute('aria-pressed','true');await expect(page.getByRole("textbox",{name:"Optional: Text",exact:true})).toBeFocused();
 expect(await page.evaluate(()=>(window as any).slotHarness.source)).toContain('slot="optional"');
 // Show opened the field; Enter ends editing (nothing changed), and the row's eye is reachable again.
 await page.getByRole("textbox",{name:"Optional: Text",exact:true}).press('Enter');await visible.focus();await page.keyboard.press('Space');await expect(visible).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>(window as any).slotHarness.source)).not.toContain('slot="optional"');
 await page.getByRole('treeitem',{name:/^Project card/}).click();expect(await page.evaluate(()=>(window as any).slotHarness.opened)).toEqual([]);
 const edit=page.getByRole('button',{name:'Edit component',exact:true});await edit.focus();await expect(edit).toHaveCSS('opacity','1');await page.keyboard.press('Enter');
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
 for(const node of ['0.1','0.2']){await edit(page,node);
 const dimensions=await page.locator('aside').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);}
});

test('unchanged slot values do not create a typing group',async({page})=>{
 await harness(page);const result=await page.evaluate(()=>{const state=(window as any).slotHarness,field=state.tools.structure('index.html',[0]).openField('title','text');const unchanged=field.write('Original');field.close();return{unchanged,closed:state.closed,version:state.version};});expect(result).toEqual({unchanged:true,closed:0,version:0});
});

test('Structure Attributes retains editable class/id/custom values with add and remove',async({page})=>{
 await harness(page);await openAttributes(page);
 await expect(page.getByRole('textbox',{name:'Attribute: class',exact:true})).toHaveValue('café cards');
 const title=page.getByRole('textbox',{name:'Attribute: title',exact:true});await title.fill('O"Neil & <tag>');await expect(title).toBeFocused();await title.press('End');await title.press('!');await title.press('Tab');
 await page.getByRole('button',{name:'Remove data-note',exact:true}).click();
 await page.getByRole('textbox',{name:'New attribute name',exact:true}).fill('data-mode');await page.getByRole('textbox',{name:'New attribute value',exact:true}).fill('wide & safe');await page.getByRole('button',{name:'Add attribute',exact:true}).click();
 const result=await page.evaluate(()=>{const state=(window as any).slotHarness,element=new DOMParser().parseFromString(state.source,'text/html').querySelector('project-card')!;return{title:element.getAttribute('title'),class:element.getAttribute('class'),id:element.getAttribute('id'),mode:element.getAttribute('data-mode'),note:element.hasAttribute('data-note'),closed:state.closed};});
 expect(result).toEqual({title:'O"Neil & <tag>!',class:'café cards',id:'card',mode:'wide & safe',note:false,closed:1});await expect(page.getByRole('textbox',{name:'New attribute name',exact:true})).toHaveValue('');
});
test('new attribute WIP keeps its first-open proof across agent rerenders and refuses unsafe names',async({page})=>{
 await harness(page);await openAttributes(page);
 const name=page.getByRole('textbox',{name:'New attribute name',exact:true}),value=page.getByRole('textbox',{name:'New attribute value',exact:true}),add=page.getByRole('button',{name:'Add attribute',exact:true});
 await name.fill('onclick');await value.fill('alert(1)');await add.click();await expect(page.getByRole('alert')).toContainText('Event handlers');
 await name.fill('class');await add.click();await expect(page.getByRole('alert')).toContainText('set already');
 await name.fill('data-pending');await value.fill('pending');await page.evaluate(()=>{const state=(window as any).slotHarness;state.source+='<!-- agent -->';state.version++;state.update();});
 await expect(value).toHaveValue('pending');await add.click();await expect(page.getByRole('alert')).toContainText('instance changed');expect(await page.evaluate(()=>(window as any).slotHarness.source)).not.toContain('data-pending=');
});
test('unchanged named-entity attribute input preserves source bytes and has no history step',async({page})=>{
 await harness(page);const result=await page.evaluate(()=>{const state=(window as any).slotHarness,before=state.source,model=state.tools.structure('index.html',[0]),field=model.openAttribute('class');const value=model.attributes.find((attribute:any)=>attribute.name==='class').value,accepted=field.write(value);field.close();return{accepted,value,unchanged:before===state.source,version:state.version,closed:state.closed};});expect(result).toEqual({accepted:true,value:'café cards',unchanged:true,version:0,closed:0});
});

test('attribute writes refuse truncated malformed token ranges while preserving legal Unicode names',async({page})=>{
 await harness(page);
 const result=await page.evaluate(()=>{const state=(window as any).slotHarness;state.source='<project-card title=a\'b></project-card><p title="outside">Keep</p>';state.version++;const before=state.source,model=state.tools.structure('index.html',[0]),field=model?.openAttribute('title'),edit=field?.write('Wrong')??false,added=model?.addAttribute('data-new','Wrong')??{error:'No safe source target'};field?.close();const unchanged=before===state.source;state.source='<project-card 表="old"></project-card>';state.version++;const unicode=state.tools.structure('index.html',[0]).openAttribute('表'),accepted=unicode.write('新 & exact');unicode.close();const dom=new DOMParser().parseFromString(state.source,'text/html');return{edit,added,unchanged,accepted,value:dom.querySelector('project-card')!.getAttribute('表')};});
 expect(result.edit).toBe(false);expect(result.added).toHaveProperty('error');expect(result.unchanged).toBe(true);expect(result.accepted).toBe(true);expect(result.value).toBe('新 & exact');
});

test('attribute range validation compares the complete token against Chromium before writing',async({page})=>{
 await harness(page);const result=await page.evaluate(()=>{const state=(window as any).slotHarness;state.source="<project-card title=a'b' data-x=q></project-card><p title=outside>Keep</p>";state.version++;const before=state.source,dom=new DOMParser().parseFromString(before,'text/html'),model=state.tools.structure('index.html',[0]),field=model?.openAttribute('title'),written=field?.write('Wrong')??false,added=model?.addAttribute('data-new','Wrong')??{error:'No safe source target'};field?.close();return{hasModel:!!model,title:dom.querySelector('project-card')!.getAttribute('title'),outside:dom.querySelector('p')!.getAttribute('title'),written,added,unchanged:state.source===before};});expect(result.hasModel).toBe(true);expect(result.title).toBe("a'b'");expect(result.outside).toBe('outside');expect(result.written).toBe(false);expect(result.added).toHaveProperty('error');expect(result.unchanged).toBe(true);
});

test('image suggestions and deferred upload retain the original instance and one atomic edit',async({page})=>{
 await harness(page);await edit(page,'0.1');
 const image=page.getByRole('combobox',{name:'Image: Image',exact:true});await image.press('ArrowDown');await expect(page.getByRole('listbox',{name:'Images of this site'}).getByRole('option').first()).toHaveAttribute('data-value','/media/suggested.png');await image.press('Escape');await expect(page.getByRole('listbox',{name:'Images of this site'})).toBeHidden();
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload image…'}).click();await (await chooser).setFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('image')});
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.uploadCalls)).toBe(1);
 await row(page,'0.0').click();await page.evaluate(()=>(window as any).slotHarness.finishUpload('/media/new?a=1&b=2.png'));
 await expect.poll(()=>page.evaluate(()=>(window as any).slotHarness.version)).toBe(1);
 const result=await page.evaluate(()=>{const s=(window as any).slotHarness;return{src:new DOMParser().parseFromString(s.source,'text/html').querySelector('img')!.getAttribute('src'),closed:s.closed,source:s.source};});expect(result.src).toBe('/media/new?a=1&b=2.png');expect(result.source).toContain('&amp;b=2');expect(result.closed).toBe(0);
});
test('deferred image upload refuses deletion, scope changes and same-source model replacement',async({page})=>{
 await harness(page);
 const results=await page.evaluate(async()=>{const s=(window as any).slotHarness,original=s.source,results=[];for(const mutation of ['delete','replace','scope','template']){s.source=original;s.revision='A';s.template=s.template.replace('<!-- changed -->','');const target=s.tools.structure('index.html',[0]).openImageUpload('image'),pending=target.upload([new File(['image'],'image.png')]);if(mutation==='delete')s.source='<p>Replacement</p>';if(mutation==='replace')s.model++;if(mutation==='scope')s.revision='B';if(mutation==='template')s.template+='<!-- changed -->';const before=s.source;s.finishUpload('/wrong.png');results.push({accepted:await pending,unchanged:s.source===before});}return{results,version:s.version,closed:s.closed};});expect(results).toEqual({results:Array(4).fill({accepted:false,unchanged:true}),version:0,closed:0});
});

test('slot and attribute fields reopen after own typing, and URL typos remain correctable',async({page})=>{
 await harness(page);await edit(page,'0.0');const title=page.getByRole('textbox',{name:'Title: Text',exact:true});await title.fill('First');await title.press('Tab');await title.focus();await title.fill('Second');await expect(title).not.toHaveAttribute('aria-invalid','true');await title.press('Escape');await expect(row(page,'0.0')).toBeFocused();await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
 await openAttributes(page);const attribute=page.getByRole('textbox',{name:'Attribute: title',exact:true});await attribute.fill('First attribute');await attribute.press('Tab');await attribute.focus();await attribute.fill('Second attribute');await expect(attribute).not.toHaveAttribute('aria-invalid','true');await attribute.press('Tab');
 await edit(page,'0.2');const href=page.getByRole('combobox',{name:'Cta: Link / URL',exact:true});await href.fill('javascript:bad');await expect(href).toHaveAttribute('aria-invalid','true');await href.fill('/corrected');await expect(href).not.toHaveAttribute('aria-invalid','true');expect(await page.evaluate(()=>{const doc=new DOMParser().parseFromString((window as any).slotHarness.source,'text/html');return{title:doc.querySelector('project-card')!.getAttribute('title'),text:doc.querySelector('span')!.textContent,href:doc.querySelector('a')!.getAttribute('href')};})).toEqual({title:'Second attribute',text:'Second',href:'/corrected'});
});
test('a refused stale attribute draft can explicitly retry against freshly reviewed source',async({page})=>{
 await harness(page);await openAttributes(page);const name=page.getByRole('textbox',{name:'New attribute name'}),value=page.getByRole('textbox',{name:'New attribute value'}),add=page.getByRole('button',{name:'Add attribute'});await name.fill('data-pending');await value.fill('kept');await page.evaluate(()=>{const s=(window as any).slotHarness;s.source+='<!-- agent -->';s.version++;s.update();});await add.click();expect(await page.evaluate(()=>(window as any).slotHarness.source)).not.toContain('data-pending=');await expect(value).toHaveValue('kept');await add.click();expect(await page.evaluate(()=>(window as any).slotHarness.source)).toContain('data-pending="kept"');await expect(name).toBeFocused();
});

test('slot selection, link suggestions and narrow Unicode attribute labels retain usable controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});await harness(page);await page.evaluate(()=>{const s=(window as any).slotHarness;s.source=s.source.replace('data-note="old"','長い属性名前="old"');s.version++;s.update();s.sidebar.select({path:'index.html',node:[0,1]});});await expect(row(page,'0.1')).toHaveAttribute('aria-selected','true');await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
 await edit(page,'0.2');const link=page.getByRole('combobox',{name:'Cta: Link / URL',exact:true});await link.press('ArrowDown');await expect(page.getByRole('listbox',{name:'Pages of this site'}).getByRole('option').first()).toHaveAttribute('data-value','/about/');await link.press('Escape');await expect(page.getByRole('listbox',{name:'Pages of this site'})).toBeHidden();await openAttributes(page);await expect(page.getByRole('textbox',{name:'Attribute: 長い属性名前',exact:true})).toBeVisible();expect(await page.locator('aside').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
test('slot attribute token ambiguity refuses edits and uploads without corrupting outside source',async({page})=>{
 await harness(page);const result=await page.evaluate(async()=>{const s=(window as any).slotHarness;s.source="<project-card><img slot=image src=a'b' alt=old></project-card><p title=outside>Keep</p>";s.version++;const before=s.source,model=s.tools.structure('index.html',[0]),field=model.openField('image','alt'),written=field.write('Wrong');field.close();const upload=model.openImageUpload('image'),pending=upload.upload([new File(['image'],'image.png')]);s.finishUpload('/wrong.png');const uploaded=await pending;return{written,uploaded,unchanged:s.source===before,outside:new DOMParser().parseFromString(s.source,'text/html').querySelector('p')!.getAttribute('title'),closed:s.closed};});expect(result).toEqual({written:false,uploaded:false,unchanged:true,outside:'outside',closed:0});
});

test('a picker detached by Structure rerender explicitly refuses its later file choice',async({page})=>{
 await harness(page);await edit(page,'0.1');const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload image…'}).click();const opened=await chooser;await page.evaluate(()=>(window as any).slotHarness.update());await opened.setFiles({name:'late.png',mimeType:'image/png',buffer:Buffer.from('image')});const result=await page.evaluate(()=>{const s=(window as any).slotHarness;return{calls:s.uploadCalls??0,version:s.version,notices:s.notices};});expect(result.calls).toBe(0);expect(result.version).toBe(0);expect(result.notices).toContain('The image picker changed; reopen Upload image… before choosing a file.');
});
test('content-only slot activation consumes its pending focus before a later text field exists',async({page})=>{
 await harness(page);await page.evaluate(()=>{const s=(window as any).slotHarness;s.template=s.template.replace('<article>','<section>').replace('</article>','</section>').replace('<slot name="optional"></slot>','<slot name="optional"><div><p>One</p><p>Two</p></div></slot>');s.version++;s.update();});const visible=page.getByRole('button',{name:'Show Optional',exact:true});await visible.locator('xpath=ancestor::*[@role="treeitem"]').hover();await visible.click();await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);const title=page.locator('#canvas-caret');await page.evaluate(()=>{const input=document.createElement('input');input.id='canvas-caret';document.body.append(input);input.focus();});await page.evaluate(()=>{const s=(window as any).slotHarness;s.source=s.source.replace('<div slot="optional"><p>One</p><p>Two</p></div>','<span slot="optional">Now text</span>');s.version++;s.update();});await expect(title).toBeFocused();await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
});
