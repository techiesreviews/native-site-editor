import { strict as assert } from "node:assert";
import { test } from "node:test";
import { blockIconKind } from "../src/components/block-icon-kind";

test("Structure and drag labels choose native, Button and component icons", () => {
  for (const [tag, name, expected] of [
    ["p", "Paragraph", "p"], ["h3", "Heading", "h3"], ["img", "Image", "img"],
    ["a", "Button", "button"], ["a", "Link", "a"], ["button", "Button", "button"],
    ["card-project", "Card project", "component"], ["section-hero", "Hero", "component"],
    ["native:section", "Section", "section"], ["native:paragraph", "Paragraph", "p"],
    ["native:heading", "Heading", "h2"], ["native:image", "Image", "img"],
    ["native:button", "Button", "button"], ["unknown", "Unknown", "unknown"],
  ]) assert.equal(blockIconKind(tag, name), expected);
});

test("a custom element that is not a component keeps its own icon in Structure", () => {
  assert.equal(blockIconKind("lite-youtube", "Lite youtube", false), "lite-youtube");
  assert.equal(blockIconKind("p", "Paragraph", true), "component");
});
