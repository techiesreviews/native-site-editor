import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
// The validator is pure; omit its editor-only CSS import for Node.
const source = readFileSync("src/components/slot-ghosts.ts", "utf8").replace('import "./slot-ghosts.css";', "");
const { readSlotGhostReport } = await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: "ts", format: "esm" }).code).toString("base64")}`);
const rect = { left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50 };
const expected = { context: "now", pagePath: "index.html", components: { "test-card": "components/test-card.html" } };
const report = { ...expected, components: undefined, tag: "test-card", templatePath: "components/test-card.html", hostNode: [0], hostRect: rect,
  entries: [0, 1].map(occurrence => ({ name: "image", occurrence, slotNode: [occurrence], hidden: true, assigned: false })) };
test("hidden duplicate outlets remain valid with no invented rectangle", () => {
  const parsed = readSlotGhostReport(report, expected);
  assert.equal(parsed.entries.length, 2); assert.equal(parsed.entries[0].rect, undefined);
  parsed.hostNode.push(1); assert.deepEqual(report.hostNode, [0]);
});
test("reject stale and malformed instance targets", () => {
  for (const change of [{ context: "old" }, { pagePath: "other.html" }, { templatePath: "other.html" }, { tag: "other-card" },
    { hostNode: [Infinity] }, { hostNode: Array(65).fill(0) }, { hostRect: { ...rect, width: NaN } },
    { entries: Array(101).fill(report.entries[0]) }, { entries: [{ ...report.entries[0], name: "x".repeat(257) }] },
    { entries: [{ ...report.entries[0], occurrence: 1 }] }, { entries: [{ ...report.entries[0], rect }] },
    { entries: [report.entries[0], { ...report.entries[1], assigned: true }] }]) {
    assert.equal(readSlotGhostReport({ ...report, ...change }, expected), undefined, JSON.stringify(change));
  }
});
