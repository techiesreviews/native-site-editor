import { test, expect } from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/tests/fixtures/html-boundaries.html');await expect(page.locator('#fixture')).toHaveText('Real DOM parser checks');});
for(const [label,char] of [['NBSP','\u00a0'],['VT','\u000b'],['BOM','\ufeff']]) test(`${label} tag names map annotations to actual DOM elements rather than false raw-text tags`,async({page})=>{
  const result=await page.evaluate(async(char)=>{
    const api=await import('/shared/html-source.ts');
    const source=`<SCRIPT${char} id="outer"><img id="child"></SCRIPT${char}><p id="after" data-x=x${char}/></p>`;
    const tags=api.startTags(source), marked=api.markStartTags(source,tags), parsed=document.createElement('template');parsed.innerHTML=marked;
    return {names:tags.map(tag=>tag.name),elements:[...parsed.content.querySelectorAll('*')].map(el=>({name:el.localName,id:el.id,annotation:el.getAttribute(api.MARK),value:el.getAttribute('data-x')})),value:api.startTagAttribute(source,tags[2],'data-x')?.value};
  },char);
  expect(result.names).toEqual([`script${char}`,'img','p']);
  expect(result.elements.map(el=>el.name)).toEqual(result.names);
  expect(result.elements.map(el=>el.annotation)).toEqual(['0','1','2']);
  expect(result.elements.map(el=>el.id)).toEqual(['outer','child','after']);
  expect(result.elements[2].value).toBe(`x${char}/`);expect(result.value).toBe(result.elements[2].value);
});
test('Unicode case folding preserves actual DOM names and exact source ranges',async({page})=>{
  const result=await page.evaluate(async()=>{
    const api=await import('/shared/html-source.ts');const source='<X-İ DATA-İ="Exact" data-i="ascii">word</X-İ><p>after</p>';
    const tags=api.startTags(source), parsed=document.createElement('template');parsed.innerHTML=api.markStartTags(source,tags);
    const node=parsed.content.firstElementChild!,range=api.elementEnd(source,tags,0,tags[1].start);
    return {name:node.localName,sourceName:tags[0].name,domAttribute:node.getAttribute('data-İ'),sourceAttribute:api.startTagAttribute(source,tags[0],'data-İ')?.value,range:range&&source.slice(range.start,range.end),annotation:node.getAttribute(api.MARK),nextAnnotation:node.nextElementSibling?.getAttribute(api.MARK)};
  });
  expect(result).toEqual({name:'x-İ',sourceName:'x-İ',domAttribute:'Exact',sourceAttribute:'Exact',range:'<X-İ DATA-İ="Exact" data-i="ascii">word</X-İ>',annotation:'0',nextAnnotation:'1'});
});
test('Unicode end-name delimiters refuse ranges while ASCII end delimiters agree with DOM',async({page})=>{
  const result=await page.evaluate(async()=>{
    const api=await import('/shared/html-source.ts');
    return ['\u00a0','\u000b','\ufeff',' ','\t'].map(char=>{const source=`<div id="outer"><span>Inside</span></div${char}><p id="after">After</p>`;const tags=api.startTags(source),parsed=document.createElement('template');parsed.innerHTML=source;const outer=parsed.content.querySelector('#outer')!,after=parsed.content.querySelector('#after')!,range=api.elementEnd(source,tags,0,tags[2].start);return {char,containsAfter:outer.contains(after),range:range&&source.slice(range.start,range.end)};});
  });
  for(const item of result.slice(0,3)){expect(item.containsAfter).toBe(true);expect(item.range).toBeUndefined();}
  for(const item of result.slice(3)){expect(item.containsAfter).toBe(false);expect(item.range).toContain('</div');}
});
test('section classification respects real nonblank Unicode text around the element',async({page})=>{
  const result=await page.evaluate(async()=>{
    const api=await import('/shared/html-source.ts');return ['\u00a0','\u000b','\ufeff',' ','\t'].map(char=>{const source=`${char}<section>Text</section>${char}`,parsed=document.createElement('template');parsed.innerHTML=source;return {char,text:[...parsed.content.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(''),section:api.isSectionTemplate(source)};});
  });
  for(const item of result.slice(0,3)){expect(item.text).toBe(item.char+item.char);expect(item.section).toBe(false);}
  for(const item of result.slice(3))expect(item.section).toBe(true);
});
test('component ranges and new page output match real Unicode DOM parsing',async({page})=>{
  const result=await page.evaluate(async()=>{
    const {parseSource,startTagAttributes}=await import('/src/page-builder/component-model.ts');
    const {nativePageTemplate}=await import('/src/native-create.ts');
    const source='<X-İ DATA-İ=x\u00a0/><b>Child</b></X-İ><script>İstanbul</script\u00a0>still raw</script><p>after</p>';
    const root=document.createElement('template');root.innerHTML=source;
    const nodes=parseSource(source).filter(n=>n.type==='element');
    const home='<html><head><title>İstanbul</title></head><body><header>İstanbul</header><main><p>old</p></main><footer>İstanbul</footer></body></html>';
    const output=nativePageTemplate(home,'New');const doc=new DOMParser().parseFromString(output,'text/html');
    return {names:nodes.map(n=>n.name),domNames:[...root.content.children].map(n=>n.localName),attributes:startTagAttributes(source,nodes[0].tag).map(a=>[a.name,a.value]),domValue:root.content.firstElementChild!.getAttribute('data-İ'),raw:source.slice(nodes[1].tag.end,nodes[1].close!.start),domRaw:root.content.querySelector('script')!.textContent,output,title:doc.title,header:doc.querySelector('header')!.textContent,footer:doc.querySelector('footer')!.textContent,main:doc.querySelector('main')!.textContent};
  });
  expect(result.names).toEqual(result.domNames);expect(result.attributes).toEqual([['data-İ',result.domValue]]);expect(result.domValue).toBe('x\u00a0/');expect(result.raw).toBe(result.domRaw);
  expect(result.title).toBe('New');expect(result.header).toBe('İstanbul');expect(result.footer).toBe('İstanbul');expect(result.main).toBe('\n');expect(result.output).toContain('</main><footer>İstanbul</footer></body></html>');
});
test('attribute cleanup and native end tags agree with actual DOM source values',async({page})=>{
  const result=await page.evaluate(async()=>{
    const {withoutDataKeys}=await import('/src/page-builder/component-model.ts');
    const {nativePageBody,nativePageWithDetails}=await import('/shared/native-project.ts');
    const {nativePageTemplate,withoutStructuredData}=await import('/src/native-create.ts');
    const html='<div data-x=a\u00a0data-key=1 data-key="real" title=" data-key=quoted > still">Value</div>';
    const cleaned=withoutDataKeys(html);const parse=(s:string)=>new DOMParser().parseFromString(s,'text/html');
    const before=parse(html).querySelector('div')!,after=parse(cleaned).querySelector('div')!;
    const home='<html><head><title>İstanbul</title/><meta name="keep" content="Exact"></head foo><body><header>İstanbul</header><main>old</main><footer>Exact</footer></body/><html>';
    const output=nativePageTemplate(home,'New');const doc=parse(output);
    const fake='<head><title>Old</title\u00a0>still title</title></head><body>body</body\u00a0>still body</body>';
    const range=nativePageBody(fake),updated=nativePageWithDetails(fake,{title:'New',description:''});
    return{cleaned,values:[before.getAttribute('data-x'),after.getAttribute('data-x')],titles:[before.title,after.title],key:after.hasAttribute('data-key'),title:doc.title,meta:doc.querySelector('meta[name="keep"]')!.getAttribute('content'),header:doc.querySelector('header')!.textContent,footer:doc.querySelector('footer')!.textContent,main:doc.querySelector('main')!.textContent,body:fake.slice(range.start,range.end),domBody:parse(fake).body.textContent,updatedTitle:parse(updated).title,json:withoutStructuredData('<script type="application/ld+json">İ</script foo><p>keep</p>')};
  });
  expect(result.values).toEqual(['a\u00a0data-key=1','a\u00a0data-key=1']);expect(result.titles[0]).toBe(result.titles[1]);expect(result.key).toBe(false);
  expect(result.title).toBe('New');expect(result.meta).toBe('Exact');expect(result.header).toBe('İstanbul');expect(result.footer).toBe('Exact');expect(result.main).toBe('\n');
  expect(result.body).toBe('body</body\u00a0>still body');expect(result.domBody).toBe('bodystill body');expect(result.updatedTitle).toBe('New');expect(result.json).toBe('<p>keep</p>');
});
test('real fallback fill insertion retains attribute values and raw element content',async({page})=>{
  const result=await page.evaluate(async()=>{
    const api=await import('/src/page-builder/component-model.ts');
    const fallback='<div data-x=" two  spaces\r\nnext " data-y=a\u00a0data-key=1 data-key="remove"><pre> a  b\r\n c </pre><textarea> a  b\r\n c </textarea><script>let x = " a  b ";\r\n// exact</script><style>.a { content: " a  b "; }</style></div>';
    const template=`<slot name="body">${fallback}</slot>`,slots=api.templateSlots(template),markup=api.fillMarkup(template,slots[0]);
    const source='<x-card></x-card>',range=api.parseSource(source)[0];if(range.type!=='element')throw Error('range');
    const edit=api.fillInsertEdit(source,api.readInstance(source,range),slots,'body',markup)!;const output=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
    const parse=(text:string)=>{const root=document.createElement('template');root.innerHTML=text;const div=root.content.querySelector('div')!;return{attr:div.getAttribute('data-x'),unquoted:div.getAttribute('data-y'),pre:div.querySelector('pre')!.textContent,textarea:div.querySelector('textarea')!.value,script:div.querySelector('script')!.textContent,style:div.querySelector('style')!.textContent,key:div.hasAttribute('data-key'),slot:div.getAttribute('slot')};};
    const nbsp='<slot>\u00a0</slot>';
    return{before:parse(fallback),after:parse(output),markup,expected:fallback.replace('<div','<div slot="body"').replace(' data-key="remove"',''),output,nbsp:api.fillMarkup(nbsp,api.templateSlots(nbsp)[0])};
  });
  expect(result.markup).toBe(result.expected);expect(result.output).toContain(result.markup);
  expect(result.after).toEqual({...result.before,key:false,slot:'body'});expect(result.after.attr).toBe(' two  spaces\nnext ');expect(result.after.unquoted).toBe('a\u00a0data-key=1');expect(result.after.pre).toBe(' a  b\n c ');expect(result.after.textarea).toBe(' a  b\n c ');expect(result.nbsp).toBe('\u00a0');
});
