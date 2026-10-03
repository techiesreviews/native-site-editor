import { test } from "node:test";
import assert from "node:assert/strict";
import { editNavigation, readNavigation } from "../src/page-builder/site-navigation";

const html = `<header>\n  <a href="/" class="brand">Brand</a>\n  <nav aria-label="Main">\n    <a class="nav-link" href="/#work">Work</a>\n    <a href='/about/'>About</a>\n  </nav>\n</header>\n<footer><nav><a href="/privacy/">Privacy</a></nav></footer>`;
test("header navigation reads direct anchors without brand or footer", () => {
  assert.deepEqual(readNavigation(html)?.links.map(({ href, label }) => ({ href, label })), [{ href: "/#work", label: "Work" }, { href: "/about/", label: "About" }]);
});
test("reordering preserves item attributes and leaves surrounding markup", () => {
  const nav = readNavigation(html)!;
  const next = editNavigation(html, nav, [...nav.links].reverse());
  assert.ok(next.includes("<a href='/about/'>About</a>\n    <a class=\"nav-link\" href=\"/#work\">Work</a>"));
  assert.ok(next.endsWith('</header>\n<footer><nav><a href="/privacy/">Privacy</a></nav></footer>'));
});
test("adding follows the existing item pattern, renaming escapes text", () => {
  const nav = readNavigation(html)!;
  const next = editNavigation(html, nav, [{ ...nav.links[0], label: "Work & play" }, { href: "/services/", label: "Services" }]);
  assert.ok(next.includes('class="nav-link" href="/services/"'));
  assert.ok(next.includes('Work &amp; play'));
  assert.ok(!next.includes("href='/about/'"));
});
test("ul navigation keeps its li wrapper and style for new items", () => {
  const html = '<header><nav><ul class="links">\n  <li class="item"><a href="/">Home</a></li>\n</ul></nav></header>';
  const nav = readNavigation(html)!;
  assert.ok(editNavigation(html, nav, [...nav.links, { href: "https://example.com/", label: "Partner" }]).includes('<li class="item"><a href="https://example.com/">Partner</a></li>'));
});
test("no editor silently flattens nested menus, icon labels or comments", () => {
  assert.equal(readNavigation('<header><nav><a href="/"><span>Home</span></a></nav></header>'), undefined);
  assert.equal(readNavigation('<header><nav><!-- note --><a href="/">Home</a></nav></header>'), undefined);
  assert.equal(readNavigation('<header><nav><ul><li><a href="/">Home</a><ul><li><a href="/child/">Child</a></li></ul></li></ul></nav></header>'), undefined);
});
test("empty nav accepts first page; removal retains an editable empty nav", () => {
  const html = '<header>\n  <nav aria-label="Main">\n  </nav>\n</header>';
  const nav = readNavigation(html)!;
  const next = editNavigation(html, nav, [{ href: "/about/", label: "About" }]);
  assert.equal(readNavigation(next)?.links.length, 1);
  assert.equal(readNavigation(editNavigation(next, readNavigation(next)!, []))?.links.length, 0);
});
test("unsafe or incomplete link items are rejected", () => {
  const nav = readNavigation(html)!;
  assert.throws(() => editNavigation(html, nav, [{ href: "javascript:alert(1)", label: "Bad" }]), /Use a page URL/);
  assert.throws(() => editNavigation(html, nav, [{ href: "/about/", label: "" }]), /label/);
});
test("new items do not clone wrapper or anchor IDs or current-page state", () => {
  const html = '<header><nav><ul><li id="home-item" data-key="home-item" class="item"><a id="home-link" data-key="home-link" aria-current="page" href="/">Home</a></li></ul></nav></header>';
  const nav = readNavigation(html)!;
  const next = editNavigation(html, nav, [...nav.links, { href: "/about/", label: "About" }]);
  assert.equal((next.match(/id="home-item"/g) ?? []).length, 1);
  assert.equal((next.match(/id="home-link"/g) ?? []).length, 1);
  assert.equal((next.match(/aria-current="page"/g) ?? []).length, 1);
  assert.equal((next.match(/data-key="home-item"/g) ?? []).length, 1);
  assert.equal((next.match(/data-key="home-link"/g) ?? []).length, 1);
  assert.ok(next.includes('<li class="item"><a href="/about/">About</a></li>'));
});
test("reordering named-entity links preserves source and decoded labels", () => {
  const html = '<header><nav>\n    <a href="/caf&eacute;/?x=1&amp;y=2">Caf&eacute; &copy;</a>\n    <a href="/about/">About &NotEqualTilde;</a>\n  </nav></header>';
  const nav = readNavigation(html)!;
  assert.equal(nav.links[0].label, "Café ©");
  assert.equal(nav.links[0].href, "/café/?x=1&y=2");
  const next = editNavigation(html, nav, [...nav.links].reverse());
  assert.ok(next.includes('<a href="/caf&eacute;/?x=1&amp;y=2">Caf&eacute; &copy;</a>'));
  assert.ok(next.includes('<a href="/about/">About &NotEqualTilde;</a>'));
  assert.equal(next.includes("&amp;eacute;"), false);
});
