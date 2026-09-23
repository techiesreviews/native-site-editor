import assert from "node:assert/strict";
import { test } from "node:test";
import { replaceButtonStyleClass, type ButtonStyleMapping } from "../src/button-style";

const source = '<a class="button  helper" href="/about/">Read</a>';
const mapping: ButtonStyleMapping = {
  value: "primary",
  baseClass: "button",
  variants: { primary: "", secondary: "secondary", outline: "ghost", link: "no-bg" },
  classAttr: { start: source.indexOf("class="), end: source.indexOf(" href=") },
  classValue: { start: source.indexOf('"button') + 1, end: source.indexOf('" href=') },
};

test("adds a variant class without changing unrelated class whitespace", () => {
  assert.deepEqual(replaceButtonStyleClass(source, mapping, "secondary"), {
    start: mapping.classValue.start,
    end: mapping.classValue.end,
    expected: "button  helper",
    text: "button secondary  helper",
  });
});

test("replaces the existing variant token and preserves other classes", () => {
  const current = '<a class="button secondary  helper" href="/about/">Read</a>';
  assert.deepEqual(replaceButtonStyleClass(current, {
    ...mapping,
    value: "secondary",
    classAttr: { start: current.indexOf("class="), end: current.indexOf(" href=") },
    classValue: { start: current.indexOf('"button') + 1, end: current.indexOf('" href=') },
  }, "outline")?.text, "button ghost  helper");
});

test("removes the variant token for Primary", () => {
  const current = '<a class="button no-bg helper" href="/about/">Read</a>';
  assert.equal(replaceButtonStyleClass(current, {
    ...mapping,
    value: "link",
    classAttr: { start: current.indexOf("class="), end: current.indexOf(" href=") },
    classValue: { start: current.indexOf('"button') + 1, end: current.indexOf('" href=') },
  }, "primary")?.text, "button helper");
});

test("rejects stale or malformed class ranges", () => {
  assert.equal(replaceButtonStyleClass(source, {
    ...mapping,
    classValue: { start: mapping.classValue.start, end: mapping.classValue.end + 20 },
  }, "secondary"), undefined);
  assert.equal(replaceButtonStyleClass(source, {
    ...mapping,
    classValue: { start: Number.MAX_SAFE_INTEGER + 1, end: Number.MAX_SAFE_INTEGER + 2 },
  }, "secondary"), undefined);
});

test("rejects malformed mapping tokens", () => {
  assert.equal(replaceButtonStyleClass(source, {
    ...mapping,
    baseClass: "button\"",
  }, "secondary"), undefined);
  assert.equal(replaceButtonStyleClass(source, {
    ...mapping,
    variants: { primary: "", secondary: "helper", outline: "helper", link: "no-bg" },
  }, "secondary"), undefined);
});

test("rejects ambiguous variant tokens", () => {
  const current = '<a class="button secondary no-bg" href="/about/">Read</a>';
  assert.equal(replaceButtonStyleClass(current, {
    ...mapping,
    classAttr: { start: current.indexOf("class="), end: current.indexOf(" href=") },
    classValue: { start: current.indexOf('"button') + 1, end: current.indexOf('" href=') },
  }, "outline"), undefined);
});
