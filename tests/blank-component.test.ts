import assert from "node:assert/strict";
import test from "node:test";
import { blankComponentFiles } from "../src/page-builder/blank-component.ts";
import { isSectionTemplate, instanceMarkup } from "../src/native-insert.ts";

test("blank component files provide a section with a title and empty items slot", () => {
  const files = blankComponentFiles("section-services");
  assert.deepEqual(files.map(file => file.path), [
    "components/section-services/section-services.html",
    "components/section-services/section-services.css",
  ]);
  assert.equal(files[0].content, `<section>
  <slot name="title"><h2>New section</h2></slot>
  <slot></slot>
</section>
`);
  assert.ok(isSectionTemplate(files[0].content));
  assert.match(files[1].content, /:host\s*\{\s*display: block;/);
  assert.match(files[1].content, /Slots are display: contents/);
  assert.match(files[1].content, /section\s*\{\s*display: flex;\s*flex-direction: column;\s*gap: var\(--space-m\);/);
});

test("blank section insertion gives the page its own title and no items", () => {
  const [template] = blankComponentFiles("my-thing");
  assert.equal(template.path, "components/my-thing/my-thing.html");
  assert.equal(instanceMarkup("", "my-thing", template.content), '<my-thing>\n  <h2 slot="title">New section</h2>\n</my-thing>');
});
