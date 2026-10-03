import assert from "node:assert/strict";
import { test } from "node:test";
import { startTags, startTagAttribute } from "../shared/html-source";

const attribute = (html: string, name: string) => startTagAttribute(html, startTags(html)[0], name);

test("attributes never match words or assignments inside quoted values", () => {
  assert.equal(attribute('<time title="no datetime here">', "datetime"), undefined);
  const html = '<a title="href=/safe" href="javascript:alert(1)">';
  const found = attribute(html, "href")!;
  assert.equal(found.value, "javascript:alert(1)");
  assert.equal(html.slice(found.start, found.end), ' href="javascript:alert(1)"');
  assert.equal(html.slice(found.valueStart, found.valueEnd), found.value);
  assert.equal(attribute("<iframe title='sandbox=safe'>", "sandbox"), undefined);
});

test("quoted, unquoted, boolean and HTML whitespace attributes retain exact spans", () => {
  for (const space of [" ", "\t", "\n", "\r", "\f"]) {
    for (const text of ['DATA-X="a > b"', "DATA-X='a b'", "DATA-X=raw/path", "DATA-X"]) {
      const html = `<div title="noise"${space}${text} other=value>`;
      const found = attribute(html, "data-x")!;
      assert.equal(html.slice(found.start, found.end), space + text);
      assert.equal(html.slice(found.valueStart, found.valueEnd), found.value);
      assert.equal(found.value, text.includes('"') ? "a > b" : text.includes("'") ? "a b" : text.includes("=") ? "raw/path" : "");
    }
  }
  assert.equal(attribute('<div title="x"\u00a0datetime=value>', "datetime"), undefined);
});
