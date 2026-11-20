// One owned browser, serial local-file checks. Screenshots are runtime artifacts outside git.
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const folder=dirname(fileURLToPath(import.meta.url));
const out=resolve(folder,'../../../.scratch/ux-round2');mkdirSync(out,{recursive:true});
const files=readdirSync(join(folder,'prototypes')).filter(f=>/^\d\d-.*\.html$/.test(f)).sort();
const capture={'01-row-menu.html': 1, '02-link-popup.html': 1, '03-canvas-page.html': 0, '04-media-details.html': 3, '05-clean-paste.html': 1, '06-unique-anchors.html': 2, '07-multi-select.html': 1, '08-command-search.html': 2, '09-shared-change.html': 2, '10-client-bar.html': 2, '11-style-source.html': 1};
const browser=await chromium.launch({headless:true});
let count=0,keyboardCount=0;
async function tabTo(page,selector){for(let i=0;i<100;i++){if(await page.locator(selector).evaluate(el=>el===document.activeElement))return;await page.keyboard.press('Tab');}throw Error('Tab could not reach '+selector);}
const value=(page,expression)=>page.evaluate(expression);
try {
 const page=await browser.newPage();
 await page.route(/^https?:/,route=>{remote.push(route.request().url());return route.abort();});
 let errors=[],remote=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 for(const width of [1440,390])for(const theme of ['light','dark'])for(const mode of ['today','after'])for(const file of files){
  errors=[];remote=[];await page.setViewportSize({width,height:width===390?844:1000});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  await page.goto(new URL('./prototypes/'+file,import.meta.url).href);
  await page.locator(`[data-mode-set="${mode}"]`).click();await page.locator(`[data-theme-set="${theme}"]`).click();
  assert.ok(await page.locator('[role=treeitem]').count()>=15,file+' real nested tree');
  assert.ok(await page.locator('.site .site-photo svg').count()>0,file+' real site image');
  assert.ok(await page.locator('#site footer').count()>0,file+' footer');
  const steps=await page.locator('[data-step]').count();assert.ok(steps>=3&&steps<=6);
  for(let step=0;step<steps;step++){
   await page.locator(file==='04-media-details.html'&&await page.locator('#media-dialog').evaluate(el=>el.open)?`#media-dialog [data-play="${step}"]`:`[data-step="${step}"]`).click();
   if(file==='01-row-menu.html'&&step===1){assert.equal(await page.getByRole('menuitem',{name:'Duplicate',exact:true}).count(),mode==='after'?1:0);}
   if(file==='02-link-popup.html'&&step===1){const words=await page.locator('#site [data-node="p1"]').boundingBox(),popup=await page.locator('#popup').boundingBox();assert.ok(words&&popup);const overlap=popup.y<words.y+words.height&&popup.y+popup.height>words.y;assert.equal(overlap,mode==='today',file+' link overlap');}
   if(file==='03-canvas-page.html'&&step===0){assert.equal(await page.locator('#page-name').textContent(),mode==='after'?'About':'Home');assert.equal(await page.locator('#source-title').textContent(),'index.html');}
   if(file==='04-media-details.html'&&step===4&&mode==='after'){assert.equal(await page.locator('#description').inputValue(),'Saved bread illustration');assert.ok(await page.locator('#discard-details').isDisabled());}
   if(file==='04-media-details.html'&&step===3){assert.equal(await page.locator('#description').inputValue(),mode==='after'?'Unfinished description':'Saved bread illustration');if(width===1440&&mode==='after'){const a=await page.locator('#description').boundingBox(),b=await page.locator('.media-stage').boundingBox();assert.ok(a.y<b.y+150,'desktop fields near top');}}
   if(file==='05-clean-paste.html'&&step===1){assert.equal(await page.locator('#site [data-node="p1"] li').count(),mode==='after'?2:0);assert.equal(await page.locator('#site [data-node="p1"] [style]').count(),0);}
   if(file==='06-unique-anchors.html'&&step===2){const anchors=await page.locator('#site [id^="work"]').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(anchors.length,3);assert.equal(new Set(anchors).size,mode==='after'?3:1);}
   if(file==='07-multi-select.html'&&step===0){assert.equal(await page.locator('[role=treeitem][aria-selected="true"]').count(),mode==='after'?2:1);}
   if(file==='07-multi-select.html'&&step===1&&mode==='after')assert.equal(await page.locator('#site .site-wrap').count(),1);
   if(file==='07-multi-select.html'&&step===2&&mode==='after')assert.equal(await page.locator('#site .site-wrap').count(),0);
   if(file==='07-multi-select.html'&&step===4&&mode==='after'){const levels=await page.locator('[role=treeitem][aria-selected="true"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-level')));assert.equal(new Set(levels).size,2);assert.ok(await page.locator('#wrap').isDisabled());}
   if(file==='08-command-search.html'&&step===2){if(mode==='after')assert.equal(await page.locator('[role=treeitem][aria-selected="true"]').getAttribute('data-id'),'p1');else assert.equal(await page.locator('#command-results [role=option]').count(),0);}
   if(file==='09-shared-change.html'&&step===2&&mode==='after'){assert.equal(await page.locator('#page-name').textContent(),'About');assert.ok(await page.locator('#popup').isVisible());}
   if(file==='10-client-bar.html'&&step===1&&mode==='after'){assert.ok(await page.locator('#app').evaluate(el=>el.classList.contains('client-view')));assert.equal(await page.locator('#edit-image').count(),1);}
   if(file==='11-style-source.html'&&mode==='after'&&step===2)assert.equal(await page.locator('#padding-value').textContent(),'32 px');
   if(file==='11-style-source.html'&&mode==='after'&&step===3)assert.equal(await page.locator('#padding-value').textContent(),'24 px');
   if(step===capture[file])await page.screenshot({path:join(out,`${file.slice(0,-5)}-${width}-${theme}-${mode}.png`),fullPage:true});
   assert.deepEqual(errors,[],file+' console errors');assert.deepEqual(remote,[],file+' external requests');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),file+' horizontal overflow');
  }
  await page.keyboard.press('Escape');
  count++;
  if(mode==='after'){
   await page.locator('[data-restart]').click();
   if(file==='01-row-menu.html'){await tabTo(page,'#side [data-id="sec2"]');await page.keyboard.press('Shift+F10');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await page.locator('#site [data-node^="sec2-copy-"]').count(),1);await page.keyboard.press('Shift+F10');await tabTo(page,'[data-menu-action="remove"]');await page.keyboard.press('Enter');await tabTo(page,'#popup [data-remove]');await page.keyboard.press('Enter');assert.equal(await page.locator('#site [data-node^="sec2-copy-"]').count(),0);const hit=await page.locator('#side [data-act="attrs"]').first().boundingBox();assert.ok(hit&&hit.width>=(width===390?44:24)&&hit.height>=(width===390?44:24));}
   if(file==='02-link-popup.html'){await page.keyboard.press('Control+k');await page.keyboard.press('Control+a');await page.keyboard.type('/about/');await page.keyboard.press('Enter');assert.equal(await page.locator('#site [data-node="p1"] a').getAttribute('href'),'/about/');}
   if(file==='03-canvas-page.html'){await tabTo(page,'#site [data-route="About"]');await page.keyboard.press('Enter');assert.equal(await page.locator('#page-name').textContent(),'About');await tabTo(page,'#site [data-node="h1"]');await page.keyboard.press('Enter');assert.equal(await page.locator('#source-title').textContent(),'about.html');}
   if(file==='04-media-details.html'){await tabTo(page,'#media-trigger');await page.keyboard.press('Enter');await tabTo(page,'#open-bread');await page.keyboard.press('Enter');await tabTo(page,'#description');await page.keyboard.press('Control+a');await page.keyboard.type('Keyboard draft');await tabTo(page,'#media-back');await page.keyboard.press('Enter');await tabTo(page,'#open-bread');await page.keyboard.press('Enter');assert.equal(await page.locator('#description').inputValue(),'Keyboard draft');await tabTo(page,'#collection');await page.keyboard.press('w');await page.keyboard.press('Enter');await tabTo(page,'#save-details');await page.keyboard.press('Enter');await tabTo(page,'#media-back');await page.keyboard.press('Enter');await tabTo(page,'#open-bread');await page.keyboard.press('Enter');assert.equal(await page.locator('#description').inputValue(),'Keyboard draft');assert.equal(await page.locator('#collection').inputValue(),'Work');await page.keyboard.press('Escape');}
   if(file==='05-clean-paste.html'){await tabTo(page,'#site [data-node="p1"]');await page.locator('#site [data-node="p1"]').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el.querySelector('p'));range.collapse(false);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);const clipboardData=new DataTransfer();clipboardData.setData('text/html','<p style="font-family:serif">New <b>copy</b></p><ul><li>One</li><li>Two</li></ul>');clipboardData.setData('text/plain','New copy One Two');el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));});assert.match(await page.locator('#site [data-node="p1"]').innerText(),/Baked before sunrise/);assert.equal(await page.locator('#site [data-node="p1"] li').count(),2);await page.keyboard.press('Control+z');assert.equal(await page.locator('#site [data-node="p1"] li').count(),0);}
   if(file==='06-unique-anchors.html'){await tabTo(page,'#duplicate-section');await page.keyboard.press('Enter');assert.equal(await page.locator('#anchor-name').inputValue(),'work-2');}
   if(file==='07-multi-select.html'){await tabTo(page,'#side [data-id="h1"]');await page.keyboard.press('Shift+ArrowDown');await page.keyboard.press('Control+c');assert.ok(await page.evaluate(()=>document.activeElement.hasAttribute('data-id')));await page.keyboard.press('Control+v');assert.equal(await page.locator('#site [data-node*="-paste-"]').count(),2);await tabTo(page,'#wrap');await page.keyboard.press('Enter');assert.equal(await page.locator('#site .site-wrap').count(),1);}
   if(file==='08-command-search.html'){await page.keyboard.press('Control+k');await page.keyboard.type('Find Baked before');await page.keyboard.press('Enter');assert.equal(await page.locator('[role=treeitem][aria-selected="true"]').getAttribute('data-id'),'p1');}
   if(file==='09-shared-change.html'){await tabTo(page,'#brand-name');await page.keyboard.press('Control+a');await page.keyboard.type('Keyboard Bakery');await tabTo(page,'#save-shared');await page.keyboard.press('Enter');await tabTo(page,'[data-affected="About"]');await page.keyboard.press('Enter');assert.equal(await page.locator('#page-name').textContent(),'About');await tabTo(page,'#save-both');await page.keyboard.press('Enter');assert.equal(await page.locator('#save-shared').textContent(),'Saved on both pages');}
   if(file==='10-client-bar.html'){await tabTo(page,'#client-toggle');await page.keyboard.press('Enter');await tabTo(page,'#edit-text');await page.keyboard.press('Enter');await page.keyboard.press('Control+a');await page.keyboard.type('A client heading');await page.keyboard.press('Enter');assert.equal(await page.locator('#site [data-node="h1"]').textContent(),'A client heading');await tabTo(page,'#edit-image');await page.keyboard.press('Enter');await tabTo(page,'[data-image="garden"]');await page.keyboard.press('Enter');assert.equal(await page.locator('#site [data-node="img"] svg').getAttribute('aria-label'),'Bakery garden');}
   if(file==='11-style-source.html'){await tabTo(page,'#padding-source');await page.keyboard.press('Enter');await tabTo(page,'[data-reset-style="screen"]');await page.keyboard.press('Enter');assert.equal(await page.locator('#padding-value').textContent(),'32 px');}
   keyboardCount++;
   assert.deepEqual(errors,[],file+' keyboard console errors');
   await page.keyboard.press('Escape');
  }
  console.log(`${file} ${width} ${theme} ${mode}: steps, state and overflow passed`);
 }
 console.log(`RESULT: ok prototype-browser ${count} comparison states; ${keyboardCount} keyboard flows; screenshots ${out}`);
} finally {await browser.close();}
