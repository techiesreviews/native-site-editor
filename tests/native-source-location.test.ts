import assert from "node:assert/strict";
import test from "node:test";
import { markStartTags, startTags } from "../src/native-source-location.ts";

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
