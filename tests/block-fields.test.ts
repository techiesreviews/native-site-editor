import { test } from "node:test";
import assert from "node:assert/strict";
import { startTags } from "../shared/html-source.ts";
import { blockLayout, blockLayoutEdit, isButtonBlock } from "../src/page-builder/block-fields.ts";
import { buttonVariantFields } from "../src/page-builder/variant-fields.ts";
import { memorySiteVariants } from "./variant-files-fake.ts";

const swap = (source: string, next: string) => {
  const edit = blockLayoutEdit(source, startTags(source)[0], next)!;
  return source.slice(0, edit.start) + edit.text + source.slice(edit.end);
};

test("Layout swaps tokens in place, keeps other classes in order and collapses both tokens", () => {
  assert.equal(swap('<div class="flow">', "cards"), '<div class="cards">');
  assert.equal(swap('<div class="cards">', "flow"), '<div class="flow">');
  assert.equal(swap('<div class="before flow after">', "cards"), '<div class="before cards after">');
  assert.equal(swap('<div class="before cards middle flow after cards">', "flow"), '<div class="before flow middle after">');
  assert.equal(swap('<div class="before flow middle cards after flow">', "cards"), '<div class="before cards middle after">');
});

test("Layout preserves quoting, attributes and unrelated class entities", () => {
  assert.equal(swap("<div id='x' class='before flow a&amp;b' title='Grid'>", "cards"), "<div id='x' class='before cards a&amp;b' title='Grid'>");
  assert.equal(swap('<div class=flow>', "cards"), '<div class=cards>');
  assert.equal(swap('<div class="say&quot;hi cards">', "flow"), '<div class="say&quot;hi flow">');
  assert.equal(swap('<div class="before\tflow\nafter">', "cards"), '<div class="before cards after">');
});

test("only Div with a complete flow or cards class token offers Layout", () => {
  for (const source of ['<div class="flow">', '<div class="other cards">', "<DIV CLASS='flow cards'>"]) {
    assert.ok(blockLayout(source, startTags(source)[0]));
  }
  for (const source of ['<section class="flow">', '<a class="cards">', '<div>', '<div class="workflow postcards">', '<div class="Flow">']) {
    assert.equal(blockLayout(source, startTags(source)[0]), undefined);
    assert.equal(blockLayoutEdit(source, startTags(source)[0], "flow"), undefined);
  }
  assert.equal(blockLayoutEdit('<div class="flow">', startTags('<div class="flow">')[0], "columns"), undefined);
  // A no-break space joins tokens rather than separating them.
  for (const source of ['<div class="before\u00a0flow">', '<div class="flow\u00a0after">']) assert.equal(blockLayout(source, startTags(source)[0]), undefined);
  assert.equal(swap('<div class="a\u00a0b flow">', "cards"), '<div class="a\u00a0b cards">');
});

test("only an anchor with the complete btn class token is a Button block", () => {
  assert.equal(isButtonBlock("a", [{ name: "class", value: "other\tbtn last" }]), true);
  for (const tag of ["button", "div", "img", "h2", "p", "section"]) {
    assert.equal(isButtonBlock(tag, [{ name: "class", value: "btn" }]), false);
  }
  assert.equal(isButtonBlock("a", []), false);
  assert.equal(isButtonBlock("a", [{ name: "class", value: "btn-other" }]), false);
  assert.equal(isButtonBlock("a", [{ name: "class", value: "other\u00a0btn" }]), false);
});

test("Button fields use .btn axes, preserve Custom, notes and presence, and ignore global rules", () => {
  const lookup = memorySiteVariants({ sheets: { "site.css": '[data-tone=dark] {} .btn[data-variant=secondary] {} .btn[data-size=small] {} @media (width > 720px) { .btn[data-featured] {} }' } });
  const fields = buttonVariantFields(lookup.forClass("btn"), [{ name: "data-size", value: "huge" }]);
  assert.deepEqual(fields.map(field => field.label), ["Variant", "Size", "Featured"]);
  assert.equal(fields[1].value, "=huge");
  assert.deepEqual(fields[1].options.at(-1), { label: "Custom", value: "=huge" });
  assert.equal(fields[2].kind, "yes-no");
  assert.equal(fields[2].note, "wide screens only");
  assert.deepEqual(buttonVariantFields(memorySiteVariants({ sheets: { "site.css": '[data-tone=dark] {}' } }).forClass("btn"), []), []);
});
