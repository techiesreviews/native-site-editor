import assert from "node:assert/strict";
import test from "node:test";
import { makeComponentPlan, parseSource, type InstanceRange, type MakeComponentPlan, type SourceElement } from "../src/page-builder/component-model.ts";
import { compoundsOf, flatRules, withPageCss } from "../src/page-builder/component-css.ts";

// The outer range of the first element named `name` in `source`.
function rangeOf(source: string, name: string, nth = 0): InstanceRange {
  const find = (nodes: ReturnType<typeof parseSource>): SourceElement[] =>
    nodes.flatMap((node) => (node.type === "element" ? [...(node.name === name ? [node] : []), ...find(node.children)] : []));
  const el = find(parseSource(source))[nth];
  assert.ok(el, `no <${name}> in source`);
  return { tag: el.tag, start: el.start, end: el.end, close: el.close };
}

// Make component on the first `<name>` of `body` (inside a page with `<main>`), with `css` as styles/site.css.
function made(body: string, css: string, name = "section", tag = "section-intro"): MakeComponentPlan {
  const page = `<!doctype html>\n<html>\n<head><link rel="stylesheet" href="/styles/site.css"></head>\n<body>\n<main>\n${body}\n</main>\n</body>\n</html>\n`;
  const range = rangeOf(page, name);
  const plan = makeComponentPlan(page, range, tag, {}, []);
  assert.ok(!("error" in plan), "error" in plan ? plan.error : "");
  return withPageCss(plan, page, range, tag, [{ path: "styles/site.css", source: css }]);
}

// The copied rules alone: the CSS after the plan's own `:host` rule and the comment.
const copied = (css: string) => css.replace(/^:host \{[^}]*\}\n/, "").replace(/^\n\/\*[^*]*\*\/\n/, "");

const intro = `<section class="intro">
  <h2>Hello</h2>
  <p class="lead">A <a href="/a/">link</a> in the lead.</p>
  <div class="actions">
    <a href="/start/">Start</a>
    <a href="/more/">More</a>
  </div>
</section>`;

test("compounds and their combinators", () => {
  assert.deepEqual(compoundsOf("main > .intro  h2 + p ~ a.x[href]:hover::after")?.map((c) => c.combinator), ["", ">", " ", "+", "~"]);
  assert.equal(compoundsOf(".a:is(.b, .c) .d")?.length, 2);
  assert.equal(compoundsOf("a ||b"), undefined);
});

test("flat rules: nesting resolved, layers read through, other at-rules left out", () => {
  const rules = flatRules(`@layer sections {
  .intro { padding: 1rem; /* c */ & h2 { color: red } > p { margin: 0 } }
}
@keyframes spin { from { rotate: 0 } }
@font-face { font-family: X; src: url(x.woff2); }
@media (min-width: 40em) { .intro h2 { font-size: 2rem } }`, "s.css");
  assert.deepEqual(rules.map((rule) => [rule.selectors, rule.declarations, rule.wrappers]), [
    [[".intro"], ["padding: 1rem"], []],
    [[".intro h2"], ["color: red"], []],
    [[".intro > p"], ["margin: 0"], []],
    [[".intro h2"], ["font-size: 2rem"], ["@media (min-width: 40em)"]],
  ]);
});

test("ancestor compounds are dropped; a rule the page still reaches is not copied", () => {
  const plan = made(intro, `.intro h2 { letter-spacing: 2px; }
.intro .lead { font-size: 20px; }
main .intro .actions a { text-transform: uppercase; }
h2 { font-weight: 700; }
p a { color: blue; }
.intro .actions { display: flex; }
main .intro .actions { gap: 8px; }`);
  assert.equal(copied(plan.css), `.intro h2 {
  letter-spacing: 2px;
}
.intro .lead {
  font-size: 20px;
}
.intro .actions a {
  text-transform: uppercase;
}
.intro .actions {
  gap: 8px;
}
`);
  assert.match(plan.css, /^:host \{\n  display: block;\n\}\n\n\/\* The rules that styled this element in styles\/site.css, rewritten to start at it\./);
  assert.deepEqual(plan.notes, []);
});

test("a compound that matched the element by its id becomes :host", () => {
  const plan = made(intro.replace(`<section class="intro">`, `<section class="intro" id="about">`), `#about .actions { gap: 4px; }
main #about > .actions { padding: 0; }
#about { margin-block: 2rem; }
section#about.intro:hover .actions { outline: 1px solid; }
#about::before { content: ""; }`);
  assert.equal(copied(plan.css), `:host .actions {
  gap: 4px;
}
:host > section > .actions {
  padding: 0;
}
:host {
  margin-block: 2rem;
}
section.intro:hover .actions {
  outline: 1px solid;
}
section::before {
  content: "";
}
`);
});

test("at-rule wrappers kept, @layer dropped, order kept", () => {
  const plan = made(intro, `@layer sections {
  .intro h2 { color: red; }
  @media (min-width: 40em) {
    .intro h2 { font-size: 3rem; }
    @supports (text-wrap: balance) { .intro h2 { text-wrap: balance; } }
  }
  .intro .lead { color: gray; }
}
@container (width > 30em) { main .intro .lead { font-size: 1.25rem; } }
.intro h2 { color: var(--accent); }`);
  assert.equal(copied(plan.css), `.intro h2 {
  color: red;
}
@media (min-width: 40em) {
  .intro h2 {
    font-size: 3rem;
  }
  @supports (text-wrap: balance) {
    .intro h2 {
      text-wrap: balance;
    }
  }
}
.intro .lead {
  color: gray;
}
@container (width > 30em) {
  .intro .lead {
    font-size: 1.25rem;
  }
}
.intro h2 {
  color: var(--accent);
}
`);
  assert.doesNotMatch(plan.css, /@layer/);
});

test("a rule whose subject sits inside a slotted element is reported and not copied", () => {
  const plan = made(intro, `.intro .lead a { color: green; }
.intro p a, .intro .actions a { font-weight: 600; }
.intro h2 { color: red; }`);
  assert.equal(copied(plan.css), `.intro .actions a {
  font-weight: 600;
}
.intro h2 {
  color: red;
}
`);
  assert.deepEqual(plan.notes, [
    "2 rules can't follow the parts into the component: .intro .lead a, .intro p a. The component's CSS can't reach what they style once the element is a component; nothing was copied for them.",
  ]);
});

test("a rule that depends on what stands beside the element is reported", () => {
  const page = `<main>\n<section class="hero"><h1>Hi</h1></section>\n${intro}\n</main>`;
  const range = rangeOf(page, "section", 1);
  const raw = makeComponentPlan(page, range, "section-intro", {}, []);
  assert.ok(!("error" in raw));
  const intoIntro = withPageCss(raw, page, range, "section-intro", [{ path: "styles/site.css", source: `.hero + .intro { margin-top: 0; }\n.hero ~ .intro h2 { color: red; }` }]);
  assert.equal(copied(intoIntro.css), "");
  assert.match(intoIntro.notes[0], /^2 rules can't follow the parts into the component: \.hero \+ \.intro, \.hero ~ \.intro h2\./);
});

test("state rules come along; url()s are rewritten for the component's folder", () => {
  const plan = made(intro, `.intro .actions a:hover { color: red; }
.intro .actions a:not(:focus-visible) { outline: none; }
.intro { background: url("../images/bg.png") no-repeat, url(/images/abs.png); }
main .intro h2 { background: url(icons.svg#tick); }`);
  assert.equal(copied(plan.css), `.intro .actions a:hover {
  color: red;
}
.intro .actions a:not(:focus-visible) {
  outline: none;
}
.intro h2 {
  background: url("../../styles/icons.svg#tick");
}
`);
});

test("rules for a card's items go to the card's CSS", () => {
  const work = `<section class="work">
  <h2>Recent work</h2>
  <div class="cards">
    <article class="project"><h3>One</h3><p class="body">First <em>one</em>.</p><a href="/one/">Read</a></article>
    <article class="project"><h3>Two</h3><p class="body">Second <em>one</em>.</p><a href="/two/">Read</a></article>
  </div>
</section>`;
  const plan = made(work, `.work h2 { color: red; }
.work .cards { display: grid; }
.work .project { padding: 1rem; }
.work .project h3 { font-size: 1.25rem; }
.cards > .project + .project { border-top: 1px solid; }
.work .project .body em { font-style: normal; }`, "section", "section-work");
  assert.equal(plan.cards.length, 1);
  assert.equal(plan.cards[0].tag, "card-work");
  assert.equal(copied(plan.css), `.work h2 {
  color: red;
}
`);
  assert.equal(copied(plan.cards[0].css), `.project {
  padding: 1rem;
}
.project h3 {
  font-size: 1.25rem;
}
`);
  assert.deepEqual(plan.notes, []);
  assert.match(plan.cards[0].notes.join(""), /^2 rules can't follow the parts into the component: \.cards > \.project \+ \.project, \.work \.project \.body em\./);
});

test("a link-wrapped card's rules follow its new article", () => {
  const page = `<main><div class="grid"><a class="tile" href="/x/"><h3>X</h3><p>Text</p></a></div></main>`;
  const range = rangeOf(page, "a");
  const raw = makeComponentPlan(page, range, "card-tile", {}, []);
  assert.ok(!("error" in raw));
  const plan = withPageCss(raw, page, range, "card-tile", [{ path: "styles/site.css", source: `.grid a.tile { display: block; }\n.grid a.tile h3 { margin: 0; }` }]);
  assert.equal(copied(plan.css), `article.tile {
  display: block;
}
article.tile h3 {
  margin: 0;
}
`);
});

test("no matching rules leave the plan's CSS as it was", () => {
  const plan = made(intro, `.other h2 { color: red; }\nh2 { margin: 0; }`);
  assert.equal(plan.css, ":host {\n  display: block;\n}\n");
});

test("flattening keeps declarations after a nested rule after it, nesting's list specificity, and strings as written", () => {
  const rules = flatRules(`main .intro {
  color: red;
  & { color: blue; }
  color: green; /* last */
}
.intro, #other { & h2 { color: red; } }
.intro h2[data-label="a  b"] { content: "/* hi */"; }`, "s.css");
  assert.deepEqual(rules.map((rule) => [rule.selectors, rule.declarations]), [
    [["main .intro"], ["color: red"]],
    [["main .intro"], ["color: blue"]],
    [["main .intro"], ["color: green"]],
    [[":is(.intro, #other) h2"], ["color: red"]],
    [[`.intro h2[data-label="a  b"]`], [`content: "/* hi */"`]],
  ]);
});

test("a template part beside a slot is matched as the template holds it", () => {
  // In the template the heading is a <slot>: `h2 + .box` stops reaching the box, so it is copied, and fails there too.
  const plan = made(`<section class="intro"><h2>Hi</h2><div class="box"><hr></div></section>`, `h2 + .box { color: red; }`);
  assert.equal(copied(plan.css), "");
  assert.match(plan.notes[0], /^1 rule can't follow the parts into the component: h2 \+ \.box\./);
});

test("a copy that can't reach its element is reported, not written", () => {
  const plan = made(intro.replace(`<section class="intro">`, `<section class="intro" id="about">`), `:is(#about) .actions { display: flex; }
main .intro h2::before { content: "Hi"; }
main .intro .lead:has(a) { color: red; }`);
  assert.equal(copied(plan.css), "");
  assert.match(plan.notes[0], /^3 rules can't follow the parts into the component: :is\(#about\) \.actions, main \.intro h2::before, main \.intro \.lead:has\(a\)\./);
});

test("escaped url()s are decoded before they are rewritten", () => {
  const plan = made(intro, `main .intro h2 { background: url("../images/bg\\20 wide.png"); }`);
  assert.match(plan.css, /url\("\.\.\/\.\.\/images\/bg wide\.png"\)/);
});

test("a slotted part's copy must reach it beside the slots its siblings became", () => {
  const plan = made(`<section class="intro"><h2>Hi</h2><p>Text</p></section>`, `main .intro h2 + p { color: red; }\nmain .intro p { margin: 0; }`);
  assert.equal(copied(plan.css), ".intro p {\n  margin: 0;\n}\n");
  assert.match(plan.notes[0], /^1 rule can't follow the parts into the component: main \.intro h2 \+ p\./);
});

test("nesting with & twice keeps every pairing of a parent list", () => {
  assert.deepEqual(flatRules(`.a, .b { & + & { color: red; } }`, "s.css")[0].selectors, [":is(.a, .b) + :is(.a, .b)"]);
});

test("a slotted part carries its slot attribute: a rule for parts not slotted stops reaching it and can't follow", () => {
  const plan = made(intro, `h2:not([slot]) { font-size: 2rem; }\n[slot="title"] { color: red; }`);
  assert.equal(copied(plan.css), "");
  assert.match(plan.notes[0], /^1 rule can't follow the parts into the component: h2:not\(\[slot\]\)\./);
});
