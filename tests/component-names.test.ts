import assert from "node:assert/strict";
import test from "node:test";
import {
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
