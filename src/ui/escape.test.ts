import assert from "node:assert/strict";
import test from "node:test";
import { escapeWords } from "./escape.ts";

// The parts' one escape for words they put in markup.

test("escape: the characters that could end text or an attribute", () => {
  assert.equal(escapeWords(`<b a="1">&'`), "&lt;b a=&quot;1&quot;&gt;&amp;&#39;");
  assert.equal(escapeWords("plain"), "plain");
});
