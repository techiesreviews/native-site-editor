import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveNativeRoutes } from '../shared/native-routes';
import { rewriteRouteLinks } from '../src/native-page-moves';
import { EDITOR_PAGE_BUILDER_PATH as SIDE, readPageBuilderDocument, writePageBuilderDocument, type PageBuilderDocument } from '../src/page-builder/page-builder-document';
import { planSidecarPages, rekeySidecarPages, routeLinkRewrite } from '../src/page-builder/sidecar-pages';
import { makeSectionTarget } from '../src/page-builder/source-target';

type Doc = PageBuilderDocument & Record<string, unknown>;
const page = (title: string, body = '') => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

/**
 * An operation over `sources` as src/main.ts `withSidecarPages` runs it: the
 * JSON after the change (or undefined when it does not change).
 */
function change(sources: Record<string, string>, op: { moves?: { from: string; to: string }[]; deletes?: string[]; edits?: Map<string, string> }) {
  const moves = new Map((op.moves ?? []).map((move) => [move.from, move.to]));
  const movedFrom = new Map([...moves].map(([from, to]) => [to, from]));
  const files = Object.keys(sources);
  const afterFiles = new Set(files);
  for (const [from, to] of moves) { afterFiles.delete(from); afterFiles.add(to); }
  for (const path of op.deletes ?? []) afterFiles.delete(path);
  const after: Record<string, string | undefined> = {};
  for (const path of afterFiles) after[path] = op.edits?.get(path) ?? sources[movedFrom.get(path) ?? path];
  return planSidecarPages(sources[SIDE], op.edits?.get(SIDE) ?? sources[SIDE], {
    before: sources, after, moves, deletes: op.deletes ?? [],
    rewriteLinks: routeLinkRewrite(deriveNativeRoutes(files), deriveNativeRoutes([...afterFiles]), moves),
  });
}
const sidecarAfter = (text: string | undefined) => { assert.ok(text !== undefined, 'the JSON changes'); return readPageBuilderDocument(text) as Doc; };

/** Whole-page entries with shared sections, page parts and data the editor does not know. */
function withPageEntries() {
  const meta = (tag: string) => ({ sections: { [`${tag}-hero`]: { kind: 'hero', copyOf: 'index.html' } }, pageParts: { header: { shared: 'site-header' } }, opaque: { nested: [tag, 1, true] } });
  const doc = { version: 1, pages: { 'work/a/index.html': meta('a'), 'work/b/index.html': meta('b'), 'about/index.html': meta('about') },
    catalog: { sharedSections: { 'site-header': { html: '<header></header>' } } } } as unknown as Doc;
  const raw: Record<string, string> = { 'index.html': page('Home'), 'work/a/index.html': page('Alpha'), 'work/b/index.html': page('Beta'), 'about/index.html': page('About'), [SIDE]: writePageBuilderDocument(doc) };
  return { raw, meta, doc: readPageBuilderDocument(raw[SIDE]) as Doc };
}

test('moving a page carries its whole entry and leaves other pages, catalog alone', () => {
  const { raw, meta, doc } = withPageEntries();
  const after = sidecarAfter(change(raw, { moves: [{ from: 'work/a/index.html', to: 'work/z/index.html' }] }));
  assert.deepEqual(after.pages['work/z/index.html'], meta('a'));
  assert.equal(Object.hasOwn(after.pages, 'work/a/index.html'), false);
  assert.deepEqual(after.pages['work/b/index.html'], doc.pages['work/b/index.html']);
  assert.deepEqual(after.pages['about/index.html'], doc.pages['about/index.html']);
  assert.deepEqual(after.catalog, doc.catalog);
  assert.equal(Object.hasOwn(after, "collections"), false);
});
test('moving a folder carries the entry of every page inside it', () => {
  const { raw, meta, doc } = withPageEntries();
  const after = sidecarAfter(change(raw, { moves: [{ from: 'work/a/index.html', to: 'projects/a/index.html' }, { from: 'work/b/index.html', to: 'projects/b/index.html' }] }));
  assert.deepEqual(after.pages['projects/a/index.html'], meta('a'));
  assert.deepEqual(after.pages['projects/b/index.html'], meta('b'));
  assert.deepEqual(after.pages['about/index.html'], doc.pages['about/index.html']);
  assert.deepEqual(after.catalog, doc.catalog);
});
test('deleting a page removes its whole entry and keeps the rest', () => {
  const { raw, doc } = withPageEntries();
  const after = sidecarAfter(change(raw, { deletes: ['work/b/index.html'] }));
  assert.equal(Object.hasOwn(after.pages, 'work/b/index.html'), false);
  assert.deepEqual(after.pages['work/a/index.html'], doc.pages['work/a/index.html']);
  assert.deepEqual(after.pages['about/index.html'], doc.pages['about/index.html']);
  assert.deepEqual(after.catalog, doc.catalog);
});
test('moving a page onto a leftover entry of a missing file is refused and changes nothing', () => {
  const { raw, meta } = withPageEntries();
  const doc = readPageBuilderDocument(raw[SIDE]);
  (doc.pages as Record<string, unknown>)['work/z/index.html'] = { ...meta('orphan'), links: ['keep-me'] };
  const sources = { ...raw, [SIDE]: writePageBuilderDocument(doc, raw[SIDE]) };
  const frozen = structuredClone(sources);
  assert.throws(() => change(sources, { moves: [{ from: 'work/a/index.html', to: 'work/z/index.html' }] }), /work\/z\/index\.html already has page data/);
  assert.deepEqual(sources, frozen);
});
test('a page without an entry may still move to a path with a leftover entry', () => {
  const { raw, meta } = withPageEntries();
  const doc = readPageBuilderDocument(raw[SIDE]);
  delete (doc.pages as Record<string, unknown>)['work/a/index.html'];
  (doc.pages as Record<string, unknown>)['work/z/index.html'] = meta('orphan');
  const text = change({ ...raw, [SIDE]: writePageBuilderDocument(doc, raw[SIDE]) }, { moves: [{ from: 'work/a/index.html', to: 'work/z/index.html' }] });
  assert.equal(text, undefined, 'nothing in the JSON changes');
});
test('pages that swap places, or move along a chain, each keep their own entry', () => {
  const entries: Record<string, string> = { a: 'A', b: 'B' };
  rekeySidecarPages(entries, new Map([['a', 'b'], ['b', 'c']]), []);
  assert.deepEqual(entries, { b: 'A', c: 'B' });
  const swapped: Record<string, string> = { a: 'A', b: 'B' };
  rekeySidecarPages(swapped, new Map([['a', 'b'], ['b', 'a']]), []);
  assert.deepEqual(swapped, { a: 'B', b: 'A' });
});
test('an operation that moves or deletes no page with an entry, or a site without the JSON, writes nothing', () => {
  const { raw } = withPageEntries();
  // A duplicate starts without the original page's entry: nothing to follow.
  assert.equal(change(raw, {}), undefined);
  assert.equal(change(raw, { deletes: ['index.html'] }), undefined);
  const { [SIDE]: _side, ...bare } = raw;
  assert.equal(change(bare, { moves: [{ from: 'work/a/index.html', to: 'work/z/index.html' }] }), undefined);
});
test('an invalid JSON refuses with a reason and is never rewritten', () => {
  const { raw } = withPageEntries();
  assert.throws(() => change({ ...raw, [SIDE]: '{ nope' }, { deletes: ['work/a/index.html'] }), /page-builder\.json is not valid/);
});

/**
 * Shared copies whose bytes a page move's site-managed link rewrite changes: the about page's
 * section and the home page's header link /about/. Built as the Files move builds its operation:
 * the moves plus every page with links rewritten by rewriteRouteLinks.
 */
function sharedSite() {
  const head = '<header class="site-header"><a href="/">S</a><a href="/about/">About</a></header>';
  const hero = '<section class="hero"><h1>About</h1><a href="/about/#team">Team</a></section>';
  const sources: Record<string, string> = {
    'index.html': page('Home', head + '<main><p>Hi</p></main>'),
    'about/index.html': page('About', head + `<main>${hero}</main>`),
    'work/a/index.html': page('Alpha', head.replace('>S<', '>Custom<')),
  };
  const target = (path: string, needle: string) => makeSectionTarget(sources[path], sources[path].indexOf(needle));
  const part = (path: string) => ({ kind: 'native-page-part', recordId: 'site-head', target: target(path, '<header'), basis: head, unknown: { kept: [1] } });
  const doc = { version: 1,
    reusablePageParts: { version: 1, records: { 'site-head': { id: 'site-head', label: 'Site header', htmlPath: '.editor/page-parts/site-head.html', rootTag: 'header', rootClass: 'site-header', stylesheetPath: 'styles/site.css' } } },
    pages: {
      'index.html': { pageParts: { 'site-head-1': part('index.html') } },
      'about/index.html': { sections: { 'hero-1': { kind: 'native-section', recordId: 'about-hero', target: target('about/index.html', '<section class="hero"'), basis: hero }, other: { kind: 'not-native', basis: '/about/' } }, pageParts: { 'site-head-1': part('about/index.html') }, opaque: { nested: ['/about/'] } },
      // A customised copy: its header differs from the basis before the move.
      'work/a/index.html': { pageParts: { 'site-head-1': part('work/a/index.html') } },
    } } as unknown as PageBuilderDocument;
  sources[SIDE] = writePageBuilderDocument(doc);
  return { sources, head, hero };
}
/** The Files move: moves, and every page whose links the URL change rewrites. */
function urlMove(sources: Record<string, string>, from: string, to: string, extraEdits: Record<string, string> = {}) {
  const moves = Object.keys(sources).filter((path) => path.startsWith(from)).map((path) => ({ from: path, to: to + path.slice(from.length) }));
  const moved = new Map(moves.map((move) => [move.from, move.to]));
  const edits = new Map<string, string>();
  for (const [path, text] of Object.entries(sources)) {
    if (path === SIDE) continue;
    const next = rewriteRouteLinks(text, `/${from}`, `/${to}`, true).text;
    if (next !== text) edits.set(moved.get(path) ?? path, next);
  }
  for (const [path, text] of Object.entries(extraEdits)) edits.set(path, text);
  return change(sources, { moves, edits });
}
const page_ = (doc: PageBuilderDocument, path: string) => doc.pages[path] as Record<string, Record<string, Record<string, unknown>>>;

test('a URL change rebases the basis of pristine shared copies whose links it rewrote, on the moved page and others', () => {
  const { sources, head, hero } = sharedSite();
  const before = readPageBuilderDocument(sources[SIDE]);
  const after = sidecarAfter(urlMove(sources, 'about/', 'studio/'));
  const studio = page_(after, 'studio/index.html');
  assert.equal(studio.sections['hero-1'].basis, hero.replace('/about/#team', '/studio/#team'));
  assert.equal(studio.pageParts['site-head-1'].basis, head.replace('/about/', '/studio/'));
  assert.equal(page_(after, 'index.html').pageParts['site-head-1'].basis, head.replace('/about/', '/studio/'), 'a pristine copy on a page that did not move');
  // Customised before the move: stays customised.
  assert.equal(page_(after, 'work/a/index.html').pageParts['site-head-1'].basis, head);
  // Only bases change: unknown entries, unknown link fields, targets and other pages' data stay exactly.
  const expected = structuredClone(before) as PageBuilderDocument;
  expected.pages['studio/index.html'] = expected.pages['about/index.html']; delete expected.pages['about/index.html'];
  page_(expected, 'studio/index.html').sections['hero-1'].basis = studio.sections['hero-1'].basis;
  page_(expected, 'studio/index.html').pageParts['site-head-1'].basis = studio.pageParts['site-head-1'].basis;
  page_(expected, 'index.html').pageParts['site-head-1'].basis = studio.pageParts['site-head-1'].basis;
  assert.deepEqual(after, expected);
});
test('deleting a page drops its links and leaves the copies on other pages as they are', () => {
  const { sources } = sharedSite();
  const before = readPageBuilderDocument(sources[SIDE]);
  const after = sidecarAfter(change(sources, { deletes: ['about/index.html'] }));
  assert.equal(Object.hasOwn(after.pages, 'about/index.html'), false);
  assert.deepEqual(after.pages['index.html'], before.pages['index.html']);
  assert.deepEqual(after.pages['work/a/index.html'], before.pages['work/a/index.html']);
});
test('a pristine copy the move also changes by hand, or the same edit with no move, keeps its basis', () => {
  const { sources, head } = sharedSite();
  const homeEdited = rewriteRouteLinks(sources['index.html'], '/about/', '/studio/').text.replace('>S<', '>Hand<');
  const after = sidecarAfter(urlMove(sources, 'about/', 'studio/', { 'index.html': homeEdited }));
  assert.equal(page_(after, 'index.html').pageParts['site-head-1'].basis, head);
  // The same rewrite as a plain edit, no page moving: nothing is a site-managed URL change.
  assert.equal(change(sources, { edits: new Map([['index.html', rewriteRouteLinks(sources['index.html'], '/about/', '/studio/').text]]) }), undefined, 'the JSON is not rewritten');
});
test('a malformed recognised link refuses a URL move; the leftover-entry guard still refuses', () => {
  const { sources } = sharedSite();
  const doc = readPageBuilderDocument(sources[SIDE]);
  delete page_(doc, 'index.html').pageParts['site-head-1'].basis;
  assert.throws(() => urlMove({ ...sources, [SIDE]: writePageBuilderDocument(doc, sources[SIDE]) }, 'about/', 'studio/'), /needs its basis/);
  const left = readPageBuilderDocument(sources[SIDE]);
  (left.pages as Record<string, unknown>)['studio/index.html'] = { note: 'old' };
  assert.throws(() => urlMove({ ...sources, [SIDE]: writePageBuilderDocument(left, sources[SIDE]) }, 'about/', 'studio/'), /studio\/index\.html already has page data/);
});

/** The move's own edit of the JSON, keyed as before the move (the step re-keys it). */
const candidateSide = (sources: Record<string, string>, mutate: (doc: PageBuilderDocument) => void) => {
  const doc = readPageBuilderDocument(sources[SIDE]); mutate(doc);
  return writePageBuilderDocument(doc, sources[SIDE]);
};
test('a link the same change turns opaque, points elsewhere or gives another record keeps its basis; the rest is preserved', () => {
  const { sources, head, hero } = sharedSite();
  const cases: [string, (doc: PageBuilderDocument) => void, (after: PageBuilderDocument) => Record<string, unknown>, string][] = [
    ['kind', (doc) => { page_(doc, 'about/index.html').sections['hero-1'].kind = 'not-native'; }, (after) => page_(after, 'studio/index.html').sections['hero-1'], hero],
    ['target', (doc) => { const link = page_(doc, 'index.html').pageParts['site-head-1']; link.target = { ...(link.target as object), path: [0, 1, 9] }; }, (after) => page_(after, 'index.html').pageParts['site-head-1'], head],
    ['recordId', (doc) => { page_(doc, 'about/index.html').sections['hero-1'].recordId = 'another-hero'; }, (after) => page_(after, 'studio/index.html').sections['hero-1'], hero],
  ];
  for (const [what, mutate, pick, basis] of cases) {
    const side = candidateSide(sources, mutate);
    const after = sidecarAfter(urlMove(sources, 'about/', 'studio/', { [SIDE]: side }));
    assert.equal(pick(after).basis, basis, `${what}: the changed link keeps its basis`);
    const expected = readPageBuilderDocument(side);
    assert.deepEqual(pick(after), pick({ ...expected, pages: { ...expected.pages, 'studio/index.html': expected.pages['about/index.html'] } } as PageBuilderDocument), `${what}: the changed link is kept exactly`);
    // Links the change left alone are still rebased.
    assert.equal(page_(after, 'studio/index.html').pageParts['site-head-1'].basis, head.replace('/about/', '/studio/'), what);
    if (what !== 'target') assert.equal(page_(after, 'index.html').pageParts['site-head-1'].basis, head.replace('/about/', '/studio/'), what);
    assert.deepEqual((after.pages['studio/index.html'] as Record<string, unknown>).opaque, { nested: ['/about/'] }, what);
  }
});
test('a malformed recognised link in the changed JSON refuses the move', () => {
  const { sources } = sharedSite();
  const frozen = structuredClone(sources);
  const broken: [(doc: PageBuilderDocument) => void, RegExp][] = [
    [(doc) => { page_(doc, 'about/index.html').sections['hero-1'].basis = '<div>not a section</div>'; }, /basis must be exactly one section/],
    [(doc) => { page_(doc, 'index.html').pageParts['site-head-1'].target = makeSectionTarget(sources['index.html'], sources['index.html'].indexOf('<main')) as never; }, /needs a header target/],
  ];
  for (const [mutate, reason] of broken) assert.throws(() => urlMove(sources, 'about/', 'studio/', { [SIDE]: candidateSide(sources, mutate) }), reason);
  assert.deepEqual(sources, frozen);
});
test('a link rewrite exists only when a moved page changes URL', () => {
  const routes = deriveNativeRoutes(['index.html', 'about/index.html', 'styles/site.css']);
  assert.equal(routeLinkRewrite(routes, deriveNativeRoutes(['index.html', 'about/index.html', 'css/site.css']), new Map([['styles/site.css', 'css/site.css']])), undefined);
  const rewrite = routeLinkRewrite(routes, deriveNativeRoutes(['index.html', 'studio/index.html', 'styles/site.css']), new Map([['about/index.html', 'studio/index.html']]));
  assert.equal(rewrite?.('<a href="/about/">About</a>'), '<a href="/studio/">About</a>');
});
