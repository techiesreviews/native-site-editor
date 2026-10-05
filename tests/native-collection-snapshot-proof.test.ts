import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveNativeRoutes } from '../shared/native-routes';
import { applyCollectionEdits, planBake } from '../src/page-builder/collection-bake';
import { captureNativeCollectionSnapshotProof, type NativeCollectionSnapshot } from '../src/page-builder/native-collection-host';

function snapshot(): NativeCollectionSnapshot {
  const raw = {
    'index.html': '<div data-each="/work/"><template><a href="{url}">{title}</a></template></div>',
    'work/a/index.html': '<html><head><title>Original</title><meta name="description" content="Original description"></head><body>Article</body></html>',
    '.editor/page-builder.json': '{"version":1,"collections":{}}',
  };
  const files = [...Object.keys(raw), 'assets/unloaded.txt'];
  const routes = deriveNativeRoutes(files);
  const bake = planBake(raw, routes, { name: 'Studio' });
  if ('error' in bake) assert.fail(bake.error);
  const sources = Object.fromEntries(Object.entries(raw).map(([path, text]) => [path, applyCollectionEdits(text, bake.edits[path] ?? [])]));
  return { sources, files, routes, revision: 'scope:generation:1', identity: { name: 'Studio' } };
}

test('unchanged independently read snapshot passes regardless of graph ordering', () => {
  const before = snapshot();
  const current = snapshot();
  current.files = [...current.files].reverse();
  current.routes = Object.fromEntries(Object.entries(current.routes).reverse());
  assert.equal(captureNativeCollectionSnapshotProof(before)(current), true);
});

test('foreign persisted page metadata cannot be blessed while generated cards remain old', () => {
  const before = snapshot();
  assert.match(before.sources['index.html'], />Original<\/a>/);
  const proof = captureNativeCollectionSnapshotProof(before);
  const current = snapshot();
  current.sources = { ...current.sources, 'work/a/index.html': current.sources['work/a/index.html'].replaceAll('Original', 'Foreign') };
  assert.equal(current.sources['index.html'], before.sources['index.html']);
  assert.equal(proof(current), false);
});

test('captured anchor survives mutation of the caller snapshot maps and identity', () => {
  const before = snapshot();
  const proof = captureNativeCollectionSnapshotProof(before);
  (before.sources as Record<string, string>)['work/a/index.html'] = 'Foreign';
  (before.routes as Record<string, string>)['/foreign/'] = 'foreign/index.html';
  before.identity.name = 'Foreign';
  assert.equal(proof(before), false);
  assert.equal(proof(snapshot()), true);
});

test('JSON bytes, loaded source additions/removals and unrelated text changes fail closed', () => {
  for (const change of [
    (s: NativeCollectionSnapshot) => { s.sources = { ...s.sources, '.editor/page-builder.json': '{"version":1,"collections":{},"foreign":true}' }; },
    (s: NativeCollectionSnapshot) => { s.sources = { ...s.sources, 'assets/unloaded.txt': 'Now loaded' }; },
    (s: NativeCollectionSnapshot) => { const sources = { ...s.sources }; delete sources['work/a/index.html']; s.sources = sources; },
    (s: NativeCollectionSnapshot) => { s.sources = { ...s.sources, 'index.html': `${s.sources['index.html']}<!-- foreign -->` }; },
  ]) {
    const proof = captureNativeCollectionSnapshotProof(snapshot());
    const current = snapshot(); change(current);
    assert.equal(proof(current), false);
  }
});

test('file graph, route, identity and generation changes invalidate the click proof', () => {
  for (const change of [
    (s: NativeCollectionSnapshot) => { s.files = [...s.files, 'new/index.html']; s.routes = deriveNativeRoutes(s.files); },
    (s: NativeCollectionSnapshot) => { s.files = s.files.filter(p => p !== 'assets/unloaded.txt'); },
    (s: NativeCollectionSnapshot) => { s.routes = { ...s.routes, '/work/a/': 'index.html' }; },
    (s: NativeCollectionSnapshot) => { s.identity = { name: 'Other' }; },
    (s: NativeCollectionSnapshot) => { s.revision = 'scope:generation:2'; },
  ]) {
    const proof = captureNativeCollectionSnapshotProof(snapshot());
    const current = snapshot(); change(current);
    assert.equal(proof(current), false);
  }
});

test('an inconsistent captured route graph or loaded source outside the graph is never current', () => {
  const wrongRoutes = snapshot(); wrongRoutes.routes = {};
  assert.equal(captureNativeCollectionSnapshotProof(wrongRoutes)(wrongRoutes), false);
  const foreignSource = snapshot(); foreignSource.sources = { ...foreignSource.sources, 'foreign.txt': 'Foreign' };
  assert.equal(captureNativeCollectionSnapshotProof(foreignSource)(foreignSource), false);
});
