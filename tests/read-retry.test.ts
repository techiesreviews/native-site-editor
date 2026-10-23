import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { fetchWithReadRetry, ReadUnansweredError } from "../src/read-retry.ts";

// A fake clock: setTimeout and Date.now are mocked, so the time of each try
// shows (from the read's start) the 8 s timeout and the 1, 2 and 4 s waits between tries.
beforeEach(() => mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 }));
afterEach(() => mock.timers.reset());

const HANG = "hang";
type Step = Response | Error | typeof HANG;

const run = (script: Step[], init?: RequestInit) => {
  const times: number[] = [], start = Date.now();
  const signals: AbortSignal[] = [];
  const fetcher = ((_url: string, request: RequestInit = {}) => {
    times.push(Date.now() - start);
    signals.push(request.signal!);
    const next = script[Math.min(times.length - 1, script.length - 1)];
    if (next === HANG) return new Promise((_, reject) => request.signal!.addEventListener("abort", () => reject(request.signal!.reason)));
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next.clone());
  }) as typeof fetch;
  const result = fetchWithReadRetry("/api/files", init, { fetcher });
  return { result: settle(result), times, signals };
};

// Runs the clock until the read settles.
async function settle<T>(read: Promise<T>): Promise<T> {
  let done = false;
  read.then(() => { done = true; }, () => { done = true; });
  while (!done) {
    await new Promise((resolve) => setImmediate(resolve));
    mock.timers.runAll();
  }
  return read;
}
const reply = (status: number) => new Response("{}", { status });

test("a read is retried after a 502, a 503 or a network error, waiting 1, 2 and 4 s, then succeeds", async () => {
  const all = run([reply(502), new TypeError("network"), reply(503), reply(200)]);
  assert.equal((await all.result).status, 200);
  assert.deepEqual(all.times, [0, 1000, 3000, 7000]);
  const busy = run([reply(503), reply(200)]);
  assert.equal((await busy.result).status, 200);
  assert.equal(busy.times.length, 2);
});

test("a try with no answer in 8 s counts as a failure and is tried again", async () => {
  const late = run([HANG, reply(200)]);
  assert.equal((await late.result).status, 200);
  assert.deepEqual(late.times, [0, 9000]);
  assert.equal(late.signals[0].aborted, true);
});

test("an answered try clears its timer: nothing aborts it later", async () => {
  const { result, signals } = run([reply(200)]);
  assert.equal((await result).status, 200);
  mock.timers.tick(60_000);
  assert.equal(signals[0].aborted, false);
  const failed = run([new TypeError("network"), reply(200)]);
  await failed.result;
  mock.timers.tick(60_000);
  assert.deepEqual(failed.signals.map((signal) => signal.aborted), [false, false]);
});

test("a read gives up after three retries: the last 502 is returned, no answer throws", async () => {
  const failing = run([reply(502)]);
  assert.equal((await failing.result).status, 502);
  assert.equal(failing.times.length, 4);
  const offline = run([new TypeError("offline")]);
  await assert.rejects(offline.result, (error) => error instanceof ReadUnansweredError && /offline/.test(String((error as Error).cause)));
  assert.equal(offline.times.length, 4);
  const silent = run([HANG]);
  await assert.rejects(silent.result, (error) => error instanceof ReadUnansweredError && error.message === "GitHub isn't answering. Try again in a moment.");
  assert.deepEqual(silent.times, [0, 9000, 19000, 31000]);
});

test("other statuses are not retried", async () => {
  for (const status of [400, 401, 403, 404, 429, 500]) {
    const { result, times } = run([reply(status), reply(200)]);
    assert.equal((await result).status, status);
    assert.equal(times.length, 1);
  }
});

test("a caller's own abort ends the read without a retry", async () => {
  const caller = new AbortController();
  const read = run([HANG, reply(200)], { signal: caller.signal });
  caller.abort();
  await assert.rejects(read.result, (error) => !(error instanceof ReadUnansweredError));
  assert.equal(read.times.length, 1);
});

test("a caller's abort during the wait between tries ends the read at once", async () => {
  const caller = new AbortController();
  let calls = 0, outcome: unknown;
  const fetcher = (async () => { calls++; return reply(502); }) as typeof fetch;
  void fetchWithReadRetry("/api/files", { signal: caller.signal }, { fetcher }).then(() => { outcome = "answered"; }, (error) => { outcome = error; });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  await flush();
  // Half a second into the 1 s wait after the 502.
  mock.timers.tick(500);
  caller.abort();
  await flush();
  assert.equal((outcome as Error | undefined)?.name, "AbortError");
  assert.equal(calls, 1);
  // Its wait's timer is gone: nothing tries again later.
  mock.timers.tick(60_000);
  await flush();
  assert.equal(calls, 1);
});

test("a POST is never retried or timed out", async () => {
  const { result, times, signals } = run([reply(502), reply(200)], { method: "POST" });
  assert.equal((await result).status, 502);
  assert.equal(times.length, 1);
  assert.equal(signals[0], undefined);
  const offline = run([new TypeError("offline"), reply(200)], { method: "POST" });
  await assert.rejects(offline.result, /offline/);
  assert.equal(offline.times.length, 1);
});
