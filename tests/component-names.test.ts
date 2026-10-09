import assert from "node:assert/strict";
import test from "node:test";
import {
  automaticComponentName,
  madeFrom,
  normaliseAtCaret,
  normaliseComponentName,
  normaliseName,
  previewComponentTag,
  type NameSource,
} from "../src/page-builder/component-names.ts";
import { tagNameProblem } from "../src/page-builder/component-model.ts";

test("component and slot spelling removes invalid characters and leading digits", () => {
  const cases = [
    ["Title", "title"],
    ["Hero Title", "hero-title"],
    ["hero\t\n_title", "hero-title"],
    ["He!ro.@/é😀Title", "herotitle"],
    ["hero--- _ title", "hero-title"],
    ["--123hero-2", "hero-2"],
    ["123-", ""],
    ["", ""],
  ];
  for (const [value, expected] of cases) assert.equal(normaliseName(value), expected, value);
});

test("trailing hyphens stay while typing and are trimmed on commit", () => {
  for (const value of ["Title-", "Title  ", "Title__---"]) {
    assert.equal(normaliseName(value), "title-");
    assert.equal(normaliseName(value, true), "title");
  }
});

test("component tags prefix single words by their source", () => {
  for (const source of ["section", "card", "block"] satisfies NameSource[]) {
    assert.deepEqual(normaliseComponentName("Services ", source, []), {
      tag: `${source}-services`, problem: undefined,
    });
    assert.deepEqual(normaliseComponentName("My Services-", source, []), {
      tag: "my-services", problem: undefined,
    });
    assert.equal(normaliseComponentName("my-services", source, []).tag, "my-services");
  }
});

test("empty, taken and reserved component tags use tagNameProblem unchanged", () => {
  for (const [value, tag] of [["", ""], ["123!", ""], ["Services", "section-services"], ["FONT FACE", "font-face"]]) {
    const taken = new Set(["section-services"]);
    const result = normaliseComponentName(value, "section", taken);
    assert.deepEqual(result, { tag, problem: tagNameProblem(tag, taken) });
    assert.ok(result.problem);
  }
});

test("live tag previews choose the prefix before considering a trailing hyphen", () => {
  for (const source of ["section", "card", "block"] satisfies NameSource[]) {
    assert.equal(previewComponentTag("services", source), `${source}-services`);
    assert.equal(previewComponentTag("services ", source), `${source}-services-`);
    assert.equal(previewComponentTag("services-", source), `${source}-services-`);
    assert.equal(previewComponentTag("services g", source), "services-g");
    assert.equal(previewComponentTag("My Services ", source), "my-services-");
    assert.equal(previewComponentTag("123!", source), "");
    assert.equal(previewComponentTag("", source), "");
  }
});

test("caret offsets follow the text before the caret", () => {
  assert.deepEqual(normaliseAtCaret("Ti!tle", 2), { value: "title", caret: 2 });
  assert.deepEqual(normaliseAtCaret("Ti!tle", 3), { value: "title", caret: 2 });
  assert.deepEqual(normaliseAtCaret("hero---title", 7), { value: "hero-title", caret: 5 });
  assert.deepEqual(normaliseAtCaret("Hero Title! ", 12), { value: "hero-title-", caret: 11 });
  assert.deepEqual(normaliseAtCaret("1Title", 1), { value: "title", caret: 0 });
  assert.deepEqual(normaliseAtCaret("12--Title", 5), { value: "title", caret: 1 });
  assert.deepEqual(normaliseAtCaret("Title ", 6, true), { value: "title", caret: 5 });
  assert.deepEqual(normaliseAtCaret("hero title", 5, true), { value: "hero-title", caret: 5 });
  assert.deepEqual(normaliseAtCaret("Title!", 100), { value: "title", caret: 5 });
  assert.deepEqual(normaliseAtCaret("Title!", -1), { value: "title", caret: 0 });
  assert.deepEqual(normaliseAtCaret("123!", 4), { value: "", caret: 0 });
});

test("what an element was made from picks the prefix: section, card, else block", () => {
  assert.equal(madeFrom("section"), "section");
  assert.equal(madeFrom("section", "card"), "section");
  assert.equal(madeFrom("article"), "card");
  assert.equal(madeFrom("div", "project-card"), "card");
  assert.equal(madeFrom("li", "card__item wide"), "card");
  assert.equal(madeFrom("div", "cardigan"), "block");
  assert.equal(madeFrom("div", "intro"), "block");
  assert.equal(madeFrom("aside"), "block");
});

test("Make component names the component from the element's first heading", () => {
  assert.equal(automaticComponentName(`<section class="work"><h2>Recent work</h2><p>Text</p></section>`, []), "section-recent-work");
  // Inline markup and entities are read as the heading shows them.
  assert.equal(automaticComponentName(`<section><h2>Tea <em>&amp;</em> <a href="/">Cak&#233;s</a></h2></section>`, []), "section-tea-cakes");
  // The first heading, however deep; the element itself when it is one.
  assert.equal(automaticComponentName(`<div><div><h3>Opening hours</h3></div><h2>Later</h2></div>`, []), "block-opening-hours");
  assert.equal(automaticComponentName(`<h2 class="lede">Big news</h2>`, []), "block-big-news");
  assert.equal(automaticComponentName(`<article class="card"><h3>Fern &amp; Kettle</h3></article>`, []), "card-fern-kettle");
  // Digits after the prefix stay; a heading that starts with the prefix doesn't repeat it.
  assert.equal(automaticComponentName(`<section><h2>2026 in review</h2></section>`, []), "section-2026-in-review");
  assert.equal(automaticComponentName(`<section><h2>Section one</h2></section>`, []), "section-one");
});

test("a long heading is cut to its first three words", () => {
  assert.equal(automaticComponentName(`<section><h2>A native browser preview for plain sites</h2></section>`, []), "section-a-native-browser");
});

test("with no heading, or one that leaves nothing, the component is numbered", () => {
  assert.equal(automaticComponentName(`<section><p>Only text</p></section>`, []), "section-1");
  assert.equal(automaticComponentName(`<section><h2>!!! — ???</h2></section>`, []), "section-1");
  assert.equal(automaticComponentName(`<section><h2>Section</h2></section>`, []), "section-1");
  assert.equal(automaticComponentName(`<div class="note"><p>A note</p></div>`, []), "block-1");
  assert.equal(automaticComponentName(`<article><img src="a.jpg" alt=""></article>`, []), "card-1");
  // The next free number.
  assert.equal(automaticComponentName(`<section><p>Only text</p></section>`, ["section-1"]), "section-2");
  assert.equal(automaticComponentName(`<section></section>`, ["section-1", "section-2", "section-4"]), "section-3");
});

test("a taken name takes the next free number", () => {
  assert.equal(automaticComponentName(`<section><h2>Recent work</h2></section>`, ["section-recent-work"]), "section-recent-work-2");
  assert.equal(automaticComponentName(`<section><h2>Recent work</h2></section>`, ["section-recent-work", "section-recent-work-2"]), "section-recent-work-3");
});

test("the prefix keeps an automatic name clear of names reserved by HTML", () => {
  assert.equal(tagNameProblem("font-face", []), "font-face is reserved by HTML.");
  assert.equal(automaticComponentName(`<div><h2>Font face</h2></div>`, []), "block-font-face");
  for (const html of [`<div><h2>Font face</h2></div>`, `<section><h2>Missing glyph</h2></section>`, `<article><h3>Color profile</h3></article>`]) {
    assert.equal(tagNameProblem(automaticComponentName(html, []), []), undefined);
  }
});
