import assert from "node:assert/strict";
import { test } from "node:test";
import { bestRound } from "./native-save/latency-budget.ts";

// native-edit-latency.spec.ts's verdict (ticket 38): one round must meet both budgets.
const budget = { nextInput: 100, longest: 50 };

test("an action fails when each budget is met only in a different round", () => {
  const tries = [{ nextInput: 150, longest: 0 }, { nextInput: 20, longest: 80 }];
  assert.equal(bestRound(tries, budget).passed, false);
  // The closest round is named: 30 ms over beats 50 ms over.
  assert.equal(bestRound(tries, budget).round, tries[1]);
});

test("an action passes on any one round that meets both budgets, at the limits too", () => {
  const met = { nextInput: 100, longest: 50 };
  assert.deepEqual(bestRound([{ nextInput: 300, longest: 200 }, met], budget), { passed: true, round: met });
  assert.deepEqual(bestRound([met, { nextInput: 101, longest: 0 }], budget), { passed: true, round: met });
  assert.equal(bestRound([{ nextInput: 101, longest: 50 }], budget).passed, false);
  assert.equal(bestRound([{ nextInput: 100, longest: 51 }], budget).passed, false);
});
