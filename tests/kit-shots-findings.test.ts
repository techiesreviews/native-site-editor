import assert from "node:assert/strict";
import test from "node:test";
import { findingsList, findingsSections, type IndexLayoutFinding } from "../scripts/agents/shots/findings-list.ts";

function finding(screen: string, width: number, theme: string, kind: string, selector: string, detail: string): IndexLayoutFinding {
  return { screen, width, theme, finding: { kind, selector, text: "", detail } };
}

const tap = { kind: "tap-target", selector: ".file-row", text: "Files", detail: "28x24 px" };
const overflow = { kind: "overflow", selector: "body", text: "", detail: "scrollWidth 500" };
function shot(name: string | undefined, layout: IndexLayoutFinding["finding"][], overrides: Partial<Parameters<typeof findingsSections>[0][number]> = {}) {
  return { screen: "files", name, width: 390, theme: "light", ok: true, layout, ...overrides };
}

test("compare prints after-only findings under the after heading", () => {
  assert.deepEqual(findingsSections([shot("before", []), shot("after", [tap])]), [
    "layout findings (after):", "  files 390 light: tap-target .file-row — 28x24 px", "fixed since before:", "  none",
  ]);
});

test("compare prints resolved findings only under fixed since before", () => {
  assert.deepEqual(findingsSections([shot("before", [tap]), shot(undefined, [])]), [
    "layout findings (after):", "  none", "fixed since before:", "  files 390 light: tap-target .file-row — 28x24 px",
  ]);
});

test("compare keeps shared findings current and identifies fixes by kind and selector, not measured detail", () => {
  const changedDetail = { ...tap, detail: "30x24 px" };
  const changedKind = { ...tap, kind: "clipped" };
  const changedSelector = { ...tap, selector: ".other-row" };
  assert.deepEqual(findingsSections([
    shot("before", [tap, overflow, changedDetail, changedKind, changedSelector]),
    shot("after", [{ ...overflow, text: "changed text" }, tap]),
  ]), [
    "layout findings (after):",
    "  files 390 light: overflow body — scrollWidth 500",
    "  files 390 light: tap-target .file-row — 28x24 px",
    "fixed since before:",
    "  files 390 light: clipped .file-row — 28x24 px",
    "  files 390 light: tap-target .other-row — 28x24 px",
  ]);
});

test("unpaired before shots never report fixes across screens, widths or themes", () => {
  for (const overrides of [{ screen: "editor" }, { width: 1280 }, { theme: "dark" }]) {
    assert.deepEqual(findingsSections([shot("before", [tap]), shot("after", [], overrides)]),
      ["layout findings (after):", "  none", "fixed since before:", "  none"]);
  }
});

test("a run with only before shots (compare's base capture) lists them as before findings", () => {
  assert.deepEqual(findingsSections([shot("before", [tap]), shot("before", [tap], { theme: "dark" })]),
    ["layout findings (before):", "  files 390 light,dark: tap-target .file-row — 28x24 px"]);
  assert.deepEqual(findingsSections([shot("before", [])]), ["layout findings (before):", "  none"]);
});

test("failed after shots never confirm fixes", () => {
  assert.deepEqual(findingsSections([shot("before", [tap]), shot("after", [overflow], { ok: false })]), [
    "layout findings (after):", "  files 390 light: overflow body — scrollWidth 500", "fixed since before:", "  none",
  ]);
});

test("without before shots the heading, merging and empty output stay unchanged", () => {
  const shots = [shot(undefined, [tap]), shot("custom", [tap], { width: 1280, theme: "dark" })];
  assert.deepEqual(findingsSections(shots), ["layout findings:", "  files 390,1280 light,dark: tap-target .file-row — 28x24 px"]);
  assert.deepEqual(findingsSections([shot(undefined, [])]), []);
  assert.deepEqual(findingsSections([]), []);
});

test("compare merges widths and themes before applying separate after and fixed caps", () => {
  const before = Array.from({ length: 11 }, (_, i) => ({ ...tap, selector: `#fixed-${String(i).padStart(2, "0")}` }));
  const after = Array.from({ length: 21 }, (_, i) => ({ ...tap, selector: `#after-${String(i).padStart(2, "0")}` }));
  const shots = [390, 1280].flatMap(width => ["light", "dark"].flatMap(theme => [
    shot("before", before, { width, theme }), shot("after", after, { width, theme }),
  ]));
  const lines = findingsSections(shots);
  assert.equal(lines.length, 34);
  assert.equal(lines[1], "  files 390,1280 light,dark: tap-target #after-00 — 28x24 px");
  assert.equal(lines[21], "  … and 1 more (see index.json)");
  assert.equal(lines[22], "fixed since before:");
  assert.equal(lines[23], "  files 390,1280 light,dark: tap-target #fixed-00 — 28x24 px");
  assert.equal(lines[33], "  … and 1 more (see index.json)");
});

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
