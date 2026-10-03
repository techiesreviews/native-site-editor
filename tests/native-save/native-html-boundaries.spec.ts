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
