import assert from "node:assert/strict";
import test from "node:test";
import { startTags, type ElementRange } from "../src/native-source-location.ts";
import { altFromPath, duplicateEdit, linkWrapEdit, nativeElementLabel, nativeKindLabel, newTabEdit, opensInNewTab, previousHeadingLevel, removeEdit, setAttributeEdit, setAttributesEdit, structureLabel, swapEdits, unwrapEdits } from "../src/native-structure.ts";

const apply = (source: string, edits: { start: number; end: number; text: string }[]) =>
  [...edits].sort((a, b) => b.start - a.start).reduce((out, edit) => out.slice(0, edit.start) + edit.text + out.slice(edit.end), source);

// The outer range of the `index`-th start tag, closed by the next end tag of its name (or void).
function rangeAt(source: string, index: number): ElementRange {
  const tag = startTags(source)[index];
  const closeAt = source.indexOf(`</${tag.name}>`, tag.end);
  if (tag.name === "img" || closeAt < 0) return { tag, start: tag.start, end: tag.end };
  const close = { start: closeAt, end: closeAt + tag.name.length + 3 };
  return { tag, start: tag.start, end: close.end, close };
}

const page = `<main>
  <section class="a" data-key="a">
    <h2>A</h2>
  </section>
  <section class="b" data-key="b"><p>B</p></section>
  <img src="x.png" alt="">
</main>`;

test("remove takes the element's own lines", () => {
  const a = rangeAt(page, 1);
  assert.equal(apply(page, [removeEdit(page, a)]), `<main>\n  <section class="b" data-key="b"><p>B</p></section>\n  <img src="x.png" alt="">\n</main>`);
  const inline = `<p><b>x</b><i>y</i></p>`;
  const b = rangeAt(inline, 1);
  assert.equal(apply(inline, [removeEdit(inline, b)]), `<p><i>y</i></p>`);
});

test("duplicate copies the element after itself as it is", () => {
  const a = rangeAt(page, 1);
  assert.equal(
    apply(page, [duplicateEdit(page, a)]),
    `<main>\n  <section class="a" data-key="a">\n    <h2>A</h2>\n  </section>\n  <section class="a" data-key="a">\n    <h2>A</h2>\n  </section>\n  <section class="b" data-key="b"><p>B</p></section>\n  <img src="x.png" alt="">\n</main>`,
  );
  const inline = `<p><b>x</b></p>`;
  assert.equal(apply(inline, [duplicateEdit(inline, rangeAt(inline, 1))]), `<p><b>x</b>\n<b>x</b></p>`);
});

test("setAttributesEdit rewrites one start tag for several attributes", () => {
  const source = `<p><a href="/x">x</a></p>`;
  const tag = startTags(source)[1];
  const edit = setAttributesEdit(source, tag, [["target", "_blank"], ["rel", "noopener"]]);
  assert.deepEqual({ start: edit.start, end: edit.end }, { start: tag.start, end: tag.end });
  assert.equal(apply(source, [edit]), `<p><a href="/x" target="_blank" rel="noopener">x</a></p>`);
});

test("Open in new tab writes target and noopener, and takes both away again", () => {
  const plain = `<a href="/x">x</a>`;
  const on = apply(plain, [newTabEdit(plain, startTags(plain)[0], true)]);
  assert.equal(on, `<a href="/x" target="_blank" rel="noopener">x</a>`);
  assert.equal(opensInNewTab(on, startTags(on)[0]), true);
  assert.equal(opensInNewTab(plain, startTags(plain)[0]), false);
  assert.equal(apply(on, [newTabEdit(on, startTags(on)[0], false)]), plain);
  // Other rel words stay; noreferrer goes with noopener.
  const kept = `<a href="/x" rel="nofollow">x</a>`;
  const keptOn = apply(kept, [newTabEdit(kept, startTags(kept)[0], true)]);
  assert.equal(keptOn, `<a href="/x" rel="nofollow noopener" target="_blank">x</a>`);
  const both = `<a target="_blank" rel="noopener noreferrer nofollow" href="/x">x</a>`;
  assert.equal(apply(both, [newTabEdit(both, startTags(both)[0], false)]), `<a rel="nofollow" href="/x">x</a>`);
  // Already noopener: not written twice.
  const already = `<a href="/x" rel="noopener">x</a>`;
  assert.equal(apply(already, [newTabEdit(already, startTags(already)[0], true)]), `<a href="/x" rel="noopener" target="_blank">x</a>`);
});

test("swap exchanges two siblings and keeps what lies between", () => {
  const a = rangeAt(page, 1);
  const b = rangeAt(page, 3);
  const swapped = apply(page, swapEdits(page, a, b));
  assert.equal(swapped, `<main>\n  <section class="b" data-key="b"><p>B</p></section>\n  <section class="a" data-key="a">\n    <h2>A</h2>\n  </section>\n  <img src="x.png" alt="">\n</main>`);
  assert.deepEqual(swapEdits(page, a, a), []);
});

test("attributes are set, added, quoted and removed on the start tag", () => {
  const img = rangeAt(page, 5);
  assert.equal(apply(page, [setAttributeEdit(page, img.tag, "src", "y.jpg")]).includes(`<img src="y.jpg" alt="">`), true);
  assert.equal(apply(page, [setAttributeEdit(page, img.tag, "alt", `A "quoted" & thing`)]).includes(`alt="A &quot;quoted&quot; &amp; thing"`), true);
  assert.equal(apply(page, [setAttributeEdit(page, img.tag, "alt", undefined)]).includes(`<img src="x.png">`), true);
  assert.equal(apply(page, [setAttributeEdit(page, img.tag, "loading", "lazy")]).includes(`<img src="x.png" alt="" loading="lazy">`), true);
  const bare = `<img src="x.png" alt>`;
  assert.equal(apply(bare, [setAttributeEdit(bare, rangeAt(bare, 0).tag, "alt", "Hi")]), `<img src="x.png" alt="Hi">`);
  const closed = `<img src="x.png" />`;
  assert.equal(apply(closed, [setAttributeEdit(closed, rangeAt(closed, 0).tag, "alt", "Hi")]), `<img src="x.png" alt="Hi" />`);
});

test("alt text from a file name, and the heading level before a point", () => {
  assert.equal(altFromPath("src/images/studio-desk@2x.jpg"), "Studio desk");
  assert.equal(altFromPath("https://x.test/a/team_photo.png?x=1"), "Team photo");
  assert.equal(altFromPath(""), "");
  const source = `<h1>a</h1><p>x</p><h2>b</h2><h4>c</h4>`;
  assert.equal(previousHeadingLevel(source, source.indexOf("<h4")), 2);
  assert.equal(previousHeadingLevel(source, 0), 0);
});

test("nativeKindLabel names elements in the user's words and leaves other tags as they are", () => {
  assert.equal(nativeKindLabel("h3"), "Heading");
  assert.equal(nativeKindLabel("p"), "Paragraph");
  assert.equal(nativeKindLabel("section"), "Section");
  assert.equal(nativeKindLabel("project-card"), "project-card");
  // Formatting is named for what it does.
  assert.equal(nativeKindLabel("strong"), "Bold");
  assert.equal(nativeKindLabel("b"), "Bold");
  assert.equal(nativeKindLabel("em"), "Italic");
  assert.equal(nativeKindLabel("i"), "Italic");
  assert.equal(nativeKindLabel("span"), "Text");
});

test("structureLabel names a container by its first heading and an atom by its own text", () => {
  const none = { length: 0 };
  assert.deepEqual(structureLabel({ tag: "section", text: "Intro Hello there", heading: "Intro", children: { length: 2 } }, false), { kind: "Section", text: "Intro" });
  assert.deepEqual(structureLabel({ tag: "section", text: "Only text", heading: "", children: { length: 1 } }, false), { kind: "Section", text: "" });
  assert.deepEqual(structureLabel({ tag: "p", text: "Hello there", heading: "", children: none }, false), { kind: "Paragraph", text: "Hello there" });
  assert.deepEqual(structureLabel({ tag: "card-note", text: "Cafe · 2025", heading: "", children: none }, true), { kind: "Card note", text: "Cafe · 2025" });
  assert.deepEqual(structureLabel({ tag: "site-header", text: "", heading: "", children: none }, true), { kind: "Site header", text: "" });
  // A component instance is a container even without slotted children.
  assert.deepEqual(structureLabel({ tag: "project-card", text: "Reusable cards", heading: "Reusable cards", children: none }, true), { kind: "Project card", text: "Reusable cards" });
  assert.deepEqual(structureLabel({ tag: "site-header", text: "", heading: "", children: none }, true), { kind: "Site header", text: "" });
  // Long text is cut with an ellipsis.
  const long = "x".repeat(70);
  assert.equal(structureLabel({ tag: "p", text: long, heading: "", children: none }, false).text, `${"x".repeat(59)}…`);
});

test("linkWrapEdit wraps exactly the selected text in an empty link", () => {
  const inner = "Edit plain HTML, CSS and JS.";
  const result = linkWrapEdit(inner, 5, 10, "plain");
  assert.ok("edit" in result);
  assert.equal(apply(inner, [result.edit]), `Edit <a href="">plain</a> HTML, CSS and JS.`);
  assert.equal(result.link, 5);
});

test("linkWrapEdit maps entities and keeps inner formatting inside the link", () => {
  const inner = "Tom &amp; <strong>Jerry</strong> run";
  // Text content: "Tom & Jerry run"; select "& Jerry run" (whole strong inside).
  const result = linkWrapEdit(inner, 4, 15, "& Jerry run");
  assert.ok("edit" in result);
  assert.equal(apply(inner, [result.edit]), `Tom <a href="">&amp; <strong>Jerry</strong> run</a>`);
  // "& Jerry" ends inside the strong: refused, as B/I refuse it.
  assert.deepEqual(linkWrapEdit(inner, 4, 11, "& Jerry"), { refused: "split" });
  // A word inside the strong: the link goes inside it.
  const inside = linkWrapEdit(inner, 6, 11, "Jerry");
  assert.ok("edit" in inside);
  assert.equal(apply(inner, [inside.edit]), `Tom &amp; <strong><a href="">Jerry</a></strong> run`);
});

test("linkWrapEdit refuses a span that cuts through a tag or holds a link", () => {
  assert.deepEqual(linkWrapEdit("Tom <strong>Jerry</strong> run", 2, 7, "m Jer"), { refused: "split" });
  assert.deepEqual(linkWrapEdit(`Go <a href="#/">home</a> now`, 0, 11, "Go home now"), { refused: "nested" });
  // The text no longer matches the source: refused rather than guessed.
  assert.deepEqual(linkWrapEdit("Edit plain", 5, 10, "other"), { refused: "split" });
});

test("unwrapEdits removes a link's tags and keeps its text and formatting", () => {
  const source = `<p>Read <a href="#/about/" class="x"><em>more</em> &amp; more</a> here</p>`;
  const tag = startTags(source)[1];
  const closeAt = source.indexOf("</a>");
  const range: ElementRange = { tag, start: tag.start, end: closeAt + 4, close: { start: closeAt, end: closeAt + 4 } };
  assert.equal(apply(source, unwrapEdits(range)!), "<p>Read <em>more</em> &amp; more here</p>");
  assert.equal(unwrapEdits({ tag, start: tag.start, end: tag.end }), undefined);
});

test("nativeElementLabel names a component instance by its component, as the page structure does", () => {
  assert.equal(nativeElementLabel("section-split", true), "Section split");
  assert.equal(nativeElementLabel("section", false), "Section");
  assert.equal(nativeElementLabel("my-thing", false), "my-thing");
});

test("attribute edits safely replace single-quoted and unquoted values", () => {
  const single = `<img alt='old'>`;
  assert.equal(apply(single, [setAttributeEdit(single, rangeAt(single, 0).tag, "alt", "O'Reilly")]), `<img alt="O'Reilly">`);
  const unquoted = `<img alt=old>`;
  assert.equal(apply(unquoted, [setAttributeEdit(unquoted, rangeAt(unquoted, 0).tag, "alt", `hello world" onerror="alert(1)`)]), `<img alt="hello world&quot; onerror=&quot;alert(1)">`);
});

test("button class tokens name anchors Button in the edit bar and structure", () => {
  for (const [className, kind] of [
    ["btn", "Button"], ["btn primary", "Button"], ["primary\tbtn\n\f\r", "Button"],
    ["btn-x", "Link"], [undefined, "Link"], ["primary\u00a0btn", "Link"], ["BTN", "Link"],
  ] as const) {
    assert.equal(nativeKindLabel("a", className), kind);
    assert.equal(nativeElementLabel("a", false, className), kind);
    assert.deepEqual(structureLabel({ tag: "a", className, text: "Go", heading: "", children: { length: 0 } }, false), { kind, text: "Go" });
  }
  assert.equal(nativeKindLabel("p", "btn"), "Paragraph");
  assert.equal(nativeElementLabel("card-note", true, "btn"), "Card note");
});
