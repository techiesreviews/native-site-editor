import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchWithReadRetry } from "../src/read-retry.ts";

const run = (script: (Response | Error)[], init?: RequestInit) => {
  const waits: number[] = [];
  let calls = 0;
  const fetcher = (async () => {
    const next = script[Math.min(calls++, script.length - 1)];
    if (next instanceof Error) throw next;
    return next.clone();
  }) as typeof fetch;
  const result = fetchWithReadRetry("/api/files", init, fetcher, [600, 1500], async (ms) => void waits.push(ms));
  return { result, waits, calls: () => calls };
};
const reply = (status: number) => new Response("{}", { status });

test("a read is retried after a 502, a 503 or a network error, then succeeds", async () => {
  const all = run([reply(502), new TypeError("network"), reply(200)]);
  assert.equal((await all.result).status, 200);
  assert.equal(all.calls(), 3);
  assert.deepEqual(all.waits, [600, 1500]);
  const busy = run([reply(503), reply(200)]);
  assert.equal((await busy.result).status, 200);
  assert.deepEqual(busy.waits, [600]);
  const bad = run([reply(502), reply(200)]);
  assert.equal((await bad.result).status, 200);
});

test("a read gives up after two retries and returns the last answer or error", async () => {
  const failing = run([reply(502)]);
  assert.equal((await failing.result).status, 502);
  assert.equal(failing.calls(), 3);
  const offline = run([new TypeError("offline")]);
  await assert.rejects(offline.result, /offline/);
  assert.equal(offline.calls(), 3);
});

test("other statuses are not retried", async () => {
  for (const status of [400, 401, 403, 404, 429, 500]) {
    const { result, calls } = run([reply(status), reply(200)]);
    assert.equal((await result).status, status);
    assert.equal(calls(), 1);
  }
});

test("a POST is never retried", async () => {
  const { result, calls } = run([reply(502), reply(200)], { method: "POST" });
  assert.equal((await result).status, 502);
  assert.equal(calls(), 1);
  const offline = run([new TypeError("offline"), reply(200)], { method: "POST" });
  await assert.rejects(offline.result, /offline/);
  assert.equal(offline.calls(), 1);
});
