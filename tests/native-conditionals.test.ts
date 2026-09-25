import assert from "node:assert/strict";
import test from "node:test";
import { assignedSlotNames, pruneEmptyTemplate } from "../shared/native-conditionals.ts";

const template = `<section class="cta" data-key="cta">
  <h2><slot name="title">Ready?</slot></h2>
  <div class="actions" data-key="actions">
    <a class="button" href="#/about/"><slot name="primary">Get started</slot></a>
    <a class="button button--ghost" href="#/about/"><slot name="secondary"></slot></a>
  </div>
  <figure data-if="image"><slot name="image"></slot><figcaption><slot name="caption"></slot></figcaption></figure>
  <p class="note"><slot name="note"></slot></p>
  <p class="fixed">Always here <slot name="extra"></slot></p>
</section>`;

test("top-level slot attributes and default-slot text count as assigned", () => {
  assert.deepEqual([...assignedSlotNames(`<span slot="title">Hi</span>\n  <a slot="secondary" href="#/x/"><span slot="nested">no</span></a>`)], ["title", "secondary"]);
  assert.deepEqual([...assignedSlotNames(`Plain text <b>bold</b>`)], [""]);
  assert.deepEqual([...assignedSlotNames(`  <!-- nothing -->  `)], []);
  assert.deepEqual([...assignedSlotNames(`<img slot="image" src="x.png" alt="">`)], ["image"]);
});

test("empty slot wrappers and unmet data-if elements are left out of the template", () => {
  const bare = pruneEmptyTemplate(template, new Set());
  assert.equal(bare, `<section class="cta" data-key="cta">
  <h2><slot name="title">Ready?</slot></h2>
  <div class="actions" data-key="actions">
    <a class="button" href="#/about/"><slot name="primary">Get started</slot></a>
  </div>
  <p class="fixed">Always here <slot name="extra"></slot></p>
</section>`);
  const filled = pruneEmptyTemplate(template, new Set(["secondary", "image", "note"]));
  assert.ok(filled.includes(`<slot name="secondary"></slot>`));
  assert.ok(filled.includes(`<figure data-if="image">`));
  assert.ok(filled.includes(`<p class="note">`));
  // The wrapper goes when every button in it is empty; a fallback keeps its element.
  const both = `<div class="actions"><a><slot name="a"></slot></a><a><slot name="b"></slot></a></div><p><slot>Fallback</slot></p>`;
  assert.equal(pruneEmptyTemplate(both, new Set()), `<p><slot>Fallback</slot></p>`);
  assert.equal(pruneEmptyTemplate(both, new Set(["b"])), `<div class="actions"><a><slot name="b"></slot></a></div><p><slot>Fallback</slot></p>`);
});

test("an optional slot (data-if on the slot) goes with its fallback unless the page fills it", () => {
  const hero = `<section>
  <slot name="title"><h1>Headline</h1></slot>
  <div class="actions">
    <slot name="primary" data-if><a href="#/a/">Get in touch</a></slot>
    <slot name="secondary" data-if><a href="#/b/">See our work</a></slot>
  </div>
</section>`;
  assert.equal(pruneEmptyTemplate(hero, new Set(["title", "primary"])), `<section>
  <slot name="title"><h1>Headline</h1></slot>
  <div class="actions">
    <slot name="primary" data-if><a href="#/a/">Get in touch</a></slot>
  </div>
</section>`);
  // With both buttons left out, the row goes too; a plain fallback still shows.
  assert.equal(pruneEmptyTemplate(hero, new Set()), `<section>
  <slot name="title"><h1>Headline</h1></slot>
</section>`);
  // data-if on a slot can name other slots.
  assert.equal(pruneEmptyTemplate(`<p><slot name="note" data-if="title">Note</slot></p>`, new Set(["title"])), `<p><slot name="note" data-if="title">Note</slot></p>`);
});
