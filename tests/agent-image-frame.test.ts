import { agentMediaArgsProblem } from "../shared/agent-media-args";
import { test } from "node:test";
import assert from "node:assert/strict";
import { agentImageTrim, type AgentImageTrim } from "../shared/agent-image-frame";
import { type AgentCommandArgs } from "../shared/agent";

test("agent trim defaults and zoom describe the whole new trim in the turned original", () => {
  assert.deepEqual(agentImageTrim({ zoom: 2 }), { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  assert.deepEqual(agentImageTrim({ x: 0.1, y: 0.2, width: 0.8, height: 0.6, zoom: 2, turn: 90, flipX: true, flipY: false, straighten: -10 }),
    { x: 0.30000000000000004, y: 0.35, width: 0.4, height: 0.3, turn: 90, flipX: true, straighten: -10 });
  assert.deepEqual(agentImageTrim({ turn: 270, straighten: 0, flipX: false }), { x: 0, y: 0, width: 1, height: 1, turn: 270 });
  assert.deepEqual(agentImageTrim({ flipY: true, zoom: 8 }), { x: 0.4375, y: 0.4375, width: 0.125, height: 0.125, flipY: true });
});

test("agent trim refuses no-ops, outside rectangles, invalid transforms and non-finite values", () => {
  const bad: AgentImageTrim[] = [
    {}, { zoom: 1, turn: 0, flipX: false, straighten: 0 },
    { x: -0.01 }, { x: -1e-10, zoom: 2 }, { y: -0.01 }, { x: 0.8, width: 0.5, zoom: 8 },
    { y: 0.8, height: 0.5 }, { width: 0 }, { height: -1 },
    { zoom: 0.9 }, { zoom: 8.1 }, { zoom: NaN }, { width: Infinity },
    { straighten: -46 }, { straighten: 46 }, { x: NaN },
  ];
  for (const trim of bad) assert.throws(() => agentImageTrim(trim));
  // Malformed JSON must fail in the tab too, even if it bypassed the Worker schema.
  for (const trim of [{ turn: 45 }, { turn: null, zoom: 2 }, { straighten: null, zoom: 2 }, { flipX: "yes" }, { flipY: false, zoom: "2" }, null, []]) {
    assert.ok(agentMediaArgsProblem("frame_image", { element: "1", trim } as AgentCommandArgs, "index.html"));
  }
});

test("frame validation permits reads and shapes but checks page, target and focus in the tab", () => {
  assert.equal(agentMediaArgsProblem("frame_image", { element: "1" }, "index.html"), undefined);
  for (const shape of ["original", "square", "4:3", "16:9", "4:5", "component"] as const)
    assert.equal(agentMediaArgsProblem("frame_image", { element: "1", shape, focus: { x: 0, y: 100 } }, "index.html"), undefined);
  for (const args of [{ element: "x" }, { element: "1", shape: "free" }, { element: "1", focus: { x: -1, y: 50 } }, { element: "1", focus: { x: 50, y: Infinity } }])
    assert.ok(agentMediaArgsProblem("frame_image", args as AgentCommandArgs, "index.html"));
  assert.ok(agentMediaArgsProblem("frame_image", { element: "1" }, "index.css"));
});
