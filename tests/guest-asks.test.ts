import assert from "node:assert/strict";
import test from "node:test";
import { createGuestAsks } from "../src/guest-asks";
import { GUEST_NOT_KEPT } from "../src/guest-changes";
import type { GuestMessage } from "../src/live-session";

const change = { kind: "link" as const, path: "index.html", node: [0, 1], href: "/menu/" };

test("a guest hears why Lex's tab did not write their change, and nothing when it did", async () => {
  const sent: GuestMessage[] = [];
  const asks = createGuestAsks((message) => sent.push(message));
  const number = () => (sent.at(-1) as Extract<GuestMessage, { t: "change" }>).ask;
  try {
    const written = asks.change(change, 3);
    assert.deepEqual(sent.at(-1), { t: "change", change, ask: 1, seen: 3 });
    asks.answer(number(), { done: true });
    assert.equal(await written, undefined);
    const said = asks.change(change, 4);
    asks.answer(number(), { done: false, why: "The repository changed. Choose an image again." });
    assert.equal(await said, "The repository changed. Choose an image again.");
    const plain = asks.change(change, 5);
    asks.answer(number(), { done: false });
    assert.equal(await plain, GUEST_NOT_KEPT, "no reason given: the usual one");
    const long = asks.change(change, 6);
    asks.answer(number(), { done: false, why: "x".repeat(500) });
    assert.equal((await long)?.length, 200, "a reason is kept short");
  } finally {
    asks.close();
  }
});
