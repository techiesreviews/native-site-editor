import test from "node:test";
import assert from "node:assert/strict";
import { markDecorative, type DecorativeMedia } from "../src/inbox/decorative.ts";
import type { InboxItem } from "../src/inbox/inbox-item.ts";
import { forEachAwait } from "./support/await-race";

const source = `<!doctype html><html><head><title>Home</title></head><body><img alt="The team" src="/images/hero.jpg"><img src="/images/hero.jpg"></body></html>`;
const item = { key: "picture\nindex.html\nimages/hero.jpg", kind: "picture" as const, what: "Picture without a description", where: "Home page", page: "index.html", media: "images/hero.jpg", wave: "Decorative", at: source.lastIndexOf("<img"), allUses: true } satisfies InboxItem;

test("the Inbox's Decorative writes only on the session it was pressed in", async () => {
  const awaits = await forEachAwait(race => {
    const state = { live: true, written: [] as string[], error: "" };
    const workspace = {
      load: race.port("load", async () => {}),
      describe: race.port("describe", async (file: string, change: { decorative: boolean; page: string }, agent: boolean) => {
        state.written.push(`${file} ${change.page} ${String(change.decorative)} ${String(agent)}`);
      }),
    } satisfies DecorativeMedia;
    const done = markDecorative(item, { holds: () => state.live }, source, race.port("open", async () => workspace)).catch((error: Error) => { state.error = error.message; });
    return { state, done };
  }, run => { run.state.live = false; }, run => {
    // Moved away before describe began: nothing is written and the reason is said; during describe, Media's own stamp guards it.
    if (run.state.written.length) return;
    assert.equal(run.state.error, "The site changed before Decorative was saved. Nothing was changed.");
  });
  assert.equal(awaits, 3);
});

// The second picture is the body's second element.
const pathAt = (html: string, at: number) => at === html.lastIndexOf("<img") ? [1] : undefined;

test("Decorative marks the picture on its page as the user's change, on the page as it was pressed", async () => {
  const written: unknown[] = [];
  const media: DecorativeMedia = { load: async () => {}, describe: async (...args) => { written.push(args); } };
  // Every use waits: Media marks them all.
  await markDecorative(item, { holds: () => true }, source, async () => media, pathAt);
  // Another use has words: only the waiting one is marked, by its element.
  await markDecorative({ ...item, allUses: false }, { holds: () => true }, source, async () => media, pathAt);
  assert.deepEqual(written, [
    ["images/hero.jpg", { decorative: true, page: "index.html", expected: source }, false],
    ["images/hero.jpg", { decorative: true, page: "index.html", expected: source, element: "1" }, false],
  ]);
  // The picture is no longer where it was: nothing is written.
  await assert.rejects(markDecorative({ ...item, allUses: false, at: 3 }, { holds: () => true }, source, async () => media, pathAt), /This picture changed/);
  assert.equal(written.length, 2);
});
