import { expect, test, type Page } from "@playwright/test";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const edit = (page: Page) => toolbar(page).getByRole("button", { name: "Edit Project card component", exact: true });
async function root(page: Page) {
  const row = page.getByRole("treeitem", { name: "Section", exact: true });
  await row.locator(".page-structure__toggle").click();
  await page.getByRole("treeitem", { name: /^Project card Reusable cards$/ }).locator(".page-structure__label").click();
  await expect(edit(page)).toBeVisible();
}
test.beforeEach(async ({page,baseURL})=>{
 await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
 await expect(frame(page).locator('.hero h1')).toBeVisible({timeout:30000});
 await expect(page.locator('#content [role=textbox]').first()).toBeAttached();
});
test('root name reveals a sliding icon with fixed bounds; keyboard and reduced motion reveal instantly',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await root(page);await page.mouse.move(0,0);
 const button=edit(page),overlay=button.locator('.edit-bar__component-edit');
 await expect(button).toHaveText('Project card');await expect(overlay).toHaveCSS('opacity','0');
 const nameBounds=()=>button.evaluate(el=>{const box=el.getBoundingClientRect(),bar=el.closest('.edit-bar')!.getBoundingClientRect();return{x:box.x-bar.x,y:box.y-bar.y,width:box.width,height:box.height};});
 const before=await nameBounds();
 const hidden=await overlay.evaluate(el=>({transform:getComputedStyle(el).transform,transition:getComputedStyle(el).transitionProperty,duration:getComputedStyle(el).transitionDuration,pointer:getComputedStyle(el).pointerEvents}));
 expect(hidden.transform).not.toBe('none');expect(hidden.transition).toBe('transform, opacity');expect(hidden.duration).toBe('0.14s, 0.14s');expect(hidden.pointer).toBe('none');
 await button.hover();await expect(overlay).toHaveCSS('opacity','1');expect(await nameBounds()).toEqual(before);
 const overlayBox=(await overlay.boundingBox())!,buttonBox=(await button.boundingBox())!;expect(overlayBox.x+overlayBox.width).toBeLessThanOrEqual(buttonBox.x+buttonBox.width+1);
 await page.mouse.move(0,0);await expect(overlay).toHaveCSS('opacity','0');
 await button.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
 await expect(button).toBeFocused();await expect(overlay).toHaveCSS('opacity','1');await expect(overlay).toHaveCSS('transition-duration','0s');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(overlay).toHaveCSS('transform','none');await expect(overlay).toHaveCSS('transition-duration','0s');
 await page.keyboard.press('Enter');await expect(page.locator('#current-page')).toHaveAttribute('data-path','components/project-card/project-card.html');
 await page.locator('.component-banner').getByRole('button',{name:'Done',exact:true}).click();await expect(page.locator('#current-page')).toHaveAttribute('data-path','index.html');
});
test('light DOM and template children have no component edit affordance while the instance caret stays usable',async({page})=>{
 await root(page);
 await frame(page).locator("project-card span[slot='title']").first().click();
 await expect(toolbar(page).getByRole('button',{name:/^Edit .* component$/})).toHaveCount(0);
 const caret=toolbar(page).getByRole('button',{name:'In the title slot of Project card: select the instance',exact:true});
 await caret.locator('.edit-bar__context-caret').click();await expect(edit(page)).toBeVisible();
 await frame(page).locator('project-card article').first().click({position:{x:5,y:5}});
 await expect(page.locator('#current-page')).toHaveAttribute('data-path','index.html');
 await expect(edit(page)).toBeVisible();
 await expect(page.getByRole('treeitem',{name:/^Project card Reusable cards$/})).toHaveAttribute('aria-selected','true');
 await edit(page).click();
 await frame(page).locator('project-card article').first().click({position:{x:5,y:5}});
 await expect(page.locator('#current-page')).toHaveAttribute('data-path','components/project-card/project-card.html');
 await expect(toolbar(page).getByRole('button',{name:/^Edit .* component$/})).toHaveCount(0);
 await expect(toolbar(page).getByRole('button',{name:/Select this Project card instance/})).toBeVisible();
});
test('paragraph, wrapper and button identities in light DOM and template content only select the host',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {createComponentTools}=await import('/src/page-builder/components.ts');
  const {parseMarked}=await import('/src/native-source-location.ts');
  const templatePath='components/project-card/project-card.html';
  const sources={'index.html':'<project-card><div slot="body"><button>Go</button><p>Text</p></div></project-card>',[templatePath]:'<article><div><button>Go</button><p>Body</p></div></article>'};
  let selection:any;const selected:any[]=[];const opened:string[]=[];
  const host=document.createElement('div');document.body.append(host);
  const tools=createComponentTools({site:()=>({components:{'project-card':templatePath},routes:{'/':'index.html'}}),revision:()=> 'scope',sources:()=>sources,
   editor:()=>undefined,preview:()=>({selectNode:(point:any)=>selected.push(point),selectAfterUpdate:()=>{}}),currentPath:()=> 'index.html',selection:()=>selection,
   openFile:async(path:string)=>{opened.push(path);return true;},announce:()=>{},error:()=>{},images:()=>[],upload:async()=>undefined,links:()=>[],pageLabel:(path:string)=>path,createFiles:async()=>({error:'Unavailable'}),panelHost:host,addStrip:(strip:HTMLElement)=>host.append(strip),codeTitle:document.createElement('div'),previewPage:()=> 'index.html'});
  const entries:any[]=[];
  try{
   for(const path of ['index.html',templatePath]) for(const node of [[0,0],[0,0,0],[0,0,1]]) {
    let element:any=parseMarked(sources[path as keyof typeof sources]).root;for(const index of node) element=element.children[index];
    selection={path,tag:element.localName,node,text:element.textContent,reason:'click',selectors:[],...(path===templatePath?{host:{tag:'project-card',selector:'project-card',path:'index.html',node:[0]}}:{})};
    const identity=tools.identity(selection);entries.push({tag:element.localName,componentEdit:Boolean(identity.component?.onEdit),contextEdit:Boolean(identity.context?.onEdit),hasSelect:Boolean(identity.context?.onSelect)});
    identity.context?.onSelect();
   }
   return{entries,selected,opened};
  }finally{tools.destroy();host.remove();}
 });
 expect(result.entries.map((entry:any)=>entry.tag)).toEqual(['div','button','p','div','button','p']);
 expect(result.entries.every((entry:any)=>!entry.componentEdit&&!entry.contextEdit&&entry.hasSelect)).toBe(true);
 expect(result.selected).toEqual(Array.from({length:6},()=>({path:'index.html',node:[0]})));expect(result.opened).toEqual([]);
});

test('address opening captures once across retained renders and captures again after closing', async ({page}) => {
 await page.evaluate(async () => {
  const modulePath='/src/components/edit-bar.ts';
  const {createEditBar}=await import(modulePath);
  const pane=document.createElement('div');pane.id='address-hook';pane.style.cssText='position:fixed;inset:100px;z-index:1000';document.body.append(pane);
  const output=document.createElement('output');output.id='address-hook-output';pane.append(output);
  const bar=createEditBar(pane,pane);
  let revision=0;
  const show=()=>bar.show({kind:'Link',controls:[{kind:'address',label:'Address',value:'/before',onOpen:()=>{output.textContent+=`open${revision} `;},onClose:()=>{output.textContent+='close ';},onInput:()=>{revision++;show();}}]}, {top:100,left:100,width:200,height:50,right:300,bottom:150});
  show();
 });
 const pane=page.locator('#address-hook'),address=pane.getByRole('button',{name:'Address',exact:true}),output=page.locator('#address-hook-output');
 await address.click();await expect(output).toHaveText('open0 ');
 const input=pane.locator('.edit-bar__field-input');await input.fill('/after');await expect(input).toHaveValue('/after');await expect(output).toHaveText('open0 ');
 await input.press('Escape');await expect(output).toHaveText('open0 close ');
 await address.click();await expect(output).toHaveText('open0 close open1 ');
});

test('programmatic address switch closes the old context before opening the new one', async ({page}) => {
 await page.evaluate(async()=>{
  const modulePath='/src/components/edit-bar.ts'; const {createEditBar}=await import(modulePath);
  const pane=document.createElement('div');pane.id='address-order';pane.style.cssText='position:fixed;inset:100px;z-index:1000';document.body.append(pane);
  const output=document.createElement('output');output.id='address-order-output';pane.append(output);
  const bar=createEditBar(pane,pane), rect={top:100,left:100,width:200,height:50,right:300,bottom:150};
  const record=(text:string)=>{output.textContent+=text+' ';};
  bar.show({kind:'Link',controls:[{kind:'address',label:'A',value:'/a',onInput:()=>{},onOpen:()=>record('openA'),onClose:()=>record('closeA')},{kind:'address',label:'B',value:'/b',onInput:()=>{},onOpen:()=>record('openB'),onClose:()=>record('closeB')}]},rect);
 });
 const pane=page.locator('#address-order');
 await pane.getByRole('button',{name:'A',exact:true}).click();
 await pane.getByRole('button',{name:'B',exact:true}).evaluate(element=>(element as HTMLElement).click());
 await expect(page.locator('#address-order-output')).toHaveText('openA closeA openB ');
 await expect(page.locator('#address-order .edit-bar__field-input')).toHaveValue('/b');
});

test('root panel Edit remains usable after typing its instance slot',async({page})=>{
 await root(page);
 const panel=page.locator('#structure');
 const instance=page.getByRole('treeitem',{name:/^Project card Reusable cards$/});
 if(await instance.getAttribute('aria-expanded')==='false')await instance.locator('.page-structure__toggle').click();
 await page.locator('.page-structure__slot-badge').filter({hasText:/^Title$/}).first().press('Enter');
 const title=panel.getByRole('textbox',{name:'Title: Text',exact:true});
 await title.fill('Edited root title');await title.press('Tab');
 await expect(frame(page).locator('project-card').first().locator('[slot="title"]')).toHaveText('Edited root title');
 await page.getByRole('treeitem',{name:/^Project card Edited root title$/}).hover();
 await page.getByRole('treeitem',{name:/^Project card Edited root title$/}).getByRole('button',{name:'Edit component',exact:true}).click();
 await expect(page.locator('#current-page')).toHaveAttribute('data-path','components/project-card/project-card.html');
});
// The pencil reads as a click target: a pointer over it and a tint of its own
// (on a section's name, which drags, the rest of the name keeps the grab cursor).
test('the revealed pencil shows a pointer and a hover tint, and clicking it edits the component',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await root(page);
 const button=edit(page),overlay=button.locator('.edit-bar__component-edit'),icon=overlay.locator('.edit-bar__icon');
 await button.hover();await expect(overlay).toHaveCSS('opacity','1');
 await expect(icon).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await overlay.hover();
 await expect(overlay).toHaveCSS('cursor','pointer');await expect(overlay).toHaveCSS('pointer-events','auto');
 await expect(icon).not.toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await overlay.click();await expect(page.locator('#current-page')).toHaveAttribute('data-path','components/project-card/project-card.html');
});
// Edit component lands in the template's code with the caret there: typing
// edits it at once, with no click into the code first.
test('Edit component puts the caret in the template code, so typing edits it at once',async({page})=>{
 await root(page);await edit(page).click();
 await expect(page.locator('#current-page')).toHaveAttribute('data-path','components/project-card/project-card.html');
 await expect.poll(()=>page.evaluate(()=>Boolean(document.activeElement?.closest('#content .monaco-editor')))).toBe(true);
 await page.keyboard.type('Z');
 await expect(page.locator('#content .view-lines').first()).toContainText('Z');
});
// The switch keeps Monaco's editor worker: closing the page's editors before
// the template's open leaves no model for a moment, which used to stop the
// worker and start a new one (its script fetched again) once the template's
// editor needed it.
test('Edit component keeps the one Monaco editor worker',async({page})=>{
 const editorWorkers=()=>page.workers().filter(worker=>/editor\.worker/.test(worker.url()));
 await expect.poll(()=>editorWorkers().length).toBe(1);
 const [worker]=editorWorkers();
 await root(page);await edit(page).click();
 await expect(page.locator('#current-page')).toHaveAttribute('data-path','components/project-card/project-card.html');
 await page.waitForTimeout(3000);
 expect(editorWorkers()).toEqual([worker]);
});
