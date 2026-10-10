import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route('**/palette-harness.html', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body></body></html>'}));
  await page.goto('/palette-harness.html');
  await page.evaluate(async () => {
    const { mountEditorPalette } = await import('/src/page-builder/palette.ts');
    const { resetCommands } = await import('/src/page-builder/commands.ts');
    const { nativeElementChoices } = await import('/src/page-builder/native-elements.ts');
    resetCommands(); document.body.replaceChildren();
    const state = { source: '<main><section><p>Text</p></section></main>', revision: 'scope:1', path: 'index.html', selection: undefined as any, calls: [] as any[], announcements: [] as string[], opened: [] as string[], errors: [] as string[] };
    const deps = {
      pages: () => [{file:'index.html',route:'/',label:'Home'}], files: () => ['index.html','feature.html'],
      components: () => [{tag:'feature-block',file:'feature.html',label:'Feature block',section:true}],
      nativeElements: () => nativeElementChoices, currentPath: () => state.path, stamp: () => { const held = state.revision; return { holds: () => held === state.revision, changed: () => held === state.revision ? undefined : "scope" as const }; },
      source: () => state.source, selection: () => state.selection, isSectionTag: (name:string) => name==='section',
      insert: async (point:any,choice:any) => {state.calls.push({point,choice});}, open: (path:string) => {state.opened.push(path);},
      editBar: () => undefined, select: () => {}, textSelected: () => false, history: () => {}, editing: () => true,
      toggleCode: () => {}, codeHidden: () => false, toggleStructure: () => {}, structureHidden: () => false,
      newPage: () => {}, newFile: () => {}, showPagesAndFiles: () => {}, announce: (text:string) => state.announcements.push(text), onError: (error:unknown) => {state.errors.push(String(error));},
    };
    mountEditorPalette(document.body,deps);
    (window as any).nativePaletteTest={state,deps};
  });
});
test('real CmdK searches native groups without component template commands and preserves page navigation scopes',async({page})=>{
 await page.keyboard.press('ControlOrMeta+K');
 const dialog=page.getByRole('dialog',{name:'Command palette'});const search=dialog.getByRole('combobox');
 await expect(dialog.locator('[data-command^="native.add:"]')).toHaveCount(0);
 for(const kind of ['section','div','heading','paragraph','image','button']){
  await search.fill(`Add ${kind}`);await expect(dialog.locator(`[data-command="native.add:native:${kind}"]`)).toBeVisible();
 }
 for(const kind of ['text','link-button','list','grid','columns','video','embed','divider','form','input','textarea','select','checkbox','submit']){
  await search.fill(`Add ${kind}`);await expect(dialog.locator(`[data-command="native.add:native:${kind}"]`)).toHaveCount(0);
 }
 await search.fill('Add Feature');await expect(dialog.locator('[data-command="component.add:feature-block"]')).toBeVisible();
 await search.fill('/ Add Div');await expect(dialog.locator('[data-command^="native.add:"]')).toHaveCount(0);
 await page.keyboard.press('Escape');await page.keyboard.press('ControlOrMeta+P');await search.fill('Div');await expect(dialog.locator('[data-command^="native.add:"]')).toHaveCount(0);
 await search.fill('Feature');await dialog.locator('[data-command="component.open:feature-block"]').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).nativePaletteTest.state.opened)).toEqual(['feature.html']);
});
test('native command uses source-safe inside, after and main placement and calls the existing insert seam',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {nativePaletteCommands}=await import('/src/page-builder/palette.ts');const {state,deps}=(window as any).nativePaletteTest;
  await nativePaletteCommands(deps).find(c=>c.id==='native.add:native:heading')!.run();
  state.selection={path:'index.html',node:[0,0],tag:'section'};await nativePaletteCommands(deps).find(c=>c.id==='native.add:native:paragraph')!.run();
  state.selection={path:'index.html',node:[0,0,0],tag:'p'};await nativePaletteCommands(deps).find(c=>c.id==='native.add:native:image')!.run();
  return state.calls;
 });
 expect(result.map((call:any)=>call.point)).toEqual([{path:'index.html',parent:[0],index:1},{path:'index.html',parent:[0,0],index:1},{path:'index.html',parent:[0,0],index:1}]);
 expect(result.map((call:any)=>call.choice.tag)).toEqual(['native:heading','native:paragraph','native:image']);
});
test('captured commands refuse source, selection, path, scope and callback changes with zero writes',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {nativePaletteCommands}=await import('/src/page-builder/palette.ts');const {state,deps}=(window as any).nativePaletteTest;
  for(const change of [()=>state.source+='<footer></footer>',()=>state.revision='scope:2',()=>state.path='other.html',()=>state.selection={path:'index.html',node:[0,0],tag:'section'}]){
   const saved={...state};const command=nativePaletteCommands(deps)[0];change();await command.run();Object.assign(state,saved);
  }
  deps.nativeInsertPoint=()=>{state.revision='scope:3';return{parent:[0],index:1};};await nativePaletteCommands(deps)[0].run();
  return {calls:state.calls,announcements:state.announcements};
 });expect(result.calls).toEqual([]);expect(result.announcements).toHaveLength(5);
});
test('invalid or opaque selection and repaired HTML refuse placement rather than guessing a DOM path',async({page})=>{
 const calls=await page.evaluate(async()=>{
  const {nativePaletteCommands}=await import('/src/page-builder/palette.ts');const {state,deps}=(window as any).nativePaletteTest;
  for(const source of ['<main><p>unclosed</main>','<main><x-card><div></div></x-card></main>']){
   state.source=source;state.selection={path:'index.html',node:[0,0,0],tag:'div'};await nativePaletteCommands(deps)[0].run();
  }return state.calls;
 });expect(calls).toEqual([]);
});

test('repaired main DOM path never inserts into a different source container',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {nativePaletteCommands}=await import('/src/page-builder/palette.ts');const {state,deps}=(window as any).nativePaletteTest;
  state.source='<dl><dt><dd></dd></dt><dd><main></main></dd><dd><div></div></dd><dd><div></div></dd></dl>';
  const document=new DOMParser().parseFromString(state.source,'text/html');
  const names=Array.from(document.querySelector('dl')!.children).map(el=>el.localName);
  await nativePaletteCommands(deps).find(c=>c.id==='native.add:native:heading')!.run();
  return {names,calls:state.calls};
 });expect(result.names).toEqual(['dt','dd','dd','dd','dd']);expect(result.calls).toEqual([]);
});
test('actual commands filter catalogue kinds, place blocks after lists and in main and refuse invalid or foreign host paths',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {nativePaletteCommands}=await import('/src/page-builder/palette.ts');const {state,deps}=(window as any).nativePaletteTest;
  const choices=deps.nativeElements();deps.nativeElements=()=>[...choices,{tag:'native:bogus',label:'Bogus',kind:'native'},{tag:'feature-block',label:'Feature',kind:'component'}];
  const commands=nativePaletteCommands(deps).map(c=>({id:c.id,group:c.group,hint:c.hint,navigation:c.navigation??false}));
  state.source='<main><ul><li>Item</li></ul></main>';state.selection={path:'index.html',node:[0,0],tag:'ul'};
  await nativePaletteCommands(deps).find(c=>c.id==='native.add:native:heading')!.run();
  for(const tag of ['section','div']){state.source='<main></main>';state.selection=undefined;await nativePaletteCommands(deps).find(c=>c.id===`native.add:native:${tag}`)!.run();}
  const validCalls=[...state.calls];state.calls=[];
  state.source='<main><p>unclosed</main>';state.selection=undefined;await nativePaletteCommands(deps).find(c=>c.id==='native.add:native:button')!.run();
  deps.nativeInsertPoint=()=>({path:'other.html',parent:[0],index:0});state.source='<main></main>';state.selection=undefined;await nativePaletteCommands(deps)[0].run();
  return{commands,validCalls,rejectedCalls:state.calls};
 });expect(result.commands).toHaveLength(6);expect(result.commands.every((c:any)=>c.group==='Elements'&&c.hint==='Native HTML'&&!c.navigation)).toBe(true);
 expect(result.validCalls.map((c:any)=>c.point)).toEqual([{path:'index.html',parent:[0],index:1},{path:'index.html',parent:[0],index:0},{path:'index.html',parent:[0],index:0}]);
 expect(result.validCalls.map((c:any)=>c.choice.tag)).toEqual(['native:heading','native:section','native:div']);expect(result.rejectedCalls).toEqual([]);
});
test('throwing host placement reaches palette error handler without insertion',async({page})=>{
 await page.evaluate(()=>{(window as any).nativePaletteTest.deps.nativeInsertPoint=()=>{throw new Error('placement failed');};});
 await page.keyboard.press('ControlOrMeta+K');const dialog=page.getByRole('dialog',{name:'Command palette'});await dialog.getByRole('combobox').fill('Add Div');await dialog.locator('[data-command="native.add:native:div"]').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).nativePaletteTest.state.errors)).toEqual(['Error: placement failed']);
 expect(await page.evaluate(()=>(window as any).nativePaletteTest.state.calls)).toEqual([]);
});
