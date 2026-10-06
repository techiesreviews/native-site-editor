import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveNativeRoutes } from '../shared/native-routes';
import { planSidecarRecipe, planSidecarRemoval } from '../src/page-builder/collection-origins';
import { nativeCollectionPlanIsCurrent, planNativeCollectionOperation } from '../src/page-builder/native-collection-host';
import { EDITOR_PAGE_BUILDER_PATH as SIDE, readPageBuilderDocument, writePageBuilderDocument } from '../src/page-builder/page-builder-document';
import { makeSectionTarget } from '../src/page-builder/source-target';

const home = (cards = '') => `<html><body><div id="cards">${cards}</div></body></html>`;
const page = (title: string, description: string) => `<html><head><title>${title}</title><meta name="description" content="${description}"></head><body>Own content</body></html>`;
const graph = (sources: Record<string, string>) => ({ sources, routes: deriveNativeRoutes(Object.keys(sources)), files: Object.keys(sources), revision: 'scope:1', identity: { name: 'Studio' } });
function fixture() {
  const raw = { 'index.html': home(), 'work/a/index.html': page('Alpha', 'First description'), [SIDE]: writePageBuilderDocument({
    version: 1, pages: {}, collections: { work: {
      pagePath: 'index.html', target: makeSectionTarget(home(), home().indexOf('<div')),
      folders: ['/work/'], sort: 'title', filter: '', limit: 10,
      template: '<a href="{url}">{title}: {description} ({tone})</a>', fields: ['tone'],
      overrides: { 'work/a/index.html': { tone: 'warm' } }, privateNote: { keep: true },
    } }, foreign: { keep: ['exact'] },
  }) };
  const built = planNativeCollectionOperation({ ...graph(raw), origin: {
    done: 'Build', undone: 'Undo build', acceptCollections: ['work'],
    expectedSources: new Map([['index.html', raw['index.html']], [SIDE, raw[SIDE]]]),
  } });
  if ('error' in built) assert.fail(built.error);
  return { ...raw, ...Object.fromEntries(built.operation.edits!) };
}
function save(sources: Record<string, string>) {
  const recipe = readPageBuilderDocument(sources[SIDE]).collections.work;
  return planSidecarRecipe(graph(sources), 'index.html', sources['index.html'].indexOf('<div'), recipe);
}

test('unchanged recipe Save refreshes persisted source metadata in one pinned operation', () => {
  const sources = fixture();
  sources['work/a/index.html'] = page('Renamed', 'New description');
  const before = structuredClone(sources), origin = save(sources);
  assert.equal(origin.refreshCollections, true);
  assert.equal(origin.edits.size, 0);
  assert.deepEqual(origin.creates, []);
  const planned = planNativeCollectionOperation({ ...graph(sources), origin: { ...origin, done: 'Save', undone: 'Undo save' } });
  if ('error' in planned) assert.fail(planned.error);
  const cards = '<a href="/work/a/">Renamed: New description (warm)</a>';
  assert.equal(planned.operation.edits!.get('index.html'), home(cards));
  const expectedDocument = readPageBuilderDocument(sources[SIDE]);
  expectedDocument.collections.work.outputFingerprint = cards;
  assert.equal(planned.operation.edits!.get(SIDE), writePageBuilderDocument(expectedDocument, sources[SIDE]));
  assert.deepEqual([...planned.operation.edits!.keys()].sort(), [SIDE, 'index.html']);
  assert.equal(Object.hasOwn(planned.operation, 'refreshCollections'), false);
  assert.equal(Object.hasOwn(planned.operation, 'acceptCollections'), false);
  assert.deepEqual(Object.fromEntries(planned.operation.expectedSources), sources);
  assert.equal(nativeCollectionPlanIsCurrent(planned, graph(sources)), true);
  for (const changed of [
    { ...graph(sources), revision: 'scope:2' },
    { ...graph(sources), identity: { name: 'Other' } },
    { ...graph(sources), files: [...Object.keys(sources), 'future.html'] },
    { ...graph(sources), routes: { '/': 'index.html' } },
    graph({ ...sources, 'work/a/index.html': page('Later', 'Later') }),
  ]) assert.equal(nativeCollectionPlanIsCurrent(planned, changed), false);
  assert.deepEqual(sources, before);
});

test('refresh intent never authorizes replacing customised cards', () => {
  const sources = fixture();
  sources['index.html'] = sources['index.html'].replace('Alpha:', 'My own title:');
  const before = structuredClone(sources);
  const origin = save(sources);
  assert.equal(origin.refreshCollections, true);
  const planned = planNativeCollectionOperation({ ...graph(sources), origin: { ...origin, done: 'Save', undone: 'Undo save' } });
  assert.ok('error' in planned);
  assert.match(planned.error, /edited by hand/);
  assert.deepEqual(sources, before);
});

test('removing a recipe keeps its cards and does not request refresh', () => {
  const sources = fixture(), origin = planSidecarRemoval(graph(sources), 'work');
  assert.equal(Object.hasOwn(origin, 'refreshCollections'), false);
  const planned = planNativeCollectionOperation({ ...graph(sources), origin: { ...origin, done: 'Keep cards', undone: 'Restore recipe' } });
  if ('error' in planned) assert.fail(planned.error);
  assert.equal(planned.operation.edits!.has('index.html'), false);
  assert.deepEqual(readPageBuilderDocument(planned.operation.edits!.get(SIDE)).collections, {});
});
