import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTags, markStartTags, startTagAttribute, elementEnd, isSectionTemplate, textRangeInSource } from '../shared/html-source';
for(const char of ['\u00a0','\u000b','\ufeff']) {
  test(`non-HTML space ${JSON.stringify(char)} stays in a tag name and unquoted value`,()=>{
    const source=`<SCRIPT${char}><img id="child"></SCRIPT${char}><p data-x=x${char}/></p>`;
    const tags=startTags(source);
    assert.deepEqual(tags.map(tag=>tag.name),[`script${char}`,'img','p']);
    assert.equal(source.slice(tags[0].start+1,tags[0].nameEnd),`SCRIPT${char}`);
    assert.ok(markStartTags(source).includes(`<SCRIPT${char} data-native-src="0">`));
    assert.equal(startTagAttribute(source,tags[2],'data-x')?.value,`x${char}/`);
    assert.equal(elementEnd(`<p>x</p${char}><div>outside</div>`,startTags(`<p>x</p${char}><div>outside</div>`),0,`<p>x</p${char}>`.length),undefined);
    assert.equal(isSectionTemplate(`${char}<section>x</section>`),false);
    assert.equal(isSectionTemplate(`<section>x</section>${char}`),false);
    assert.equal(isSectionTemplate(`<section>x</section${char}>`),false);
  });
}
test('ASCII spaces remain delimiters, blank source and explicit closes',()=>{
  for(const char of ['\t','\n','\f','\r',' ']) {
    assert.equal(startTags(`<SECTION${char}id=x>`)[0].name,'section');
    assert.equal(isSectionTemplate(`${char}<!--quiet--><SECTION>x</SECTION${char}>${char}`),true);
    const source=`<DIV>x</DIV${char}>`;
    assert.equal(elementEnd(source,startTags(source),0,source.length)?.end,source.length);
  }
  assert.equal(elementEnd('<div>x</div/>',startTags('<div>x</div/>'),0,13)?.end,13);
});
test('Unicode tag/attribute case and range lengths match HTML ASCII folding',()=>{
  const source='<X-İ DATA-İ="Exact" data-i="ascii">word</X-İ><p>next</p>';
  const tags=startTags(source);
  assert.deepEqual(tags.map(tag=>tag.name),['x-İ','p']);
  assert.equal(startTagAttribute(source,tags[0],'data-İ')?.value,'Exact');
  assert.equal(startTagAttribute(source,tags[0],'data-i')?.value,'ascii');
  assert.equal(startTagAttribute(source,tags[0],'data-i\u0307'),undefined);
  const range=elementEnd(source,tags,0,tags[1].start)!;
  assert.equal(source.slice(range.start,range.end),'<X-İ DATA-İ="Exact" data-i="ascii">word</X-İ>');
  const mismatch='<X-İ>word</x-i\u0307>';
  assert.equal(elementEnd(mismatch,startTags(mismatch),0,mismatch.length),undefined);
});
test('text selection balance rejects Unicode whitespace/case disguised closing names',()=>{
  for(const char of ['\u00a0','\u000b','\ufeff']) {
    const source=`a<span${char}>b</span>c`;
    assert.equal(textRangeInSource(source,0,3,'abc'),undefined);
  }
  assert.equal(textRangeInSource('a<X-İ>b</x-i\u0307>c',0,3,'abc'),undefined);
  const valid='a<X-İ>b</X-İ>c';
  assert.deepEqual(textRangeInSource(valid,0,3,'abc'),{start:0,end:valid.length});
});

test('component tokenization preserves Unicode names, attribute values and raw closing offsets',async()=>{
  const {parseSource,startTagAttributes}=await import('../src/page-builder/component-model');
  for(const char of ['\u00a0','\u000b','\ufeff']){
    const source=`<X-İ${char} DATA-İ=x${char}/><b>Child</b></X-İ${char}><script>İstanbul</script${char}>not closed</script><p>after</p>`;
    const nodes=parseSource(source).filter(node=>node.type==='element');
    assert.equal(nodes[0].name,`x-İ${char}`);
    assert.deepEqual(startTagAttributes(source,nodes[0].tag).map(a=>[a.name,a.value]),[['data-İ',`x${char}/`]]);
    assert.equal(source.slice(nodes[1].start,nodes[1].end),`<script>İstanbul</script${char}>not closed</script>`);
    assert.equal(source.slice(nodes[2].start,nodes[2].end),'<p>after</p>');
  }
});
test('new pages keep exact Unicode header/footer bytes and genuine closing boundaries',async()=>{
  const {nativePageTemplate,withoutStructuredData}=await import('../src/native-create');
  const source='<html><head><title>İstanbul</title></head><body><header>İstanbul</header><main><p>old</p></main><footer>İstanbul</footer></body></html>';
  const page=nativePageTemplate(source,'New');
  assert.ok(page.includes('<head><title>New</title>'));
  assert.ok(page.includes('<header>İstanbul</header><main>\n</main><footer>İstanbul</footer></body></html>'));
  for(const char of ['\u00a0','\u000b','\ufeff']){
    assert.equal(withoutStructuredData(`<script type="application/ld+json">İ</script${char}>bad</script><p>keep</p>`),'<p>keep</p>');
    assert.ok(nativePageTemplate(source.replace('</main>',`</main${char}>bad</main>`),'New').includes('<main>\n</main><footer>'));
  }
});
test('data-key cleanup removes actual attributes while preserving quoted and Unicode unquoted lookalikes',async()=>{
  const {withoutDataKeys}=await import('../src/page-builder/component-model');
  for(const char of ['\u00a0','\u000b','\ufeff']){
    const html=`<div data-x=a${char}data-key=1 data-key="real" title=" data-key='fake' > text">Value</div><script>"<b data-key='fake'>"</script>`;
    assert.equal(withoutDataKeys(html),html.replace(' data-key="real"',''));
  }
});
test('native document bounds and structured data recognize real end-tag delimiters only',async()=>{
  const {nativePageBody,nativePageWithDetails}=await import('../shared/native-project');
  const {nativePageTemplate,withoutStructuredData}=await import('../src/native-create');
  for(const suffix of ['/>',' foo>','\t>']){
    const html=`<html><head><title>İstanbul</title${suffix}</head${suffix}<body><header>Keep</header><main>old</main><footer>Keep</footer></body${suffix}</html${suffix}`;
    assert.equal(html.slice(nativePageBody(html).start,nativePageBody(html).end),'<header>Keep</header><main>old</main><footer>Keep</footer>');
    assert.ok(nativePageTemplate(html,'New').includes('<main>\n</main><footer>Keep</footer>'));
    assert.equal(withoutStructuredData(`<script type="application/ld+json">İ</script${suffix}<p>keep</p>`),'<p>keep</p>');
  }
  for(const char of ['\u00a0','\u000b','\ufeff']){
    const html=`<head><title>İ</title${char}>still title</title></head><body>body</body${char}>still body</body>`;
    assert.equal(html.slice(nativePageBody(html).start,nativePageBody(html).end),`body</body${char}>still body`);
    const updated=nativePageWithDetails(html,{title:'New',description:''});
    assert.ok(updated.includes('<title>New</title></head>'));
  }
});
test('production fallback fill and insertion preserve attributes, raw text and Unicode spacing',async()=>{
  const {fillMarkup,fillInsertEdit,templateSlots,readInstance,parseSource}=await import('../src/page-builder/component-model');
  const fallback='<div data-x=" two  spaces\r\nnext " data-y=a\u00a0data-key=1 data-key="remove"><pre> a  b\r\n c </pre><textarea> a  b\r\n c </textarea><script>let x = " a  b ";\r\n// exact</script><style>.a { content: " a  b "; }</style></div>';
  const template=`<slot name="body">${fallback}</slot>`,slots=templateSlots(template),markup=fillMarkup(template,slots[0]);
  assert.equal(markup,fallback.replace('<div','<div slot="body"').replace(' data-key="remove"',''));
  const page='<x-card></x-card>',range=parseSource(page)[0];assert.equal(range.type,'element');if(range.type!=='element')return;
  const edit=fillInsertEdit(page,readInstance(page,range),slots,'body',markup)!;
  const output=page.slice(0,edit.start)+edit.text+page.slice(edit.end);
  assert.ok(output.includes(markup));
  const multi='<slot name="body"><pre> a  b\n c </pre>\r\n <!-- exact --> <textarea> d  e </textarea></slot>';
  assert.equal(fillMarkup(multi,templateSlots(multi)[0]),'<pre slot="body"> a  b\n c </pre>\r\n <!-- exact --> <textarea slot="body"> d  e </textarea>');
  for(const text of ['\u00a0',' &nbsp;  x\u00a0 ','a  b\r\n c']){
    const source=`<slot>${text}</slot>`;
    assert.equal(fillMarkup(source,templateSlots(source)[0]),text.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g,''));
  }
});

test('elementEnd fails closed on an end tag written in a comment, raw text, an attribute or after <plaintext>',()=>{
  for(const source of['<div><!-- </div> --></div>','<div><style>p::after{content:"</div>"}</style></div>','<div><textarea></div></textarea></div>',
    '<div><span title="</div>"></span></div>','<head><meta content="</head>"><!-- </head> --></head>','<div><plaintext></div></plaintext></div>',
    '<head><script><!--<script></head></script><title>X</title></head>','<div>A</section></div>','<div><p>A</span></p></div>'])
    assert.equal(elementEnd(source,startTags(source),0,source.length),undefined,source);
  const own='<style>/* <!-- */</style>';
  assert.equal(elementEnd(own,startTags(own),0,own.length)?.end,own.length);
  const plain='<div><style>p{}</style><!-- c --><b class="x">y</b></div>';
  assert.equal(elementEnd(plain,startTags(plain),0,plain.length)?.end,plain.length);
});
