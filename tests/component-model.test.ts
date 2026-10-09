import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("slot states follow the loader's rules: fallbacks, optional parts, bare instances", () => {
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

  const conditional = `<section><p><slot name="price">Free</slot></p><slot name="note">Note</slot></section>`;
  const plainSource = `<x-a><span slot="price">Paid</span></x-a>`;
  const plain = readInstance(plainSource, rangeOf(plainSource, "x-a"));
  assert.equal(slotStates(conditional, plain).get("price")?.shown, true);
  assert.equal(slotStates(conditional, plain).get("note")?.whenEmpty, "hidden");
});

test("a slot's value: the page's text, else the fallback's; images and links read their attributes", () => {
  const instance = readInstance(page, rangeOf(page, "project-card"));
  const [title, body, , link] = templateSlots(projectCard);
  assert.deepEqual(
    { ...slotValue(page, projectCard, instance, title), element: undefined },
    // A <span> takes <br>: its text is edited as lines.
    { kind: "text", text: "Reusable cards", editable: true, element: undefined, breaks: true, lines: "Reusable cards" },
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
  const template = `<article class="card" data-note>
  <card-note><slot name="note" slot="text"><p>Project</p></slot></card-note>
  <slot name="title"><h3>Untitled</h3></slot>
  <p class="actions"><slot name="link"></slot></p>
</article>`;
  const source = `<card-project class="wide" id="one">\n  <p slot="note">Cafe</p>\n</card-project>`;
  const result = detachMarkup(source, template, readInstance(source, rangeOf(source, "card-project")));
  assert.equal(result.markup, `<article class="card wide" data-note id="one">
  <card-note><p slot="text">Cafe</p></card-note>
  <h3>Untitled</h3>
</article>`);
  // Several top-level elements: the instance tag's attributes have nowhere to go.
  const loose = `<x-two id="a"></x-two>`;
  assert.deepEqual(detachMarkup(loose, `<h2>a</h2><p>b</p>`, readInstance(loose, rangeOf(loose, "x-two"))), { markup: `<h2>a</h2><p>b</p>`, dropped: ["id"] });
});

test("make component: a section becomes a template of whole-element slots and an instance holding its content", () => {
  const source = `<main>
  <section class="hero" id="top" data-key="hero">
    <h1 data-key="hero-title">A native <em>browser</em> preview</h1>
    <p class="lead">Edit plain HTML.</p>
    <img class="hero-image" src="/images/placeholder.svg" alt="A placeholder">
    <div class="actions"><a class="button" href="/about/">About</a></div>
  </section>
</main>`;
  const range = rangeOf(source, "section");
  const plan = makeComponentPlan(source, range, "section-hero");
  assert.ok(!("error" in plan));
  assert.equal(plan.template, `<section class="hero" data-key="hero">
  <slot name="title"><h1 data-key="hero-title">A native <em>browser</em> preview</h1></slot>
  <slot name="text"><p class="lead">Edit plain HTML.</p></slot>
  <slot name="image"><img class="hero-image" src="/images/placeholder.svg" alt="A placeholder"></slot>
  <div class="actions"><slot name="link"><a class="button" href="/about/">About</a></slot></div>
</section>
`);
  assert.equal(plan.instance, `<section-hero id="top">
    <h1 slot="title" data-key="hero-title">A native <em>browser</em> preview</h1>
    <p slot="text" class="lead">Edit plain HTML.</p>
    <img slot="image" class="hero-image" src="/images/placeholder.svg" alt="A placeholder">
    <a slot="link" class="button" href="/about/">About</a>
  </section-hero>`);
  assert.equal(plan.css, ":host {\n  display: block;\n}\n");
  // Each planned slot: its element's path inside the section, kind, name, chosen by the rule, not fixed.
  assert.deepEqual(plan.slots.map(({ path, name, kind, text, byDefault, fixed }) => ({ path, name, kind, text, byDefault, fixed })), [
    { path: [0], name: "title", kind: "text", text: "A native browser preview", byDefault: true, fixed: false },
    { path: [1], name: "text", kind: "text", text: "Edit plain HTML.", byDefault: true, fixed: false },
    { path: [2], name: "image", kind: "image", text: "A placeholder", byDefault: true, fixed: false },
    { path: [3, 0], name: "link", kind: "link", text: "About", byDefault: true, fixed: false },
  ]);
  // The template with the instance's content renders what the page had: each slot's fallback is the page's copy.
  const replaced = source.slice(0, range.start) + plan.instance + source.slice(range.end);
  const instance = readInstance(replaced, rangeOf(replaced, "section-hero"));
  const states = slotStates(plan.template, instance);
  for (const slot of templateSlots(plan.template)) {
    assert.equal(states.get(slot.name)?.shown, true);
    // Kind from the fallback element.
    assert.equal(slot.kind, plan.slots.find((planned) => planned.name === slot.name)?.kind);
  }
  // A single line of text fills the unnamed slot.
  const line = `<p class="note">Shared <b>note</b></p>`;
  const note = makeComponentPlan(line, rangeOf(line, "p"), "site-note");
  assert.ok(!("error" in note));
  assert.equal(note.template, `<p class="note"><slot>Shared <b>note</b></slot></p>\n`);
  assert.equal(note.instance, `<site-note>Shared <b>note</b></site-note>`);
  assert.deepEqual(note.slots.map(({ path, name, kind }) => ({ path, name, kind })), [{ path: [], name: "", kind: "text" }]);
});

test("make component refuses <main>, <body>, components and anything inside an instance", () => {
  const page = `<body>
  <site-header></site-header>
  <main>
    <section-hero><h1 slot="title">Hi</h1><div slot="extra"><p>Inside</p></div></section-hero>
    <section><h2>Ok</h2></section>
  </main>
  <site-footer></site-footer>
</body>`;
  const refused = (name: string, nth = 0) => {
    const plan = makeComponentPlan(page, rangeOf(page, name, nth), "section-new");
    return "error" in plan ? plan.error : undefined;
  };
  assert.match(refused("main") ?? "", /<main> cannot be a component/);
  assert.match(refused("body") ?? "", /<body> cannot be a component/);
  assert.equal(refused("site-header"), "This is a component already.");
  assert.equal(refused("site-footer"), "This is a component already.");
  assert.equal(refused("section-hero"), "This is a component already.");
  assert.match(refused("h1") ?? "", /inside the component instance <section-hero>/);
  assert.match(refused("p") ?? "", /inside the component instance <section-hero>/);
  assert.equal(refused("section"), undefined);
  const holding = `<section><slot name="x"></slot></section>`;
  assert.ok("error" in makeComponentPlan(holding, rangeOf(holding, "section"), "section-x"));
  const unclosed = `<section><h2>Open`;
  assert.ok("error" in makeComponentPlan(unclosed, rangeOf(unclosed, "section"), "section-x"));
});

test("make component: text keeps its rich inline content; images, pictures and standalone links are slots; svg stays fixed", () => {
  const source = `<div class="promo">
  <svg class="icon" viewBox="0 0 8 8"><path d="M0 0h8v8z"/></svg>
  <h2>Big <strong>news</strong></h2>
  <p>Read <a href="/a/">the story</a> or <em>skip</em> it.<br>Thanks.</p>
  <picture><source srcset="/a.webp"><img src="/a.jpg" alt="Shop front"></picture>
  <img src="/deco.png" alt="">
  <a href="/more/">More</a>
</div>`;
  const plan = makeComponentPlan(source, rangeOf(source, "div"), "block-promo");
  assert.ok(!("error" in plan));
  assert.equal(plan.template, `<div class="promo">
  <svg class="icon" viewBox="0 0 8 8"><path d="M0 0h8v8z"/></svg>
  <slot name="title"><h2>Big <strong>news</strong></h2></slot>
  <slot name="text"><p>Read <a href="/a/">the story</a> or <em>skip</em> it.<br>Thanks.</p></slot>
  <slot name="image"><picture><source srcset="/a.webp"><img src="/a.jpg" alt="Shop front"></picture></slot>
  <slot name="image-2"><img src="/deco.png" alt=""></slot>
  <slot name="link"><a href="/more/">More</a></slot>
</div>
`);
  assert.deepEqual(plan.slots.map(({ path, name, kind }) => [path.join("."), name, kind]), [
    ["1", "title", "text"],
    ["2", "text", "text"],
    ["3", "image", "image"],
    ["4", "image-2", "image"],
    ["5", "link", "link"],
  ]);
  assert.equal(plan.instance, `<block-promo>
  <h2 slot="title">Big <strong>news</strong></h2>
  <p slot="text">Read <a href="/a/">the story</a> or <em>skip</em> it.<br>Thanks.</p>
  <picture slot="image"><source srcset="/a.webp"><img src="/a.jpg" alt="Shop front"></picture>
  <img slot="image-2" src="/deco.png" alt="">
  <a slot="link" href="/more/">More</a>
</block-promo>`);
});

test("make component names slots by role, numbers repeats and breaks ties by class", () => {
  // One part per role: the role name, whatever the class.
  const card = `<article class="card"><h3 class="card__heading">A</h3><p class="lead">B</p></article>`;
  const named = (source: string, name: string) => {
    const plan = makeComponentPlan(source, rangeOf(source, name), "card-x");
    assert.ok(!("error" in plan));
    return plan.slots.map((slot) => slot.name);
  };
  assert.deepEqual(named(card, "article"), ["title", "text"]);
  // Repeats without telling classes are numbered.
  assert.deepEqual(named(`<section><h2>A</h2><h3>B</h3><p>C</p><p>D</p><p>E</p></section>`, "section"), ["title", "title-2", "text", "text-2", "text-3"]);
  // A tie is broken by each part's own class (a BEM element's last part); shared or missing classes are numbered.
  assert.deepEqual(named(`<section><p class="eyebrow">A</p><h1>B</h1><p class="hero__lead">C</p><p class="small">D</p><p class="small">E</p><p>F</p></section>`, "section"),
    ["eyebrow", "title", "lead", "text", "text-2", "text-3"]);
  // Generated names never collide.
  assert.deepEqual(named(`<section><h2>A</h2><h3>B</h3><p class="title-2">C</p><p>D</p></section>`, "section"), ["title", "title-2", "title-2-2", "text"]);
});

test("make component takes parts to keep fixed, slot renames and parts made slots by hand", () => {
  const source = `<section class="intro">
  <h2>Hello</h2>
  <p class="lead">Lead text</p>
  <p>Body</p>
  <div class="price">£40</div>
</section>`;
  const plan = makeComponentPlan(source, rangeOf(source, "section"), "section-intro", {
    fixed: [[2]],
    names: [{ path: [0], name: "heading" }, { path: [1], name: "text-2" }],
    slots: [[3]],
  });
  assert.ok(!("error" in plan));
  assert.equal(plan.template, `<section class="intro">
  <slot name="heading"><h2>Hello</h2></slot>
  <slot name="text-2"><p class="lead">Lead text</p></slot>
  <p>Body</p>
  <slot name="content"><div class="price">£40</div></slot>
</section>
`);
  assert.equal(plan.instance, `<section-intro>
  <h2 slot="heading">Hello</h2>
  <p slot="text-2" class="lead">Lead text</p>
  <div slot="content" class="price">£40</div>
</section-intro>`);
  // The fixed part keeps the name it would have, for its struck chip; the part made by hand is not a default slot.
  assert.deepEqual(plan.slots.map(({ path, name, kind, byDefault, fixed }) => [path.join("."), name, kind, byDefault, fixed]), [
    ["0", "heading", "text", true, false],
    ["1", "text-2", "text", true, false],
    ["2", "text", "text", true, true],
    ["3", "content", "content", false, false],
  ]);
  // A part made a slot by hand inside a part kept fixed: the fixed part stays, its child becomes the slot.
  const nested = `<section><p>Call <strong>now</strong></p></section>`;
  const inner = makeComponentPlan(nested, rangeOf(nested, "section"), "section-call", { fixed: [[0]], slots: [[0, 0]] });
  assert.ok(!("error" in inner));
  assert.equal(inner.template, `<section><p>Call <slot name="text-2"><strong>now</strong></slot></p></section>\n`);
  // Fixing every part leaves nothing for the page.
  const none = makeComponentPlan(nested, rangeOf(nested, "section"), "section-call", { fixed: [[0]] });
  assert.ok(!("error" in none));
  assert.equal(none.instance, `<section-call></section-call>`);
});

test("make component on the starter's contact section: whole-element slots, the mail link kept as rich text", () => {
  const source = readFileSync(new URL("../fixtures/actual-starter/about/index.html", import.meta.url), "utf8");
  const range = rangeOf(source, "section", 2);
  const plan = makeComponentPlan(source, range, "section-contact");
  assert.ok(!("error" in plan));
  assert.equal(plan.template, `<section class="contact flow">
  <slot name="title"><h2>Get in touch</h2></slot>
  <slot name="text"><p>We are usually booking two to three months ahead. If you have a project in mind, write to us with a few lines about what you need and when you hope to launch.</p></slot>
  <slot name="text-2"><p><a href="mailto:hello@larkspur.example">hello@larkspur.example</a></p></slot>
</section>
`);
  assert.equal(plan.instance, `<section-contact id="contact">
      <h2 slot="title">Get in touch</h2>
      <p slot="text">We are usually booking two to three months ahead. If you have a project in mind, write to us with a few lines about what you need and when you hope to launch.</p>
      <p slot="text-2"><a href="mailto:hello@larkspur.example">hello@larkspur.example</a></p>
    </section-contact>`);
});

test("make component: a part's lines move to the instance's indentation; a text element kept fixed can hold a slot", () => {
  const source = `<main>
  <section>
    <picture>
      <source srcset="/a.webp">
      <img src="/a.jpg" alt="A">
    </picture>
  </section>
</main>`;
  const plan = makeComponentPlan(source, rangeOf(source, "section"), "section-pic");
  assert.ok(!("error" in plan));
  assert.equal(plan.instance, `<section-pic>
    <picture slot="image">
      <source srcset="/a.webp">
      <img src="/a.jpg" alt="A">
    </picture>
  </section-pic>`);
  // The element itself is a line of text kept fixed, with its emphasis made a slot by hand.
  const line = `<p>Call <strong>now</strong></p>`;
  const kept = makeComponentPlan(line, rangeOf(line, "p"), "block-call", { fixed: [[]], slots: [[0]] });
  assert.ok(!("error" in kept));
  assert.equal(kept.template, `<p>Call <slot name="text"><strong>now</strong></slot></p>\n`);
  assert.equal(kept.instance, `<block-call>\n  <strong slot="text">now</strong>\n</block-call>`);
  assert.deepEqual(kept.slots.map(({ path, name, fixed }) => [path.join("."), name, fixed]), [["", "", true], ["0", "text", false]]);
});

test("review: cells, summaries and picture sources stay in place; a link's text fills its unnamed slot", () => {
  const plan = (source: string, name: string, choices = {}) => {
    const made = makeComponentPlan(source, rangeOf(source, name), "block-x", choices);
    assert.ok(!("error" in made));
    return made;
  };
  // A slot round a cell or a summary would take it out of its table or details.
  const table = plan(`<section><table><tr><td>Cell</td><td><p>Note</p></td></tr></table><details><summary>More</summary><p>Body</p></details></section>`, "section", { slots: [[0, 0, 0]] });
  assert.equal(table.template, `<section><table><tr><td>Cell</td><td><slot name="text"><p>Note</p></slot></td></tr></table><details><summary>More</summary><slot name="text-2"><p>Body</p></slot></details></section>\n`);
  // A picture made into a component keeps its sources with its image.
  assert.deepEqual(plan(`<picture><source srcset="/a.webp"><img src="/a.jpg" alt=""></picture>`, "picture").slots, []);
  const link = plan(`<a class="btn" href="/about/">About <em>us</em></a>`, "a", { names: [{ path: [], name: "label" }] });
  assert.equal(link.template, `<a class="btn" href="/about/"><slot>About <em>us</em></slot></a>\n`);
  assert.equal(link.instance, `<block-x>About <em>us</em></block-x>`);
  assert.deepEqual(link.slots.map(({ name, kind }) => [name, kind]), [["", "text"]]);
  // The element's own text moves to the instance as written.
  assert.equal(plan(`<a href="/" style="white-space: pre">A  B</a>`, "a").instance, `<block-x>A  B</block-x>`);
});

test("review: renames never collide, and a part the rule picks stays a default slot when chosen by hand", () => {
  const source = `<section><h2>A</h2><p>B</p><p>C</p></section>`;
  const plan = makeComponentPlan(source, rangeOf(source, "section"), "section-x", {
    names: [{ path: [0], name: "same" }, { path: [1], name: "same" }],
    slots: [[2]],
  });
  assert.ok(!("error" in plan));
  assert.deepEqual(plan.slots.map(({ name, byDefault }) => [name, byDefault]), [["same", true], ["same-2", true], ["text-2", true]]);
});

test("make component: a card grid becomes the unnamed slot, its cards moved to the page as they are", () => {
  const source = `<main>
  <section class="work" id="work">
    <h2>Recent work</h2>
    <div class="cards">
      <article class="card">
        <h3>Fern</h3>
        <p>A cafe.</p>
      </article>
      <article class="card featured"><h3>Harbour</h3></article>
      <article class="card"><h3>Meadow</h3></article>
    </div>
  </section>
</main>`;
  const plan = makeComponentPlan(source, rangeOf(source, "section"), "section-work");
  assert.ok(!("error" in plan));
  assert.equal(plan.template, `<section class="work">
  <slot name="title"><h2>Recent work</h2></slot>
  <div class="cards">
    <slot></slot>
  </div>
</section>
`);
  assert.equal(plan.instance, `<section-work id="work">
    <h2 slot="title">Recent work</h2>
    <article class="card">
      <h3>Fern</h3>
      <p>A cafe.</p>
    </article>
    <article class="card featured"><h3>Harbour</h3></article>
    <article class="card"><h3>Meadow</h3></article>
  </section-work>`);
  // One planned slot for the group, with each card's path; the cards' own texts are not slots.
  assert.deepEqual(plan.slots.map(({ path, name, kind, byDefault, items }) => ({ path, name, kind, byDefault, items })), [
    { path: [0], name: "title", kind: "text", byDefault: true, items: undefined },
    { path: [1, 0], name: "", kind: "content", byDefault: true, items: [[1, 0], [1, 1], [1, 2]] },
  ]);
  // The page shows what it showed: the cards fill the unnamed slot, an items slot.
  const replaced = source.replace(source.slice(rangeOf(source, "section").start, rangeOf(source, "section").end), plan.instance);
  const states = slotStates(plan.template, readInstance(replaced, rangeOf(replaced, "section-work")));
  assert.equal(states.get("")?.shown, true);
  assert.deepEqual(templateSlots(plan.template).map(({ name, items }) => [name, items]), [["title", false], ["", true]]);
});

test("make component on the starter's Recent work: its card instances become the unnamed slot's items", () => {
  const source = readFileSync(new URL("../fixtures/actual-starter/index.html", import.meta.url), "utf8");
  const range = rangeOf(source, "section");
  const plan = makeComponentPlan(source, range, "section-work");
  assert.ok(!("error" in plan));
  assert.equal(plan.template, `<section class="flow">
  <slot name="title"><h2>Recent work</h2></slot>
  <div class="cards">
    <slot></slot>
  </div>
</section>
`);
  // Each instance moves as it is, its own slots kept.
  assert.equal((plan.instance.match(/<card-project>/g) ?? []).length, 3);
  assert.match(plan.instance, /^<section-work id="work">\n      <h2 slot="title">Recent work<\/h2>\n      <card-project>\n        <p slot="note">Cafe/);
  assert.deepEqual(plan.slots.map(({ name, items }) => [name, items?.length]), [["title", undefined], ["", 3]]);
});

test("make component: later groups are items-2, items-3; one item alone or items split by text are no group", () => {
  const source = `<section>
  <div class="logos"><figure class="logo"><img src="/a.svg" alt="A"></figure><figure class="logo"><img src="/b.svg" alt="B"></figure></div>
  <div class="quotes"><blockquote><p>One</p></blockquote><blockquote><p>Two</p></blockquote></div>
  <div class="links"><a class="card" href="/a/"><h3>A</h3></a><a class="card" href="/b/"><h3>B</h3></a></div>
  <div class="single"><article class="card"><h3>Alone</h3></article></div>
  <div class="split"><div class="stat">1</div> and <div class="stat">2</div></div>
</section>`;
  const plan = makeComponentPlan(source, rangeOf(source, "section"), "section-x");
  assert.ok(!("error" in plan));
  assert.deepEqual(plan.slots.map(({ path, name, items }) => [path.join("."), name, items?.length]), [
    ["0.0", "", 2],
    ["1.0", "items-2", 2],
    ["2.0", "items-3", 2],
    ["3.0.0", "title", undefined],
  ]);
  // A named group's items carry its name on the page, with what was between them (here nothing) kept.
  assert.match(plan.instance, /\n  <blockquote slot="items-2"><p>One<\/p><\/blockquote><blockquote slot="items-2"><p>Two<\/p><\/blockquote>\n/);
  assert.match(plan.template, /<div class="quotes"><slot name="items-2"><\/slot><\/div>/);
  // Text between items keeps them apart; the stats stay in the template.
  assert.match(plan.template, /<div class="split"><div class="stat">1<\/div> and <div class="stat">2<\/div><\/div>/);
  // Lines of text, standalone links and images are slots of their own, never a group.
  const own = `<section><p>A</p><p>B</p><a href="/a/">A</a><a href="/b/">B</a><img src="/a.png" alt=""><img src="/b.png" alt=""></section>`;
  const single = makeComponentPlan(own, rangeOf(own, "section"), "section-x");
  assert.ok(!("error" in single));
  assert.deepEqual(single.slots.map(({ name }) => name), ["text", "text-2", "link", "link-2", "image", "image-2"]);
  // Same tag and first class make one group; instances group by their tag.
  const mixed = `<section><div class="card a">1</div><div class="card b">2</div><card-note></card-note><card-note class="x"></card-note></section>`;
  const grouped = makeComponentPlan(mixed, rangeOf(mixed, "section"), "section-x");
  assert.ok(!("error" in grouped));
  assert.deepEqual(grouped.slots.map(({ name, items }) => [name, items]), [["", [[0], [1]]], ["items-2", [[2], [3]]]]);
  assert.equal(grouped.template, `<section><slot></slot><slot name="items-2"></slot></section>\n`);
  // Comments between items keep them one group and move with them.
  const commented = `<div>\n  <!-- first -->\n  <article class="card">A</article>\n  <!-- second -->\n  <article class="card">B</article>\n</div>`;
  const run = makeComponentPlan(commented, rangeOf(commented, "div"), "block-x");
  assert.ok(!("error" in run));
  assert.equal(run.template, `<div>\n  <!-- first -->\n  <slot></slot>\n</div>\n`);
  assert.equal(run.instance, `<block-x>\n  <article class="card">A</article>\n  <!-- second -->\n  <article class="card">B</article>\n</block-x>`);
});

test("make component: a list becomes one list slot, its items not slots of their own", () => {
  const source = `<section>
  <h2>Steps</h2>
  <ol class="steps">
    <li>Write</li>
    <li>Publish</li>
  </ol>
</section>`;
  const plan = makeComponentPlan(source, rangeOf(source, "section"), "section-steps");
  assert.ok(!("error" in plan));
  assert.deepEqual(plan.slots.map(({ path, name, kind }) => [path.join("."), name, kind]), [["0", "title", "text"], ["1", "list", "content"]]);
  assert.equal(plan.template, `<section>
  <slot name="title"><h2>Steps</h2></slot>
  <slot name="list"><ol class="steps">
    <li>Write</li>
    <li>Publish</li>
  </ol></slot>
</section>
`);
  assert.match(plan.instance, /<ol slot="list" class="steps">\n    <li>Write<\/li>/);
  // Several lists are numbered like any role.
  const two = `<div><ul><li>A</li></ul><ol><li>B</li></ol></div>`;
  const lists = makeComponentPlan(two, rangeOf(two, "div"), "block-x");
  assert.ok(!("error" in lists));
  assert.deepEqual(lists.slots.map(({ name }) => name), ["list", "list-2"]);
  // A list made a component: its items are the repeated group.
  const list = `<ul class="links"><li><a href="/a/">A</a></li><li><a href="/b/">B</a></li></ul>`;
  const own = makeComponentPlan(list, rangeOf(list, "ul"), "block-links");
  assert.ok(!("error" in own));
  assert.equal(own.template, `<ul class="links"><slot></slot></ul>\n`);
  assert.deepEqual(own.slots.map(({ name, items }) => [name, items]), [["", [[0], [1]]]]);
});

test("make component: a group renamed or kept fixed; a renamed items slot keeps its role once its fallback is a card component", () => {
  const source = `<section><h2>Services</h2><div class="card"><h3>A</h3></div><div class="card"><h3>B</h3></div></section>`;
  const renamed = makeComponentPlan(source, rangeOf(source, "section"), "section-services", { names: [{ path: [1], name: "services" }] });
  assert.ok(!("error" in renamed));
  assert.equal(renamed.template, `<section><slot name="title"><h2>Services</h2></slot><slot name="services"></slot></section>\n`);
  assert.match(renamed.instance, /<div slot="services" class="card"><h3>A<\/h3><\/div><div slot="services" class="card"><h3>B<\/h3><\/div>/);
  // Kept fixed, the items stay in the template; a part made a slot inside one of them still is.
  const kept = makeComponentPlan(source, rangeOf(source, "section"), "section-services", { fixed: [[1]], slots: [[2, 0]] });
  assert.ok(!("error" in kept));
  assert.equal(kept.template, `<section><slot name="title"><h2>Services</h2></slot><div class="card"><h3>A</h3></div><div class="card"><slot name="title-2"><h3>B</h3></slot></div></section>\n`);
  assert.deepEqual(kept.slots.map(({ path, name, fixed, byDefault }) => [path.join("."), name, fixed, byDefault]), [
    ["0", "title", false, true],
    ["1", "", true, true],
    ["2.0", "title-2", false, false],
  ]);
  // A later item of a group kept fixed can be made a slot whole.
  const whole = makeComponentPlan(source, rangeOf(source, "section"), "section-services", { fixed: [[1]], slots: [[2]] });
  assert.ok(!("error" in whole));
  assert.equal(whole.template, `<section><slot name="title"><h2>Services</h2></slot><div class="card"><h3>A</h3></div><slot name="content"><div class="card"><h3>B</h3></div></slot></section>\n`);
  assert.deepEqual(whole.slots.map(({ path, name, fixed, byDefault }) => [path.join("."), name, fixed, byDefault]), [
    ["0", "title", false, true],
    ["1", "", true, true],
    ["2", "content", false, false],
  ]);
  // In a template: the unnamed slot is an items slot; a named one only when its fallback is a card component.
  const items = (template: string) => templateSlots(template).map(({ name, items: role }) => [name, role]);
  assert.deepEqual(items(`<slot name="services"></slot>`), [["services", false]]);
  assert.deepEqual(items(`<slot name="services">\n  <card-service></card-service>\n</slot>`), [["services", true]]);
  assert.deepEqual(items(`<slot name="note"><block-note></block-note></slot><slot name="pair"><card-a></card-a><p>x</p></slot><slot><p>Text</p></slot>`),
    [["note", false], ["pair", false], ["", true]]);
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

test("review: detach preserves slot boundary spaces, forwarded text and pre whitespace", () => {
  const source = `<x-card> world </x-card>`;
  const instance = readInstance(source, rangeOf(source, "x-card"));
  assert.equal(detachMarkup(source, `<p>Hello<slot></slot>!</p>`, instance).markup, `<p>Hello world !</p>`);
  assert.equal(detachMarkup(source, `<x-inner><slot slot="body"></slot></x-inner>`, instance).markup, `<x-inner><span slot="body"> world </span></x-inner>`);
  const pre = `<x-card> first\n  second \n </x-card>`;
  assert.equal(detachMarkup(pre, `<pre><slot></slot></pre>`, readInstance(pre, rangeOf(pre, "x-card"))).markup, `<pre> first\n  second \n </pre>`);
  const newline = `<div>\n  <x-card>first\n</x-card>\n</div>`;
  assert.equal(detachMarkup(newline, `<pre><slot></slot></pre>`, readInstance(newline, rangeOf(newline, "x-card"))).markup, `<pre>first\n</pre>`);
  const indented = `<div>\n  ${pre}\n</div>`;
  assert.equal(detachMarkup(indented, `<pre><slot></slot></pre>`, readInstance(indented, rangeOf(indented, "x-card"))).markup, `<pre> first\n  second \n </pre>`);
});

test("review: detach merges class tokens without corrupting named or numeric references", () => {
  const source = `<x-card class='caf&eacute; caf&#233; caf&#xE9;'></x-card>`;
  assert.equal(detachMarkup(source, `<p class="base"></p>`, readInstance(source, rangeOf(source, "x-card"))).markup, `<p class="base caf&eacute; caf&#233; caf&#xE9;"></p>`);
});

test("review: detach retains whitespace and comments between fills, without copying another slot", () => {
  const source = `<x-card><b>Hello</b> <!-- note --> <i>world</i></x-card>`;
  assert.equal(detachMarkup(source, `<p><slot></slot></p>`, readInstance(source, rangeOf(source, "x-card"))).markup, `<p><b>Hello</b> <!-- note --> <i>world</i></p>`);
  const named = `<x-card><b>Hello</b> <span slot="other">Other</span> <i>world</i></x-card>`;
  assert.equal(detachMarkup(named, `<p><slot></slot></p>`, readInstance(named, rangeOf(named, "x-card"))).markup, `<p><b>Hello</b>  <i>world</i></p>`);
  const slotted = `<x-card><b slot="body">Hello</b> <i slot="body">world</i></x-card>`;
  assert.equal(detachMarkup(slotted, `<p><slot name="body"></slot></p>`, readInstance(slotted, rangeOf(slotted, "x-card"))).markup, `<p><b>Hello</b><i>world</i></p>`);
});

// ---- Line breaks typed in a Structure field ----
import { breakSpelling, breaksAllowed, breakText, breakTextEdit } from "../src/page-builder/component-model.ts";

const applyEdit = (source: string, edit: { start: number; end: number; text: string } | undefined) =>
  edit ? source.slice(0, edit.start) + edit.text + source.slice(edit.end) : source;
// The inner range of the only <p> in `source`.
const innerOf = (source: string) => ({ from: source.indexOf(">") + 1, to: source.lastIndexOf("</p>") });

test("breakText shows each <br> spelling as a line break and collapses the rest", () => {
  assert.equal(breakText("One<br>Two"), "One\nTwo");
  assert.equal(breakText("One<br/>Two<br />Three<BR>Four"), "One\nTwo\nThree\nFour");
  assert.equal(breakText("\n   One  <br>\n   Two &amp; three\n "), "One\nTwo & three");
  assert.equal(breakText("No break"), "No break");
  assert.equal(breakSpelling("a<br />b"), "<br />");
  assert.equal(breakSpelling("a b"), "<br>");
});

test("breakTextEdit writes typed lines as text joined by the source's own <br>, escaped", () => {
  const cases: [string, string, string][] = [
    // source, typed text, expected source
    ["<p>One</p>", "One\nTwo", "<p>One<br>Two</p>"],
    ["<p>One<br/>Two</p>", "One\nTwo\nThree", "<p>One<br/>Two<br/>Three</p>"],
    ["<p>One<br />Two</p>", "One", "<p>One</p>"],
    ["<p>One<br>Two<br>Three</p>", "One\nThree", "<p>One<br>Three</p>"],
    ["<p>One<br>Two</p>", "Zero\nOne\nTwo", "<p>Zero<br>One<br>Two</p>"],
    ["<p>One<br>Two</p>", "One\nTwo & <b>", "<p>One<br>Two &amp; &lt;b&gt;</p>"],
    ["<p>Cats &amp; dogs</p>", "Cats &\ndogs <3", "<p>Cats &amp;<br>dogs &lt;3</p>"],
  ];
  for (const [source, typed, expected] of cases) {
    const { from, to } = innerOf(source);
    const after = applyEdit(source, breakTextEdit(source, from, to, typed));
    assert.equal(after, expected, `${source} + ${JSON.stringify(typed)}`);
    // Round trip: the written source shows what was typed.
    assert.equal(breakText(after.slice(innerOf(after).from, innerOf(after).to)), typed);
  }
});

test("breakTextEdit keeps formatting outside the changed line and changes nothing for the same text", () => {
  const source = "<p><strong>Bold</strong> start<br>\n  second line</p>";
  const { from, to } = innerOf(source);
  assert.equal(breakTextEdit(source, from, to, "Bold start\nsecond line"), undefined);
  const after = applyEdit(source, breakTextEdit(source, from, to, "Bold start\nsecond lines"));
  assert.equal(after, "<p><strong>Bold</strong> start<br>\n  second lines</p>");
});

test("typing after a space typed at the end leaves no space behind, and layout white space stays", () => {
  const typed = "<span>Fresh </span>";
  const edit = textChangeEdit(typed, 6, typed.length - 7, "Fresh t");
  assert.equal(edit && typed.slice(0, edit.start) + edit.text + typed.slice(edit.end), "<span>Fresh t</span>");
  const layout = "<p>\n  Fresh\n</p>";
  const kept = textChangeEdit(layout, 3, layout.length - 4, "Fresh t");
  assert.equal(kept && layout.slice(0, kept.start) + kept.text + layout.slice(kept.end), "<p>\n  Fresh t\n</p>");
});

test("only an element's own <br>s are line boundaries: a break inside a link keeps the field one line", () => {
  assert.equal(breaksAllowed('Call <a href="/x">us<br>now</a>'), false);
  assert.equal(breaksAllowed('Call <a href="/x">us</a><br>now'), true);
  // A slot whose element has a break inside a link is edited as one line, and keeps its link.
  const template = `<div><slot name="lead"></slot></div>`;
  const source = `<x-c><p slot="lead">Call <a href="/x">us<br>now</a></p></x-c>`;
  const instance = readInstance(source, rangeOf(source, "x-c"));
  const slot = templateSlots(template)[0];
  const value = slotValue(source, template, instance, slot);
  assert.equal(value.breaks, false);
  const edit = slotTextEdit(source, template, instance, slot, `${value.text}!`);
  assert.ok(!("error" in edit));
  assert.equal(apply(source, edit), `<x-c><p slot="lead">Call <a href="/x">us<br>now!</a></p></x-c>`);
});

test("rewriting or taking out lines that hold a link is refused; text-only lines around it change", () => {
  const source = `<p>Call <a href="/x">us</a><br>now<br>later</p>`;
  const { from, to } = innerOf(source);
  // Taking out the line with the link, or merging it into the next, would drop the link: refused.
  assert.equal(breakTextEdit(source, from, to, "now\nlater"), undefined);
  assert.equal(breakTextEdit(source, from, to, "Call us now\nlater"), undefined);
  // Lines of text alone change as usual; the link's line stays as it is.
  assert.equal(applyEdit(source, breakTextEdit(source, from, to, "Call us\nnow\nlater on")), `<p>Call <a href="/x">us</a><br>now<br>later on</p>`);
  assert.equal(applyEdit(source, breakTextEdit(source, from, to, "Call us\nlater")), `<p>Call <a href="/x">us</a><br>later</p>`);
});

test("new breaks copy the content's <br> spelling, never its attributes", () => {
  assert.equal(breakSpelling('a<br id="x">b'), "<br>");
  assert.equal(breakSpelling('a<br data-note="a/b>c" />b'), "<br />");
  assert.equal(breakSpelling("a<BR/>b"), "<br/>");
  const source = '<p>One<br id="x">Two</p>';
  const { from, to } = innerOf(source);
  assert.equal(applyEdit(source, breakTextEdit(source, from, to, "One\nTwo\nThree")), '<p>One<br id="x">Two<br>Three</p>');
});
