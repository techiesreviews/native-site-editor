import assert from "node:assert/strict";
import test from "node:test";
import { startTags } from "../shared/html-source.ts";
import {
  attributeEdit,
  attributeNameProblem,
  componentUsage,
  detachMarkup,
  fillInsertEdit,
  fillMarkup,
  fillRemoveEdits,
  makeComponentPlan,
  parseSource,
  plainText,
  readInstance,
  slotStates,
  slotTextEdit,
  slotValue,
  startTagAttributes,
  suggestTagName,
  tagNameProblem,
  templateSlots,
  textChangeEdit,
  usageSummary,
  type InstanceRange,
  type RangeEdit,
  type SourceElement,
} from "../src/page-builder/component-model.ts";

const apply = (source: string, edits: RangeEdit | RangeEdit[]) =>
  [edits].flat().sort((a, b) => b.start - a.start).reduce((out, edit) => out.slice(0, edit.start) + edit.text + out.slice(edit.end), source);

// The outer range of the first element named `name` in `source`.
function rangeOf(source: string, name: string, nth = 0): InstanceRange {
  const find = (nodes: ReturnType<typeof parseSource>): SourceElement[] =>
    nodes.flatMap((node) => (node.type === "element" ? [...(node.name === name ? [node] : []), ...find(node.children)] : []));
  const el = find(parseSource(source))[nth];
  assert.ok(el, `no <${name}> in source`);
  return { tag: el.tag, start: el.start, end: el.end, close: el.close };
}

const projectCard = `<article class="project-card" data-key="project-card">
  <h3 class="project-card__title" data-key="card-title"><slot name="title">Untitled project</slot></h3>
  <p class="project-card__body" data-key="card-body"><slot name="body">No description yet.</slot></p>
  <card-note data-key="card-note">Shared across cards</card-note>
  <slot data-key="card-default"></slot>
  <p class="project-card__actions" data-key="card-actions"><slot name="link"></slot></p>
</article>`;

const page = `<main>
  <section class="cards">
    <project-card title="Reusable cards" data-key="card-1">
      <span slot="title">Reusable cards</span>
      <p slot="body">This card and the next one <strong>share</strong> a template.</p>
    </project-card>
    <project-card></project-card>
  </section>
</main>`;

test("the source tree keeps offsets, end tags and text", () => {
  const html = `<p class="a">Hi <b>there</b><img src="x.png"></p><!-- note --><span>x`;
  const [p, span] = parseSource(html).filter((node) => node.type === "element") as SourceElement[];
  assert.equal(p.name, "p");
  assert.equal(html.slice(p.start, p.end), `<p class="a">Hi <b>there</b><img src="x.png"></p>`);
  assert.deepEqual(p.children.map((node) => (node.type === "element" ? node.name : html.slice(node.start, node.end))), ["Hi ", "b", "img"]);
  assert.equal(span.close, undefined);
  assert.equal(span.end, html.length);
  assert.deepEqual(startTagAttributes(html, p.tag).map((item) => [item.name, item.value]), [["class", "a"]]);
  assert.equal(plainText(`  A &amp; <em>b</em>\n   c&hellip; `), "A & b c…");
});

test("a template's slots: names, fallbacks and kinds", () => {
  const slots = templateSlots(projectCard);
  assert.deepEqual(slots.map((slot) => [slot.name, slot.kind, slot.fallback]), [
    ["title", "text", "Untitled project"],
    ["body", "text", "No description yet."],
    ["", "text", ""],
    ["link", "link", ""],
  ]);
  const starter = `<article>
  <card-note><slot name="note" slot="text"><p>Project</p></slot></card-note>
  <slot name="title"><h3>Untitled project</h3></slot>
  <div class="media"><slot name="image"><img src="/images/desk.svg" alt=""></slot></div>
  <p class="actions"><slot name="link"><a href="/about/">More</a></slot></p>
</article>`;
  assert.deepEqual(templateSlots(starter).map((slot) => [slot.name, slot.kind, slot.forward ?? ""]), [
    ["note", "text", "text"], ["title", "text", ""], ["image", "image", ""], ["link", "link", ""],
  ]);
});

test("slot states follow the loader's rules: fallbacks, optional parts, sections and data-if", () => {
  const range = rangeOf(page, "project-card");
  const instance = readInstance(page, range);
  assert.deepEqual([...instance.fills.keys()], ["title", "body"]);
  const states = slotStates(projectCard, instance);
  assert.deepEqual(states.get("title"), { filled: true, shown: true, whenEmpty: "fallback" });
  // No fallback: the link's paragraph hides itself when the page gives none.
  assert.deepEqual(states.get("link"), { filled: false, shown: false, whenEmpty: "hidden" });
  assert.deepEqual(states.get(""), { filled: false, shown: false, whenEmpty: "hidden" });

  const hero = `<section>
  <slot name="eyebrow"><p class="eyebrow">Studio</p></slot>
  <slot name="title"><h1>Headline</h1></slot>
  <div class="actions"><slot name="primary"><a href="/x">Go</a></slot></div>
</section>`;
  const bare = readInstance(`<section-hero></section-hero>`, rangeOf(`<section-hero></section-hero>`, "section-hero"));
  // A bare section tag shows every fallback.
  assert.equal(slotStates(hero, bare).get("eyebrow")?.shown, true);
  const filledSource = `<section-hero>\n  <h1 slot="title">Ours</h1>\n</section-hero>`;
  const some = readInstance(filledSource, rangeOf(filledSource, "section-hero"));
  const heroStates = slotStates(hero, some);
  // Filled at all: the slots it leaves are hidden, the wrapper round the button too.
  assert.deepEqual(heroStates.get("eyebrow"), { filled: false, shown: false, whenEmpty: "hidden" });
  assert.deepEqual(heroStates.get("primary"), { filled: false, shown: false, whenEmpty: "hidden" });
  // Its only filled slot emptied, the tag is bare again and shows its fallback.
  assert.equal(heroStates.get("title")?.whenEmpty, "fallback");

  const conditional = `<div><p data-if="price"><slot name="price">Free</slot></p><slot name="note" data-if>Note</slot></div>`;
  const plainSource = `<x-a><span slot="other">o</span></x-a>`;
  const plain = readInstance(plainSource, rangeOf(plainSource, "x-a"));
  assert.equal(slotStates(conditional, plain).get("price")?.shown, false);
  assert.equal(slotStates(conditional, plain).get("note")?.whenEmpty, "hidden");
});

test("a slot's value: the page's text, else the fallback's; images and links read their attributes", () => {
  const instance = readInstance(page, rangeOf(page, "project-card"));
  const [title, body, , link] = templateSlots(projectCard);
  assert.deepEqual(
    { ...slotValue(page, projectCard, instance, title), element: undefined },
    { kind: "text", text: "Reusable cards", editable: true, element: undefined },
  );
  assert.equal(slotValue(page, projectCard, instance, body).text, "This card and the next one share a template.");
  assert.equal(slotValue(page, projectCard, instance, link).kind, "link");
  const template = `<div><slot name="image"><img src="/a.png" alt="A"></slot></div>`;
  const source = `<x-b><img slot="image" src="/b.png" alt="B"></x-b>`;
  const value = slotValue(source, template, readInstance(source, rangeOf(source, "x-b")), templateSlots(template)[0]);
  assert.equal(value.kind, "image");
  assert.equal(value.src, "/b.png");
  assert.equal(value.alt, "B");
});

test("typing into a filled slot replaces only the changed stretch, keeping formatting", () => {
  const instance = readInstance(page, rangeOf(page, "project-card"));
  const [title, body] = templateSlots(projectCard);
  const edit = slotTextEdit(page, projectCard, instance, title, "Reusable card sets");
  assert.ok(!("error" in edit));
  assert.match(apply(page, edit), /<span slot="title">Reusable card sets<\/span>/);
  const bodyEdit = slotTextEdit(page, projectCard, instance, body, "This card and the next one share one template.");
  assert.ok(!("error" in bodyEdit));
  assert.match(apply(page, bodyEdit), /<p slot="body">This card and the next one <strong>share<\/strong> one template\.<\/p>/);
  // Escaped as text.
  const escaped = slotTextEdit(page, projectCard, instance, title, "A & <b>");
  assert.ok(!("error" in escaped));
  assert.match(apply(page, escaped), /<span slot="title">A &amp; &lt;b&gt;<\/span>/);
  // Multi-line source text: the field shows it collapsed and the change lands in place.
  const wrapped = `<x-c>\n  <p slot="body">One\n    two three</p>\n</x-c>`;
  const template = `<slot name="body">x</slot>`;
  const multi = slotTextEdit(wrapped, template, readInstance(wrapped, rangeOf(wrapped, "x-c")), templateSlots(template)[0], "One two four");
  assert.ok(!("error" in multi));
  assert.equal(apply(wrapped, multi), `<x-c>\n  <p slot="body">One\n    two four</p>\n</x-c>`);
  assert.equal(textChangeEdit("<p>same</p>", 3, 7, "same"), undefined);
});

test("typing into an empty slot copies its fallback into the page, in the template's order", () => {
  const second = rangeOf(page, "project-card", 1);
  const empty = readInstance(page, second);
  const [title, body] = templateSlots(projectCard);
  const first = slotTextEdit(page, projectCard, empty, body, "New body");
  assert.ok(!("error" in first));
  const after = apply(page, first);
  assert.match(after, /<project-card>\n {6}<span slot="body">New body<\/span>\n {4}<\/project-card>/);
  // The title goes before the body, as in the template.
  const again = readInstance(after, rangeOf(after, "project-card", 1));
  const titled = slotTextEdit(after, projectCard, again, title, "New title");
  assert.ok(!("error" in titled));
  assert.match(apply(after, titled), /<project-card>\n {6}<span slot="title">New title<\/span>\n {6}<span slot="body">New body<\/span>\n {4}<\/project-card>/);
});

test("fill markup copies the fallback element with the slot attribute, or makes one of the slot's kind", () => {
  const starter = `<section><slot name="title"><h2 data-key="t">A short, clear headline.</h2></slot><slot name="primary"><a href="/about/#contact">Get in touch</a></slot><slot name="image"></slot><slot name="link"></slot><slot>Default</slot></section>`;
  const [title, primary, image, link, rest] = templateSlots(starter);
  assert.equal(fillMarkup(starter, title), `<h2 slot="title">A short, clear headline.</h2>`);
  assert.equal(fillMarkup(starter, title, "Ours"), `<h2 slot="title">Ours</h2>`);
  assert.equal(fillMarkup(starter, primary), `<a slot="primary" href="/about/#contact">Get in touch</a>`);
  assert.equal(fillMarkup(starter, image), `<img slot="image" src="" alt="">`);
  assert.equal(fillMarkup(starter, link), `<a slot="link" href="">Link</a>`);
  assert.equal(fillMarkup(starter, rest), "Default");
});

test("a slot switched on and off adds and removes the page's element with its lines", () => {
  const instance = readInstance(page, rangeOf(page, "project-card"));
  const slots = templateSlots(projectCard);
  const link = slots.find((slot) => slot.name === "link")!;
  const on = fillInsertEdit(page, instance, slots, "link", fillMarkup(projectCard, link));
  assert.ok(on);
  const added = apply(page, on);
  assert.match(added, /<p slot="body">.*<\/p>\n {6}<a slot="link" href="">Link<\/a>\n {4}<\/project-card>/);
  const back = apply(added, fillRemoveEdits(added, readInstance(added, rangeOf(added, "project-card")), "link"));
  assert.equal(back, page);
  // An empty instance gets its content on lines of its own; text for the unnamed slot goes inline.
  const lone = `<div>\n  <card-note></card-note>\n</div>`;
  const note = readInstance(lone, rangeOf(lone, "card-note"));
  assert.equal(apply(lone, fillInsertEdit(lone, note, [], "", "Cafe")!), `<div>\n  <card-note>Cafe</card-note>\n</div>`);
  assert.equal(apply(lone, fillInsertEdit(lone, note, [], "x", `<b slot="x">B</b>`)!), `<div>\n  <card-note>\n    <b slot="x">B</b>\n  </card-note>\n</div>`);
});

test("attributes on the instance tag are set, added and removed", () => {
  const range = rangeOf(page, "project-card");
  assert.match(apply(page, attributeEdit(page, range.tag, "title", "Cards")), /<project-card title="Cards" data-key="card-1">/);
  assert.match(apply(page, attributeEdit(page, range.tag, "variant", "dark")), /<project-card title="Reusable cards" data-key="card-1" variant="dark">/);
  assert.match(apply(page, attributeEdit(page, range.tag, "title", undefined)), /<project-card data-key="card-1">/);
  assert.equal(attributeNameProblem("data-x"), undefined);
  assert.ok(attributeNameProblem("onclick"));
  assert.ok(attributeNameProblem("2x"));
});

test("usage counts instances on each page, through other components", () => {
  const site = {
    routes: { "/": "index.html", "/about/": "about/index.html", "/empty/": "empty/index.html" },
    components: { "project-card": "components/project-card/project-card.html", "card-note": "components/card-note/card-note.html", "site-footer": "components/site-footer/site-footer.html" },
  };
  const sources = {
    "index.html": `<body>${page}<!-- <project-card> --></body>`,
    "about/index.html": `<body><card-note>x</card-note><site-footer></site-footer></body>`,
    "empty/index.html": `<body></body>`,
    "components/project-card/project-card.html": projectCard,
    "components/card-note/card-note.html": `<p><slot></slot></p>`,
    "components/site-footer/site-footer.html": `<footer></footer>`,
  };
  const cards = componentUsage(site, sources, "project-card");
  assert.deepEqual(cards, { instances: 2, pages: [{ file: "index.html", route: "/", count: 2 }], components: [] });
  assert.equal(usageSummary(cards), "2 instances on 1 page");
  const notes = componentUsage(site, sources, "card-note");
  assert.equal(notes.instances, 3);
  assert.deepEqual(notes.pages.map((entry) => [entry.route, entry.count]), [["/", 2], ["/about/", 1]]);
  assert.deepEqual(notes.components, [{ tag: "project-card", count: 1 }]);
  assert.equal(usageSummary(componentUsage(site, sources, "x-none")), "not used on any page yet");
});

test("detach writes what the instance shows: slots filled, hidden parts left out, attributes moved", () => {
  const instance = readInstance(page, rangeOf(page, "project-card"));
  const { markup, dropped } = detachMarkup(page, projectCard, instance);
  assert.deepEqual(dropped, []);
  assert.equal(markup, `<article class="project-card" data-key="project-card" title="Reusable cards">
      <h3 class="project-card__title" data-key="card-title">Reusable cards</h3>
      <p class="project-card__body" data-key="card-body">This card and the next one <strong>share</strong> a template.</p>
      <card-note data-key="card-note">Shared across cards</card-note>
    </article>`);
  // Fallbacks show where the page gives nothing; a slot passed on keeps its target.
  const template = `<article class="card" data-if-ignored>
  <card-note><slot name="note" slot="text"><p>Project</p></slot></card-note>
  <slot name="title"><h3>Untitled</h3></slot>
  <p data-if="link" class="actions"><slot name="link"></slot></p>
</article>`;
  const source = `<card-project class="wide" id="one">\n  <p slot="note">Cafe</p>\n</card-project>`;
  const result = detachMarkup(source, template, readInstance(source, rangeOf(source, "card-project")));
  assert.equal(result.markup, `<article class="card wide" data-if-ignored id="one">
  <card-note><p slot="text">Cafe</p></card-note>
  <h3>Untitled</h3>
</article>`);
  // Several top-level elements: the instance tag's attributes have nowhere to go.
  const loose = `<x-two id="a"></x-two>`;
  assert.deepEqual(detachMarkup(loose, `<h2>a</h2><p>b</p>`, readInstance(loose, rangeOf(loose, "x-two"))), { markup: `<h2>a</h2><p>b</p>`, dropped: ["id"] });
});

test("make component: a section becomes a template with slots and an instance holding its content", () => {
  const source = `<main>
  <section class="hero" id="top" data-key="hero">
    <h1 data-key="hero-title">A native <em>browser</em> preview</h1>
    <p class="lead">Edit plain HTML.</p>
    <img class="hero-image" src="/images/placeholder.svg">
    <div class="actions"><a class="button" href="/about/">About</a></div>
  </section>
</main>`;
  const range = rangeOf(source, "section");
  const plan = makeComponentPlan(source, range, "section-hero");
  assert.ok(!("error" in plan));
  assert.equal(plan.template, `<section class="hero" data-key="hero">
  <h1 data-key="hero-title"><slot name="title">A native <em>browser</em> preview</slot></h1>
  <p class="lead"><slot name="lead">Edit plain HTML.</slot></p>
  <slot name="hero-image"><img class="hero-image" src="/images/placeholder.svg"></slot>
  <div class="actions"><slot name="button"><a class="button" href="/about/">About</a></slot></div>
</section>
`);
  assert.equal(plan.instance, `<section-hero id="top">
    <span slot="title">A native <em>browser</em> preview</span>
    <span slot="lead">Edit plain HTML.</span>
    <img slot="hero-image" class="hero-image" src="/images/placeholder.svg">
    <a slot="button" class="button" href="/about/">About</a>
  </section-hero>`);
  assert.equal(plan.css, ":host {\n  display: block;\n}\n");
  assert.deepEqual(plan.slots.map((slot) => [slot.name, slot.kind]), [["title", "text"], ["lead", "text"], ["hero-image", "image"], ["button", "link"]]);
  // The template with the instance's content renders what the page had: each slot's fallback is the page's copy.
  const replaced = source.slice(0, range.start) + plan.instance + source.slice(range.end);
  const instance = readInstance(replaced, rangeOf(replaced, "section-hero"));
  for (const slot of templateSlots(plan.template)) assert.equal(slotStates(plan.template, instance).get(slot.name)?.shown, true);
  // A single line of text fills the unnamed slot.
  const line = `<p class="note">Shared <b>note</b></p>`;
  const note = makeComponentPlan(line, rangeOf(line, "p"), "site-note");
  assert.ok(!("error" in note));
  assert.equal(note.template, `<p class="note"><slot>Shared <b>note</b></slot></p>\n`);
  assert.equal(note.instance, `<site-note>Shared <b>note</b></site-note>`);
  const already = `<x-y><p>a</p></x-y>`;
  assert.deepEqual(makeComponentPlan(already, rangeOf(already, "x-y"), "x-z"), { error: "This is a component already." });
});

test("new component names: a dash, lowercase, free", () => {
  assert.equal(tagNameProblem("section-intro", []), undefined);
  assert.ok(tagNameProblem("hero", []));
  assert.ok(tagNameProblem("Section-hero", []));
  assert.ok(tagNameProblem("section--hero", []));
  assert.ok(tagNameProblem("font-face", []));
  assert.ok(tagNameProblem("section-intro", ["section-intro"]));
  const source = `<section class="hero"><h1>Hi</h1></section><article><h2>Fern &amp; Kettle cafe</h2></article><section><h2>Scroll to verify</h2></section>`;
  const sections = startTags(source).filter((tag) => tag.name === "section");
  assert.equal(suggestTagName(source, rangeOf(source, "section"), []), "section-hero");
  assert.equal(suggestTagName(source, rangeOf(source, "section"), ["section-hero"]), "section-hero-2");
  assert.equal(suggestTagName(source, rangeOf(source, "article"), []), "card-fern-kettle");
  assert.equal(sections.length, 2);
  assert.equal(suggestTagName(source, rangeOf(source, "section", 1), []), "section-scroll-to");
});

test("review: attribute edits rewrite the whole attribute, double-quoted and escaped", () => {
  const single = `<x-a title='old' data-n=plain></x-a>`;
  const tag = rangeOf(single, "x-a").tag;
  assert.equal(apply(single, attributeEdit(single, tag, "title", "O'Reilly")), `<x-a title="O'Reilly" data-n=plain></x-a>`);
  assert.equal(apply(single, attributeEdit(single, tag, "data-n", "hello world")), `<x-a title='old' data-n="hello world"></x-a>`);
  assert.equal(apply(single, attributeEdit(single, tag, "title", `x" onclick="alert(1)`)), `<x-a title="x&quot; onclick=&quot;alert(1)" data-n=plain></x-a>`);
  // Values are read decoded, so they are escaped once.
  const encoded = `<x-a title="A &amp; B"></x-a>`;
  assert.equal(readInstance(encoded, rangeOf(encoded, "x-a")).attributes[0].value, "A & B");
});

test("review: detach keeps entities and the page's own spacing", () => {
  const source = `<x-card title="A &amp; B" id="caf&eacute;">Hello <em>world</em>!</x-card>`;
  const template = `<p><slot></slot></p>`;
  assert.equal(detachMarkup(source, template, readInstance(source, rangeOf(source, "x-card"))).markup, `<p title="A &amp; B" id="caf&eacute;">Hello <em>world</em>!</p>`);
  const pair = `<x-b><b slot="s">a</b><i slot="s">b</i></x-b>`;
  assert.equal(detachMarkup(pair, `<p><slot name="s"></slot></p>`, readInstance(pair, rangeOf(pair, "x-b"))).markup, `<p><b>a</b><i>b</i></p>`);
});

test("review: usage counts elements, not text in scripts, textareas or comments", () => {
  const site = { routes: { "/": "index.html" }, components: { "x-card": "components/x-card/x-card.html" } };
  const sources = { "index.html": `<body><script>const example = "<x-card></x-card>";</script><textarea><x-card></x-card></textarea><!-- <x-card> --></body>`, "components/x-card/x-card.html": `<p></p>` };
  assert.deepEqual(componentUsage(site, sources, "x-card"), { instances: 0, pages: [], components: [] });
});

test("review: generated slot names never collide", () => {
  const source = `<section><h2>A</h2><h3>B</h3><p class="title-2">C</p></section>`;
  const plan = makeComponentPlan(source, rangeOf(source, "section"), "section-x");
  assert.ok(!("error" in plan));
  assert.deepEqual(plan.slots.map((slot) => slot.name), ["title", "title-2", "title-2-2"]);
});
