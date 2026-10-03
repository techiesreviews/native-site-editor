import { test, expect, type Page } from '@playwright/test';
const hash='#repo=501&branch=main&file=index.html';
async function load(page:Page,baseURL:string|undefined){await page.goto(`${baseURL}/${hash}`);await expect(page.frameLocator('.native-preview-frame').locator('.hero h1')).toBeVisible();await expect(page.locator('#content .monaco-editor')).toBeVisible();}
async function sourceViewport(page:Page){const editor=page.locator('#content .monaco-editor');await expect(editor).toBeVisible();expect((await editor.boundingBox())!.height).toBeGreaterThanOrEqual(48);await expect(page.locator('#content .view-line').first()).toBeVisible();}
async function moveGrip(page:Page,dy:number){const grip=page.locator('.code-resize');const b=(await grip.boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2+dy,{steps:8});await page.mouse.up();}
test('old collapsed persistence restores to a readable minimum and remembers the prior height',async({page,baseURL})=>{
  await page.addInitScript(()=>{localStorage.setItem('astro-editor.code-height',JSON.stringify({height:0.35,collapsed:true}));});
  await load(page,baseURL);const grip=page.locator('.code-resize');
  await expect(grip).toHaveAttribute('aria-valuetext',/Code minimized/);await sourceViewport(page);
  const minimum=Number(await grip.getAttribute('aria-valuemin'));expect(minimum).toBeGreaterThanOrEqual(96);
  await expect(grip).toHaveAttribute('aria-valuenow',String(minimum));
  const mainHeight=await page.locator('#main').evaluate(el=>el.clientHeight);
  await grip.click();
  await expect.poll(async()=>Number(await grip.getAttribute('aria-valuenow'))).toBe(Math.round(Math.min(mainHeight-120,Math.max(minimum,mainHeight*0.35))));
  await sourceViewport(page);
});
test('drag below minimum and Home keep source visible; Enter restores the remembered height',async({page,baseURL})=>{
  await load(page,baseURL);const grip=page.locator('.code-resize');
  await grip.focus();await page.keyboard.press('Shift+ArrowUp');const before=Number(await grip.getAttribute('aria-valuenow'));
  await moveGrip(page,600);await expect(grip).toHaveAttribute('aria-valuetext',/Code minimized/);await sourceViewport(page);
  await grip.focus();await page.keyboard.press('Enter');await expect(grip).toHaveAttribute('aria-valuenow',String(before));
  await page.keyboard.press('Home');await sourceViewport(page);await expect(grip).toHaveAttribute('aria-valuetext',/Code minimized/);
  await page.keyboard.press(' ');await expect(grip).toHaveAttribute('aria-valuenow',String(before));
});
test('minimization retains the real Monaco model, cursor, draft and Undo/Redo',async({page,baseURL})=>{
  await load(page,baseURL);
  const before=await page.evaluate(async()=>{const api=await import('/src/components/code-editor.ts');const {monaco}=await import('/src/components/monaco.ts');const model=monaco.editor.getModels().find(m=>m.uri.path.endsWith('/index.html'))!;const editor=monaco.editor.getEditors().find(e=>e.getModel()===model)!;const original=model.getValue();const at=original.indexOf('A native browser preview');api.replaceActiveRange({path:'index.html',start:at,end:at+24,expected:original.slice(at,at+24),text:'Visible source survives'});editor.setPosition(model.getPositionAt(at+5));const saved={uri:model.uri.toString(),version:model.getAlternativeVersionId(),position:editor.getPosition(),text:model.getValue(),original};Object.assign(window,{visibleCode:{api,model,editor,saved}});return saved;});
  await page.locator('.code-resize').click();await sourceViewport(page);
  const after=await page.evaluate(()=>{const h=(window as any).visibleCode;return{uri:h.model.uri.toString(),version:h.model.getAlternativeVersionId(),position:h.editor.getPosition(),text:h.model.getValue()};});
  expect(after).toEqual({uri:before.uri,version:before.version,position:before.position,text:before.text});
  expect(await page.evaluate(()=>(window as any).visibleCode.api.runVisualHistory('undo','index.html'))).toBe(true);
  expect(await page.evaluate(()=>(window as any).visibleCode.model.getValue())).toBe(before.original);
  expect(await page.evaluate(()=>(window as any).visibleCode.api.runVisualHistory('redo','index.html'))).toBe(true);
  expect(await page.evaluate(()=>(window as any).visibleCode.model.getValue())).toBe(before.text);
  await sourceViewport(page);
});
test('palette says Minimize/Restore code and both actions retain visible source',async({page,baseURL})=>{
  await load(page,baseURL);const palette=page.getByRole('dialog',{name:'Command palette'});
  await page.keyboard.press('ControlOrMeta+K');await palette.getByRole('combobox',{name:'Search commands'}).fill('Minimize code');
  await expect(palette.getByRole('option',{name:/Minimize code/})).toBeVisible();await expect(palette.getByRole('option',{name:/Hide code/})).toHaveCount(0);
  await page.keyboard.press('Enter');await expect(palette).toBeHidden();await sourceViewport(page);
  await page.keyboard.press('ControlOrMeta+K');await palette.getByRole('combobox',{name:'Search commands'}).fill('Restore code');await expect(palette.getByRole('option',{name:/Restore code/})).toBeVisible();await page.keyboard.press('Enter');await sourceViewport(page);
});
test('narrow short viewport retains both source surfaces, a usable canvas and restoration controls',async({page,baseURL})=>{
  await page.setViewportSize({width:390,height:650});await load(page,baseURL);
  await page.locator('.code-resize').click();await sourceViewport(page);
  expect((await page.locator('.native-preview-frame').boundingBox())!.height).toBeGreaterThanOrEqual(48);
  const width=page.locator('.code-width-resize');await expect(width).toBeVisible();await width.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#content-secondary .monaco-editor')).toBeVisible();expect((await page.locator('#content-secondary .monaco-editor').boundingBox())!.width).toBeGreaterThan(20);
  await expect(width).toHaveAttribute('aria-valuetext',/Side-by-side pane minimized/);await page.keyboard.press('Enter');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  for(const selector of ['#content .monaco-editor','#content-secondary .monaco-editor']){const box=(await page.locator(selector).boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(391);}
  await sourceViewport(page);
});
