// The Block move module (src/page-builder/block-move.ts) through its
// interface, over the real guarded edit on the memory workspace
// (tests/fakes/memory-workspace.ts): bytes after, the path after, one undo
// step, stale, refused, stayed, pending and failed (design section 7).
import assert from "node:assert/strict";
import test from "node:test";
import { createGuardedEdits, type EditorWorkspace } from "../src/guarded-edit";
import { createBlockMoves, type BlockMovePorts, type MoveAt, type MoveOutcome, type Settled } from "../src/page-builder/block-move";
import { templateSlotRefusal } from "../src/page-builder/native-elements";
import { createMemoryWorkspace } from "./fakes/memory-workspace";

const PAGE = "index.html", WORK = "components/section-work.html", BAND = "components/x-band.html", HERO = "components/section-hero.html";
// section-work: the unnamed slot and "more" are items slots (cards), "title" is not.
const templates = {
  [WORK]: `<section><slot name="title"><h2>Work</h2></slot><div class="cards"><slot></slot></div><slot name="more"><card-project></card-project></slot></section>`,
  "components/card-project.html": `<article><slot name="title"><h3>Untitled</h3></slot></article>`,
  [BAND]: "<section><p>Band</p></section>",
  [HERO]: `<section>\n  <slot name="eyebrow"><p>E</p></slot>\n  <slot name="title"><h1>T</h1></slot>\n  <p>Last</p>\n</section>`,
};
const site = {
  routes: { "/": PAGE },
  components: { "section-work": WORK, "card-project": "components/card-project.html", "x-band": BAND, "section-hero": HERO },
};
const SOURCE = `<main>
  <section class="a">
    <h2>A</h2>
    <p>One</p>
    <div class="flow"><p>In</p></div>
  </section>
  <section-work>
    <h2 slot="title">Work</h2>
    <card-project><h3 slot="title">P1</h3></card-project>
    <card-project><h3 slot="title">P2</h3></card-project>
    <card-project slot="more"><h3 slot="title">M</h3></card-project>
  </section-work>
  <section class="b"><p>B</p></section>
</main>`;

function setup(init: { page?: string; open?: string; editing?: string; workspace?: (ws: EditorWorkspace) => EditorWorkspace } = {}) {
  const page = init.page ?? SOURCE;
  const m = createMemoryWorkspace({ branch: { [PAGE]: page, ...templates, "styles/site.css": "h1 {}" }, open: init.open ?? PAGE, site });
  const edits = createGuardedEdits(init.workspace ? init.workspace(m.workspace) : m.workspace);
  const forgotten: { path: string; painted: string }[] = [];
  const ports = {
    edits,
    editing: () => init.editing === undefined ? undefined : { path: init.editing, tag: "section-hero" },
    mounted: path => m.openFile() === path && m.model(path) !== undefined,
    forgetOpening: path => painted => { forgotten.push({ path, painted }); },
  } satisfies BlockMovePorts;
  const moves = createBlockMoves(ports);
  const at = (node: number[], path = PAGE): MoveAt => ({ path, node, painted: m.workspace.source(path) });
  const settled = (outcome: MoveOutcome): Settled => { assert.notEqual(outcome.status, "pending"); return outcome as Settled; };
  return { m, edits, moves, at, forgotten, page: () => m.workspace.source(PAGE), settled };
}
/** The markup with the white space between tags gone, for shape checks. */
const flat = (html: string | undefined) => html?.replace(/\s+(?=<)/g, "");

// ---- Bytes and paths ----

test("a step writes whole lines at the destination's indentation, one undo step: Undo selects where it was, Redo where it went", () => {
  const f = setup();
  const out = f.moves.move(f.at([0, 0, 1]), { step: "up" });
  assert.deepEqual(out, { status: "moved", node: [0, 0, 0] });
  assert.equal(f.page(), SOURCE.replace("    <h2>A</h2>\n    <p>One</p>\n", "    <p>One</p>\n    <h2>A</h2>\n"));
  assert.deepEqual(f.m.steps(), ["range"]);
  assert.deepEqual(f.m.selected, [{ path: PAGE, node: [0, 0, 0] }]);
  assert.deepEqual(f.m.announced, ["Moved up in Section"]);
  assert.ok(f.m.undo());
  assert.equal(f.page(), SOURCE);
  assert.deepEqual(f.m.selected.at(-1), { path: PAGE, node: [0, 0, 1] });
  assert.equal(f.m.announced.at(-1), "Undid: Moved up in Section");
  assert.ok(f.m.redo());
  assert.deepEqual(f.m.selected.at(-1), { path: PAGE, node: [0, 0, 0] });
  assert.equal(f.m.announced.at(-1), "Moved up in Section");
});

test("a step, a drop and a gap to the same place write the same bytes and name the same path, each in its own words", () => {
  const expected = SOURCE.replace(/  <section class="a">[\s\S]*?<\/section>\n(  <section-work>[\s\S]*?<\/section-work>\n)/, "$1  <section class=\"a\">\n    <h2>A</h2>\n    <p>One</p>\n    <div class=\"flow\"><p>In</p></div>\n  </section>\n");
  assert.notEqual(expected, SOURCE);
  const runs = [
    { to: { step: "down" as const }, done: "Moved down", undone: "Undid: Moved down" },
    { to: { drop: { parent: [0], index: 2 }, painted: SOURCE, name: "Section", where: "Between page bands › after Section work" }, done: "Section moved. Between page bands › after Section work", undone: "Undid moving the Section." },
    { to: { gap: { parent: [0], index: 2 }, section: true as const }, done: "Section moved", undone: "Undid moving the section" },
  ];
  for (const run of runs) {
    const f = setup();
    assert.deepEqual(f.moves.move(f.at([0, 0]), run.to), { status: "moved", node: [0, 1] }, run.done);
    assert.equal(f.page(), expected, run.done);
    assert.deepEqual(f.m.announced, [run.done]);
    assert.deepEqual(f.m.steps(), ["range"], run.done);
    assert.ok(f.m.undo());
    assert.equal(f.m.announced.at(-1), run.undone);
    assert.deepEqual(f.m.selected.at(-1), { path: PAGE, node: [0, 0] });
    assert.ok(f.m.redo());
    assert.deepEqual(f.m.selected.at(-1), { path: PAGE, node: [0, 1] });
  }
  // The template's part the same way: a step and a drop.
  for (const to of [{ step: "down" as const }, { drop: { parent: [0], index: 2 }, painted: templates[HERO], name: "Paragraph", where: "Into Section" }]) {
    const f = setup({ open: HERO, editing: HERO });
    assert.deepEqual(f.moves.move(f.at([0, 0, 0], HERO), to), { status: "moved", node: [0, 1, 0] });
    assert.equal(f.m.workspace.source(HERO), `<section>\n  <slot name="title"><h1>T</h1></slot>\n  <slot name="eyebrow"><p>E</p></slot>\n  <p>Last</p>\n</section>`);
    assert.deepEqual(f.m.steps(), ["range"]);
    assert.ok(f.m.undo());
    assert.deepEqual(f.m.selected.at(-1), { path: HERO, node: [0, 0, 0] });
    assert.ok(f.m.redo());
    assert.deepEqual(f.m.selected.at(-1), { path: HERO, node: [0, 1, 0] });
  }
});

test("a Section steps out and in by the Block words, up and down by its own", () => {
  const page = "<main><section><div class=\"flow\"><x-band></x-band></div></section></main>";
  const f = setup({ page });
  assert.deepEqual(f.moves.move(f.at([0, 0, 0, 0]), { step: "out" }), { status: "moved", node: [0, 0, 1] });
  assert.equal(f.m.announced.at(-1), "Moved out of Div (stack) into Section");
  assert.deepEqual(f.moves.move(f.at([0, 0, 1]), { step: "up" }), { status: "moved", node: [0, 0, 0] });
  assert.equal(f.m.announced.at(-1), "Moved up");
});

test("CRLF stays CRLF and a <pre>'s line breaks stay content", () => {
  const crlf = "<main>\r\n  <section>\r\n    <h2>A</h2>\r\n  </section>\r\n  <section>B</section>\r\n</main>\r\n";
  const f = setup({ page: crlf });
  assert.equal(f.settled(f.moves.move(f.at([0, 1]), { step: "up" })).status, "moved");
  assert.equal(f.page(), "<main>\r\n  <section>B</section>\r\n  <section>\r\n    <h2>A</h2>\r\n  </section>\r\n</main>\r\n");
  const pre = "<main>\n  <pre>one\n<b>bold</b>\ntwo</pre>\n  <div>\n  </div>\n</main>";
  const g = setup({ page: pre });
  assert.deepEqual(g.moves.move(g.at([0, 0, 0]), { drop: { parent: [0, 1], index: 0 }, painted: pre, name: "<b>", where: "Into Div" }), { status: "moved", node: [0, 1, 0] });
  assert.equal(g.page(), "<main>\n  <pre>one\n\ntwo</pre>\n  <div>\n    <b>bold</b>\n  </div>\n</main>");
  assert.deepEqual(g.m.flashed, ["Into Div"]);
});

test("a card takes the slot it is dropped in, and loses it outside the instance", () => {
  const f = setup();
  // P1 into the "more" items slot, after M.
  assert.deepEqual(f.moves.move(f.at([0, 1, 1]), { drop: { parent: [0, 1], index: 4, slot: "more" }, painted: SOURCE, name: "Card project", where: "Into Section work › “more” slot" }), { status: "moved", node: [0, 1, 3] });
  assert.match(f.page()!, /<card-project slot="more"><h3 slot="title">M<\/h3><\/card-project>\n {4}<card-project slot="more"><h3 slot="title">P1<\/h3><\/card-project>/);
  // M out of the instance into Section b: its slot attribute goes.
  const g = setup();
  assert.deepEqual(g.moves.move(g.at([0, 1, 3]), { drop: { parent: [0, 2], index: 1 }, painted: SOURCE, name: "Card project", where: "Into Section" }), { status: "moved", node: [0, 2, 1] });
  assert.match(flat(g.page())!, /<section class="b"><p>B<\/p><card-project><h3 slot="title">M<\/h3><\/card-project><\/section>/);
});

test("a template's part a named slot holds alone moves with its slot; the part pressed stays selected inside it", () => {
  const f = setup({ open: HERO, editing: HERO });
  const grip = f.moves.grip(f.at([0, 0, 0], HERO))!;
  assert.deepEqual([grip.from, grip.inside, grip.band, grip.drags], [[0, 0], [0], false, true]);
  assert.deepEqual(f.moves.move(f.at([0, 0, 0], HERO), { step: "down" }), { status: "moved", node: [0, 1, 0] });
  assert.equal(f.m.workspace.source(HERO), `<section>\n  <slot name="title"><h1>T</h1></slot>\n  <slot name="eyebrow"><p>E</p></slot>\n  <p>Last</p>\n</section>`);
  assert.ok(f.m.undo());
  assert.deepEqual(f.m.selected.at(-1), { path: HERO, node: [0, 0, 0] });
  // A drop keeps it inside its slot the same way.
  const g = setup({ open: HERO, editing: HERO });
  const painted = g.m.workspace.source(HERO);
  assert.deepEqual(g.moves.move(g.at([0, 0, 0], HERO), { drop: { parent: [0], index: 3 }, painted, name: "Paragraph", where: "Into Section" }), { status: "moved", node: [0, 2, 0] });
});

test("a template's Section moves by the template's rules (B1): its slot goes with it, no page bands", () => {
  const template = `<article>\n  <slot name="lead"><section><p>L</p></section></slot>\n  <section><p>S</p></section>\n</article>`;
  const f = setup({ open: HERO, editing: HERO });
  f.m.typeInto(HERO, template);
  const grip = f.moves.grip(f.at([0, 0, 0], HERO))!;
  assert.deepEqual([grip.from, grip.band], [[0, 0], false]);
  assert.deepEqual([grip.steps.up, grip.steps.down], [false, true]);
  assert.deepEqual(f.moves.move(f.at([0, 0, 0], HERO), { step: "down" }), { status: "moved", node: [0, 1, 0] });
  assert.equal(f.m.workspace.source(HERO), `<article>\n  <section><p>S</p></section>\n  <slot name="lead"><section><p>L</p></section></slot>\n</article>`);
  // In the template's words, not a page Section's.
  assert.equal(f.m.announced.at(-1), "Moved down in Article");
  // The same bytes as a page: the Section steps alone, inside its slot, and stays there.
  const g = setup({ page: template });
  assert.deepEqual(g.moves.grip(g.at([0, 0, 0]))!.from, [0, 0, 0]);
  assert.deepEqual(g.moves.move(g.at([0, 0, 0]), { step: "down" }), { status: "stayed" });
});

// ---- Stale ----

test("bytes older than the source are stale, in the caller's words; nothing written", () => {
  const f = setup();
  const at = f.at([0, 0, 1]);
  f.m.typeInto(PAGE, SOURCE.replace("<p>B</p>", "<p>Bee</p>"));
  const before = f.page();
  assert.deepEqual(f.moves.move(at, { step: "up" }, { stale: "Select it again." }), { status: "stale", message: "Select it again." });
  assert.equal(f.page(), before);
  assert.deepEqual(f.m.steps(), []);
  // The caller's own guard and stamp are proved with the move.
  assert.equal(f.moves.move(f.at([0, 0, 1]), { step: "up" }, { guard: () => false }).status, "stale");
  const since = f.edits.stamp();
  f.m.bumpGeneration();
  assert.equal(f.settled(f.moves.move(f.at([0, 0, 1]), { step: "up" }, { since })).status, "stale");
  assert.equal(f.page(), before);
});

test("a template behind an items slot, read through r, edited before the write is stale", () => {
  const f = setup();
  let calls = 0;
  // The guard runs before the plan and again just before the write: the second time, the template changes.
  const guard = () => { if (++calls === 2) f.m.writeDraft(WORK, templates[WORK].replace('<div class="cards">', '<div class="grid">')); return true; };
  const out = f.moves.move(f.at([0, 1, 1]), { step: "down" }, { guard });
  assert.deepEqual(out, { status: "stale", message: "The page changed meanwhile. Try again.", changed: { file: WORK } });
  assert.equal(f.page(), SOURCE);
  // A file the plan did not read changes nothing.
  const g = setup();
  let other = 0;
  const unrelated = () => { if (++other === 2) g.m.writeDraft("styles/site.css", "h2 {}"); return true; };
  assert.equal(g.settled(g.moves.move(g.at([0, 1, 1]), { step: "down" }, { guard: unrelated })).status, "moved");
});

test("a drop: text typed inside the dragged block since the press moves with it; typing anywhere else is stale", () => {
  const f = setup();
  const at = f.at([0, 0, 1]);
  const typed = SOURCE.replace("<p>One</p>", "<p>One more</p>");
  f.m.typeInto(PAGE, typed);
  const drop = { drop: { parent: [0, 2], index: 1 }, painted: typed, name: "Paragraph", where: "Into Section" };
  assert.deepEqual(f.moves.move(at, drop), { status: "moved", node: [0, 2, 1] });
  assert.match(flat(f.page())!, /<section class="b"><p>B<\/p><p>One more<\/p><\/section>/);
  const g = setup();
  const pressed = g.at([0, 0, 1]);
  const elsewhere = SOURCE.replace("<p>B</p>", "<p>Bee</p>");
  g.m.typeInto(PAGE, elsewhere);
  assert.deepEqual(g.moves.move(pressed, { ...drop, painted: elsewhere }, { stale: "The page is still updating. Try again in a moment." }),
    { status: "stale", message: "The page is still updating. Try again in a moment." });
  // A drop measured on bytes older than the source is stale too.
  assert.equal(g.settled(g.moves.move(g.at([0, 0, 1]), { ...drop, painted: SOURCE })).status, "stale");
  assert.equal(g.page(), elsewhere);
});

// ---- Refused and stayed ----

test("refusals: into itself, a named slot, a nested component, before a <details>'s summary, HTML's content rules; nothing written", () => {
  const page = `<main>\n  <section><div class="flow"><p>In</p></div><p>Text</p><details><summary>S</summary><p>D</p></details></section>\n  <card-project><h3 slot="title">T</h3></card-project>\n</main>`;
  const f = setup({ page });
  const drop = (node: number[], parent: number[], index: number) =>
    f.moves.move(f.at(node), { drop: { parent, index }, painted: page, name: "Block", where: "There" });
  assert.deepEqual(drop([0, 0], [0, 0, 0], 0), { status: "refused", message: "Block was not moved: A block cannot go inside itself." });
  assert.deepEqual(drop([0, 0, 1], [0, 1], 0), { status: "refused", message: "Block was not moved: Its parts belong to the component: open it to change them." });
  assert.deepEqual(drop([0, 0, 1], [0, 0, 2], 0), { status: "refused", message: "Block was not moved: A <details> keeps its <summary> first." });
  assert.deepEqual(drop([0, 0, 0], [0, 0, 1], 0), { status: "refused", message: "Block was not moved: A <div> can't go inside a <p>." });
  // After the summary it goes in.
  assert.equal(f.settled(drop([0, 0, 1], [0, 0, 2], 1)).status, "moved");
  // The template's named slot.
  const g = setup({ open: HERO, editing: HERO });
  const painted = g.m.workspace.source(HERO);
  assert.deepEqual(g.moves.move(g.at([0, 2], HERO), { drop: { parent: [0, 1], index: 0 }, painted, name: "Paragraph", where: "There" }),
    { status: "refused", message: `Paragraph was not moved: ${templateSlotRefusal("title")}` });
  assert.deepEqual(g.moves.move(g.at([0, 1, 0], HERO), { step: "in" }), { status: "refused", message: templateSlotRefusal("eyebrow") });
  assert.deepEqual(g.m.steps(), []);
});

test("a gap moves a Section among its own siblings only", () => {
  const f = setup();
  const other = "A section moves among its own siblings only.";
  assert.deepEqual(f.moves.move(f.at([0, 0, 1]), { gap: { parent: [0, 0], index: 0 }, section: true }), { status: "refused", message: other });
  assert.deepEqual(f.moves.move(f.at([0, 0]), { gap: { parent: [0, 1], index: 0 }, section: true }), { status: "refused", message: other });
  // A section component is a Section by its template.
  assert.deepEqual(f.moves.move(f.at([0, 1]), { gap: { parent: [0], index: 0 }, section: true }), { status: "moved", node: [0, 0] });
  assert.equal(f.m.announced.at(-1), "Section moved");
  // In an items slot, among its own slot's children.
  const list = "<main><section-work><section>A</section><section slot=\"more\">X</section><section>B</section></section-work></main>";
  const g = setup({ page: list });
  assert.deepEqual(g.moves.move(g.at([0, 0, 2]), { gap: { parent: [0, 0], index: 0 }, section: true }), { status: "moved", node: [0, 0, 0] });
  assert.equal(flat(g.page()), "<main><section-work><section>B</section><section>A</section><section slot=\"more\">X</section></section-work></main>");
});

test("stays: a step at an edge says nothing; a drop beside itself and a gap it fills say so; none is a step", () => {
  const f = setup();
  assert.deepEqual(f.moves.move(f.at([0, 0, 0]), { step: "up" }), { status: "stayed" });
  assert.deepEqual(f.m.announced, []);
  // At an items slot's edge: the title fills another slot.
  assert.deepEqual(f.moves.move(f.at([0, 1, 1]), { step: "up" }), { status: "stayed" });
  assert.deepEqual(f.moves.move(f.at([0, 1, 2]), { step: "down" }), { status: "stayed" });
  for (const index of [1, 2])
    assert.deepEqual(f.moves.move(f.at([0, 0, 1]), { drop: { parent: [0, 0], index }, painted: SOURCE, name: "Paragraph", where: "There" }), { status: "stayed", message: "Paragraph stayed in place" });
  assert.deepEqual(f.moves.move(f.at([0, 1, 1]), { drop: { parent: [0, 1], index: 2, slot: "" }, painted: SOURCE, name: "Card project", where: "There" }), { status: "stayed", message: "Card project stayed in place" });
  assert.deepEqual(f.moves.move(f.at([0, 0]), { gap: { parent: [0], index: 1 }, section: true }), { status: "stayed", message: "Section stayed in place" });
  assert.deepEqual(f.m.announced, ["Paragraph stayed in place", "Paragraph stayed in place", "Card project stayed in place", "Section stayed in place"]);
  assert.deepEqual(f.m.steps(), []);
  assert.equal(f.page(), SOURCE);
});

// ---- Opening first ----

test("a page not mounted opens first: the move is pending, then settles as one step", async () => {
  const f = setup({ open: "styles/site.css" });
  const out = f.moves.move(f.at([0, 0]), { step: "down" });
  assert.equal(out.status, "pending");
  assert.deepEqual(out.status === "pending" && await out.settled, { status: "moved", node: [0, 1] });
  assert.equal(f.m.openFile(), PAGE);
  assert.deepEqual(f.m.steps(), ["range"]);
  assert.deepEqual(f.forgotten, []);
});

test("a move its rules refuse after the page opened is refused, nothing forgotten", async () => {
  const f = setup({ open: "styles/site.css" });
  const out = f.moves.move(f.at([0, 0, 1]), { gap: { parent: [0, 0], index: 0 }, section: true });
  assert.deepEqual(out.status === "pending" && await out.settled, { status: "refused", message: "A section moves among its own siblings only." });
  assert.equal(f.page(), SOURCE);
  assert.deepEqual(f.m.steps(), []);
  assert.deepEqual(f.forgotten, []);
});

test("leaving Edit component mode while the page opens still moves it", async () => {
  const f = setup({ open: "styles/site.css" });
  f.m.enterEditMode();
  const hold = f.m.holdOpen();
  const out = f.moves.move(f.at([0, 0]), { step: "down" });
  await hold.reached;
  f.m.leaveEditMode();
  hold.release();
  assert.equal(out.status === "pending" && (await out.settled).status, "moved");
});

test("bytes changed while the page opens: it does not mount, the move is stale and forgetOpening runs", async () => {
  const f = setup({ open: "styles/site.css" });
  const hold = f.m.holdOpen();
  const out = f.moves.move(f.at([0, 0]), { step: "down" }, { stale: "Opened late." });
  await hold.reached;
  const foreign = SOURCE.replace('<section class="b">', '<section class="b" data-agent>');
  f.m.writeDraft(PAGE, foreign);
  hold.release();
  const settled = out.status === "pending" ? await out.settled : out;
  assert.equal(settled.status, "stale");
  assert.equal(settled.status === "stale" && settled.message, "Opened late.");
  assert.equal(f.m.model(PAGE), undefined);
  assert.equal(f.page(), foreign);
  assert.deepEqual(f.forgotten, [{ path: PAGE, painted: SOURCE }]);
});

test("a section component's template made non-section while the page opens is stale, nothing written", async () => {
  const page = "<main><section>A</section><x-band></x-band></main>";
  const f = setup({ page, open: "styles/site.css" });
  const hold = f.m.holdOpen();
  const out = f.moves.move(f.at([0, 1]), { step: "up" });
  await hold.reached;
  f.m.writeDraft(BAND, "<div>Band</div>");
  hold.release();
  assert.equal(out.status === "pending" && (await out.settled).status, "stale");
  assert.equal(f.page(), page);
  assert.deepEqual(f.m.steps(), []);
});

test("a repository change while the page opens is stale without forgetting anything", async () => {
  const f = setup({ open: "styles/site.css" });
  const hold = f.m.holdOpen();
  const out = f.moves.move(f.at([0, 0]), { step: "down" });
  await hold.reached;
  f.m.bumpGeneration();
  hold.release();
  const settled = out.status === "pending" ? await out.settled : out;
  assert.deepEqual(settled.status === "stale" && settled.changed, "generation");
  assert.deepEqual(f.forgotten, []);
});

// ---- Failed ----

test("a move the editor refuses to write is failed, not a refusal", () => {
  const f = setup({ workspace: ws => ({ ...ws, replaceRanges() { throw new Error("The active file changed or is read only."); } }) });
  assert.deepEqual(f.moves.move(f.at([0, 0, 1]), { step: "up" }), { status: "refused", message: "The active file changed or is read only.", failed: true });
  assert.equal(f.page(), SOURCE);
  // A plan's own refusal is not failed.
  assert.deepEqual(f.moves.move(f.at([0, 0]), { gap: { parent: [0, 0], index: 0 }, section: true }), { status: "refused", message: "A section moves among its own siblings only." });
});

// ---- Grip ----

test("grip: what a press moves, its steps (false at a slot's edge), its refusals by the first gap", () => {
  const f = setup();
  const card = f.moves.grip(f.at([0, 1, 1]))!;
  assert.deepEqual([card.from, card.inside, card.band, card.drags], [[0, 1, 1], [], false, true]);
  // Out of an instance between page bands: no.
  assert.deepEqual({ ...card.steps }, { up: false, down: true, out: false, in: false });
  assert.deepEqual({ ...f.moves.grip(f.at([0, 1, 2]))!.steps }, { up: true, down: false, out: false, in: false });
  assert.equal(card.refusal([0, 0, 1]), "An <h3> can't go inside a <p>.");
  assert.equal(card.refusal([0, 1], "more"), undefined);
  assert.equal(card.refusal([0, 1, 3]), "Its parts belong to the component: open it to change them.");
  const section = f.moves.grip(f.at([0, 0]))!;
  assert.deepEqual([section.band, section.steps.up, section.steps.down], [true, false, true]);
  assert.equal(f.moves.grip(f.at([0, 1]))!.band, true);
  // Nothing moves: a component's own part, the template's root, no bytes, no path.
  assert.equal(f.moves.grip(f.at([0, 1, 1, 0])), undefined);
  assert.equal(f.moves.grip({ path: PAGE, node: [0, 0], painted: undefined }), undefined);
  assert.equal(f.moves.grip(f.at([])), undefined);
  const g = setup({ open: HERO, editing: HERO });
  assert.equal(g.moves.grip(g.at([0], HERO)), undefined);
  // Nor an island in a template: no drag starts for it.
  g.m.typeInto(HERO, "<article><svg></svg><card-project></card-project><p>A</p></article>");
  assert.equal(g.moves.grip(g.at([0, 0], HERO)), undefined);
  assert.deepEqual(g.moves.grip(g.at([0, 1], HERO))?.drags, true);
  // Keys reach a body-level footer; a drag doesn't.
  const doc = "<html><head></head><body><main><p>A</p></main><footer><p>F</p></footer></body></html>";
  const h = setup({ page: doc });
  const footer = h.moves.grip(h.at([1]))!;
  assert.deepEqual([footer.drags, footer.steps.up], [false, true]);
  assert.deepEqual(h.moves.move(h.at([1]), { step: "up" }), { status: "moved", node: [0] });
});

test("an empty path throws", () => {
  const f = setup();
  assert.throws(() => f.moves.move(f.at([]), { step: "up" }), /no element to move/);
});
