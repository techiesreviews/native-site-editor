import { test } from "node:test";
import assert from "node:assert/strict";
import { previewUrl } from "../src/components/settings-preview";

// Slice 109: the Social image's thumbnail and the share card ask for one picture together; one load
// serves both (a second load of the editor's assets left the first without its picture).
test("one preview load per picture at a time, per settings dialog's handlers", async () => {
  let calls = 0;
  const one = { imageUrl: async (value: string) => { calls++; return `one:${value}`; } };
  const two = { imageUrl: async (value: string) => `two:${value}` };
  const [a, b, c] = await Promise.all([previewUrl(one, "/a.png"), previewUrl(one, " /a.png "), previewUrl(two, "/a.png")]);
  assert.equal(calls, 1);
  assert.equal(a, "one:/a.png");
  assert.equal(b, "one:/a.png");
  assert.equal(c, "two:/a.png");
  // Settled loads are not kept: a later ask loads again (the picture may have changed).
  await previewUrl(one, "/a.png");
  assert.equal(calls, 2);
});

test("a failed preview load is not kept", async () => {
  let calls = 0;
  const handlers = { imageUrl: async () => { calls++; if (calls === 1) throw new Error("no"); return "ok"; } };
  await assert.rejects(previewUrl(handlers, "/b.png"));
  assert.equal(await previewUrl(handlers, "/b.png"), "ok");
});
