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
