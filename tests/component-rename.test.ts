import assert from "node:assert/strict";
import { test } from "node:test";
import { componentRenamePlan, renameInstances, renameMessages, renameTagSelectors, type ComponentRenameInput } from "../src/page-builder/component-rename";

// Slice 76: renaming a component in Edit component mode's bar renames it everywhere, as one plan.
const template = `<section class="flow">
  <slot name="title"><h2>Section title</h2></slot>
  <div class="cards"><slot><card-project></card-project></slot></div>
</section>
`;
const css = `:host {
  display: block;
}

section-work h2,
.section-work > section-work {
  margin: 0;
}
`;
const home = `<!doctype html>
<html>
<head><style>section-work { color: red }</style></head>
<body>
  <main>
    <section-work id="work" class="wide">
      <h2 slot="title">Recent work</h2>
    </section-work>
    <p>Our section-work section, <code>&lt;section-work&gt;</code>.</p>
    <!-- <section-work></section-work> -->
    <section-work-2></section-work-2>
    <script>document.querySelector("section-work");</script>
  </main>
</body>
</html>
`;
const about = `<main>
  <section-work></section-work>
  <SECTION-WORK><h2 slot="title">Again</h2></SECTION-WORK>
</main>
`;
// Not open in the editor: the plan reads every page's source alike.
const contact = `<main><section-work></section-work></main>
`;
const plain = `<main><p>No components here.</p></main>
`;
// Another component using it as an items slot's fallback.
const list = `<div><slot><section-work></section-work></slot></div>
`;
const styles = `/* section-work */
section-work, section-work:hover, main > section-work::before { color: blue }
.section-work, #section-work, [data-x="section-work"], section-work-2, x-section-work { color: red }
@media (width > 40em) {
  section-work { padding: 0 }
}
a { content: "section-work"; font-family: section-work; }
`;
const layout = `main { display: grid }
`;

function input(over: Partial<ComponentRenameInput> = {}): ComponentRenameInput {
  const sources: Record<string, string> = {
    "components/section-work/section-work.html": template,
    "components/section-work/section-work.css": css,
    "components/card-list/card-list.html": list,
    "components/card-list/card-list.css": ":host { display: block }\n",
    "index.html": home,
    "about/index.html": about,
    "contact/index.html": contact,
    "plain/index.html": plain,
    "styles/site.css": styles,
    "styles/layout.css": layout,
  };
  return {
    from: "section-work",
    typed: "showcase",
    components: { "section-work": "components/section-work/section-work.html", "card-list": "components/card-list/card-list.html" },
    files: [...Object.keys(sources), "components/section-work/notes.txt", "images/a.png"],
    sources,
    pages: ["index.html", "about/index.html", "contact/index.html", "plain/index.html"],
    ...over,
  };
}

const planned = (over: Partial<ComponentRenameInput> = {}) => {
  const plan = componentRenamePlan(input(over));
  assert.ok("tag" in plan, JSON.stringify(plan));
  return plan;
};

test("the folder and its files move, the template and CSS named for the new tag", () => {
  const plan = planned();
  assert.equal(plan.tag, "section-showcase");
  assert.equal(plan.template, "components/section-showcase/section-showcase.html");
  assert.deepEqual(plan.moves, [
    { from: "components/section-work/notes.txt", to: "components/section-showcase/notes.txt" },
    { from: "components/section-work/section-work.css", to: "components/section-showcase/section-showcase.css" },
    { from: "components/section-work/section-work.html", to: "components/section-showcase/section-showcase.html" },
  ]);
  // The template doesn't name its own tag: it moves as it is.
  assert.equal(plan.edits.has("components/section-showcase/section-showcase.html"), false);
});

test("the tag in the component's own CSS is renamed, other names left alone", () => {
  const plan = planned();
  assert.equal(plan.edits.get("components/section-showcase/section-showcase.css"), css.replace("section-work h2,\n.section-work > section-work", "section-showcase h2,\n.section-work > section-showcase"));
});

test("every page's instances: attributes and content kept, two on one page, uppercase too", () => {
  const plan = planned();
  assert.equal(plan.edits.get("index.html"), home.replace(`<section-work id="work" class="wide">`, `<section-showcase id="work" class="wide">`)
    .replace("    </section-work>\n    <p>", "    </section-showcase>\n    <p>"));
  assert.equal(plan.edits.get("about/index.html"), `<main>
  <section-showcase></section-showcase>
  <section-showcase><h2 slot="title">Again</h2></section-showcase>
</main>
`);
  assert.deepEqual(plan.pages, ["index.html", "about/index.html", "contact/index.html"]);
});

test("a page not open is rewritten like any other; a page without it is not", () => {
  const plan = planned();
  assert.equal(plan.edits.get("contact/index.html"), "<main><section-showcase></section-showcase></main>\n");
  assert.equal(plan.edits.has("plain/index.html"), false);
});

test("another template using it as a fallback follows", () => {
  const plan = planned();
  assert.equal(plan.edits.get("components/card-list/card-list.html"), "<div><slot><section-showcase></section-showcase></slot></div>\n");
  assert.deepEqual(plan.templates, ["components/card-list/card-list.html"]);
});

test("text, attributes, comments, scripts and longer tags that merely contain the old name are left alone", () => {
  const out = renameInstances(home, "section-work", "section-showcase");
  for (const kept of ["Our section-work section", "&lt;section-work&gt;", "<!-- <section-work></section-work> -->", "<section-work-2></section-work-2>",
    `querySelector("section-work")`, "<style>section-work { color: red }</style>"]) assert.ok(out.includes(kept), kept);
  assert.equal(renameInstances(plain, "section-work", "section-showcase"), plain);
});

test("site stylesheets: exact tag selectors renamed, the files and rules counted", () => {
  const plan = planned();
  assert.equal(plan.edits.get("styles/site.css"), `/* section-work */
section-showcase, section-showcase:hover, main > section-showcase::before { color: blue }
.section-work, #section-work, [data-x="section-work"], section-work-2, x-section-work { color: red }
@media (width > 40em) {
  section-showcase { padding: 0 }
}
a { content: "section-work"; font-family: section-work; }
`);
  assert.equal(plan.edits.has("styles/layout.css"), false);
  assert.deepEqual(plan.stylesheets, [{ path: "styles/site.css", rules: 2 }]);
});

test("nested rules and selector functions are renamed; declarations are not", () => {
  assert.deepEqual(renameTagSelectors(`main { section-work { gap: 0 } :is(section-work, p) > a { color: section-work } }`, "section-work", "x-y"),
    { css: `main { x-y { gap: 0 } :is(x-y, p) > a { color: section-work } }`, rules: 2 });
  assert.deepEqual(renameTagSelectors(`a{}`, "section-work", "x-y"), { css: `a{}`, rules: 0 });
});

test("a taken or reserved name is refused", () => {
  assert.deepEqual(componentRenamePlan(input({ typed: "card-list" })), { error: "There is a component <card-list> already." });
  assert.deepEqual(componentRenamePlan(input({ typed: "font-face" })), { error: "font-face is reserved by HTML." });
});

test("a folder already at the new path is refused", () => {
  assert.deepEqual(componentRenamePlan(input({ files: [...input().files, "components/section-showcase/old.txt"] })),
    { error: "There is a folder components/section-showcase/ already." });
});

test("the same name, or nothing typed, is no change", () => {
  assert.deepEqual(componentRenamePlan(input({ typed: "section-work" })), { unchanged: true });
  assert.deepEqual(componentRenamePlan(input({ typed: " Section Work " })), { unchanged: true });
  assert.deepEqual(componentRenamePlan(input({ typed: "-" })), { unchanged: true });
});

test("a name typed without a hyphen takes the prefix of what the template's root is", () => {
  assert.equal(planned({ typed: "Show Case" }).tag, "show-case");
  // "work" in a section is section-work: its own name.
  assert.deepEqual(componentRenamePlan(input({ typed: "work" })), { unchanged: true });
  const card = input({ from: "card-list", typed: "tiles" });
  const plan = componentRenamePlan(card);
  assert.ok("tag" in plan);
  assert.equal(plan.tag, "block-tiles");
  const article = componentRenamePlan(input({ sources: { ...input().sources, "components/card-list/card-list.html": `<article class="x"><slot></slot></article>` }, from: "card-list", typed: "tiles" }));
  assert.ok("tag" in article && article.tag === "card-tiles");
  assert.equal(planned({ typed: "gallery" }).tag, "section-gallery");
});

test("a flat component moves to the flat new path", () => {
  const sources = { ...input().sources, "components/x-note.html": "<p><slot></slot></p>", "components/x-note.css": "x-note { color: red }" };
  const plan = componentRenamePlan(input({ from: "x-note", typed: "y-note", sources, files: Object.keys(sources),
    components: { ...input().components, "x-note": "components/x-note.html" } }));
  assert.ok("tag" in plan);
  assert.deepEqual(plan.moves, [{ from: "components/x-note.css", to: "components/y-note.css" }, { from: "components/x-note.html", to: "components/y-note.html" }]);
  assert.equal(plan.edits.get("components/y-note.css"), "y-note { color: red }");
});

test("the messages: who follows, and the stylesheets that changed", () => {
  const plan = planned();
  assert.deepEqual(renameMessages("section-work", plan), {
    done: "Renamed <section-work> to <section-showcase>. 3 pages and 1 component using it follow.",
    undone: "Undid renaming <section-work> to <section-showcase>.",
    notes: ["<section-work> renamed in styles/site.css (2 rules)."],
  });
  assert.equal(renameMessages("a-b", { tag: "a-c", pages: ["index.html"], templates: [], stylesheets: [] }).done, "Renamed <a-b> to <a-c>. 1 page using it follows.");
  assert.deepEqual(renameMessages("a-b", { tag: "a-c", pages: [], templates: [], stylesheets: [] }).notes, []);
});
