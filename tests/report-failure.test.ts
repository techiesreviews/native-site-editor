import { test } from "node:test";
import assert from "node:assert/strict";
import { reported, reportFailure, setErrorReporter } from "../src/ui/report-failure.ts";

test("reportFailure defaults to console.error", t => {
  const logged = t.mock.method(console, "error", () => {});
  const failure = new Error("Early startup failure");
  reportFailure(failure);
  assert.deepEqual(logged.mock.calls[0].arguments, [failure]);
});

test("reported calls synchronously with every argument and returns void", () => {
  const calls: unknown[][] = [];
  const handler = reported((event: Event, count: number) => {
    event.preventDefault();
    calls.push([event, count]);
  });
  const event = new Event("submit", { cancelable: true });
  assert.equal(handler(event, 3), undefined);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(calls, [[event, 3]]);
  const legacyAction: () => void = () => true;
  assert.doesNotThrow(reported(legacyAction));
});

test("reported sends a rejected promise to the current reporter", async () => {
  const errors: unknown[] = [];
  const failure = new Error("File could not be opened");
  setErrorReporter(error => { errors.push(error); });
  try {
    const handler = reported(async (event: Event) => {
      event.preventDefault();
      throw failure;
    });
    const event = new Event("submit", { cancelable: true });
    assert.equal(handler(event), undefined);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(errors, []);
    await Promise.resolve();
    assert.deepEqual(errors, [failure]);
    const later: unknown[] = [];
    setErrorReporter(error => { later.push(error); });
    handler(event);
    await Promise.resolve();
    assert.deepEqual(later, [failure]);
  } finally {
    setErrorReporter(error => console.error(error));
  }
});

test("reported preserves synchronous throws", () => {
  const errors: unknown[] = [];
  const failure = new Error("Synchronous failure");
  setErrorReporter(error => { errors.push(error); });
  try {
    const handler = reported(() => { throw failure; });
    assert.throws(handler, error => error === failure);
    assert.deepEqual(errors, []);
  } finally {
    setErrorReporter(error => console.error(error));
  }
});
