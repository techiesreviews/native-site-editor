import assert from "node:assert/strict";
import { test } from "node:test";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import { forEachAwait } from "./support/await-race.ts";

const repo = "lex/site";
const put = (cache: CleanSourceCache, revision: string, text: string, path = "") =>
  cache.load(repo, revision, () => Promise.resolve(text), path);

function deferred() {
  let resolve!: (text: string) => void;
  const promise = new Promise<string>(done => { resolve = done; });
  return { promise, resolve };
}

test("byte LRU evicts the least recent text; a hit refreshes recency", async () => {
  const cache = new CleanSourceCache(() => "lex", 12);
  await put(cache, "a", "aa");
  await put(cache, "b", "bbb");
  assert.equal(cache.bytes, 10);
  assert.equal(await cache.get(repo, "a"), "aa");
  await put(cache, "c", "cc");
  assert.equal(cache.get(repo, "b"), undefined);
  assert.equal(await cache.get(repo, "a"), "aa");
  assert.equal(await cache.get(repo, "c"), "cc");
  assert.equal(cache.bytes, 8);
  await put(cache, "large", "1234567");
  assert.equal(cache.bytes, 0);
  assert.equal(cache.get(repo, "large"), undefined);
});

test("default cap is 32 MiB of UTF-16 text, including surrogate pairs", async () => {
  const cache = new CleanSourceCache(() => "lex");
  const full = "x".repeat(16 * 1024 * 1024);
  await put(cache, "full", full);
  assert.equal(cache.bytes, 32 * 1024 * 1024);
  await put(cache, "emoji", "😀");
  assert.equal(cache.get(repo, "full"), undefined);
  assert.equal(cache.bytes, 4);
  await put(cache, "empty", "");
  assert.equal(await cache.get(repo, "empty"), "");
});

test("base bytes are pinned, counted once with equal clean text, and never evicted", async () => {
  const cache = new CleanSourceCache(() => "lex", 10);
  await put(cache, "a", "base");
  cache.base.set("index.html", "base");
  cache.base.set("copy.html", "base");
  assert.equal(cache.bytes, 8);
  await put(cache, "b", "bb");
  assert.equal(cache.bytes, 8);
  assert.equal(cache.get(repo, "b"), undefined);
  assert.equal(cache.base.get("index.html"), "base");
  cache.base.set("index.html", "bigger");
  assert.equal(cache.bytes, 20, "pinned text may exceed the cap");
  await put(cache, "c", "c");
  assert.equal(cache.get(repo, "c"), undefined);
  cache.clear();
  assert.deepEqual([...cache.base], [["index.html", "bigger"], ["copy.html", "base"]]);
  assert.equal(cache.bytes, 20);
  assert.equal(cache.base.delete("absent"), false);
  cache.base.delete("copy.html");
  assert.equal(cache.bytes, 12);
  cache.base.set("index.html", "bigger");
  assert.equal(cache.bytes, 12, "replacing the same base does not accumulate bytes");
  cache.base.clear();
  assert.equal(cache.bytes, 0);
});

test("pending loads deduplicate, cost bytes only on settle, and survive eviction pressure", async () => {
  const cache = new CleanSourceCache(() => "lex", 4), gate = deferred();
  let calls = 0;
  const read = () => { calls++; return gate.promise; };
  const first = cache.load(repo, "sha", read);
  assert.equal(cache.bytes, 0);
  await put(cache, "other", "large");
  const second = cache.load(repo, "sha", read);
  assert.equal(first, second);
  assert.equal(calls, 1);
  gate.resolve("ok");
  assert.deepEqual(await Promise.all([first, second]), ["ok", "ok"]);
  assert.equal(cache.bytes, 4);
  assert.equal(await cache.get(repo, "sha"), "ok");
});

test("rejected loads leave no entry or bytes and can be retried", async () => {
  const cache = new CleanSourceCache(() => "lex");
  const failed = cache.load(repo, "sha", () => Promise.reject(new Error("offline")));
  assert.equal(cache.get(repo, "sha"), failed);
  await assert.rejects(failed, /offline/);
  assert.equal(cache.get(repo, "sha"), undefined);
  assert.equal(cache.bytes, 0);
  assert.equal(await put(cache, "sha", "retry"), "retry");
  assert.equal(cache.bytes, 10);
});

test("clear fences a late load without removing its replacement's pending entry", async () => {
  const cache = new CleanSourceCache(() => "lex"), old = deferred(), fresh = deferred();
  const first = cache.load(repo, "sha", () => old.promise);
  cache.clear();
  const replacement = cache.load(repo, "sha", () => fresh.promise);
  old.resolve("old");
  assert.equal(await first, "old", "existing readers still settle");
  assert.equal(cache.bytes, 0);
  assert.equal(cache.get(repo, "sha"), replacement);
  fresh.resolve("fresh");
  await replacement;
  assert.equal(await cache.get(repo, "sha"), "fresh");
  assert.equal(cache.bytes, 10);
});

test("account changes and sign-out never return another account's entry or pending load", async () => {
  let account: string | undefined = "A";
  const cache = new CleanSourceCache(() => account), gate = deferred();
  await put(cache, "cached", "private A");
  const pending = cache.load(repo, "pending", () => gate.promise);
  account = "B";
  assert.equal(cache.get(repo, "cached"), undefined);
  assert.equal(cache.get(repo, "pending"), undefined);
  assert.equal(cache.bytes, 0);
  gate.resolve("late A");
  await pending;
  assert.equal(cache.get(repo, "pending"), undefined);
  await put(cache, "cached", "private B");
  account = undefined;
  assert.equal(cache.get(repo, "cached"), undefined);
  assert.equal(cache.bytes, 0);
  account = "A";
  assert.equal(cache.get(repo, "cached"), undefined);
});

test("repository, immutable revision and path isolate entries", async () => {
  const cache = new CleanSourceCache(() => "lex");
  await put(cache, "commit", "page", "index.html");
  assert.equal(cache.get("lex/other", "commit", "index.html"), undefined);
  assert.equal(cache.get(repo, "other-commit", "index.html"), undefined);
  assert.equal(cache.get(repo, "commit", "other.html"), undefined);
  assert.equal(await cache.get(repo, "commit", "index.html"), "page");
});

for (const disturbance of ["clear", "account", "abandon"] as const) {
  test(`late settlement after ${disturbance} cannot populate the cache at any await`, async () => {
    await forEachAwait(race => {
      const state = { account: "A", live: true };
      const cache = new CleanSourceCache(() => state.account);
      const read = race.port("read", () => Promise.resolve("private"));
      const done = cache.load(repo, "sha", read, "", () => state.live);
      return { cache, state, done };
    }, run => {
      if (disturbance === "clear") run.cache.clear();
      if (disturbance === "account") run.state.account = "B";
      if (disturbance === "abandon") run.state.live = false;
    }, run => {
      assert.equal(run.cache.bytes, 0);
      assert.equal(run.cache.get(repo, "sha"), undefined);
    });
  });
}
