import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSvg, svgDimensions } from "../src/page-builder/media-svg";
import { svgHasExecutableContent } from "../src/page-builder/media-limits";
const bytes = (source: string) => new TextEncoder().encode(source);
const wrap = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 50" width="100" height="50">${content}</svg>`;

test("SVG removes executable elements, events, URLs and attribute-changing animations", () => {
  const attacks = ['<script>alert(1)</script>', '<path d="M0 0h10" onload="x()" ONCLICK="x()" onSomething="x()"/>',
    '<foreignObject><div>html</div></foreignObject>', '<iframe/>', '<embed/>', '<object/>',
    '<animate attributeName="href" values="javascript:alert(1)"/>', '<set attributeName="xlink:href" to="javascript:x"/>',
    '<animate attributeName="onload" to="x()"/>'];
  for (const href of ["javascript:x", "JaVaScRiPt:x", " java\tscript: x", "java&#x73;cript:x", "&#106;avascript:x", "vbscript:x", "data:text/html,x"]) {
    for (const attribute of ["href", "xlink:href"]) attacks.push(`<use ${attribute}="${href}"/>`);
  }
  for (const attack of attacks) {
    const cleaned = cleanSvg(bytes(wrap(attack)));
    assert.equal(svgHasExecutableContent(cleaned), false, attack);
    assert.doesNotMatch(new TextDecoder().decode(cleaned), /foreignObject|iframe|embed|object|attributeName|vbscript:|data:text\/html/i);
  }
});
test("SVG keeps artwork, ids, references and dimensions while removing padding", () => {
  const source = wrap(`<defs><linearGradient id="paint"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient><path id="shape" d="M0 0h10v10z"/></defs><path fill="url(#paint)" d="M20 0h10v10z"/><use href="#shape" x="20"/><text x="10" y="30">Artwork</text><!--${"padding ".repeat(1000)}-->`);
  const cleaned = cleanSvg(bytes(source)), text = new TextDecoder().decode(cleaned);
  assert.ok(cleaned.length < source.length);
  assert.equal((text.match(/<path\b/g) ?? []).length, 2);
  for (const pattern of [/viewBox="0 0 100 50"/, /width="100"/, /height="50"/, /id="paint"/, /href="#shape"/, /Artwork/, /url\(#paint\)/]) assert.match(text, pattern);
  assert.deepEqual(svgDimensions(cleaned), { width: 100, height: 50 });
  assert.deepEqual(svgDimensions(bytes('<svg viewBox="0 0 80 40"/>')), { width: 80, height: 40 });
  assert.deepEqual(svgDimensions(bytes('<svg width="200" viewBox="0 0 80 40"/>')), { width: 200, height: 100 });
});
test("SVG refuses malformed XML and any output that still trips the executable gate", () => {
  assert.throws(() => cleanSvg(bytes("<svg><path></svg>")));
});
test("SVG keeps words in its artwork that merely look like code", () => {
  for (const words of ["online=yes", "javascript: example", "onclick = here", "&lt;script&gt;"]) {
    const text = new TextDecoder().decode(cleanSvg(bytes(wrap(`<text x="0" y="10">${words}</text>`))));
    assert.ok(text.includes(words), `${words} kept`);
  }
});
test("a styled SVG with nothing executable keeps its exact bytes", () => {
  // Selectors may depend on any detail: element names, order, emptiness, whitespace, attribute values, Unicode names.
  for (const source of [
    wrap('<style>rect{fill:red}g>circle{fill:#00f}</style><g><circle cx="5" cy="5" r="5"/></g><rect width="10" height="10"/><!-- note -->'),
    wrap('<style>g:empty+rect{fill:red}</style><g> </g><rect width="10" height="10"/>'),
    wrap('<style>[data-note="javascript: example"]{fill:red}</style><rect data-note="javascript: example" width="10" height="10"/>'),
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:\u56f3="http://www.w3.org/2000/svg"><style>rect{fill:red}</style><\u56f3:rect width="10" height="10"/></svg>',
  ]) assert.deepEqual(cleanSvg(bytes(source)), bytes(source));
});
test("a styled SVG with a script loses only the executable parts, keeping what its selectors use", () => {
  const source = wrap('<style>rect{fill:red}g>circle{fill:#00f}g:empty+rect{stroke:red}[fill="blue"]{stroke:green}</style><script>go()</script><g><circle cx="5" cy="5" r="5"/></g><g/><rect width="10" height="10" onclick="go()"/><rect x="20" width="10" height="10"/><ellipse cx="40" cy="5" rx="4" ry="4" fill="blue"/><path d="M0 0h1"/><path d="M2 0h1"/><!-- note -->');
  // Inside <style>, SVGO may write > and " as entities; an XML reader turns them back, so the CSS is the same.
  const text = new TextDecoder().decode(cleanSvg(bytes(source))).replaceAll("&gt;", ">").replaceAll("&quot;", '"');
  for (const pattern of [/rect\{fill:red\}/, /g>circle\{fill:#00f\}/, /g:empty\+rect/, /\[fill="blue"\]/, /<g><circle\b/, /<g\/><rect\b/, /<ellipse\b[^>]*fill="blue"/]) assert.match(text, pattern);
  assert.equal((text.match(/<rect\b/g) ?? []).length, 2);
  assert.equal((text.match(/<path\b/g) ?? []).length, 2);
  assert.doesNotMatch(text, /script|onclick|go\(\)|note/);
});
test("SVG keeps CDATA words in its artwork", () => {
  for (const words of ["online=yes", "<script>"]) {
    const text = new TextDecoder().decode(cleanSvg(bytes(wrap(`<text x="0" y="10"><![CDATA[${words}]]></text>`))));
    assert.ok(text.includes(words) || text.includes(words.replace("<", "&lt;")), `${words} kept`);
  }
});
test("SVG drops stylesheet processing instructions, keeping the XML declaration harmless", () => {
  const source = '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="evil.xsl"?><?xml-stylesheet href="look.css"?>' + wrap('<path d="M0 0h10v10z"/>');
  const text = new TextDecoder().decode(cleanSvg(bytes(source)));
  assert.doesNotMatch(text, /xml-stylesheet|evil\.xsl/);
  assert.match(text, /<path\b/);
});
