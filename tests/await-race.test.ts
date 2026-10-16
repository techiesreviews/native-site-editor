import { test } from "node:test";
import assert from "node:assert/strict";
import { forEachAwait } from "./support/await-race";

test("await-race catches a writer that writes to the old repository after an await", async () => {
  await assert.rejects(forEachAwait(race => {
    const state = { repo: "old", writes: [] as string[] };
    const read = race.port("read", async () => "content");
    const done = (async () => {
      const repo = state.repo;
      await read();
      state.writes.push(repo);
    })();
    return { state, done };
  }, run => { run.state.repo = "new"; }, run => {
    assert.deepEqual(run.state.writes, []);
  }), /await point 1 \(port read\)/);
});

test("await-race accepts a proved writer and replays every port call with fresh state", async () => {
  let runs = 0, disturbances = 0, assertions = 0;
  const count = await forEachAwait(race => {
    runs++;
    const state = { repo: "old", writes: [] as string[] };
    const read = race.port("read", async (path: string) => `${path}:content`);
    const done = (async () => {
      const proof = state.repo;
      const first = await read("a");
      if (state.repo !== proof) return;
      const second = await read("b");
      if (state.repo !== proof) return;
      assert.deepEqual([first, second], ["a:content", "b:content"]);
      state.writes.push(proof);
    })();
    return { state, done };
  }, async run => {
    assert.equal(run.state.repo, "old");
    assert.deepEqual(run.state.writes, []);
    await Promise.resolve();
    run.state.repo = "new";
    disturbances++;
  }, run => {
    assertions++;
    assert.deepEqual(run.state.writes, []);
  });
  assert.equal(count, 2);
  assert.equal(runs, 3); // Baseline, then one fresh run per await, even when an earlier run stops short.
  assert.equal(disturbances, 2);
  assert.equal(assertions, 2);
});

test("await-race refuses a scenario with zero wrapped awaits", async () => {
  await assert.rejects(forEachAwait(
    () => ({ done: Promise.resolve() }),
    () => assert.fail("No await point should be disturbed."),
    () => assert.fail("No disturbed run should be asserted."),
  ), /zero wrapped awaits/);
});

test("await-race names later await points and preserves the assertion cause", async () => {
  const failure = new Error("stale second write");
  await assert.rejects(forEachAwait(race => {
    const state = { live: true, writes: 0 };
    const first = race.port("first", async () => {});
    const second = race.port("second", async () => {});
    const done = (async () => {
      await first();
      if (!state.live) return;
      await second();
      state.writes++;
    })();
    return { state, done };
  }, run => { run.state.live = false; }, run => {
    if (run.state.writes) throw failure;
  }), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /await point 2 \(port second\)/);
    assert.equal(error.cause, failure);
    return true;
  });
});

test("await-race observes disturbances even if the writer catches their rejection", async () => {
  await assert.rejects(forEachAwait(race => {
    const read = race.port("read", async () => {});
    return { done: read().catch(() => {}) };
  }, () => { throw new Error("disturbance failed"); }, () => {}), /await point 1 \(port read\): disturbance failed/);
});

test("await-race holds a rejected port until an async disturbance finishes", async () => {
  const count = await forEachAwait(race => {
    const state = { live: true, staleWrites: [] as string[] };
    const read = race.port("read", async () => { throw new Error("read failed"); });
    const done = read().catch(() => { if (!state.live) state.staleWrites.push("error state"); });
    return { state, done };
  }, async run => {
    await new Promise<void>(resolve => setImmediate(resolve));
    run.state.live = false;
  }, run => {
    assert.deepEqual(run.state.staleWrites, ["error state"], "The writer must resume only after disturbance, even on rejection.");
  });
  assert.equal(count, 1);
});
