import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cssVariableCompletion, cssVariableDeclarations, cssVariableReference } from '../src/page-builder/css-intelligence';
function completion(marked: string) { const at = marked.indexOf('|'); return cssVariableCompletion(marked.replace('|', ''), at); }
test('bare values wrap, existing and empty var arguments do not', () => {
  assert.equal(completion('.a {color: --ac|}')?.wrap, true);
  assert.equal(completion('.a {color: var(--ac|)}')?.wrap, false);
  assert.equal(completion('.a {color: var(|)}')?.wrap, false);
  assert.equal(completion('.a {color: var(--ac|cent)}')?.end, 23);
});
test('property names, comments, strings and URL values fail closed', () => {
  for (const text of ['.a {--ac|: red}', '.a {color: "--ac|"}', '.a {color: /* --ac| */red}', '.a {background: url(--ac|)}', '.a {background: url(var(--ac|))}', '--ac|', '.a {.b:hover --ac|}', '.a {color: "var(|)"}']) assert.equal(completion(text), undefined, text);
});
test('reference offsets require a real var argument, including fallbacks', () => {
  const source = '.a { color: var(--accent, var(--fallback)); content: "var(--fake)"; /*var(--no)*/ }';
  for (const name of ['--accent', '--fallback']) {
    const start = source.indexOf(name); assert.deepEqual(cssVariableReference(source, start + 2), {name, start, end: start + name.length});
  }
  for (const name of ['--fake', '--no']) assert.equal(cssVariableReference(source, source.indexOf(name)), undefined);
});
test('all declarations retain provenance, source order, string values and CRLF offsets', () => {
  const sources = { 'b.css': ':root {--accent: blue; --label: "a;b}"; --nested: calc(1 + var(--x));}', 'a.scss': '@layer theme { :root {\r\n--accent: red; --x: 2;}}', 'ignore.html': '<style>:root{--bad:1}</style>' };
  const found = cssVariableDeclarations({sources, orderedPaths:['a.scss','b.css','a.scss']});
  assert.deepEqual(found.map(d => [d.name,d.value,d.path]), [['--accent','red','a.scss'], ['--x','2','a.scss'], ['--accent','blue','b.css'], ['--label','"a;b}"','b.css'], ['--nested','calc(1 + var(--x))','b.css']]);
  for (const d of found) assert.equal(sources[d.path as keyof typeof sources].slice(d.start,d.end), d.name);
});
test('comment and string declarations are excluded; unordered paths sort deterministically', () => {
  const found = cssVariableDeclarations({sources:{'z.less': '/* {--fake: no;} */ .a {content:"{--bad: no;}"; --real: 3}', 'a.css': ':root{--first:1}'}, orderedPaths:[]});
  assert.deepEqual(found.map(d=>d.name), ['--first','--real']);
});

test('SCSS and Less line comments are excluded and parent values after a nested rule remain usable', () => {
  const source = '.a {\n // --fake: 1;\n --real: 2; }';
  assert.deepEqual(cssVariableDeclarations({sources:{'a.scss': source, 'b.less': source},orderedPaths:[]}).map(d=>d.name), ['--real','--real']);
  const commented = '.a {\n// color: var(--fake)\n}';
  assert.equal(cssVariableReference(commented, commented.indexOf('--fake'), 'a.scss'), undefined);
  assert.equal(completion('.a { .b {color:red} color: --ac|}')?.wrap, true);
});
