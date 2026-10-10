import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { nativeElementDepthMove, nativeElementMovePlan, nativeElementSiblingMove, nativeElementKeyMove, nativeElementMoveMessage, nativeSectionMovePlan } from "../src/page-builder/native-move-choices";
import { applyGuardedSourceEdit } from "../src/page-builder/native-operations";

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

test("a section moves among its siblings by the editor's engine (MCP move_section): whole lines, no blank lines, CRLF kept", () => {
  const moved = (source: string, from: number[], parent: number[], index: number) => {
    const plan = nativeSectionMovePlan(source, from, parent, index);
    assert.equal(plan.status, "moved");
    return plan.status === "moved" ? { html: applyGuardedSourceEdit(source, plan.edit)!, selection: plan.selection } : undefined;
  };
  const page = `<main>\n  <section class="a">\n    <h2>A</h2>\n  </section>\n  <section class="b"><p>B</p></section>\n  <img src="x.png" alt="">\n</main>`;
  // To the end, to the front, and one gap down; the selection follows the section.
  assert.deepEqual(moved(page, [0, 0], [0], 3), { html: `<main>\n  <section class="b"><p>B</p></section>\n  <img src="x.png" alt="">\n  <section class="a">\n    <h2>A</h2>\n  </section>\n</main>`, selection: [0, 2] });
  assert.deepEqual(moved(page, [0, 2], [0], 0), { html: `<main>\n  <img src="x.png" alt="">\n  <section class="a">\n    <h2>A</h2>\n  </section>\n  <section class="b"><p>B</p></section>\n</main>`, selection: [0, 0] });
  assert.deepEqual(moved(page, [0, 0], [0], 2)?.selection, [0, 1]);
  // Its own gaps stay; a gap that is not there, another parent and an empty path are refused.
  assert.deepEqual(nativeSectionMovePlan(page, [0, 0], [0], 0), { status: "stayed", reason: "already-position" });
  assert.deepEqual(nativeSectionMovePlan(page, [0, 0], [0], 1), { status: "stayed", reason: "already-position" });
  for (const [from, parent, index] of [[[0, 0], [0], 4], [[0, 0], [0], -1], [[0, 0], [], 0], [[0, 0], [0, 1], 0], [[], [], 0]] as const)
    assert.equal(nativeSectionMovePlan(page, [...from], [...parent], index).status, "refused");
  // Sections of a whole document's <body>, one blank line between two: it stays where it was, and none is added.
  const doc = `<!doctype html>\n<html>\n<body>\n  <section>A</section>\n\n  <section>\n    <p>B</p>\n  </section>\n  <section>C</section>\n</body>\n</html>\n`;
  const down = moved(doc, [0], [], 3)!;
  assert.equal(down.html, `<!doctype html>\n<html>\n<body>\n\n  <section>\n    <p>B</p>\n  </section>\n  <section>C</section>\n  <section>A</section>\n</body>\n</html>\n`);
  assert.deepEqual(down.selection, [2]);
  assert.doesNotMatch(moved(doc, [2], [], 0)!.html, /\n[ \t]*\n[ \t]*\n/);
  // CRLF sources keep CRLF and gain no bare LF.
  const crlf = `<main>\r\n  <section>\r\n    <h2>A</h2>\r\n  </section>\r\n  <section>B</section>\r\n  <section>C</section>\r\n</main>\r\n`;
  assert.equal(moved(crlf, [0, 0], [0], 3)!.html, `<main>\r\n  <section>B</section>\r\n  <section>C</section>\r\n  <section>\r\n    <h2>A</h2>\r\n  </section>\r\n</main>\r\n`);
  assert.equal(moved(crlf, [0, 2], [0], 0)!.html, `<main>\r\n  <section>C</section>\r\n  <section>\r\n    <h2>A</h2>\r\n  </section>\r\n  <section>B</section>\r\n</main>\r\n`);
  // Move up/down on a section (the edit bar, Alt+Up/Down) is the same engine, one edit.
  const up = nativeElementSiblingMove(crlf, [0, 1], "up");
  assert.equal(up.status, "moved");
  if (up.status === "moved") assert.equal(applyGuardedSourceEdit(crlf, up.edit), `<main>\r\n  <section>B</section>\r\n  <section>\r\n    <h2>A</h2>\r\n  </section>\r\n  <section>C</section>\r\n</main>\r\n`);
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
  assert.equal(nativeElementMovePlan(table, [0, 0], { parent: [0, 2], index: 0 }).status, "moved");
  const forms = '<main><form action="" method="post"><input></form><form action="" method="post"><div></div></form></main>';
  assert.equal(nativeElementMovePlan(forms, [0, 0], { parent: [0, 1, 0], index: 0 }).status, "refused");
  const interactive = '<main><input><button>Go</button><a href="#">Link</a><div></div></main>';
  assert.equal(nativeElementMovePlan(interactive, [0, 0], { parent: [0, 1], index: 0 }).status, "refused");
  assert.equal(nativeElementMovePlan(interactive, [0, 0], { parent: [0, 2], index: 0 }).status, "refused");
  assert.equal(nativeElementMovePlan(interactive, [0, 0], { parent: [0, 3], index: 0 }).status, "moved");
  const repaired = '<main><p><div>Repair</div></p></main>';
  assert.equal(nativeElementMovePlan(repaired, [0, 0], { parent: [0], index: 1 }).status, "refused");
});

test("full document paths ignore scripts, refresh metadata and template content", () => {
  const full = '<!doctype html><html><head><title>Page</title></head><body><script>"<div>not an element</div>"</script><meta http-equiv="refresh" content="5"><main><p>Move</p><template><div></div></template><div id="target"></div></main></body></html>';
  const plan = nativeElementMovePlan(full, [0, 0], { parent: [0, 2], index: 0 });
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

test("a component instance moves among its siblings whole", () => {
  const source = '<main><x-card><p>In</p></x-card><p>A</p></main>';
  assert.equal(nativeElementMovePlan(source, [0, 0], { parent: [0], index: 0 }).status, "stayed");
  const down = nativeElementSiblingMove(source, [0, 0], "down");
  assert.equal(down.status, "moved");
  if (down.status === "moved") assert.deepEqual(down.selection, [0, 1]);
});

const workItems = (tag: string, slot: string) => tag === "section-work" && ["", "items", "more"].includes(slot);

test("Alt up/down reorders only the slot's own items and stays at its edges", () => {
  for (const slot of ["", "items"]) {
    const assignment = slot ? ' slot="items"' : "";
    const a = `<card-project${assignment}>A</card-project>`;
    const b = `<card-project${assignment}>B</card-project>`;
    const title = '<h2 slot="title">Title</h2>', other = '<p slot="more">Other items</p>';
    const source = `<main><section-work>${title}${a}${other}${b}${title}</section-work></main>`;
    for (const [path, direction, selection] of [[[0, 0, 1], "down", [0, 0, 3]], [[0, 0, 3], "up", [0, 0, 1]]] as const) {
      const result = nativeElementSiblingMove(source, path, direction, workItems);
      assert.equal(result.status, "moved");
      if (result.status === "moved") {
        assert.deepEqual(result.selection, selection);
        const output = applyGuardedSourceEdit(source, result.edit)!;
        assert.ok(output.indexOf(b) < output.indexOf(a));
        assert.ok(output.includes(other));
      }
    }
    assert.deepEqual(nativeElementSiblingMove(source, [0, 0, 1], "up", workItems), { status: "stayed", reason: "edge" });
    assert.deepEqual(nativeElementSiblingMove(source, [0, 0, 3], "down", workItems), { status: "stayed", reason: "edge" });
    assert.deepEqual(nativeElementMovePlan(source, [0, 0, 1], { parent: [0, 0], index: 1, slot }, workItems), { status: "stayed", reason: "already-position" });
    assert.equal(nativeElementSiblingMove(source, [0, 0, 1], "down").status, "refused");
    assert.equal(nativeElementSiblingMove(source, [0, 0, 0], "down", workItems).status, "refused");
  }
});

test("Alt left/right moves an items child out after its instance or into the previous Div in its slot", () => {
  const source = '<main><div><section-work><div slot="items"><p>Before</p></div><h2 slot="title">Title</h2><card-project slot="items"><h3 slot="title">A</h3></card-project></section-work></div></main>';
  const path = [0, 0, 0, 2];
  const out = nativeElementDepthMove(source, path, "out", workItems);
  assert.equal(out.status, "moved");
  if (out.status === "moved") {
    assert.deepEqual(out.selection, [0, 0, 1]);
    assert.match(applyGuardedSourceEdit(source, out.edit)!, /<\/section-work>\s*<card-project><h3 slot="title">A<\/h3>/);
  }
  const into = nativeElementDepthMove(source, path, "in", workItems);
  assert.equal(into.status, "moved");
  if (into.status === "moved") {
    assert.deepEqual(into.selection, [0, 0, 0, 0, 1]);
    assert.match(applyGuardedSourceEdit(source, into.edit)!, /<p>Before<\/p>\s*<card-project><h3 slot="title">A<\/h3>/);
  }
  const nested = '<main><div><section-work><section-work slot="items"><p>A</p><div></div><p>B</p></section-work></section-work></div></main>';
  assert.equal(nativeElementDepthMove(nested, [0, 0, 0, 0, 2], "in", workItems).status, "moved");
  for (const direction of ["out", "in"] as const) {
    assert.equal(nativeElementDepthMove(source, path, direction).status, "refused");
    for (const sealed of [[0, 0, 0, 1], [...path, 0]]) assert.equal(nativeElementDepthMove(source, sealed, direction, workItems).status, "refused");
  }
  const band = '<main><section-work><card-project></card-project></section-work></main>';
  assert.equal(nativeElementDepthMove(band, [0, 0, 0], "out", workItems).status, "refused");
  const otherSlot = '<main><div><section-work><div slot="more"></div><p slot="items">A</p></section-work></div></main>';
  assert.equal(nativeElementDepthMove(otherSlot, [0, 0, 0, 1], "in", workItems).status, "refused");
});


test("keyboard move messages name the old and new containers from the painted source", () => {
  const source = '<main><section><div class="flow"><p>A</p><p>B</p></div><div class="cards"><p>C</p></div><p>D</p></section></main>';
  assert.equal(nativeElementMoveMessage(source, [0, 0, 0, 1], "out"), "Moved out of Div (stack) into Section");
  assert.equal(nativeElementMoveMessage(source, [0, 0, 2], "in"), "Moved into Div (grid)");
  assert.equal(nativeElementMoveMessage(source, [0, 0, 0, 1], "up"), "Moved up in Div (stack)");
  assert.equal(nativeElementMoveMessage(source, [0, 0, 0], "down"), "Moved down in Section");
  const items = '<main><section-work><div slot="items" class="cards"></div><h2 slot="title">Title</h2><card-project slot="items"></card-project></section-work></main>';
  assert.equal(nativeElementMoveMessage(items, [0, 0, 2], "up"), "Moved up in Section work");
  assert.equal(nativeElementMoveMessage(items, [0, 0, 0], "down"), "Moved down in Section work");
  assert.equal(nativeElementMoveMessage(items, [0, 0, 2], "in"), "Moved into Div (grid)");
});

test("canvas and Structure keyboard rule moves Paragraphs and cards with the same selection and refusals", () => {
  const source = '<main><section><p>A</p><p>B</p><card-project></card-project></section></main>';
  for (const direction of ["up", "down"] as const) {
    const result = nativeElementKeyMove(source, [0, 0, 1], direction);
    assert.equal(result.status, "moved");
    if (result.status === "moved") {
      assert.deepEqual(result.selection, [0, 0, direction === "up" ? 0 : 2]);
      const output = applyGuardedSourceEdit(source, result.edit)!.replace(/>\s+</g, "><");
      assert.ok(output.includes(direction === "up" ? "<p>B</p><p>A</p><card-project>" : "<p>A</p><card-project></card-project><p>B</p>"));
    }
  }
  const items = '<main><section-work><h2 slot="title">Title</h2><card-project>A</card-project><card-project>B</card-project></section-work></main>';
  assert.equal(nativeElementKeyMove(items, [0, 0, 1], "down", workItems).status, "moved");
  assert.deepEqual(nativeElementKeyMove(items, [0, 0, 1], "up", workItems), { status: "stayed", reason: "edge" });
  assert.equal(nativeElementKeyMove(items, [0, 0, 0], "down", workItems).status, "refused");
});
