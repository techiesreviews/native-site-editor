// The Block move rules (src/page-builder/block-move-rules.ts): the page's and
// the template's adapters of one seam, each case on both where it applies.
// (Moved here from native-move-choices.test.ts and the template cases of
// move-anywhere.test.ts and block-insert.test.ts, sturdy-base slice 30.)
import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import {
  nativeElementDepthMove, nativeElementMoveMessage, nativeSectionMovePlan, pageRules, templateRules,
  type MovePlan, type MoveRules, type MoveStep,
} from "../src/page-builder/block-move-rules";
import { templateSlotRefusal } from "../src/page-builder/native-elements";
import { applyGuardedSourceEdit, type ItemsSlotRule } from "../src/page-builder/native-operations";

const none: ItemsSlotRule = () => false;
const workItems: ItemsSlotRule = (tag, slot) => tag === "section-work" && ["", "items", "more"].includes(slot);
/** Both adapters, named for the failure message: a `<main>` stands for the template's element. */
const both = (items = none): [string, MoveRules][] => [["page", pageRules(items)], ["template", templateRules()]];
const page = (items = none) => pageRules(items);
const html = (source: string, plan: MovePlan) => plan.status === "moved" ? applyGuardedSourceEdit(source, plan.edit) : undefined;
/** A press at `at`: what moves (the rules' subject), its step, and the part pressed kept selected. */
function stepAt(rules: MoveRules, source: string, at: number[], direction: MoveStep): MovePlan {
  const from = rules.subject(source, at);
  if (!from) return { status: "refused", error: "nothing moves" };
  const plan = rules.step(source, from, direction);
  return plan.status === "moved" ? { ...plan, selection: [...plan.selection, ...at.slice(from.length)] } : plan;
}

test("sibling paths remain exact with repeated identical nodes and distinguish edges from refusals", () => {
  const identical = '<main><p>Same</p><p>Same</p><p>Same</p></main>';
  for (const [name, rules] of both()) {
    const up = rules.step(identical, [0, 1], "up");
    assert.equal(up.status, "moved", name);
    if (up.status === "moved") assert.deepEqual(up.selection, [0, 0], name);
    const down = rules.step(identical, [0, 1], "down");
    assert.equal(down.status, "moved", name);
    if (down.status === "moved") assert.deepEqual(down.selection, [0, 2], name);
    assert.deepEqual(rules.step(identical, [0, 0], "up"), { status: "stayed", reason: "edge" }, name);
    assert.deepEqual(rules.step(identical, [0, 2], "down"), { status: "stayed", reason: "edge" }, name);
    assert.deepEqual(rules.to(identical, [0, 1], { parent: [0], index: 2 }), { status: "stayed", reason: "already-position" }, name);
    for (const invalid of [[0, 8], [0, -1], [0, 0.5], []]) {
      assert.equal(rules.step(identical, invalid, "up").status, "refused", `${name} ${invalid}`);
      assert.equal(rules.subject(identical, invalid), undefined, `${name} ${invalid}`);
    }
    assert.equal(rules.step('<main><p>broken</main>', [0, 0], "up").status, "refused", name);
    assert.deepEqual(rules.step('<main><x-card></x-card></main>', [0, 0], "up"), { status: "stayed", reason: "edge" }, name);
  }
});

test("a section moves among its siblings by the editor's engine (MCP move_section): whole lines, no blank lines, CRLF kept", () => {
  const moved = (source: string, from: number[], parent: number[], index: number) => {
    const plan = nativeSectionMovePlan(source, from, parent, index);
    assert.equal(plan.status, "moved");
    return plan.status === "moved" ? { html: applyGuardedSourceEdit(source, plan.edit)!, selection: plan.selection } : undefined;
  };
  const source = `<main>\n  <section class="a">\n    <h2>A</h2>\n  </section>\n  <section class="b"><p>B</p></section>\n  <img src="x.png" alt="">\n</main>`;
  // To the end, to the front, and one gap down; the selection follows the section.
  assert.deepEqual(moved(source, [0, 0], [0], 3), { html: `<main>\n  <section class="b"><p>B</p></section>\n  <img src="x.png" alt="">\n  <section class="a">\n    <h2>A</h2>\n  </section>\n</main>`, selection: [0, 2] });
  assert.deepEqual(moved(source, [0, 2], [0], 0), { html: `<main>\n  <img src="x.png" alt="">\n  <section class="a">\n    <h2>A</h2>\n  </section>\n  <section class="b"><p>B</p></section>\n</main>`, selection: [0, 0] });
  assert.deepEqual(moved(source, [0, 0], [0], 2)?.selection, [0, 1]);
  // Its own gaps stay; a gap that is not there, another parent and an empty path are refused.
  assert.deepEqual(nativeSectionMovePlan(source, [0, 0], [0], 0), { status: "stayed", reason: "already-position" });
  assert.deepEqual(nativeSectionMovePlan(source, [0, 0], [0], 1), { status: "stayed", reason: "already-position" });
  for (const [from, parent, index] of [[[0, 0], [0], 4], [[0, 0], [0], -1], [[0, 0], [], 0], [[0, 0], [0, 1], 0], [[], [], 0]] as const)
    assert.equal(nativeSectionMovePlan(source, [...from], [...parent], index).status, "refused");
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
  // In an instance's items slot a section keeps its own slot; without the items rule the instance stays closed.
  const list = `<main>\n  <section-list>\n    <section>A</section>\n    <section slot="more">X</section>\n    <section>B</section>\n  </section-list>\n</main>`;
  const items = (tag: string) => tag === "section-list";
  const inSlot = nativeSectionMovePlan(list, [0, 0, 1], [0, 0], 0, items);
  assert.equal(inSlot.status, "moved");
  if (inSlot.status === "moved") assert.equal(applyGuardedSourceEdit(list, inSlot.edit), `<main>\n  <section-list>\n    <section slot="more">X</section>\n    <section>A</section>\n    <section>B</section>\n  </section-list>\n</main>`);
  assert.equal(nativeSectionMovePlan(list, [0, 0, 0], [0, 0], 3).status, "refused");
  // Move up/down on a section (the edit bar, Alt+Up/Down) is the same engine, one edit, on either document.
  for (const [name, rules] of both())
    assert.equal(html(crlf, rules.step(crlf, [0, 1], "up")), `<main>\r\n  <section>B</section>\r\n  <section>\r\n    <h2>A</h2>\r\n  </section>\r\n  <section>C</section>\r\n</main>\r\n`, name);
});

test("cross-parent paths account for earlier sibling removal and nested destination shifts", () => {
  const nested = '<main><section><p id="moving">Move</p><div id="later"><article><p>Keep</p></article></div></section><aside></aside></main>';
  for (const [name, rules] of both()) {
    const shift = rules.to(nested, [0, 0, 0], { parent: [0, 0, 1, 0], index: 1 });
    assert.equal(shift.status, "moved", name);
    if (shift.status === "moved") {
      assert.deepEqual(shift.selection, [0, 0, 0, 0, 1], name);
      assert.match(html(nested, shift)!, /<article><p>Keep<\/p>\n<p id="moving">Move<\/p><\/article>/, name);
    }
    const outerShift = rules.to(nested, [0, 0], { parent: [0, 1], index: 0 });
    assert.equal(outerShift.status, "moved", name);
    if (outerShift.status === "moved") assert.deepEqual(outerShift.selection, [0, 0, 0], name);
    const ancestor = rules.to(nested, [0, 0, 0], { parent: [0], index: 2 });
    assert.equal(ancestor.status, "moved", name);
    if (ancestor.status === "moved") assert.deepEqual(ancestor.selection, [0, 2], name);
    assert.equal(rules.to(nested, [0, 0], { parent: [0, 0, 1], index: 0 }).status, "refused", name);
    assert.equal(rules.refusal(nested, [0, 0], [0, 0, 1]), "A block cannot go inside itself.", name);
  }
});

test("guards preserve comments, sensitive bytes and CRLF and reject stale source snapshots", () => {
  const bytes = '<main>\r\n  <section id="from">\r\n    <pre>  raw\n    keep\r\nbytes</pre><textarea> a\n  b </textarea>\r\n  </section>\r\n  <!-- keep neighbour -->\r\n  <aside id="to"><p>Unchanged</p></aside>\r\n</main>';
  for (const [name, rules] of both()) {
    const plan = rules.to(bytes, [0, 0], { parent: [0, 1], index: 1 });
    assert.equal(plan.status, "moved", name);
    if (plan.status !== "moved") continue;
    const result = applyGuardedSourceEdit(bytes, plan.edit)!;
    assert.ok(result.includes('<pre>  raw\n    keep\r\nbytes</pre>'), name);
    assert.ok(result.includes('<textarea> a\n  b </textarea>'), name);
    assert.ok(result.includes('<!-- keep neighbour -->'), name);
    assert.ok(result.includes('<p>Unchanged</p>'), name);
    assert.ok(result.includes('\r\n'), name);
    assert.equal(applyGuardedSourceEdit(bytes.replace("Unchanged", "External edit"), plan.edit), undefined, name);
  }
});

test("illegal table and nested form destinations are refused rather than advertised", () => {
  const table = '<main><p>Move</p><table><tbody><tr><td>Cell</td></tr></tbody></table><div></div></main>';
  const forms = '<main><form action="" method="post"><input></form><form action="" method="post"><div></div></form></main>';
  const interactive = '<main><input><button>Go</button><a href="#">Link</a><div></div></main>';
  for (const [name, rules] of both()) {
    assert.equal(rules.to(table, [0, 0], { parent: [0, 1, 0], index: 0 }).status, "refused", name);
    assert.equal(rules.to(table, [0, 0], { parent: [0, 2], index: 0 }).status, "moved", name);
    assert.equal(rules.to(forms, [0, 0], { parent: [0, 1, 0], index: 0 }).status, "refused", name);
    assert.equal(rules.to(interactive, [0, 0], { parent: [0, 1], index: 0 }).status, "refused", name);
    assert.equal(rules.to(interactive, [0, 0], { parent: [0, 2], index: 0 }).status, "refused", name);
    assert.equal(rules.to(interactive, [0, 0], { parent: [0, 3], index: 0 }).status, "moved", name);
    assert.equal(rules.to('<main><p><div>Repair</div></p></main>', [0, 0], { parent: [0], index: 1 }).status, "refused", name);
  }
});

test("full document paths ignore scripts, refresh metadata and template content", () => {
  const full = '<!doctype html><html><head><title>Page</title></head><body><script>"<div>not an element</div>"</script><meta http-equiv="refresh" content="5"><main><p>Move</p><template><div></div></template><div id="target"></div></main></body></html>';
  const plan = page().to(full, [0, 0], { parent: [0, 2], index: 0 });
  assert.equal(plan.status, "moved");
  if (plan.status === "moved") assert.deepEqual(plan.selection, [0, 1, 0]);
});

test("Chromium resolves the computed moved selection after nested parent shifts", async () => {
  const original = '<main><section><p id="moved">Same</p><div><article><p>Same</p></article></div></section><aside></aside></main>';
  const plan = page().to(original, [0, 0, 0], { parent: [0, 0, 1, 0], index: 1 });
  assert.equal(plan.status, "moved");
  if (plan.status !== "moved") return;
  const browser = await chromium.launch({ headless: true });
  try {
    const tab = await browser.newPage();
    await tab.setContent(html(original, plan)!);
    const selected = await tab.evaluate(path => {
      let element: Element = document.body;
      for (const index of path) element = element.children[index];
      return { id: element.id, parent: element.parentElement!.tagName, identical: document.querySelectorAll("p").length };
    }, plan.selection);
    assert.deepEqual(selected, { id: "moved", parent: "ARTICLE", identical: 2 });
  } finally { await browser.close(); }
});

test("full-document body sibling edges count visible root children while unsupported fragment roots refuse (page only: a template's root stays)", () => {
  const document = '<html><head></head><body><script>ignored()</script><meta http-equiv="refresh" content="2"><main></main><footer></footer></body></html>';
  const rules = page();
  assert.deepEqual(rules.step(document, [1], "down"), { status: "stayed", reason: "edge" });
  assert.deepEqual(rules.step(document, [0], "up"), { status: "stayed", reason: "edge" });
  const up = rules.step(document, [1], "up");
  assert.equal(up.status, "moved");
  if (up.status === "moved") assert.deepEqual(up.selection, [0]);
  assert.equal(rules.step('<main></main><footer></footer>', [1], "down").status, "refused");
  assert.equal(templateRules().subject(document, [1]), undefined);
});

test("metadata and opaque no-ops refuse before sibling edge classification", () => {
  for (const markup of ['<link rel=x>', '<meta name=x>', '<template><p>A</p></template>', '<svg></svg>']) {
    const source = `<main>${markup}<p>A</p></main>`;
    for (const [name, rules] of both()) {
      for (const index of [0, 1]) assert.equal(rules.to(source, [0, 0], { parent: [0], index }).status, "refused", `${name} ${markup}`);
      for (const direction of ["up", "down"] as const) assert.equal(rules.step(source, [0, 0], direction).status, "refused", `${name} ${markup}`);
    }
  }
  // An island is no subject on a page; nor is anything inside one.
  assert.equal(page().subject("<main><template><p>A</p></template><p>B</p></main>", [0, 0]), undefined);
  assert.equal(page().subject("<main><svg><g></g></svg></main>", [0, 0, 0]), undefined);
  assert.deepEqual(page().subject("<main><x-card><p>in</p></x-card></main>", [0, 0]), [0, 0]);
  assert.equal(page().subject("<main><x-card><p>in</p></x-card></main>", [0, 0, 0]), undefined);
});

test("depth moves leave a Div after it and enter the previous Div at its end", () => {
  const source = '<main><section><h2>Work</h2><div><p>First</p><card-project><h3 slot="title">Second</h3></card-project></div></section></main>';
  const out = page().step(source, [0, 0, 1, 1], "out");
  assert.equal(out.status, "moved");
  if (out.status !== "moved") return;
  assert.deepEqual(out.selection, [0, 0, 2]);
  const moved = html(source, out)!;
  assert.match(moved, /<\/div>\s*<card-project>/);
  const into = page().step(moved, out.selection, "in");
  assert.equal(into.status, "moved");
  if (into.status !== "moved") return;
  assert.deepEqual(into.selection, [0, 0, 1, 1]);
  // Source indentation is normalised by the existing move writer.
  assert.equal(html(moved, into)!.replace(/>\s+</g, "><"), source);
});

test("depth moves refuse missing containers, bands and opaque component parts", () => {
  const source = '<main><section><h2>Work</h2><p>Text</p><card-project><p slot="body">Part</p></card-project><p>After</p></section><p>Band</p></main>';
  const none = "Alt+→ moves a block into the Section or Div just above it; there is none.";
  for (const path of [[0, 0, 0], [0, 0, 1]]) assert.deepEqual(nativeElementDepthMove(source, path, "in"), { status: "refused", error: none });
  assert.deepEqual(nativeElementDepthMove(source, [0, 0, 3], "in"), { status: "refused", error: "Card project is a component: its parts are filled by editing them." });
  for (const direction of ["out", "in"] as const) {
    for (const path of [[0, 0], [0, 1]]) assert.deepEqual(nativeElementDepthMove(source, path, direction), { status: "refused", error: "A Section goes only between page bands." });
    for (const path of [[], [0, 9], [0, 0, 2, 0], [0, -1], [0, 0.5]]) assert.equal(nativeElementDepthMove(source, path, direction).status, "refused");
  }
  assert.deepEqual(nativeElementDepthMove(source, [0, 0, 1], "out"), { status: "refused", error: "Blocks go inside a Section or a Div, not straight between page bands." });
  assert.equal(nativeElementDepthMove('<main><section><article><div><p>Text</p></div></article></section></main>', [0, 0, 0, 0, 0], "out").status, "refused");
  assert.equal(nativeElementDepthMove('<main><section><div></div><meta name="x"></section></main>', [0, 0, 1], "in").status, "refused");
});

test("a component instance moves among its siblings whole", () => {
  const source = '<main><x-card><p>In</p></x-card><p>A</p></main>';
  for (const [name, rules] of both()) {
    assert.equal(rules.to(source, [0, 0], { parent: [0], index: 0 }).status, "stayed", name);
    const down = rules.step(source, [0, 0], "down");
    assert.equal(down.status, "moved", name);
    if (down.status === "moved") assert.deepEqual(down.selection, [0, 1], name);
  }
});

test("Alt up/down reorders only the slot's own items and stays at its edges (page: a template's nested component stays closed)", () => {
  for (const slot of ["", "items"]) {
    const assignment = slot ? ' slot="items"' : "";
    const a = `<card-project${assignment}>A</card-project>`;
    const b = `<card-project${assignment}>B</card-project>`;
    const title = '<h2 slot="title">Title</h2>', other = '<p slot="more">Other items</p>';
    const source = `<main><section-work>${title}${a}${other}${b}${title}</section-work></main>`;
    const rules = page(workItems);
    for (const [path, direction, selection] of [[[0, 0, 1], "down", [0, 0, 3]], [[0, 0, 3], "up", [0, 0, 1]]] as const) {
      const result = rules.step(source, [...path], direction);
      assert.equal(result.status, "moved");
      if (result.status === "moved") {
        assert.deepEqual(result.selection, selection);
        const output = html(source, result)!;
        assert.ok(output.indexOf(b) < output.indexOf(a));
        assert.ok(output.includes(other));
      }
    }
    assert.deepEqual(rules.step(source, [0, 0, 1], "up"), { status: "stayed", reason: "edge" });
    assert.deepEqual(rules.step(source, [0, 0, 3], "down"), { status: "stayed", reason: "edge" });
    assert.deepEqual(rules.to(source, [0, 0, 1], { parent: [0, 0], index: 1, slot }), { status: "stayed", reason: "already-position" });
    assert.equal(page().step(source, [0, 0, 1], "down").status, "refused");
    assert.equal(rules.step(source, [0, 0, 0], "down").status, "refused");
    assert.deepEqual(rules.subject(source, [0, 0, 1]), [0, 0, 1]);
    assert.equal(rules.subject(source, [0, 0, 0]), undefined);
    assert.equal(templateRules().subject(source, [0, 0, 1]), undefined);
  }
});

test("Alt left/right moves an items child out after its instance or into the previous Div in its slot", () => {
  const source = '<main><div><section-work><div slot="items"><p>Before</p></div><h2 slot="title">Title</h2><card-project slot="items"><h3 slot="title">A</h3></card-project></section-work></div></main>';
  const path = [0, 0, 0, 2], rules = page(workItems);
  const out = rules.step(source, path, "out");
  assert.equal(out.status, "moved");
  if (out.status === "moved") {
    assert.deepEqual(out.selection, [0, 0, 1]);
    assert.match(html(source, out)!, /<\/section-work>\s*<card-project><h3 slot="title">A<\/h3>/);
  }
  const into = rules.step(source, path, "in");
  assert.equal(into.status, "moved");
  if (into.status === "moved") {
    assert.deepEqual(into.selection, [0, 0, 0, 0, 1]);
    assert.match(html(source, into)!, /<p>Before<\/p>\s*<card-project><h3 slot="title">A<\/h3>/);
  }
  const nested = '<main><div><section-work><section-work slot="items"><p>A</p><div></div><p>B</p></section-work></section-work></div></main>';
  assert.equal(rules.step(nested, [0, 0, 0, 0, 2], "in").status, "moved");
  for (const direction of ["out", "in"] as const) {
    assert.equal(page().step(source, path, direction).status, "refused");
    for (const sealed of [[0, 0, 0, 1], [...path, 0]]) assert.equal(rules.step(source, sealed, direction).status, "refused");
  }
  const band = '<main><section-work><card-project></card-project></section-work></main>';
  assert.equal(rules.step(band, [0, 0, 0], "out").status, "refused");
  const otherSlot = '<main><div><section-work><div slot="more"></div><p slot="items">A</p></section-work></div></main>';
  assert.equal(rules.step(otherSlot, [0, 0, 0, 1], "in").status, "refused");
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
  for (const [name, rules] of both()) {
    for (const direction of ["up", "down"] as const) {
      const result = rules.step(source, [0, 0, 1], direction);
      assert.equal(result.status, "moved", name);
      if (result.status === "moved") {
        assert.deepEqual(result.selection, [0, 0, direction === "up" ? 0 : 2], name);
        const output = html(source, result)!.replace(/>\s+</g, "><");
        assert.ok(output.includes(direction === "up" ? "<p>B</p><p>A</p><card-project>" : "<p>A</p><card-project></card-project><p>B</p>"), name);
      }
    }
  }
  const items = '<main><section-work><h2 slot="title">Title</h2><card-project>A</card-project><card-project>B</card-project></section-work></main>';
  assert.equal(page(workItems).step(items, [0, 0, 1], "down").status, "moved");
  assert.deepEqual(page(workItems).step(items, [0, 0, 1], "up"), { status: "stayed", reason: "edge" });
  assert.equal(page(workItems).step(items, [0, 0, 0], "down").status, "refused");
});

// ---- The template's rules (Edit component mode, slice 82) ----

test("a template's part moves with the named slot it fills alone; the root and nested components' insides don't", () => {
  const template = '<article><slot name="title"><h3>T</h3></slot><p>B</p><card-x><p>in</p></card-x><slot><p>a</p></slot><div><slot name="x"><p>1</p><p>2</p></slot></div></article>';
  const rules = templateRules();
  assert.deepEqual(rules.subject(template, [0, 0, 0]), [0, 0]);
  assert.deepEqual(rules.subject(template, [0, 1]), [0, 1]);
  assert.equal(rules.subject(template, [0]), undefined);
  assert.equal(rules.subject(template, [0, 2, 0]), undefined);
  // An items slot's placeholder item moves itself; so does one of several in a named slot.
  assert.deepEqual(rules.subject(template, [0, 3, 0]), [0, 3, 0]);
  assert.deepEqual(rules.subject(template, [0, 4, 0, 1]), [0, 4, 0, 1]);
  // An island moves nowhere; a nested instance moves whole.
  assert.equal(rules.subject("<article><svg></svg><template></template></article>", [0, 0]), undefined);
  assert.equal(rules.subject("<article><svg></svg><template></template></article>", [0, 1]), undefined);
  assert.deepEqual(rules.subject(template, [0, 2]), [0, 2]);
  // The page's rules take the part pressed itself.
  assert.deepEqual(page().subject(template, [0, 0, 0]), [0, 0, 0]);
  assert.equal(rules.refusal(template, [0, 1], [0, 4]), undefined);
  assert.equal(rules.refusal(template, [0, 1], [0, 3]), undefined);
  assert.equal(rules.refusal(template, [0, 1], [0, 0]), templateSlotRefusal("title"));
  assert.equal(rules.refusal(template, [0, 1], [0, 2]), "Card x is its own component: open it to build inside its template.");
  assert.equal(rules.refusal(template, [0, 0], [0, 3]), "A slot can't go into the component's items: each page fills them.");
  assert.equal(rules.refusal(template, [0, 1], []), "Parts go inside the template's element, not beside it.");
  // HTML's content rules, on both.
  for (const [name, either] of both()) assert.equal(either.refusal(template, [0, 4], [0, 1]), "A <div> can't go inside a <p>.", name);
  // A drop is refused by the same rule.
  assert.deepEqual(rules.to(template, [0, 1], { parent: [0, 0], index: 0 }), { status: "refused", error: templateSlotRefusal("title") });
  assert.equal(rules.to(template, [0, 1], { parent: [0, 4], index: 0 }).status, "moved");
});

test("Alt+arrows on a template's part move its slot with it, by the template's rule", () => {
  const template = '<section><slot name="eyebrow"><p>E</p></slot><slot name="title"><h1>T</h1></slot><div class="actions"><a href="/x">X</a></div><p>Last</p></section>';
  const run = (at: number[], direction: MoveStep) => {
    const result = stepAt(templateRules(), template, at, direction);
    return result.status === "moved" ? { html: html(template, result)!.replace(/\s+(?=<)/g, ""), selection: result.selection } : result;
  };
  assert.deepEqual(run([0, 0, 0], "down"), { html: '<section><slot name="title"><h1>T</h1></slot><slot name="eyebrow"><p>E</p></slot><div class="actions"><a href="/x">X</a></div><p>Last</p></section>', selection: [0, 1, 0] });
  assert.deepEqual(run([0, 0, 0], "up"), { status: "stayed", reason: "edge" });
  // Into the Div above, at its end; out of it again, after it.
  assert.deepEqual(run([0, 3], "in"), { html: '<section><slot name="eyebrow"><p>E</p></slot><slot name="title"><h1>T</h1></slot><div class="actions"><a href="/x">X</a><p>Last</p></div></section>', selection: [0, 2, 1] });
  assert.equal((run([0, 2, 0], "out") as { html: string }).html, '<section><slot name="eyebrow"><p>E</p></slot><slot name="title"><h1>T</h1></slot><div class="actions"></div><a href="/x">X</a><p>Last</p></section>');
  // Never into a named slot, out of the template's element, or for the root.
  assert.deepEqual(run([0, 2], "in"), { status: "refused", error: templateSlotRefusal("title") });
  assert.deepEqual(run([0, 2], "out"), { status: "refused", error: "Parts go inside the template's element, not beside it." });
  assert.equal(templateRules().step(template, [0], "down").status, "refused");
  // The page's rules step the part pressed inside its slot, where it is alone: an edge.
  assert.deepEqual(stepAt(page(), template, [0, 0, 0], "down"), { status: "stayed", reason: "edge" });
});

test("a named slot's own elements stay put in a template; a part beside it steps", () => {
  const template = '<article><slot name="body"><p>A</p><p>B</p></slot><p>C</p></article>';
  assert.deepEqual(templateRules().step(template, [0, 0, 0], "down"), { status: "refused", error: templateSlotRefusal("body") });
  assert.equal(templateRules().step(template, [0, 1], "up").status, "moved");
  // On a page the same markup is no template: its elements step.
  assert.equal(page().step(template, [0, 0, 0], "down").status, "moved");
});
