import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { nativeElementDepthMove, nativeElementMoveChoices, nativeElementMovePlan, nativeElementSiblingMove } from "../src/page-builder/native-move-choices";
import { applyGuardedSourceEdit } from "../src/page-builder/native-operations";

const source = '<main><section id="origin"><h2>Move me</h2><div><p>Descendant</p></div></section><section id="archive" aria-label="Archive &amp; notes"><p>Keep</p></section></main>';
test("choices name compatible other containers and exclude self, descendants, current parent and opaque trees", () => {
  const choices = nativeElementMoveChoices(source, [0, 0]);
  assert.deepEqual(choices.map(value => value.destination), [{ parent: [0, 1], index: 1 }]);
  assert.equal(choices[0].label, 'Inside section#archive “Archive & notes”, at the end (1.2)');
  assert.equal(nativeElementMoveChoices(source, [0, 0, 0]).some(value => value.destination.parent.join() === "0"), true);
  const opaque = '<main><p>Move</p><x-card><div id="hidden"></div></x-card><template><div id="hidden-template"></div></template><div id="target"></div></main>';
  assert.deepEqual(nativeElementMoveChoices(opaque, [0, 0]).map(value => value.destination.parent), [[0, 3]]);
  assert.deepEqual(nativeElementMoveChoices(opaque, [0, 1]).map(value => value.destination.parent), [[0, 3]]);
  assert.deepEqual(nativeElementMoveChoices(opaque, [0, 1, 0]), []);
  const slash = '<main><p>Move</p><svg><circle cx="1"/></svg><div id=target/ ></div></main>';
  assert.deepEqual(nativeElementMoveChoices(slash, [0, 0]).map(value => value.destination.parent), [[0, 2]]);
});

test("sibling paths remain exact with repeated identical nodes and distinguish edges from refusals", () => {
  const identical = '<main><p>Same</p><p>Same</p><p>Same</p></main>';
  const up = nativeElementSiblingMove(identical, [0, 1], "up");
  assert.equal(up.status, "moved");
  if (up.status === "moved") assert.deepEqual(up.selection, [0, 0]);
  const down = nativeElementSiblingMove(identical, [0, 1], "down");
  assert.equal(down.status, "moved");
  if (down.status === "moved") assert.deepEqual(down.selection, [0, 2]);
  assert.deepEqual(nativeElementSiblingMove(identical, [0, 0], "up"), { status: "stayed", reason: "edge" });
  assert.deepEqual(nativeElementSiblingMove(identical, [0, 2], "down"), { status: "stayed", reason: "edge" });
  assert.deepEqual(nativeElementMovePlan(identical, [0, 1], { parent: [0], index: 2 }), { status: "stayed", reason: "already-position" });
  for (const invalid of [[0, 8], [0, -1], [0, 0.5], []]) assert.equal(nativeElementSiblingMove(identical, invalid, "up").status, "refused");
  assert.equal(nativeElementSiblingMove('<main><p>broken</main>', [0, 0], "up").status, "refused");
  assert.deepEqual(nativeElementSiblingMove('<main><x-card></x-card></main>', [0, 0], "up"), { status: "stayed", reason: "edge" });
});

test("cross-parent paths account for earlier sibling removal and nested destination shifts", () => {
  const nested = '<main><section><p id="moving">Move</p><div id="later"><article><p>Keep</p></article></div></section><aside></aside></main>';
  const shift = nativeElementMovePlan(nested, [0, 0, 0], { parent: [0, 0, 1, 0], index: 1 });
  assert.equal(shift.status, "moved");
  if (shift.status === "moved") {
    assert.deepEqual(shift.selection, [0, 0, 0, 0, 1]);
    assert.match(applyGuardedSourceEdit(nested, shift.edit)!, /<article><p>Keep<\/p>\n<p id="moving">Move<\/p><\/article>/);
  }
  const outerShift = nativeElementMovePlan(nested, [0, 0], { parent: [0, 1], index: 0 });
  assert.equal(outerShift.status, "moved");
  if (outerShift.status === "moved") assert.deepEqual(outerShift.selection, [0, 0, 0]);
  const ancestor = nativeElementMovePlan(nested, [0, 0, 0], { parent: [0], index: 2 });
  assert.equal(ancestor.status, "moved");
  if (ancestor.status === "moved") assert.deepEqual(ancestor.selection, [0, 2]);
  assert.equal(nativeElementMovePlan(nested, [0, 0], { parent: [0, 0, 1], index: 0 }).status, "refused");
});

test("guards preserve comments, sensitive bytes and CRLF and reject stale source snapshots", () => {
  const bytes = '<main>\r\n  <section id="from">\r\n    <pre>  raw\n    keep\r\nbytes</pre><textarea> a\n  b </textarea>\r\n  </section>\r\n  <!-- keep neighbour -->\r\n  <aside id="to"><p>Unchanged</p></aside>\r\n</main>';
  const plan = nativeElementMovePlan(bytes, [0, 0], { parent: [0, 1], index: 1 });
  assert.equal(plan.status, "moved");
  if (plan.status !== "moved") return;
  const result = applyGuardedSourceEdit(bytes, plan.edit)!;
  assert.ok(result.includes('<pre>  raw\n    keep\r\nbytes</pre>'));
  assert.ok(result.includes('<textarea> a\n  b </textarea>'));
  assert.ok(result.includes('<!-- keep neighbour -->'));
  assert.ok(result.includes('<p>Unchanged</p>'));
  assert.ok(result.includes('\r\n'));
  assert.equal(applyGuardedSourceEdit(bytes.replace("Unchanged", "External edit"), plan.edit), undefined);
});

test("illegal table and nested form destinations are refused rather than advertised", () => {
  const table = '<main><p>Move</p><table><tbody><tr><td>Cell</td></tr></tbody></table><div></div></main>';
  assert.equal(nativeElementMovePlan(table, [0, 0], { parent: [0, 1, 0], index: 0 }).status, "refused");
  assert.deepEqual(nativeElementMoveChoices(table, [0, 0]).map(value => value.destination.parent), [[0, 2]]);
  const forms = '<main><form action="" method="post"><input></form><form action="" method="post"><div></div></form></main>';
  assert.deepEqual(nativeElementMoveChoices(forms, [0, 0]), []);
  assert.equal(nativeElementMovePlan(forms, [0, 0], { parent: [0, 1, 0], index: 0 }).status, "refused");
  const interactive = '<main><input><button>Go</button><a href="#">Link</a><div></div></main>';
  assert.equal(nativeElementMovePlan(interactive, [0, 0], { parent: [0, 1], index: 0 }).status, "refused");
  assert.equal(nativeElementMovePlan(interactive, [0, 0], { parent: [0, 2], index: 0 }).status, "refused");
  assert.deepEqual(nativeElementMoveChoices(interactive, [0, 0]).map(value => value.destination.parent), [[0, 3]]);
  const repaired = '<main><p><div>Repair</div></p></main>';
  assert.equal(nativeElementMovePlan(repaired, [0, 0], { parent: [0], index: 1 }).status, "refused");
});

test("full document paths ignore scripts, refresh metadata and template content", () => {
  const full = '<!doctype html><html><head><title>Page</title></head><body><script>"<div>not an element</div>"</script><meta http-equiv="refresh" content="5"><main><p>Move</p><template><div></div></template><div id="target"></div></main></body></html>';
  const choices = nativeElementMoveChoices(full, [0, 0]);
  assert.deepEqual(choices.map(value => value.destination), [{ parent: [0, 2], index: 0 }]);
  const plan = nativeElementMovePlan(full, [0, 0], choices[0].destination);
  assert.equal(plan.status, "moved");
  if (plan.status === "moved") assert.deepEqual(plan.selection, [0, 1, 0]);
});

test("Chromium resolves the computed moved selection after nested parent shifts", async () => {
  const original = '<main><section><p id="moved">Same</p><div><article><p>Same</p></article></div></section><aside></aside></main>';
  const plan = nativeElementMovePlan(original, [0, 0, 0], { parent: [0, 0, 1, 0], index: 1 });
  assert.equal(plan.status, "moved");
  if (plan.status !== "moved") return;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(applyGuardedSourceEdit(original, plan.edit)!);
    const selected = await page.evaluate(path => {
      let element: Element = document.body;
      for (const index of path) element = element.children[index];
      return { id: element.id, parent: element.parentElement!.tagName, identical: document.querySelectorAll("p").length };
    }, plan.selection);
    assert.deepEqual(selected, { id: "moved", parent: "ARTICLE", identical: 2 });
  } finally { await browser.close(); }
});


test("full-document body sibling edges count visible root children while unsupported fragment roots refuse", () => {
  const document = '<html><head></head><body><script>ignored()</script><meta http-equiv="refresh" content="2"><main></main><footer></footer></body></html>';
  assert.deepEqual(nativeElementSiblingMove(document, [1], "down"), { status: "stayed", reason: "edge" });
  assert.deepEqual(nativeElementSiblingMove(document, [0], "up"), { status: "stayed", reason: "edge" });
  const up = nativeElementSiblingMove(document, [1], "up");
  assert.equal(up.status, "moved");
  if (up.status === "moved") assert.deepEqual(up.selection, [0]);
  assert.equal(nativeElementSiblingMove('<main></main><footer></footer>', [1], "down").status, "refused");
});

test("metadata and opaque no-ops refuse before sibling edge classification", () => {
  for (const markup of ['<link rel=x>', '<meta name=x>', '<template><p>A</p></template>', '<svg></svg>']) {
    const source = `<main>${markup}<p>A</p></main>`;
    for (const index of [0,1]) assert.equal(nativeElementMovePlan(source, [0,0], {parent:[0],index}).status, 'refused', markup);
    for (const direction of ['up','down'] as const) assert.equal(nativeElementSiblingMove(source, [0,0], direction).status, 'refused', markup);
  }
});

test("depth moves leave a Div after it and enter the previous Div at its end", () => {
  const html = '<main><section><h2>Work</h2><div><p>First</p><card-project><h3 slot="title">Second</h3></card-project></div></section></main>';
  const out = nativeElementDepthMove(html, [0, 0, 1, 1], "out");
  assert.equal(out.status, "moved");
  if (out.status !== "moved") return;
  assert.deepEqual(out.selection, [0, 0, 2]);
  const moved = applyGuardedSourceEdit(html, out.edit)!;
  assert.match(moved, /<\/div>\s*<card-project>/);
  const into = nativeElementDepthMove(moved, out.selection, "in");
  assert.equal(into.status, "moved");
  if (into.status !== "moved") return;
  assert.deepEqual(into.selection, [0, 0, 1, 1]);
  // Source indentation is normalised by the existing move writer.
  assert.equal(applyGuardedSourceEdit(moved, into.edit)!.replace(/>\s+</g, "><"), html);
});

test("depth moves refuse missing containers, bands and opaque component parts", () => {
  const html = '<main><section><h2>Work</h2><p>Text</p><card-project><p slot="body">Part</p></card-project><p>After</p></section><p>Band</p></main>';
  const none = "Alt+→ moves a block into the Section or Div just above it; there is none.";
  for (const path of [[0, 0, 0], [0, 0, 1]]) assert.deepEqual(nativeElementDepthMove(html, path, "in"), { status: "refused", error: none });
  assert.deepEqual(nativeElementDepthMove(html, [0, 0, 3], "in"), { status: "refused", error: "Card project is a component: its parts are filled by editing them." });
  for (const direction of ["out", "in"] as const) {
    for (const path of [[0, 0], [0, 1]]) assert.deepEqual(nativeElementDepthMove(html, path, direction), { status: "refused", error: "A Section goes only between page bands." });
    for (const path of [[], [0, 9], [0, 0, 2, 0], [0, -1], [0, 0.5]]) assert.equal(nativeElementDepthMove(html, path, direction).status, "refused");
  }
  assert.deepEqual(nativeElementDepthMove(html, [0, 0, 1], "out"), { status: "refused", error: "Blocks go inside a Section or a Div, not straight between page bands." });
  assert.equal(nativeElementDepthMove('<main><section><article><div><p>Text</p></div></article></section></main>', [0, 0, 0, 0, 0], "out").status, "refused");
  assert.equal(nativeElementDepthMove('<main><section><div></div><meta name="x"></section></main>', [0, 0, 1], "in").status, "refused");
});
