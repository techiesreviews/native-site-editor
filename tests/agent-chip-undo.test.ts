// The Undo on an agent's chip as the preview tells the frame (ticket am-49, `createChipUndo` in src/agent-presence.ts):
// what each chip offers, the press under way, and a refusal said on the chip until its next press or until the mark goes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createChipUndo, type AgentMark, type ChipUndoOffer } from "../src/agent-presence";

const mark = (name: string, extra: Partial<AgentMark> = {}): AgentMark =>
  ({ key: JSON.stringify(["grant-a", name]), who: { grant: "grant-a", name }, name, colour: 0, path: "index.html", node: [1, 0], asking: false, ...extra });

function chips(offers: Record<string, ChipUndoOffer | undefined>, undo?: (mark: AgentMark, change: string) => Promise<void>) {
  let told = 0;
  const pressed: [string, string][] = [];
  const chipUndo = createChipUndo({
    offer: mark => offers[mark.name],
    ...(undo ? { undo: (mark: AgentMark, change: string) => { pressed.push([mark.name, change]); return undo(mark, change); } } : {}),
    changed: () => { told++; },
  });
  return { chipUndo, pressed, told: () => told };
}

test("a chip offers Undo only with a change kept for it: none for a mark whose name is on a pin, or with nothing to undo", () => {
  const { chipUndo } = chips({ Copy: { change: "mcp-1", state: "ready" }, Pinned: { change: "mcp-2", state: "ready" }, Idle: undefined }, async () => {});
  assert.deepEqual(chipUndo.fields(mark("Copy")), { token: "agent-1", change: "mcp-1", undo: "ready" });
  assert.equal(chipUndo.fields(mark("Pinned", { pinned: true })), undefined);
  assert.equal(chipUndo.fields(mark("Idle")), undefined);
  // The page holds a token, never the connection: the same one each time, another for another agent.
  assert.equal(chipUndo.fields(mark("Copy"))?.token, "agent-1");
  assert.equal(chipUndo.fields(mark("Pinned"))?.token, "agent-2");
  // No undo to run (the editor wired none): nothing offered.
  assert.equal(chips({ Copy: { change: "mcp-1", state: "ready" } }).chipUndo.fields(mark("Copy")), undefined);
});

test("a press is busy while it runs, its refusal is said on the chip, cleared by the next press and gone with the mark", async () => {
  let fail = true, finish!: () => void;
  const { chipUndo, pressed, told } = chips({ Copy: { change: "mcp-1", state: "ready" } }, () => new Promise<void>((resolve, reject) => {
    finish = () => fail ? reject(new Error("This page changed since Copy's change. Nothing was undone.")) : resolve();
  }));
  const copy = mark("Copy"), { token } = chipUndo.fields(copy)!;
  chipUndo.marks([copy]);
  const running = chipUndo.press([copy], token, "mcp-1");
  assert.equal(chipUndo.fields(copy)?.undo, "busy");
  assert.equal(told(), 1);
  // A second press while it runs does nothing.
  await chipUndo.press([copy], token, "mcp-1");
  assert.deepEqual(pressed, [["Copy", "mcp-1"]]);
  finish();
  await running;
  assert.deepEqual(chipUndo.fields(copy), { token, change: "mcp-1", undo: "ready", problem: "This page changed since Copy's change. Nothing was undone." });
  assert.equal(told(), 2);
  // The next press clears it at once, and it stays cleared once that one goes.
  fail = false;
  const again = chipUndo.press([copy], token, "mcp-1");
  assert.equal(chipUndo.fields(copy)?.problem, undefined);
  finish();
  await again;
  assert.equal(chipUndo.fields(copy)?.problem, undefined);
  // Refused again, then the mark goes: its refusal goes with it.
  fail = true;
  const third = chipUndo.press([copy], token, "mcp-1");
  finish();
  await third;
  assert.ok(chipUndo.fields(copy)?.problem);
  chipUndo.marks([]);
  assert.equal(chipUndo.fields(copy)?.problem, undefined);
});

test("a refusal that comes back after its chip went is not kept for that agent's next chip", async () => {
  let refuse!: () => void;
  const { chipUndo } = chips({ Copy: { change: "mcp-1", state: "ready" } }, () => new Promise<void>((_, reject) => { refuse = () => reject(new Error("Refused.")); }));
  const copy = mark("Copy"), { token } = chipUndo.fields(copy)!;
  chipUndo.marks([copy]);
  const running = chipUndo.press([copy], token, "mcp-1");
  // The agent moves on while the undo runs: its chip goes, then comes back on another section.
  chipUndo.marks([]);
  refuse();
  await running;
  const elsewhere = mark("Copy", { node: [1, 3] });
  chipUndo.marks([elsewhere]);
  assert.equal(chipUndo.fields(elsewhere)?.problem, undefined);
  // Its token went with it: the chip drawn again has a new one, and a press with the old one does nothing.
  assert.notEqual(chipUndo.fields(elsewhere)?.token, token);
});

test("a press names the change its chip offered, and one for a mark no longer drawn does nothing", async () => {
  const { chipUndo, pressed } = chips({ Copy: { change: "mcp-7", state: "ready" } }, async () => {});
  const copy = mark("Copy"), { token } = chipUndo.fields(copy)!;
  chipUndo.marks([copy]);
  await chipUndo.press([], token, "mcp-7");
  await chipUndo.press([copy], "agent-99", "mcp-7");
  assert.deepEqual(pressed, []);
  await chipUndo.press([copy], token, "mcp-7");
  assert.deepEqual(pressed, [["Copy", "mcp-7"]]);
});

test("refused because the agent changed the page again, the chip says so and offers that newer change", async () => {
  const offers: Record<string, ChipUndoOffer | undefined> = { Copy: { change: "mcp-1", state: "ready" } };
  const { chipUndo } = chips(offers, async () => {
    // Meanwhile the agent's newer change landed: the chip's offer is that one now.
    offers.Copy = { change: "mcp-2", state: "ready" };
    throw new Error("Copy changed this page again meanwhile. Nothing was undone; try again.");
  });
  const copy = mark("Copy"), { token } = chipUndo.fields(copy)!;
  chipUndo.marks([copy]);
  await chipUndo.press([copy], token, "mcp-1");
  assert.deepEqual(chipUndo.fields(copy), { token, change: "mcp-2", undo: "ready", problem: "Copy changed this page again meanwhile. Nothing was undone; try again." });
});
