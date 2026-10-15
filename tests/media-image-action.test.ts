import { test } from "node:test";
import assert from "node:assert/strict";
import { startTags } from "../shared/html-source";
import type { MediaControllerPorts } from "../src/controllers/media-controller";
import { sameImageTarget } from "../src/controllers/media-actions";

const locate = ((source, node) => { const tag = startTags(source)[node[0]]; return tag && { tag }; }) satisfies NonNullable<MediaControllerPorts["locateElement"]>;

test("a delayed image action accepts the same image after unrelated source edits", () => {
  assert.equal(sameImageTarget('<p>Before</p><img src="a.png">', '<p>After</p><img src="a.png">', [1], locate), true);
});

test("a delayed image action refuses removed, shifted, replaced and non-image targets", () => {
  const before = '<p>Before</p><img src="a.png">';
  for (const after of ['<p>Before</p>', '<img src="a.png"><p>Before</p>', '<p>Before</p><img src="b.png">', '<p>Before</p><div></div>'])
    assert.equal(sameImageTarget(before, after, [1], locate), false);
});
