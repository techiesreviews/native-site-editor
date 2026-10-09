import assert from "node:assert/strict";
import { test } from "node:test";
import { slotChange, slotChangePages, slotChipState } from "../src/page-builder/component-model";

// Slice 45: a slot change rewrites every page that uses the component.
const template = `<section class="flow">
  <slot name="title"><h2>Section title</h2></slot>
  <p class="lede">A few of the sites we made.</p>
  <div class="cards">
    <slot></slot>
  </div>
</section>
`;
const home = `<main>
  <section-work id="work">
    <h2 slot="title">Recent work</h2>
    <card-project></card-project>
  </section-work>
</main>
`;
const about = `<main>
  <section-work>
    <h2 slot="title">Our work</h2>
    <p>Hand-made.</p>
  </section-work>
  <p>About us.</p>
</main>
`;
// A page that fills no slot: it shows the template's fallbacks.
const bare = `<main>
  <section-work></section-work>
</main>
`;

function plan(node: number[], action: "toggle" | "rename" = "toggle", name = "") {
  const chip = slotChipState(template, node)!;
  const result = slotChange(template, { node, chip, action, name });
  if ("error" in result) throw new Error(result.error);
  return result;
}
const pages = (files: Record<string, string>, node: number[], action: "toggle" | "rename" = "toggle", name = "") => {
  const { source, change } = plan(node, action, name);
  return slotChangePages(files, "section-work", source, change);
};

test("made a slot: each page that fills anything gets its own copy of the part, in slot order", () => {
  assert.deepEqual(pages({ "index.html": home, "about.html": about, "bare.html": bare }, [0, 1]), new Map([
    ["index.html", home.replace(`    <card-project>`, `    <p slot="text" class="lede">A few of the sites we made.</p>\n    <card-project>`)],
    ["about.html", about.replace(`    <p>Hand-made.</p>`, `    <p slot="text" class="lede">A few of the sites we made.</p>\n    <p>Hand-made.</p>`)],
  ]));
});

test("made a slot: a page already filling that name keeps its own", () => {
  const filled = home.replace(`<card-project>`, `<p slot="text">Ours.</p>\n    <card-project>`);
  assert.deepEqual(pages({ "index.html": filled }, [0, 1]), new Map());
});

test("made a slot over several lines: the copy's lines take the page's indentation", () => {
  const wide = template.replace(`<p class="lede">A few of the sites we made.</p>`, `<p class="lede">\n    A few of the sites.\n  </p>`);
  const chip = slotChipState(wide, [0, 1])!;
  const result = slotChange(wide, { node: [0, 1], chip, action: "toggle" });
  if ("error" in result) throw new Error(result.error);
  assert.deepEqual(slotChangePages({ "index.html": home }, "section-work", result.source, result.change), new Map([
    ["index.html", home.replace(`    <card-project>`, `    <p slot="text" class="lede">\n      A few of the sites.\n    </p>\n    <card-project>`)],
  ]));
});

test("renamed: every page's slot attribute follows", () => {
  assert.deepEqual(pages({ "index.html": home, "about.html": about, "bare.html": bare }, [0, 0, 0], "rename", "heading"), new Map([
    ["index.html", home.replace(`slot="title"`, `slot="heading"`)],
    ["about.html", about.replace(`slot="title"`, `slot="heading"`)],
  ]));
});

test("renamed unnamed slot: its elements take the name, its text a span", () => {
  const texty = `<section-work><h2 slot="title">T</h2> Loose text <card-project></card-project></section-work>`;
  assert.deepEqual(pages({ "a.html": texty }, [0, 2, 0], "rename", "projects"), new Map([
    ["a.html", `<section-work><h2 slot="title">T</h2> <span slot="projects">Loose text</span> <card-project slot="projects"></card-project></section-work>`],
  ]));
});

test("made fixed: each page's element for the slot is removed, with its line", () => {
  assert.deepEqual(pages({ "index.html": home, "about.html": about, "bare.html": bare }, [0, 0, 0]), new Map([
    ["index.html", home.replace(`    <h2 slot="title">Recent work</h2>\n`, "")],
    ["about.html", about.replace(`    <h2 slot="title">Our work</h2>\n`, "")],
  ]));
});

test("made fixed items slot: the page's items go, its named fills stay", () => {
  assert.deepEqual(pages({ "about.html": about }, [0, 2, 0]), new Map([
    ["about.html", about.replace(`    <p>Hand-made.</p>\n`, "")],
  ]));
});

test("a page that doesn't fill the slot is left as it is", () => {
  const untitled = home.replace(`    <h2 slot="title">Recent work</h2>\n`, "");
  assert.deepEqual(pages({ "index.html": untitled, "bare.html": bare }, [0, 0, 0]), new Map());
  assert.deepEqual(pages({ "index.html": untitled }, [0, 0, 0], "rename", "heading"), new Map());
});

test("a page with several instances, and other components, rewrites each instance of this one", () => {
  const two = `<main>
  <section-work>
    <h2 slot="title">First</h2>
    <card-project><h3 slot="title">Card</h3></card-project>
  </section-work>
  <section-other><h2 slot="title">Other</h2></section-other>
  <section-work>
    <h2 slot="title">Second</h2>
  </section-work>
</main>
`;
  assert.deepEqual(pages({ "index.html": two }, [0, 0, 0], "rename", "heading"), new Map([
    ["index.html", two.replace(`<h2 slot="title">First`, `<h2 slot="heading">First`).replace(`<h2 slot="title">Second`, `<h2 slot="heading">Second`)],
  ]));
  assert.deepEqual(pages({ "index.html": two }, [0, 0, 0]), new Map([
    ["index.html", two.replace(`    <h2 slot="title">First</h2>\n`, "").replace(`    <h2 slot="title">Second</h2>\n`, "")],
  ]));
});

test("an instance inside another's removed fill is removed with it, not edited twice", () => {
  const nested = `<section-work><div><section-work><h2 slot="title">Inner</h2><p>x</p></section-work></div></section-work>`;
  assert.deepEqual(pages({ "a.html": nested }, [0, 2, 0]), new Map([["a.html", `<section-work></section-work>`]]));
});

test("renamed to the unnamed slot: the page's elements lose their slot attribute", () => {
  const named = `<section><slot name="title"><h2>T</h2></slot></section>`;
  const page = `<section-work><h2 slot="title">Ours</h2></section-work>`;
  assert.deepEqual(slotChangePages({ "a.html": page }, "section-work", named.replace(` name="title"`, ""), { kind: "renamed", from: "title", to: "" }),
    new Map([["a.html", `<section-work><h2>Ours</h2></section-work>`]]));
});

test("made fixed unnamed slot: the page's bare text goes too", () => {
  const texty = `<section-work><h2 slot="title">T</h2> Loose text </section-work>`;
  assert.deepEqual(pages({ "a.html": texty }, [0, 2, 0]), new Map([["a.html", `<section-work><h2 slot="title">T</h2>  </section-work>`]]));
});

test("instances in another component's template follow", () => {
  const host = `<section>
  <slot name="work">
    <section-work>
      <h2 slot="title">Inside</h2>
    </section-work>
  </slot>
</section>
`;
  assert.deepEqual(pages({ "components/section-host/section-host.html": host }, [0, 0, 0], "rename", "heading"), new Map([
    ["components/section-host/section-host.html", host.replace(`slot="title"`, `slot="heading"`)],
  ]));
});
