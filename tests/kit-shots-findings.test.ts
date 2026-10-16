import assert from "node:assert/strict";
import test from "node:test";
import { findingsList, type IndexLayoutFinding } from "../scripts/agents/shots/findings-list.ts";

function finding(screen: string, width: number, theme: string, kind: string, selector: string, detail: string): IndexLayoutFinding {
  return { screen, width, theme, finding: { kind, selector, text: "", detail } };
}

test("merges identical findings across widths and themes, ascending widths", () => {
  const lines = findingsList([
    finding("media-gallery", 390, "light", "overlap", "button.next", "overlaps 10x10 px"),
    finding("media-gallery", 1280, "dark", "overlap", "button.next", "overlaps 10x10 px"),
    finding("media-gallery", 390, "dark", "overlap", "button.next", "overlaps 10x10 px"),
  ]);
  assert.deepEqual(lines, ["media-gallery 390,1280 light,dark: overlap button.next — overlaps 10x10 px"]);
});

test("orders by screen, then kind, then selector", () => {
  const lines = findingsList([
    finding("editor", 390, "light", "contrast", "a.link", "3.1:1"),
    finding("editor", 390, "light", "clipped", "button.next", "cut 2 px"),
    finding("editor", 390, "light", "contrast", "button.next", "3.1:1"),
    finding("media-gallery", 390, "light", "overflow", "body", "scrollWidth 500"),
  ]);
  assert.deepEqual(lines, [
    "editor 390 light: clipped button.next — cut 2 px",
    "editor 390 light: contrast a.link — 3.1:1",
    "editor 390 light: contrast button.next — 3.1:1",
    "media-gallery 390 light: overflow body — scrollWidth 500",
  ]);
});

test("caps at limit and reports the merged lines left out", () => {
  const findings = Array.from({ length: 5 }, (_, index) => finding("editor", 390, "light", "overlap", `button#${index}`, "same"));
  assert.deepEqual(findingsList(findings, 2), [
    "editor 390 light: overlap button#0 — same",
    "editor 390 light: overlap button#1 — same",
    "… and 3 more (see index.json)",
  ]);
});

test("empty input prints nothing", () => {
  assert.deepEqual(findingsList([]), []);
});

test("the default limit counts merged findings, not raw ones", () => {
  const findings: IndexLayoutFinding[] = [];
  for (let i = 0; i < 21; i++) {
    const finding = { kind: "tap-target", selector: `#b${String(i).padStart(2, "0")}`, text: "", detail: "28x24 px" };
    for (const width of [390, 1280]) for (const theme of ["light", "dark"]) findings.push({ screen: "editor", width, theme, finding });
  }
  const lines = findingsList(findings);
  assert.equal(lines.length, 21);
  assert.equal(lines[0], "editor 390,1280 light,dark: tap-target #b00 — 28x24 px");
  assert.equal(lines[20], "… and 1 more (see index.json)");
});
