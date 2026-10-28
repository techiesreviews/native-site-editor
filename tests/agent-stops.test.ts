import { strict as assert } from "node:assert";
import { test } from "node:test";
import { STOPPED_AGENTS_KEY, agentStops } from "../src/agent-stops.ts";

// The agents stopped in this browser (ticket am-12): a list in localStorage every tab reads, plus this tab's own.
const items = new Map<string, string>();
let refuse = false;
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { if (refuse) throw new Error("QuotaExceededError"); items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
  },
});
const stored = () => JSON.parse(items.get(STOPPED_AGENTS_KEY) ?? "[]") as { grant: string; name: string }[];

test("a stop is kept for every tab, once each, and one another tab wrote counts here", () => {
  agentStops.add({ grant: "g1", name: "Header writer" });
  agentStops.add({ grant: "g1", name: "Header writer" });
  assert.deepEqual(stored(), [{ grant: "g1", name: "Header writer" }]);
  assert.ok(agentStops.has({ grant: "g1", name: "Header writer" }));
  // The same name on another connection, or another name on this one, is another agent.
  assert.ok(!agentStops.has({ grant: "g2", name: "Header writer" }));
  assert.ok(!agentStops.has({ grant: "g1", name: "Copy editor" }));
  // Another tab of this browser stopped one.
  items.set(STOPPED_AGENTS_KEY, JSON.stringify([...stored(), { grant: "g9", name: "Elsewhere" }]));
  assert.ok(agentStops.has({ grant: "g9", name: "Elsewhere" }));
});

test("past 100 stops the oldest make room", () => {
  items.delete(STOPPED_AGENTS_KEY);
  for (let index = 0; index < 105; index++) agentStops.add({ grant: "limit", name: `Agent ${index}` });
  const list = stored();
  assert.equal(list.length, 100);
  assert.deepEqual(list[0], { grant: "limit", name: "Agent 5" });
  assert.deepEqual(list.at(-1), { grant: "limit", name: "Agent 104" });
});

test("a browser that refuses to store a stop still holds it in this tab", () => {
  refuse = true;
  try {
    agentStops.add({ grant: "refused", name: "Kept here" });
    assert.ok(!stored().some(who => who.grant === "refused"));
    assert.ok(agentStops.has({ grant: "refused", name: "Kept here" }));
  } finally { refuse = false; }
});

test("a broken record or broken entries count as no stops", () => {
  items.set(STOPPED_AGENTS_KEY, "{not json");
  assert.ok(!agentStops.has({ grant: "g9", name: "Elsewhere" }));
  items.set(STOPPED_AGENTS_KEY, JSON.stringify({ grant: "g9", name: "Elsewhere" }));
  assert.ok(!agentStops.has({ grant: "g9", name: "Elsewhere" }));
  items.set(STOPPED_AGENTS_KEY, JSON.stringify([null, 3, { grant: "g9" }, { grant: 1, name: "Elsewhere" }, { grant: "g9", name: "Elsewhere" }]));
  assert.ok(agentStops.has({ grant: "g9", name: "Elsewhere" }));
  assert.ok(!agentStops.has({ grant: "g9", name: "" }));
  // A stop added over broken entries keeps only good ones.
  agentStops.add({ grant: "g10", name: "New" });
  assert.deepEqual(stored(), [{ grant: "g9", name: "Elsewhere" }, { grant: "g10", name: "New" }]);
});
