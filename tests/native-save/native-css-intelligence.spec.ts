import { test, expect } from '@playwright/test';
test.beforeEach(async ({page,baseURL}) => {
  await page.goto(baseURL!);
  await page.evaluate(async () => {
    const api = await import('/src/components/code-editor.ts');
    const {monaco} = await import('/src/components/monaco.ts');
    const host = document.createElement('div'); host.style.height='600px'; document.body.replaceChildren(host);
    const providers: any = {};
    for (const [kind, method] of Object.entries({completion:'registerCompletionItemProvider',hover:'registerHoverProvider',definition:'registerDefinitionProvider'})) {
      const original = (monaco.languages as any)[method].bind(monaco.languages);
      (monaco.languages as any)[method] = (language: string, provider: any) => {providers[kind] ??= provider;return original(language,provider);};
    }
    const state: any = {revision:'A:1',sources:{'current.css':'.card { color: var(--accent); }','theme.css':':root { --accent: red; }','other.css':':root { --accent: blue; }'},opened:[],stale:false};
    const workspace = () => ({revision:state.revision,sources:state.sources,orderedPaths:['theme.css','other.css','current.css'],openDefinition:async(path:string,start:number,end:number,revision:string) => {
      state.opened.push({path,start,end,revision});
      if(state.stale){state.revision='B:1';return true;}
      if(state.mutateSources){state.sources['other.css']=':root {--accent: orange}';}
      if(state.switchMount){dispose();api.mountCodeEditor(host,{key:'css-B',historyScope:'B',path:'current.css',source:state.sources['current.css']});return true;}
      const target=document.createElement('div');target.style.height='200px';document.body.append(target);
      api.mountCodeEditor(target,{key:path,historyScope:'A',path,source:state.sources[path]});return true;
    }});
    const dispose=api.mountCodeEditor(host,{key:'css-intelligence',historyScope:'A',path:'current.css',source:state.sources['current.css'],cssWorkspace:workspace});
    const model=monaco.editor.getModels().find((m:any)=>m.uri.path.endsWith('/current.css'))!;
    const editor=monaco.editor.getEditors().find((e:any)=>e.getModel()===model)!;
    const harness={state,providers,model,editor,monaco,dispose,
      set(text:string,offset:number){model.setValue(text);state.sources['current.css']=text;editor.setPosition(model.getPositionAt(offset));editor.focus();},
      completion(){return providers.completion.provideCompletionItems(model,editor.getPosition());},
      hover(){return providers.hover.provideHover(model,editor.getPosition());},
      definition(){return providers.definition.provideDefinition(model,editor.getPosition());},
    };Object.assign(window,{cssTest:harness});
  });
});
test('real Monaco completion inserts var for a bare value and a bare name in var()',async({page})=>{
  await page.evaluate(()=>{const h=(window as any).cssTest;const text='.card { color: --ac }';h.set(text,text.indexOf('--ac')+4);h.editor.trigger('test','editor.action.triggerSuggest',{});});
  await expect(page.locator('.suggest-widget.visible')).toBeVisible();
  await expect(page.locator('.suggest-widget.visible')).toContainText('--accent');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(()=>(window as any).cssTest.model.getValue())).toContain('var(--accent)');
  for(const text of ['.card {color: var(--ac)}','.card {color: var()}']){
    const items=await page.evaluate(text=>{const h=(window as any).cssTest;h.set(text,text.indexOf(')'));return h.completion().suggestions;},text);
    expect(items.find((item:any)=>item.label==='--accent').insertText).toBe('--accent');
  }
});
test('hover shows every declaration provenance and ignores comment/string tokens',async({page})=>{
  const hover=await page.evaluate(()=>{const h=(window as any).cssTest;h.editor.setPosition(h.model.getPositionAt(h.model.getValue().indexOf('--accent')+3));return h.hover();});
  expect(JSON.stringify(hover)).toContain('theme.css');expect(JSON.stringify(hover)).toContain('other.css');expect(JSON.stringify(hover)).toContain('red');expect(JSON.stringify(hover)).toContain('blue');
  await page.evaluate(()=>{const h=(window as any).cssTest;h.editor.trigger('test','editor.action.showHover',{});});
  await expect(page.locator('.monaco-hover')).toContainText('theme.css');
  for(const text of ['.card {content:"var(--accent)"}', '.card {/*var(--accent)*/color:red}']){
    expect(await page.evaluate(text=>{const h=(window as any).cssTest;h.set(text,text.indexOf('--accent')+3);return h.hover();},text)).toBeUndefined();
  }
});
test('definition opens actual mounted sources and returns all declaration ranges',async({page})=>{
  const result=await page.evaluate(async()=>{const h=(window as any).cssTest;h.editor.setPosition(h.model.getPositionAt(h.model.getValue().indexOf('--accent')+3));const locations=await h.definition();return {opened:h.state.opened,locations:locations.map((l:any)=>({path:l.uri.path,range:l.range}))};});
  expect(result.opened.map((x:any)=>x.path)).toEqual(['theme.css','other.css']);
  expect(result.locations).toHaveLength(2);expect(result.locations[0].path).toContain('theme.css');
  expect(result.locations[0].range.startColumn).toBe(9);
});
test('stale workspace after host await returns no definition; disposed provider cannot bleed',async({page})=>{
  const result=await page.evaluate(async()=>{const h=(window as any).cssTest;h.editor.setPosition(h.model.getPositionAt(h.model.getValue().indexOf('--accent')+3));h.state.stale=true;const location=await h.definition();h.dispose();return {location,completion:h.providers.completion.provideCompletionItems(h.model,{lineNumber:1,column:24}),hover:h.providers.hover.provideHover(h.model,{lineNumber:1,column:24})};});
  expect(result.location).toBeUndefined();expect(result.completion.suggestions).toEqual([]);expect(result.hover).toBeUndefined();
});
test('registered providers reject unrelated models and fresh revisions replace old suggestions',async({page})=>{
  const result=await page.evaluate(()=>{const h=(window as any).cssTest;const unrelated=h.monaco.editor.createModel('.card {color: --ac}','css');const foreign=h.providers.completion.provideCompletionItems(unrelated,{lineNumber:1,column:19});unrelated.dispose();h.state.revision='A:2';h.state.sources['theme.css']=':root{--fresh:green}';delete h.state.sources['other.css'];const text='.card {color: var()}';h.set(text,text.indexOf(')'));return {foreign,names:h.completion().suggestions.map((s:any)=>s.label)};});
  expect(result.foreign.suggestions).toEqual([]);expect(result.names).toEqual(['--fresh']);
});

test('definition cannot return into a replacement mounted scope after the host await',async({page})=>{
  const result=await page.evaluate(async()=>{const h=(window as any).cssTest;h.editor.setPosition(h.model.getPositionAt(h.model.getValue().indexOf('--accent')+3));h.state.switchMount=true;return h.definition();});
  expect(result).toBeUndefined();
});

test('an in-place source change during definition is rejected even if revision was not advanced',async({page})=>{
  const result=await page.evaluate(async()=>{const h=(window as any).cssTest;h.editor.setPosition(h.model.getPositionAt(h.model.getValue().indexOf('--accent')+3));h.state.mutateSources=true;return h.definition();});
  expect(result).toBeUndefined();
});
