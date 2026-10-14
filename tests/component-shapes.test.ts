import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { componentPicture, readComponentShape } from "../src/page-builder/component-shapes";

const template = '<section><figure class="media"><slot name="image"><img src="fallback.svg"></slot></figure></section>';
const image = '<img slot="image" class="picture" src="desk.svg">';
const read = (css: string, host = '<photo-card>') => readComponentShape(css, template, "image", image, host);
for (const selector of [".media img", ".media > img", "section img", ":host img", "::slotted(img)", ".media ::slotted(img)"]) {
  test(`fixed shape through ${selector}`, () => {
    assert.deepEqual(read(`${selector} { aspect-ratio: 4 / 3; object-fit: cover }`), { value: "4 / 3", ratio: 4 / 3, label: "4:3" });
  });
}
test("host compounds test the instance attributes and nested rules flatten", () => {
  const css = ':host([data-layout="centered"]) { .media { & img { aspect-ratio: 1; object-fit: cover } } }';
  assert.equal(read(css), undefined);
  assert.equal(read(css, '<photo-card data-layout="other">'), undefined);
  assert.equal(read(css, '<photo-card data-layout="centered">')?.label, "Square");
});
test("labels use popup names and other ratios use a:b", () => {
  for (const [ratio, label] of [["1", "Square"], ["4/3", "4:3"], ["16/9", "16:9"], ["4/5", "Tall 4:5"], ["3/2", "3:2"]]) {
    assert.equal(read(`img { aspect-ratio: ${ratio}; object-fit: cover }`)?.label, label);
  }
});
test("only a plain ratio with winning cover is a fixed shape", () => {
  for (const css of ["", "img { aspect-ratio: 4/3 }", "img { object-fit: cover }", "img { aspect-ratio: auto 4/3; object-fit: cover }", "img { aspect-ratio: 4/3; object-fit: contain }"]) assert.equal(read(css), undefined);
  const base = "img { aspect-ratio: 4/3; object-fit: cover }";
  assert.equal(read(base + "img { aspect-ratio: auto }"), undefined);
  assert.equal(read(base + ".media img { aspect-ratio: auto }"), undefined);
  assert.equal(read(".media img { aspect-ratio: auto }" + base), undefined);
  assert.equal(read(base + "img { object-fit: contain }"), undefined);
});
test("conditional rules are ignored; layer rules count; important beats specificity and order", () => {
  const base = "img { aspect-ratio: 4/3; object-fit: cover }";
  for (const wrapper of ["media (min-width: 1px)", "supports (display: grid)", "container (width > 1px)"]) {
    assert.equal(read(`@${wrapper} { ${base} }`), undefined);
    assert.equal(read(base + `@${wrapper} { img { aspect-ratio: auto } }`)?.label, "4:3");
  }
  assert.equal(read(`@layer media { ${base} }`)?.label, "4:3");
  assert.equal(read("img { aspect-ratio: 1 !important; object-fit: cover } .media img { aspect-ratio: auto }")?.label, "Square");
  assert.equal(read(base + "img { aspect-ratio: auto !important }"), undefined);
  assert.equal(read("img { aspect-ratio: 1; aspect-ratio: 3/2; object-fit: cover }")?.label, "3:2");
});
test("default slot and missing slots", () => {
  const css = ".media img { aspect-ratio: 4/3; object-fit: cover }";
  assert.equal(readComponentShape(css, template.replace('name="image"', ""), "", "<img>", "<photo-card>")?.label, "4:3");
  assert.equal(readComponentShape(css, template, "missing", image, "<photo-card>"), undefined);
});
test("page helper requires an image directly in a custom element and both component files", () => {
  const page = '<html><body><photo-card data-layout="centered"><img slot="image" src="desk.svg"></photo-card><div><img></div></body></html>';
  const files = new Map([["components/photo-card/photo-card.html", template], ["components/photo-card/photo-card.css", ".media img { aspect-ratio: 4/3; object-fit: cover }"]]);
  const source = (path: string) => files.get(path);
  assert.deepEqual(componentPicture(page, [0, 0], source), { label: "Photo card", shape: { value: "4 / 3", ratio: 4 / 3, label: "4:3" } });
  assert.equal(componentPicture(page, [1, 0], source), undefined);
  assert.equal(componentPicture(page, [0], source), undefined);
  files.delete("components/photo-card/photo-card.css");
  assert.equal(componentPicture(page, [0, 0], source), undefined);
  files.set("components/photo-card/photo-card.css", "img { aspect-ratio: 1; object-fit: cover }");
  assert.equal(componentPicture(page, [0, 0], source)?.shape.label, "Square");
  files.delete("components/photo-card/photo-card.html");
  assert.equal(componentPicture(page, [0, 0], source), undefined);
});

test("slot-qualified ::slotted() matches the slot itself and the assigned image", () => {
  for (const selector of ['slot[name="image"]::slotted(img)', '.media slot::slotted(.picture)', 'figure > slot::slotted(img[slot])']) {
    assert.equal(read(`${selector} { aspect-ratio: 4 / 3; object-fit: cover }`)?.label, "4:3", selector);
  }
  for (const selector of ['slot[name="other"]::slotted(img)', '.media ::slotted(.missing)', 'section > slot::slotted(img)']) {
    assert.equal(read(`${selector} { aspect-ratio: 4 / 3; object-fit: cover }`), undefined, selector);
  }
});

test("state rules (:hover, :focus …) do not change the resting shape", () => {
  const base = "img { aspect-ratio: 4/3; object-fit: cover }";
  assert.equal(read(base + "img:hover { aspect-ratio: 1 }")?.label, "4:3");
  assert.equal(read(base + ".media:focus-within img { aspect-ratio: auto }")?.label, "4:3");
  assert.equal(read(base + "img:not(:hover) { aspect-ratio: 1 }")?.label, "4:3");
  assert.equal(read("img:hover { aspect-ratio: 4/3; object-fit: cover }"), undefined);
  assert.equal(read(base + "img:first-child { aspect-ratio: 1 }")?.label, "Square");
});

test("cascade layers: unlayered rules beat layered ones, later layers beat earlier, !important reverses", () => {
  const base = "img { aspect-ratio: 4/3; object-fit: cover }";
  assert.equal(read(base + "@layer decorative { img { aspect-ratio: 1 } }")?.label, "4:3");
  assert.equal(read("@layer decorative { .media img { aspect-ratio: 1 } }" + base)?.label, "4:3");
  assert.equal(read("@layer a, b; @layer b { img { aspect-ratio: 4/3; object-fit: cover } } @layer a { .media img { aspect-ratio: 1 } }")?.label, "4:3");
  assert.equal(read("@layer b, a; @layer b { img { aspect-ratio: 4/3; object-fit: cover } } @layer a { img { aspect-ratio: 1 } }")?.label, "Square");
  assert.equal(read("@layer a { img { aspect-ratio: 1 !important } } img { aspect-ratio: 4/3 !important; object-fit: cover }")?.label, "Square");
  assert.equal(read("@layer { img { aspect-ratio: 1 } } @layer { img { aspect-ratio: 3/2; object-fit: cover } }")?.label, "3:2");
  assert.equal(read("@layer outer { @layer inner { img { aspect-ratio: 1; object-fit: cover } } img { aspect-ratio: 3/2 } }")?.label, "3:2");
});

test("the starter's section split image has its 4:3 shape", () => {
  const dir = "fixtures/actual-starter/components/section-split/section-split";
  const files = new Map([`${dir}.css`, `${dir}.html`].map(path => [path.replace("fixtures/actual-starter/", ""), readFileSync(path, "utf8")]));
  const page = '<main><section-split data-layout="centered"><img slot="image" src="/media/images/desk.webp" alt="A desk"></section-split></main>';
  assert.deepEqual(componentPicture(page, [0, 0, 0], path => files.get(path)), { label: "Section split", shape: { value: "4 / 3", ratio: 4 / 3, label: "4:3" } });
});
