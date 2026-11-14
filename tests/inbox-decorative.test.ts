import test from "node:test";
import assert from "node:assert/strict";
import { markDecorative } from "../src/inbox/decorative.ts";
import { forEachAwait } from "./support/await-race";

const item = { key: "picture\nindex.html\nimages/hero.jpg", kind: "picture" as const, what: "Picture without a description", where: "Home page", page: "index.html", media: "images/hero.jpg", wave: "Decorative" };

test("the Inbox's Decorative writes only on the session it was pressed in", async () => {
  const awaits = await forEachAwait(race => {
    const state = { live: true, written: [] as string[], error: "" };
    const workspace = {
      load: race.port("load", async () => {}),
      describe: race.port("describe", async (file: string, change: { decorative?: boolean; page?: string }, agent?: boolean) => {
        state.written.push(`${file} ${change.page} ${String(change.decorative)} ${String(agent)}`);
      }),
    };
    const done = markDecorative(item, { holds: () => state.live }, race.port("open", async () => workspace)).catch((error: Error) => { state.error = error.message; });
    return { state, done };
  }, run => { run.state.live = false; }, run => {
    // Moved away before describe began: nothing is written and the reason is said; during describe, Media's own stamp guards it.
    if (run.state.written.length) return;
    assert.equal(run.state.error, "The site changed before Decorative was saved. Nothing was changed.");
  });
  assert.equal(awaits, 3);
});

test("Decorative marks the picture on its page as the user's change", async () => {
  const written: unknown[] = [];
  await markDecorative(item, { holds: () => true }, async () => ({ load: async () => {}, describe: async (...args: unknown[]) => { written.push(args); } }));
  assert.deepEqual(written, [["images/hero.jpg", { decorative: true, page: "index.html" }, false]]);
});
