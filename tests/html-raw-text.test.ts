import assert from "node:assert/strict";
import { test } from "node:test";
import { startTags, markStartTags } from "../shared/html-source";

for (const name of ["script", "style"]) {
  test(`${name} ignores a longer end-tag name and fake image before the real close`, () => {
    const html = `<${name}>const fake = '</${name}ish><img src="fake.png">';</${name}><img src="real.png">`;
    const tags = startTags(html);
    assert.deepEqual(tags.map((tag) => tag.name), [name, "img"]);
    assert.equal(tags[1].start, html.indexOf('<img src="real.png">'));
    const marked = markStartTags(html, tags);
    assert.ok(marked.includes('<img src="fake.png">'));
    assert.ok(marked.includes('<img data-native-src="1" src="real.png">'));
  });
  test(`${name} accepts whitespace and slash delimiters on its real end tag`, () => {
    for (const delimiter of [" ", "\n", "/"]) {
      assert.deepEqual(startTags(`<${name}>x</${name}${delimiter}><img>`).map((tag) => tag.name), [name, "img"]);
    }
  });
}
