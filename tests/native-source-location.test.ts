import assert from "node:assert/strict";
import test from "node:test";
import { elementEnd, markStartTags, startTagAttribute, startTags, textRangeInSource } from "../src/native-source-location.ts";

test("start tags skip comments, end tags and raw text content", () => {
  const html = `<!-- <b> --><p class="a>b">x</p><style>p > <i> {}</style><br/><script>if (a<b) "<em>"</script><em>y</em>`;
  const tags = startTags(html);
  assert.deepEqual(tags.map((tag) => tag.name), ["p", "style", "br", "script", "em"]);
  for (const tag of tags) {
    assert.equal(html[tag.start], "<");
    assert.equal(html[tag.end - 1], ">");
  }
  assert.equal(html.slice(tags[0].start, tags[0].end), `<p class="a>b">`);
});

test("marking inserts an index attribute after each tag name", () => {
  assert.equal(
    markStartTags(`<main class="x">\n  <h1>Hi</h1>\n</main>`),
    `<main data-native-src="0" class="x">\n  <h1 data-native-src="1">Hi</h1>\n</main>`,
  );
});

test("element end finds the matching end tag past same-named descendants", () => {
  const html = `<div><p>a</p><div><div>b</div></div><span>c</span></div><p>d</p>`;
  const tags = startTags(html);
  const outer = elementEnd(html, tags, 0, tags[5].start)!;
  assert.equal(html.slice(outer.start, outer.end), `<div><p>a</p><div><div>b</div></div><span>c</span></div>`);
  assert.equal(html.slice(outer.close!.start, outer.close!.end), "</div>");
  const inner = elementEnd(html, tags, 2, tags[4].start)!;
  assert.equal(html.slice(inner.start, inner.end), `<div><div>b</div></div>`);
  const heading = `<h2 class="x">Title</h2 >\n<p>x</p>`;
  const headingTags = startTags(heading);
  assert.equal(heading.slice(0, elementEnd(heading, headingTags, 0, headingTags[1].start)!.end), `<h2 class="x">Title</h2 >`);
});

test("element end is the start tag for void elements and fails closed for implied ends", () => {
  const html = `<ul><li>one<li>two</ul><br><p>x`;
  const tags = startTags(html);
  assert.equal(elementEnd(html, tags, 1, tags[2].start), undefined);
  assert.equal(elementEnd(html, tags, 2, tags[3].start), undefined);
  const br = elementEnd(html, tags, 3, tags[4].start)!;
  assert.equal(html.slice(br.start, br.end), "<br>");
  assert.equal(br.close, undefined);
  assert.equal(elementEnd(html, tags, 4, html.length), undefined);
  // A stray end tag cannot be told apart from the real one.
  const stray = `<p>a</p></p><p>b</p>`;
  const strayTags = startTags(stray);
  assert.equal(elementEnd(stray, strayTags, 0, strayTags[1].start), undefined);
});

test("start tag attributes are located with their values", () => {
  const html = `<p class="lead" style="color: red; font-size: 1rem" data-x hidden='y'>t</p>`;
  const [tag] = startTags(html);
  const style = startTagAttribute(html, tag, "style")!;
  assert.equal(style.value, "color: red; font-size: 1rem");
  assert.equal(html.slice(style.valueStart, style.valueEnd), style.value);
  assert.equal(html.slice(style.start, style.end), ` style="color: red; font-size: 1rem"`);
  assert.equal(startTagAttribute(html, tag, "data-x")!.value, "");
  assert.equal(html.slice(startTagAttribute(html, tag, "hidden")!.valueStart, startTagAttribute(html, tag, "hidden")!.valueEnd), "y");
  assert.equal(startTagAttribute(html, tag, "id"), undefined);
  assert.equal(startTagAttribute(html, tag, "lass"), undefined);
});

test("text offsets map to source offsets across tags and entities", () => {
  const inner = `Edit <em>plain</em> HTML &amp; CSS<br>now`;
  // "plain" sits at text 5..10, inside the em.
  assert.deepEqual(textRangeInSource(inner, 5, 10, "plain"), { start: 9, end: 14 });
  // "HTML & CSS" spans the entity: text 11..21.
  const span = textRangeInSource(inner, 11, 21, "HTML & CSS")!;
  assert.equal(inner.slice(span.start, span.end), "HTML &amp; CSS");
  // "now" after the void br.
  assert.equal(inner.slice(textRangeInSource(inner, 21, 24, "now")!.start), "now");
  // A whole element inside the span is fine; a span cutting through a tag is not.
  const whole = textRangeInSource(inner, 0, 11, "Edit plain ")!;
  assert.equal(inner.slice(whole.start, whole.end), "Edit <em>plain</em> ");
  assert.equal(textRangeInSource(inner, 3, 7, "t pl"), undefined);
  // Text that does not match the source fails closed, as do bad offsets.
  assert.equal(textRangeInSource(inner, 5, 10, "Plain"), undefined);
  assert.equal(textRangeInSource(inner, 20, 40, "x"), undefined);
  assert.deepEqual(textRangeInSource("a\r\nb &#128512; &#x41;", 0, 3, "a\nb"), { start: 0, end: 4 });
  assert.equal(textRangeInSource("&#128512;x", 2, 3, "x")!.start, 9);
});
