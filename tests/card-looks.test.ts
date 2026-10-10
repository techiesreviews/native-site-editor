import test from "node:test";
import assert from "node:assert/strict";
import { cardLooks } from "../src/page-builder/card-looks.ts";

const templates: Record<string, string> = {
  "card-project": '<article>\n  <card-note><slot name="note" slot="text"><p>Project</p></slot></card-note>\n  <slot name="title"><h3>Untitled project</h3></slot>\n  <slot name="body"><p class="body">No description yet.</p></slot>\n  <p class="actions"><slot name="link"></slot></p>\n</article>\n',
  "card-quote": '<article>\n  <slot name="title"><h3>Untitled quote</h3></slot>\n  <slot name="body"><p class="body">No quote yet.</p></slot>\n</article>\n',
  // A label: no heading slot, so no card.
  "card-note": '<slot name="text"><p>Project</p></slot>',
  // A heading, but fixed: no heading slot.
  "card-fixed": "<article><h3>Always this</h3><slot></slot></article>",
  // A heading slot, but not named card-….
  "section-work": '<section><slot name="title"><h2>Recent work</h2></slot><div class="cards"><slot><card-project></card-project></slot></div></section>',
  "site-header": "<header><slot></slot></header>",
};
const templateOf = (tag: string) => templates[tag];
const tags = Object.keys(templates);
const css = ":host { display: block; }\n:host([data-featured]) article { border-color: red; }\n:host([data-layout=\"centered\"]) article { text-align: center; }\n:host([data-layout=\"wide\"]) article { padding: 2rem; }\n:host([data-tone=\"dark\"]) article { background: black; }\n";

test("the looks are card components only: a card-… tag whose template has a heading slot, by name", () => {
  assert.deepEqual(cardLooks({ tags, templateOf }), [
    { tag: "card-project", label: "card-project" },
    { tag: "card-quote", label: "card-quote" },
  ]);
  // A tag the site lists twice, or whose template is not read, is offered once or not at all.
  assert.deepEqual(cardLooks({ tags: ["card-quote", "card-quote", "card-gone"], templateOf }).map((look) => look.tag), ["card-quote"]);
  assert.deepEqual(cardLooks({ tags: [], templateOf }), []);
});

test("the current component's variants follow the components: yes/no bare, each choice value, no tone", () => {
  const looks = cardLooks({ tags, templateOf, current: "card-project", css });
  assert.deepEqual(looks, [
    { tag: "card-project", label: "card-project" },
    { tag: "card-quote", label: "card-quote" },
    { tag: "card-project", attribute: { name: "data-featured", value: true }, label: "card-project · featured" },
    { tag: "card-project", attribute: { name: "data-layout", value: "centered" }, label: "card-project · centered" },
    { tag: "card-project", attribute: { name: "data-layout", value: "wide" }, label: "card-project · wide" },
  ]);
});

test("variants come from the site's stylesheets too; a yes/no styled by =\"true\" writes that; a default value is the plain look", () => {
  const sheets = [{ path: "styles/site.css", source: 'card-quote[data-accent="true"] { color: red; }\n' }];
  const quoteCss = ':host, :host([data-size="small"]) { font-size: 1rem; }\n:host([data-size="large"]) { font-size: 2rem; }\n';
  assert.deepEqual(cardLooks({ tags, templateOf, current: "card-quote", css: quoteCss, sheets }).slice(2), [
    { tag: "card-quote", attribute: { name: "data-size", value: "large" }, label: "card-quote · large" },
    { tag: "card-quote", attribute: { name: "data-accent", value: "true" }, label: "card-quote · accent" },
  ]);
});

test("no variants for a current tag that is not a card component, or with no CSS", () => {
  assert.equal(cardLooks({ tags, templateOf, current: "card-note", css }).length, 2);
  assert.equal(cardLooks({ tags, templateOf, current: "card-project" }).length, 2);
});

test("attributes the site's scripts set are left out, as the edit bar leaves them out", () => {
  const scripted = `${css}:host([data-open]) article { outline: 1px solid; }\n`;
  const looks = cardLooks({ tags, templateOf, current: "card-project", css: scripted, scriptAttributes: ["data-open", "data-featured"] });
  assert.deepEqual(looks.slice(2).map((look) => look.label), ["card-project · centered", "card-project · wide"]);
  // Without the scripts, they are looks like any other.
  assert.deepEqual(cardLooks({ tags, templateOf, current: "card-project", css: scripted }).slice(2).map((look) => look.label),
    ["card-project · featured", "card-project · centered", "card-project · wide", "card-project · open"]);
});
